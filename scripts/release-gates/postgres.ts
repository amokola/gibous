import 'dotenv/config';
import { Pool } from 'pg';
import { DatabasePool } from '../../server/db/index';

const confirmation = process.env.RELEASE_GATE_CONFIRM;
const databaseUrl = process.env.DATABASE_URL;

if (confirmation !== 'YES') {
  throw new Error('Set RELEASE_GATE_CONFIRM=YES to run against a disposable release-gate database.');
}
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');
if (!databaseName.includes('release_gate')) {
  throw new Error(`Refusing to mutate database '${databaseName}'; database name must include release_gate.`);
}

process.env.NODE_ENV = 'development';

const pool = new Pool({ connectionString: databaseUrl, max: 12 });
const db = DatabasePool.getInstance();

const assert = (condition: unknown, message: string): asserts condition => {
  if (!condition) throw new Error(message);
};

const createUser = async (telegramId: number, balance: number) => {
  const result = await pool.query(
    `INSERT INTO users (telegram_id, username, first_name, balance_nano)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [telegramId, `release_${telegramId}`, `Release ${telegramId}`, String(BigInt(balance) * 1_000_000_000n)],
  );
  return {
    ...result.rows[0],
    id: Number(result.rows[0].id),
    telegram_id: Number(result.rows[0].telegram_id),
  };
};

const scalar = async (sql: string, params: unknown[] = []) => {
  const result = await pool.query(sql, params);
  return result.rows[0]?.value;
};

const expectSqlFailure = async (sql: string, params: unknown[], label: string) => {
  try {
    await pool.query(sql, params);
  } catch {
    return;
  }
  throw new Error(`${label} was accepted by PostgreSQL`);
};

try {
  await pool.query('TRUNCATE transactions, settlements, deposit_intents, matches, users, treasury RESTART IDENTITY CASCADE');
  await pool.query(`INSERT INTO treasury (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  const stakeUser = await createUser(910001, 100);
  const stakeResults = await Promise.all([
    db.debitUserBalance(910001, 100, 'PG-CONCURRENT-STAKE-A'),
    db.debitUserBalance(910001, 100, 'PG-CONCURRENT-STAKE-B'),
  ]);
  assert(stakeResults.filter((result) => result.success).length === 1, 'Exactly one concurrent stake should succeed');
  assert(stakeResults.filter((result) => !result.success).length === 1, 'Exactly one concurrent stake should fail for insufficient funds');
  assert(Number(await scalar('SELECT balance_gram AS value FROM users WHERE telegram_id = $1', [stakeUser.telegram_id])) === 0, 'Concurrent stakes overdrawn the account');
  assert(Number(await scalar("SELECT COUNT(*) AS value FROM transactions WHERE user_id = $1 AND type = 'match_stake'", [stakeUser.id])) === 1, 'Concurrent stake created more than one debit');

  const existingStake = await pool.query<{ operation_key: string }>(
    "SELECT operation_key FROM transactions WHERE user_id = $1 AND type = 'match_stake' LIMIT 1",
    [stakeUser.id],
  );
  const existingMatchCode = existingStake.rows[0].operation_key.split(':')[1];
  const duplicateFirst = await db.debitUserBalance(910001, 1, existingMatchCode);
  const duplicateSecond = await db.debitUserBalance(910001, 1, existingMatchCode);
  assert(duplicateFirst.success && duplicateSecond.success, 'Repeated operation key should be a successful no-op');
  assert(Number(await scalar('SELECT COUNT(*) AS value FROM transactions WHERE operation_key = $1', [existingStake.rows[0].operation_key])) === 1, 'Repeated operation key duplicated a debit');

  const winner = await createUser(910002, 1000);
  const loser = await createUser(910003, 1000);
  await db.debitUserBalance(winner.telegram_id, 100, 'PG-SETTLEMENT-STAKE-W');
  await db.debitUserBalance(loser.telegram_id, 100, 'PG-SETTLEMENT-STAKE-L');
  const calculation = { totalPot: 200, winnerPayout: 190, arenaFee: 10 };
  const settlements = await Promise.all([
    db.settleWinMatch('PG-CONCURRENT-SETTLEMENT', 'rps', 100, winner.telegram_id, loser.telegram_id, calculation),
    db.settleWinMatch('PG-CONCURRENT-SETTLEMENT', 'rps', 100, winner.telegram_id, loser.telegram_id, calculation),
  ]);
  assert(settlements.filter((result) => result?.applied).length === 1, 'Exactly one concurrent settlement should apply');
  assert(settlements.filter((result) => result && !result.applied).length === 1, 'Exactly one concurrent settlement should be a no-op');
  assert(Number(await scalar("SELECT COUNT(*) AS value FROM transactions WHERE operation_key = 'settlement:PG-CONCURRENT-SETTLEMENT:winner'")) === 1, 'Concurrent settlement duplicated payout');
  assert(Number(await scalar("SELECT COUNT(*) AS value FROM settlements WHERE match_id = 'PG-CONCURRENT-SETTLEMENT'")) === 1, 'Concurrent settlement duplicated reservation');

  const rollbackWinner = await createUser(910004, 1000);
  const beforeRollback = await scalar('SELECT balance_nano AS value FROM users WHERE telegram_id = $1', [rollbackWinner.telegram_id]);
  let rollbackThrown = false;
  try {
    await db.settleWinMatch('PG-ROLLBACK', 'rps', 100, rollbackWinner.telegram_id, 919999, calculation);
  } catch {
    rollbackThrown = true;
  }
  assert(rollbackThrown, 'Forced settlement failure did not throw');
  assert(String(await scalar('SELECT balance_nano AS value FROM users WHERE telegram_id = $1', [rollbackWinner.telegram_id])) === String(beforeRollback), 'Failed settlement changed the winner balance');
  assert(Number(await scalar("SELECT COUNT(*) AS value FROM settlements WHERE match_id = 'PG-ROLLBACK'")) === 0, 'Failed settlement left a reservation behind');

  const orderedA = await createUser(910005, 1000);
  const orderedB = await createUser(910006, 1000);
  const smallCalculation = { totalPot: 20, winnerPayout: 18, arenaFee: 2 };
  const deadlockCandidates = await Promise.all([
    db.settleWinMatch('PG-LOCK-ORDER-A', 'rps', 10, orderedA.telegram_id, orderedB.telegram_id, smallCalculation),
    db.settleWinMatch('PG-LOCK-ORDER-B', 'rps', 10, orderedB.telegram_id, orderedA.telegram_id, smallCalculation),
  ]);
  assert(deadlockCandidates.every((result) => result?.applied), 'Deterministic lock-order settlements did not both complete');

  const depositUser = await createUser(910007, 0);
  const intent = await db.persistDepositIntent({
    telegram_id: depositUser.telegram_id,
    wallet_address: 'EQReleaseGateWallet',
    deposit_address: 'EQReleaseGateVault',
    amount_nano: '10000000000',
    boc: 'release-gate-boc-1',
    network: 'testnet',
    status: 'pending',
  });
  const deposits = await Promise.all([
    db.confirmDeposit(intent.id, 'release-gate-tx-1'),
    db.confirmDeposit(intent.id, 'release-gate-tx-1'),
  ]);
  assert(deposits.every((result) => result.success), 'Duplicate deposit notification should be an idempotent success');
  assert(Number(await scalar('SELECT balance_gram AS value FROM users WHERE telegram_id = $1', [depositUser.telegram_id])) === 10, 'Duplicate deposit credited more than once');
  assert(Number(await scalar("SELECT COUNT(*) AS value FROM transactions WHERE operation_key = $1", [`deposit:${intent.id}`])) === 1, 'Duplicate deposit created more than one ledger entry');

  const cancelP1 = await createUser(910008, 100);
  const cancelP2 = await createUser(910009, 100);
  await db.debitUserBalance(cancelP1.telegram_id, 50, 'PG-CANCEL-MATCH');
  await db.debitUserBalance(cancelP2.telegram_id, 50, 'PG-CANCEL-MATCH');
  const ref1 = await db.refundStake(cancelP1.telegram_id, 50, 'PG-CANCEL-MATCH');
  const ref2 = await db.refundStake(cancelP2.telegram_id, 50, 'PG-CANCEL-MATCH');
  assert(ref1.success && ref2.success, 'Both players in a cancelled match should receive refunds');
  assert(Number(await scalar('SELECT balance_gram AS value FROM users WHERE telegram_id = $1', [cancelP1.telegram_id])) === 100, 'P1 balance incorrect after cancellation refund');
  assert(Number(await scalar('SELECT balance_gram AS value FROM users WHERE telegram_id = $1', [cancelP2.telegram_id])) === 100, 'P2 balance incorrect after cancellation refund');

  await expectSqlFailure('UPDATE users SET balance_nano = -1 WHERE telegram_id = $1', [depositUser.telegram_id], 'negative balance constraint');
  await expectSqlFailure(
    `INSERT INTO matches (code, game_type, stake_amount, pot_amount, status) VALUES ('PG-CONSTRAINT-BAD', 'not-a-game', 0, 0, 'waiting')`,
    [],
    'match game_type constraint',
  );
  await expectSqlFailure(
    `INSERT INTO matches (code, game_type, stake_amount, pot_amount, status) VALUES ('PG-CONSTRAINT-POT', 'rps', 100, 150, 'waiting')`,
    [],
    'match exact pot constraint',
  );
  await pool.query(
    `INSERT INTO transactions (user_id, operation_key, type, amount_nano, fee_nano, balance_after_nano) VALUES ($1, 'release-gate-unique-op', 'deposit', 1000000000, 0, 1000000000)`,
    [depositUser.id],
  );
  await expectSqlFailure(
    `INSERT INTO transactions (user_id, operation_key, type, amount_nano, fee_nano, balance_after_nano) VALUES ($1, 'release-gate-unique-op', 'deposit', 1000000000, 0, 1000000000)`,
    [depositUser.id],
    'duplicate operation constraint',
  );

  console.log(JSON.stringify({
    gate: 'real-postgresql',
    status: 'VERIFIED',
    database: databaseName,
    checks: [
      'schema-and-migrations',
      'concurrent-stake-no-overdraw',
      'duplicate-stake-operation-key',
      'concurrent-settlement-single-effect',
      'rollback-on-settlement-failure',
      'deterministic-lock-order-no-deadlock',
      'duplicate-deposit-notification',
      'database-constraints',
    ],
  }, null, 2));
} finally {
  await pool.end();
}

process.exit(0);
