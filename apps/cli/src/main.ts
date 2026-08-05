#!/usr/bin/env node

import { createInterface } from 'node:readline/promises';
import { RunCli } from './app/Cli';

RunCli(
  process.argv.slice(2),
  {
    HOME: process.env['HOME'],
    XDG_CONFIG_HOME: process.env['XDG_CONFIG_HOME'],
    ZONELESS_ACTIVATION_URL: process.env['ZONELESS_ACTIVATION_URL'],
    ZONELESS_AUTH_POLL_INTERVAL_MS:
      process.env['ZONELESS_AUTH_POLL_INTERVAL_MS'],
    ZONELESS_AUTH_URL: process.env['ZONELESS_AUTH_URL'],
    ZONELESS_API_KEY: process.env['ZONELESS_API_KEY'],
    ZONELESS_API_URL: process.env['ZONELESS_API_URL'],
    ZONELESS_PROFILE: process.env['ZONELESS_PROFILE'],
  },
  {
    isInteractive: Boolean(process.stdin.isTTY && process.stderr.isTTY),
    readLine: ReadLine,
    stdout: process.stdout,
    stderr: process.stderr,
  }
)
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`error: ${message}\n`);
    process.exitCode = 4;
  });

async function ReadLine(): Promise<string> {
  const readline = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    return await readline.question('');
  } finally {
    readline.close();
  }
}
