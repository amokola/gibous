import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';

export interface AuthenticatedSession {
  connectionId: string;
  telegramId: number;
  name: string;
  avatarUrl?: string;
  authenticatedAt: number;
  lastClientPingAt: number;
}

export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<WebSocket, AuthenticatedSession> = new Map();
  private connectionIdToSocket: Map<string, WebSocket> = new Map();

  private constructor() {}

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  register(
    ws: WebSocket,
    telegramId: number,
    name: string,
    avatarUrl?: string,
    connectionId?: string
  ): AuthenticatedSession {
    const existing = this.sessions.get(ws);
    if (existing) {
      if (existing.telegramId === telegramId && (!connectionId || existing.connectionId === connectionId)) {
        return existing;
      }
      this.connectionIdToSocket.delete(existing.connectionId);
    }

    const assignedConnectionId = connectionId || randomUUID();
    const now = Date.now();
    const session: AuthenticatedSession = {
      connectionId: assignedConnectionId,
      telegramId,
      name,
      avatarUrl,
      authenticatedAt: now,
      lastClientPingAt: now,
    };

    this.sessions.set(ws, session);
    this.connectionIdToSocket.set(assignedConnectionId, ws);
    return session;
  }

  getSession(ws: WebSocket): AuthenticatedSession | undefined {
    return this.sessions.get(ws);
  }

  getSessionByConnectionId(connectionId: string): AuthenticatedSession | undefined {
    const ws = this.connectionIdToSocket.get(connectionId);
    return ws ? this.sessions.get(ws) : undefined;
  }

  updateClientPing(ws: WebSocket): boolean {
    const session = this.sessions.get(ws);
    if (session) {
      session.lastClientPingAt = Date.now();
      return true;
    }
    return false;
  }

  updatePing(ws: WebSocket): boolean {
    return this.updateClientPing(ws);
  }

  attachRoom(_ws: WebSocket, _roomCode: string, _playerRole?: any): void {
    // Room membership is authoritatively owned by RoomManager
  }

  detachRoom(_ws: WebSocket): void {
    // Room membership is authoritatively owned by RoomManager
  }

  remove(ws: WebSocket, connectionId?: string): AuthenticatedSession | undefined {
    const session = this.sessions.get(ws);
    if (!session) return undefined;

    if (connectionId && session.connectionId !== connectionId) {
      // Stale close event from a previous connection generation
      return undefined;
    }

    this.sessions.delete(ws);
    this.connectionIdToSocket.delete(session.connectionId);
    return session;
  }

  revokeByConnectionId(connectionId: string, reason = 'Session revoked'): boolean {
    const ws = this.connectionIdToSocket.get(connectionId);
    if (!ws) return false;

    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    this.connectionIdToSocket.delete(connectionId);

    try {
      ws.close(4001, reason);
    } catch {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
    }

    return Boolean(session);
  }

  revokeByTelegramId(telegramId: number, reason = 'Session revoked'): number {
    let count = 0;
    for (const [ws, session] of Array.from(this.sessions.entries())) {
      if (session.telegramId === telegramId) {
        this.sessions.delete(ws);
        this.connectionIdToSocket.delete(session.connectionId);
        try {
          ws.close(4001, reason);
        } catch {
          try {
            ws.terminate();
          } catch {
            // ignore
          }
        }
        count++;
      }
    }
    return count;
  }
}

export const sessionManager = SessionManager.getInstance();
