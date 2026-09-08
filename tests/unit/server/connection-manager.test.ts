import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionManager, TokenBucket } from '../../../server/connectionManager';
import { WebSocket } from 'ws';

describe('ConnectionManager Unit Tests', () => {
  let cm: ConnectionManager;

  beforeEach(() => {
    cm = ConnectionManager.getInstance();
  });

  const createMockSocket = (bufferedAmount = 0): WebSocket => {
    return {
      readyState: WebSocket.OPEN,
      bufferedAmount,
      send: vi.fn(),
      close: vi.fn(),
      terminate: vi.fn(),
      ping: vi.fn(),
    } as unknown as WebSocket;
  };

  it('TokenBucket should consume tokens accurately and refill over time', async () => {
    const bucket = new TokenBucket(5, 10); // 5 capacity, 10 tokens/sec refill

    // Consume all 5
    for (let i = 0; i < 5; i++) {
      expect(bucket.tryConsume(1)).toBe(true);
    }
    // 6th fails
    expect(bucket.tryConsume(1)).toBe(false);

    // Wait 150ms -> refills ~1.5 tokens
    await new Promise((r) => setTimeout(r, 150));
    expect(bucket.tryConsume(1)).toBe(true);
  });

  it('should register a player connection and return a connectionId', () => {
    const ws = createMockSocket();
    const connId = cm.registerConnection(1001, ws);

    expect(connId).toBeDefined();
    expect(typeof connId).toBe('string');
    expect(cm.getTgIdBySocket(ws)).toBe(1001);
    expect(cm.getConnectionByTgId(1001)?.ws).toBe(ws);
  });

  it('should close old socket and notify onReplaced when a new connection replaces an existing one', () => {
    const onReplaced = vi.fn();
    cm.setLifecycleListener({ onReplaced });

    const ws1 = createMockSocket();
    const ws2 = createMockSocket();

    cm.registerConnection(1002, ws1);
    cm.registerConnection(1002, ws2);

    expect(ws1.close).toHaveBeenCalledWith(4001, 'Replaced by new connection');
    expect(cm.getConnectionByTgId(1002)?.ws).toBe(ws2);
    expect(onReplaced).toHaveBeenCalledTimes(1);
  });

  it('should remove connection cleanly and notify onDisconnected', () => {
    const onDisconnected = vi.fn();
    cm.setLifecycleListener({ onDisconnected });

    const ws = createMockSocket();
    cm.registerConnection(1003, ws);

    const removed = cm.removeConnection(ws, undefined, 'client_close');
    expect(removed?.telegramId).toBe(1003);
    expect(cm.getConnectionByTgId(1003)).toBeUndefined();
    expect(cm.getTgIdBySocket(ws)).toBeUndefined();
    expect(onDisconnected).toHaveBeenCalledWith(expect.objectContaining({ telegramId: 1003 }), 'client_close');
  });

  it('should enforce transport token-bucket rate limit (max 30 burst)', () => {
    const ws = createMockSocket();
    cm.registerConnection(1004, ws);

    // Send 30 messages in burst -> all allowed
    for (let i = 0; i < 30; i++) {
      expect(cm.checkTransportRateLimit(ws)).toBe(true);
    }

    // 31st message in burst -> rate limited
    expect(cm.checkTransportRateLimit(ws)).toBe(false);
  });

  it('should rate-limit unauthenticated sockets before identity registration', () => {
    const ws = createMockSocket();

    for (let i = 0; i < 10; i++) {
      expect(cm.checkTransportRateLimit(ws)).toBe(true);
    }

    expect(cm.checkTransportRateLimit(ws)).toBe(false);
  });

  it('should enforce gameplay action rate limit (max 5 burst)', () => {
    const ws = createMockSocket();
    cm.registerConnection(1005, ws);

    // Send 5 actions in burst -> allowed
    for (let i = 0; i < 5; i++) {
      expect(cm.checkActionRateLimit(ws)).toBe(true);
    }

    // 6th action in burst -> rate limited
    expect(cm.checkActionRateLimit(ws)).toBe(false);
  });

  it('should broadcast message to both room players and return delivery result', () => {
    const ws1 = createMockSocket();
    const ws2 = createMockSocket();
    cm.registerConnection(2001, ws1);
    cm.registerConnection(2002, ws2);

    const room = {
      p1: { telegramId: 2001 },
      p2: { telegramId: 2002 },
    };

    const result = cm.broadcast(room, { type: 'TEST_EVENT', payload: { test: true } });

    expect(ws1.send).toHaveBeenCalled();
    expect(ws2.send).toHaveBeenCalled();
    expect(result.delivered).toEqual([2001, 2002]);
    expect(result.failed).toEqual([]);
  });

  it('should update lastSeen when touchConnection is called and mark heartbeat alive', () => {
    const ws = createMockSocket();
    cm.registerConnection(3001, ws);

    const conn = cm.getConnectionByTgId(3001);
    expect(conn).toBeDefined();

    // Artificially simulate 50s ago
    conn!.lastSeen = Date.now() - 50000;
    conn!.isAlive = false;

    // Touching the connection refreshes lastSeen and isAlive
    const touched = cm.touchConnection(ws);
    expect(touched).toBe(true);
    expect(conn!.isAlive).toBe(true);
    expect(Date.now() - conn!.lastSeen).toBeLessThan(100);

    // Stale cleanup should not terminate the touched socket
    cm.cleanupStaleConnections();
    expect(ws.terminate).not.toHaveBeenCalled();
    expect(cm.getConnectionByTgId(3001)).toBeDefined();
  });

  it('should terminate connection during cleanup and trigger onDisconnected if not touched beyond stale timeout', () => {
    const onDisconnected = vi.fn();
    cm.setLifecycleListener({ onDisconnected });

    const ws = createMockSocket();
    cm.registerConnection(3002, ws);

    const conn = cm.getConnectionByTgId(3002);
    expect(conn).toBeDefined();

    // Artificially simulate 70s ago (beyond 60s timeout)
    conn!.lastSeen = Date.now() - 70000;

    cm.cleanupStaleConnections();
    expect(ws.terminate).toHaveBeenCalled();
    expect(cm.getConnectionByTgId(3002)).toBeUndefined();
    expect(onDisconnected).toHaveBeenCalledWith(expect.objectContaining({ telegramId: 3002 }), 'stale_inactivity');
  });

  it('should enforce IP connection admission limit', () => {
    const testIp = '192.168.1.100';
    const sockets: WebSocket[] = [];

    // Register 30 sockets from testIp (max limit)
    for (let i = 0; i < 30; i++) {
      const ws = createMockSocket();
      sockets.push(ws);
      expect(cm.trackSocketIp(ws, testIp)).toBe(true);
    }

    // 31st socket from same IP is rejected
    const excessWs = createMockSocket();
    expect(cm.trackSocketIp(excessWs, testIp)).toBe(false);
    expect(cm.canAcceptConnection(testIp)).toBe(false);

    // Clean up
    for (const ws of sockets) {
      cm.removeConnection(ws);
    }
  });

  it('should terminate socket on buffer overflow during send', () => {
    const onDisconnected = vi.fn();
    cm.setLifecycleListener({ onDisconnected });

    const wsOverflow = createMockSocket(2 * 1024 * 1024); // 2MB buffer > 1MB limit
    cm.registerConnection(4001, wsOverflow);

    const sent = cm.sendToPlayer(4001, { type: 'BIG_PAYLOAD' });
    expect(sent).toBe(false);
    expect(wsOverflow.close).toHaveBeenCalledWith(1008, 'Buffer overflow');
    expect(onDisconnected).toHaveBeenCalledWith(expect.objectContaining({ telegramId: 4001 }), 'buffer_overflow');
  });
});
