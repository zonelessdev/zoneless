import { CliError } from './Errors';
import { exitCodes } from './Types';

const serviceName = 'zoneless-cli';

export interface SecretStore {
  Delete(account: string): Promise<void>;
  Get(account: string): Promise<string | null>;
  Set(account: string, value: string): Promise<void>;
}

export class KeyringSecretStore implements SecretStore {
  async Delete(account: string): Promise<void> {
    const entry = await this.GetEntry(account);
    entry.deletePassword();
  }

  async Get(account: string): Promise<string | null> {
    const entry = await this.GetEntry(account);
    return entry.getPassword() ?? null;
  }

  async Set(account: string, value: string): Promise<void> {
    const entry = await this.GetEntry(account);
    entry.setPassword(value);
  }

  private async GetEntry(account: string): Promise<{
    deletePassword(): void;
    getPassword(): string | null | undefined;
    setPassword(value: string): void;
  }> {
    try {
      const keyring = await import('@napi-rs/keyring');
      return new keyring.Entry(serviceName, account);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown keyring error';
      throw new CliError(
        `Unable to access the operating-system credential store: ${message}`,
        'credential_store_error',
        exitCodes.apiError
      );
    }
  }
}

export function GetApiKeyAccount(profileName: string): string {
  return `profile:${profileName}:api-key`;
}

export function GetWalletAccount(walletPublicKey: string): string {
  return `wallet:${walletPublicKey}:secret-key`;
}
