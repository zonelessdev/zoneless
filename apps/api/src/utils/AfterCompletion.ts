import { CheckoutAfterCompletion } from '@zoneless/shared-types';

type AfterCompletionInput = {
  type: CheckoutAfterCompletion['type'];
  hosted_confirmation?: {
    custom_message?: string | null;
  } | null;
  redirect?: {
    url: string;
  } | null;
};

/**
 * Normalize after_completion into the stored CheckoutAfterCompletion shape
 * (null for unused branches, null custom_message when hosted confirmation has none).
 */
export function NormalizeStoredAfterCompletion(
  input: AfterCompletionInput
): CheckoutAfterCompletion {
  return {
    type: input.type,
    hosted_confirmation: input.hosted_confirmation
      ? {
          custom_message: input.hosted_confirmation.custom_message ?? null,
        }
      : input.type === 'hosted_confirmation'
      ? { custom_message: null }
      : null,
    redirect: input.redirect ? { url: input.redirect.url } : null,
  };
}
