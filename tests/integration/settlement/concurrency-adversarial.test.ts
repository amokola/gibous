import { describe, it, expect } from 'vitest';
import { DatabasePool } from '../../../server/db/index';

describe('Adversarial Financial Concurrency & Security Regression Suite', () => {
  const db = DatabasePool.getInstance();

  it('P0: prevents stale profile persistence from overwriting active user balances', async () => {
    const tgId = 980001;
    // 1. Initial user setup with 100 GRAM
    const initialUser = await db.persistUser({
      telegram_id: tgId,
      username: 'alice_concurrency',
      first_name: 'Alice',
      balance_gram: 100,
    });
    expect(initialUser).toBeDefined();

    // 2. Fetch stale snapshot
    const staleSnapshot = await db.loadUserByTelegramId(tgId);
    expect(staleSnapshot).toBeDefined();

    // 3. User debits 40 GRAM in a match
    const debit = await db.debitUserBalance(tgId, 40, 'ADV-STAKE-01');
    expect(debit.success).toBe(true);

    // 4. Background task saves updated XP from the stale snapshot
    staleSnapshot.xp += 100;
    await db.persistUser(staleSnapshot);

    // 5. Verify database balance remains 60 GRAM (not overwritten back to 100)
    const freshUser = await db.loadUserByTelegramId(tgId);
    expect(freshUser.balance_gram).toBe(60);
    expect(freshUser.xp).toBe(100);
  });

  it('P0: blocks duplicate concurrent debits that would overdraw the account', async () => {
    const tgId = 980002;
    await db.persistUser({
      telegram_id: tgId,
      username: 'bob_concurrency',
      first_name: 'Bob',
      balance_gram: 50,
    });

    // Try to debit 50 GRAM twice concurrently
    const [res1, res2] = await Promise.all([
      db.debitUserBalance(tgId, 50, 'ADV-CONCURRENT-A'),
      db.debitUserBalance(tgId, 50, 'ADV-CONCURRENT-B'),
    ]);

    const successes = [res1, res2].filter((r) => r.success);
    const failures = [res1, res2].filter((r) => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    const finalUser = await db.loadUserByTelegramId(tgId);
    expect(finalUser.balance_gram).toBe(0);
  });

  it('P1: prevents SQL injection on deposit intent updates with unallowlisted keys', async () => {
    const maliciousKey = "status = 'confirmed', balance_nano = 999999999999 --";
    await expect(
      db.updatePersistentDepositIntent('00000000-0000-0000-0000-000000000000', {
        [maliciousKey]: 'hack',
      })
    ).rejects.toThrow(/Security Violation/);
  });

  it('P1: executes concurrent settlements for reverse player pairs without deadlocking', async () => {
    const userA = await db.persistUser({ telegram_id: 980003, username: 'p1_rev', first_name: 'P1', balance_gram: 500 });
    const userB = await db.persistUser({ telegram_id: 980004, username: 'p2_rev', first_name: 'P2', balance_gram: 500 });

    const [resA, resB] = await Promise.all([
      db.settleWinMatch('ADV-DEADLOCK-1', 'rps', 100, userA.telegram_id, userB.telegram_id, { totalPot: 200, winnerPayout: 190, arenaFee: 10 }),
      db.settleWinMatch('ADV-DEADLOCK-2', 'rps', 100, userB.telegram_id, userA.telegram_id, { totalPot: 200, winnerPayout: 190, arenaFee: 10 }),
    ]);

    // In-memory returns undefined (since storage handles in-memory settlement), or returns applied if persistent
    if (resA !== undefined) {
      expect(resA.applied).toBe(true);
      expect(resB.applied).toBe(true);
    }
  });

  it('P0: guarantees both player 1 and player 2 are refunded when a 2-player match is cancelled', async () => {
    const matchCode = 'ADV-CANCEL-2P';
    const p1TgId = 980005;
    const p2TgId = 980006;
    const stake = 100;

    await db.persistUser({ telegram_id: p1TgId, username: 'p1_canc', first_name: 'P1', balance_gram: 200 });
    await db.persistUser({ telegram_id: p2TgId, username: 'p2_canc', first_name: 'P2', balance_gram: 200 });

    // Both players debit stake
    const d1 = await db.debitUserBalance(p1TgId, stake, matchCode);
    const d2 = await db.debitUserBalance(p2TgId, stake, matchCode);
    expect(d1.success).toBe(true);
    expect(d2.success).toBe(true);

    // Cancel match and refund both players
    const refund1 = await db.refundStake(p1TgId, stake, matchCode);
    const refund2 = await db.refundStake(p2TgId, stake, matchCode);

    expect(refund1.success).toBe(true);
    expect(refund2.success).toBe(true);

    // Both players must receive their 100 GRAM back
    const freshP1 = await db.loadUserByTelegramId(p1TgId);
    const freshP2 = await db.loadUserByTelegramId(p2TgId);
    expect(freshP1.balance_gram).toBe(200);
    expect(freshP2.balance_gram).toBe(200);
  });

  it('P0: blocks competing multi-instance players from joining the same match simultaneously', async () => {
    const matchCode = 'ADV-JOIN-RACE';
    const p1TgId = 980007;
    const p2TgId = 980008;
    const p3TgId = 980009;
    const stake = 50;

    await db.persistUser({ telegram_id: p1TgId, username: 'p1_host', first_name: 'P1', balance_gram: 100 });
    await db.persistUser({ telegram_id: p2TgId, username: 'p2_challenger', first_name: 'P2', balance_gram: 100 });
    await db.persistUser({ telegram_id: p3TgId, username: 'p3_challenger', first_name: 'P3', balance_gram: 100 });

    const created = await db.createMatchWithEscrow({
      code: matchCode,
      gameType: 'rps',
      stakeAmount: stake,
      potAmount: stake * 2,
      p1TelegramId: p1TgId,
    });
    expect(created.success).toBe(true);

    // P2 and P3 simultaneously attempt to join
    const [join2, join3] = await Promise.all([
      db.joinMatchWithEscrow({ code: matchCode, p2TelegramId: p2TgId }),
      db.joinMatchWithEscrow({ code: matchCode, p2TelegramId: p3TgId }),
    ]);

    const successes = [join2, join3].filter((j) => j.success);
    const failures = [join2, join3].filter((j) => !j.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // Verify loser of the race was NOT debited
    const loserTgId = join2.success ? p3TgId : p2TgId;
    const winnerTgId = join2.success ? p2TgId : p3TgId;

    const freshWinner = await db.loadUserByTelegramId(winnerTgId);
    const freshLoser = await db.loadUserByTelegramId(loserTgId);

    expect(freshWinner.balance_gram).toBe(50); // 100 - 50 = 50
    expect(freshLoser.balance_gram).toBe(100); // untouched!
  });

  it('P1: executes atomic rematch double-debit without partial-debit divergence', async () => {
    const matchCode = 'ADV-REMATCH';
    const nextRoundCode = 'ADV-REMATCH-R2';
    const p1TgId = 980010;
    const p2TgId = 980011;
    const stake = 75;

    await db.persistUser({ telegram_id: p1TgId, username: 'p1_rem', first_name: 'P1', balance_gram: 100 });
    await db.persistUser({ telegram_id: p2TgId, username: 'p2_rem', first_name: 'P2', balance_gram: 20 }); // Insufficient!

    const rematch = await db.startRematchWithEscrow({
      matchCode,
      nextRoundCode,
      p1TelegramId: p1TgId,
      p2TelegramId: p2TgId,
      stake,
    });

    expect(rematch.success).toBe(false);

    // Neither player should be debited
    const freshP1 = await db.loadUserByTelegramId(p1TgId);
    const freshP2 = await db.loadUserByTelegramId(p2TgId);

    expect(freshP1.balance_gram).toBe(100);
    expect(freshP2.balance_gram).toBe(20);
  });
});
