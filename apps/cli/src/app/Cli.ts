import { ParseArguments } from './Arguments';
import { AgentSetupService, type AuthorizationPrompt } from './AgentSetup';
import { OpenBrowser, type BrowserOpener } from './Browser';
import { ZonelessClient, type FetchLike } from './Client';
import { RunDoctor, RunStoreInit } from './Commands';
import { CliError, InvalidInput } from './Errors';
import { ProfileStore } from './ProfileStore';
import { KeyringSecretStore, type SecretStore } from './SecretStore';
import { InstallAgentSkill } from './SkillInstaller';
import { BackupWallet } from './Wallet';
import {
  exitCodes,
  type CliIo,
  type Environment,
  type ExitCode,
} from './Types';

const helpText = `Zoneless agent store CLI

Usage:
  zoneless agent setup --platform-name <name> [--json]
  zoneless agent install-skill [--json]
  zoneless auth status [--profile <name>] [--json]
  zoneless wallet backup --output <path> [--profile <name>]
  zoneless doctor [--profile <name>] [--json]
  zoneless store init --name <name> --amount <integer> [options]

Options:
  --platform-name <name>     Platform name used during agent setup
  --auth-url <url>           Authorization endpoint override
  --activation-url <url>     Human approval page override
  --profile-prefix <name>    Prefix stored live/test profile names
  --new-platform             Create another isolated platform
  --description <text>       Product description
  --dry-run                  Validate without creating resources
  --idempotency-key <key>    Reuse the same operation keys on retry
  --profile <name>           Use a stored live or test profile
  --json                     Emit machine-readable JSON

Environment:
  ZONELESS_AUTH_URL          Agent authorization callable URL
  ZONELESS_ACTIVATION_URL    Human approval page URL
  ZONELESS_API_URL           Zoneless API URL
  ZONELESS_API_KEY           Platform API key
  ZONELESS_PROFILE           Stored profile name (defaults to current profile)
`;

export async function RunCli(
  argumentsList: string[],
  environment: Environment,
  io: CliIo,
  fetchRequest: FetchLike = fetch,
  secretStore: SecretStore = new KeyringSecretStore(),
  openBrowser: BrowserOpener = OpenBrowser
): Promise<ExitCode> {
  const jsonRequested = argumentsList.includes('--json');
  const secretValues = [environment.ZONELESS_API_KEY].filter(
    (value): value is string => Boolean(value)
  );

  try {
    const command = ParseArguments(argumentsList);
    if (command.name === 'help') {
      io.stdout.write(helpText);
      return exitCodes.success;
    }

    const profileStore = new ProfileStore(environment, secretStore);
    if (command.name === 'agent-install-skill') {
      const result = await InstallAgentSkill();
      WriteResult(command.json, result, io);
      return exitCodes.success;
    }
    if (command.name === 'auth-status') {
      const status = await profileStore.GetStatus(
        command.profile ?? environment.ZONELESS_PROFILE
      );
      const result = {
        object: 'auth_status',
        ok: true,
        current_profile: status.currentProfile,
        profiles: status.profiles.map((profile) => ({
          api_key_prefix: profile.apiKeyPrefix,
          api_url: profile.apiUrl,
          mode: profile.mode,
          name: profile.name,
          platform_id: profile.platformId,
          platform_name: profile.platformName,
          api_key_available: profile.secretAvailable,
          secret_available: profile.secretAvailable,
          wallet_public_key: profile.walletPublicKey,
          wallet_secret_available: profile.walletSecretAvailable,
          workspace_id: profile.workspaceId,
        })),
      };
      WriteResult(command.json, result, io);
      return exitCodes.success;
    }
    if (command.name === 'agent-setup') {
      const skill = await InstallAgentSkill();
      const reusableSetup = command.newPlatform
        ? null
        : await profileStore.GetReusableSetup(command.profilePrefix);
      if (reusableSetup) {
        if (reusableSetup.test.platformName !== command.platformName) {
          throw InvalidInput(
            `Profiles already point to "${reusableSetup.test.platformName}". Add --new-platform to create "${command.platformName}".`
          );
        }
        WriteResult(
          command.json,
          {
            current_profile: reusableSetup.currentProfile,
            object: 'agent_setup',
            ok: true,
            platform_name: reusableSetup.test.platformName,
            profiles: {
              live: {
                api_url: reusableSetup.live.apiUrl,
                platform_id: reusableSetup.live.platformId,
              },
              test: {
                api_url: reusableSetup.test.apiUrl,
                platform_id: reusableSetup.test.platformId,
              },
            },
            reused: true,
            skill_path: skill.path,
            wallet_public_key: reusableSetup.test.walletPublicKey,
            workspace_id: reusableSetup.test.workspaceId,
          },
          io
        );
        return exitCodes.success;
      }
      const profilePrefix = command.newPlatform
        ? await profileStore.ResolveNewPlatformPrefix(
            command.platformName,
            command.profilePrefix
          )
        : command.profilePrefix;
      const setupService = new AgentSetupService(
        fetchRequest,
        secretStore,
        profileStore
      );
      const result = await setupService.Setup(
        {
          activationUrl:
            command.activationUrl ?? environment.ZONELESS_ACTIVATION_URL,
          authUrl: command.authUrl ?? environment.ZONELESS_AUTH_URL,
          newPlatform: command.newPlatform,
          platformName: command.platformName,
          pollIntervalMs: ParsePollInterval(
            environment.ZONELESS_AUTH_POLL_INTERVAL_MS
          ),
          profilePrefix,
        },
        (prompt) =>
          PresentAuthorizationPrompt(command.json, prompt, io, openBrowser)
      );
      WriteResult(command.json, { ...result, skill_path: skill.path }, io);
      return exitCodes.success;
    }
    if (command.name === 'wallet-backup') {
      const result = await BackupWallet(
        command.outputPath,
        command.profile ?? environment.ZONELESS_PROFILE,
        profileStore,
        secretStore
      );
      WriteResult(false, result, io);
      return exitCodes.success;
    }

    const credentials = await ResolveCredentials(
      environment,
      command.profile,
      profileStore
    );
    secretValues.push(credentials.apiKey);
    const apiUrl = credentials.apiUrl;
    const apiKey = credentials.apiKey;
    const client = new ZonelessClient(apiUrl, apiKey, fetchRequest);

    const result =
      command.name === 'doctor'
        ? await RunDoctor(client)
        : await RunStoreInit(client, command);

    WriteResult(command.json, result, io);
    return exitCodes.success;
  } catch (error) {
    const cliError = NormalizeError(error);
    const safeMessage = RedactText(cliError.message, secretValues);
    const safeDetails = RedactValue(cliError.details, secretValues);

    if (jsonRequested) {
      io.stdout.write(
        `${JSON.stringify({
          ok: false,
          error: {
            code: cliError.code,
            message: safeMessage,
            ...(safeDetails ? { details: safeDetails } : {}),
          },
        })}\n`
      );
    }
    io.stderr.write(`error: ${safeMessage}\n`);
    return cliError.exitCode;
  }
}

async function ResolveCredentials(
  environment: Environment,
  profileName: string | undefined,
  profileStore: ProfileStore
): Promise<{ apiKey: string; apiUrl: string }> {
  const apiUrl = environment.ZONELESS_API_URL?.trim();
  const apiKey = environment.ZONELESS_API_KEY?.trim();
  if (apiUrl || apiKey) {
    if (!apiUrl || !apiKey) {
      throw InvalidInput(
        'ZONELESS_API_URL and ZONELESS_API_KEY must be provided together.'
      );
    }
    return { apiKey, apiUrl };
  }
  const credentials = await profileStore.GetCredentials(
    profileName ?? environment.ZONELESS_PROFILE
  );
  return {
    apiKey: credentials.apiKey,
    apiUrl: credentials.profile.apiUrl,
  };
}

function NormalizeError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new CliError(message, 'unexpected_error', exitCodes.apiError);
}

function FormatHumanResult(result: object): string {
  const resultRecord = result as Record<string, unknown>;
  if (resultRecord['object'] === 'skill_install') {
    return `Installed the zoneless-store skill at ${resultRecord['path']}.\n`;
  }
  if (resultRecord['object'] === 'auth_status') {
    return `${JSON.stringify(resultRecord, null, 2)}\n`;
  }
  if (resultRecord['object'] === 'agent_setup') {
    if (resultRecord['reused']) {
      return [
        `Using existing platform ${resultRecord['platform_name']}.`,
        `Current profile: ${resultRecord['current_profile']}`,
        `Skill: ${resultRecord['skill_path']}`,
        '',
      ].join('\n');
    }
    return [
      `Provisioned ${resultRecord['platform_name']}.`,
      ...(resultRecord['wallet_public_key']
        ? [`Wallet: ${resultRecord['wallet_public_key']}`]
        : []),
      `Current profile: ${resultRecord['current_profile']}`,
      `Skill: ${resultRecord['skill_path']}`,
      '',
    ].join('\n');
  }
  if (resultRecord['object'] === 'wallet_backup') {
    return `Saved the wallet backup to ${resultRecord['path']}. Keep this file offline and private.\n`;
  }
  if (resultRecord['object'] === 'doctor') {
    const mode = resultRecord['livemode'] ? 'live' : 'test';
    return `Authenticated to ${resultRecord['api_url']} in ${mode} mode.\n`;
  }
  if (resultRecord['object'] === 'store_init_plan') {
    return `Dry run passed. Would create a ${resultRecord['amount']} USDC-minor-unit product and payment link.\n`;
  }
  return [
    `Product: ${resultRecord['product_id']}`,
    `Price: ${resultRecord['price_id']}`,
    `Payment link: ${resultRecord['payment_link_id']}`,
    `Checkout URL: ${resultRecord['checkout_url']}`,
    '',
  ].join('\n');
}

function ParsePollInterval(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const milliseconds = Number(value);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 100) {
    throw InvalidInput(
      'ZONELESS_AUTH_POLL_INTERVAL_MS must be an integer of at least 100.'
    );
  }
  return milliseconds;
}

export async function PresentAuthorizationPrompt(
  json: boolean,
  prompt: AuthorizationPrompt,
  io: CliIo,
  openBrowser: BrowserOpener = OpenBrowser
): Promise<void> {
  if (json) {
    io.stdout.write(
      `${JSON.stringify({
        type: 'authorization_required',
        expires_at: prompt.expiresAt,
        user_code: prompt.userCode,
        verification_url: prompt.verificationUrl,
        wallet_public_key: prompt.walletPublicKey,
      })}\n`
    );
    return;
  }
  io.stderr.write(
    [
      'Authorize this agent setup:',
      `  URL: ${prompt.verificationUrl}`,
      `  Code: ${prompt.userCode}`,
      `  Wallet: ${prompt.walletPublicKey}`,
      '',
    ].join('\n')
  );
  if (!io.isInteractive || !io.readLine) {
    io.stderr.write('Waiting for authorization...\n');
    return;
  }

  io.stderr.write(
    'Press Enter to open the authorization page, or open the URL above manually.\n'
  );
  await io.readLine();
  try {
    await openBrowser(prompt.verificationUrl);
    io.stderr.write('Authorization page opened. Waiting for approval...\n');
  } catch {
    io.stderr.write(
      `Could not open the browser. Open ${prompt.verificationUrl} manually.\n` +
        'Waiting for authorization...\n'
    );
  }
}

function WriteResult(json: boolean, result: object, io: CliIo): void {
  if (json) {
    io.stdout.write(`${JSON.stringify(result)}\n`);
  } else {
    io.stdout.write(FormatHumanResult(result));
  }
}

function RedactText(value: string, secretValues: string[]): string {
  return secretValues.reduce(
    (safeValue, secret) => safeValue.split(secret).join('[REDACTED]'),
    value
  );
}

function RedactValue(value: unknown, secretValues: string[]): unknown {
  if (typeof value === 'string') return RedactText(value, secretValues);
  if (Array.isArray(value)) {
    return value.map((entry) => RedactValue(entry, secretValues));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        RedactValue(entry, secretValues),
      ])
    );
  }
  return value;
}
