import { z } from 'zod';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';

export function GetValidUpdateObject(
  allowedFields: string[],
  update: any
): any {
  const updateObject: any = {};
  for (const field in update) {
    if (
      allowedFields.includes(field) &&
      update[field] !== undefined &&
      update[field] !== null
    ) {
      updateObject[field] = update[field];
    }
  }
  return updateObject;
}

export function ValidStringLength(
  text: string,
  minLength: number,
  maxLength: number
): boolean {
  return text.length >= minLength && text.length <= maxLength;
}

/**
 * Validates and filters an update object using a Zod schema.
 * Returns only the fields that were provided (non-undefined) and pass validation.
 *
 * @param schema - The Zod schema to validate against
 * @param input - The raw input object from the request
 * @returns The validated and filtered update object
 * @throws AppError if validation fails
 */
export function ValidateUpdate<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown
): z.infer<T> {
  const result = schema.safeParse(input);

  if (!result.success) {
    const errorMessages = result.error.issues
      .map((err) => `${err.path.join('.')}: ${err.message}`)
      .join(', ');

    throw new AppError(
      errorMessages,
      ERRORS.VALIDATION_ERROR.status,
      ERRORS.VALIDATION_ERROR.type
    );
  }

  return result.data;
}

/**
 * Strips undefined values from an object, returning only defined fields.
 * Useful for building partial update objects.
 */
export function StripUndefined<T extends Record<string, unknown>>(
  obj: T
): Partial<T> {
  const result: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result;
}
