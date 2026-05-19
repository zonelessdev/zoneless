import { z } from 'zod';

/**
 * Schema for creating an AccountLink.
 * Matches Stripe's POST /v1/account_links parameters.
 *
 * @see https://docs.stripe.com/api/account_links/create
 */
export const CreateAccountLinkSchema = z.object({
  /** The identifier of the account to create an account link for */
  account: z.string().min(1, 'Account ID is required'),

  /**
   * The type of account link the user is requesting.
   * - account_onboarding: Form for inputting outstanding requirements
   * - account_update: Displays populated fields, allows editing existing info
   */
  type: z.enum(['account_onboarding', 'account_update']),

  /**
   * The URL the user will be redirected to if the account link is expired,
   * has been previously-visited, or is otherwise invalid.
   */
  refresh_url: z.string().url('Refresh URL must be a valid URL'),

  /**
   * The URL that the user will be redirected to upon leaving or completing
   * the linked flow.
   */
  return_url: z.string().url('Return URL must be a valid URL'),
});

export type CreateAccountLinkInput = z.infer<typeof CreateAccountLinkSchema>;
