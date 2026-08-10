import { InvalidInput } from './Errors';
import { ValidateAgentSkillId } from './SkillInstaller';
import {
  recurringIntervals,
  type ParsedCommand,
  type RecurringInterval,
  type StoreInitCommand,
} from './Types';

const storeValueOptions = new Set([
  '--amount',
  '--description',
  '--idempotency-key',
  '--interval',
  '--interval-count',
  '--name',
  '--profile',
  '--trial-days',
]);
const storeBooleanOptions = new Set(['--dry-run', '--json']);
const doctorValueOptions = new Set(['--profile']);
const jsonBooleanOptions = new Set(['--json']);
const reconnectValueOptions = new Set([
  '--activation-url',
  '--auth-url',
  '--profile',
]);
const envSyncValueOptions = new Set(['--profile', '--target']);
const envSyncBooleanOptions = new Set(['--include-wallet', '--json']);
const installSkillValueOptions = new Set(['--skill']);
const walletBackupValueOptions = new Set(['--output', '--profile']);
const setupValueOptions = new Set([
  '--activation-url',
  '--auth-url',
  '--platform-name',
  '--profile-prefix',
  '--skill',
]);
const setupBooleanOptions = new Set(['--json', '--new-platform']);

export function ParseArguments(argumentsList: string[]): ParsedCommand {
  if (
    argumentsList.length === 0 ||
    argumentsList[0] === 'help' ||
    argumentsList.includes('--help') ||
    argumentsList.includes('-h')
  ) {
    return { name: 'help' };
  }

  if (argumentsList[0] === 'doctor') {
    const commandArguments = argumentsList.slice(1);
    ValidateOptions(
      commandArguments,
      doctorValueOptions,
      jsonBooleanOptions,
      'doctor'
    );
    return {
      name: 'doctor',
      json: argumentsList.includes('--json'),
      profile: ReadOptionalOption(commandArguments, '--profile'),
    };
  }

  if (argumentsList[0] === 'store' && argumentsList[1] === 'init') {
    return ParseStoreInit(argumentsList.slice(2));
  }

  if (argumentsList[0] === 'agent' && argumentsList[1] === 'setup') {
    return ParseAgentSetup(argumentsList.slice(2));
  }

  if (argumentsList[0] === 'agent' && argumentsList[1] === 'install-skill') {
    const commandArguments = argumentsList.slice(2);
    ValidateOptions(
      commandArguments,
      installSkillValueOptions,
      jsonBooleanOptions,
      'agent install-skill'
    );
    return {
      name: 'agent-install-skill',
      json: commandArguments.includes('--json'),
      skillId: ValidateAgentSkillId(
        ReadOptionalOption(commandArguments, '--skill')
      ),
    };
  }

  if (argumentsList[0] === 'auth' && argumentsList[1] === 'status') {
    const commandArguments = argumentsList.slice(2);
    ValidateOptions(
      commandArguments,
      doctorValueOptions,
      jsonBooleanOptions,
      'auth status'
    );
    return {
      name: 'auth-status',
      json: commandArguments.includes('--json'),
      profile: ReadOptionalOption(commandArguments, '--profile'),
    };
  }

  if (argumentsList[0] === 'auth' && argumentsList[1] === 'reconnect') {
    const commandArguments = argumentsList.slice(2);
    ValidateOptions(
      commandArguments,
      reconnectValueOptions,
      jsonBooleanOptions,
      'auth reconnect'
    );
    return {
      activationUrl: ReadOptionalOption(commandArguments, '--activation-url'),
      authUrl: ReadOptionalOption(commandArguments, '--auth-url'),
      json: commandArguments.includes('--json'),
      name: 'auth-reconnect',
      profile: ReadOptionalOption(commandArguments, '--profile'),
    };
  }

  if (argumentsList[0] === 'env' && argumentsList[1] === 'sync') {
    const commandArguments = argumentsList.slice(2);
    ValidateOptions(
      commandArguments,
      envSyncValueOptions,
      envSyncBooleanOptions,
      'env sync'
    );
    return {
      includeWallet: commandArguments.includes('--include-wallet'),
      json: commandArguments.includes('--json'),
      name: 'env-sync',
      profile: ReadOptionalOption(commandArguments, '--profile'),
      target: ReadOptionalOption(commandArguments, '--target'),
    };
  }

  if (argumentsList[0] === 'wallet' && argumentsList[1] === 'backup') {
    const commandArguments = argumentsList.slice(2);
    ValidateOptions(
      commandArguments,
      walletBackupValueOptions,
      new Set(),
      'wallet backup'
    );
    return {
      name: 'wallet-backup',
      outputPath: ReadRequiredOption(commandArguments, '--output'),
      profile: ReadOptionalOption(commandArguments, '--profile'),
    };
  }

  throw InvalidInput(
    `Unknown command "${argumentsList.join(
      ' '
    )}". Run "zoneless --help" for usage.`
  );
}

function ParseAgentSetup(argumentsList: string[]): ParsedCommand {
  ValidateOptions(
    argumentsList,
    setupValueOptions,
    setupBooleanOptions,
    'agent setup'
  );
  const platformName = ReadRequiredOption(
    argumentsList,
    '--platform-name'
  ).trim();
  if (platformName.length === 0 || platformName.length > 200) {
    throw InvalidInput(
      '--platform-name must contain between 1 and 200 characters.'
    );
  }
  const profilePrefix = ReadOptionalOption(
    argumentsList,
    '--profile-prefix'
  )?.trim();
  if (
    profilePrefix &&
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,49}$/.test(profilePrefix)
  ) {
    throw InvalidInput(
      '--profile-prefix must contain 1-50 letters, numbers, dots, underscores, or hyphens.'
    );
  }

  return {
    activationUrl: ReadOptionalOption(argumentsList, '--activation-url'),
    authUrl: ReadOptionalOption(argumentsList, '--auth-url'),
    json: argumentsList.includes('--json'),
    name: 'agent-setup',
    newPlatform: argumentsList.includes('--new-platform'),
    platformName,
    profilePrefix,
    skillId: ValidateAgentSkillId(ReadOptionalOption(argumentsList, '--skill')),
  };
}

function ParseStoreInit(argumentsList: string[]): StoreInitCommand {
  ValidateStoreOptions(argumentsList);

  const productName = ReadRequiredOption(argumentsList, '--name').trim();
  if (productName.length === 0 || productName.length > 200) {
    throw InvalidInput('--name must contain between 1 and 200 characters.');
  }

  const amount = ParsePositiveInteger(
    ReadRequiredOption(argumentsList, '--amount'),
    '--amount',
    ' in minor units (200 means 2.00 USDC)'
  );

  const interval = ReadOptionalInterval(argumentsList);
  const intervalCount = ReadOptionalPositiveInteger(
    argumentsList,
    '--interval-count'
  );
  const trialDays = ReadOptionalPositiveInteger(argumentsList, '--trial-days');
  if (!interval && (intervalCount !== undefined || trialDays !== undefined)) {
    throw InvalidInput('--interval-count and --trial-days require --interval.');
  }

  const description = ReadOptionalOption(argumentsList, '--description');
  if (description !== undefined && description.length > 40000) {
    throw InvalidInput('--description cannot exceed 40000 characters.');
  }

  const idempotencyKey = ReadOptionalOption(argumentsList, '--idempotency-key');
  if (
    idempotencyKey !== undefined &&
    (!/^[A-Za-z0-9._:-]+$/.test(idempotencyKey) || idempotencyKey.length > 160)
  ) {
    throw InvalidInput(
      '--idempotency-key must be at most 160 letters, numbers, periods, underscores, colons, or hyphens.'
    );
  }

  return {
    name: 'store-init',
    amount,
    description,
    dryRun: argumentsList.includes('--dry-run'),
    idempotencyKey,
    interval,
    intervalCount,
    json: argumentsList.includes('--json'),
    productName,
    profile: ReadOptionalOption(argumentsList, '--profile'),
    trialDays,
  };
}

function ValidateStoreOptions(argumentsList: string[]): void {
  ValidateOptions(
    argumentsList,
    storeValueOptions,
    storeBooleanOptions,
    'store init'
  );
}

function ValidateOptions(
  argumentsList: string[],
  valueOptions: Set<string>,
  booleanOptions: Set<string>,
  commandName: string
): void {
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (booleanOptions.has(argument)) continue;
    if (valueOptions.has(argument)) {
      if (
        !argumentsList[index + 1] ||
        argumentsList[index + 1].startsWith('--')
      ) {
        throw InvalidInput(`${argument} requires a value.`);
      }
      index += 1;
      continue;
    }
    throw InvalidInput(`Unknown ${commandName} option "${argument}".`);
  }
}

function ReadRequiredOption(
  argumentsList: string[],
  optionName: string
): string {
  const value = ReadOptionalOption(argumentsList, optionName);
  if (value === undefined) {
    throw InvalidInput(`${optionName} is required.`);
  }
  return value;
}

function ReadOptionalInterval(
  argumentsList: string[]
): RecurringInterval | undefined {
  const value = ReadOptionalOption(argumentsList, '--interval');
  if (value === undefined) return undefined;
  if (!recurringIntervals.includes(value as RecurringInterval)) {
    throw InvalidInput(
      `--interval must be one of: ${recurringIntervals.join(', ')}.`
    );
  }
  return value as RecurringInterval;
}

function ReadOptionalPositiveInteger(
  argumentsList: string[],
  optionName: string
): number | undefined {
  const value = ReadOptionalOption(argumentsList, optionName);
  return value === undefined
    ? undefined
    : ParsePositiveInteger(value, optionName);
}

function ParsePositiveInteger(
  rawValue: string,
  optionName: string,
  hint = ''
): number {
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw InvalidInput(`${optionName} must be a positive integer${hint}.`);
  }
  return value;
}

function ReadOptionalOption(
  argumentsList: string[],
  optionName: string
): string | undefined {
  const matches = argumentsList
    .map((argument, index) => ({ argument, index }))
    .filter(({ argument }) => argument === optionName);

  if (matches.length > 1) {
    throw InvalidInput(`${optionName} can only be supplied once.`);
  }

  const match = matches[0];
  return match ? argumentsList[match.index + 1] : undefined;
}
