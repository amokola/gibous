import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabasePool } from '../../../server/db/index';
import { StorageService } from '../../../server/storage';
import { ClientMessageSchema } from '../../../shared/schemas/protocol';

describe('Withdrawal Flow & Invariants', () => {
  let storage: StorageService;

  beforeEach(() => {
    storage = new StorageService();
    DatabasePool.getInstance().resetInMemoryWithdrawalStateForTests();
    vi.stubEnv('PAYOUT_NETWORK', 'mainnet');
    vi.stubEnv('PAYOUT_MIN_WITHDRAWAL_NANO', '100000000');
    vi.stubEnv('PAYOUT_MAX_WITHDRAWAL_NANO', '5000000000');
    vi.stubEnv('PAYOUT_USER_DAILY_LIMIT_NANO', '6000000000');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('validates mainnet withdrawal quote and confirmation protocol schemas', () => {
    const valid = ClientMessageSchema.safeParse({
      type: 'REQUEST_WITHDRAWAL_QUOTE',
      requestId: 'req-1',
      payload: {
        walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
        amountNano: '1000000000',
      },
    });
    expect(valid.success).toBe(true);

    const invalidAddress = ClientMessageSchema.safeParse({
      type: 'REQUEST_WITHDRAWAL_QUOTE',
      payload: {
        walletAddress: 'short',
        amountNano: '1000000000',
      },
    });
    expect(invalidAddress.success).toBe(false);

    const invalidAmount = ClientMessageSchema.safeParse({
      type: 'REQUEST_WITHDRAWAL_QUOTE',
      payload: {
        walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
        amountNano: '-500',
      },
    });
    expect(invalidAmount.success).toBe(false);
    expect(ClientMessageSchema.safeParse({
      type: 'REQUEST_WITHDRAWAL_QUOTE',
      payload: { walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz', amountNano: '1000000000', feeNano: '1' },
    }).success).toBe(false);
    expect(ClientMessageSchema.safeParse({ type: 'CONFIRM_WITHDRAWAL', payload: { quoteId: 'not-a-uuid', feeNano: '1' } }).success).toBe(false);
  });

  it('rejects one-step withdrawals without a quote and does not debit balance', async () => {
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

    expect(withdrawResult.success).toBe(false);
    expect(withdrawResult.error).toContain('server-generated withdrawal quote');
    const updatedUser = db.getUserByTelegramId(telegramId);
    expect(updatedUser?.balance_gram).toBe(10);
    expect(updatedUser?.balance_nano).toBe('10000000000');
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

    const quote = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '3000000000',
      feeNano: '5000000',
      network: 'mainnet',
    });
    expect(quote.success).toBe(true);
    if (!quote.success) return;
    const result = await storage.confirmWithdrawalQuote({
      telegramId,
      quoteId: quote.quote.quoteId,
      operationKey: 'insufficient-balance',
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

    const resultZero = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '0',
      feeNano: '0',
      network: 'mainnet',
    });
    expect(resultZero.success).toBe(false);
    expect(resultZero.error).toContain('fee must be less than');
  });

  it.each([
    ['empty gross amount', '', '1'],
    ['malformed gross amount', '1.5', '1'],
    ['negative gross amount', '-1', '1'],
    ['negative fee', '1000000000', '-1'],
    ['fee equal to gross amount', '1000000000', '1000000000'],
    ['malformed fee', '1000000000', '1.5'],
  ])('rejects %s without creating a quote', async (_label, grossAmountNano, feeNano) => {
    const telegramId = 880020;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Invalid Quote Player' });

    const result = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano,
      feeNano,
      network: 'mainnet',
    });

    expect(result.success).toBe(false);
    expect((DatabasePool.getInstance() as any).inMemoryDb.get('withdrawal_quotes')).toHaveLength(0);
  });

  it('accepts the exact configured minimum and maximum gross amounts', async () => {
    const telegramId = 880021;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Boundary Quote Player' });

    const minimum = await storage.createWithdrawalQuote({
      telegramId, walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '100000000', feeNano: '1', network: 'mainnet',
    });
    const maximum = await storage.createWithdrawalQuote({
      telegramId, walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '5000000000', feeNano: '1', network: 'mainnet',
    });

    expect(minimum.success).toBe(true);
    expect(maximum.success).toBe(true);
    if (minimum.success && maximum.success) {
      expect(minimum.quote.netAmountNano).toBe('99999999');
      expect(maximum.quote.netAmountNano).toBe('4999999999');
    }
  });

  it('rejects invalid recipient wallet address', async () => {
    const telegramId = 880004;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Bad Address Player' });

    const resultBadAddr = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: '   ',
      grossAmountNano: '1000000000',
      feeNano: '1000000',
      network: 'mainnet',
    });
    expect(resultBadAddr.success).toBe(false);
    expect(resultBadAddr.error).toContain('Invalid withdrawal address');
  });

  it('rejects requests that attempt to bypass quote confirmation', async () => {
    const telegramId = 880005;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Idempotent Player' });

    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(telegramId)!;
    user.balance_nano = '10000000000';
    user.balance_gram = 10;
    db.saveUser(user);

    const result = await storage.requestWithdrawal({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      amountNano: '3000000000',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('server-generated withdrawal quote');
    expect(db.getUserByTelegramId(telegramId)?.balance_gram).toBe(10);
  });

  it('creates a fixed mainnet fee quote without debiting the account', async () => {
    const telegramId = 880006;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Quote Player' });
    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(telegramId)!;
    user.balance_nano = '10000000000';
    user.balance_gram = 10;
    db.saveUser(user);

    const result = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '3000000000',
      feeNano: '5000000',
      network: 'mainnet',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.quote.grossAmountNano).toBe('3000000000');
    expect(result.quote.feeNano).toBe('5000000');
    expect(result.quote.netAmountNano).toBe('2995000000');
    expect(result.quote.network).toBe('mainnet');
    expect(db.getUserByTelegramId(telegramId)?.balance_nano).toBe('10000000000');
  });

  it('confirms one quote with one gross debit and remains idempotent across request IDs', async () => {
    const telegramId = 880007;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Confirm Player' });
    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(telegramId)!;
    user.balance_nano = '10000000000';
    user.balance_gram = 10;
    db.saveUser(user);
    const quote = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '3000000000',
      feeNano: '5000000',
      network: 'mainnet',
    });
    expect(quote.success).toBe(true);
    if (!quote.success) return;

    const first = await storage.confirmWithdrawalQuote({
      telegramId,
      quoteId: quote.quote.quoteId,
      operationKey: 'confirm-withdrawal-1',
    });
    const retry = await storage.confirmWithdrawalQuote({
      telegramId,
      quoteId: quote.quote.quoteId,
      operationKey: 'confirm-withdrawal-retry',
    });

    expect(first.success).toBe(true);
    expect(retry.success).toBe(true);
    if (!first.success || !retry.success) return;
    expect(first.withdrawal.id).toBe(retry.withdrawal.id);
    expect(first.withdrawal.status).toBe('pending');
    expect(first.withdrawal.payout_eligible).toBe(true);
    expect(first.withdrawal.amount_nano).toBe('3000000000');
    expect(first.withdrawal.net_amount_nano).toBe('2995000000');
    expect(db.getUserByTelegramId(telegramId)?.balance_nano).toBe('7000000000');
    const ledgerRows = db.getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'withdraw');
    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].amount_nano).toBe('-3000000000');
    const snapshot = await storage.getAccountSnapshot(telegramId);
    expect(snapshot?.transactions.find((tx: any) => tx.id === first.withdrawal.id)).toMatchObject({ status: 'pending', amountGram: 3 });
  });

  it('does not debit twice when the same quote is confirmed concurrently', async () => {
    const telegramId = 880022;
    const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'Concurrent Confirm Player' });
    const db = DatabasePool.getInstance();
    const account = db.getUserByTelegramId(telegramId)!;
    account.balance_nano = '8000000000'; account.balance_gram = 8; db.saveUser(account);
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '3000000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected a valid quote');

    const results = await Promise.all([1, 2, 3, 4].map((index) => storage.confirmWithdrawalQuote({
      telegramId, quoteId: quote.quote.quoteId, operationKey: `concurrent-confirm-${index}`,
    })));

    expect(results.every((result) => result.success)).toBe(true);
    expect(new Set(results.map((result) => result.success && result.withdrawal.id)).size).toBe(1);
    expect(db.getUserByTelegramId(telegramId)?.balance_nano).toBe('5000000000');
    expect(db.getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'withdraw')).toHaveLength(1);
  });

  it('rejects reusing one idempotency key for a different quote without a second debit', async () => {
    const telegramId = 880023;
    const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'Key Reuse Player' });
    const db = DatabasePool.getInstance();
    const account = db.getUserByTelegramId(telegramId)!;
    account.balance_nano = '8000000000'; account.balance_gram = 8; db.saveUser(account);
    const createQuote = () => storage.createWithdrawalQuote({
      telegramId, walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '2000000000', feeNano: '1000000', network: 'mainnet',
    });
    const firstQuote = await createQuote();
    const secondQuote = await createQuote();
    if (!firstQuote.success || !secondQuote.success) throw new Error('Expected valid quotes');

    const first = await storage.confirmWithdrawalQuote({
      telegramId, quoteId: firstQuote.quote.quoteId, operationKey: 'shared-idempotency-key',
    });
    const replay = await storage.confirmWithdrawalQuote({
      telegramId, quoteId: secondQuote.quote.quoteId, operationKey: 'shared-idempotency-key',
    });

    expect(first.success).toBe(true);
    expect(replay).toMatchObject({ success: false, error: expect.stringContaining('Idempotency key') });
    expect(db.getUserByTelegramId(telegramId)?.balance_nano).toBe('6000000000');
    expect(db.getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'withdraw')).toHaveLength(1);
    expect((db as any).inMemoryDb.get('withdrawal_quotes').find((item: any) => item.id === secondQuote.quote.quoteId)?.status).toBe('quoted');
  });

  it('allows separate users to confirm withdrawals concurrently within their individual daily caps', async () => {
    const telegramIds = [880024, 880025];
    const users = await Promise.all(telegramIds.map((id) => storage.getOrCreateUser({ id, first_name: 'Withdrawal Player' })));
    const db = DatabasePool.getInstance();
    for (const telegramId of telegramIds) {
      const account = db.getUserByTelegramId(telegramId)!;
      account.balance_nano = '8000000000'; account.balance_gram = 8; db.saveUser(account);
    }
    const quotes = await Promise.all(telegramIds.map((telegramId) => storage.createWithdrawalQuote({
      telegramId, walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '4000000000', feeNano: '1000000', network: 'mainnet',
    })));
    const results = await Promise.all(quotes.map((quote, index) => {
      if (!quote.success) throw new Error('Expected a valid quote');
      return storage.confirmWithdrawalQuote({
        telegramId: telegramIds[index], quoteId: quote.quote.quoteId, operationKey: `global-race-${index}`,
      });
    }));

    expect(results.every((result) => result.success)).toBe(true);
    expect(users.reduce((total, user) => total + db.getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'withdraw').length, 0)).toBe(2);
    expect(telegramIds.reduce((total, id) => total + BigInt(db.getUserByTelegramId(id)!.balance_nano), 0n)).toBe(8000000000n);
  });

  it('expires a quote at the exact expiry instant without changing the account', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T12:00:00.000Z'));
    const telegramId = 880026;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Expiry Boundary Player' });
    const db = DatabasePool.getInstance();
    const account = db.getUserByTelegramId(telegramId)!;
    account.balance_nano = '5000000000'; account.balance_gram = 5; db.saveUser(account);
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '1000000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected a valid quote');
    vi.setSystemTime(new Date(quote.quote.expiresAt));

    const result = await storage.confirmWithdrawalQuote({
      telegramId, quoteId: quote.quote.quoteId, operationKey: 'expiry-boundary',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
    expect(db.getUserByTelegramId(telegramId)?.balance_nano).toBe('5000000000');
    expect(db.getTransactionsForUser(account.id).filter((tx: any) => tx.type === 'withdraw')).toHaveLength(0);
  });

  it('starts a fresh per-user daily limit at UTC midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T23:59:59.999Z'));
    const telegramId = 880027;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'UTC Rollover Player' });
    const db = DatabasePool.getInstance();
    const account = db.getUserByTelegramId(telegramId)!;
    account.balance_nano = '10000000000'; account.balance_gram = 10; db.saveUser(account);
    const createQuote = () => storage.createWithdrawalQuote({
      telegramId, walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '4000000000', feeNano: '1000000', network: 'mainnet',
    });
    const firstQuote = await createQuote();
    if (!firstQuote.success) throw new Error('Expected first quote');
    const first = await storage.confirmWithdrawalQuote({
      telegramId, quoteId: firstQuote.quote.quoteId, operationKey: 'utc-day-before-midnight',
    });
    expect(first.success).toBe(true);
    vi.setSystemTime(new Date('2026-10-16T00:00:00.000Z'));
    const secondQuote = await createQuote();
    if (!secondQuote.success) throw new Error('Expected second quote');

    const second = await storage.confirmWithdrawalQuote({
      telegramId, quoteId: secondQuote.quote.quoteId, operationKey: 'utc-day-after-midnight',
    });

    expect(second.success).toBe(true);
    expect(db.getUserByTelegramId(telegramId)?.balance_nano).toBe('2000000000');
  });

  it('preserves exact nano arithmetic above JavaScript safe integer precision', async () => {
    vi.stubEnv('PAYOUT_MIN_WITHDRAWAL_NANO', '1');
    vi.stubEnv('PAYOUT_MAX_WITHDRAWAL_NANO', '10000000000000000');
    vi.stubEnv('PAYOUT_USER_DAILY_LIMIT_NANO', '10000000000000000');
    const telegramId = 880028;
    const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'Big Integer Player' });
    const db = DatabasePool.getInstance();
    const account = db.getUserByTelegramId(telegramId)!;
    account.balance_nano = '9007199254740993';
    account.balance_gram = Number(account.balance_nano) / 1e9;
    db.saveUser(account);
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '9007199254740992', feeNano: '1', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected a valid large integer quote');
    const result = await storage.confirmWithdrawalQuote({
      telegramId, quoteId: quote.quote.quoteId, operationKey: 'large-integer-confirm',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.withdrawal.amount_nano).toBe('9007199254740992');
    expect(result.withdrawal.fee_nano).toBe('1');
    expect(result.withdrawal.net_amount_nano).toBe('9007199254740991');
    expect(db.getUserByTelegramId(telegramId)?.balance_nano).toBe('1');
    expect(db.getTransactionsForUser(user.id).find((tx: any) => tx.type === 'withdraw')?.amount_nano).toBe('-9007199254740992');
  });

  it('serializes competing confirmations against the configured daily cap', async () => {
    const telegramId = 880013;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Daily Limit Player' });
    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(telegramId)!;
    user.balance_nano = '10000000000'; user.balance_gram = 10; db.saveUser(user);
    const quotes = await Promise.all(['a', 'b'].map(() => storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '4000000000', feeNano: '1000000', network: 'mainnet',
    })));
    const results = await Promise.all(quotes.map((quote, index) => {
      if (!quote.success) throw new Error('Quote failed');
      return storage.confirmWithdrawalQuote({ telegramId, quoteId: quote.quote.quoteId, operationKey: `daily-limit-${index}` });
    }));
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success && result.error?.includes('daily withdrawal limit'))).toHaveLength(1);
    expect(db.getUserByTelegramId(telegramId)?.balance_nano).toBe('6000000000');
  });

  it('rejects expired and mismatched quotes without changing balance', async () => {
    const telegramId = 880008;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Expired Quote Player' });
    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(telegramId)!;
    user.balance_nano = '10000000000';
    user.balance_gram = 10;
    db.saveUser(user);
    const quote = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '1000000000',
      feeNano: '1000000',
      network: 'mainnet',
    });
    expect(quote.success).toBe(true);
    if (!quote.success) return;
    vi.setSystemTime(new Date(Date.now() + 10 * 60_000));

    const result = await storage.confirmWithdrawalQuote({
      telegramId,
      quoteId: quote.quote.quoteId,
      operationKey: 'expired-confirm',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('expired');
    expect(db.getUserByTelegramId(telegramId)?.balance_nano).toBe('10000000000');
  });

  it('rejects a withdrawal quote outside the configured gross limits', async () => {
    const telegramId = 880009;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Limit Player' });

    const tooSmall = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '99999999',
      feeNano: '1',
      network: 'mainnet',
    });
    const tooLarge = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '5000000001',
      feeNano: '1',
      network: 'mainnet',
    });

    expect(tooSmall.success).toBe(false);
    expect(tooLarge.success).toBe(false);
  });

  it('claims only new payout-eligible withdrawals and fences stale workers', async () => {
    const telegramId = 880010;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Queue Player' });
    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(telegramId)!;
    user.balance_nano = '10000000000';
    user.balance_gram = 10;
    db.saveUser(user);
    await db.requestWithdrawal(telegramId, 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz', '1000000000', 'legacy-row');
    const quote = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '2000000000',
      feeNano: '1000000',
      network: 'mainnet',
    });
    expect(quote.success).toBe(true);
    if (!quote.success) return;
    const confirmed = await storage.confirmWithdrawalQuote({
      telegramId,
      quoteId: quote.quote.quoteId,
      operationKey: 'queue-eligible-row',
    });
    expect(confirmed.success).toBe(true);
    if (!confirmed.success) return;

    const firstClaim = await db.claimNextWithdrawalPayout('worker-a', 1000);
    expect(firstClaim?.withdrawal.id).toBe(confirmed.withdrawal.id);
    expect(firstClaim?.fencingToken).toBe(1);
    expect(await db.claimNextWithdrawalPayout('worker-b', 1000)).toBeNull();

    vi.setSystemTime(new Date(Date.now() + 2000));
    const reclaimed = await db.claimNextWithdrawalPayout('worker-b', 1000);
    expect(reclaimed?.withdrawal.id).toBe(confirmed.withdrawal.id);
    expect(reclaimed?.fencingToken).toBe(2);
    expect(await db.persistSignedWithdrawalPayload({
      withdrawalId: confirmed.withdrawal.id,
      workerId: 'worker-a',
      fencingToken: 1,
      ciphertext: 'signed-boc',
      iv: 'iv',
      tag: 'tag',
      seqno: 4,
      validUntil: 9_999_999_999,
      messageHash: 'message-hash',
    })).toBe(false);
  });

  it('completes only an exact finalized transfer and never refunds it', async () => {
    const telegramId = 880011;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Finalized Player' });
    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(telegramId)!;
    user.balance_nano = '10000000000';
    user.balance_gram = 10;
    db.saveUser(user);
    const quote = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '2000000000',
      feeNano: '1000000',
      network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected valid quote');
    const confirmed = await storage.confirmWithdrawalQuote({
      telegramId,
      quoteId: quote.quote.quoteId,
      operationKey: 'finalized-confirm',
    });
    if (!confirmed.success) throw new Error('Expected confirmation');
    const claim = await db.claimNextWithdrawalPayout('worker-finalized', 60_000);
    if (!claim) throw new Error('Expected payout claim');

    expect(await db.finalizeWithdrawalPayout({
      withdrawalId: claim.withdrawal.id,
      workerId: 'worker-finalized',
      fencingToken: claim.fencingToken,
      finalized: false,
      destination: claim.withdrawal.wallet_address,
      amountNano: claim.withdrawal.net_amount_nano,
      txHash: 'not-final',
      actualFeeNano: '500000',
    })).toMatchObject({ success: false });
    expect(await db.finalizeWithdrawalPayout({
      withdrawalId: claim.withdrawal.id,
      workerId: 'worker-finalized',
      fencingToken: claim.fencingToken,
      finalized: true,
      destination: 'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ',
      amountNano: claim.withdrawal.net_amount_nano,
      txHash: 'wrong-destination',
      actualFeeNano: '500000',
    })).toMatchObject({ success: false });
    expect(await db.finalizeWithdrawalPayout({
      withdrawalId: claim.withdrawal.id,
      workerId: 'worker-finalized',
      fencingToken: claim.fencingToken,
      finalized: true,
      destination: claim.withdrawal.wallet_address,
      amountNano: claim.withdrawal.net_amount_nano,
      txHash: 'final-hash',
      actualFeeNano: '500000',
    })).toMatchObject({ success: true, status: 'completed' });
    expect(await db.refundFailedWithdrawal({
      withdrawalId: claim.withdrawal.id,
      workerId: 'worker-finalized',
      fencingToken: claim.fencingToken,
      finalizedFailure: true,
      evidenceHash: 'contradicting-failure',
    })).toMatchObject({ success: false });
  });

  it('refunds a definite finalized failure once and restores the gross debit', async () => {
    const telegramId = 880012;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Refund Player' });
    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(telegramId)!;
    user.balance_nano = '5000000000';
    user.balance_gram = 5;
    db.saveUser(user);
    const quote = await storage.createWithdrawalQuote({
      telegramId,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      grossAmountNano: '2000000000',
      feeNano: '1000000',
      network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected valid quote');
    const confirmed = await storage.confirmWithdrawalQuote({
      telegramId,
      quoteId: quote.quote.quoteId,
      operationKey: 'refund-confirm',
    });
    if (!confirmed.success) throw new Error('Expected confirmation');
    const claim = await db.claimNextWithdrawalPayout('worker-refund', 60_000);
    if (!claim) throw new Error('Expected payout claim');

    const failInput = {
      withdrawalId: claim.withdrawal.id,
      workerId: 'worker-refund',
      fencingToken: claim.fencingToken,
      finalizedFailure: true,
      evidenceHash: 'final-failure-hash',
    };
    expect(await db.refundFailedWithdrawal(failInput)).toMatchObject({ success: true, refunded: true });
    expect(await db.refundFailedWithdrawal(failInput)).toMatchObject({ success: true, refunded: false });
    expect(db.getUserByTelegramId(telegramId)?.balance_nano).toBe('5000000000');
    expect(db.getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'withdrawal_refund')).toHaveLength(1);
  });
});
