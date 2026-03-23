import { Account } from './Account';
import { AccountLinkRecord } from './AccountLink';
import { ApiKey } from './ApiKey';
import { Balance } from './Balance';
import { BalanceTransaction } from './BalanceTransaction';
import { ExternalWallet } from './ExternalWallet';
import { IdempotencyKey } from './IdempotencyKey';
import { Payout } from './Payout';
import { Person } from './Person';
import { TopUp } from './TopUp';
import { Transfer, TransferReversal } from './Transfer';

/**
 * All valid event types that can be emitted by Zoneless.
 * These follow the Stripe event naming convention: `resource.action`
 *
 * Use '*' when subscribing to webhooks to receive all events.
 */
export const EVENT_TYPES = [
  // Wildcard for webhook subscriptions
  '*',

  // Account events
  'account.created',
  'account.updated',

  // API Key events
  'api_key.created',
  'api_key.updated',
  'api_key.deleted',

  // Balance events
  'balance.available',

  // Balance transaction events
  'balance_transaction.created',

  // External account (wallet) events
  'external_account.created',
  'external_account.updated',
  'external_account.deleted',

  // Payout events
  'payout.created',
  'payout.updated',
  'payout.paid',
  'payout.failed',
  'payout.canceled',

  // Person events
  'person.created',
  'person.updated',
  'person.deleted',

  // Top-up events
  'topup.created',
  'topup.canceled',
  'topup.failed',
  'topup.reversed',
  'topup.succeeded',

  // Transfer events
  'transfer.created',
  'transfer.updated',
  'transfer.reversed',
] as const;

/**
 * Union type of all valid event types.
 * Use this for type-safe event handling.
 */
export type EventType = (typeof EVENT_TYPES)[number];

export type EventDataObject =
  | Account
  | AccountLinkRecord
  | ApiKey
  | Balance
  | BalanceTransaction
  | ExternalWallet
  | IdempotencyKey
  | Payout
  | Person
  | TopUp
  | Transfer
  | TransferReversal
  | Record<string, unknown>;

export interface Event {
  /** Unique identifier for the object */
  id: string;
  /** String representing the object's type. Objects of the same type share the same value. */
  object: 'event';
  /** The connected account that originates the event */
  account: string | null;
  /** The API version used to render `data` when the event was created */
  api_version: string | null;
  /** Authentication context needed to fetch the event or related object */
  context: string | null;
  /** Time at which the object was created. Measured in seconds since the Unix epoch */
  created: number;
  /** Has the value `true` if the object exists in live mode or the value `false` if the object exists in test mode */
  livemode: boolean;
  /** Object containing data associated with the event */
  data: {
    /** Object containing the API resource relevant to the event */
    object: EventDataObject;
    /** Object containing the names of the updated attributes and their values prior to the event (only included in events of type `*.updated`) */
    previous_attributes: Partial<EventDataObject> | null;
  };
  /** Number of webhooks that haven't been successfully delivered (for example, to return a 20x response) to the URLs you specify */
  pending_webhooks: number;
  /** Information on the API request that triggers the event */
  request: {
    /** ID of the API request that caused the event. If null, the event was automatic */
    id: string | null;
    /** The idempotency key transmitted during the request, if any */
    idempotency_key: string | null;
  } | null;
  /** Description of the event (for example, `invoice.created` or `charge.refunded`) */
  type: EventType;

  /**
   * The platform account that owns this resource.
   * For connected account resources, this is the platform's account ID.
   * For platform's own resources, this equals the account field (self-referential).
   * @zoneless_extension
   */
  platform_account: string;
}
