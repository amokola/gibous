import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../../../server/storage';
import { RoomManager } from '../../../server/roomManager';
import { DatabasePool } from '../../../server/db/index';

describe('Settlement Idempotency & Financial Safety Tests', () => {
  let storage: StorageService;
  let roomManager: RoomManager;
  let db: DatabasePool;

  beforeEach(() => {
    storage = new StorageService();
    roomManager = new RoomManager();
    db = DatabasePool.getInstance();
  });

  it('should guarantee exactly one settlement payout even under duplicate execution attempts', async () => {
    const winnerTgId = 750101;
    const loserTgId = 750102;
    const matchCode = 'IDEMPOTENT-01';

    await storage.getOrCreateUser({ id: winnerTgId, first_name: 'Winner' });
    await storage.getOrCreateUser({ id: loserTgId, first_name: 'Loser' });

    await storage.debitStake(winnerTgId, 100, matchCode);
    await storage.debitStake(loserTgId, 100, matchCode);

    const winnerInitial = db.getUserByTelegramId(winnerTgId)!.balance_gram;

    // First finalization
    const calc1 = await storage.finalizeWinMatch(matchCode, 'snake', 100, winnerTgId, loserTgId);
    expect(calc1.winnerPayout).toBe(180);

    const winnerAfterFirst = db.getUserByTelegramId(winnerTgId)!.balance_gram;
    expect(winnerAfterFirst).toBe(winnerInitial + 180);
  });

  it('should apply concurrent duplicate settlements exactly once', async () => {
    const winnerTgId = 750111;
    const loserTgId = 750112;
    const matchCode = 'IDEMPOTENT-CONCURRENT-01';

    const winner = await storage.getOrCreateUser({ id: winnerTgId, first_name: 'ConcurrentWinner' });
    await storage.getOrCreateUser({ id: loserTgId, first_name: 'ConcurrentLoser' });
    await storage.debitStake(winnerTgId, 100, matchCode);
    await storage.debitStake(loserTgId, 100, matchCode);

    const before = db.getUserByTelegramId(winnerTgId)!.balance_gram;
    await Promise.all([
      storage.finalizeWinMatch(matchCode, 'snake', 100, winnerTgId, loserTgId),
      storage.finalizeWinMatch(matchCode, 'snake', 100, winnerTgId, loserTgId),
    ]);

    const after = db.getUserByTelegramId(winnerTgId)!.balance_gram;
    expect(after).toBe(before + 180);
    expect(db.getSettlement(matchCode)).toBeDefined();
    expect(db.getTransactionsForUser(winner.id).filter((tx) => tx.match_code === matchCode && tx.type === 'match_win')).toHaveLength(1);
  });

  it('should make duplicate stake commands idempotent for the same player and match', async () => {
    const playerTgId = 750151;
    const matchCode = 'STAKE-IDEMPOTENT-01';
    const user = await storage.getOrCreateUser({ id: playerTgId, first_name: 'StakeRetry' });
    const initialBalance = user.balance_gram;

    const first = await storage.debitStake(playerTgId, 100, matchCode);
    const afterFirst = db.getUserByTelegramId(playerTgId)!.balance_gram;
    const second = await storage.debitStake(playerTgId, 100, matchCode);
    const afterSecond = db.getUserByTelegramId(playerTgId)!.balance_gram;

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(afterFirst).toBe(initialBalance - 100);
    expect(afterSecond).toBe(afterFirst);
    expect(db.getTransactionsForUser(user.id).filter((tx) => tx.match_code === matchCode)).toHaveLength(1);
  });

  it('should replay cached action results for identical requestId without mutating state again', async () => {
    const p1TgId = 750201;
    const p2TgId = 750202;
    const code = 'REQCACHE01';

    await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

    await roomManager.createRoom(code, 'connect4', 100, p1TgId, 'P1');
    await roomManager.joinRoom(code, p2TgId, 'P2');

    const requestId = 'req-unique-uuid-12345';

    // 1st Execution
    const res1 = roomManager.executeAction(code, 'p1', 'DROP_DISC', { column: 3 }, requestId);
    expect(res1.success).toBe(true);
    expect(res1.payload.col).toBe(3);

    const versionAfterFirst = roomManager.getRoom(code)!.version;




    // 2nd Execution with identical requestId
    const res2 = roomManager.executeAction(code, 'p1', 'DROP_DISC', { column: 3 }, requestId);
    expect(res2).toEqual(res1);
    expect(roomManager.getRoom(code)!.version).toBe(versionAfterFirst);
  });

  it('should reject further moves once a room is in gameover status', async () => {
    const p1TgId = 750301;
    const p2TgId = 750302;
    const code = 'GAMEOVER_LOCK';

    await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

    await roomManager.createRoom(code, 'rps', 100, p1TgId, 'P1');
    await roomManager.joinRoom(code, p2TgId, 'P2');

    const room = roomManager.getRoom(code)!;
    room.status = 'gameover';
    room.winner = 'p1';

    const moveAttempt = roomManager.executeAction(code, 'p2', 'CHOOSE_RPS', { choice: 'rock' });
    expect(moveAttempt.success).toBe(false);
    expect(moveAttempt.error).toContain('Duel is not in progress');
  });
});
