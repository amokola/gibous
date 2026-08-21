import { WebSocket } from 'ws';
import { PlayerRole } from '../shared/types/game';

export interface AuthenticatedSession {
  telegramId: number;
  name: string;
  avatarUrl?: string;
  roomCode?: string;
  playerRole?: PlayerRole;
  lastPingAt: number;
  isAuthenticated: boolean;
}

export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<WebSocket, AuthenticatedSession> = new Map();

  private constructor() {}

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  register(ws: WebSocket, telegramId: number, name: string, avatarUrl?: string): AuthenticatedSession {
    const session: AuthenticatedSession = {
      telegramId,
      name,
      avatarUrl,
      lastPingAt: Date.now(),
      isAuthenticated: true,
    };
    this.sessions.set(ws, session);
    return session;
  }

  getSession(ws: WebSocket): AuthenticatedSession | undefined {
    return this.sessions.get(ws);
  }

  attachRoom(ws: WebSocket, roomCode: string, playerRole: PlayerRole) {
    const session = this.sessions.get(ws);
    if (session) {
      session.roomCode = roomCode;
      session.playerRole = playerRole;
    }
  }

  detachRoom(ws: WebSocket) {
    const session = this.sessions.get(ws);
    if (session) {
      session.roomCode = undefined;
      session.playerRole = undefined;
    }
  }

  updatePing(ws: WebSocket) {
    const session = this.sessions.get(ws);
    if (session) {
      session.lastPingAt = Date.now();
    }
  }

  remove(ws: WebSocket): AuthenticatedSession | undefined {
    const session = this.sessions.get(ws);
    this.sessions.delete(ws);
    return session;
  }
}

export const sessionManager = SessionManager.getInstance();
