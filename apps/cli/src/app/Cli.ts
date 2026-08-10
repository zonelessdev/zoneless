import { ParseArguments } from './Arguments';
import {
  AgentSetupService,
  type AgentSetupOptions,
  type AgentSetupResult,
  type AuthorizationPrompt,
} from './AgentSetup';
import { OpenBrowser, type BrowserOpener } from './Browser';
import { ZonelessClient, type FetchLike } from './Client';
import { RunDoctor, RunStoreInit } from './Commands';
import { SyncEnvironment } from './EnvSync';
import { ApiError, CliError, InvalidInput } from './Errors';
import { BuildProfileNames, ProfileStore } from './ProfileStore';
import { ProjectStore, type LocatedProjectBinding } from './ProjectStore';
import { KeyringSecretStore, type SecretStore } from './SecretStore';
import { InstallAgentSkill } from './SkillInstaller';
import { BackupWallet } from './Wallet';
import {
  exitCodes,
  type CliIo,
  type Environment,
  type ExitCode,
} from './Types';

const helpText = `Zoneless agent CLI

Usage:
  zoneless agent setup --platform-name <name> [--skill <skill>] [--json]
  zoneless agent install-skill [--skill <skill>] [--json]
  zoneless auth status [--profile <name>] [--json]
  zoneless auth reconnect [--profile <name>] [--json]
  zoneless env sync [--target <path>] [--include-wallet] [--json]
  zoneless wallet backup --output <path> [--profile <name>]
  zoneless doctor [--profile <name>] [--json]
  zoneless store init --name <name> --amount <integer> [options]

Options:
  --platform-name <name>     Platform name used during agent setup
  --auth-url <url>           Authorization endpoint override
  --activation-url <url>     Human approval page override
  --profile-prefix <name>    Prefix stored live/test profile names
  --new-platform             Create another isolated platform
  --skill <skill>            Agent skill: store (default) or marketplace
  --description <text>       Product description
  --dry-run                  Validate without creating resources
  --idempotency-key <key>    Reuse the same operation keys on retry
  --profile <name>           Use a stored live or test profile
  --target <path>            Environment file relative to the project
  --include-wallet           Also sync SOLANA_SECRET_KEY
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
    const projectStore = new ProjectStore();
    if (command.name === 'agent-install-skill') {
      const result = await InstallAgentSkill(process.cwd(), command.skillId);
      WriteResult(command.json, result, io);
      return exitCodes.success;
    }
    const locatedProject = await projectStore.Find();
    if (command.name === 'auth-status') {
      const requestedProfile = command.profile ?? environment.ZONELESS_PROFILE;
      const status = await profileStore.GetStatus(
        requestedProfile ??
          (locatedProject
            ? [
                locatedProject.binding.testProfile,
                locatedProject.binding.liveProfile,
              ]
            : undefined)
      );
      const result = {
        object: 'auth_status',
        ok: true,
        project_binding: locatedProject?.path ?? null,
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
      const skill = await InstallAgentSkill(process.cwd(), command.skillId);
      const boundPrefix = locatedProject?.binding.profilePrefix;
      if (
        locatedProject &&
        !command.newPlatform &&
        locatedProject.binding.platformName !== command.platformName
      ) {
        throw InvalidInput(
          `This project is bound to "${locatedProject.binding.platformName}", not "${command.platformName}". Use --new-platform to replace the binding.`
        );
      }
      if (
        locatedProject &&
        !command.newPlatform &&
        command.profilePrefix !== undefined &&
        command.profilePrefix !== boundPrefix
      ) {
        throw InvalidInput(
          `This project uses profile prefix "${
            boundPrefix ?? '(default)'
          }". Remove --profile-prefix or use --new-platform.`
        );
      }
      const requestedPrefix =
        locatedProject && !command.newPlatform
          ? boundPrefix
          : command.profilePrefix;
      const reusableSetup = command.newPlatform
        ? null
        : await profileStore.GetReusableSetup(
            requestedPrefix,
            locatedProject?.binding.testProfile
          );
      const storedSetup = command.newPlatform
        ? null
        : await profileStore.GetReusableSetup(
            requestedPrefix,
            locatedProject?.binding.testProfile,
            false
          );
      if (
        storedSetup &&
        storedSetup.test.platformName !== command.platformName
      ) {
        throw InvalidInput(
          `Profiles already point to "${storedSetup.test.platformName}". Add --new-platform to create "${command.platformName}".`
        );
      }
      if (!reusableSetup && storedSetup) {
        throw new CliError(
          'Stored Zoneless credentials are missing. Run "zoneless auth reconnect" to authorize replacement keys.',
          'credentials_invalid',
          exitCodes.apiError
        );
      }
      if (reusableSetup) {
        await VerifyReusableCredentials(
          reusableSetup.liveProfile,
          reusableSetup.testProfile,
          profileStore,
          fetchRequest,
          secretValues
        );
        const binding = await BindSetupProject(
          projectStore,
          {
            platformName: reusableSetup.test.platformName,
            workspaceId: reusableSetup.test.workspaceId,
          },
          {
            live: reusableSetup.liveProfile,
            test: reusableSetup.testProfile,
          },
          requestedPrefix,
          false,
          locatedProject?.rootDirectory
        );
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
            project_binding: binding.path,
            reused: true,
            skill: skill.skill,
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
        : requestedPrefix;
      const result = await AuthorizePlatform(
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
        command.json,
        io,
        fetchRequest,
        secretStore,
        profileStore,
        openBrowser
      );
      const profileNames = BuildProfileNames(profilePrefix);
      const binding = await BindSetupProject(
        projectStore,
        {
          platformName: result.platform_name,
          workspaceId: result.workspace_id,
        },
        profileNames,
        profilePrefix,
        command.newPlatform,
        locatedProject?.rootDirectory
      );
      WriteResult(
        command.json,
        {
          ...result,
          project_binding: binding.path,
          skill: skill.skill,
          skill_path: skill.path,
        },
        io
      );
      return exitCodes.success;
    }
    if (command.name === 'auth-reconnect') {
      const selectedProfile = await ResolveProfileName(
        command.profile,
        environment,
        locatedProject
      );
      const reusableSetup = await profileStore.GetReusableSetup(
        command.profile || environment.ZONELESS_PROFILE
          ? undefined
          : locatedProject?.binding.profilePrefix,
        selectedProfile,
        false
      );
      if (!reusableSetup) {
        throw InvalidInput(
          'A complete live/test profile pair is required for reconnect.'
        );
      }
      const profilePrefix = ProfilePrefixFromNames(
        reusableSetup.liveProfile,
        reusableSetup.testProfile
      );
      const result = await AuthorizePlatform(
        {
          activationUrl:
            command.activationUrl ?? environment.ZONELESS_ACTIVATION_URL,
          authUrl: command.authUrl ?? environment.ZONELESS_AUTH_URL,
          expectedWorkspaceId: reusableSetup.test.workspaceId,
          platformName: reusableSetup.test.platformName,
          pollIntervalMs: ParsePollInterval(
            environment.ZONELESS_AUTH_POLL_INTERVAL_MS
          ),
          profilePrefix,
          reconnect: true,
        },
        command.json,
        io,
        fetchRequest,
        secretStore,
        profileStore,
        openBrowser
      );
      const binding = await BindSetupProject(
        projectStore,
        {
          platformName: result.platform_name,
          workspaceId: result.workspace_id,
        },
        {
          live: reusableSetup.liveProfile,
          test: reusableSetup.testProfile,
        },
        profilePrefix,
        false,
        locatedProject?.rootDirectory
      );
      WriteResult(
        command.json,
        {
          ...result,
          object: 'auth_reconnect',
          project_binding: binding.path,
        },
        io
      );
      return exitCodes.success;
    }
    if (command.name === 'env-sync') {
      const profileName =
        (await ResolveProfileName(
          command.profile,
          environment,
          locatedProject
        )) ?? (await profileStore.GetProfile()).profileName;
      await VerifyProfileCredentials(
        profileName,
        profileStore,
        fetchRequest,
        secretValues
      );
      const result = await SyncEnvironment(
        {
          includeWallet: command.includeWallet,
          profileName,
          projectDirectory: locatedProject?.rootDirectory ?? process.cwd(),
          target: command.target,
        },
        profileStore,
        secretStore
      );
      WriteResult(command.json, result, io);
      return exitCodes.success;
    }
    if (command.name === 'wallet-backup') {
      const profileName = await ResolveProfileName(
        command.profile,
        environment,
        locatedProject
      );
      const result = await BackupWallet(
        command.outputPath,
        profileName,
        profileStore,
        secretStore
      );
      WriteResult(false, result, io);
      return exitCodes.success;
    }

    const credentials = await ResolveCredentials(
      environment,
      command.profile,
      profileStore,
      locatedProject
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
  profileStore: ProfileStore,
  locatedProject: LocatedProjectBinding | null
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
  const selectedProfile = await ResolveProfileName(
    profileName,
    environment,
    locatedProject
  );
  const credentials = await profileStore.GetCredentials(selectedProfile);
  return {
    apiKey: credentials.apiKey,
    apiUrl: credentials.profile.apiUrl,
  };
}

async function ResolveProfileName(
  profileName: string | undefined,
  environment: Environment,
  locatedProject: LocatedProjectBinding | null
): Promise<string | undefined> {
  return (
    profileName ??
    environment.ZONELESS_PROFILE ??
    locatedProject?.binding.testProfile
  );
}

async function VerifyReusableCredentials(
  liveProfile: string,
  testProfile: string,
  profileStore: ProfileStore,
  fetchRequest: FetchLike,
  secretValues: string[]
): Promise<void> {
  await Promise.all([
    VerifyProfileCredentials(
      liveProfile,
      profileStore,
      fetchRequest,
      secretValues
    ),
    VerifyProfileCredentials(
      testProfile,
      profileStore,
      fetchRequest,
      secretValues
    ),
  ]);
}

async function VerifyProfileCredentials(
  profileName: string,
  profileStore: ProfileStore,
  fetchRequest: FetchLike,
  secretValues: string[]
): Promise<void> {
  try {
    const credentials = await profileStore.GetCredentials(profileName);
    secretValues.push(credentials.apiKey);
    await new ZonelessClient(
      credentials.profile.apiUrl,
      credentials.apiKey,
      fetchRequest
    ).VerifyAuthentication();
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 401 || error.status === 403)
    ) {
      throw new CliError(
        `Stored Zoneless credentials for "${profileName}" are no longer valid. Run "zoneless auth reconnect" to authorize replacement keys.`,
        'credentials_invalid',
        exitCodes.apiError
      );
    }
    throw error;
  }
}

async function AuthorizePlatform(
  options: AgentSetupOptions,
  json: boolean,
  io: CliIo,
  fetchRequest: FetchLike,
  secretStore: SecretStore,
  profileStore: ProfileStore,
  openBrowser: BrowserOpener
): Promise<AgentSetupResult> {
  const setupService = new AgentSetupService(
    fetchRequest,
    secretStore,
    profileStore
  );
  return setupService.Setup(options, (prompt) =>
    PresentAuthorizationPrompt(json, prompt, io, openBrowser)
  );
}

async function BindSetupProject(
  projectStore: ProjectStore,
  setup: { platformName: string; workspaceId?: string },
  profileNames: { live: string; test: string },
  profilePrefix: string | undefined,
  allowOverwrite: boolean,
  rootDirectory = process.cwd()
): Promise<LocatedProjectBinding> {
  if (!setup.workspaceId) {
    throw new CliError(
      'Zoneless setup did not return a workspace identifier.',
      'invalid_setup_response',
      exitCodes.apiError
    );
  }
  return projectStore.Bind(
    rootDirectory,
    {
      liveProfile: profileNames.live,
      platformName: setup.platformName,
      profilePrefix,
      testProfile: profileNames.test,
      version: 1,
      workspaceId: setup.workspaceId,
    },
    allowOverwrite
  );
}

function ProfilePrefixFromNames(
  liveProfile: string,
  testProfile: string
): string | undefined {
  if (liveProfile === 'live' && testProfile === 'test') return undefined;
  const liveSuffix = '-live';
  const testSuffix = '-test';
  if (
    !liveProfile.endsWith(liveSuffix) ||
    !testProfile.endsWith(testSuffix) ||
    liveProfile.slice(0, -liveSuffix.length) !==
      testProfile.slice(0, -testSuffix.length)
  ) {
    throw InvalidInput(
      'The selected live and test profiles do not share a profile prefix.'
    );
  }
  return testProfile.slice(0, -testSuffix.length);
}

function NormalizeError(error: unknown): CliError {
  if (error instanceof CliError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new CliError(message, 'unexpected_error', exitCodes.apiError);
}

function FormatHumanResult(result: object): string {
  const resultRecord = result as Record<string, unknown>;
  if (resultRecord['object'] === 'skill_install') {
    return `Installed the zoneless-${resultRecord['skill']} skill at ${resultRecord['path']}.\n`;
  }
  if (resultRecord['object'] === 'auth_status') {
    return `${JSON.stringify(resultRecord, null, 2)}\n`;
  }
  if (resultRecord['object'] === 'auth_reconnect') {
    return [
      `Reconnected ${resultRecord['platform_name']}.`,
      `Current profile: ${resultRecord['current_profile']}`,
      `Project binding: ${resultRecord['project_binding']}`,
      '',
    ].join('\n');
  }
  if (resultRecord['object'] === 'env_sync') {
    const written = Array.isArray(resultRecord['written'])
      ? resultRecord['written'].join(', ')
      : String(resultRecord['written']);
    return [
      `Synced ${written} to ${resultRecord['target']}.`,
      `Profile: ${resultRecord['profile']} (${resultRecord['mode']})`,
      '',
    ].join('\n');
  }
  if (resultRecord['object'] === 'agent_setup') {
    if (resultRecord['reused']) {
      return [
        `Using existing platform ${resultRecord['platform_name']}.`,
        `Current profile: ${resultRecord['current_profile']}`,
        `Project binding: ${resultRecord['project_binding']}`,
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
      `Project binding: ${resultRecord['project_binding']}`,
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
