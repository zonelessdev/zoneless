/**
 * @fileOverview Platform Access Helpers
 *
 * Provides utility functions for determining platform ownership and
 * access control in a multi-tenant architecture.
 *
 * A "platform" is an account where `platform_account` equals its own `id` (self-referential).
 * Connected accounts have a `platform_account` field pointing to their parent platform.
 *
 * @module PlatformAccess
 */

import { Account as AccountType } from '@zoneless/shared-types';

/**
 * Determines if an account is a platform (root account).
 * Platform accounts have `platform_account` equal to their own `id` (self-referential).
 *
 * @param account - The account to check
 * @returns True if the account is a platform
 */
export function IsPlatformAccount(account: AccountType): boolean {
  return account.platform_account === account.id;
}

/**
 * Gets the platform account ID for any account.
 * Returns the platform_account field (which is the platform's ID for connected accounts,
 * or the account's own ID for platform accounts).
 *
 * @param account - The account to get the platform for
 * @returns The platform account ID
 */
export function GetPlatformAccountId(account: AccountType): string {
  return account.platform_account;
}

/**
 * Checks if a user account can access a target account.
 * Access is granted if:
 * 1. They are the same account (self-access)
 * 2. The user is the platform that owns the target account
 *
 * @param userAccountId - The requesting user's account ID
 * @param targetAccount - The target account being accessed
 * @returns True if access is allowed
 */
export function CanAccessAccount(
  userAccountId: string,
  targetAccount: AccountType
): boolean {
  // Self-access is always allowed
  if (userAccountId === targetAccount.id) {
    return true;
  }

  // Platform can access its connected accounts
  if (targetAccount.platform_account === userAccountId) {
    return true;
  }

  return false;
}

/**
 * Checks if a user account can access a resource owned by another account.
 *
 * @param userAccountId - The requesting user's account ID
 * @param resourceOwnerAccount - The account that owns the resource
 * @returns True if access is allowed
 */
export function CanAccessResource(
  userAccountId: string,
  resourceOwnerAccount: AccountType
): boolean {
  return CanAccessAccount(userAccountId, resourceOwnerAccount);
}

/**
 * Checks if a user account has platform-level access over another account.
 * This is true if the user IS the platform that owns the target account
 * (and the target is not the platform itself).
 *
 * @param userAccountId - The requesting user's account ID
 * @param targetAccount - The target account
 * @returns True if the user is the platform owner of a connected account
 */
export function IsPlatformOwner(
  userAccountId: string,
  targetAccount: AccountType
): boolean {
  // User owns target if target's platform is the user AND target is not the user itself
  return (
    targetAccount.platform_account === userAccountId &&
    targetAccount.id !== userAccountId
  );
}
