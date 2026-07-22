/**
 * @fileOverview Stripe-style expandable fields.
 *
 * Resources register expansion descriptors keyed by their `object` string.
 * Routes call `ApplyExpand(req, result)` after fetching to hydrate any
 * `expand[]=...` paths in the request.
 *
 * @module Expand
 */

import * as express from 'express';
import { AppError } from './AppError';
import { ERRORS } from '../utils/Errors';

/** Allows list paths such as `data.items.data.price.product`. */
const MAX_EXPAND_DEPTH = 5;

export interface ExpandContext {
  platformAccount: string;
  cache: Map<string, unknown>;
}

export interface ExpansionField {
  /**
   * Field on the parent object that holds the id (and where we write the hydrated
   * object). Dot-separated paths are supported for nested ids
   * (e.g. `parent.subscription_details.subscription`).
   */
  sourcePath: string;
  /** `object` string of the linked resource. Used to recurse via the registry. */
  targetObject: string;
  /**
   * When true, the field is already an embedded list object (`{ object: 'list', data }`)
   * on the parent. Expand walks into it instead of batch-loading by id.
   */
  embeddedList?: boolean;
  /** Batch-load ids → records, scoped to the requesting platform. */
  BatchLoad: (
    ids: string[],
    ctx: ExpandContext
  ) => Promise<Map<string, unknown>>;
}

export type ResourceExpansions = Record<string, ExpansionField>;

const registry = new Map<string, ResourceExpansions>();

export function RegisterExpansions(
  objectType: string,
  fields: ResourceExpansions
): void {
  const existing = registry.get(objectType) ?? {};
  registry.set(objectType, { ...existing, ...fields });
}

function GetExpansion(
  objectType: string,
  fieldName: string
): ExpansionField | undefined {
  return registry.get(objectType)?.[fieldName];
}

/**
 * Pull `expand` from query (`?expand[]=foo`, `?expand=foo`) or JSON body.
 */
export function ParseExpand(req: express.Request): string[] {
  const raw = (req.query?.expand ?? req.body?.expand) as unknown;
  if (raw === undefined || raw === null) return [];

  const list = Array.isArray(raw) ? raw : [raw];
  const paths: string[] = [];
  for (const entry of list) {
    if (typeof entry !== 'string') continue;
    for (const part of entry.split(',')) {
      const trimmed = part.trim();
      if (trimmed && !paths.includes(trimmed)) paths.push(trimmed);
    }
  }
  return paths;
}

/**
 * Validate every path: depth cap, list-prefix rule, and field-by-field
 * resolution through the registry.
 */
function ValidateExpandPaths(
  paths: string[],
  rootObject: string,
  isList: boolean
): void {
  for (const path of paths) {
    const segments = path.split('.');
    if (segments.length === 0 || segments.some((s) => s.length === 0)) {
      throw InvalidExpand(path);
    }
    if (segments.length > MAX_EXPAND_DEPTH) {
      throw InvalidExpand(
        path,
        `Expand paths cannot exceed ${MAX_EXPAND_DEPTH} levels`
      );
    }

    let cursor = rootObject;
    let cursorIsList = isList;

    for (const segment of segments) {
      if (cursorIsList) {
        if (segment !== 'data') {
          throw InvalidExpand(
            path,
            `Expand paths on a list must start with 'data'`
          );
        }
        cursorIsList = false;
        continue;
      }

      const field = GetExpansion(cursor, segment);
      if (!field) {
        throw InvalidExpand(
          path,
          `'${segment}' is not an expandable field of '${cursor}'`
        );
      }
      cursor = field.targetObject;
      if (field.embeddedList) {
        cursorIsList = true;
      }
    }
  }
}

function InvalidExpand(path: string, detail?: string): AppError {
  const message = detail
    ? `${detail} (path: '${path}')`
    : `Invalid expand path: '${path}'`;
  return new AppError(
    message,
    ERRORS.INVALID_REQUEST.status,
    ERRORS.INVALID_REQUEST.type
  );
}

type AnyObject = Record<string, unknown>;

/**
 * Resolve `expand` paths on a fetched response (single object or list) and
 * return the hydrated result. No-op when no paths are present.
 */
export async function ApplyExpand<T>(
  req: express.Request,
  result: T
): Promise<T> {
  const paths = ParseExpand(req);
  if (paths.length === 0) return result;

  const root = result as unknown as AnyObject;
  const rootObject = root?.object as string | undefined;
  if (!rootObject) return result;

  const isList = rootObject === 'list';
  const innerObject = isList ? FirstListObject(root) : rootObject;
  if (!innerObject) return result;

  ValidateExpandPaths(paths, innerObject, isList);

  const ctx: ExpandContext = {
    platformAccount: req.user.account,
    cache: new Map(),
  };

  if (isList) {
    const data = (root.data as AnyObject[]) ?? [];
    await ExpandObjects(data, paths.map(StripDataPrefix), ctx);
  } else {
    await ExpandObjects([root], paths, ctx);
  }

  return result;
}

function FirstListObject(list: AnyObject): string | undefined {
  const data = list.data as AnyObject[] | undefined;
  return data?.[0]?.object as string | undefined;
}

function StripDataPrefix(path: string): string {
  return path.startsWith('data.') ? path.slice('data.'.length) : path;
}

/**
 * Core engine. Mutates the given items in place, hydrating registered fields
 * and recursing into nested paths. Uses a per-request cache to dedupe loads
 * across items and paths.
 */
async function ExpandObjects(
  items: AnyObject[],
  paths: string[],
  ctx: ExpandContext
): Promise<void> {
  if (items.length === 0 || paths.length === 0) return;

  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const dot = path.indexOf('.');
    const head = dot === -1 ? path : path.slice(0, dot);
    const tail = dot === -1 ? '' : path.slice(dot + 1);
    const list = groups.get(head) ?? [];
    if (tail) list.push(tail);
    groups.set(head, list);
  }

  for (const [head, tails] of groups) {
    const sampleObject = items[0].object as string | undefined;
    if (!sampleObject) continue;

    if (head === 'data') {
      const nested: AnyObject[] = [];
      for (const item of items) {
        const data = item.data;
        if (Array.isArray(data)) nested.push(...(data as AnyObject[]));
      }
      await ExpandObjects(nested, tails, ctx);
      continue;
    }

    const field = GetExpansion(sampleObject, head);
    if (!field) continue;

    if (field.embeddedList) {
      const nested: AnyObject[] = [];
      for (const item of items) {
        const value = GetByPath(item, field.sourcePath);
        if (value && typeof value === 'object') {
          nested.push(value as AnyObject);
        }
      }
      if (tails.length > 0 && nested.length > 0) {
        await ExpandObjects(nested, tails, ctx);
      }
      continue;
    }

    const idToParents = new Map<string, AnyObject[]>();
    for (const item of items) {
      const value = GetByPath(item, field.sourcePath);
      if (typeof value !== 'string') continue;
      const parents = idToParents.get(value) ?? [];
      parents.push(item);
      idToParents.set(value, parents);
    }

    const missingIds: string[] = [];
    for (const id of idToParents.keys()) {
      if (!ctx.cache.has(CacheKey(field.targetObject, id))) {
        missingIds.push(id);
      }
    }
    if (missingIds.length > 0) {
      const loaded = await field.BatchLoad(missingIds, ctx);
      for (const [id, obj] of loaded) {
        ctx.cache.set(CacheKey(field.targetObject, id), obj);
      }
    }

    const nextItems: AnyObject[] = [];
    for (const [id, parents] of idToParents) {
      const expanded = ctx.cache.get(CacheKey(field.targetObject, id)) ?? null;
      for (const parent of parents) {
        SetByPath(parent, field.sourcePath, expanded);
      }
      if (expanded && tails.length > 0) {
        nextItems.push(expanded as AnyObject);
      }
    }

    if (tails.length > 0 && nextItems.length > 0) {
      await ExpandObjects(nextItems, tails, ctx);
    }
  }
}

function GetByPath(obj: AnyObject, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (
      current === null ||
      current === undefined ||
      typeof current !== 'object'
    ) {
      return undefined;
    }
    current = (current as AnyObject)[part];
  }
  return current;
}

function SetByPath(obj: AnyObject, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: AnyObject = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = current[parts[i]];
    if (next === null || next === undefined || typeof next !== 'object') {
      return;
    }
    current = next as AnyObject;
  }
  current[parts[parts.length - 1]] = value;
}

function CacheKey(objectType: string, id: string): string {
  return `${objectType}:${id}`;
}
