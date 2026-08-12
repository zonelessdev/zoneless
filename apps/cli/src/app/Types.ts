export const exitCodes = {
  success: 0,
  invalidInput: 2,
  apiError: 4,
  partialFailure: 5,
} as const;

export type ExitCode = (typeof exitCodes)[keyof typeof exitCodes];

export interface Environment {
  HOME?: string;
  XDG_CONFIG_HOME?: string;
  ZONELESS_ACTIVATION_URL?: string;
  ZONELESS_AUTH_POLL_INTERVAL_MS?: string;
  ZONELESS_AUTH_URL?: string;
  ZONELESS_API_KEY?: string;
  ZONELESS_API_URL?: string;
  ZONELESS_PROFILE?: string;
}

export interface Writable {
  write(value: string): void;
}

export interface CliIo {
  isInteractive?: boolean;
  readLine?: () => Promise<string>;
  stdout: Writable;
  stderr: Writable;
}

export interface DoctorCommand {
  name: 'doctor';
  json: boolean;
  profile?: string;
}

/** Billing frequencies accepted by the Zoneless prices API. */
export const recurringIntervals = [
  'hour',
  'day',
  'week',
  'month',
  'year',
] as const;

export type RecurringInterval = (typeof recurringIntervals)[number];

/** Recurring terms sent to the prices API, and echoed back in dry-run plans. */
export interface RecurringPlan {
  interval: RecurringInterval;
  interval_count: number;
  trial_period_days?: number;
}

export interface StoreInitCommand {
  name: 'store-init';
  amount: number;
  description?: string;
  dryRun: boolean;
  idempotencyKey?: string;
  interval?: RecurringInterval;
  intervalCount?: number;
  json: boolean;
  productName: string;
  profile?: string;
  trialDays?: number;
}

export interface HelpCommand {
  name: 'help';
}

export type AgentSkillId = 'marketplace' | 'payments';

export interface AgentSetupCommand {
  activationUrl?: string;
  authUrl?: string;
  json: boolean;
  name: 'agent-setup';
  newPlatform: boolean;
  platformName: string;
  profilePrefix?: string;
  skillId: AgentSkillId;
}

export interface AgentInstallSkillCommand {
  json: boolean;
  name: 'agent-install-skill';
  skillId: AgentSkillId;
}

export interface AuthStatusCommand {
  json: boolean;
  name: 'auth-status';
  profile?: string;
}

export interface AuthReconnectCommand {
  activationUrl?: string;
  authUrl?: string;
  json: boolean;
  name: 'auth-reconnect';
  profile?: string;
}

export interface EnvSyncCommand {
  includeWallet: boolean;
  json: boolean;
  name: 'env-sync';
  profile?: string;
  target?: string;
}

export const subscriptionWebhookEvents = [
  'checkout.session.completed',
  'invoice.paid',
  'invoice.payment_failed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const;

export interface WebhookSyncCommand {
  events: string[];
  json: boolean;
  name: 'webhook-sync';
  preset: 'subscriptions' | null;
  profile?: string;
  target?: string;
  url: string;
}

export interface WalletBackupCommand {
  name: 'wallet-backup';
  outputPath: string;
  profile?: string;
}

export type ParsedCommand =
  | DoctorCommand
  | StoreInitCommand
  | AgentSetupCommand
  | AgentInstallSkillCommand
  | AuthStatusCommand
  | AuthReconnectCommand
  | EnvSyncCommand
  | WebhookSyncCommand
  | WalletBackupCommand
  | HelpCommand;

export interface PublicConfig {
  livemode: boolean;
  object: 'config';
  platform_name?: string;
}

export interface ProductResponse {
  id: string;
}

export interface PriceResponse {
  id: string;
}

export interface PaymentLinkResponse {
  id: string;
  url: string;
}

export interface WebhookEndpointResponse {
  description?: string | null;
  enabled_events: string[];
  id: string;
  metadata?: Record<string, string>;
  secret?: string | null;
  status?: string;
  url: string;
}

export interface WebhookEndpointListResponse {
  data: WebhookEndpointResponse[];
  has_more: boolean;
}

export interface PartialResources {
  payment_link_id: string | null;
  price_id: string | null;
  product_id: string | null;
}
