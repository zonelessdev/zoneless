import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import mongoose from 'mongoose';
import { killPort, waitForPortOpen } from '@nx/node/utils';
import { API_PORT, MONGODB_URI } from './Config';

const workspaceRoot = path.resolve(__dirname, '../../../..');
const apiDir = path.join(workspaceRoot, 'dist/apps/api');
const logPath = path.join(workspaceRoot, 'tmp/api-e2e/api.log');

async function ResetDatabase(): Promise<void> {
  try {
    const connection = await mongoose
      .createConnection(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
      .asPromise();
    await connection.dropDatabase();
    await connection.close();
  } catch (error) {
    throw new Error(
      `Could not reach MongoDB at ${MONGODB_URI}. Start it with "npm run start:db". (${error})`
    );
  }
}

/**
 * Runs the built API in simulated test mode. It starts from dist/apps/api
 * with a minimal environment so a developer's .env or shell cannot point it
 * at another database, live mode, or operator mode.
 */
function StartApi(): ChildProcess {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = fs.openSync(logPath, 'w');

  return spawn(process.execPath, ['main.js'], {
    cwd: apiDir,
    env: {
      PATH: process.env.PATH,
      API_PORT: String(API_PORT),
      MONGODB_URI,
      LIVEMODE: 'false',
      SINGLE_TENANT: 'false',
    },
    stdio: ['ignore', log, log],
  });
}

module.exports = async function () {
  await killPort(API_PORT);
  await ResetDatabase();

  const api = StartApi();
  globalThis.__API_PROCESS__ = api;

  const exitedEarly = new Promise<never>((_, reject) => {
    api.once('exit', (code) =>
      reject(new Error(`API exited with code ${code}. See ${logPath}`))
    );
  });

  try {
    await Promise.race([
      waitForPortOpen(API_PORT, { retries: 30 }),
      exitedEarly,
    ]);
  } catch (error) {
    api.kill();
    throw error;
  }
};
