import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../../../server/storage';
import { DatabasePool } from '../../../server/db/index';

describe('StorageService & Escrow Unit Tests', () => {
  let storage: StorageService;
  let db: DatabasePool;

  beforeEach(() => {
    storage = new StorageService();
    db = DatabasePool.getInstance();
  });

  it('should use the deterministic 2450 balance only in the test adapter', async () => {
    const uniqueId = 999000 + Math.floor(Math.random() * 1000);
    const user = await storage.getOrCreateUser({
      id: uniqueId,
      first_name: 'TestUser',
      username: 'test_user',
    });

    expect(user.telegram_id).toBe(uniqueId);
    expect(user.balance_gram).toBe(2450);
    expect(user.wins).toBe(0);
    expect(user.losses).toBe(0);
    expect(user.level).toBe(1);
  });

  it('should successfully debit stake when user has sufficient balance', async () => {
    const tgId = 888001;
    await storage.getOrCreateUser({ id: tgId, first_name: 'Staker' });

    const initialUser = db.getUserByTelegramId(tgId);
    const initialBalance = initialUser!.balance_gram;

    const res = await storage.debitStake(tgId, 250, 'MATCH-01');
    expect(res.success).toBe(true);
    expect(res.balance).toBe(initialBalance - 250);

    const updatedUser = db.getUserByTelegramId(tgId);
    expect(updatedUser!.balance_gram).toBe(initialBalance - 250);
  });

  it('should reject stake debit when user has insufficient balance', async () => {
    const tgId = 888002;
    const user = await storage.getOrCreateUser({ id: tgId, first_name: 'BrokeUser' });
    user.balance_gram = 50;
    db.saveUser(user);

    const res = await storage.debitStake(tgId, 100, 'MATCH-02');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Not enough GRAM');
    expect(db.getUserByTelegramId(tgId)!.balance_gram).toBe(50);
  });

  it('should refund escrowed stake when match is cancelled before start', async () => {
    const tgId = 888003;
    await storage.getOrCreateUser({ id: tgId, first_name: 'Canceller' });

    await storage.debitStake(tgId, 200, 'MATCH-03');
    const balanceAfterDebit = db.getUserByTelegramId(tgId)!.balance_gram;

    const refundRes = await storage.refundStake(tgId, 200, 'MATCH-03');
    expect(refundRes.success).toBe(true);
    expect(refundRes.balance).toBe(balanceAfterDebit + 200);
    expect(db.getUserByTelegramId(tgId)!.balance_gram).toBe(balanceAfterDebit + 200);
  });

  it('should finalize win match by crediting 90% pot to winner and updating treasury', async () => {
    const winnerTgId = 888004;
    const loserTgId = 888005;

    await storage.getOrCreateUser({ id: winnerTgId, first_name: 'Winner' });
    await storage.getOrCreateUser({ id: loserTgId, first_name: 'Loser' });

    // Both stake 100
    await storage.debitStake(winnerTgId, 100, 'MATCH-WIN');
    await storage.debitStake(loserTgId, 100, 'MATCH-WIN');

    const winnerBefore = db.getUserByTelegramId(winnerTgId)!.balance_gram;
    const loserBefore = db.getUserByTelegramId(loserTgId)!.balance_gram;

    const calc = await storage.finalizeWinMatch('MATCH-WIN', 'snake', 100, winnerTgId, loserTgId);
    expect(calc.winnerPayout).toBe(180);
    expect(calc.arenaFee).toBe(20);

    const winnerAfter = db.getUserByTelegramId(winnerTgId)!;
    const loserAfter = db.getUserByTelegramId(loserTgId)!;

    expect(winnerAfter.balance_gram).toBe(winnerBefore + 180);
    expect(winnerAfter.wins).toBe(1);
    expect(winnerAfter.current_streak).toBe(1);
    expect(winnerAfter.xp).toBe(150);

    expect(loserAfter.balance_gram).toBe(loserBefore);
    expect(loserAfter.losses).toBe(1);
    expect(loserAfter.current_streak).toBe(0);
    expect(loserAfter.xp).toBe(30);
  });

  it('should finalize draw match by refunding 95% stake to both players', async () => {
    const p1TgId = 888006;
    const p2TgId = 888007;

    await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

    await storage.debitStake(p1TgId, 100, 'MATCH-DRAW');
    await storage.debitStake(p2TgId, 100, 'MATCH-DRAW');

    const p1Before = db.getUserByTelegramId(p1TgId)!.balance_gram;
    const p2Before = db.getUserByTelegramId(p2TgId)!.balance_gram;

    const calc = await storage.finalizeDrawMatch('MATCH-DRAW', 'connect4', 100, p1TgId, p2TgId);
    expect(calc.p1Refund).toBe(95);
    expect(calc.p2Refund).toBe(95);
    expect(calc.arenaFee).toBe(10);

    const p1After = db.getUserByTelegramId(p1TgId)!;
    const p2After = db.getUserByTelegramId(p2TgId)!;

    expect(p1After.balance_gram).toBe(p1Before + 95);
    expect(p1After.draws).toBe(1);
    expect(p1After.xp).toBe(75);

    expect(p2After.balance_gram).toBe(p2Before + 95);
    expect(p2After.draws).toBe(1);
    expect(p2After.xp).toBe(75);
  });
});
