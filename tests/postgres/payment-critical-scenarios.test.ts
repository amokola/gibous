import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabasePool } from '../../server/db';
import { runMigrations } from '../../server/db/migrate';
import { StorageService } from '../../server/storage';

const enabled = process.env.RUN_POSTGRES_TESTS === 'true' && Boolean(process.env.TEST_DATABASE_URL);
const vault = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
const sender = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
const cases = Array.from({ length: 20 }, (_, index) => index + 1);
const concurrencyAmounts = ['1', '9', '10', '99', '100', '999999', '100000001', '999999999',
  '1000000001', '9007199254740991', '9007199254740992', '9007199254740993',
  '12345678901234567', '999999999999999999', '1000000000000000000',
  '123456789012345678901', '999999999999999999999', '999999999999999999999999',
  '999999999999999999999999999', '999999999999999999999999999999'];

describe.skipIf(!enabled)('PostgreSQL critical money movement scenarios', () => {
  let db: DatabasePool;
  let storage: StorageService;
  let nextId = Date.now() * 1000;
  const userIds: number[] = [];

  const newUser = async (balanceNano = '0') => {
    const telegramId = ++nextId;
    userIds.push(telegramId);
    const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'Critical payment case' });
    if (balanceNano !== '0') {
      await db.query('UPDATE users SET balance_nano = $1::numeric, balance_gram = ROUND($1::numeric / 1000000000.0, 9) WHERE telegram_id = $2', [balanceNano, telegramId]);
    }
    return { telegramId, userId: user.id };
  };

  const newIntent = async (telegramId: number, amountNano = '1000000000') => storage.createDepositIntent({
    telegramId, amountNano, walletAddress: sender, depositAddress: vault, network: 'testnet',
  });

  const submitIntent = async (telegramId: number, intentId: string, amountNano = '1000000000', boc = `critical-boc-${intentId}`) => storage.recordPendingDeposit({
    intentId, telegramId, walletAddress: sender, depositAddress: vault, amountNano, boc, network: 'testnet',
  });

  const newQuote = async (telegramId: number, grossAmountNano = '1000000000', feeNano = '1000000', address = vault) => storage.createWithdrawalQuote({
    telegramId, walletAddress: address, grossAmountNano, feeNano, network: 'mainnet',
  });

  const confirmedWithdrawal = async (telegramId: number, key: string, amount = '1000000000') => {
    const quote = await newQuote(telegramId, amount);
    if (!quote.success) throw new Error(`Quote setup failed: ${quote.error}`);
    const confirmed = await storage.confirmWithdrawalQuote({ telegramId, quoteId: quote.quote.quoteId, operationKey: key });
    if (!confirmed.success) throw new Error(`Withdrawal setup failed: ${confirmed.error}`);
    return confirmed.withdrawal;
  };

  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required');
    const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
    if (!databaseName.endsWith('_test')) throw new Error('Refusing to run against a database without the _test suffix');
    await runMigrations(databaseUrl);
    db = DatabasePool.getInstance();
    if (!db.usesPersistentDatabase()) throw new Error('Expected a persistent database connection');
    storage = new StorageService();
    process.env.TON_DEPOSIT_ADDRESS = vault;
    process.env.TON_NETWORK = 'testnet';
    process.env.PAYOUT_NETWORK = 'mainnet';
    process.env.PAYOUT_MIN_WITHDRAWAL_NANO = '100000000';
    process.env.PAYOUT_MAX_WITHDRAWAL_NANO = '5000000000';
    process.env.PAYOUT_USER_DAILY_LIMIT_NANO = '6000000000';
    process.env.PAYOUT_GLOBAL_DAILY_LIMIT_NANO = '999999999999999999999999999999999999';
  });

  afterAll(async () => {
    if (db && userIds.length) {
      await db.withTransaction(async (client) => {
        await client.query('DELETE FROM transactions WHERE user_id IN (SELECT id FROM users WHERE telegram_id = ANY($1::bigint[]))', [userIds]);
        await client.query('UPDATE withdrawals SET quote_id = NULL WHERE telegram_id = ANY($1::bigint[])', [userIds]);
        await client.query("UPDATE withdrawal_quotes SET status = 'expired', consumed_withdrawal_id = NULL WHERE telegram_id = ANY($1::bigint[])", [userIds]);
        await client.query('DELETE FROM withdrawals WHERE telegram_id = ANY($1::bigint[])', [userIds]);
        await client.query('DELETE FROM withdrawal_quotes WHERE telegram_id = ANY($1::bigint[])', [userIds]);
        await client.query('DELETE FROM deposit_intents WHERE telegram_id = ANY($1::bigint[])', [userIds]);
        await client.query('DELETE FROM users WHERE telegram_id = ANY($1::bigint[])', [userIds]);
      });
    }
    await db?.close();
  });

  describe('100 deposit scenarios: transaction uniqueness, state races, persistence, and rollback', () => {
    describe('cross-intent transaction-hash races', () => {
      it.each(cases)('hash-race stress profile %i credits at most one of up to eight intents', async (caseNo) => {
        const contestantCount = Math.min(caseNo + 1, 8);
        const owners = await Promise.all(Array.from({ length: contestantCount }, () => newUser()));
        const amounts = owners.map((_, index) => String((index + 1) * 1_000_000_000 + caseNo));
        const intents = await Promise.all(owners.map((owner, index) => newIntent(owner.telegramId, amounts[index])));
        await Promise.all(owners.map((owner, index) => submitIntent(owner.telegramId, intents[index].id, amounts[index])));
        const hash = `race-shared-chain-hash-${caseNo}`;
        const outcomes = await Promise.allSettled(intents.map((intent) => storage.confirmDeposit(intent.id, hash)));
        const rows = await db.query<{ status: string; telegram_id: string; amount_nano: string }>(
          'SELECT status, telegram_id::text, amount_nano::text FROM deposit_intents WHERE id = ANY($1::uuid[])', [intents.map((intent) => intent.id)]
        );
        const totalCredits = await db.query<{ amount: string; count: number }>(
          "SELECT COALESCE(SUM(amount_nano),0)::text AS amount, COUNT(*)::int AS count FROM transactions WHERE type = 'deposit' AND tx_hash = $1",
          [hash]
        );
        const balances = await db.query<{ total: string }>(
          'SELECT COALESCE(SUM(balance_nano),0)::text AS total FROM users WHERE telegram_id = ANY($1::bigint[])', [owners.map((owner) => owner.telegramId)]
        );

        const confirmed = rows.rows.filter((row) => row.status === 'confirmed');
        expect(outcomes.filter((result) => result.status === 'fulfilled' && result.value.success)).toHaveLength(1);
        expect(confirmed).toHaveLength(1);
        expect(totalCredits.rows[0]).toEqual({ amount: confirmed[0].amount_nano, count: 1 });
        expect(balances.rows[0].total).toBe(confirmed[0].amount_nano);
      });
    });

    describe('submission versus cancellation races', () => {
      it.each(cases)('keeps cancel/submit interleavings consistent with BOC state, ordering case %i', async (caseNo) => {
        const owner = await newUser();
        const intent = await newIntent(owner.telegramId);
        const boc = `cancel-submit-race-${caseNo}`;
        const submitDelay = (caseNo % 4) * 2;
        const cancelDelay = ((caseNo + 2) % 4) * 2;
        const schedule = (delay: number, action: () => Promise<any>) => new Promise<any>((resolve, reject) => {
          setTimeout(() => action().then(resolve, reject), delay);
        });
        const [submission, cancellation] = await Promise.all([
          schedule(submitDelay, () => submitIntent(owner.telegramId, intent.id, '1000000000', boc)),
          schedule(cancelDelay, () => storage.cancelDepositIntent(intent.id, owner.telegramId)),
        ]);
        const stored = await db.query<{ status: string; boc: string | null }>('SELECT status, boc FROM deposit_intents WHERE id = $1', [intent.id]);
        const state = stored.rows[0];

        expect((state.status === 'cancelled' && state.boc === null) || (state.status === 'pending' && state.boc === boc)).toBe(true);
        expect(submission.success).toBe(state.status === 'pending');
        expect(cancellation.success).toBe(state.status === 'cancelled');
        expect((await db.query('SELECT id FROM transactions WHERE user_id = $1', [owner.userId])).rowCount).toBe(0);
      });
    });

    describe('exact PostgreSQL nano-unit persistence', () => {
      it.each(concurrencyAmounts)('stores and credits exact persistent amount of %s nano', async (amountNano) => {
        const owner = await newUser();
        const intent = await newIntent(owner.telegramId, amountNano);
        const submitted = await submitIntent(owner.telegramId, intent.id, amountNano);
        expect(submitted.success).toBe(true);
        const credited = await storage.confirmDeposit(intent.id, `exact-pg-hash-${intent.id}`);
        expect(credited.success).toBe(true);
        const state = await db.query<{ balance_nano: string; amount_nano: string; balance_after_nano: string }>(
          `SELECT u.balance_nano::text, t.amount_nano::text, t.balance_after_nano::text
             FROM users u JOIN transactions t ON t.user_id = u.id
            WHERE u.telegram_id = $1 AND t.type = 'deposit'`, [owner.telegramId]
        );
        expect(state.rows).toEqual([{ balance_nano: amountNano, amount_nano: amountNano, balance_after_nano: amountNano }]);
      });
    });

    describe('deposit ledger failure atomicity', () => {
      const submissionScenarios = [
        'unknown intent ID', 'unregistered owner ID', 'different intent owner', 'wrong sender wallet', 'wrong vault address',
        'wrong network', 'deposit amount one nanogram too high', 'zero amount', 'negative amount', 'fractional amount',
        'signed amount string', 'whitespace-padded amount', 'amount above PostgreSQL precision', 'empty signed payload',
        'whitespace-only signed payload', 'payload above size limit', 'environment vault mismatch', 'environment network mismatch',
        'cancelled intent', 'replacement signed payload',
      ];
      it.each(submissionScenarios.map((scenario, index) => ({ scenario, caseNo: index + 1 })))('refuses $scenario without crediting or stealing evidence', async ({ scenario, caseNo }) => {
        const owner = await newUser();
        const intent = await newIntent(owner.telegramId, '1234567891');
        process.env.TON_DEPOSIT_ADDRESS = vault;
        process.env.TON_NETWORK = 'testnet';
        const input: any = {
          intentId: intent.id, telegramId: owner.telegramId, walletAddress: sender,
          depositAddress: vault, amountNano: '1234567891', boc: `tamper-case-${caseNo}`, network: 'testnet',
        };
        let expectedStatus = 'pending';
        let expectedBoc: string | null = null;
        let originalBoc: string | null = null;
        switch (caseNo) {
          case 1: input.intentId = '00000000-0000-4000-8000-000000000000'; break;
          case 2: input.telegramId = ++nextId; break;
          case 3: input.telegramId = (await newUser()).telegramId; break;
          case 4: input.walletAddress = 'different-sender'; break;
          case 5: input.depositAddress = 'different-vault'; break;
          case 6: input.network = 'mainnet'; break;
          case 7: input.amountNano = '1234567892'; break;
          case 8: input.amountNano = '0'; break;
          case 9: input.amountNano = '-1'; break;
          case 10: input.amountNano = '1.5'; break;
          case 11: input.amountNano = '+1234567891'; break;
          case 12: input.amountNano = ' 1234567891'; break;
          case 13: input.amountNano = '9'.repeat(31); break;
          case 14: input.boc = ''; break;
          case 15: input.boc = '   '; break;
          case 16: input.boc = 'x'.repeat(250_001); break;
          case 17: process.env.TON_DEPOSIT_ADDRESS = 'different-configured-vault'; break;
          case 18: process.env.TON_NETWORK = 'mainnet'; break;
          case 19:
            await db.query("UPDATE deposit_intents SET status = 'cancelled' WHERE id = $1", [intent.id]);
            expectedStatus = 'cancelled';
            break;
          case 20:
            originalBoc = `already-bound-${intent.id}`;
            expect((await submitIntent(owner.telegramId, intent.id, '1234567891', originalBoc)).success).toBe(true);
            input.boc = `replacement-${intent.id}`;
            expectedBoc = originalBoc;
            break;
        }
        const result = await storage.recordPendingDeposit(input);
        const persisted = await db.query<{ balance_nano: string; status: string; boc: string | null; count: number }>(
          `SELECT u.balance_nano::text, d.status, d.boc,
                  (SELECT COUNT(*)::int FROM transactions t WHERE t.user_id = u.id AND t.type = 'deposit') AS count
             FROM users u JOIN deposit_intents d ON d.telegram_id = u.telegram_id WHERE d.id = $1`, [intent.id]
        );

        expect(result.success, scenario).toBe(false);
        expect(persisted.rows[0]).toEqual({ balance_nano: '0', status: expectedStatus, boc: expectedBoc, count: 0 });
      });
    });

    describe('BOC ownership across concurrent accounts', () => {
      it.each(cases)('binds one BOC across %i distinct owner intents only once', async (caseNo) => {
        const claimantCount = Math.min(caseNo + 1, 8);
        const owners = await Promise.all(Array.from({ length: claimantCount }, () => newUser()));
        const intents = await Promise.all(owners.map((owner) => newIntent(owner.telegramId)));
        const boc = `cross-account-boc-${caseNo}`;
        const submissions = await Promise.all(owners.map((owner, index) => submitIntent(owner.telegramId, intents[index].id, '1000000000', boc)));
        const stored = await db.query<{ id: string; boc: string | null; status: string }>(
          'SELECT id, boc, status FROM deposit_intents WHERE id = ANY($1::uuid[])', [intents.map((intent) => intent.id)]
        );

        expect(submissions.filter((result) => result.success)).toHaveLength(1);
        expect(stored.rows.filter((row) => row.boc === boc && row.status === 'pending')).toHaveLength(1);
        expect((await db.query('SELECT id FROM transactions WHERE user_id = ANY($1::bigint[])', [owners.map((owner) => owner.userId)])).rowCount).toBe(0);
      });
    });

    describe('100 withdrawal scenarios: serialized debit, replay resistance, lease fencing, and reconciliation', () => {
      it.each(cases)('returns one withdrawal for a same-quote replay burst of %i calls', async (caseNo) => {
        const owner = await newUser('3000000000');
        const quote = await newQuote(owner.telegramId);
        expect(quote.success).toBe(true);
        if (!quote.success) return;
        const fanout = caseNo + 1;
        const results = await Promise.all(Array.from({ length: fanout }, (_, index) => storage.confirmWithdrawalQuote({
          telegramId: owner.telegramId, quoteId: quote.quote.quoteId, operationKey: `distinct-replay-${caseNo}-${index}-${owner.telegramId}`,
        })));
        const state = await db.query<{ balance_nano: string; withdrawal_count: number; debit_count: number }>(
          `SELECT u.balance_nano::text,
                  (SELECT COUNT(*)::int FROM withdrawals w WHERE w.telegram_id = u.telegram_id) AS withdrawal_count,
                  (SELECT COUNT(*)::int FROM transactions t WHERE t.user_id = u.id AND t.type = 'withdraw') AS debit_count
             FROM users u WHERE u.telegram_id = $1`, [owner.telegramId]
        );

        expect(results.every((result) => result.success)).toBe(true);
        expect(state.rows[0]).toEqual({ balance_nano: '2000000000', withdrawal_count: 1, debit_count: 1 });
        await db.query('UPDATE withdrawals SET payout_eligible = FALSE WHERE telegram_id = $1', [owner.telegramId]);
      });
    });

    describe('parallel independent quotes cannot overdraw an account', () => {
      it.each(cases)('permits only funded debits across %i independent quotes', async (caseNo) => {
        const quoteCount = caseNo + 3;
        const owner = await newUser('3000000000');
        const quotes = await Promise.all(Array.from({ length: quoteCount }, () => newQuote(owner.telegramId)));
        expect(quotes.every((quote) => quote.success)).toBe(true);
        const validQuotes = quotes.filter((quote) => quote.success);
        const outcomes = await Promise.all(validQuotes.map((quote, index) => storage.confirmWithdrawalQuote({
          telegramId: owner.telegramId, quoteId: quote.quote.quoteId, operationKey: `separate-quote-${caseNo}-${index}-${owner.telegramId}`,
        })));
        const succeeded = outcomes.filter((result) => result.success).length;
        const state = await db.query<{ balance_nano: string; debit_count: number; debit_total: string }>(
          `SELECT u.balance_nano::text,
                  (SELECT COUNT(*)::int FROM transactions t WHERE t.user_id = u.id AND t.type = 'withdraw') AS debit_count,
                  COALESCE((SELECT -SUM(t.amount_nano) FROM transactions t WHERE t.user_id = u.id AND t.type = 'withdraw'),0)::text AS debit_total
             FROM users u WHERE u.telegram_id = $1`, [owner.telegramId]
        );

        expect(succeeded).toBe(3);
        expect(state.rows[0]).toEqual({ balance_nano: '0', debit_count: 3, debit_total: '3000000000' });
        await db.query('UPDATE withdrawals SET payout_eligible = FALSE WHERE telegram_id = $1', [owner.telegramId]);
      });
    });

    describe('withdrawal state and database constraint attacks', () => {
      const mutationScenarios = [
        'zero gross quote', 'negative gross quote', 'negative fee quote', 'zero net quote', 'unbalanced gross-fee-net quote',
        'non-mainnet quote network', 'unknown quote status', 'consumed quote without withdrawal link', 'expired quote confirmation',
        'cross-owner quote confirmation', 'balance depleted after quoting', 'payouts disabled after quoting', 'user daily cap exceeded',
        'global daily cap exceeded', 'zero-value withdrawal row', 'invalid withdrawal status', 'non-mainnet withdrawal row',
        'negative payout fencing token', 'invalid ledger transaction type', 'ledger operation-key collision rollback',
      ];
      it.each(mutationScenarios.map((scenario, index) => ({ scenario, caseNo: index + 1 })))('preserves financial invariants under $scenario', async ({ scenario, caseNo }) => {
        process.env.PAYOUT_NETWORK = 'mainnet';
        process.env.PAYOUT_USER_DAILY_LIMIT_NANO = '6000000000';
        process.env.PAYOUT_GLOBAL_DAILY_LIMIT_NANO = '999999999999999999999999999999999999';
        const owner = await newUser('2000000000');
        const historical = await confirmedWithdrawal(owner.telegramId, `constraint-seed-${caseNo}-${owner.telegramId}`, '100000000');
        await db.query('UPDATE withdrawals SET payout_eligible = FALSE WHERE id = $1', [historical.id]);
        const quote = await newQuote(owner.telegramId);
        expect(quote.success).toBe(true);
        if (!quote.success) return;
        const request = { telegramId: owner.telegramId, quoteId: quote.quote.quoteId, operationKey: `constraint-case-${caseNo}-${owner.telegramId}` };
        let expectedConfirmation = true;
        let operationError = false;

        switch (caseNo) {
          case 1: await expect(db.query('UPDATE withdrawal_quotes SET gross_amount_nano = 0 WHERE id = $1', [quote.quote.quoteId])).rejects.toBeDefined(); break;
          case 2: await expect(db.query('UPDATE withdrawal_quotes SET gross_amount_nano = -1 WHERE id = $1', [quote.quote.quoteId])).rejects.toBeDefined(); break;
          case 3: await expect(db.query('UPDATE withdrawal_quotes SET fee_nano = -1 WHERE id = $1', [quote.quote.quoteId])).rejects.toBeDefined(); break;
          case 4: await expect(db.query('UPDATE withdrawal_quotes SET net_amount_nano = 0 WHERE id = $1', [quote.quote.quoteId])).rejects.toBeDefined(); break;
          case 5: await expect(db.query('UPDATE withdrawal_quotes SET net_amount_nano = net_amount_nano + 1 WHERE id = $1', [quote.quote.quoteId])).rejects.toBeDefined(); break;
          case 6: await expect(db.query("UPDATE withdrawal_quotes SET network = 'testnet' WHERE id = $1", [quote.quote.quoteId])).rejects.toBeDefined(); break;
          case 7: await expect(db.query("UPDATE withdrawal_quotes SET status = 'corrupt' WHERE id = $1", [quote.quote.quoteId])).rejects.toBeDefined(); break;
          case 8: await expect(db.query("UPDATE withdrawal_quotes SET status = 'consumed' WHERE id = $1", [quote.quote.quoteId])).rejects.toBeDefined(); break;
          case 9:
            await db.query("UPDATE withdrawal_quotes SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1", [quote.quote.quoteId]);
            expectedConfirmation = false;
            break;
          case 10: {
            const attacker = await newUser('1000000000');
            const denied = await storage.confirmWithdrawalQuote({ ...request, telegramId: attacker.telegramId, operationKey: `owner-attack-${owner.telegramId}` });
            expect(denied.success).toBe(false);
            break;
          }
          case 11:
            await db.query('UPDATE users SET balance_nano = 0, balance_gram = 0 WHERE telegram_id = $1', [owner.telegramId]);
            expectedConfirmation = false;
            break;
          case 12:
            process.env.PAYOUT_NETWORK = 'testnet';
            expectedConfirmation = false;
            break;
          case 13:
            process.env.PAYOUT_USER_DAILY_LIMIT_NANO = '999999999';
            expectedConfirmation = false;
            break;
          case 14: {
            const totals = await db.query<{ total: string }>("SELECT COALESCE(SUM(amount_nano),0)::text AS total FROM withdrawals WHERE payout_eligible = TRUE AND created_at >= date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'");
            process.env.PAYOUT_GLOBAL_DAILY_LIMIT_NANO = (BigInt(totals.rows[0].total) + 999_999_999n).toString();
            expectedConfirmation = false;
            break;
          }
          case 15: await expect(db.query("INSERT INTO withdrawals (telegram_id,wallet_address,amount_nano,amount_gram,fee_nano,net_amount_nano,network,status) VALUES ($1,$2,0,0,0,0,'mainnet','pending')", [owner.telegramId, vault])).rejects.toBeDefined(); break;
          case 16: await expect(db.query("UPDATE withdrawals SET status = 'corrupt' WHERE id = $1", [historical.id])).rejects.toBeDefined(); break;
          case 17: await expect(db.query("UPDATE withdrawals SET network = 'testnet' WHERE id = $1", [historical.id])).rejects.toBeDefined(); break;
          case 18: await expect(db.query('UPDATE withdrawals SET payout_fencing_token = -1 WHERE id = $1', [historical.id])).rejects.toBeDefined(); break;
          case 19: await expect(db.query("INSERT INTO transactions (user_id, type, amount_nano, fee_nano, balance_after_nano) VALUES ($1,'corrupt',0,0,0)", [owner.userId])).rejects.toBeDefined(); break;
          case 20:
            await db.query("INSERT INTO transactions (user_id, operation_key, type, amount_nano, fee_nano, balance_after_nano) VALUES ($1,$2,'match_stake',0,0,2000000000)", [owner.userId, request.operationKey]);
            expectedConfirmation = false;
            operationError = true;
            break;
        }

        if (expectedConfirmation && !operationError) {
          expect((await storage.confirmWithdrawalQuote(request)).success).toBe(true);
        } else if (operationError) {
          await expect(storage.confirmWithdrawalQuote(request)).rejects.toBeDefined();
        } else {
          expect((await storage.confirmWithdrawalQuote(request)).success).toBe(false);
        }

        const state = await db.query<{ balance_nano: string; quote_status: string; withdrawals: number; debits: number }>(
          `SELECT u.balance_nano::text, q.status AS quote_status,
                  (SELECT COUNT(*)::int FROM withdrawals w WHERE w.telegram_id = u.telegram_id AND w.quote_id = q.id) AS withdrawals,
                  (SELECT COUNT(*)::int FROM transactions t JOIN withdrawals w ON w.id = t.withdrawal_id WHERE w.quote_id = q.id AND t.type = 'withdraw') AS debits
             FROM users u JOIN withdrawal_quotes q ON q.telegram_id = u.telegram_id WHERE q.id = $1`, [quote.quote.quoteId]
        );
        if (expectedConfirmation && !operationError) {
          expect(state.rows[0]).toEqual({ balance_nano: '900000000', quote_status: 'consumed', withdrawals: 1, debits: 1 });
        } else {
          expect(state.rows[0].balance_nano).toBe(caseNo === 11 ? '0' : '1900000000');
          expect(state.rows[0].quote_status).toBe(caseNo === 9 ? 'expired' : 'quoted');
          expect(state.rows[0].withdrawals).toBe(0);
          expect(state.rows[0].debits).toBe(0);
        }
      });
    });

    describe('payout lease fencing rejects stale signers after worker takeover', () => {
      it.each(cases)('rejects previous fencing token after worker restart case %i', async (caseNo) => {
        const gross = String(100_000_000 + caseNo * 10_000_000);
        const owner = await newUser('2000000000');
        const withdrawal = await confirmedWithdrawal(owner.telegramId, `fencing-case-${caseNo}-${owner.telegramId}`, gross);
        await db.query('UPDATE withdrawals SET payout_eligible = FALSE WHERE id <> $1', [withdrawal.id]);
        await db.query('UPDATE withdrawals SET payout_eligible = TRUE WHERE id = $1', [withdrawal.id]);
        const firstWorker = caseNo % 2 === 0 ? `restarted-worker-${caseNo}` : `old-worker-${caseNo}`;
        const currentWorker = caseNo % 2 === 0 ? firstWorker : `current-worker-${caseNo}`;
        const firstClaim = await db.claimNextWithdrawalPayout(firstWorker, 60_000);
        expect(firstClaim?.withdrawal.id).toBe(withdrawal.id);
        await db.query("UPDATE payout_wallet_locks SET lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = 1");
        await db.query("UPDATE withdrawals SET payout_lease_expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE id = $1", [withdrawal.id]);
        const secondClaim = await db.claimNextWithdrawalPayout(currentWorker, 60_000);
        expect(secondClaim?.withdrawal.id).toBe(withdrawal.id);
        expect(secondClaim!.fencingToken).toBeGreaterThan(firstClaim!.fencingToken);
        const staleInput = {
          withdrawalId: withdrawal.id, workerId: firstWorker, fencingToken: firstClaim!.fencingToken,
          ciphertext: Buffer.from('old-signed-payload'), iv: Buffer.alloc(12), tag: Buffer.alloc(16),
          seqno: 5, validUntil: Math.floor(Date.now() / 1000) + 60, messageHash: `old-hash-${caseNo}`,
        };

        expect(await db.persistSignedWithdrawalPayload(staleInput)).toBe(false);
        expect((await db.finalizeWithdrawalPayout({
          withdrawalId: withdrawal.id, workerId: firstWorker, fencingToken: firstClaim!.fencingToken,
          finalized: true, destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano,
          txHash: `stale-final-${caseNo}`, actualFeeNano: '1',
        })).success).toBe(false);
        expect((await db.refundFailedWithdrawal({
          withdrawalId: withdrawal.id, workerId: firstWorker, fencingToken: firstClaim!.fencingToken,
          finalizedFailure: true, evidenceHash: `stale-failure-${caseNo}`,
        })).success).toBe(false);

        expect(await db.persistSignedWithdrawalPayload({ ...staleInput, workerId: currentWorker, fencingToken: secondClaim!.fencingToken })).toBe(true);
        const finalized = await db.finalizeWithdrawalPayout({
          withdrawalId: withdrawal.id, workerId: currentWorker, fencingToken: secondClaim!.fencingToken,
          finalized: true, destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano,
          txHash: `current-final-${caseNo}`, actualFeeNano: '1',
        });
        expect(finalized).toMatchObject({ success: true, status: 'completed' });
        const stored = await db.query<{ status: string; tx_hash: string; signed_payload_ciphertext: Buffer | null }>(
          'SELECT status, tx_hash, signed_payload_ciphertext FROM withdrawals WHERE id = $1', [withdrawal.id]
        );
        expect(stored.rows[0].status).toBe('completed');
        expect(stored.rows[0].tx_hash).toBe(`current-final-${caseNo}`);
        expect(stored.rows[0].signed_payload_ciphertext).toBeNull();
      });
    });

    describe('finalized payout failure refund is atomic and idempotent', () => {
      it.each(cases)('restores gross amount only once for failure proof case %i', async (caseNo) => {
        const originalBalance = '2500000000';
        const gross = String(100_000_000 + caseNo * 10_000_000);
        const owner = await newUser(originalBalance);
        const withdrawal = await confirmedWithdrawal(owner.telegramId, `refund-case-${caseNo}-${owner.telegramId}`, gross);
        await db.query('UPDATE withdrawals SET payout_eligible = FALSE WHERE id <> $1', [withdrawal.id]);
        await db.query('UPDATE withdrawals SET payout_eligible = TRUE WHERE id = $1', [withdrawal.id]);
        const claimed = await db.claimNextWithdrawalPayout(`refund-worker-${caseNo}`, 60_000);
        expect(claimed?.withdrawal.id).toBe(withdrawal.id);
        const failure = {
          withdrawalId: withdrawal.id, workerId: `refund-worker-${caseNo}`, fencingToken: claimed!.fencingToken,
          finalizedFailure: true, evidenceHash: `chain-finalized-failure-${caseNo}`,
        };
        const first = await db.refundFailedWithdrawal(failure);
        const retry = await db.refundFailedWithdrawal({ ...failure, evidenceHash: `retry-different-proof-${caseNo}` });
        const state = await db.query<{ balance_nano: string; status: string; refund_count: number; refund_amount: string }>(
          `SELECT u.balance_nano::text, w.status,
                  (SELECT COUNT(*)::int FROM transactions t WHERE t.withdrawal_id = w.id AND t.type = 'withdrawal_refund') AS refund_count,
                  COALESCE((SELECT SUM(t.amount_nano) FROM transactions t WHERE t.withdrawal_id = w.id AND t.type = 'withdrawal_refund'),0)::text AS refund_amount
             FROM users u JOIN withdrawals w ON w.telegram_id = u.telegram_id WHERE w.id = $1`, [withdrawal.id]
        );

        expect(first).toMatchObject({ success: true, refunded: true });
        expect(retry).toMatchObject({ success: true, refunded: false });
        expect(state.rows[0]).toEqual({ balance_nano: originalBalance, status: 'failed', refund_count: 1, refund_amount: gross });
      });
    });
  });
});
