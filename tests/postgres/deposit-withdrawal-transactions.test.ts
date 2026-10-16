import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Address } from '@ton/core';
import { DatabasePool } from '../../server/db';
import { runMigrations } from '../../server/db/migrate';
import { StorageService } from '../../server/storage';

const enabled = process.env.RUN_POSTGRES_TESTS === 'true' && Boolean(process.env.TEST_DATABASE_URL);
const wallet = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
const alternateWallet = 'EQBvW8Z5huBkMJYdnfAEM5JqTNt2XYBaxLVTNVGZDp0_Av';
let nextTelegramId = Date.now() * 1000;

describe.skipIf(!enabled)('PostgreSQL deposit and withdrawal transaction guarantees', () => {
  let db: DatabasePool;
  let storage: StorageService;
  const telegramIds: number[] = [];

  const newTelegramId = () => {
    const id = ++nextTelegramId;
    telegramIds.push(id);
    return id;
  };

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required for the PostgreSQL suite');
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
    if (!databaseName.endsWith('_test')) throw new Error('Refusing to run PostgreSQL tests outside a database ending in _test');

    await runMigrations(databaseUrl);
    db = DatabasePool.getInstance();
    if (!db.usesPersistentDatabase()) throw new Error('PostgreSQL suite unexpectedly resolved to the in-memory database');
    storage = new StorageService();
    process.env.TON_DEPOSIT_ADDRESS = wallet;
    process.env.TON_NETWORK = 'testnet';
    process.env.PAYOUT_NETWORK = 'mainnet';
    process.env.PAYOUT_MIN_WITHDRAWAL_NANO = '100000000';
    process.env.PAYOUT_MAX_WITHDRAWAL_NANO = '5000000000';
    process.env.PAYOUT_USER_DAILY_LIMIT_NANO = '6000000000';
    process.env.PAYOUT_GLOBAL_DAILY_LIMIT_NANO = '999999999999999999999999999999999999';
  });

  afterAll(async () => {
    if (db && telegramIds.length) {
      await db.withTransaction(async (client) => {
        await client.query('DELETE FROM transactions WHERE user_id IN (SELECT id FROM users WHERE telegram_id = ANY($1::bigint[]))', [telegramIds]);
        await client.query('UPDATE withdrawals SET quote_id = NULL WHERE telegram_id = ANY($1::bigint[])', [telegramIds]);
        await client.query("UPDATE withdrawal_quotes SET status = 'expired', consumed_withdrawal_id = NULL WHERE telegram_id = ANY($1::bigint[])", [telegramIds]);
        await client.query('DELETE FROM withdrawals WHERE telegram_id = ANY($1::bigint[])', [telegramIds]);
        await client.query('DELETE FROM withdrawal_quotes WHERE telegram_id = ANY($1::bigint[])', [telegramIds]);
        await client.query('DELETE FROM deposit_intents WHERE telegram_id = ANY($1::bigint[])', [telegramIds]);
        await client.query('DELETE FROM users WHERE telegram_id = ANY($1::bigint[])', [telegramIds]);
      });
    }
    await db?.close();
  });

  async function createFundedUser(balanceNano: string) {
    const telegramId = newTelegramId();
    const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'Postgres Economy Test' });
    await db.query('UPDATE users SET balance_nano = $1, balance_gram = ROUND($1::numeric / 1000000000.0, 9) WHERE telegram_id = $2', [balanceNano, telegramId]);
    return { telegramId, userId: user.id };
  }

  it('updates an existing funded user profile without violating balance-unit consistency', async () => {
    const { telegramId } = await createFundedUser('1250000000');

    const updated = await storage.getOrCreateUser({
      id: telegramId,
      first_name: 'Updated PostgreSQL Profile',
      username: `updated_${telegramId}`,
    });

    expect(updated.first_name).toBe('Updated PostgreSQL Profile');
    expect(updated.balance_nano).toBe('1250000000');
    expect(updated.balance_gram).toBe(1.25);
  });

  it('serializes concurrent confirmations and credits one deposit once', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1250000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });
    const submitted = await storage.recordPendingDeposit({
      intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
      amountNano: '1250000000', boc: `pg-boc-${intent.id}`, network: 'testnet',
    });
    expect(submitted.success).toBe(true);

    const results = await Promise.all([
      storage.confirmDeposit(intent.id, `pg-deposit-${intent.id}`),
      storage.confirmDeposit(intent.id, `pg-deposit-${intent.id}`),
    ]);

    expect(results.every((result) => result.success)).toBe(true);
    const storedUser = await db.query<{ balance_nano: string }>('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [telegramId]);
    const ledger = await db.query('SELECT id FROM transactions WHERE type = $1 AND tx_hash = $2', ['deposit', `pg-deposit-${intent.id}`]);
    expect(storedUser.rows[0].balance_nano).toBe('1250000000');
    expect(ledger.rowCount).toBe(1);
  });

  it('allows a BOC to be claimed by only one intent under concurrent submission', async () => {
    const [firstId, secondId] = [newTelegramId(), newTelegramId()];
    await storage.getOrCreateUser({ id: firstId, first_name: 'BOC First' });
    await storage.getOrCreateUser({ id: secondId, first_name: 'BOC Second' });
    const [first, second] = await Promise.all([firstId, secondId].map((telegramId) => storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    })));
    const boc = `pg-shared-boc-${first.id}`;
    const results = await Promise.all([first, second].map((intent, index) => storage.recordPendingDeposit({
      intentId: intent.id, telegramId: index === 0 ? firstId : secondId,
      walletAddress: wallet, depositAddress: wallet, amountNano: '1000000000', boc, network: 'testnet',
    })));

    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.filter((result) => !result.success)).toHaveLength(1);
    const claimed = await db.query('SELECT id FROM deposit_intents WHERE boc = $1', [boc]);
    expect(claimed.rowCount).toBe(1);
  });

  it('prevents one on-chain transaction hash from crediting two different intents', async () => {
    const firstId = newTelegramId();
    const secondId = newTelegramId();
    await storage.getOrCreateUser({ id: firstId, first_name: 'Hash First' });
    await storage.getOrCreateUser({ id: secondId, first_name: 'Hash Second' });
    const telegramIds = [firstId, secondId];
    const intents = await Promise.all(telegramIds.map(async (telegramId, index) => {
      const intent = await storage.createDepositIntent({
        telegramId, amountNano: '2000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
      });
      const submitted = await storage.recordPendingDeposit({
        intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
        amountNano: '2000000000', boc: `pg-hash-boc-${intent.id}-${index}`, network: 'testnet',
      });
      expect(submitted.success).toBe(true);
      return intent;
    }));
    const hash = `pg-shared-chain-hash-${intents[0].id}`;

    const results = await Promise.allSettled(intents.map((intent) => storage.confirmDeposit(intent.id, hash)));

    expect(results.filter((result) => result.status === 'fulfilled' && result.value.success)).toHaveLength(1);
    const balances = await db.query<{ total: string }>(
      'SELECT COALESCE(SUM(balance_nano), 0)::text AS total FROM users WHERE telegram_id = ANY($1::bigint[])', [telegramIds]
    );
    const ledger = await db.query('SELECT id FROM transactions WHERE type = $1 AND tx_hash = $2', ['deposit', hash]);
    expect(balances.rows[0].total).toBe('2000000000');
    expect(ledger.rowCount).toBe(1);
  });

  it('serializes concurrent same-quote confirmations to one withdrawal debit', async () => {
    const { telegramId, userId } = await createFundedUser('5000000000');
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '2000000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected a valid quote');

    const results = await Promise.all([1, 2, 3].map((index) => storage.confirmWithdrawalQuote({
      telegramId, quoteId: quote.quote.quoteId, operationKey: `pg-same-quote-${index}-${telegramId}`,
    })));

    expect(results.every((result) => result.success)).toBe(true);
    expect(new Set(results.map((result) => result.success && result.withdrawal.id)).size).toBe(1);
    const account = await db.query<{ balance_nano: string }>('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [telegramId]);
    const ledger = await db.query('SELECT id FROM transactions WHERE user_id = $1 AND type = $2', [userId, 'withdraw']);
    const withdrawals = await db.query('SELECT id FROM withdrawals WHERE quote_id = $1', [quote.quote.quoteId]);
    expect(account.rows[0].balance_nano).toBe('3000000000');
    expect(ledger.rowCount).toBe(1);
    expect(withdrawals.rowCount).toBe(1);
  });

  it('enforces the global daily cap across users in concurrent transactions', async () => {
    const previousLimit = process.env.PAYOUT_GLOBAL_DAILY_LIMIT_NANO;
    const first = await createFundedUser('8000000000');
    const second = await createFundedUser('8000000000');
    const quotes = await Promise.all([first, second].map(({ telegramId }) => storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '4000000000', feeNano: '1000000', network: 'mainnet',
    })));
    const utcStart = new Date();
    utcStart.setUTCHours(0, 0, 0, 0);
    const prior = await db.query<{ total: string }>(
      'SELECT COALESCE(SUM(amount_nano), 0)::text AS total FROM withdrawals WHERE payout_eligible = TRUE AND created_at >= $1', [utcStart]
    );
    process.env.PAYOUT_GLOBAL_DAILY_LIMIT_NANO = (BigInt(prior.rows[0].total) + 4000000000n).toString();
    try {
      const inputs = [first, second];
      const results = await Promise.all(quotes.map((quote, index) => {
        if (!quote.success) throw new Error('Expected a valid quote');
        return storage.confirmWithdrawalQuote({
          telegramId: inputs[index].telegramId,
          quoteId: quote.quote.quoteId,
          operationKey: `pg-global-cap-${index}-${inputs[index].telegramId}`,
        });
      }));

      expect(results.filter((result) => result.success)).toHaveLength(1);
      expect(results.filter((result) => !result.success && result.error?.includes('Global daily withdrawal limit'))).toHaveLength(1);
    } finally {
      process.env.PAYOUT_GLOBAL_DAILY_LIMIT_NANO = previousLimit;
    }
  });

  it('rejects creating a deposit intent for an account that does not exist', async () => {
    await expect(storage.createDepositIntent({
      telegramId: newTelegramId(), amountNano: '1000000000', walletAddress: wallet,
      depositAddress: wallet, network: 'testnet',
    })).rejects.toThrow('Account not found');
  });

  it('rejects submitting a signed BOC for an unknown deposit intent', async () => {
    const { telegramId } = await createFundedUser('0');
    const result = await storage.recordPendingDeposit({
      intentId: '00000000-0000-4000-8000-000000000000', telegramId, walletAddress: wallet,
      depositAddress: wallet, amountNano: '1000000000', boc: 'missing-intent-boc', network: 'testnet',
    });

    expect(result).toMatchObject({ success: false, error: 'DEPOSIT_INTENT_NOT_FOUND' });
  });

  it('prevents another account from cancelling a deposit intent', async () => {
    const owner = await createFundedUser('0');
    const other = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId: owner.telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });

    const result = await storage.cancelDepositIntent(intent.id, other.telegramId);
    const stored = await db.query<{ status: string }>('SELECT status FROM deposit_intents WHERE id = $1', [intent.id]);

    expect(result).toMatchObject({ success: false, error: 'Unauthorized' });
    expect(stored.rows[0].status).toBe('pending');
  });

  it('cancels a pending deposit intent without touching the user balance', async () => {
    const { telegramId } = await createFundedUser('2500000000');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });

    expect(await storage.cancelDepositIntent(intent.id, telegramId)).toMatchObject({ success: true });
    const state = await db.query<{ status: string; balance_nano: string }>(
      `SELECT d.status, u.balance_nano::text FROM deposit_intents d JOIN users u ON u.telegram_id = d.telegram_id WHERE d.id = $1`, [intent.id]
    );
    expect(state.rows[0]).toEqual({ status: 'cancelled', balance_nano: '2500000000' });
  });

  it('does not bind a BOC after the intent was cancelled', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });
    await storage.cancelDepositIntent(intent.id, telegramId);

    const result = await storage.recordPendingDeposit({
      intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
      amountNano: '1000000000', boc: 'cancelled-intent-boc', network: 'testnet',
    });
    const stored = await db.query<{ boc: string | null; status: string }>('SELECT boc, status FROM deposit_intents WHERE id = $1', [intent.id]);

    expect(result).toMatchObject({ success: false, error: 'Deposit intent is not pending' });
    expect(stored.rows[0]).toEqual({ boc: null, status: 'cancelled' });
  });

  it('rejects a signed deposit amount that differs by one nanogram', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });

    const result = await storage.recordPendingDeposit({
      intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
      amountNano: '1000000001', boc: 'amount-mismatch-boc', network: 'testnet',
    });

    expect(result).toMatchObject({ success: false, error: 'DEPOSIT_AMOUNT_MISMATCH' });
    expect((await db.query('SELECT boc FROM deposit_intents WHERE id = $1', [intent.id])).rows[0].boc).toBeNull();
  });

  it('rejects a signed transfer sent to an address different from its intent', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: alternateWallet, network: 'testnet',
    });

    const result = await storage.recordPendingDeposit({
      intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
      amountNano: '1000000000', boc: 'destination-mismatch-boc', network: 'testnet',
    });

    expect(result).toMatchObject({ success: false, error: 'DEPOSIT_ADDRESS_MISMATCH' });
    expect((await db.query('SELECT boc FROM deposit_intents WHERE id = $1', [intent.id])).rows[0].boc).toBeNull();
  });

  it('rejects a signed deposit from the wrong configured network', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });

    const result = await storage.recordPendingDeposit({
      intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
      amountNano: '1000000000', boc: 'wrong-network-boc', network: 'mainnet',
    });

    expect(result).toMatchObject({ success: false, error: 'Invalid network' });
    expect((await db.query('SELECT boc FROM deposit_intents WHERE id = $1', [intent.id])).rows[0].boc).toBeNull();
  });

  it('rejects a sender wallet different from the wallet reserved in the intent', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });

    const result = await storage.recordPendingDeposit({
      intentId: intent.id, telegramId, walletAddress: alternateWallet, depositAddress: wallet,
      amountNano: '1000000000', boc: 'wrong-sender-boc', network: 'testnet',
    });

    expect(result).toMatchObject({ success: false, error: 'DEPOSIT_WALLET_MISMATCH' });
    expect((await db.query('SELECT boc FROM deposit_intents WHERE id = $1', [intent.id])).rows[0].boc).toBeNull();
  });

  it('expires an intent before accepting a BOC after its deadline', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });
    await db.query('UPDATE deposit_intents SET expires_at = CURRENT_TIMESTAMP - INTERVAL \'1 second\' WHERE id = $1', [intent.id]);

    const result = await storage.recordPendingDeposit({
      intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
      amountNano: '1000000000', boc: 'expired-intent-boc', network: 'testnet',
    });
    const stored = await db.query<{ status: string; boc: string | null }>('SELECT status, boc FROM deposit_intents WHERE id = $1', [intent.id]);

    expect(result).toMatchObject({ success: false, error: 'DEPOSIT_INTENT_EXPIRED' });
    expect(stored.rows[0]).toEqual({ status: 'expired', boc: null });
  });

  it('expires a pending intent at the exact deadline but not before it', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });
    const deadline = new Date(Date.now() + 60_000);
    await db.query('UPDATE deposit_intents SET expires_at = $2 WHERE id = $1', [intent.id, deadline]);

    expect(await storage.expireDepositIntentIfDue(intent.id, new Date(deadline.getTime() - 1))).toBe(false);
    expect(await storage.expireDepositIntentIfDue(intent.id, deadline)).toBe(true);
    expect((await db.query('SELECT status FROM deposit_intents WHERE id = $1', [intent.id])).rows[0].status).toBe('expired');
  });

  it('does not create a withdrawal quote for an unknown account', async () => {
    const result = await storage.createWithdrawalQuote({
      telegramId: newTelegramId(), walletAddress: wallet, grossAmountNano: '1000000000', feeNano: '1000000', network: 'mainnet',
    });
    expect(result).toMatchObject({ success: false, error: 'Account not found' });
  });

  it('rejects withdrawal quotes for Testnet', async () => {
    const { telegramId } = await createFundedUser('5000000000');
    const result = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '1000000000', feeNano: '1000000', network: 'testnet',
    });
    expect(result).toMatchObject({ success: false, error: 'Only TON Mainnet withdrawals are supported' });
  });

  it('rejects a malformed withdrawal destination before storing a quote', async () => {
    const { telegramId } = await createFundedUser('5000000000');
    const result = await storage.createWithdrawalQuote({
      telegramId, walletAddress: 'not-a-ton-address', grossAmountNano: '1000000000', feeNano: '1000000', network: 'mainnet',
    });
    expect(result).toMatchObject({ success: false, error: 'Invalid withdrawal address or amount' });
    expect((await db.query('SELECT id FROM withdrawal_quotes WHERE telegram_id = $1', [telegramId])).rowCount).toBe(0);
  });

  it('rejects a quote whose fee equals or exceeds the gross amount', async () => {
    const { telegramId } = await createFundedUser('5000000000');
    for (const feeNano of ['1000000000', '1000000001']) {
      const result = await storage.createWithdrawalQuote({
        telegramId, walletAddress: wallet, grossAmountNano: '1000000000', feeNano, network: 'mainnet',
      });
      expect(result).toMatchObject({ success: false, error: 'The quoted fee must be less than the withdrawal amount' });
    }
    expect((await db.query('SELECT id FROM withdrawal_quotes WHERE telegram_id = $1', [telegramId])).rowCount).toBe(0);
  });

  it('rejects withdrawal amounts below the configured minimum', async () => {
    const { telegramId } = await createFundedUser('5000000000');
    const result = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '99999999', feeNano: '1', network: 'mainnet',
    });
    expect(result).toMatchObject({ success: false, error: 'Withdrawal amount is outside configured limits' });
  });

  it('rejects withdrawal amounts above the configured maximum', async () => {
    const { telegramId } = await createFundedUser('6000000000');
    const result = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '5000000001', feeNano: '1', network: 'mainnet',
    });
    expect(result).toMatchObject({ success: false, error: 'Withdrawal amount is outside configured limits' });
  });

  it('prevents a different account from confirming a withdrawal quote', async () => {
    const owner = await createFundedUser('5000000000');
    const other = await createFundedUser('5000000000');
    const quote = await storage.createWithdrawalQuote({
      telegramId: owner.telegramId, walletAddress: wallet, grossAmountNano: '1000000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected a valid quote');

    const result = await storage.confirmWithdrawalQuote({
      telegramId: other.telegramId, quoteId: quote.quote.quoteId, operationKey: `wrong-owner-${other.telegramId}`,
    });

    expect(result).toMatchObject({ success: false, error: 'Withdrawal quote ownership mismatch' });
    expect((await db.query('SELECT status FROM withdrawal_quotes WHERE id = $1', [quote.quote.quoteId])).rows[0].status).toBe('quoted');
    expect((await db.query('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [other.telegramId])).rows[0].balance_nano).toBe('5000000000');
  });

  it('rechecks the current balance when confirming a previously valid withdrawal quote', async () => {
    const { telegramId } = await createFundedUser('2000000000');
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '1500000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected a valid quote');
    await db.query('UPDATE users SET balance_nano = 1000000000, balance_gram = 1 WHERE telegram_id = $1', [telegramId]);

    const result = await storage.confirmWithdrawalQuote({
      telegramId, quoteId: quote.quote.quoteId, operationKey: `balance-changed-${telegramId}`,
    });

    expect(result).toMatchObject({ success: false, error: 'Insufficient balance' });
    expect((await db.query('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [telegramId])).rows[0].balance_nano).toBe('1000000000');
    expect((await db.query('SELECT status FROM withdrawal_quotes WHERE id = $1', [quote.quote.quoteId])).rows[0].status).toBe('quoted');
  });

  it('expires a withdrawal quote and preserves the balance when confirmation arrives late', async () => {
    const { telegramId } = await createFundedUser('5000000000');
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '1000000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected a valid quote');
    await db.query('UPDATE withdrawal_quotes SET expires_at = CURRENT_TIMESTAMP - INTERVAL \'1 second\' WHERE id = $1', [quote.quote.quoteId]);

    const result = await storage.confirmWithdrawalQuote({
      telegramId, quoteId: quote.quote.quoteId, operationKey: `expired-quote-${telegramId}`,
    });

    expect(result).toMatchObject({ success: false, error: 'Withdrawal quote expired' });
    expect((await db.query('SELECT status FROM withdrawal_quotes WHERE id = $1', [quote.quote.quoteId])).rows[0].status).toBe('expired');
    expect((await db.query('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [telegramId])).rows[0].balance_nano).toBe('5000000000');
  });

  it('rejects a withdrawal that exceeds the user daily cap without debiting funds', async () => {
    const previousLimit = process.env.PAYOUT_USER_DAILY_LIMIT_NANO;
    const { telegramId } = await createFundedUser('5000000000');
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '2000000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected a valid quote');
    process.env.PAYOUT_USER_DAILY_LIMIT_NANO = '1000000000';
    try {
      const result = await storage.confirmWithdrawalQuote({
        telegramId, quoteId: quote.quote.quoteId, operationKey: `user-cap-${telegramId}`,
      });
      expect(result).toMatchObject({ success: false, error: 'User daily withdrawal limit exceeded' });
      expect((await db.query('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [telegramId])).rows[0].balance_nano).toBe('5000000000');
    } finally {
      process.env.PAYOUT_USER_DAILY_LIMIT_NANO = previousLimit;
    }
  });

  it('rejects zero-value deposit intents in PostgreSQL', async () => {
    const { telegramId } = await createFundedUser('0');
    await expect(storage.createDepositIntent({
      telegramId, amountNano: '0', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    })).rejects.toThrow('Deposit amount must be greater than zero');
    expect((await db.query('SELECT id FROM deposit_intents WHERE telegram_id = $1', [telegramId])).rowCount).toBe(0);
  });

  it('rejects fractional nanogram deposit amounts in PostgreSQL', async () => {
    const { telegramId } = await createFundedUser('0');
    await expect(storage.createDepositIntent({
      telegramId, amountNano: '1.5', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    })).rejects.toThrow('Invalid deposit amount');
    expect((await db.query('SELECT id FROM deposit_intents WHERE telegram_id = $1', [telegramId])).rowCount).toBe(0);
  });

  it('rejects malformed integer deposit amounts in PostgreSQL', async () => {
    const { telegramId } = await createFundedUser('0');
    await expect(storage.createDepositIntent({
      telegramId, amountNano: '1e9', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    })).rejects.toThrow('Invalid deposit amount');
    expect((await db.query('SELECT id FROM deposit_intents WHERE telegram_id = $1', [telegramId])).rowCount).toBe(0);
  });

  it('treats cancellation of an unknown deposit intent as a safe failure', async () => {
    const { telegramId } = await createFundedUser('0');
    const result = await storage.cancelDepositIntent('00000000-0000-4000-8000-000000000000', telegramId);
    expect(result).toMatchObject({ success: false, error: 'Deposit intent not found' });
  });

  it('does not allow an unknown account to cancel a deposit intent', async () => {
    const result = await storage.cancelDepositIntent('00000000-0000-4000-8000-000000000000', newTelegramId());
    expect(result).toMatchObject({ success: false, error: 'Account not found' });
  });

  it('does not credit a draft deposit intent before a BOC has been submitted', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });

    const result = await storage.confirmDeposit(intent.id, `draft-confirm-${intent.id}`);
    const state = await db.query<{ balance_nano: string; status: string; ledger_count: number }>(
      `SELECT u.balance_nano::text, d.status,
              (SELECT COUNT(*)::int FROM transactions t WHERE t.user_id = u.id AND t.type = 'deposit') AS ledger_count
         FROM users u JOIN deposit_intents d ON d.telegram_id = u.telegram_id WHERE d.id = $1`, [intent.id]
    );
    expect(result).toMatchObject({ success: false, error: 'Deposit transaction has not been submitted' });
    expect(state.rows[0]).toEqual({ balance_nano: '0', status: 'pending', ledger_count: 0 });
  });

  it('rejects an empty chain transaction hash without crediting a signed deposit', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });
    const pending = await storage.recordPendingDeposit({
      intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
      amountNano: '1000000000', boc: `empty-hash-${intent.id}`, network: 'testnet',
    });
    expect(pending.success).toBe(true);

    const result = await storage.confirmDeposit(intent.id, '  ');
    expect(result).toMatchObject({ success: false, error: 'Invalid deposit transaction hash' });
    expect((await db.query('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [telegramId])).rows[0].balance_nano).toBe('0');
  });

  it('keeps a submitted deposit verifiable when its owner attempts to cancel it', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });
    const boc = `signed-cancel-${intent.id}`;
    const submitted = await storage.recordPendingDeposit({
      intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
      amountNano: '1000000000', boc, network: 'testnet',
    });
    expect(submitted.success).toBe(true);

    const cancellation = await storage.cancelDepositIntent(intent.id, telegramId);
    const stored = await db.query<{ status: string; boc: string }>('SELECT status, boc FROM deposit_intents WHERE id = $1', [intent.id]);
    const pending = await storage.getPendingDepositIntents();
    const confirmation = await storage.confirmDeposit(intent.id, `signed-cancel-hash-${intent.id}`);

    expect(cancellation).toMatchObject({ success: false, error: 'A signed deposit is already being verified and cannot be cancelled' });
    expect(stored.rows[0]).toEqual({ status: 'pending', boc });
    expect(pending.some((item) => item.id === intent.id)).toBe(true);
    expect(confirmation.success).toBe(true);
  });

  it('accepts retrying the same BOC for its already-bound deposit intent', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });
    const submission = {
      intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
      amountNano: '1000000000', boc: `same-boc-retry-${intent.id}`, network: 'testnet' as const,
    };

    const first = await storage.recordPendingDeposit(submission);
    const retry = await storage.recordPendingDeposit(submission);
    const state = await db.query<{ count: number }>('SELECT COUNT(*)::int AS count FROM deposit_intents WHERE boc = $1', [submission.boc]);

    expect(first.success).toBe(true);
    expect(retry.success).toBe(true);
    expect(state.rows[0].count).toBe(1);
  });

  it('does not change the original transaction hash when a confirmed deposit is retried', async () => {
    const { telegramId } = await createFundedUser('0');
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1250000000', walletAddress: wallet, depositAddress: wallet, network: 'testnet',
    });
    await storage.recordPendingDeposit({
      intentId: intent.id, telegramId, walletAddress: wallet, depositAddress: wallet,
      amountNano: '1250000000', boc: `retry-hash-boc-${intent.id}`, network: 'testnet',
    });
    const originalHash = `first-confirm-${intent.id}`;

    expect((await storage.confirmDeposit(intent.id, originalHash)).success).toBe(true);
    expect((await storage.confirmDeposit(intent.id, `second-confirm-${intent.id}`)).success).toBe(false);
    const state = await db.query<{ balance_nano: string; tx_hash: string; ledger_count: number }>(
      `SELECT u.balance_nano::text, d.tx_hash,
              (SELECT COUNT(*)::int FROM transactions t WHERE t.user_id = u.id AND t.type = 'deposit') AS ledger_count
         FROM users u JOIN deposit_intents d ON d.telegram_id = u.telegram_id WHERE d.id = $1`, [intent.id]
    );
    expect(state.rows[0]).toEqual({ balance_nano: '1250000000', tx_hash: originalHash, ledger_count: 1 });
  });

  it('accepts a valid zero-fee withdrawal quote with the full gross amount as net', async () => {
    const { telegramId } = await createFundedUser('2000000000');
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '1000000000', feeNano: '0', network: 'mainnet',
    });
    expect(quote.success).toBe(true);
    if (!quote.success) return;
    expect(quote.quote).toMatchObject({ grossAmountNano: '1000000000', feeNano: '0', netAmountNano: '1000000000' });
  });

  it('canonicalizes an alternate friendly withdrawal address before saving the quote', async () => {
    const { telegramId } = await createFundedUser('2000000000');
    const alternateFormat = Address.parse(wallet).toString({ urlSafe: false, bounceable: false, testOnly: false });
    const expected = Address.parse(alternateFormat).toString({ urlSafe: true, bounceable: true, testOnly: false });
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: alternateFormat, grossAmountNano: '1000000000', feeNano: '1000000', network: 'mainnet',
    });
    expect(quote.success).toBe(true);
    if (!quote.success) return;
    expect(quote.quote.walletAddress).toBe(expected);
  });

  it('persists the withdrawal fee and exact net amount without debiting at quote time', async () => {
    const { telegramId, userId } = await createFundedUser('2000000000');
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '1500000000', feeNano: '1234567', network: 'mainnet',
    });
    expect(quote.success).toBe(true);
    if (!quote.success) return;
    const state = await db.query<{ balance_nano: string; fee_nano: string; gross_amount_nano: string; net_amount_nano: string; ledger_count: number }>(
      `SELECT u.balance_nano::text, q.fee_nano::text, q.gross_amount_nano::text, q.net_amount_nano::text,
              (SELECT COUNT(*)::int FROM transactions t WHERE t.user_id = u.id AND t.type = 'withdraw') AS ledger_count
         FROM users u JOIN withdrawal_quotes q ON q.telegram_id = u.telegram_id WHERE q.id = $1`, [quote.quote.quoteId]
    );
    expect(state.rows[0]).toEqual({
      balance_nano: '2000000000', fee_nano: '1234567', gross_amount_nano: '1500000000',
      net_amount_nano: '1498765433', ledger_count: 0,
    });
    expect(userId).toBeTruthy();
  });

  it('allows and debits exactly the configured minimum withdrawal', async () => {
    const { telegramId } = await createFundedUser('100000000');
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '100000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected exact-minimum quote');
    const result = await storage.confirmWithdrawalQuote({ telegramId, quoteId: quote.quote.quoteId, operationKey: `exact-min-${telegramId}` });

    expect(result.success).toBe(true);
    expect((await db.query('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [telegramId])).rows[0].balance_nano).toBe('0');
  });

  it('allows and debits exactly the configured maximum withdrawal', async () => {
    const { telegramId } = await createFundedUser('5000000000');
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '5000000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected exact-maximum quote');
    const result = await storage.confirmWithdrawalQuote({ telegramId, quoteId: quote.quote.quoteId, operationKey: `exact-max-${telegramId}` });

    expect(result.success).toBe(true);
    expect((await db.query('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [telegramId])).rows[0].balance_nano).toBe('0');
  });

  it('refuses to confirm a valid quote after automatic withdrawals are disabled', async () => {
    const previousNetwork = process.env.PAYOUT_NETWORK;
    const { telegramId } = await createFundedUser('2000000000');
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '1000000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Expected a valid quote');
    process.env.PAYOUT_NETWORK = 'testnet';
    try {
      const result = await storage.confirmWithdrawalQuote({
        telegramId, quoteId: quote.quote.quoteId, operationKey: `disabled-worker-${telegramId}`,
      });
      expect(result).toMatchObject({ success: false, error: 'Automatic mainnet withdrawals are not configured safely' });
      expect((await db.query('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [telegramId])).rows[0].balance_nano).toBe('2000000000');
    } finally {
      process.env.PAYOUT_NETWORK = previousNetwork;
    }
  });

  it('rejects malformed withdrawal nanogram input without persisting a quote', async () => {
    const { telegramId } = await createFundedUser('2000000000');
    const result = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '1e9', feeNano: '1000000', network: 'mainnet',
    });
    expect(result).toMatchObject({ success: false, error: 'Invalid withdrawal address or amount' });
    expect((await db.query('SELECT id FROM withdrawal_quotes WHERE telegram_id = $1', [telegramId])).rowCount).toBe(0);
  });

  it('rejects a negative server-estimated withdrawal fee without storing a quote', async () => {
    const { telegramId } = await createFundedUser('2000000000');
    const result = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '1000000000', feeNano: '-1', network: 'mainnet',
    });
    expect(result.success).toBe(false);
    expect((await db.query('SELECT id FROM withdrawal_quotes WHERE telegram_id = $1', [telegramId])).rowCount).toBe(0);
  });

  it('rejects withdrawal quoting when configured limits are incomplete', async () => {
    const previousMinimum = process.env.PAYOUT_MIN_WITHDRAWAL_NANO;
    const { telegramId } = await createFundedUser('2000000000');
    delete process.env.PAYOUT_MIN_WITHDRAWAL_NANO;
    try {
      const result = await storage.createWithdrawalQuote({
        telegramId, walletAddress: wallet, grossAmountNano: '1000000000', feeNano: '1000000', network: 'mainnet',
      });
      expect(result).toMatchObject({ success: false, error: 'Withdrawal limits are not configured safely' });
    } finally {
      process.env.PAYOUT_MIN_WITHDRAWAL_NANO = previousMinimum;
    }
  });

  it('rejects reusing one operation key for a different withdrawal quote', async () => {
    const { telegramId } = await createFundedUser('3000000000');
    const quotes = await Promise.all([1, 2].map(() => storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '1000000000', feeNano: '1000000', network: 'mainnet',
    })));
    if (quotes.some((quote) => !quote.success)) throw new Error('Expected valid quotes');
    const first = quotes[0];
    const second = quotes[1];
    if (!first.success || !second.success) throw new Error('Expected valid quotes');
    const key = `shared-operation-${telegramId}`;

    const accepted = await storage.confirmWithdrawalQuote({ telegramId, quoteId: first.quote.quoteId, operationKey: key });
    const rejected = await storage.confirmWithdrawalQuote({ telegramId, quoteId: second.quote.quoteId, operationKey: key });

    expect(accepted.success).toBe(true);
    expect(rejected).toMatchObject({ success: false, error: 'Idempotency key is already linked to another withdrawal' });
    expect((await db.query('SELECT balance_nano::text FROM users WHERE telegram_id = $1', [telegramId])).rows[0].balance_nano).toBe('2000000000');
    expect((await db.query('SELECT COUNT(*)::int AS count FROM withdrawals WHERE telegram_id = $1', [telegramId])).rows[0].count).toBe(1);
  });
});
