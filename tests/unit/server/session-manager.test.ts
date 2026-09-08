import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionManager } from '../../../server/sessionManager';
import { WebSocket } from 'ws';

describe('SessionManager Unit Tests', () => {
  let sm: SessionManager;

  beforeEach(() => {
    sm = SessionManager.getInstance();
  });

  const createMockSocket = (): WebSocket => {
    return {
      close: vi.fn(),
      terminate: vi.fn(),
    } as unknown as WebSocket;
  };

  it('should register and retrieve an authenticated session with connectionId', () => {
    const ws = createMockSocket();
    const connId = 'conn-uuid-123';
    const session = sm.register(ws, 12345, 'Alice', 'https://example.com/avatar.png', connId);

    expect(session.telegramId).toBe(12345);
    expect(session.name).toBe('Alice');
    expect(session.connectionId).toBe(connId);
    expect(session.authenticatedAt).toBeDefined();

    const retrieved = sm.getSession(ws);
    expect(retrieved).toBe(session);

    const byConnId = sm.getSessionByConnectionId(connId);
    expect(byConnId).toBe(session);
  });

  it('should update client ping timestamp and return true', () => {
    const ws = createMockSocket();
    sm.register(ws, 23456, 'Bob', undefined, 'conn-uuid-456');

    const before = sm.getSession(ws)!.lastClientPingAt;
    const ok = sm.updateClientPing(ws);
    expect(ok).toBe(true);
    expect(sm.getSession(ws)!.lastClientPingAt).toBeGreaterThanOrEqual(before);
  });

  it('should remove session only if connectionId matches (generation safety)', () => {
    const ws = createMockSocket();
    sm.register(ws, 34567, 'Charlie', undefined, 'conn-uuid-new');

    // Attempt removal with an old connectionId -> should be rejected and not delete
    const staleRemove = sm.remove(ws, 'conn-uuid-old');
    expect(staleRemove).toBeUndefined();
    expect(sm.getSession(ws)).toBeDefined();

    // Removal with matching connectionId -> succeeds
    const validRemove = sm.remove(ws, 'conn-uuid-new');
    expect(validRemove?.telegramId).toBe(34567);
    expect(sm.getSession(ws)).toBeUndefined();
    expect(sm.getSessionByConnectionId('conn-uuid-new')).toBeUndefined();
  });

  it('should revoke session by connectionId and close socket', () => {
    const ws = createMockSocket();
    sm.register(ws, 45678, 'Dave', undefined, 'conn-uuid-revoke');

    const revoked = sm.revokeByConnectionId('conn-uuid-revoke', 'Banned');
    expect(revoked).toBe(true);
    expect(ws.close).toHaveBeenCalledWith(4001, 'Banned');
    expect(sm.getSession(ws)).toBeUndefined();
  });

  it('should revoke all sessions by telegramId', () => {
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();
    sm.register(ws1, 56789, 'Eve', undefined, 'conn-1');
    sm.register(ws2, 56789, 'Eve', undefined, 'conn-2');

    const count = sm.revokeByTelegramId(56789, 'Admin action');
    expect(count).toBe(2);
    expect(ws1.close).toHaveBeenCalledWith(4001, 'Admin action');
    expect(ws2.close).toHaveBeenCalledWith(4001, 'Admin action');
    expect(sm.getSession(ws1)).toBeUndefined();
    expect(sm.getSession(ws2)).toBeUndefined();
  });
});
