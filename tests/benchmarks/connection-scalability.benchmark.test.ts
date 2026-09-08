import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { ConnectionManager } from '../../server/connectionManager';
import { RoomManager, GameRoom } from '../../server/roomManager';

describe('Benchmark: Connection Scalability & Broadcast Latency', () => {
  let connectionManager: ConnectionManager;
  let roomManager: RoomManager;

  beforeEach(() => {
    connectionManager = ConnectionManager.getInstance();
    roomManager = new RoomManager();
  });

  const createMockSocket = (readyState = WebSocket.OPEN) => ({
    readyState,
    send: vi.fn(),
    close: vi.fn(),
    terminate: vi.fn(),
    bufferedAmount: 0,
  } as unknown as WebSocket);

  it('measures connection registration & throughput at 100, 1,000, and 5,000 connections', () => {
    const counts = [100, 1000, 5000];
    const results: Record<number, { durationMs: number; opsPerSec: number }> = {};

    for (const count of counts) {
      const cm = ConnectionManager.getInstance();
      const offset = count * 100000;
      const start = performance.now();
      for (let i = 1; i <= count; i++) {
        const ws = createMockSocket();
        cm.registerConnection(offset + i, ws);
      }
      const durationMs = performance.now() - start;
      const opsPerSec = Math.round((count / durationMs) * 1000);
      results[count] = { durationMs, opsPerSec };

      expect(cm.getConnectionCount()).toBeGreaterThanOrEqual(count);
      // Ensure registration of 5,000 connections completes within reasonable test environment threshold (< 1000ms)
      expect(durationMs).toBeLessThan(1000);
    }
  });

  it('measures room-scoped broadcast latency across 500 active 2-player rooms', () => {
    const totalRooms = 500;
    const rooms: GameRoom[] = [];

    for (let i = 1; i <= totalRooms; i++) {
      const ws1 = createMockSocket();
      const ws2 = createMockSocket();
      const p1TgId = 100000 + i * 2 - 1;
      const p2TgId = 100000 + i * 2;

      connectionManager.registerConnection(p1TgId, ws1);
      connectionManager.registerConnection(p2TgId, ws2);

      const room: GameRoom = {
        code: `BENCH_${i}`,
        gameType: 'snake',
        stakeAmount: 100,
        potAmount: 200,
        status: 'playing',
        winner: null,
        version: 1,
        p1: { id: 'p1', telegramId: p1TgId, name: `P1_${i}`, isReady: true, isConnected: true },
        p2: { id: 'p2', telegramId: p2TgId, name: `P2_${i}`, isReady: true, isConnected: true },
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        engine: {} as any,
        actionCache: new Map(),
        rematchVotes: new Set(),
      };
      rooms.push(room);
    }

    const start = performance.now();
    for (const room of rooms) {
      connectionManager.broadcast(room, {
        type: 'GAME_STATE_UPDATE',
        payload: { roomCode: room.code, version: 2 },
      });
    }
    const durationMs = performance.now() - start;
    const latenciesPerBroadcastMs = durationMs / totalRooms;

    // 500 targeted 2-player room broadcasts should complete in under 100ms (< 0.2ms per broadcast)
    expect(durationMs).toBeLessThan(100);
    expect(latenciesPerBroadcastMs).toBeLessThan(0.2);
  });
});
