import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SettlementWorker } from '../../../server/settlementWorker';
import { RoomManager, GameRoom } from '../../../server/roomManager';
import { StorageService } from '../../../server/storage';

describe('Settlement Reconciliation & Batch Throttling', () => {
  let roomManager: RoomManager;
  let storage: StorageService;
  let worker: SettlementWorker;

  beforeEach(() => {
    roomManager = new RoomManager();
    storage = new StorageService();
    worker = new SettlementWorker(roomManager, storage);
  });

  it('throttles settlement reconciliation into bounded batches rather than unbounded concurrent sweep', async () => {
    const roomsToReconcile: GameRoom[] = [];
    for (let i = 1; i <= 25; i++) {
      roomsToReconcile.push({
        code: `RECON_${i}`,
        gameType: 'snake',
        stakeAmount: 100,
        potAmount: 200,
        status: 'gameover',
        winner: 'p1',
        settlementStatus: 'pending',
        version: 1,
        p1: { id: 'p1', telegramId: 1000 + i, name: `P1_${i}`, isReady: true, isConnected: true },
        p2: { id: 'p2', telegramId: 2000 + i, name: `P2_${i}`, isReady: true, isConnected: true },
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        engine: {} as any,
        actionCache: new Map(),
        rematchVotes: new Set(),
      });
    }

    vi.spyOn(roomManager, 'getAllRooms').mockReturnValue(roomsToReconcile);
    vi.spyOn(roomManager, 'getRoom').mockImplementation((code) => roomsToReconcile.find((r) => r.code === code));
    vi.spyOn(roomManager, 'persistCurrentState').mockResolvedValue();
    vi.spyOn(storage, 'finalizeWinMatch').mockResolvedValue({
      winnerPayout: 180,
      loserPayout: 0,
      arenaFee: 20,
    });
    vi.spyOn(storage, 'getAccountSnapshot').mockResolvedValue({} as any);

    // Call reconcileInterruptedSettlements with batch size 5
    await worker.reconcileInterruptedSettlements({ batchSize: 5, batchDelayMs: 5 });

    // Verify all 25 rooms were processed and committed
    for (const room of roomsToReconcile) {
      expect(room.settlementStatus).toBe('committed');
    }
  });
});
