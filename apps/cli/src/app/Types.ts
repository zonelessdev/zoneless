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

export interface StoreInitCommand {
  name: 'store-init';
  amount: number;
  description?: string;
  dryRun: boolean;
  idempotencyKey?: string;
  json: boolean;
  productName: string;
  profile?: string;
}

export interface HelpCommand {
  name: 'help';
}

export interface AgentSetupCommand {
  activationUrl?: string;
  authUrl?: string;
  json: boolean;
  name: 'agent-setup';
  newPlatform: boolean;
  platformName: string;
  profilePrefix?: string;
}

export interface AgentInstallSkillCommand {
  json: boolean;
  name: 'agent-install-skill';
}

export interface AuthStatusCommand {
  json: boolean;
  name: 'auth-status';
  profile?: string;
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

export interface PartialResources {
  payment_link_id: string | null;
  price_id: string | null;
  product_id: string | null;
}
