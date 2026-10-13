export interface WebSocketLimits {
  maxConnectionsPerIp: number;
  maxTotalConnections: number;
  preAuthBurst: number;
  preAuthRefillPerSecond: number;
  transportBurst: number;
  transportRefillPerSecond: number;
  actionBurst: number;
  actionRefillPerSecond: number;
  emoteBurst: number;
  emoteRefillPerSecond: number;
  maxBufferedBytes: number;
  maxQueuedMessages: number;
  maxQueuedBytes: number;
  authTimeoutMs: number;
}

const DEFAULTS: WebSocketLimits = {
  maxConnectionsPerIp: 30,
  maxTotalConnections: 1_000,
  preAuthBurst: 10,
  preAuthRefillPerSecond: 10,
  transportBurst: 30,
  transportRefillPerSecond: 30,
  actionBurst: 5,
  actionRefillPerSecond: 5,
  emoteBurst: 2,
  emoteRefillPerSecond: 2,
  maxBufferedBytes: 1024 * 1024,
  maxQueuedMessages: 100,
  maxQueuedBytes: 1024 * 1024,
  authTimeoutMs: 10_000,
};

const ENV_NAMES: Record<keyof WebSocketLimits, string> = {
  maxConnectionsPerIp: 'WS_MAX_CONNECTIONS_PER_IP',
  maxTotalConnections: 'WS_MAX_TOTAL_CONNECTIONS',
  preAuthBurst: 'WS_PRE_AUTH_BURST',
  preAuthRefillPerSecond: 'WS_PRE_AUTH_REFILL_PER_SECOND',
  transportBurst: 'WS_TRANSPORT_BURST',
  transportRefillPerSecond: 'WS_TRANSPORT_REFILL_PER_SECOND',
  actionBurst: 'WS_ACTION_BURST',
  actionRefillPerSecond: 'WS_ACTION_REFILL_PER_SECOND',
  emoteBurst: 'WS_EMOTE_BURST',
  emoteRefillPerSecond: 'WS_EMOTE_REFILL_PER_SECOND',
  maxBufferedBytes: 'WS_MAX_BUFFERED_BYTES',
  maxQueuedMessages: 'WS_MAX_QUEUED_MESSAGES',
  maxQueuedBytes: 'WS_MAX_QUEUED_BYTES',
  authTimeoutMs: 'WS_AUTH_TIMEOUT_MS',
};

export function readWebSocketLimits(env: NodeJS.ProcessEnv = process.env): WebSocketLimits {
  const limits = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS) as Array<keyof WebSocketLimits>) {
    const raw = env[ENV_NAMES[key]];
    if (raw === undefined || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`${ENV_NAMES[key]} must be a positive integer`);
    }
    limits[key] = value;
  }
  return limits;
}

export function getWebSocketProductionConfigErrors(env: NodeJS.ProcessEnv = process.env): string[] {
  const errors: string[] = [];
  const configuredCap = env.WS_MAX_TOTAL_CONNECTIONS?.trim();
  if (!configuredCap || !/^\d+$/.test(configuredCap) || Number(configuredCap) < 1) {
    errors.push('WS_MAX_TOTAL_CONNECTIONS (set from the production-equivalent load harness)');
  }
  return errors;
}

export function getTrustedProxyIps(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set((env.WS_TRUSTED_PROXY_IPS || '').split(',').map((ip) => ip.trim().toLowerCase()).filter(Boolean));
}
