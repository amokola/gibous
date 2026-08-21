import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import { PlayerRole } from '../shared';

export interface PlayerConnection {
  telegramId: number;
  ws: WebSocket;
  connectionId: string;
  connectedAt: number;
  lastSeen: number;
  state: 'connected' | 'closing';

  // Dual-tier sliding window counters
  transportMsgCount: number;
  transportWindowStart: number;
  actionMsgCount: number;
  actionWindowStart: number;
}

export class ConnectionManager {
  private static instance: ConnectionManager;

  private connections: Map<number, PlayerConnection> = new Map();
  private socketToTgId: Map<WebSocket, number> = new Map();

  private readonly MAX_TRANSPORT_MSGS_PER_SEC = 30;
  private readonly MAX_GAME_ACTIONS_PER_SEC = 5;
  private readonly STALE_CONNECTION_TIMEOUT_MS = 60000; // 60s timeout

  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    // Run stale connection sweep every 15 seconds
    this.cleanupTimer = setInterval(() => this.cleanupStaleConnections(), 15000);
  }

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  registerConnection(telegramId: number, ws: WebSocket): string {
    const existing = this.connections.get(telegramId);
    if (existing && existing.ws !== ws) {
      existing.state = 'closing';
      this.socketToTgId.delete(existing.ws);
      try {
        existing.ws.close(4001, 'Replaced by new connection');
      } catch {
        // Ignore close error
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
      state: 'connected',
      transportMsgCount: 0,
      transportWindowStart: now,
      actionMsgCount: 0,
      actionWindowStart: now,
    };

    this.connections.set(telegramId, conn);
    this.socketToTgId.set(ws, telegramId);

    return connectionId;
  }

  removeConnection(ws: WebSocket, connectionId?: string): PlayerConnection | undefined {
    const tgId = this.socketToTgId.get(ws);
    if (tgId !== undefined) {
      const conn = this.connections.get(tgId);
      if (conn && conn.ws === ws) {
        if (!connectionId || conn.connectionId === connectionId) {
          conn.state = 'closing';
          this.socketToTgId.delete(ws);
          this.connections.delete(tgId);
          return conn;
        }
      }
    }
    return undefined;
  }

  touchConnection(ws: WebSocket): boolean {
    const tgId = this.socketToTgId.get(ws);
    if (tgId === undefined) return false;

    const conn = this.connections.get(tgId);
    if (!conn || conn.ws !== ws || conn.state === 'closing') {
      return false;
    }

    conn.lastSeen = Date.now();
    return true;
  }

  cleanupStaleConnections(): void {
    const now = Date.now();
    for (const [tgId, conn] of this.connections.entries()) {
      if (now - conn.lastSeen > this.STALE_CONNECTION_TIMEOUT_MS) {
        console.warn(`⚠️ Terminating stale connection for Telegram ID: ${tgId} (inactive for ${Math.round((now - conn.lastSeen) / 1000)}s)`);
        conn.state = 'closing';
        this.socketToTgId.delete(conn.ws);
        this.connections.delete(tgId);
        try {
          conn.ws.terminate();
        } catch {
          // Ignore
        }
      }
    }
  }

  checkTransportRateLimit(ws: WebSocket): boolean {
    const tgId = this.socketToTgId.get(ws);
    if (tgId === undefined) return true;

    const conn = this.connections.get(tgId);
    if (!conn) return true;

    const now = Date.now();
    if (now - conn.transportWindowStart > 1000) {
      conn.transportWindowStart = now;
      conn.transportMsgCount = 1;
      return true;
    }

    conn.transportMsgCount++;
    if (conn.transportMsgCount > this.MAX_TRANSPORT_MSGS_PER_SEC) {
      console.warn(`⚠️ Transport rate limit exceeded for TgID: ${tgId} (${conn.transportMsgCount} msgs/sec)`);
      return false;
    }

    return true;
  }

  checkActionRateLimit(ws: WebSocket): boolean {
    const tgId = this.socketToTgId.get(ws);
    if (tgId === undefined) return true;

    const conn = this.connections.get(tgId);
    if (!conn) return true;

    const now = Date.now();
    if (now - conn.actionWindowStart > 1000) {
      conn.actionWindowStart = now;
      conn.actionMsgCount = 1;
      return true;
    }

    conn.actionMsgCount++;
    if (conn.actionMsgCount > this.MAX_GAME_ACTIONS_PER_SEC) {
      console.warn(`⚠️ Gameplay action rate limit exceeded for TgID: ${tgId} (${conn.actionMsgCount} actions/sec)`);
      return false;
    }

    return true;
  }

  getConnectionByTgId(telegramId: number): PlayerConnection | undefined {
    return this.connections.get(telegramId);
  }

  getTgIdBySocket(ws: WebSocket): number | undefined {
    return this.socketToTgId.get(ws);
  }

  sendToPlayer(telegramId: number, message: object): boolean {
    const conn = this.connections.get(telegramId);
    if (conn && conn.state === 'connected' && conn.ws.readyState === WebSocket.OPEN) {
      try {
        conn.ws.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error(`Failed to send message to Telegram ID ${telegramId}:`, err);
        return false;
      }
    }
    return false;
  }

  getPlayerByRole<T extends { p1: { telegramId: number } | null; p2: { telegramId: number } | null }>(
    room: T,
    role: PlayerRole
  ): { telegramId: number } | null {
    return role === 'p1' ? room.p1 : room.p2;
  }

  sendToRole(
    room: { p1: { telegramId: number } | null; p2: { telegramId: number } | null },
    role: PlayerRole,
    message: object
  ): boolean {
    const player = this.getPlayerByRole(room, role);
    if (player && player.telegramId) {
      return this.sendToPlayer(player.telegramId, message);
    }
    return false;
  }

  broadcast(
    room: { p1: { telegramId: number } | null; p2: { telegramId: number } | null },
    message: object,
    excludeTelegramId?: number
  ): void {
    if (room.p1?.telegramId && room.p1.telegramId !== excludeTelegramId) {
      this.sendToPlayer(room.p1.telegramId, message);
    }

    if (room.p2?.telegramId && room.p2.telegramId !== excludeTelegramId) {
      this.sendToPlayer(room.p2.telegramId, message);
    }
  }
}

export const connectionManager = ConnectionManager.getInstance();
