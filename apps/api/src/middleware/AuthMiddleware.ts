import { Request, Response, NextFunction } from 'express';
import { db } from '../modules/Database';
import { ApiKeyModule } from '../modules/ApiKey';
import { AccountModule } from '../modules/Account';
import { IsPlatformAccount } from '../modules/PlatformAccess';
import { GetJwtSecret } from '../modules/AppConfig';
import { AppError } from '../utils/AppError';
import { ERRORS } from '../utils/Errors';
import { AsyncHandler } from '../utils/AsyncHandler';
import { Logger } from '../utils/Logger';
import { VerifyToken } from '../utils/Token';

const apiKeyModule = new ApiKeyModule(db);
const accountModule = new AccountModule(db);

/**
 * JWT payload structure for account sessions
 */
interface JwtPayload {
  account_id: string;
  type: 'account_session' | 'api_key';
  iat?: number;
  exp?: number;
}

/**
 * Type guard to validate JWT payload structure
 */
function IsValidJwtPayload(payload: unknown): payload is JwtPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'account_id' in payload &&
    typeof (payload as JwtPayload).account_id === 'string'
  );
}

/**
 * Determines if an account is a platform and sets req.user accordingly.
 * A platform is an account with no parent `platform_account`.
 *
 * @param accountId - The account ID to check
 * @returns Object with account and optional platform field
 */
async function GetAuthenticatedUser(
  accountId: string
): Promise<{ account: string; platform?: string }> {
  const account = await accountModule.GetAccount(accountId);

  if (!account) {
    throw new AppError(
      ERRORS.ACCOUNT_NOT_FOUND.message,
      ERRORS.ACCOUNT_NOT_FOUND.status,
      ERRORS.ACCOUNT_NOT_FOUND.type
    );
  }

  // Check if this account is a platform (has no parent platform_account)
  const isPlatform = IsPlatformAccount(account);

  return {
    account: accountId,
    ...(isPlatform && { platform: accountId }),
  };
}

export const ValidateApiKey = AsyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const token =
      (req.headers['x-api-key'] as string) ||
      (req.headers['authorization'] as string);

    if (!token || typeof token !== 'string') {
      throw new AppError(
        ERRORS.UNAUTHORIZED.message,
        ERRORS.UNAUTHORIZED.status,
        ERRORS.UNAUTHORIZED.type
      );
    }

    // JWT Handling
    if (token.startsWith('Bearer ')) {
      const jwtToken = token.slice(7);
      try {
        const decoded = VerifyToken(jwtToken, GetJwtSecret());

        if (!IsValidJwtPayload(decoded)) {
          throw new AppError(
            ERRORS.INVALID_TOKEN.message,
            ERRORS.INVALID_TOKEN.status,
            ERRORS.INVALID_TOKEN.type
          );
        }

        req.user = await GetAuthenticatedUser(decoded.account_id);
        return next();
      } catch (error) {
        // If it's already our AppError, rethrow it
        if (error instanceof AppError) throw error;

        throw new AppError(
          ERRORS.INVALID_TOKEN.message,
          ERRORS.INVALID_TOKEN.status,
          ERRORS.INVALID_TOKEN.type
        );
      }
    }

    // API Key Handling - validate against database
    try {
      const apiKey = await apiKeyModule.GetApiKeyByToken(token);

      if (!apiKey) {
        throw new AppError(
          ERRORS.INVALID_API_KEY.message,
          ERRORS.INVALID_API_KEY.status,
          ERRORS.INVALID_API_KEY.type
        );
      }

      if (apiKey.status !== 'active') {
        throw new AppError(
          'API key has been revoked',
          ERRORS.INVALID_API_KEY.status,
          ERRORS.INVALID_API_KEY.type
        );
      }

      req.user = await GetAuthenticatedUser(apiKey.account);

      // Update last_used timestamp asynchronously (fire and forget)
      apiKeyModule.UpdateLastUsed(apiKey.id).catch((err) => {
        Logger.warn('Failed to update API key last_used timestamp', {
          apiKeyId: apiKey.id,
          error: err,
        });
      });

      next();
    } catch (error) {
      // If it's already an AppError, rethrow it
      if (error instanceof AppError) throw error;

      Logger.error('Auth Error', error);
      throw new AppError(
        ERRORS.INTERNAL_ERROR.message,
        ERRORS.INTERNAL_ERROR.status,
        ERRORS.INTERNAL_ERROR.type
      );
    }
  }
);
