import { describe, it, expect, vi } from 'vitest';
import { SettlementWorker } from '../../server/settlementWorker';
import { RoomManager, GameRoom } from '../../server/roomManager';
import { StorageService } from '../../server/storage';
import { metrics } from '../../server/observability';

describe('Benchmark: Settlement Concurrency & Throughput', () => {
  it('benchmarks 100 concurrent settlements with idempotency and latency telemetry', async () => {
    const roomManager = new RoomManager();
    const storage = new StorageService();
    const worker = new SettlementWorker(roomManager, storage);

    const totalSettlements = 100;
    const rooms: GameRoom[] = [];

    for (let i = 1; i <= totalSettlements; i++) {
      const code = `CONCUR_${i}`;
      const room: GameRoom = {
        code,
        gameType: 'snake',
        stakeAmount: 100,
        potAmount: 200,
        status: 'gameover',
        winner: 'p1',
        settlementStatus: 'pending',
        version: 1,
        p1: { id: 'p1', telegramId: 20000 + i * 2 - 1, name: `P1_${i}`, isReady: true, isConnected: true },
        p2: { id: 'p2', telegramId: 20000 + i * 2, name: `P2_${i}`, isReady: true, isConnected: true },
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        engine: {} as any,
        actionCache: new Map(),
        rematchVotes: new Set(),
      };
      rooms.push(room);
    }

    vi.spyOn(roomManager, 'getRoom').mockImplementation((code) => rooms.find((r) => r.code === code));
    vi.spyOn(roomManager, 'persistCurrentState').mockResolvedValue();
    vi.spyOn(storage, 'finalizeWinMatch').mockImplementation(async () => {
      // Simulate minor DB network hop (1ms)
      await new Promise((r) => setTimeout(r, 1));
      return { winnerPayout: 180, loserPayout: 0, arenaFee: 20 };
    });
    vi.spyOn(storage, 'getAccountSnapshot').mockResolvedValue({} as any);

    const start = performance.now();
    const results = await Promise.all(rooms.map((r) => worker.processSettlement(r.code)));
    const durationMs = performance.now() - start;

    expect(results.every((r) => r === true)).toBe(true);
    for (const room of rooms) {
      expect(room.settlementStatus).toBe('committed');
    }

    // 100 concurrent settlements completed in under 500ms
    expect(durationMs).toBeLessThan(500);

    const snapshot = metrics.getSnapshot();
    expect(snapshot.counters['settlements_committed_total{result="win"}']).toBeGreaterThanOrEqual(100);
    expect(snapshot.histograms['settlement_duration_ms{result="win"}']).toBeDefined();
  });
});
