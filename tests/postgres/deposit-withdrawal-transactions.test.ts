import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabasePool } from '../../server/db';
import { runMigrations } from '../../server/db/migrate';
import { StorageService } from '../../server/storage';

const enabled = process.env.RUN_POSTGRES_TESTS === 'true' && Boolean(process.env.TEST_DATABASE_URL);
const wallet = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
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
  });
});
