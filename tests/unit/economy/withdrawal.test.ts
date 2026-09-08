import { beforeEach, describe, expect, it } from 'vitest';
import { DatabasePool } from '../../../server/db/index';
import { StorageService } from '../../../server/storage';
import { ClientMessageSchema } from '../../../shared/schemas/protocol';

describe('Withdrawal Flow & Invariants', () => {
  let storage: StorageService;

  beforeEach(() => {
    storage = new StorageService();
  });

  it('validates SUBMIT_WITHDRAWAL protocol schema', () => {
    const valid = ClientMessageSchema.safeParse({
      type: 'SUBMIT_WITHDRAWAL',
      requestId: 'req-1',
      payload: {
        walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
        amountNano: '1000000000',
      },
    });
    expect(valid.success).toBe(true);

    const invalidAddress = ClientMessageSchema.safeParse({
      type: 'SUBMIT_WITHDRAWAL',
      payload: {
        walletAddress: 'short',
        amountNano: '1000000000',
      },
    });
    expect(invalidAddress.success).toBe(false);

    const invalidAmount = ClientMessageSchema.safeParse({
      type: 'SUBMIT_WITHDRAWAL',
      payload: {
        walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
        amountNano: '-500',
      },
    });
    expect(invalidAmount.success).toBe(false);
  });

  it('atomically debits user balance and records withdrawal ledger transaction', async () => {
    const telegramId = 880001;
    const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'Withdrawer' });

    // Credit user with 10 GRAM (10_000_000_000 nano)
    const db = DatabasePool.getInstance();
    const inMemUser = db.getUserByTelegramId(telegramId);
    if (inMemUser) {
      inMemUser.balance_nano = '10000000000';
      inMemUser.balance_gram = 10;
      db.saveUser(inMemUser);
    }

    const withdrawResult = await storage.requestWithdrawal({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      amountNano: '3000000000', // 3 GRAM
    });

    expect(withdrawResult.success).toBe(true);
    expect(withdrawResult.transaction?.amountGram).toBe(3);
    expect(withdrawResult.transaction?.type).toBe('withdraw');

    // Balance should now be 7 GRAM (7_000_000_000 nano)
    const updatedUser = db.getUserByTelegramId(telegramId);
    expect(updatedUser?.balance_gram).toBe(7);
    expect(updatedUser?.balance_nano).toBe('7000000000');

    // Verify transaction history includes withdrawal
    const snapshot = await storage.getAccountSnapshot(telegramId);
    const withdrawTx = snapshot?.transactions.find((tx: any) => tx.type === 'withdraw');
    expect(withdrawTx).toBeDefined();
    expect(withdrawTx?.amountGram).toBe(3);
  });

  it('rejects withdrawal if balance is insufficient', async () => {
    const telegramId = 880002;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Broke Player' });

    const db = DatabasePool.getInstance();
    const inMemUser = db.getUserByTelegramId(telegramId);
    if (inMemUser) {
      inMemUser.balance_nano = '1000000000'; // 1 GRAM
      inMemUser.balance_gram = 1;
      db.saveUser(inMemUser);
    }

    const result = await storage.requestWithdrawal({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      amountNano: '5000000000', // 5 GRAM requested
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Insufficient balance');

    // Balance should remain unchanged
    const afterUser = db.getUserByTelegramId(telegramId);
    expect(afterUser?.balance_gram).toBe(1);
  });

  it('rejects zero or negative withdrawal amounts', async () => {
    const telegramId = 880003;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Zero Withdrawer' });

    const resultZero = await storage.requestWithdrawal({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      amountNano: '0',
    });
    expect(resultZero.success).toBe(false);
    expect(resultZero.error).toContain('must be greater than zero');
  });

  it('rejects invalid recipient wallet address', async () => {
    const telegramId = 880004;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Bad Address Player' });

    const resultBadAddr = await storage.requestWithdrawal({
      telegramId,
      walletAddress: '   ',
      amountNano: '1000000000',
    });
    expect(resultBadAddr.success).toBe(false);
    expect(resultBadAddr.error).toContain('Invalid recipient wallet address');
  });
});
