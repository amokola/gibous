import { readFile } from 'node:fs/promises';
import { createServer, type Server as HttpServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { availableParallelism, totalmem } from 'node:os';
import { WebSocket, WebSocketServer } from 'ws';

type AuthPayload = {
  telegramId: number;
  playerName: string;
  initData?: string;
  reconnectTicket?: string;
  avatarUrl?: string;
};

type ServerMetrics = {
  system?: {
    cpu?: { processPercent?: number; hostPercent?: number; availableParallelism?: number };
    memory?: { rssPercentOfCapacity?: number; rssMb?: number; capacityMb?: number };
  };
};

type LoadClient = {
  socket: WebSocket;
  pending: Map<string, { startedAt: number; timeout: ReturnType<typeof setTimeout> }>;
  closed: boolean;
  authenticated: boolean;
  nextCommandTimer: ReturnType<typeof setTimeout> | null;
};

type LoadStats = { latenciesMs: number[]; errors: number; timeouts: number; commandResponses: number };

export type TierResult = {
  clients: number;
  command: 'GET_ROOMS' | 'PING';
  authenticated: boolean;
  responses: number;
  errors: number;
  timeouts: number;
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxCpuPercent: number | null;
  maxMemoryPercent: number | null;
  passed: boolean;
  capacityEligible: boolean;
};

const DEFAULT_TIERS = [25, 50, 100];
const COMMAND_TIMEOUT_MS = 5_000;
const METRICS_POLL_MS = 5_000;

export function percentile(samples: number[], percentileValue: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(2));
}

function parsePositiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function parseTiers(value: string | undefined): number[] {
  if (!value) return DEFAULT_TIERS;
  const tiers = value.split(',').map((item) => Number(item.trim()));
  if (tiers.some((tier) => !Number.isSafeInteger(tier) || tier < 1)) {
    throw new Error('WS_LOAD_TIERS must be a comma-separated list of positive integers');
  }
  return [...new Set(tiers)].sort((a, b) => a - b);
}

async function readCredentials(path: string | undefined): Promise<AuthPayload[]> {
  if (!path) return [];
  const parsed: unknown = JSON.parse(await readFile(resolve(path), 'utf8'));
  const candidates = Array.isArray(parsed) ? parsed : (parsed as { credentials?: unknown })?.credentials;
  if (!Array.isArray(candidates)) throw new Error('Credential file must contain an array of AUTH payloads');
  const credentials = candidates as AuthPayload[];
  if (credentials.some((item) => !Number.isSafeInteger(item?.telegramId) || item.telegramId < 1 || !item.playerName)) {
    throw new Error('Each load credential must include a positive telegramId and playerName');
  }
  if (new Set(credentials.map((item) => item.telegramId)).size !== credentials.length) {
    throw new Error('Load credentials must use a unique Telegram user ID per socket');
  }
  return credentials;
}

function metricsEndpoint(wsUrl: string): string {
  const url = new URL(wsUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/api/metrics';
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function fetchMetrics(url: string): Promise<ServerMetrics | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return null;
    return await response.json() as ServerMetrics;
  } catch {
    return null;
  }
}

function metricCpuPercent(metrics: ServerMetrics | null): number | null {
  const system = metrics?.system;
  if (!system?.cpu) return null;
  const processCpu = system.cpu.processPercent;
  const hostCpu = system.cpu.hostPercent;
  if (typeof processCpu !== 'number' || typeof hostCpu !== 'number') return null;
  return Math.max(processCpu, hostCpu);
}

function metricMemoryPercent(metrics: ServerMetrics | null): number | null {
  const value = metrics?.system?.memory?.rssPercentOfCapacity;
  return typeof value === 'number' ? value : null;
}

function makeClient(
  wsUrl: string,
  credential: AuthPayload | undefined,
  command: 'GET_ROOMS' | 'PING',
  commandIntervalMs: number,
  stats: LoadStats,
): Promise<LoadClient> {
  return new Promise((resolveClient, rejectClient) => {
    const socket = new WebSocket(wsUrl, { handshakeTimeout: 10_000, perMessageDeflate: false });
    const client: LoadClient = {
      socket,
      pending: new Map(),
      closed: false,
      authenticated: !credential,
      nextCommandTimer: null,
    };

    let settled = false;
    const connectionTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      stats.errors++;
      socket.terminate();
      rejectClient(new Error('connection_timeout'));
    }, 12_000);

    const beginTraffic = () => {
      const pump = () => {
        if (client.closed || socket.readyState !== WebSocket.OPEN) return;
        const requestId = randomUUID();
        const startedAt = performance.now();
        const timeout = setTimeout(() => {
          if (!client.pending.delete(requestId)) return;
          stats.timeouts++;
          stats.errors++;
          setTimeout(pump, commandIntervalMs);
        }, COMMAND_TIMEOUT_MS);
        client.pending.set(requestId, { startedAt, timeout });
        try {
          socket.send(JSON.stringify({ type: command, requestId, payload: command === 'PING' ? { timestamp: Date.now() } : {} }));
        } catch {
          clearTimeout(timeout);
          client.pending.delete(requestId);
          stats.errors++;
          setTimeout(pump, commandIntervalMs);
        }
      };
      pump();
    };

    socket.on('open', () => {
      if (credential) {
        socket.send(JSON.stringify({ type: 'AUTH', requestId: randomUUID(), payload: credential }));
        return;
      }
      clearTimeout(connectionTimeout);
      settled = true;
      beginTraffic();
      resolveClient(client);
    });

    socket.on('message', (data) => {
      let message: { type?: string; requestId?: string; payload?: { code?: string } };
      try {
        message = JSON.parse(data.toString());
      } catch {
        stats.errors++;
        return;
      }
      if (message.type === 'AUTH_OK' && credential && !client.authenticated) {
        client.authenticated = true;
        clearTimeout(connectionTimeout);
        settled = true;
        beginTraffic();
        resolveClient(client);
        return;
      }
      if (message.type === 'ERROR' && credential && !client.authenticated) {
        clearTimeout(connectionTimeout);
        settled = true;
        stats.errors++;
        socket.close();
        rejectClient(new Error('authentication_failed'));
        return;
      }
      if (!message.requestId || !['ROOMS_LIST', 'PONG', 'ERROR'].includes(message.type || '')) return;
      const pending = client.pending.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      client.pending.delete(message.requestId);
      stats.commandResponses++;
      stats.latenciesMs.push(performance.now() - pending.startedAt);
      if (message.type === 'ERROR') stats.errors++;
      client.nextCommandTimer = setTimeout(beginTraffic, commandIntervalMs);
    });

    socket.on('error', () => {
      if (!settled) {
        clearTimeout(connectionTimeout);
        settled = true;
        stats.errors++;
        rejectClient(new Error('socket_error'));
      }
    });

    socket.on('close', () => {
      const expectedClose = client.closed;
      client.closed = true;
      if (!settled) {
        clearTimeout(connectionTimeout);
        settled = true;
        stats.errors++;
        rejectClient(new Error('socket_closed_before_ready'));
      } else if (!expectedClose && client.authenticated) {
        stats.errors++;
      }
      for (const pending of client.pending.values()) clearTimeout(pending.timeout);
      client.pending.clear();
    });
  });
}

function closeClient(client: LoadClient): void {
  client.closed = true;
  if (client.nextCommandTimer) clearTimeout(client.nextCommandTimer);
  for (const pending of client.pending.values()) clearTimeout(pending.timeout);
  client.pending.clear();
  if (client.socket.readyState === WebSocket.OPEN || client.socket.readyState === WebSocket.CONNECTING) {
    client.socket.close(1000, 'Load tier complete');
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function rampToTier(
  clients: LoadClient[],
  tier: number,
  credentials: AuthPayload[],
  wsUrl: string,
  command: 'GET_ROOMS' | 'PING',
  intervalMs: number,
  rampPerSecond: number,
  stats: LoadStats,
): Promise<void> {
  if (tier > credentials.length && command === 'GET_ROOMS') {
    throw new Error(`Tier ${tier} exceeds available unique credentials (${credentials.length})`);
  }
  const batchSize = Math.max(1, Math.ceil(rampPerSecond / 2));
  while (clients.length < tier) {
    const count = Math.min(batchSize, tier - clients.length);
    const additions = Array.from({ length: count }, (_, index) => {
      const credential = command === 'GET_ROOMS' ? credentials[clients.length + index] : undefined;
      return makeClient(wsUrl, credential, command, intervalMs, stats);
    });
    const connected = await Promise.allSettled(additions);
    for (const result of connected) {
      if (result.status === 'fulfilled') clients.push(result.value);
    }
    if (connected.some((result) => result.status === 'rejected')) {
      throw new Error('One or more load clients could not connect/authenticate');
    }
    if (clients.length < tier) await delay(500);
  }
}

async function runTier(
  tier: number,
  clients: LoadClient[],
  command: 'GET_ROOMS' | 'PING',
  soakMs: number,
  stats: LoadStats,
  metricsUrl: string,
  authenticated: boolean,
  selfTest: boolean,
): Promise<TierResult> {
  const latencyStart = stats.latenciesMs.length;
  const responseStart = stats.commandResponses;
  const errorsStart = stats.errors;
  const timeoutsStart = stats.timeouts;
  const cpuSamples: number[] = [];
  const memorySamples: number[] = [];
  const deadline = Date.now() + soakMs;

  while (Date.now() < deadline) {
    const metrics = await fetchMetrics(metricsUrl);
    const cpu = metricCpuPercent(metrics);
    const memory = metricMemoryPercent(metrics);
    if (cpu !== null) cpuSamples.push(cpu);
    if (memory !== null) memorySamples.push(memory);
    const remaining = deadline - Date.now();
    if (remaining > 0) await delay(Math.min(METRICS_POLL_MS, remaining));
  }

  const latencies = stats.latenciesMs.slice(latencyStart);
  const p95Ms = percentile(latencies, 95);
  const maxCpuPercent = cpuSamples.length ? Number(Math.max(...cpuSamples).toFixed(2)) : null;
  const maxMemoryPercent = memorySamples.length ? Number(Math.max(...memorySamples).toFixed(2)) : null;
  const errors = stats.errors - errorsStart;
  const timeouts = stats.timeouts - timeoutsStart;
  const capacityEligible = !selfTest && authenticated && command === 'GET_ROOMS' && p95Ms !== null && maxCpuPercent !== null && maxMemoryPercent !== null;
  const passed = selfTest
    ? stats.commandResponses - responseStart > 0 && errors === 0
    : capacityEligible && p95Ms < 500 && maxCpuPercent <= 80 && maxMemoryPercent <= 80 && errors === 0;

  return {
    clients: tier,
    command,
    authenticated,
    responses: stats.commandResponses - responseStart,
    errors,
    timeouts,
    p50Ms: percentile(latencies, 50),
    p95Ms,
    p99Ms: percentile(latencies, 99),
    maxCpuPercent,
    maxMemoryPercent,
    passed,
    capacityEligible,
  };
}

async function createSelfTestTarget(): Promise<{ server: HttpServer; wss: WebSocketServer; wsUrl: string; metricsUrl: string }> {
  const server = createServer((request, response) => {
    if (request.url === '/api/metrics') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ system: {
        cpu: { processPercent: 1, hostPercent: 1, availableParallelism: availableParallelism() },
        memory: { rssPercentOfCapacity: 1, rssMb: 1, capacityMb: totalmem() / (1024 * 1024) },
      } }));
      return;
    }
    response.writeHead(404).end();
  });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024, perMessageDeflate: false });
  wss.on('connection', (socket) => {
    let authenticated = false;
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as { type: string; requestId?: string };
      if (message.type === 'AUTH') {
        authenticated = true;
        socket.send(JSON.stringify({ type: 'AUTH_OK', requestId: message.requestId, payload: { telegramId: 1, user: {} } }));
      } else if (message.type === 'GET_ROOMS' && authenticated) {
        socket.send(JSON.stringify({ type: 'ROOMS_LIST', requestId: message.requestId, payload: { rooms: [] } }));
      } else if (message.type === 'PING') {
        socket.send(JSON.stringify({ type: 'PONG', requestId: message.requestId, payload: { timestamp: Date.now(), clientTimestamp: Date.now() } }));
      }
    });
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not start local harness self-test target');
  const origin = `http://127.0.0.1:${address.port}`;
  return { server, wss, wsUrl: `ws://127.0.0.1:${address.port}/ws`, metricsUrl: `${origin}/api/metrics` };
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes('--self-test');
  const tiers = selfTest ? [2, 5] : parseTiers(process.env.WS_LOAD_TIERS);
  const soakMs = selfTest ? 1_000 : parsePositiveInteger(process.env.WS_LOAD_SOAK_MS, 'WS_LOAD_SOAK_MS', 600_000);
  const intervalMs = parsePositiveInteger(process.env.WS_LOAD_COMMAND_INTERVAL_MS, 'WS_LOAD_COMMAND_INTERVAL_MS', 1_000);
  const rampPerSecond = parsePositiveInteger(process.env.WS_LOAD_RAMP_PER_SECOND, 'WS_LOAD_RAMP_PER_SECOND', 10);
  const credentials = selfTest
    ? Array.from({ length: Math.max(...tiers) }, (_, index) => ({ telegramId: index + 1, playerName: `Load user ${index + 1}`, initData: 'self-test' }))
    : await readCredentials(process.env.WS_LOAD_CREDENTIALS_FILE);
  const command: 'GET_ROOMS' | 'PING' = credentials.length > 0 ? 'GET_ROOMS' : 'PING';
  const authenticated = command === 'GET_ROOMS';

  let target: Awaited<ReturnType<typeof createSelfTestTarget>> | null = null;
  let wsUrl = process.env.WS_LOAD_URL;
  let statsUrl = process.env.WS_LOAD_METRICS_URL;
  if (selfTest) {
    target = await createSelfTestTarget();
    wsUrl = target.wsUrl;
    statsUrl = target.metricsUrl;
  }
  if (!wsUrl) throw new Error('Set WS_LOAD_URL to a production-equivalent WebSocket endpoint, or pass --self-test');
  statsUrl ||= metricsEndpoint(wsUrl);
  const printableTarget = new URL(wsUrl);
  printableTarget.search = '';
  printableTarget.hash = '';
  console.log(JSON.stringify({ event: 'load.start', target: `${printableTarget.origin}${printableTarget.pathname}`, tiers, soakMs, command, authenticated, selfTest }));

  const clients: LoadClient[] = [];
  const stats: LoadStats = { latenciesMs: [], errors: 0, timeouts: 0, commandResponses: 0 };
  let failedTier = false;
  try {
    for (const tier of tiers) {
      await rampToTier(clients, tier, credentials, wsUrl, command, intervalMs, rampPerSecond, stats);
      const result = await runTier(tier, clients, command, soakMs, stats, statsUrl, authenticated, selfTest);
      console.log(JSON.stringify({ event: 'load.tier.complete', ...result }));
      if (!result.passed) {
        failedTier = true;
        if (!result.capacityEligible) {
          console.log(JSON.stringify({ event: 'load.capacity.ineligible', reason: 'Need authenticated GET_ROOMS traffic and server CPU/memory metrics for a capacity result.' }));
        }
        break;
      }
      if (selfTest) {
        console.log(JSON.stringify({ event: 'load.capacity.ineligible', reason: 'Self-test uses a local protocol fixture, not the application server.' }));
        break;
      }
    }
  } finally {
    for (const client of clients) closeClient(client);
    if (target) {
      await new Promise<void>((resolveClose) => target!.wss.close(() => target!.server.close(() => resolveClose())));
    }
  }
  if (selfTest) console.log(JSON.stringify({ event: 'load.self_test.completed', note: 'Harness protocol smoke only; not a product capacity measurement.' }));
  if (failedTier) process.exitCode = 1;
}

const directInvocation = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (directInvocation) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error(JSON.stringify({ event: 'load.failed', message }));
    process.exitCode = 1;
  });
}
