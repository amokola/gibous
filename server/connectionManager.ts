import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { logEvent } from './observability';

export type DisconnectReason =
  | 'client_close'
  | 'stale_heartbeat'
  | 'stale_inactivity'
  | 'replaced'
  | 'buffer_overflow'
  | 'rate_limited'
  | 'server_shutdown';

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillRatePerSecond: number
  ) {
    this.tokens = capacity;
    this.lastRefill = performance.now();
  }

  tryConsume(tokens = 1): boolean {
    const now = performance.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillRatePerSecond);
    this.lastRefill = now;

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }
}

export interface PlayerConnection {
  telegramId: number;
  ws: WebSocket;
  connectionId: string;
  connectedAt: number;
  lastSeen: number;
  isAlive: boolean;
  state: 'connected' | 'closing';
  ip?: string;

  // Token buckets using monotonic time
  transportBucket: TokenBucket;
  actionBucket: TokenBucket;
  emoteBucket: TokenBucket;
}

export interface ConnectionLifecycleListener {
  onConnected?: (conn: PlayerConnection) => void | Promise<void>;
  onReplaced?: (previous: PlayerConnection, current: PlayerConnection) => void | Promise<void>;
  onDisconnected?: (conn: PlayerConnection, reason: DisconnectReason) => void | Promise<void>;
}

export interface BroadcastResult {
  delivered: number[];
  failed: number[];
}

export class ConnectionManager {
  private static instance: ConnectionManager;

  private connections: Map<number, PlayerConnection> = new Map();
  private socketToTgId: Map<WebSocket, number> = new Map();
  private socketToIp: Map<WebSocket, string> = new Map();
  private ipConnections: Map<string, number> = new Map();
  private unauthenticatedRateBuckets: WeakMap<WebSocket, TokenBucket> = new WeakMap();

  private lifecycleListener?: ConnectionLifecycleListener;

  // Configurable thresholds
  private readonly MAX_CONNECTIONS_PER_IP = 30;
  private readonly MAX_TOTAL_CONNECTIONS = 10_000;
  private readonly MAX_PRE_AUTH_BURST = 10;
  private readonly MAX_BUFFERED_BYTES = 1024 * 1024;
  private readonly STALE_CONNECTION_TIMEOUT_MS = 60_000;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private staleCheckTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    // Run heartbeat ping sweep every 30 seconds
    this.heartbeatTimer = setInterval(() => this.sweepHeartbeats(), 30_000);
    // Run stale connection sweep every 15 seconds
    this.staleCheckTimer = setInterval(() => this.cleanupStaleConnections(), 15_000);

    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      if (this.heartbeatTimer && typeof this.heartbeatTimer === 'object' && 'unref' in this.heartbeatTimer) {
        (this.heartbeatTimer as any).unref();
      }
      if (this.staleCheckTimer && typeof this.staleCheckTimer === 'object' && 'unref' in this.staleCheckTimer) {
        (this.staleCheckTimer as any).unref();
      }
    }
  }

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  setLifecycleListener(listener: ConnectionLifecycleListener): void {
    this.lifecycleListener = listener;
  }

  canAcceptConnection(ip?: string): boolean {
    if (this.socketToIp.size >= this.MAX_TOTAL_CONNECTIONS) {
      return false;
    }
    if (ip) {
      const current = this.ipConnections.get(ip) || 0;
      if (current >= this.MAX_CONNECTIONS_PER_IP) {
        return false;
      }
    }
    return true;
  }

  trackSocketIp(ws: WebSocket, ip?: string): boolean {
    if (!this.canAcceptConnection(ip)) {
      return false;
    }
    if (ip) {
      this.socketToIp.set(ws, ip);
      const count = this.ipConnections.get(ip) || 0;
      this.ipConnections.set(ip, count + 1);
    }
    return true;
  }

  private releaseSocketIp(ws: WebSocket): void {
    const ip = this.socketToIp.get(ws);
    if (ip) {
      this.socketToIp.delete(ws);
      const count = this.ipConnections.get(ip) || 1;
      if (count <= 1) {
        this.ipConnections.delete(ip);
      } else {
        this.ipConnections.set(ip, count - 1);
      }
    }
  }

  registerConnection(telegramId: number, ws: WebSocket, ip?: string): string {
    const existing = this.connections.get(telegramId);
    if (existing && existing.ws === ws) {
      existing.lastSeen = Date.now();
      existing.isAlive = true;
      return existing.connectionId;
    }

    if (existing && existing.ws !== ws) {
      existing.state = 'closing';
      this.socketToTgId.delete(existing.ws);
      this.releaseSocketIp(existing.ws);

      logEvent('info', 'ws.connection.replaced', {
        actorId: telegramId,
        previousConnectionId: existing.connectionId,
      });

      try {
        existing.ws.close(4001, 'Replaced by new connection');
      } catch {
        // ignore
      }

      try {
        this.lifecycleListener?.onReplaced?.(existing, existing);
      } catch (err) {
        console.error('Error in onReplaced listener:', err);
      }
    }

    const connectionId = randomUUID();
    const now = Date.now();
    const conn: PlayerConnection = {
      telegramId,
      ws,
      connectionId,
      connectedAt: now,
      lastSeen: now,
      isAlive: true,
      state: 'connected',
      ip,
      transportBucket: new TokenBucket(30, 30),
      actionBucket: new TokenBucket(5, 5),
      emoteBucket: new TokenBucket(2, 2),
    };

    if (ip) {
      this.trackSocketIp(ws, ip);
    }

    this.connections.set(telegramId, conn);
    this.socketToTgId.set(ws, telegramId);
    this.unauthenticatedRateBuckets.delete(ws);

    try {
      this.lifecycleListener?.onConnected?.(conn);
    } catch (err) {
      console.error('Error in onConnected listener:', err);
    }

    return connectionId;
  }

  removeConnection(ws: WebSocket, connectionId?: string, reason: DisconnectReason = 'client_close'): PlayerConnection | undefined {
    const tgId = this.socketToTgId.get(ws);
    if (tgId !== undefined) {
      const conn = this.connections.get(tgId);
      if (conn && conn.ws === ws) {
        if (!connectionId || conn.connectionId === connectionId) {
          this.removeConnectionInternal(conn, reason);
          return conn;
        }
      }
    }
    this.socketToTgId.delete(ws);
    this.releaseSocketIp(ws);
    return undefined;
  }

  private removeConnectionInternal(conn: PlayerConnection, reason: DisconnectReason): void {
    conn.state = 'closing';
    this.socketToTgId.delete(conn.ws);
    this.connections.delete(conn.telegramId);
    this.releaseSocketIp(conn.ws);

    try {
      this.lifecycleListener?.onDisconnected?.(conn, reason);
    } catch (err) {
      console.error('Error in onDisconnected listener:', err);
    }
  }

  getConnection(telegramId: number): PlayerConnection | undefined {
    return this.connections.get(telegramId);
  }

  touchConnection(ws: WebSocket): boolean {
    const tgId = this.socketToTgId.get(ws);
    if (tgId === undefined) return false;

    const conn = this.connections.get(tgId);
    if (!conn || conn.ws !== ws || conn.state === 'closing') {
      return false;
    }

    conn.lastSeen = Date.now();
    conn.isAlive = true;
    return true;
  }

  markHeartbeatAlive(ws: WebSocket): void {
    const tgId = this.socketToTgId.get(ws);
    if (tgId !== undefined) {
      const conn = this.connections.get(tgId);
      if (conn && conn.ws === ws) {
        conn.isAlive = true;
      }
    }
  }

  sweepHeartbeats(): void {
    for (const [tgId, conn] of Array.from(this.connections.entries())) {
      if (conn.state === 'closing') continue;

      if (!conn.isAlive) {
        logEvent('warn', 'ws.heartbeat.timeout', { actorId: tgId });
        this.removeConnectionInternal(conn, 'stale_heartbeat');
        try {
          conn.ws.terminate();
        } catch {
          // ignore
        }
        continue;
      }

      conn.isAlive = false;
      try {
        conn.ws.ping();
      } catch {
        this.removeConnectionInternal(conn, 'stale_heartbeat');
        try {
          conn.ws.terminate();
        } catch {
          // ignore
        }
      }
    }
  }

  cleanupStaleConnections(): void {
    const now = Date.now();
    for (const [tgId, conn] of Array.from(this.connections.entries())) {
      if (conn.state === 'closing') continue;

      if (now - conn.lastSeen > this.STALE_CONNECTION_TIMEOUT_MS) {
        logEvent('warn', 'ws.stale.inactivity', { actorId: tgId });
        this.removeConnectionInternal(conn, 'stale_inactivity');
        try {
          conn.ws.terminate();
        } catch {
          // ignore
        }
      }
    }
  }

  closeAll(reason: DisconnectReason = 'server_shutdown', code = 1001): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.staleCheckTimer) {
      clearInterval(this.staleCheckTimer);
      this.staleCheckTimer = null;
    }

    const conns = Array.from(this.connections.values());
    for (const conn of conns) {
      conn.state = 'closing';
      this.removeConnectionInternal(conn, reason);
      try {
        conn.ws.close(code, 'Server shutting down');
      } catch {
        try {
          conn.ws.terminate();
        } catch {
          // ignore
        }
      }
    }

    this.connections.clear();
    this.socketToTgId.clear();
    this.socketToIp.clear();
    this.ipConnections.clear();
  }

  checkTransportRateLimit(ws: WebSocket): boolean {
    const tgId = this.socketToTgId.get(ws);
    if (tgId === undefined) {
      let bucket = this.unauthenticatedRateBuckets.get(ws);
      if (!bucket) {
        bucket = new TokenBucket(this.MAX_PRE_AUTH_BURST, 10);
        this.unauthenticatedRateBuckets.set(ws, bucket);
      }
      return bucket.tryConsume(1);
    }

    const conn = this.connections.get(tgId);
    if (!conn) return true;

    const allowed = conn.transportBucket.tryConsume(1);
    if (!allowed) {
      logEvent('warn', 'ws.rate_limited', { actorId: tgId, category: 'transport' });
    }
    return allowed;
  }

  checkActionRateLimit(ws: WebSocket): boolean {
    const tgId = this.socketToTgId.get(ws);
    if (tgId === undefined) return true;

    const conn = this.connections.get(tgId);
    if (!conn) return true;

    const allowed = conn.actionBucket.tryConsume(1);
    if (!allowed) {
      logEvent('warn', 'ws.rate_limited', { actorId: tgId, category: 'game_action' });
    }
    return allowed;
  }

  checkEmoteRateLimit(ws: WebSocket): boolean {
    const tgId = this.socketToTgId.get(ws);
    if (tgId === undefined) return true;

    const conn = this.connections.get(tgId);
    if (!conn) return true;

    const allowed = conn.emoteBucket.tryConsume(1);
    if (!allowed) {
      logEvent('warn', 'ws.rate_limited', { actorId: tgId, category: 'emote' });
    }
    return allowed;
  }

  getConnectionByTgId(telegramId: number): PlayerConnection | undefined {
    return this.connections.get(telegramId);
  }

  getConnectionBySocket(ws: WebSocket): PlayerConnection | undefined {
    const tgId = this.socketToTgId.get(ws);
    return tgId !== undefined ? this.connections.get(tgId) : undefined;
  }

  getConnectionId(ws: WebSocket): string | undefined {
    return this.getConnectionBySocket(ws)?.connectionId;
  }

  getTgIdBySocket(ws: WebSocket): number | undefined {
    return this.socketToTgId.get(ws);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  sendToPlayer(telegramId: number, message: object): boolean {
    const conn = this.connections.get(telegramId);
    if (conn && conn.state === 'connected' && conn.ws.readyState === WebSocket.OPEN) {
      try {
        if (typeof conn.ws.bufferedAmount === 'number' && conn.ws.bufferedAmount > this.MAX_BUFFERED_BYTES) {
          logEvent('warn', 'ws.buffer_overflow', { actorId: telegramId });
          this.removeConnectionInternal(conn, 'buffer_overflow');
          try {
            conn.ws.close(1008, 'Buffer overflow');
          } catch {
            conn.ws.terminate();
          }
          return false;
        }
        conn.ws.send(JSON.stringify(message));
        return true;
      } catch (err) {
        logEvent('error', 'ws.send_failed', {
          actorId: telegramId,
          error: err instanceof Error ? err.message : String(err),
        });
        return false;
      }
    }
    return false;
  }

  sendToUser(telegramId: number, message: object): boolean {
    return this.sendToPlayer(telegramId, message);
  }

  broadcast(
    room: { p1: { telegramId: number } | null; p2: { telegramId: number } | null },
    message: object,
    excludeTelegramId?: number
  ): BroadcastResult {
    const result: BroadcastResult = { delivered: [], failed: [] };

    if (room.p1?.telegramId && room.p1.telegramId !== excludeTelegramId) {
      const ok = this.sendToPlayer(room.p1.telegramId, message);
      if (ok) result.delivered.push(room.p1.telegramId);
      else result.failed.push(room.p1.telegramId);
    }

    if (room.p2?.telegramId && room.p2.telegramId !== excludeTelegramId) {
      const ok = this.sendToPlayer(room.p2.telegramId, message);
      if (ok) result.delivered.push(room.p2.telegramId);
      else result.failed.push(room.p2.telegramId);
    }

    return result;
  }
}

export const connectionManager = ConnectionManager.getInstance();
