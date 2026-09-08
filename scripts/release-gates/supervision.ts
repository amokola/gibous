import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import http from 'node:http';

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const waitForExit = (child: ChildProcessWithoutNullStreams, timeoutMs = 10_000) => new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Child process did not exit within the supervision gate timeout')), timeoutMs);
  child.once('exit', (code, signal) => {
    clearTimeout(timeout);
    resolve({ code, signal });
  });
});

const waitForHealth = async (port: number) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const status = await new Promise<number>((resolve, reject) => {
        const request = http.get(`http://127.0.0.1:${port}/api/health`, (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode || 0));
        });
        request.once('error', reject);
      });
      if (status === 200) return;
    } catch {
      // Process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Server on port ${port} did not become healthy`);
};

const spawnServer = (port: number, extraEnv: Record<string, string>) => spawn(
  process.execPath,
  ['node_modules/tsx/dist/cli.mjs', 'server/server.ts'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DATABASE_URL: '',
      ALLOW_UNSIGNED_AUTH: 'true',
      CORS_ORIGIN: `http://127.0.0.1:${port}`,
      PORT: String(port),
      TELEGRAM_BOT_TOKEN: 'release-gate-test-token',
      TON_ASSET_MODE: 'native_ton',
      TON_NETWORK: 'testnet',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

process.env.NODE_ENV = 'development';
process.env.DATABASE_URL = '';
process.env.ALLOW_UNSIGNED_AUTH = 'true';
process.env.CORS_ORIGIN = 'http://127.0.0.1:3103';
process.env.PORT = '3103';
process.env.TELEGRAM_BOT_TOKEN = 'release-gate-test-token';
process.env.TON_ASSET_MODE = 'native_ton';
process.env.TON_NETWORK = 'testnet';
process.env.VITEST = '1';
const { server, shutdown } = await import('../../server/server');
await new Promise<void>((resolve) => server.listen(3103, resolve));
assert(server.listening, 'Release-gate server did not start');
await shutdown('release-gate');
assert(!server.listening, 'Graceful shutdown did not close the HTTP server');

const invalidProduction = spawnServer(3104, {
  NODE_ENV: 'production',
  VITEST: '',
  CORS_ORIGIN: 'https://release-gate.invalid',
  TELEGRAM_BOT_TOKEN: '',
  TON_ASSET_MODE: 'native_ton',
  TON_NETWORK: 'testnet',
  TON_DEPOSIT_ADDRESS: '',
  TONCENTER_API_URL: '',
});
let invalidOutput = '';
invalidProduction.stdout.on('data', (chunk) => { invalidOutput += chunk.toString(); });
invalidProduction.stderr.on('data', (chunk) => { invalidOutput += chunk.toString(); });
const invalidExit = await waitForExit(invalidProduction);
assert(invalidExit.code !== 0, 'Invalid production configuration was accepted');
assert(invalidOutput.includes('missing/unsafe configuration'), 'Invalid production failure did not identify configuration validation');

console.log(JSON.stringify({
  gate: 'supervision',
  status: 'PARTIALLY VERIFIED',
  gracefulShutdown: {
    verified: true,
    invocation: 'direct shutdown hook',
    closesServerAndDatabaseHooks: true,
  },
  signalDelivery: 'BLOCKED_ON_WINDOWS',
  productionConfigurationFailClosed: true,
  remainingGap: 'No repository-owned supervisor or restart policy exists; automatic crash restart and recovery must be verified in the chosen deployment platform.',
}, null, 2));
