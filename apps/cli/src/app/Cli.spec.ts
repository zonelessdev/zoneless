import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ParseArguments } from './Arguments';
import { PresentAuthorizationPrompt, RunCli } from './Cli';
import type { FetchLike } from './Client';
import { exitCodes, type CliIo } from './Types';

function CreateIo(): {
  io: CliIo;
  stderr: string[];
  stdout: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stdout: { write: (value) => stdout.push(value) },
      stderr: { write: (value) => stderr.push(value) },
    },
    stderr,
    stdout,
  };
}

function JsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Zoneless CLI', () => {
  it('validates store amounts as positive integers', () => {
    expect(() =>
      ParseArguments(['store', 'init', '--name', 'Test', '--amount', '2.5'])
    ).toThrow(/positive integer/);
  });

  it('parses agent setup and stored-profile commands', () => {
    expect(
      ParseArguments([
        'agent',
        'setup',
        '--platform-name',
        'Agent Store',
        '--json',
      ])
    ).toEqual({
      activationUrl: undefined,
      authUrl: undefined,
      json: true,
      name: 'agent-setup',
      newPlatform: false,
      platformName: 'Agent Store',
      profilePrefix: undefined,
      skillId: 'store',
    });
    expect(ParseArguments(['doctor', '--profile', 'live'])).toEqual({
      json: false,
      name: 'doctor',
      profile: 'live',
    });
    expect(
      ParseArguments([
        'agent',
        'setup',
        '--platform-name',
        'Second Store',
        '--new-platform',
      ])
    ).toMatchObject({
      name: 'agent-setup',
      newPlatform: true,
      platformName: 'Second Store',
      skillId: 'store',
    });
  });

  it('parses and validates explicit agent skills', () => {
    expect(
      ParseArguments([
        'agent',
        'setup',
        '--platform-name',
        'Marketplace',
        '--skill',
        'marketplace',
      ])
    ).toMatchObject({
      name: 'agent-setup',
      skillId: 'marketplace',
    });
    expect(
      ParseArguments([
        'agent',
        'install-skill',
        '--skill',
        'marketplace',
        '--json',
      ])
    ).toEqual({
      json: true,
      name: 'agent-install-skill',
      skillId: 'marketplace',
    });
    expect(() =>
      ParseArguments(['agent', 'install-skill', '--skill', '../marketplace'])
    ).toThrow(/marketplace, store/);
  });

  it('returns the selected installed skill path as JSON', async () => {
    const projectDirectory = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'zoneless-cli-'))
    );
    const originalDirectory = process.cwd();
    const skillPath = path.join(
      projectDirectory,
      '.agents',
      'skills',
      'zoneless-marketplace',
      'SKILL.md'
    );
    await fs.mkdir(path.dirname(skillPath), { recursive: true });
    await fs.writeFile(skillPath, '# Marketplace test skill\n');
    process.chdir(projectDirectory);
    const { io, stdout } = CreateIo();

    try {
      const exitCode = await RunCli(
        ['agent', 'install-skill', '--skill', 'marketplace', '--json'],
        {},
        io
      );

      expect(exitCode).toBe(exitCodes.success);
      expect(JSON.parse(stdout.join(''))).toEqual({
        object: 'skill_install',
        ok: true,
        path: skillPath,
        skill: 'marketplace',
      });
    } finally {
      process.chdir(originalDirectory);
      await fs.rm(projectDirectory, { force: true, recursive: true });
    }
  });

  it('creates a product, price, and payment link with distinct keys', async () => {
    const requests: Array<{ body?: string; headers: Headers; url: string }> =
      [];
    const fetchRequest: FetchLike = jest.fn(async (input, init) => {
      const url = String(input);
      requests.push({
        body: init?.body?.toString(),
        headers: new Headers(init?.headers),
        url,
      });

      if (url.endsWith('/products?limit=1')) {
        return JsonResponse({ object: 'list', data: [] });
      }
      if (url.endsWith('/config')) {
        return JsonResponse({ object: 'config', livemode: false });
      }
      if (url.endsWith('/products')) {
        return JsonResponse({ id: 'prod_test' }, 201);
      }
      if (url.endsWith('/prices')) {
        return JsonResponse({ id: 'price_test' }, 201);
      }
      return JsonResponse(
        { id: 'plink_test', url: 'https://pay.example/b/test' },
        201
      );
    });
    const { io, stdout } = CreateIo();

    const exitCode = await RunCli(
      [
        'store',
        'init',
        '--name',
        'Agent product',
        '--amount',
        '200',
        '--description',
        'A test product',
        '--idempotency-key',
        'benchmark',
        '--json',
      ],
      {
        ZONELESS_API_KEY: 'zk_test_secret',
        ZONELESS_API_URL: 'https://api.example',
      },
      io,
      fetchRequest
    );

    expect(exitCode).toBe(exitCodes.success);
    expect(JSON.parse(stdout.join(''))).toEqual({
      amount: 200,
      checkout_url: 'https://pay.example/b/test',
      currency: 'usdc',
      object: 'store_init',
      ok: true,
      payment_link_id: 'plink_test',
      price_id: 'price_test',
      product_id: 'prod_test',
    });

    const writeRequests = requests.slice(2);
    expect(
      writeRequests.map((request) => request.headers.get('idempotency-key'))
    ).toEqual([
      'benchmark:product',
      'benchmark:price',
      'benchmark:payment-link',
    ]);
    expect(JSON.parse(writeRequests[1].body ?? '{}')).toEqual({
      currency: 'usdc',
      product: 'prod_test',
      unit_amount: 200,
    });
    expect(JSON.parse(writeRequests[2].body ?? '{}')).toEqual({
      currency: 'usdc',
      line_items: [{ price: 'price_test', quantity: 1 }],
    });
  });

  it('creates resources against a live-mode API', async () => {
    const fetchRequest: FetchLike = jest.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/products?limit=1')) {
        return JsonResponse({ object: 'list', data: [] });
      }
      if (url.endsWith('/config')) {
        return JsonResponse({ object: 'config', livemode: true });
      }
      if (url.endsWith('/products')) {
        return JsonResponse({ id: 'prod_live' }, 201);
      }
      if (url.endsWith('/prices')) {
        return JsonResponse({ id: 'price_live' }, 201);
      }
      return JsonResponse(
        { id: 'plink_live', url: 'https://pay.example/b/live' },
        201
      );
    });
    const { io, stdout } = CreateIo();

    const exitCode = await RunCli(
      ['store', 'init', '--name', 'Live product', '--amount', '200', '--json'],
      {
        ZONELESS_API_KEY: 'zk_live_secret',
        ZONELESS_API_URL: 'https://api.example/v1',
      },
      io,
      fetchRequest
    );

    expect(exitCode).toBe(exitCodes.success);
    expect(JSON.parse(stdout.join(''))).toMatchObject({
      object: 'store_init',
      product_id: 'prod_live',
      price_id: 'price_live',
      payment_link_id: 'plink_live',
    });
    expect(fetchRequest).toHaveBeenCalledTimes(5);
  });

  it('validates a dry run without creating resources', async () => {
    const fetchRequest: FetchLike = jest.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/products?limit=1')) {
        return JsonResponse({ object: 'list', data: [] });
      }
      return JsonResponse({ object: 'config', livemode: false });
    });
    const { io, stdout } = CreateIo();

    const exitCode = await RunCli(
      [
        'store',
        'init',
        '--name',
        'Preview product',
        '--amount',
        '200',
        '--dry-run',
        '--json',
      ],
      {
        ZONELESS_API_KEY: 'zk_test_secret',
        ZONELESS_API_URL: 'https://api.example',
      },
      io,
      fetchRequest
    );

    expect(exitCode).toBe(exitCodes.success);
    expect(JSON.parse(stdout.join('')).object).toBe('store_init_plan');
    expect(fetchRequest).toHaveBeenCalledTimes(2);
  });

  it('reports created resource ids when a later write fails', async () => {
    const fetchRequest: FetchLike = jest.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/products?limit=1')) {
        return JsonResponse({ object: 'list', data: [] });
      }
      if (url.endsWith('/config')) {
        return JsonResponse({ object: 'config', livemode: false });
      }
      if (url.endsWith('/products')) {
        return JsonResponse({ id: 'prod_partial' }, 201);
      }
      return JsonResponse(
        { error: { message: 'Price service unavailable' } },
        503
      );
    });
    const { io, stdout } = CreateIo();

    const exitCode = await RunCli(
      [
        'store',
        'init',
        '--name',
        'Partial product',
        '--amount',
        '200',
        '--json',
      ],
      {
        ZONELESS_API_KEY: 'zk_test_secret',
        ZONELESS_API_URL: 'https://api.example',
      },
      io,
      fetchRequest
    );
    const output = JSON.parse(stdout.join(''));

    expect(exitCode).toBe(exitCodes.partialFailure);
    expect(output.error.details.partial_resources).toEqual({
      payment_link_id: null,
      price_id: null,
      product_id: 'prod_partial',
    });
    expect(stdout.join('')).not.toContain('zk_test_secret');
  });

  it('redacts API keys from errors and diagnostics', async () => {
    const fetchRequest: FetchLike = jest.fn(async () => {
      throw new Error('Network rejected zk_test_secret');
    });
    const { io, stderr, stdout } = CreateIo();

    const exitCode = await RunCli(
      ['doctor', '--json'],
      {
        ZONELESS_API_KEY: 'zk_test_secret',
        ZONELESS_API_URL: 'https://api.example',
      },
      io,
      fetchRequest
    );
    const combinedOutput = `${stdout.join('')}${stderr.join('')}`;

    expect(exitCode).toBe(exitCodes.apiError);
    expect(combinedOutput).toContain('[REDACTED]');
    expect(combinedOutput).not.toContain('zk_test_secret');
  });

  it('opens authorization in interactive terminals after Enter', async () => {
    const { io, stderr } = CreateIo();
    const readLine = jest.fn(async () => '');
    const openBrowser = jest.fn(async () => undefined);
    io.isInteractive = true;
    io.readLine = readLine;

    await PresentAuthorizationPrompt(
      false,
      {
        expiresAt: Date.now() + 60_000,
        userCode: 'ABCD-EFGH',
        verificationUrl: 'https://zoneless.com/activate?code=ABCD-EFGH',
        walletPublicKey: 'wallet-public-key',
      },
      io,
      openBrowser
    );

    expect(readLine).toHaveBeenCalledTimes(1);
    expect(openBrowser).toHaveBeenCalledWith(
      'https://zoneless.com/activate?code=ABCD-EFGH'
    );
    expect(stderr.join('')).toContain(
      'Press Enter to open the authorization page'
    );
    expect(stderr.join('')).toContain(
      'Authorization page opened. Waiting for approval.'
    );
  });

  it('keeps JSON authorization output non-interactive', async () => {
    const { io, stdout } = CreateIo();
    const readLine = jest.fn(async () => '');
    const openBrowser = jest.fn(async () => undefined);
    io.isInteractive = true;
    io.readLine = readLine;

    await PresentAuthorizationPrompt(
      true,
      {
        expiresAt: 1234,
        userCode: 'ABCD-EFGH',
        verificationUrl: 'https://zoneless.com/activate?code=ABCD-EFGH',
        walletPublicKey: 'wallet-public-key',
      },
      io,
      openBrowser
    );

    expect(JSON.parse(stdout.join(''))).toMatchObject({
      type: 'authorization_required',
      user_code: 'ABCD-EFGH',
      verification_url: 'https://zoneless.com/activate?code=ABCD-EFGH',
    });
    expect(readLine).not.toHaveBeenCalled();
    expect(openBrowser).not.toHaveBeenCalled();
  });
});
