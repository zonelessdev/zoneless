import { spawn } from 'node:child_process';

export type BrowserOpener = (url: string) => Promise<void>;

export async function OpenBrowser(url: string): Promise<void> {
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('Only HTTP and HTTPS authorization URLs can be opened.');
  }

  const browserCommand = GetBrowserCommand(parsedUrl.toString());
  await new Promise<void>((resolve, reject) => {
    const child = spawn(browserCommand.command, browserCommand.argumentsList, {
      detached: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

function GetBrowserCommand(url: string): {
  argumentsList: string[];
  command: string;
} {
  if (process.platform === 'darwin') {
    return { argumentsList: [url], command: 'open' };
  }
  if (process.platform === 'win32') {
    return {
      argumentsList: ['url.dll,FileProtocolHandler', url],
      command: 'rundll32',
    };
  }
  return { argumentsList: [url], command: 'xdg-open' };
}
