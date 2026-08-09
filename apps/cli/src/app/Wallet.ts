import fs from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stderr } from 'node:process';
import bs58 from 'bs58';
import { InvalidInput } from './Errors';
import type { ProfileStore } from './ProfileStore';
import { GetWalletAccount, type SecretStore } from './SecretStore';

export interface WalletBackupFile {
  publicKey: string;
  secretKeyBase58: string;
  secretKeyBase64: string;
  version: 2;
}

export async function BackupWallet(
  outputPath: string,
  profileName: string | undefined,
  profileStore: ProfileStore,
  secretStore: SecretStore
): Promise<{ object: 'wallet_backup'; ok: true; path: string }> {
  if (!stdin.isTTY) {
    throw InvalidInput(
      'Wallet backup requires an interactive terminal so a human can confirm the export.'
    );
  }
  const selected = await profileStore.GetProfile(profileName);
  if (!selected.profile.walletPublicKey) {
    throw InvalidInput(
      'This profile was reconnected without a local wallet key. Use the original wallet backup.'
    );
  }
  const confirmation = createInterface({ input: stdin, output: stderr });
  const answer = await confirmation.question(
    `Export the private key for wallet ${selected.profile.walletPublicKey}? Type BACKUP to continue: `
  );
  confirmation.close();
  if (answer !== 'BACKUP') {
    throw InvalidInput('Wallet backup cancelled.');
  }

  const secretKey = await secretStore.Get(
    GetWalletAccount(selected.profile.walletPublicKey)
  );
  if (!secretKey) {
    throw InvalidInput('The wallet key is missing from the credential store.');
  }

  const resolvedPath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(
    resolvedPath,
    `${JSON.stringify(
      CreateWalletBackup(selected.profile.walletPublicKey, secretKey),
      null,
      2
    )}\n`,
    { flag: 'wx', mode: 0o600 }
  );
  return { object: 'wallet_backup', ok: true, path: resolvedPath };
}

export function CreateWalletBackup(
  publicKey: string,
  secretKeyBase64: string
): WalletBackupFile {
  const secretKey = Buffer.from(secretKeyBase64, 'base64');
  if (secretKey.length !== 64) {
    throw InvalidInput('The stored wallet key is invalid.');
  }
  return {
    publicKey,
    secretKeyBase58: bs58.encode(secretKey),
    secretKeyBase64,
    version: 2,
  };
}
