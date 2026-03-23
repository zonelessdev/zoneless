/**
 * Authorization middleware for common permission checks
 *
 * @module Authorization
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../modules/Database';
import { AccountModule } from '../modules/Account';
import { CanAccessAccount } from '../modules/PlatformAccess';
import { AppError } from '../utils/AppError';
import { ERRORS, ErrorDefinition } from '../utils/Errors';
import { Account as AccountType } from '@zoneless/shared-types';

const accountModule = new AccountModule(db);

/**
 * Middleware to verify the authenticated user owns the account specified in params.
 * Platform accounts can access their connected accounts.
 *
 * @param paramName - The route parameter name containing the account ID (default: 'id')
 */
export function RequireAccountOwnership(paramName: string = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const accountId = req.params[paramName];

      if (!req.user) {
        throw new AppError(
          ERRORS.UNAUTHORIZED.message,
          ERRORS.UNAUTHORIZED.status,
          ERRORS.UNAUTHORIZED.type
        );
      }

      // Self-access is always allowed
      if (req.user.account === accountId) {
        return next();
      }

      // Check if user can access this account (platform → connected account)
      const targetAccount = await accountModule.GetAccount(accountId);

      if (!targetAccount) {
        throw new AppError(
          ERRORS.ACCOUNT_NOT_FOUND.message,
          ERRORS.ACCOUNT_NOT_FOUND.status,
          ERRORS.ACCOUNT_NOT_FOUND.type
        );
      }

      if (CanAccessAccount(req.user.account, targetAccount)) {
        return next();
      }

      throw new AppError(
        ERRORS.NOT_ACCOUNT_OWNER.message,
        ERRORS.NOT_ACCOUNT_OWNER.status,
        ERRORS.NOT_ACCOUNT_OWNER.type
      );
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to verify the user has a specific role
 *
 * @param roles - Array of allowed roles
 */
export function RequireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(
        ERRORS.UNAUTHORIZED.message,
        ERRORS.UNAUTHORIZED.status,
        ERRORS.UNAUTHORIZED.type
      );
    }

    if (!roles.includes(req.user.role || '')) {
      throw new AppError(
        ERRORS.PERMISSION_DENIED.message,
        ERRORS.PERMISSION_DENIED.status,
        ERRORS.PERMISSION_DENIED.type
      );
    }

    next();
  };
}

/**
 * Middleware to verify the request is from a platform account.
 * A platform is an account with no parent platform_account.
 */
export function RequirePlatform() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user?.platform) {
      throw new AppError(
        ERRORS.PERMISSION_DENIED.message,
        ERRORS.PERMISSION_DENIED.status,
        ERRORS.PERMISSION_DENIED.type
      );
    }

    next();
  };
}

/**
 * Configuration for RequireResourceOwnership middleware
 */
export interface ResourceOwnershipConfig<T> {
  /** Function to fetch the resource by ID */
  fetchFn: (id: string) => Promise<T | null>;
  /** Error to throw when resource is not found */
  notFoundError: ErrorDefinition;
  /** Key to attach the fetched resource to on the request object */
  requestKey: string;
  /** Route parameter name containing the resource ID (default: 'id') */
  paramName?: string;
}

/**
 * Factory middleware to verify the user owns a resource.
 * Fetches the resource, checks ownership via its `account` field, and attaches it to the request.
 * Platform accounts can access resources owned by their connected accounts.
 *
 * @param config - Configuration object for the resource ownership check
 */
export function RequireResourceOwnership<T extends { account: string }>(
  config: ResourceOwnershipConfig<T>
) {
  const { fetchFn, notFoundError, requestKey, paramName = 'id' } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const resourceId = req.params[paramName];

      if (!req.user) {
        throw new AppError(
          ERRORS.UNAUTHORIZED.message,
          ERRORS.UNAUTHORIZED.status,
          ERRORS.UNAUTHORIZED.type
        );
      }

      const resource = await fetchFn(resourceId);

      if (!resource) {
        throw new AppError(
          notFoundError.message,
          notFoundError.status,
          notFoundError.type
        );
      }

      // Direct ownership check
      if (resource.account === req.user.account) {
        (req as unknown as Record<string, unknown>)[requestKey] = resource;
        return next();
      }

      // Platform hierarchy check - look up the resource owner's account
      const resourceOwnerAccount = await accountModule.GetAccount(
        resource.account
      );

      if (
        resourceOwnerAccount &&
        CanAccessAccount(req.user.account, resourceOwnerAccount)
      ) {
        (req as unknown as Record<string, unknown>)[requestKey] = resource;
        return next();
      }

      throw new AppError(
        ERRORS.NOT_RESOURCE_OWNER.message,
        ERRORS.NOT_RESOURCE_OWNER.status,
        ERRORS.NOT_RESOURCE_OWNER.type
      );
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to verify a connected account belongs to the requesting platform.
 * Used for platform-only operations that require specifying a connected account.
 *
 * @param paramName - The route parameter or header containing the connected account ID
 * @param source - Where to get the account ID from ('param' | 'header')
 */
export function RequireConnectedAccountOwnership(
  paramName: string = 'id',
  source: 'param' | 'header' = 'param'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.platform) {
        throw new AppError(
          ERRORS.PERMISSION_DENIED.message,
          ERRORS.PERMISSION_DENIED.status,
          ERRORS.PERMISSION_DENIED.type
        );
      }

      const connectedAccountId =
        source === 'param'
          ? req.params[paramName]
          : (req.headers[paramName.toLowerCase()] as string);

      if (!connectedAccountId) {
        throw new AppError(
          `${
            source === 'param' ? 'Parameter' : 'Header'
          } ${paramName} is required`,
          400,
          'invalid_request_error'
        );
      }

      const connectedAccount = await accountModule.GetAccount(
        connectedAccountId
      );

      if (!connectedAccount) {
        throw new AppError(
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
        );
      }

      // Verify this connected account belongs to the requesting platform
      if (connectedAccount.platform_account !== req.user.account) {
        throw new AppError(
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
        );
      }

      // Attach the connected account to the request for use in handlers
      (req as unknown as Record<string, unknown>).connectedAccount =
        connectedAccount;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware to optionally extract and validate a connected account from a header.
 * Used for endpoints where acting on behalf of a connected account is optional.
 *
 * If the header is present and valid, attaches the connected account to req.connectedAccount.
 * If the header is missing, continues without error.
 * If the header is present but invalid (account not found or not owned), throws an error.
 *
 * @param headerName - The header name containing the connected account ID (default: 'zoneless-account')
 */
export function OptionalConnectedAccount(
  headerName: string = 'zoneless-account'
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const connectedAccountId = req.headers[
        headerName.toLowerCase()
      ] as string;

      // If no header provided, continue without setting connectedAccount
      if (!connectedAccountId) {
        return next();
      }

      // Header provided - user must be a platform to act on behalf of a connected account
      if (!req.user?.platform) {
        throw new AppError(
          ERRORS.PERMISSION_DENIED.message,
          ERRORS.PERMISSION_DENIED.status,
          ERRORS.PERMISSION_DENIED.type
        );
      }

      const connectedAccount = await accountModule.GetAccount(
        connectedAccountId
      );

      if (!connectedAccount) {
        throw new AppError(
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
        );
      }

      // Verify this connected account belongs to the requesting platform
      if (connectedAccount.platform_account !== req.user.account) {
        throw new AppError(
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.message,
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.status,
          ERRORS.NO_SUCH_CONNECTED_ACCOUNT.type
        );
      }

      // Attach the connected account to the request
      (req as unknown as Record<string, unknown>).connectedAccount =
        connectedAccount;

      next();
    } catch (error) {
      next(error);
    }
  };
}

// Extend Express Request type for connected account
declare global {
  namespace Express {
    interface Request {
      connectedAccount?: AccountType;
    }
  }
}
