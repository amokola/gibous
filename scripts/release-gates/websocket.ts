import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { WebSocket } from 'ws';

const port = 3102;
const origin = `http://127.0.0.1:${port}`;
const serverEnv = {
  ...process.env,
  NODE_ENV: 'development',
  DATABASE_URL: '',
  ALLOW_UNSIGNED_AUTH: 'true',
  CORS_ORIGIN: origin,
  PORT: String(port),
  TELEGRAM_BOT_TOKEN: 'release-gate-test-token',
  TON_ASSET_MODE: 'native_ton',
  TON_NETWORK: 'testnet',
};

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const waitForHealth = async () => {
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
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('WebSocket release-gate server did not become healthy');
};

const openSocket = (socketOrigin = origin) => new Promise<WebSocket>((resolve, reject) => {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: socketOrigin });
  socket.once('open', () => resolve(socket));
  socket.once('error', reject);
});

const waitForMessage = (socket: WebSocket, predicate: (message: any) => boolean, timeoutMs = 5_000) => new Promise<any>((resolve, reject) => {
  const timeout = setTimeout(() => {
    socket.off('message', onMessage);
    reject(new Error('Timed out waiting for WebSocket message'));
  }, timeoutMs);
  const onMessage = (data: Buffer) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (predicate(parsed)) {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(parsed);
    }
  };
  socket.on('message', onMessage);
});

const authenticate = async (socket: WebSocket, telegramId: number) => {
  socket.send(JSON.stringify({
    type: 'AUTH',
    requestId: `release-auth-${telegramId}`,
    payload: { telegramId, playerName: `Release ${telegramId}` },
  }));
  const response = await waitForMessage(socket, (message) => message.type === 'AUTH_OK');
  assert(response.payload.telegramId === telegramId, 'Authenticated identity did not round-trip');
};

let child: ChildProcess | undefined;
const openSockets: WebSocket[] = [];

try {
  child = spawn(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/server.ts'], {
    cwd: process.cwd(),
    env: serverEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  await waitForHealth();

  const pingSocket = await openSocket();
  openSockets.push(pingSocket);
  pingSocket.send(JSON.stringify({ type: 'PING', requestId: 'release-ping', payload: { timestamp: Date.now() } }));
  const pong = await waitForMessage(pingSocket, (message) => message.type === 'PONG');
  assert(pong.requestId === 'release-ping', 'PONG did not preserve request correlation');

  pingSocket.send('not-json');
  const malformed = await waitForMessage(pingSocket, (message) => message.type === 'ERROR' && message.payload.code === 'INVALID_JSON');
  assert(malformed.payload.message === 'Malformed JSON frame received', 'Malformed frame was not safely rejected');

  pingSocket.send(JSON.stringify({ type: 'UNKNOWN', payload: {} }));
  const invalidSchema = await waitForMessage(pingSocket, (message) => message.type === 'ERROR' && message.payload.code === 'SCHEMA_VALIDATION_ERROR');
  assert(invalidSchema.type === 'ERROR', 'Invalid schema did not produce a protocol error');

  await authenticate(pingSocket, 930001);
  const clients = await Promise.all(Array.from({ length: 20 }, async (_, index) => {
    const socket = await openSocket();
    openSockets.push(socket);
    await authenticate(socket, 930100 + index);
    return socket;
  }));

  const latencyStart = performance.now();
  for (const socket of clients) {
    socket.send(JSON.stringify({ type: 'PING', requestId: `release-soak-${Math.random()}`, payload: { timestamp: Date.now() } }));
  }
  await Promise.all(clients.map((socket) => waitForMessage(socket, (message) => message.type === 'PONG')));
  const latencyMs = performance.now() - latencyStart;

  for (let index = 0; index < 40; index += 1) {
    clients[0].send(JSON.stringify({ type: 'PING', requestId: `release-flood-${index}`, payload: { timestamp: Date.now() } }));
  }
  const floodError = await waitForMessage(clients[0], (message) => message.type === 'ERROR' && message.payload.code === 'RATE_LIMIT_EXCEEDED');
  assert(floodError.type === 'ERROR', 'Pre-auth/transport flood was not rate limited');

  const oversized = await openSocket();
  openSockets.push(oversized);
  const oversizedClose = new Promise<number>((resolve) => oversized.once('close', (code) => resolve(code)));
  oversized.send(Buffer.alloc(64 * 1024 + 1, 'x'));
  const closeCode = await Promise.race([
    oversizedClose,
    new Promise<number>((_, reject) => setTimeout(() => reject(new Error('Oversized frame was not closed')), 5_000)),
  ]);
  assert(closeCode === 1009, `Oversized frame closed with unexpected code ${closeCode}`);

  let disallowedRejected = false;
  try {
    const disallowed = await openSocket('https://disallowed.example');
    disallowed.close();
  } catch {
    disallowedRejected = true;
  }
  assert(disallowedRejected, 'Disallowed WebSocket origin was accepted');

  console.log(JSON.stringify({
    gate: 'websocket-abuse-and-soak',
    status: 'PARTIALLY VERIFIED',
    connections: openSockets.length,
    malformedPayloadRejected: true,
    schemaValidationRejected: true,
    transportFloodRateLimited: true,
    oversizedPayloadRejected: true,
    disallowedOriginRejected: true,
    pingFanoutLatencyMs: Number(latencyMs.toFixed(2)),
    remainingGap: 'This local smoke/abuse run does not measure sustained CPU, memory, or slow-consumer backpressure under production-scale load.',
  }, null, 2));
} finally {
  for (const socket of openSockets) {
    try { socket.close(); } catch { /* Ignore already closed sockets. */ }
  }
  if (child && !child.killed) {
    child.kill('SIGTERM');
  }
}
