/**
 * Gibous PostgreSQL Database Client Pool & Transaction Manager
 * Follows PostgreSQL transaction and concurrency guidance (connection pooling,
 * parameterized queries, row locks, and durable operation keys).
 */

import crypto from 'crypto';
import { gramsToNano, nanoToGrams } from '../money';
import { metrics } from '../observability';

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

const RETRYABLE_PG_CODES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
  '53300', // too_many_connections
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'ECONNREFUSED',
]);

export function isRetryablePgError(error: any): boolean {
  if (!error) return false;
  const code = error.code || error.errno;
  if (typeof code === 'string' && RETRYABLE_PG_CODES.has(code)) {
    return true;
  }
  if (typeof error.message === 'string') {
    const msg = error.message.toLowerCase();
    if (msg.includes('deadlock detected') || msg.includes('serialization failure') || msg.includes('connection terminated')) {
      return true;
    }
  }
  return false;
}

export function generateDepositMemo(): string {
  return `dep_${crypto.randomBytes(16).toString('hex')}`;
}

export function generateWithdrawalMemo(): string {
  return `wit_${crypto.randomBytes(16).toString('hex')}`;
}

export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 50;
  const maxDelayMs = options.maxDelayMs ?? 1000;

  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries && isRetryablePgError(err)) {
        metrics.incrementCounter('db_transaction_retries_total', 1, { code: String(err.code || 'unknown') });
        const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * baseDelayMs);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

export class DatabasePool {
  private static instance: DatabasePool;
  private inMemoryDb: Map<string, any[]> = new Map();
  private pgPool: any | null = null;

  private constructor() {
    this.initInMemoryFallback();
  }

  static getInstance(): DatabasePool {
    if (!DatabasePool.instance) {
      DatabasePool.instance = new DatabasePool();
    }
    return DatabasePool.instance;
  }

  private initInMemoryFallback() {
    // The old fallback seeded a wealthy demo account into every local server,
    // which made the UI claim a balance the user had never deposited. Tests
    // still get deterministic fixtures through StorageService's test-only
    // account initialization; development and production start at zero.
    this.inMemoryDb.set('users', []);
    this.inMemoryDb.set('matches', []);
    this.inMemoryDb.set('transactions', []);
    this.inMemoryDb.set('deposit_intents', []);
    this.inMemoryDb.set('withdrawal_quotes', []);
    this.inMemoryDb.set('withdrawals', []);
    this.inMemoryDb.set('payout_wallet_lock', [{
      lease_owner: null,
      lease_expires_at: null,
      fencing_token: 0,
    }]);
    this.inMemoryDb.set('settlements', []);
    this.inMemoryDb.set('treasury', [
      {
        id: 1,
        total_rake_nano: 0,
        win_rake_nano: 0,
        draw_fees_nano: 0,
        total_volume_nano: 0,
        total_rake_collected: 0,
        win_rake_collected: 0,
        draw_fees_collected: 0,
        total_volume_processed: 0,
      },
    ]);
  }

  resetInMemoryWithdrawalStateForTests() {
    if (process.env.NODE_ENV !== 'test' || this.usesPersistentDatabase()) {
      throw new Error('Withdrawal fallback reset is available only in isolated tests');
    }
    this.inMemoryDb.set('withdrawal_quotes', []);
    this.inMemoryDb.set('withdrawals', []);
    this.inMemoryDb.set('payout_wallet_lock', [{ lease_owner: null, lease_expires_at: null, fencing_token: 0 }]);
  }

  /**
   * Execute parameterized SQL query with PostgreSQL or high-speed memory fallback
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    const trimmed = sql.trim().toLowerCase();

    // A configured database is authoritative outside the isolated test suite.
    if (process.env.DATABASE_URL && process.env.NODE_ENV !== 'test') {
      try {
        // Dynamic import to support optional pg installation
        // @ts-ignore
        const pool = await this.getPgPool();
        const res = await pool.query(sql, params);
        return { rows: res.rows, rowCount: res.rowCount || res.rows.length };
      } catch (err) {
        // Falling back here would make reads and writes appear to succeed while
        // diverging from PostgreSQL, so fail closed in development as well.
        throw err;
      }
    }

    // High-performance In-Memory state management for local dev & testing
    if (trimmed.startsWith('select * from users where telegram_id = $1')) {
      const users = this.inMemoryDb.get('users') || [];
      const user = users.find((u) => u.telegram_id === Number(params[0]));
      return { rows: user ? [user as T] : [], rowCount: user ? 1 : 0 };
    }

    if (trimmed.startsWith('select * from treasury')) {
      const treasury = this.inMemoryDb.get('treasury') || [];
      return { rows: treasury as T[], rowCount: treasury.length };
    }

    if (trimmed.startsWith('select * from users order by')) {
      const users = this.inMemoryDb.get('users') || [];
      return { rows: users as T[], rowCount: users.length };
    }

    return { rows: [], rowCount: 0 };
  }

  private async getPgPool() {
    if (!process.env.DATABASE_URL) return null;
    if (!this.pgPool) {
      const { Pool } = await import('pg');
      const maxConns = Math.max(5, Math.min(100, Number(process.env.PGPOOL_MAX) || 25));
      this.pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' }
            : undefined,
        max: maxConns,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
        // query_timeout is a valid client-side pool option (node-postgres).
        // Set higher than statement_timeout so the server can send its 57014
        // cancellation error before the client drops the connection.
        query_timeout: 8_000,
        // statement_timeout, lock_timeout, and idle_in_transaction_session_timeout
        // are PostgreSQL server GUC parameters, not node-postgres Pool config keys.
        // They must be passed via the 'options' connection startup parameter.
        // See: https://node-postgres.com/apis/pool
        // See: https://www.postgresql.org/docs/current/runtime-config-client.html
        options: '-c statement_timeout=5000 -c lock_timeout=3000 -c idle_in_transaction_session_timeout=5000',
      });

      this.pgPool.on('error', (err: any) => {
        metrics.incrementCounter('db_pool_errors_total', 1);
        console.error('Unexpected error on idle PostgreSQL client:', err);
      });
    }
    return this.pgPool;
  }

  async withTransaction<T>(operation: (client: any) => Promise<T>): Promise<T> {
    const pool = await this.getPgPool();
    if (!pool) {
      throw new Error('Database pool not available');
    }

    return executeWithRetry(async () => {
      // Circuit breaker: fail-fast if pool waiting queue is critically saturated
      if (typeof pool.waitingCount === 'number' && pool.waitingCount > 100) {
        metrics.incrementCounter('db_pool_overload_rejections_total', 1);
        const err: any = new Error('Database pool queue overloaded');
        err.code = 'POOL_OVERLOAD';
        throw err;
      }

      const client = await pool.connect();
      const start = performance.now();
      try {
        await client.query('BEGIN');
        const result = await operation(client);
        await client.query('COMMIT');
        const duration = performance.now() - start;
        metrics.recordHistogram('db_transaction_duration_ms', duration);
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
        if (typeof pool.totalCount === 'number') {
          metrics.setGauge('db_pool_total', pool.totalCount);
          metrics.setGauge('db_pool_idle', pool.idleCount || 0);
          metrics.setGauge('db_pool_waiting', pool.waitingCount || 0);
        }
      }
    });
  }

  public usesPersistentDatabase() {
    return Boolean(process.env.DATABASE_URL && process.env.NODE_ENV !== 'test');
  }

  async checkReadiness(): Promise<boolean> {
    if (!this.usesPersistentDatabase()) return process.env.NODE_ENV !== 'production';
    try {
      const pool = await this.getPgPool();
      if (!pool) return false;
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
  }

  async loadUserByTelegramId(telegramId: number) {
    if (!this.usesPersistentDatabase()) return this.getUserByTelegramId(telegramId);
    const result = await this.query<any>('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
    return result.rows[0] ? this.normalizeUser(result.rows[0]) : undefined;
  }

  async loadUsers() {
    if (!this.usesPersistentDatabase()) return this.getUsers();
    const result = await this.query<any>('SELECT * FROM users ORDER BY wins DESC, total_winnings DESC');
    return result.rows.map((user) => this.normalizeUser(user));
  }

  async loadTransactionsForUser(userId: number) {
    if (!this.usesPersistentDatabase()) {
      const withdrawals = this.inMemoryDb.get('withdrawals') || [];
      return this.getTransactionsForUser(userId).map((tx: any) => {
        const withdrawal = tx.withdrawal_id ? withdrawals.find((item: any) => item.id === tx.withdrawal_id) : null;
        return withdrawal ? { ...tx, withdrawal_status: withdrawal.status, wallet_address: withdrawal.wallet_address,
          amount_nano: withdrawal.amount_nano, net_amount_nano: withdrawal.net_amount_nano, fee_nano: withdrawal.fee_nano,
          withdrawal_tx_hash: withdrawal.tx_hash } : tx;
      });
    }
    const result = await this.query<any>(
      `SELECT t.id, t.operation_key, t.type, t.amount, t.fee, t.balance_after, t.amount_nano, t.fee_nano,
              t.balance_after_nano, t.tx_hash, t.created_at, w.status AS withdrawal_status,
              w.wallet_address, w.amount_nano AS withdrawal_amount_nano,
              w.net_amount_nano, w.fee_nano AS withdrawal_fee_nano
         FROM transactions t LEFT JOIN withdrawals w ON w.id = t.withdrawal_id
        WHERE t.user_id = $1 ORDER BY t.created_at DESC`,
      [userId]
    );
    return result.rows.map((row: any) => row.withdrawal_status ? {
      ...row, amount_nano: row.withdrawal_amount_nano, fee_nano: row.withdrawal_fee_nano,
    } : row);
  }

  async loadTransactionsForUserSince(userId: number, since: Date) {
    if (!this.usesPersistentDatabase()) {
      return this.getTransactionsForUser(userId).filter((transaction) => new Date(transaction.created_at).getTime() >= since.getTime());
    }
    const result = await this.query<any>(
      'SELECT id, match_code, type, amount, fee, balance_after, tx_hash, created_at FROM transactions WHERE user_id = $1 AND created_at >= $2 ORDER BY created_at ASC',
      [userId, since]
    );
    return result.rows;
  }

  async persistUser(user: any) {
    if (!this.usesPersistentDatabase()) {
      const existing = this.getUserByTelegramId(user.telegram_id);
      if (existing) {
        this.saveUser({
          ...user,
          balance_gram: existing.balance_gram,
          balance_nano: existing.balance_nano,
        });
      } else {
        this.saveUser(user);
      }
      return this.getUserByTelegramId(user.telegram_id);
    }
    const balanceGram = Number(user.balance_gram || 0);
    const balanceNano = gramsToNano(balanceGram);
    const result = await this.query<any>(
      `INSERT INTO users (
        telegram_id, username, first_name, last_name, photo_url, balance_nano, balance_gram,
        total_winnings, total_volume, total_matches, wins, losses, draws,
        current_streak, best_streak, level, xp, favorite_game
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      ON CONFLICT (telegram_id) DO UPDATE SET
        username = EXCLUDED.username, first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name, photo_url = EXCLUDED.photo_url,
        total_winnings = EXCLUDED.total_winnings,
        total_volume = EXCLUDED.total_volume, total_matches = EXCLUDED.total_matches,
        wins = EXCLUDED.wins, losses = EXCLUDED.losses, draws = EXCLUDED.draws,
        current_streak = EXCLUDED.current_streak, best_streak = EXCLUDED.best_streak,
        level = EXCLUDED.level, xp = EXCLUDED.xp, favorite_game = EXCLUDED.favorite_game,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
      [
        user.telegram_id, user.username, user.first_name, user.last_name || '', user.photo_url || '',
        balanceNano, balanceGram, user.total_winnings, user.total_volume, user.total_matches,
        user.wins, user.losses, user.draws, user.current_streak, user.best_streak,
        user.level, user.xp, user.favorite_game,
      ]
    );
    return result.rows[0] ? this.normalizeUser(result.rows[0]) : undefined;
  }

  async persistMatch(match: {
    code: string;
    gameType: string;
    stakeAmount: number;
    potAmount: number;
    p1TelegramId: number;
    p2TelegramId?: number | null;
    status: string;
    statePayload: Record<string, unknown>;
  }) {
    if (!this.usesPersistentDatabase()) {
      const matches = this.inMemoryDb.get('matches') || [];
      const existingIndex = matches.findIndex((item) => item.code === match.code);
      const record = { ...match, updated_at: new Date() };
      if (existingIndex >= 0) matches[existingIndex] = { ...matches[existingIndex], ...record };
      else matches.push({ ...record, created_at: new Date() });
      return record;
    }
    const result = await this.query<any>(
      `INSERT INTO matches (code, game_type, stake_amount, pot_amount, p1_id, p2_id, p1_telegram_id, p2_telegram_id, status, state_payload)
       SELECT $1, $2, $3, $4,
         (SELECT id FROM users WHERE telegram_id = $5),
         (SELECT id FROM users WHERE telegram_id = $6),
         $5, $6,
         $7, $8
       ON CONFLICT (code) DO UPDATE SET
         game_type = EXCLUDED.game_type,
         stake_amount = EXCLUDED.stake_amount,
         pot_amount = EXCLUDED.pot_amount,
         p1_id = EXCLUDED.p1_id,
         p2_id = EXCLUDED.p2_id,
         p1_telegram_id = EXCLUDED.p1_telegram_id,
         p2_telegram_id = EXCLUDED.p2_telegram_id,
         status = CASE
           WHEN matches.status = 'finished' THEN 'finished'
           WHEN matches.status = 'cancelled' THEN 'cancelled'
           ELSE EXCLUDED.status
         END,
         state_payload = EXCLUDED.state_payload,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [match.code, match.gameType, match.stakeAmount, match.potAmount, match.p1TelegramId, match.p2TelegramId || null, match.status, match.statePayload],
    );
    return result.rows[0];
  }

  async loadActiveMatches() {
    if (!this.usesPersistentDatabase()) {
      return (this.inMemoryDb.get('matches') || []).filter((match) =>
        match.status === 'waiting' ||
        match.status === 'playing' ||
        (match.status === 'gameover' && ['pending', 'failed'].includes(match.statePayload?.settlementStatus))
      );
    }
    const result = await this.query<any>(
      `SELECT m.*, u1.telegram_id AS p1_telegram_id, u1.first_name AS p1_name, u1.photo_url AS p1_photo_url,
              u2.telegram_id AS p2_telegram_id, u2.first_name AS p2_name, u2.photo_url AS p2_photo_url
         FROM matches m
         JOIN users u1 ON u1.id = m.p1_id
         LEFT JOIN users u2 ON u2.id = m.p2_id
        WHERE m.status IN ('waiting', 'playing')
           OR (m.status = 'gameover' AND m.state_payload->>'settlementStatus' IN ('pending', 'failed'))
        ORDER BY m.created_at ASC`,
    );
    return result.rows;
  }

  async loadMatchByCode(code: string) {
    if (!this.usesPersistentDatabase()) {
      const matches = this.inMemoryDb.get('matches') || [];
      const match = matches.find((item) => item.code === code);
      return match ? { ...match } : undefined;
    }
    const result = await this.query<any>(
      `SELECT m.*, u1.telegram_id AS p1_telegram_id, u1.first_name AS p1_name, u1.photo_url AS p1_photo_url,
              u2.telegram_id AS p2_telegram_id, u2.first_name AS p2_name, u2.photo_url AS p2_photo_url
         FROM matches m
         JOIN users u1 ON u1.id = m.p1_id
         LEFT JOIN users u2 ON u2.id = m.p2_id
        WHERE m.code = $1`,
      [code]
    );
    return result.rows[0];
  }

  async deleteMatch(code: string) {
    if (!this.usesPersistentDatabase()) {
      const matches = this.inMemoryDb.get('matches') || [];
      const index = matches.findIndex((match) => match.code === code);
      if (index >= 0) matches.splice(index, 1);
      return;
    }
    await this.query('DELETE FROM matches WHERE code = $1', [code]);
  }

  /**
   * Atomically debits Player 1's stake, records the ledger transaction,
   * and creates the match record in a single database transaction.
   */
  async createMatchWithEscrow(params: {
    code: string;
    gameType: string;
    stakeAmount: number;
    potAmount: number;
    p1TelegramId: number;
    status?: string;
    statePayload?: Record<string, unknown>;
  }) {
    const { code, gameType, stakeAmount, potAmount, p1TelegramId, status = 'waiting', statePayload = {} } = params;
    const stakeNano = gramsToNano(stakeAmount);

    if (!this.usesPersistentDatabase()) {
      const user = this.getUserByTelegramId(p1TelegramId);
      if (!user) return { success: false as const, error: 'User account not found' };
      if (user.balance_gram < stakeAmount) {
        return { success: false as const, error: `Insufficient balance. Required: ${stakeAmount} GRAM, Available: ${user.balance_gram} GRAM` };
      }
      user.balance_gram -= stakeAmount;
      user.balance_nano = gramsToNano(user.balance_gram);
      this.saveUser(user);

      const opKey = `escrow:${code}:${p1TelegramId}`;
      this.recordTransaction({
        user_id: user.id,
        match_code: code,
        operation_key: opKey,
        type: 'match_stake',
        amount: -stakeAmount,
        fee: 0,
        balance_after: user.balance_gram,
      });

      const match = {
        code,
        gameType,
        game_type: gameType,
        stakeAmount,
        stake_amount: stakeAmount,
        potAmount,
        pot_amount: potAmount,
        p1TelegramId,
        p1_telegram_id: p1TelegramId,
        status,
        statePayload,
        state_payload: statePayload,
        version: 1,
        created_at: new Date(),
        updated_at: new Date(),
      };
      const matches = this.inMemoryDb.get('matches') || [];
      matches.push(match);
      this.inMemoryDb.set('matches', matches);

      return { success: true as const, user, match };
    }

    return this.withTransaction(async (client) => {
      const userRes = await client.query('SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE', [p1TelegramId]);
      if (userRes.rowCount === 0) {
        return { success: false as const, error: 'User account not found' };
      }
      const userRow = userRes.rows[0];
      const currentBalanceNano = BigInt(String(userRow.balance_nano ?? gramsToNano(Number(userRow.balance_gram))));
      if (currentBalanceNano < BigInt(stakeNano)) {
        return {
          success: false as const,
          error: `Insufficient balance. Required: ${stakeAmount} GRAM, Available: ${Number(userRow.balance_gram)} GRAM`,
        };
      }

      const updatedUserRes = await client.query(
        `UPDATE users
            SET balance_nano = balance_nano - $1::numeric,
                balance_gram = nano_to_gram(balance_nano - $1::numeric),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND balance_nano >= $1::numeric
        RETURNING *`,
        [stakeNano, userRow.id]
      );
      if (updatedUserRes.rowCount === 0) {
        return { success: false as const, error: 'Insufficient balance' };
      }
      const updatedUser = updatedUserRes.rows[0];

      const matchRes = await client.query(
        `INSERT INTO matches
          (code, game_type, stake_amount, pot_amount, p1_id, p1_telegram_id, status, state_payload, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)
         RETURNING *`,
        [code, gameType, stakeAmount, potAmount, updatedUser.id, p1TelegramId, status, JSON.stringify(statePayload)]
      );

      const opKey = `escrow:${code}:${p1TelegramId}`;
      await client.query(
        `INSERT INTO transactions
          (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1, $2, $3, 'match_stake', $4, '0', $5)`,
        [updatedUser.id, code, opKey, `-${stakeNano}`, String(updatedUser.balance_nano)]
      );

      return { success: true as const, user: this.normalizeUser(updatedUser), match: matchRes.rows[0] };
    });
  }

  /**
   * Multi-instance safe room joining: locks match row, validates waiting status,
   * debits Player 2's stake, transitions match status to 'playing', and records ledger
   * in a single atomic database transaction.
   */
  async joinMatchWithEscrow(params: {
    code: string;
    p2TelegramId: number;
    statePayload?: Record<string, unknown>;
  }) {
    const { code, p2TelegramId, statePayload } = params;

    if (!this.usesPersistentDatabase()) {
      const matches = this.inMemoryDb.get('matches') || [];
      const match = matches.find((m) => m.code === code);
      if (!match) return { success: false as const, error: 'Room not found' };
      const user = this.getUserByTelegramId(p2TelegramId);
      if (!user) return { success: false as const, error: 'User account not found' };

      // Idempotency: If Player 2 already joined this match, return existing state safely
      if (match.p2TelegramId === p2TelegramId && match.status === 'playing') {
        return { success: true as const, user, match };
      }

      if (match.status !== 'waiting' || (match.p2TelegramId && match.p2TelegramId !== p2TelegramId)) {
        return { success: false as const, error: 'Room is full or match already in progress' };
      }
      if (match.p1TelegramId === p2TelegramId) {
        return { success: false as const, error: 'Cannot join your own room as opponent' };
      }
      const stake = Number(match.stakeAmount || match.stake_amount);
      if (user.balance_gram < stake) {
        return { success: false as const, error: `Insufficient balance. Required: ${stake} GRAM, Available: ${user.balance_gram} GRAM` };
      }
      user.balance_gram -= stake;
      user.balance_nano = gramsToNano(user.balance_gram);
      this.saveUser(user);

      const opKey = `escrow:${code}:${p2TelegramId}`;
      this.recordTransaction({
        user_id: user.id,
        match_code: code,
        operation_key: opKey,
        type: 'match_stake',
        amount: -stake,
        fee: 0,
        balance_after: user.balance_gram,
      });

      match.p2TelegramId = p2TelegramId;
      match.p2_telegram_id = p2TelegramId;
      match.status = 'playing';
      match.potAmount = stake * 2;
      match.pot_amount = stake * 2;
      match.version = (match.version || 1) + 1;
      if (statePayload) {
        match.statePayload = statePayload;
        match.state_payload = statePayload;
      }
      match.updated_at = new Date();

      return { success: true as const, user, match };
    }

    return this.withTransaction(async (client) => {
      const matchRes = await client.query('SELECT * FROM matches WHERE code = $1 FOR UPDATE', [code]);
      if (matchRes.rowCount === 0) {
        return { success: false as const, error: 'Room not found' };
      }
      const match = matchRes.rows[0];

      const userRes = await client.query('SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE', [p2TelegramId]);
      if (userRes.rowCount === 0) {
        return { success: false as const, error: 'User account not found' };
      }
      const userRow = userRes.rows[0];

      // Idempotency: If Player 2 has already escrowed and joined this match, return safely
      if (match.p2_id === userRow.id && match.status === 'playing') {
        return { success: true as const, user: this.normalizeUser(userRow), match };
      }

      if (match.status !== 'waiting' || match.p2_id !== null) {
        return { success: false as const, error: 'Room is full or match already in progress' };
      }
      if (userRow.id === match.p1_id) {
        return { success: false as const, error: 'Cannot join your own room as opponent' };
      }

      const stake = Number(match.stake_amount);
      const stakeNano = gramsToNano(stake);
      const currentBalanceNano = BigInt(String(userRow.balance_nano ?? gramsToNano(Number(userRow.balance_gram))));
      if (currentBalanceNano < BigInt(stakeNano)) {
        return {
          success: false as const,
          error: `Insufficient balance. Required: ${stake} GRAM, Available: ${Number(userRow.balance_gram)} GRAM`,
        };
      }

      const updatedUserRes = await client.query(
        `UPDATE users
            SET balance_nano = balance_nano - $1::numeric,
                balance_gram = nano_to_gram(balance_nano - $1::numeric),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 AND balance_nano >= $1::numeric
        RETURNING *`,
        [stakeNano, userRow.id]
      );
      if (updatedUserRes.rowCount === 0) {
        return { success: false as const, error: 'Insufficient balance' };
      }
      const updatedUser = updatedUserRes.rows[0];

      const updateMatchRes = await client.query(
        `UPDATE matches
            SET p2_id = $1,
                p2_telegram_id = $2,
                status = 'playing',
                pot_amount = stake_amount * 2,
                state_payload = COALESCE($3, state_payload),
                version = version + 1,
                updated_at = CURRENT_TIMESTAMP
          WHERE code = $4 AND status = 'waiting'
        RETURNING *`,
        [updatedUser.id, p2TelegramId, statePayload ? JSON.stringify(statePayload) : null, code]
      );

      const opKey = `escrow:${code}:${p2TelegramId}`;
      await client.query(
        `INSERT INTO transactions
          (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1, $2, $3, 'match_stake', $4, '0', $5)`,
        [updatedUser.id, code, opKey, `-${stakeNano}`, String(updatedUser.balance_nano)]
      );

      return { success: true as const, user: this.normalizeUser(updatedUser), match: updateMatchRes.rows[0] };
    });
  }

  /**
   * Atomic 2-player stake debit and state reset for rematch rounds.
   */
  async startRematchWithEscrow(params: {
    matchCode: string;
    nextRoundCode: string;
    p1TelegramId: number;
    p2TelegramId: number;
    stake: number;
    statePayload?: Record<string, unknown>;
  }) {
    const { matchCode, nextRoundCode, p1TelegramId, p2TelegramId, stake, statePayload } = params;
    const stakeNano = gramsToNano(stake);

    if (!this.usesPersistentDatabase()) {
      const u1 = this.getUserByTelegramId(p1TelegramId);
      const u2 = this.getUserByTelegramId(p2TelegramId);
      if (!u1 || !u2) return { success: false as const, error: 'Player accounts not found' };
      if (u1.balance_gram < stake || u2.balance_gram < stake) {
        return { success: false as const, error: 'Insufficient balance for rematch' };
      }
      u1.balance_gram -= stake;
      u1.balance_nano = gramsToNano(u1.balance_gram);
      u2.balance_gram -= stake;
      u2.balance_nano = gramsToNano(u2.balance_gram);
      this.saveUser(u1);
      this.saveUser(u2);

      this.recordTransaction({
        user_id: u1.id,
        match_code: nextRoundCode,
        operation_key: `escrow:${nextRoundCode}:${p1TelegramId}`,
        type: 'match_stake',
        amount: -stake,
        fee: 0,
        balance_after: u1.balance_gram,
      });
      this.recordTransaction({
        user_id: u2.id,
        match_code: nextRoundCode,
        operation_key: `escrow:${nextRoundCode}:${p2TelegramId}`,
        type: 'match_stake',
        amount: -stake,
        fee: 0,
        balance_after: u2.balance_gram,
      });

      const matches = this.inMemoryDb.get('matches') || [];
      const parentMatch = matches.find((item) => item.code === matchCode);
      const newMatch = {
        code: nextRoundCode,
        gameType: parentMatch?.gameType || parentMatch?.game_type || 'snake',
        game_type: parentMatch?.gameType || parentMatch?.game_type || 'snake',
        stakeAmount: stake,
        stake_amount: stake,
        potAmount: stake * 2,
        pot_amount: stake * 2,
        p1TelegramId,
        p1_telegram_id: p1TelegramId,
        p2TelegramId,
        p2_telegram_id: p2TelegramId,
        status: 'playing',
        winner: null,
        version: 1,
        statePayload: statePayload || {},
        state_payload: statePayload || {},
        created_at: new Date(),
        updated_at: new Date(),
      };
      const existingIdx = matches.findIndex((item) => item.code === nextRoundCode);
      if (existingIdx >= 0) matches[existingIdx] = newMatch;
      else matches.push(newMatch);
      return { success: true as const, match: newMatch };
    }

    return this.withTransaction(async (client) => {
      const matchRes = await client.query('SELECT * FROM matches WHERE code = $1 FOR UPDATE', [matchCode]);
      if (matchRes.rowCount === 0) {
        return { success: false as const, error: 'Original match not found' };
      }
      const parentMatch = matchRes.rows[0];

      const usersRes = await client.query(
        'SELECT * FROM users WHERE telegram_id = ANY($1::bigint[]) ORDER BY id ASC FOR UPDATE',
        [[p1TelegramId, p2TelegramId]]
      );
      if (usersRes.rowCount < 2) {
        return { success: false as const, error: 'Player accounts not found' };
      }
      const u1Row = usersRes.rows.find((r: any) => Number(r.telegram_id) === p1TelegramId);
      const u2Row = usersRes.rows.find((r: any) => Number(r.telegram_id) === p2TelegramId);
      if (!u1Row || !u2Row) {
        return { success: false as const, error: 'Player accounts not found' };
      }

      const bal1 = BigInt(String(u1Row.balance_nano ?? gramsToNano(Number(u1Row.balance_gram))));
      const bal2 = BigInt(String(u2Row.balance_nano ?? gramsToNano(Number(u2Row.balance_gram))));
      const required = BigInt(stakeNano);
      if (bal1 < required || bal2 < required) {
        return { success: false as const, error: 'Insufficient balance for rematch' };
      }

      const up1 = await client.query(
        'UPDATE users SET balance_nano = balance_nano - $1::numeric, balance_gram = nano_to_gram(balance_nano - $1::numeric), updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [stakeNano, u1Row.id]
      );
      const up2 = await client.query(
        'UPDATE users SET balance_nano = balance_nano - $1::numeric, balance_gram = nano_to_gram(balance_nano - $1::numeric), updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [stakeNano, u2Row.id]
      );

      await client.query(
        `INSERT INTO transactions (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1, $2, $3, 'match_stake', $4, '0', $5)`,
        [u1Row.id, nextRoundCode, `escrow:${nextRoundCode}:${p1TelegramId}`, `-${stakeNano}`, String(up1.rows[0].balance_nano)]
      );
      await client.query(
        `INSERT INTO transactions (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1, $2, $3, 'match_stake', $4, '0', $5)`,
        [u2Row.id, nextRoundCode, `escrow:${nextRoundCode}:${p2TelegramId}`, `-${stakeNano}`, String(up2.rows[0].balance_nano)]
      );

      const newMatchRes = await client.query(
        `INSERT INTO matches (
          code, game_type, stake_amount, pot_amount, p1_id, p2_id, p1_telegram_id, p2_telegram_id, status, state_payload, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'playing', $9, 1)
        ON CONFLICT (code) DO UPDATE SET
          status = 'playing',
          winner_id = NULL,
          is_draw = FALSE,
          state_payload = COALESCE($9, matches.state_payload),
          version = matches.version + 1,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          nextRoundCode,
          parentMatch.game_type,
          stake,
          stake * 2,
          u1Row.id,
          u2Row.id,
          p1TelegramId,
          p2TelegramId,
          statePayload ? JSON.stringify(statePayload) : null,
        ]
      );

      return { success: true as const, match: newMatchRes.rows[0] };
    });
  }

  /**
   * Persist or query durable game actions for idempotency across multi-instance nodes.
   */
  async recordGameAction(params: {
    matchCode: string;
    requestId: string;
    playerId?: number;
    actionType: string;
    payload?: any;
    result: any;
  }) {
    const { matchCode, requestId, playerId, actionType, payload, result } = params;
    if (!this.usesPersistentDatabase()) {
      const actions = this.inMemoryDb.get('game_actions') || [];
      const existing = actions.find((a: any) => a.match_code === matchCode && a.request_id === requestId);
      if (existing) return existing;
      const rec = { match_code: matchCode, request_id: requestId, player_id: playerId, action_type: actionType, payload, result, created_at: new Date() };
      actions.push(rec);
      this.inMemoryDb.set('game_actions', actions);
      return rec;
    }

    const res = await this.query(
      `INSERT INTO game_actions (match_code, request_id, player_id, action_type, payload, result)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (match_code, request_id) DO NOTHING
       RETURNING *`,
      [matchCode, requestId, playerId || null, actionType, payload ? JSON.stringify(payload) : null, JSON.stringify(result)]
    );
    return res.rows[0];
  }

  async getGameAction(matchCode: string, requestId: string) {
    if (!this.usesPersistentDatabase()) {
      const actions = this.inMemoryDb.get('game_actions') || [];
      return actions.find((a: any) => a.match_code === matchCode && a.request_id === requestId);
    }
    const res = await this.query('SELECT * FROM game_actions WHERE match_code = $1 AND request_id = $2', [matchCode, requestId]);
    return res.rows[0];
  }

  async debitUserBalance(telegramId: number, amount: number, matchCode?: string) {
    const amountNano = gramsToNano(amount);
    if (!this.usesPersistentDatabase()) {
      const user = this.getUserByTelegramId(telegramId);
      if (!user) return { success: false as const, error: 'User account not found' };
      const operationKey = matchCode ? `stake:${matchCode}:${telegramId}` : undefined;
      const existing = operationKey ? this.getTransactionByOperationKey(operationKey) : undefined;
      if (existing) return { success: true as const, user };
      if (user.balance_gram < amount) return { success: false as const, error: 'Insufficient balance', balance: user.balance_gram };
      user.balance_gram -= amount;
      this.saveUser(user);
      this.recordTransaction({
        user_id: user.id,
        match_code: matchCode,
        operation_key: operationKey,
        type: 'match_stake',
        amount: -amount,
        fee: 0,
        balance_after: user.balance_gram,
      });
      return { success: true as const, user };
    }

    return this.withTransaction(async (client) => {
      const current = await client.query(
        'SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE',
        [telegramId]
      );
      if (current.rowCount === 0) {
        return { success: false as const, error: 'User account not found' };
      }
      const operationKey = matchCode ? `stake:${matchCode}:${telegramId}` : undefined;
      if (operationKey) {
        const existing = await client.query('SELECT 1 FROM transactions WHERE operation_key = $1', [operationKey]);
        if (existing.rowCount > 0) {
          return { success: true as const, user: this.normalizeUser(current.rows[0]) };
        }
      }
      const currentBalanceNano = BigInt(String(current.rows[0].balance_nano ?? gramsToNano(Number(current.rows[0].balance_gram))));
      if (currentBalanceNano < BigInt(amountNano)) {
        return { success: false as const, error: 'Insufficient balance', balance: Number(current.rows[0].balance_gram) };
      }
      const updated = await client.query(
        `UPDATE users
            SET balance_nano = balance_nano - $1::numeric,
                balance_gram = nano_to_gram(balance_nano - $1::numeric),
                updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = $2
            AND balance_nano >= $1::numeric
        RETURNING *`,
        [amountNano, telegramId]
      );
      if (updated.rowCount === 0) {
        return { success: false as const, error: 'Insufficient balance', balance: Number(current.rows[0].balance_gram) };
      }
      await client.query(
        `INSERT INTO transactions
          (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [updated.rows[0].id, matchCode || null, operationKey, 'match_stake',
          `-${amountNano}`, '0', String(updated.rows[0].balance_nano)]
      );
      return { success: true as const, user: this.normalizeUser(updated.rows[0]) };
    });
  }

  /**
   * Confirm a deposit and its ledger entry in one database transaction.
   * A TON Connect BoC is not a credit; this method is only called after the
   * indexer has found the matching on-chain transfer.
   */
  async confirmDeposit(intentId: string, txHash: string) {
    if (!txHash.trim()) return { success: false as const, error: 'Invalid deposit transaction hash' };
    txHash = txHash.trim();
    if (!this.usesPersistentDatabase()) {
      const intent = this.getDepositIntentById(intentId);
      if (!intent) return { success: false as const, error: 'Deposit intent not found' };
      if (intent.status === 'confirmed') {
        if (intent.tx_hash !== txHash) return { success: false as const, error: 'Deposit intent was confirmed with different transaction evidence' };
        return { success: true as const, user: this.getUserByTelegramId(intent.telegram_id) };
      }
      if (intent.status === 'expired' || (intent.expires_at && new Date() > new Date(intent.expires_at))) {
        this.updateDepositIntent(intentId, { status: 'expired' });
        return { success: false as const, error: 'Deposit intent has expired' };
      }
      if (intent.status !== 'pending') return { success: false as const, error: 'Deposit intent is not pending' };
      if (!intent.boc) return { success: false as const, error: 'Deposit transaction has not been submitted' };
      const alreadyCredited = this.getDepositIntentByTxHash(txHash);
      if (alreadyCredited && alreadyCredited.id !== intentId) {
        return { success: false as const, error: 'This on-chain transfer was already credited' };
      }
      const user = this.getUserByTelegramId(intent.telegram_id);
      if (!user) return { success: false as const, error: 'User account not found' };
      const amountNano = BigInt(String(intent.amount_nano));
      const currentBalanceNano = BigInt(String(user.balance_nano ?? gramsToNano(user.balance_gram)));
      const nextBalanceNano = (currentBalanceNano + amountNano).toString();
      const amountGram = nanoToGrams(amountNano);
      user.balance_nano = nextBalanceNano;
      user.balance_gram = nanoToGrams(nextBalanceNano);
      this.saveUser(user);
      this.recordTransaction({
        user_id: user.id,
        type: 'deposit',
        operation_key: `deposit:${intentId}`,
        amount: amountGram,
        amount_nano: amountNano.toString(),
        fee: 0,
        balance_after: user.balance_gram,
        balance_after_nano: nextBalanceNano,
        tx_hash: txHash,
      });
      this.updateDepositIntent(intentId, { status: 'confirmed', tx_hash: txHash });
      return { success: true as const, user };
    }

    return this.withTransaction(async (client) => {
      const intentResult = await client.query('SELECT * FROM deposit_intents WHERE id = $1 FOR UPDATE', [intentId]);
      const intent = intentResult.rows[0];
      if (!intent) {
        return { success: false as const, error: 'Deposit intent not found' };
      }
      if (intent.status === 'confirmed') {
        if (intent.tx_hash !== txHash) {
          return { success: false as const, error: 'Deposit intent was confirmed with different transaction evidence' };
        }
        const existingUser = await client.query('SELECT * FROM users WHERE telegram_id = $1', [intent.telegram_id]);
        return {
          success: true as const,
          user: existingUser.rows[0] ? this.normalizeUser(existingUser.rows[0]) : undefined,
        };
      }
      if (intent.status === 'expired' || (intent.expires_at && new Date() > new Date(intent.expires_at))) {
        await client.query("UPDATE deposit_intents SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [intentId]);
        return { success: false as const, error: 'Deposit intent has expired' };
      }
      if (intent.status !== 'pending') {
        return { success: false as const, error: 'Deposit intent is not pending' };
      }
      if (!intent.boc) return { success: false as const, error: 'Deposit transaction has not been submitted' };
      const alreadyCredited = await client.query(
        'SELECT id FROM deposit_intents WHERE tx_hash = $1 AND status = $2 AND id <> $3 FOR UPDATE',
        [txHash, 'confirmed', intentId]
      );
      if (alreadyCredited.rowCount > 0) {
        return { success: false as const, error: 'This on-chain transfer was already credited' };
      }

      const updated = await client.query(
        `UPDATE users
            SET balance_nano = balance_nano + $1::numeric,
                balance_gram = nano_to_gram(balance_nano + $1::numeric),
                updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = $2
        RETURNING *`,
        [String(intent.amount_nano), intent.telegram_id]
      );
      if (updated.rowCount === 0) {
        return { success: false as const, error: 'User account not found' };
      }
      await client.query(
        `INSERT INTO transactions
          (user_id, operation_key, type, amount_nano, fee_nano, balance_after_nano, tx_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [updated.rows[0].id, `deposit:${intentId}`, 'deposit',
          String(intent.amount_nano), '0', String(updated.rows[0].balance_nano), txHash]
      );
      await client.query(
        'UPDATE deposit_intents SET status = $1, tx_hash = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        ['confirmed', txHash, intentId]
      );
      return { success: true as const, user: this.normalizeUser(updated.rows[0]) };
    });
  }

  async createWithdrawalQuote(params: {
    telegramId: number;
    walletAddress: string;
    grossAmountNano: string;
    feeNano: string;
    netAmountNano: string;
    network: 'mainnet';
    expiresAt: Date;
  }) {
    if (!this.usesPersistentDatabase()) {
      const quotes = this.inMemoryDb.get('withdrawal_quotes') || [];
      const quote = {
        id: crypto.randomUUID(),
        telegram_id: params.telegramId,
        wallet_address: params.walletAddress,
        gross_amount_nano: params.grossAmountNano,
        fee_nano: params.feeNano,
        net_amount_nano: params.netAmountNano,
        network: params.network,
        status: 'quoted',
        expires_at: params.expiresAt,
        consumed_withdrawal_id: null,
        created_at: new Date(),
      };
      quotes.push(quote);
      this.inMemoryDb.set('withdrawal_quotes', quotes);
      return quote;
    }

    const result = await this.query<any>(
      `INSERT INTO withdrawal_quotes
        (telegram_id, wallet_address, gross_amount_nano, fee_nano, net_amount_nano, network, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [params.telegramId, params.walletAddress, params.grossAmountNano, params.feeNano,
        params.netAmountNano, params.network, params.expiresAt]
    );
    return result.rows[0];
  }

  async confirmWithdrawalQuote(params: {
    telegramId: number;
    quoteId: string;
    operationKey: string;
    limits: {
      minimumNano: string;
      maximumNano: string;
      userDailyNano: string;
    };
  }): Promise<{ success: boolean; error?: string; withdrawal?: any; transaction?: any; user?: any }> {
    const grossNano = BigInt(params.limits.minimumNano);
    const maxNano = BigInt(params.limits.maximumNano);
    const userDailyNano = BigInt(params.limits.userDailyNano);

    if (!this.usesPersistentDatabase()) {
      const quotes = this.inMemoryDb.get('withdrawal_quotes') || [];
      const quote = quotes.find((item: any) => item.id === params.quoteId);
      if (!quote) return { success: false, error: 'Withdrawal quote not found' };
      if (Number(quote.telegram_id) !== params.telegramId) return { success: false, error: 'Withdrawal quote ownership mismatch' };

      const withdrawals = this.inMemoryDb.get('withdrawals') || [];
      const existingForQuote = withdrawals.find((item: any) => item.quote_id === params.quoteId);
      const existingForKey = withdrawals.find((item: any) => item.operation_key === params.operationKey);
      if (existingForKey && existingForKey.quote_id !== params.quoteId) {
        return { success: false, error: 'Idempotency key is already linked to another withdrawal' };
      }
      const user = this.getUserByTelegramId(params.telegramId);
      if (!user) return { success: false, error: 'Account not found' };
      if (existingForQuote) {
        return {
          success: true,
          withdrawal: existingForQuote,
          transaction: this.toWithdrawalTransaction(existingForQuote),
          user: this.normalizeUser(user),
        };
      }
      if (quote.status !== 'quoted') return { success: false, error: 'Withdrawal quote is no longer available' };
      if (new Date(quote.expires_at).getTime() <= Date.now()) {
        quote.status = 'expired';
        return { success: false, error: 'Withdrawal quote expired' };
      }

      const quoteGrossNano = BigInt(String(quote.gross_amount_nano));
      if (quote.network !== 'mainnet') return { success: false, error: 'Only mainnet withdrawals are supported' };
      if (quoteGrossNano < grossNano || quoteGrossNano > maxNano) {
        return { success: false, error: 'Withdrawal amount is outside configured limits' };
      }
      const userNano = BigInt(String(user.balance_nano ?? gramsToNano(user.balance_gram)));
      if (userNano < quoteGrossNano) return { success: false, error: 'Insufficient balance' };

      const now = new Date();
      const startOfUtcDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const eligibleToday = withdrawals.filter((item: any) =>
        item.payout_eligible && new Date(item.created_at).getTime() >= startOfUtcDay.getTime()
      );
      const userTotal = eligibleToday
        .filter((item: any) => Number(item.telegram_id) === params.telegramId)
        .reduce((sum: bigint, item: any) => sum + BigInt(String(item.amount_nano)), 0n);
      if (userTotal + quoteGrossNano > userDailyNano) return { success: false, error: 'User daily withdrawal limit exceeded' };

      const amountNano = quoteGrossNano.toString();
      const newBalanceNano = (userNano - quoteGrossNano).toString();
      const id = crypto.randomUUID();
      const memo = generateWithdrawalMemo();
      const withdrawal = {
        id,
        telegram_id: params.telegramId,
        wallet_address: quote.wallet_address,
        amount_nano: amountNano,
        amount_gram: nanoToGrams(amountNano),
        fee_nano: String(quote.fee_nano),
        net_amount_nano: String(quote.net_amount_nano),
        network: quote.network,
        payout_eligible: true,
        quote_id: quote.id,
        status: 'pending',
        operation_key: params.operationKey,
        memo,
        created_at: now,
      };
      user.balance_nano = newBalanceNano;
      user.balance_gram = nanoToGrams(newBalanceNano);
      this.saveUser(user);
      withdrawals.push(withdrawal);
      this.inMemoryDb.set('withdrawals', withdrawals);
      quote.status = 'consumed';
      quote.consumed_withdrawal_id = id;
      this.recordTransaction({
        user_id: user.id,
        operation_key: params.operationKey,
        withdrawal_id: id,
        type: 'withdraw',
        amount: -nanoToGrams(amountNano),
        amount_nano: `-${amountNano}`,
        fee_nano: '0',
        balance_after: user.balance_gram,
        balance_after_nano: newBalanceNano,
      });
      return {
        success: true,
        withdrawal,
        transaction: this.toWithdrawalTransaction(withdrawal),
        user: this.normalizeUser(user),
      };
    }

    return this.withTransaction(async (client) => {
      const quoteRes = await client.query('SELECT * FROM withdrawal_quotes WHERE id = $1 FOR UPDATE', [params.quoteId]);
      const quote = quoteRes.rows[0];
      if (!quote) return { success: false, error: 'Withdrawal quote not found' };
      if (Number(quote.telegram_id) !== params.telegramId) return { success: false, error: 'Withdrawal quote ownership mismatch' };

      const existingForKey = await client.query('SELECT * FROM withdrawals WHERE operation_key = $1', [params.operationKey]);
      if (existingForKey.rowCount) {
        const existing = existingForKey.rows[0];
        if (String(existing.quote_id) !== params.quoteId) {
          return { success: false, error: 'Idempotency key is already linked to another withdrawal' };
        }
        const userRes = await client.query('SELECT * FROM users WHERE telegram_id = $1', [params.telegramId]);
        return {
          success: true,
          withdrawal: existing,
          transaction: this.toWithdrawalTransaction(existing),
          user: userRes.rows[0] ? this.normalizeUser(userRes.rows[0]) : undefined,
        };
      }
      if (quote.status === 'consumed' && quote.consumed_withdrawal_id) {
        const existingRes = await client.query('SELECT * FROM withdrawals WHERE id = $1', [quote.consumed_withdrawal_id]);
        const userRes = await client.query('SELECT * FROM users WHERE telegram_id = $1', [params.telegramId]);
        if (!existingRes.rowCount) return { success: false, error: 'Withdrawal quote has no linked withdrawal' };
        return {
          success: true,
          withdrawal: existingRes.rows[0],
          transaction: this.toWithdrawalTransaction(existingRes.rows[0]),
          user: userRes.rows[0] ? this.normalizeUser(userRes.rows[0]) : undefined,
        };
      }
      if (quote.status !== 'quoted') return { success: false, error: 'Withdrawal quote is no longer available' };
      if (new Date(quote.expires_at).getTime() <= Date.now()) {
        await client.query("UPDATE withdrawal_quotes SET status = 'expired' WHERE id = $1 AND status = 'quoted'", [params.quoteId]);
        return { success: false, error: 'Withdrawal quote expired' };
      }
      if (quote.network !== 'mainnet') return { success: false, error: 'Only mainnet withdrawals are supported' };

      const userRes = await client.query('SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE', [params.telegramId]);
      if (!userRes.rowCount) return { success: false, error: 'Account not found' };
      const userRow = userRes.rows[0];
      const quoteGrossNano = BigInt(String(quote.gross_amount_nano));
      if (quoteGrossNano < grossNano || quoteGrossNano > maxNano) {
        return { success: false, error: 'Withdrawal amount is outside configured limits' };
      }
      const dailyStart = await client.query("SELECT date_trunc('day', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS starts_at");
      const startOfDay = dailyStart.rows[0].starts_at;
      const userDailyRes = await client.query(
        `SELECT COALESCE(SUM(amount_nano), 0)::text AS total FROM withdrawals
         WHERE payout_eligible = TRUE AND telegram_id = $1 AND created_at >= $2`,
        [params.telegramId, startOfDay]
      );
      if (BigInt(userDailyRes.rows[0].total) + quoteGrossNano > userDailyNano) {
        return { success: false, error: 'User daily withdrawal limit exceeded' };
      }

      const currentNano = BigInt(String(userRow.balance_nano));
      if (currentNano < quoteGrossNano) return { success: false, error: 'Insufficient balance' };
      const amountNano = quoteGrossNano.toString();
      const amountGram = nanoToGrams(amountNano);
      const newBalanceNano = (currentNano - quoteGrossNano).toString();
      const updatedUserRes = await client.query(
        `UPDATE users SET balance_nano = $1::numeric,
          balance_gram = nano_to_gram($1::numeric), updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 RETURNING *`,
        [newBalanceNano, userRow.id]
      );
      const memo = generateWithdrawalMemo();
      const withdrawalRes = await client.query(
        `INSERT INTO withdrawals
          (telegram_id, wallet_address, amount_nano, amount_gram, fee_nano, net_amount_nano, network,
           payout_eligible, quote_id, status, operation_key, memo)
         VALUES ($1, $2, $3, $4, $5, $6, 'mainnet', TRUE, $7, 'pending', $8, $9)
         RETURNING *`,
        [params.telegramId, quote.wallet_address, amountNano, amountGram, String(quote.fee_nano),
          String(quote.net_amount_nano), params.quoteId, params.operationKey, memo]
      );
      const withdrawal = withdrawalRes.rows[0];
      await client.query(
        `INSERT INTO transactions
          (user_id, operation_key, withdrawal_id, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1, $2, $3, 'withdraw', $4, 0, $5)`,
        [userRow.id, params.operationKey, withdrawal.id, `-${amountNano}`, newBalanceNano]
      );
      await client.query(
        `UPDATE withdrawal_quotes SET status = 'consumed', consumed_withdrawal_id = $2 WHERE id = $1`,
        [params.quoteId, withdrawal.id]
      );
      return {
        success: true,
        withdrawal,
        transaction: this.toWithdrawalTransaction(withdrawal),
        user: this.normalizeUser(updatedUserRes.rows[0]),
      };
    });
  }

  private toWithdrawalTransaction(withdrawal: any) {
    const amountNano = String(withdrawal.amount_nano);
    return {
      id: String(withdrawal.id),
      type: 'withdraw',
      amountGram: nanoToGrams(amountNano),
      grossAmountNano: amountNano,
      feeNano: String(withdrawal.fee_nano),
      netAmountNano: String(withdrawal.net_amount_nano),
      status: withdrawal.status,
      createdAt: new Date(withdrawal.created_at).toISOString(),
      walletAddress: withdrawal.wallet_address,
      txHash: withdrawal.tx_hash || undefined,
    };
  }

  /** Claim one eligible payout while holding the single signer lease. */
  async claimNextWithdrawalPayout(workerId: string, leaseMs: number): Promise<any | null> {
    if (!workerId || workerId.length > 128 || !Number.isSafeInteger(leaseMs) || leaseMs <= 0) return null;
    if (!this.usesPersistentDatabase()) {
      const lock = this.inMemoryDb.get('payout_wallet_lock')?.[0];
      const now = Date.now();
      if (lock.lease_owner && new Date(lock.lease_expires_at).getTime() > now) return null;
      const withdrawals = this.inMemoryDb.get('withdrawals') || [];
      const withdrawal = withdrawals
        .filter((item: any) => item.payout_eligible &&
          (item.status === 'pending' || (item.status === 'processing' && new Date(item.payout_lease_expires_at || 0).getTime() <= now)))
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
      if (!withdrawal) {
        lock.lease_owner = null;
        lock.lease_expires_at = null;
        return null;
      }
      lock.fencing_token += 1;
      lock.lease_owner = workerId;
      lock.lease_expires_at = new Date(now + leaseMs);
      withdrawal.status = 'processing';
      withdrawal.payout_lease_owner = workerId;
      withdrawal.payout_lease_expires_at = lock.lease_expires_at;
      withdrawal.payout_fencing_token = lock.fencing_token;
      withdrawal.payout_attempt_count = Number(withdrawal.payout_attempt_count || 0) + 1;
      withdrawal.payout_last_attempt_at = new Date(now);
      return {
        withdrawal: { ...withdrawal },
        fencingToken: lock.fencing_token,
        needsReconciliation: Boolean(withdrawal.signed_payload_ciphertext),
      };
    }

    return this.withTransaction(async (client) => {
      const lockRes = await client.query('SELECT * FROM payout_wallet_locks WHERE id = 1 FOR UPDATE');
      if (!lockRes.rowCount) throw new Error('Payout wallet lock is not initialized');
      const lock = lockRes.rows[0];
      if (lock.lease_owner && new Date(lock.lease_expires_at).getTime() > Date.now()) return null;
      const selected = await client.query(
        `SELECT * FROM withdrawals
          WHERE payout_eligible = TRUE AND network = 'mainnet'
            AND (status = 'pending' OR (status = 'processing' AND payout_lease_expires_at <= CURRENT_TIMESTAMP))
          ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1`
      );
      if (!selected.rowCount) {
        await client.query('UPDATE payout_wallet_locks SET lease_owner = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1');
        return null;
      }
      const tokenRes = await client.query(
        `UPDATE payout_wallet_locks SET lease_owner = $1, lease_expires_at = CURRENT_TIMESTAMP + ($2 * INTERVAL '1 millisecond'),
             fencing_token = fencing_token + 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = 1 RETURNING fencing_token, lease_expires_at`, [workerId, leaseMs]
      );
      const lockUpdate = tokenRes.rows[0];
      const withdrawalRes = await client.query(
        `UPDATE withdrawals SET status = 'processing', payout_lease_owner = $1, payout_lease_expires_at = $2,
             payout_fencing_token = $3, payout_attempt_count = payout_attempt_count + 1,
             payout_last_attempt_at = CURRENT_TIMESTAMP
          WHERE id = $4 RETURNING *`,
        [workerId, lockUpdate.lease_expires_at, lockUpdate.fencing_token, selected.rows[0].id]
      );
      const withdrawal = withdrawalRes.rows[0];
      return { withdrawal, fencingToken: Number(lockUpdate.fencing_token), needsReconciliation: Boolean(withdrawal.signed_payload_ciphertext) };
    });
  }

  async persistSignedWithdrawalPayload(params: {
    withdrawalId: string; workerId: string; fencingToken: number; ciphertext: string | Buffer;
    iv: string | Buffer; tag: string | Buffer; seqno: number; validUntil: number; messageHash: string;
  }): Promise<boolean> {
    if (!this.usesPersistentDatabase()) {
      const lock = this.inMemoryDb.get('payout_wallet_lock')?.[0];
      const withdrawal = (this.inMemoryDb.get('withdrawals') || []).find((item: any) => item.id === params.withdrawalId);
      if (!withdrawal || !this.hasPayoutFence(lock, withdrawal, params.workerId, params.fencingToken)) return false;
      if (withdrawal.signed_payload_ciphertext) return false;
      Object.assign(withdrawal, {
        signed_payload_ciphertext: params.ciphertext, signed_payload_iv: params.iv, signed_payload_tag: params.tag,
        payout_seqno: params.seqno, payout_valid_until: params.validUntil, payout_message_hash: params.messageHash,
      });
      return true;
    }
    return this.withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE withdrawals w SET signed_payload_ciphertext = $1, signed_payload_iv = $2, signed_payload_tag = $3,
             payout_seqno = $4, payout_valid_until = $5, payout_message_hash = $6
          FROM payout_wallet_locks l
          WHERE w.id = $7 AND w.status = 'processing' AND w.payout_lease_owner = $8
            AND w.payout_fencing_token = $9 AND w.signed_payload_ciphertext IS NULL
            AND l.id = 1 AND l.lease_owner = $8 AND l.fencing_token = $9 AND l.lease_expires_at > CURRENT_TIMESTAMP`,
        [params.ciphertext, params.iv, params.tag, params.seqno, params.validUntil, params.messageHash,
          params.withdrawalId, params.workerId, params.fencingToken]
      );
      return result.rowCount === 1;
    });
  }

  async finalizeWithdrawalPayout(params: {
    withdrawalId: string; workerId: string; fencingToken: number; finalized: boolean;
    destination: string; amountNano: string; txHash: string; actualFeeNano: string;
  }): Promise<{ success: boolean; status?: string; error?: string }> {
    if (!params.finalized) return { success: false, error: 'Payout transfer is not finalized' };
    let fee: bigint;
    try { fee = BigInt(params.actualFeeNano); } catch { return { success: false, error: 'Invalid actual fee' }; }
    if (fee < 0n || !params.txHash) return { success: false, error: 'Invalid finalized transaction evidence' };
    if (!this.usesPersistentDatabase()) {
      const lock = this.inMemoryDb.get('payout_wallet_lock')?.[0];
      const withdrawal = (this.inMemoryDb.get('withdrawals') || []).find((item: any) => item.id === params.withdrawalId);
      if (!withdrawal) return { success: false, error: 'Withdrawal not found' };
      if (withdrawal.status === 'completed' && withdrawal.payout_tx_hash === params.txHash) return { success: true, status: 'completed' };
      if (!this.hasPayoutFence(lock, withdrawal, params.workerId, params.fencingToken)) return { success: false, error: 'Payout lease is stale' };
      if (params.destination !== withdrawal.wallet_address || BigInt(params.amountNano) !== BigInt(withdrawal.net_amount_nano)) {
        return { success: false, error: 'Finalized transfer does not match the quoted payout' };
      }
      Object.assign(withdrawal, {
        status: 'completed', payout_tx_hash: params.txHash, tx_hash: params.txHash,
        payout_actual_fee_nano: fee.toString(), payout_reconciled_at: new Date(),
        signed_payload_ciphertext: null, signed_payload_iv: null, signed_payload_tag: null,
        payout_lease_owner: null, payout_lease_expires_at: null,
      });
      lock.lease_owner = null; lock.lease_expires_at = null;
      return { success: true, status: 'completed' };
    }
    return this.withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE withdrawals w SET status = 'completed', tx_hash = $1, payout_actual_fee_nano = $2,
             payout_reconciled_at = CURRENT_TIMESTAMP, signed_payload_ciphertext = NULL, signed_payload_iv = NULL,
             signed_payload_tag = NULL, payout_lease_owner = NULL, payout_lease_expires_at = NULL
          FROM payout_wallet_locks l
          WHERE w.id = $3 AND w.status = 'processing' AND w.wallet_address = $4 AND w.net_amount_nano = $5::numeric
            AND w.payout_lease_owner = $6 AND w.payout_fencing_token = $7
            AND l.id = 1 AND l.lease_owner = $6 AND l.fencing_token = $7 AND l.lease_expires_at > CURRENT_TIMESTAMP
          RETURNING w.id`,
        [params.txHash, fee.toString(), params.withdrawalId, params.destination, params.amountNano, params.workerId, params.fencingToken]
      );
      if (result.rowCount !== 1) {
        const existing = await client.query('SELECT status, tx_hash FROM withdrawals WHERE id = $1', [params.withdrawalId]);
        if (existing.rows[0]?.status === 'completed' && existing.rows[0]?.tx_hash === params.txHash) {
          return { success: true, status: 'completed' };
        }
        return { success: false, error: 'Finalized transfer or payout lease did not match' };
      }
      await client.query('UPDATE payout_wallet_locks SET lease_owner = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND fencing_token = $1', [params.fencingToken]);
      return { success: true, status: 'completed' };
    });
  }

  async refundFailedWithdrawal(params: {
    withdrawalId: string; workerId: string; fencingToken: number; finalizedFailure: boolean; evidenceHash: string;
  }): Promise<{ success: boolean; refunded?: boolean; error?: string }> {
    if (!params.finalizedFailure || !params.evidenceHash) return { success: false, error: 'A finalized failure proof is required' };
    if (!this.usesPersistentDatabase()) {
      const lock = this.inMemoryDb.get('payout_wallet_lock')?.[0];
      const withdrawal = (this.inMemoryDb.get('withdrawals') || []).find((item: any) => item.id === params.withdrawalId);
      if (!withdrawal) return { success: false, error: 'Withdrawal not found' };
      const txs = this.inMemoryDb.get('transactions') || [];
      if (withdrawal.status === 'failed' && txs.some((tx: any) => tx.withdrawal_id === withdrawal.id && tx.type === 'withdrawal_refund')) {
        return { success: true, refunded: false };
      }
      if (!this.hasPayoutFence(lock, withdrawal, params.workerId, params.fencingToken)) return { success: false, error: 'Payout lease is stale' };
      const user = this.getUserByTelegramId(Number(withdrawal.telegram_id));
      if (!user) return { success: false, error: 'Account not found' };
      const gross = BigInt(String(withdrawal.amount_nano));
      const restored = (BigInt(String(user.balance_nano)) + gross).toString();
      user.balance_nano = restored; user.balance_gram = nanoToGrams(restored); this.saveUser(user);
      const refundKey = `withdrawal-refund:${withdrawal.id}`;
      this.recordTransaction({
        user_id: user.id, operation_key: refundKey, withdrawal_id: withdrawal.id,
        type: 'withdrawal_refund', amount_nano: gross.toString(), fee_nano: '0', balance_after_nano: restored,
        amount: nanoToGrams(gross.toString()), balance_after: user.balance_gram, evidence_hash: params.evidenceHash,
      });
      withdrawal.status = 'failed'; withdrawal.payout_failure_evidence_hash = params.evidenceHash;
      withdrawal.signed_payload_ciphertext = null; withdrawal.signed_payload_iv = null; withdrawal.signed_payload_tag = null;
      withdrawal.payout_lease_owner = null; withdrawal.payout_lease_expires_at = null;
      lock.lease_owner = null; lock.lease_expires_at = null;
      return { success: true, refunded: true };
    }
    return this.withTransaction(async (client) => {
      const withdrawalRes = await client.query(
        `SELECT w.*, l.lease_owner AS wallet_lease_owner, l.fencing_token AS wallet_fencing_token,
                l.lease_expires_at AS wallet_lease_expires_at
           FROM withdrawals w CROSS JOIN payout_wallet_locks l
          WHERE w.id = $1 AND l.id = 1 FOR UPDATE OF w, l`, [params.withdrawalId]
      );
      if (!withdrawalRes.rowCount) return { success: false, error: 'Withdrawal not found' };
      const withdrawal = withdrawalRes.rows[0];
      if (withdrawal.status === 'failed') {
        const prior = await client.query("SELECT id FROM transactions WHERE withdrawal_id = $1 AND type = 'withdrawal_refund'", [params.withdrawalId]);
        return prior.rowCount ? { success: true, refunded: false } : { success: false, error: 'Failed withdrawal has no refund record' };
      }
      const validFence = withdrawal.status === 'processing' && withdrawal.payout_lease_owner === params.workerId &&
        Number(withdrawal.payout_fencing_token) === params.fencingToken && withdrawal.wallet_lease_owner === params.workerId &&
        Number(withdrawal.wallet_fencing_token) === params.fencingToken && new Date(withdrawal.wallet_lease_expires_at).getTime() > Date.now();
      if (!validFence) return { success: false, error: 'Payout lease is stale' };
      const userRes = await client.query('SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE', [withdrawal.telegram_id]);
      if (!userRes.rowCount) return { success: false, error: 'Account not found' };
      const gross = String(withdrawal.amount_nano);
      const updatedUser = await client.query(
        `UPDATE users SET balance_nano = balance_nano + $1::numeric,
             balance_gram = nano_to_gram(balance_nano + $1::numeric), updated_at = CURRENT_TIMESTAMP
          WHERE id = $2 RETURNING *`, [gross, userRes.rows[0].id]
      );
      await client.query(
        `INSERT INTO transactions (user_id, operation_key, withdrawal_id, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1, $2, $3, 'withdrawal_refund', $4, 0, $5)`,
        [userRes.rows[0].id, `withdrawal-refund:${withdrawal.id}`, withdrawal.id, gross, String(updatedUser.rows[0].balance_nano)]
      );
      await client.query(
        `UPDATE withdrawals SET status = 'failed', payout_reconciled_at = CURRENT_TIMESTAMP, payout_failure_evidence_hash = $2,
             payout_lease_owner = NULL, payout_lease_expires_at = NULL, signed_payload_ciphertext = NULL,
             signed_payload_iv = NULL, signed_payload_tag = NULL WHERE id = $1`, [withdrawal.id, params.evidenceHash]
      );
      await client.query('UPDATE payout_wallet_locks SET lease_owner = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND fencing_token = $1', [params.fencingToken]);
      return { success: true, refunded: true };
    });
  }

  private hasPayoutFence(lock: any, withdrawal: any, workerId: string, fencingToken: number): boolean {
    return Boolean(lock && withdrawal && lock.lease_owner === workerId && withdrawal.payout_lease_owner === workerId &&
      Number(lock.fencing_token) === fencingToken && Number(withdrawal.payout_fencing_token) === fencingToken &&
      new Date(lock.lease_expires_at).getTime() > Date.now());
  }

  /**
   * Request a balance withdrawal to an external wallet address.
   * Debits user balance atomically in nanograms and creates an immutable transaction record.
   */
  async requestWithdrawal(
    telegramId: number,
    walletAddress: string,
    amountNano: string,
    operationKey?: string
  ): Promise<{
    success: boolean;
    error?: string;
    withdrawal?: any;
    user?: any;
    transaction?: any;
  }> {
    const opKey = operationKey || `withdrawal:${telegramId}:${Date.now()}:${crypto.randomBytes(4).toString('hex')}`;
    let nanoAmount: bigint;
    try {
      nanoAmount = BigInt(amountNano);
    } catch {
      return { success: false, error: 'Invalid withdrawal amount' };
    }
    if (nanoAmount <= 0n) {
      return { success: false, error: 'Withdrawal amount must be greater than zero' };
    }
    const amountGram = nanoToGrams(amountNano);

    if (!this.usesPersistentDatabase()) {
      const existingTx = (this.inMemoryDb.get('transactions') || []).find(
        (t: any) => t.operation_key === opKey
      );
      const user = this.getUserByTelegramId(telegramId);
      if (!user) return { success: false, error: 'Account not found' };

      if (existingTx) {
        const existingWithdrawal = (this.inMemoryDb.get('withdrawals') || []).find(
          (w: any) => w.operation_key === opKey
        );
        return {
          success: true,
          withdrawal: existingWithdrawal,
          user: this.normalizeUser(user),
          transaction: {
            id: existingWithdrawal?.id || existingTx.id,
            type: 'withdraw',
            amountGram: existingWithdrawal ? existingWithdrawal.amount_gram : existingTx.amount,
            status: 'completed',
            createdAt: existingWithdrawal ? existingWithdrawal.created_at : existingTx.created_at,
            walletAddress,
          },
        };
      }

      const userNano = BigInt(user.balance_nano ?? gramsToNano(user.balance_gram));
      if (userNano < nanoAmount) {
        return { success: false, error: 'Insufficient balance' };
      }

      const newBalanceNano = (userNano - nanoAmount).toString();
      user.balance_nano = newBalanceNano;
      user.balance_gram = nanoToGrams(newBalanceNano);
      this.saveUser(user);

      const withdrawalId = crypto.randomUUID();
      const memo = generateWithdrawalMemo();
      const withdrawal = {
        id: withdrawalId,
        telegram_id: telegramId,
        wallet_address: walletAddress,
        amount_nano: amountNano,
        amount_gram: amountGram,
        fee_nano: '0',
        status: 'completed',
        operation_key: opKey,
        memo,
        created_at: new Date().toISOString(),
      };
      const withdrawals = this.inMemoryDb.get('withdrawals') || [];
      withdrawals.push(withdrawal);
      this.inMemoryDb.set('withdrawals', withdrawals);

      this.recordTransaction({
        user_id: user.id,
        operation_key: opKey,
        type: 'withdraw',
        amount: -amountGram,
        fee: 0,
        balance_after: user.balance_gram,
        amount_nano: `-${amountNano}`,
        fee_nano: '0',
        balance_after_nano: newBalanceNano,
      });

      return {
        success: true,
        withdrawal,
        user: this.normalizeUser(user),
        transaction: {
          id: withdrawalId,
          type: 'withdraw',
          amountGram,
          status: 'completed',
          createdAt: withdrawal.created_at,
          walletAddress,
        },
      };
    }

    return this.withTransaction(async (client) => {
      // 1. Check idempotency
      const existingTx = await client.query(
        'SELECT * FROM transactions WHERE operation_key = $1',
        [opKey]
      );
      if (existingTx.rowCount && existingTx.rowCount > 0) {
        const userRes = await client.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
        if (!userRes.rows[0]) {
          return { success: false, error: 'Account not found' };
        }
        const existingWithdrawalRes = await client.query(
          'SELECT * FROM withdrawals WHERE operation_key = $1',
          [opKey]
        );
        const wRow = existingWithdrawalRes.rows[0];
        const txRow = existingTx.rows[0];
        return {
          success: true,
          withdrawal: wRow,
          user: this.normalizeUser(userRes.rows[0]),
          transaction: {
            id: wRow ? String(wRow.id) : String(txRow.id),
            type: 'withdraw',
            amountGram: wRow ? Number(wRow.amount_gram) : nanoToGrams(String(txRow.amount_nano)),
            status: 'completed',
            createdAt: wRow ? new Date(wRow.created_at).toISOString() : new Date().toISOString(),
            walletAddress: wRow?.wallet_address || walletAddress,
          },
        };
      }

      // 2. Lock user row FOR UPDATE
      const userRes = await client.query(
        'SELECT * FROM users WHERE telegram_id = $1 FOR UPDATE',
        [telegramId]
      );
      if (!userRes.rows[0]) {
        return { success: false, error: 'Account not found' };
      }
      const userRow = userRes.rows[0];
      const currentNano = BigInt(String(userRow.balance_nano ?? gramsToNano(Number(userRow.balance_gram))));
      if (currentNano < nanoAmount) {
        return { success: false, error: 'Insufficient balance' };
      }

      const newBalanceNano = (currentNano - nanoAmount).toString();

      // 3. Atomically debit user balance
      const updatedUserRes = await client.query(
        `UPDATE users
            SET balance_nano = $1::numeric,
                balance_gram = nano_to_gram($1::numeric),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        RETURNING *`,
        [newBalanceNano, userRow.id]
      );
      const updatedUser = this.normalizeUser(updatedUserRes.rows[0]);

      // 4. Insert into withdrawals table
      const memo = generateWithdrawalMemo();
      const withdrawalRes = await client.query(
        `INSERT INTO withdrawals
          (telegram_id, wallet_address, amount_nano, amount_gram, fee_nano, status, operation_key, memo)
         VALUES ($1, $2, $3, $4, 0, 'completed', $5, $6)
         RETURNING *`,
        [telegramId, walletAddress, amountNano, amountGram, opKey, memo]
      );

      // 5. Insert into transactions ledger (debit stored as negative nano per ledger invariants)
      await client.query(
        `INSERT INTO transactions
          (user_id, operation_key, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1, $2, 'withdraw', $3, 0, $4)`,
        [userRow.id, opKey, `-${amountNano}`, newBalanceNano]
      );

      const withdrawal = withdrawalRes.rows[0];
      return {
        success: true,
        withdrawal,
        user: updatedUser,
        transaction: {
          id: String(withdrawal.id),
          type: 'withdraw',
          amountGram,
          status: 'completed',
          createdAt: new Date(withdrawal.created_at).toISOString(),
          walletAddress,
        },
      };
    });
  }

  /**
   * Apply a win settlement atomically with its ledger and treasury rows.
   * Single authoritative settlement engine for both PostgreSQL and in-memory test fallback.
   */
  async settleWinMatch(matchCode: string, gameType: string, stake: number, winnerTgId: number, loserTgId: number, calculation?: any) {
    const calc = calculation || {
      totalPot: stake * 2,
      winnerPayout: Math.floor(stake * 2 * 0.90),
      loserPayout: 0,
      arenaFee: (stake * 2) - Math.floor(stake * 2 * 0.90),
      stakePerPlayer: stake,
    };

    if (!this.usesPersistentDatabase()) {
      const existing = this.getSettlement(matchCode);
      if (existing) return { applied: false, calculation: existing.calculation || calc };

      const winner = this.getUserByTelegramId(winnerTgId);
      const loser = this.getUserByTelegramId(loserTgId);
      if (winner) {
        winner.balance_gram += calc.winnerPayout;
        winner.balance_nano = gramsToNano(winner.balance_gram);
        winner.total_winnings += calc.winnerPayout - stake;
        winner.total_volume += stake;
        winner.total_matches += 1;
        winner.wins += 1;
        winner.current_streak += 1;
        winner.best_streak = Math.max(winner.best_streak, winner.current_streak);
        winner.xp += 150;
        winner.level = Math.floor(winner.xp / 250) + 1;
        this.saveUser(winner);
        this.recordTransaction({
          user_id: winner.id,
          match_code: matchCode,
          operation_key: `settlement:${matchCode}:winner`,
          type: 'match_win',
          amount: calc.winnerPayout,
          fee: calc.arenaFee,
          balance_after: winner.balance_gram,
        });
      }
      if (loser) {
        loser.total_volume += stake;
        loser.total_matches += 1;
        loser.losses += 1;
        loser.current_streak = 0;
        loser.xp += 30;
        loser.level = Math.floor(loser.xp / 250) + 1;
        this.saveUser(loser);
      }
      this.addTreasuryRake(calc.arenaFee, false, calc.totalPot);
      this.saveSettlement({
        match_id: matchCode,
        kind: 'win',
        calculation: calc,
        winner_telegram_id: winnerTgId,
        loser_telegram_id: loserTgId,
      });

      const matches = this.inMemoryDb.get('matches') || [];
      const m = matches.find((item) => item.code === matchCode);
      if (m) {
        m.status = 'finished';
        m.winner_telegram_id = winnerTgId;
        m.winner_payout = calc.winnerPayout;
        m.finished_at = new Date();
      }

      return { applied: true, calculation: calc };
    }

    return this.withTransaction(async (client) => {
      // 1. Lock and validate match row if present
      const matchRes = await client.query(
        'SELECT * FROM matches WHERE code = $1 FOR UPDATE',
        [matchCode]
      );
      if (matchRes.rowCount && matchRes.rowCount > 0) {
        const match = matchRes.rows[0];
        if (['finished', 'cancelled'].includes(match.status)) {
          const existing = await client.query('SELECT calculation FROM settlements WHERE match_id = $1', [matchCode]);
          return { applied: false, calculation: existing.rows[0]?.calculation || calc };
        }
      }

      // 2. Claim settlement idempotency reservation
      const reservation = await client.query(
        `INSERT INTO settlements (match_id, kind, calculation, metadata) VALUES ($1,$2,$3,$4)
         ON CONFLICT (match_id) DO NOTHING RETURNING match_id`,
        [matchCode, 'win', calc, { gameType, winnerTgId, loserTgId }]
      );
      if (reservation.rowCount === 0) {
        const existing = await client.query('SELECT calculation FROM settlements WHERE match_id = $1', [matchCode]);
        return { applied: false, calculation: existing.rows[0].calculation };
      }

      // 3. Lock player accounts in deterministic ascending ID order
      const users = await client.query(
        'SELECT * FROM users WHERE telegram_id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
        [[winnerTgId, loserTgId]]
      );
      const winnerRow = users.rows.find((user: any) => Number(user.telegram_id) === winnerTgId);
      const loserRow = users.rows.find((user: any) => Number(user.telegram_id) === loserTgId);
      if (!winnerRow || !loserRow) {
        throw new Error('Cannot settle a match without both player accounts');
      }

      const winner = this.normalizeUser(winnerRow);
      const loser = this.normalizeUser(loserRow);
      const winnerBalanceNano = BigInt(String(winnerRow.balance_nano ?? gramsToNano(Number(winnerRow.balance_gram))));
      const winnerPayoutNano = BigInt(gramsToNano(calc.winnerPayout));
      const winnerNewBalanceNano = (winnerBalanceNano + winnerPayoutNano).toString();
      winner.balance_gram += calc.winnerPayout;
      winner.total_winnings += calc.winnerPayout - stake;
      winner.total_volume += stake;
      winner.total_matches += 1;
      winner.wins += 1;
      winner.current_streak += 1;
      winner.best_streak = Math.max(winner.best_streak, winner.current_streak);
      winner.xp += 150;
      winner.level = Math.floor(winner.xp / 250) + 1;

      loser.total_volume += stake;
      loser.total_matches += 1;
      loser.losses += 1;
      loser.current_streak = 0;
      loser.xp += 30;
      loser.level = Math.floor(loser.xp / 250) + 1;

      await client.query(
        `UPDATE users SET balance_nano = $1, balance_gram = nano_to_gram($1::numeric), total_winnings = $2, total_volume = $3,
          total_matches = $4, wins = $5, current_streak = $6, best_streak = $7,
          xp = $8, level = $9, updated_at = CURRENT_TIMESTAMP WHERE id = $10`,
        [winnerNewBalanceNano, winner.total_winnings, winner.total_volume, winner.total_matches,
          winner.wins, winner.current_streak, winner.best_streak, winner.xp, winner.level, winner.id]
      );
      await client.query(
        `UPDATE users SET total_volume = $1, total_matches = $2, losses = $3,
          current_streak = $4, xp = $5, level = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7`,
        [loser.total_volume, loser.total_matches, loser.losses, loser.current_streak, loser.xp, loser.level, loser.id]
      );
      await client.query(
        `INSERT INTO transactions
          (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [winner.id, matchCode, `settlement:${matchCode}:winner`, 'match_win',
          winnerPayoutNano.toString(), gramsToNano(calc.arenaFee), winnerNewBalanceNano]
      );
      await client.query(
        `INSERT INTO treasury_ledger (match_code, operation_key, type, rake_nano, volume_nano)
         VALUES ($1, $2, 'win_rake', $3, $4)
         ON CONFLICT (operation_key) DO NOTHING`,
        [matchCode, `treasury:${matchCode}:win`, gramsToNano(calc.arenaFee), gramsToNano(calc.totalPot)]
      );
      await client.query(
        `UPDATE treasury SET
          total_rake_nano = total_rake_nano + $1,
          win_rake_nano = win_rake_nano + $1,
          total_volume_nano = total_volume_nano + $2,
          updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
        [gramsToNano(calc.arenaFee), gramsToNano(calc.totalPot)]
      );
      await client.query(
        `UPDATE matches SET status = 'finished', winner_id = $1, dev_rake = $2, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE code = $3`,
        [winner.id, calc.arenaFee, matchCode]
      );
      return { applied: true, calculation: calc };
    });
  }

  /** Apply a draw settlement atomically with its ledger and treasury rows. */
  async settleDrawMatch(matchCode: string, gameType: string, stake: number, p1TgId: number, p2TgId: number, calculation?: any) {
    const calc = calculation || {
      totalPot: stake * 2,
      p1Refund: Math.floor(stake * 0.95),
      p2Refund: Math.floor(stake * 0.95),
      arenaFee: (stake * 2) - (Math.floor(stake * 0.95) * 2),
      stakePerPlayer: stake,
    };

    if (!this.usesPersistentDatabase()) {
      const existing = this.getSettlement(matchCode);
      if (existing) return { applied: false, calculation: existing.calculation || calc };

      const p1 = this.getUserByTelegramId(p1TgId);
      const p2 = this.getUserByTelegramId(p2TgId);
      if (p1) {
        p1.balance_gram += calc.p1Refund;
        p1.balance_nano = gramsToNano(p1.balance_gram);
        p1.total_volume += stake;
        p1.total_matches += 1;
        p1.draws += 1;
        p1.xp += 75;
        p1.level = Math.floor(p1.xp / 250) + 1;
        this.saveUser(p1);
        this.recordTransaction({
          user_id: p1.id,
          match_code: matchCode,
          operation_key: `settlement:${matchCode}:refund:${p1TgId}`,
          type: 'match_draw_refund',
          amount: calc.p1Refund,
          fee: stake - calc.p1Refund,
          balance_after: p1.balance_gram,
        });
      }
      if (p2) {
        p2.balance_gram += calc.p2Refund;
        p2.balance_nano = gramsToNano(p2.balance_gram);
        p2.total_volume += stake;
        p2.total_matches += 1;
        p2.draws += 1;
        p2.xp += 75;
        p2.level = Math.floor(p2.xp / 250) + 1;
        this.saveUser(p2);
        this.recordTransaction({
          user_id: p2.id,
          match_code: matchCode,
          operation_key: `settlement:${matchCode}:refund:${p2TgId}`,
          type: 'match_draw_refund',
          amount: calc.p2Refund,
          fee: stake - calc.p2Refund,
          balance_after: p2.balance_gram,
        });
      }
      this.addTreasuryRake(calc.arenaFee, true, calc.totalPot);
      this.saveSettlement({
        match_id: matchCode,
        kind: 'draw',
        calculation: calc,
        p1_telegram_id: p1TgId,
        p2_telegram_id: p2TgId,
      });

      const matches = this.inMemoryDb.get('matches') || [];
      const m = matches.find((item) => item.code === matchCode);
      if (m) {
        m.status = 'finished';
        m.is_draw = true;
      }

      return { applied: true, calculation: calc };
    }

    return this.withTransaction(async (client) => {
      // 1. Lock and validate match row if present
      const matchRes = await client.query(
        'SELECT * FROM matches WHERE code = $1 FOR UPDATE',
        [matchCode]
      );
      if (matchRes.rowCount && matchRes.rowCount > 0) {
        const match = matchRes.rows[0];
        if (['finished', 'cancelled'].includes(match.status)) {
          const existing = await client.query('SELECT calculation FROM settlements WHERE match_id = $1', [matchCode]);
          return { applied: false, calculation: existing.rows[0]?.calculation || calc };
        }
      }

      // 2. Claim settlement idempotency reservation
      const reservation = await client.query(
        `INSERT INTO settlements (match_id, kind, calculation, metadata) VALUES ($1,$2,$3,$4)
         ON CONFLICT (match_id) DO NOTHING RETURNING match_id`,
        [matchCode, 'draw', calc, { gameType, p1TgId, p2TgId }]
      );
      if (reservation.rowCount === 0) {
        const existing = await client.query('SELECT calculation FROM settlements WHERE match_id = $1', [matchCode]);
        return { applied: false, calculation: existing.rows[0].calculation };
      }

      // 3. Lock player accounts in deterministic ascending ID order
      const users = await client.query(
        'SELECT * FROM users WHERE telegram_id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
        [[p1TgId, p2TgId]]
      );
      const p1Row = users.rows.find((user: any) => Number(user.telegram_id) === p1TgId);
      const p2Row = users.rows.find((user: any) => Number(user.telegram_id) === p2TgId);
      if (!p1Row || !p2Row) {
        throw new Error('Cannot settle a draw without both player accounts');
      }

      const p1 = this.normalizeUser(p1Row);
      const p2 = this.normalizeUser(p2Row);
      const refundNano = gramsToNano(calc.p1Refund);
      const refundAmount = BigInt(refundNano);
      const players = [
        { player: p1, row: p1Row },
        { player: p2, row: p2Row },
      ];
      for (const { player, row } of players) {
        const currentBalanceNano = BigInt(String(row.balance_nano ?? gramsToNano(Number(row.balance_gram))));
        const newBalanceNano = (currentBalanceNano + refundAmount).toString();
        player.balance_nano = newBalanceNano;
        player.balance_gram = nanoToGrams(newBalanceNano);
        player.total_volume += stake;
        player.total_matches += 1;
        player.draws += 1;
        player.xp += 75;
        player.level = Math.floor(player.xp / 250) + 1;
      }

      for (const { player } of players) {
        await client.query(
          `UPDATE users SET balance_nano = $1, balance_gram = nano_to_gram($1::numeric), total_volume = $2, total_matches = $3,
            draws = $4, xp = $5, level = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7`,
          [player.balance_nano, player.total_volume, player.total_matches, player.draws, player.xp, player.level, player.id]
        );
        await client.query(
          `INSERT INTO transactions
            (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [player.id, matchCode, `settlement:${matchCode}:refund:${player.telegram_id}`, 'match_draw_refund',
            refundNano, gramsToNano(stake - calc.p1Refund), player.balance_nano]
        );
      }
      await client.query(
        `INSERT INTO treasury_ledger (match_code, operation_key, type, rake_nano, volume_nano)
         VALUES ($1, $2, 'draw_fee', $3, $4)
         ON CONFLICT (operation_key) DO NOTHING`,
        [matchCode, `treasury:${matchCode}:draw`, gramsToNano(calc.arenaFee), gramsToNano(calc.totalPot)]
      );
      await client.query(
        `UPDATE treasury SET
          total_rake_nano = total_rake_nano + $1,
          draw_fees_nano = draw_fees_nano + $1,
          total_volume_nano = total_volume_nano + $2,
          updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
        [gramsToNano(calc.arenaFee), gramsToNano(calc.totalPot)]
      );
      await client.query(
        `UPDATE matches SET status = 'finished', is_draw = TRUE, dev_rake = $1, finished_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE code = $2`,
        [calc.arenaFee, matchCode]
      );
      return { applied: true, calculation: calc };
    });
  }

  /** Refund one escrowed stake exactly once when a waiting room is cancelled. */
  async refundStake(telegramId: number, stake: number, matchCode: string) {
    const settlementCode = `${matchCode}:cancel-refund:${telegramId}`;
    if (!this.usesPersistentDatabase()) {
      const existing = this.getSettlement(settlementCode);
      const user = this.getUserByTelegramId(telegramId);
      if (existing) {
        return { success: true as const, balance: user?.balance_gram };
      }
      if (!user) return { success: false as const, error: 'User not found' };
      user.balance_gram += stake;
      user.balance_nano = gramsToNano(user.balance_gram);
      this.saveUser(user);
      this.recordTransaction({
        user_id: user.id,
        match_code: matchCode,
        operation_key: `refund:${matchCode}:${telegramId}`,
        type: 'match_cancelled_refund',
        amount: stake,
        fee: 0,
        balance_after: user.balance_gram,
      });
      this.saveSettlement({
        match_id: settlementCode,
        kind: 'cancel_refund',
        telegram_id: telegramId,
        amount: stake,
      });
      return { success: true as const, balance: user.balance_gram };
    }

    return this.withTransaction(async (client) => {
      const reservation = await client.query(
        `INSERT INTO settlements (match_id, kind, calculation, metadata) VALUES ($1,$2,$3,$4)
         ON CONFLICT (match_id) DO NOTHING RETURNING match_id`,
        [settlementCode, 'cancel_refund', { refund: stake }, { telegramId, matchCode }]
      );
      if (reservation.rowCount === 0) {
        const user = await client.query('SELECT balance_gram FROM users WHERE telegram_id = $1', [telegramId]);
        return { success: true as const, balance: user.rows[0] ? Number(user.rows[0].balance_gram) : undefined };
      }

      const updated = await client.query(
        `UPDATE users
            SET balance_nano = balance_nano + $1::numeric,
                balance_gram = nano_to_gram(balance_nano + $1::numeric),
                updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = $2
        RETURNING *`,
        [gramsToNano(stake), telegramId]
      );
      if (updated.rowCount === 0) throw new Error('Cannot refund a missing player account');
      await client.query(
        `INSERT INTO transactions
          (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [updated.rows[0].id, matchCode, `refund:${matchCode}:${telegramId}`, 'match_cancelled_refund',
          gramsToNano(stake), '0', String(updated.rows[0].balance_nano)]
      );
      return { success: true as const, balance: Number(updated.rows[0].balance_gram) };
    });
  }

  /**
   * Atomically cancel a match and refund all escrowed participants in a single transaction.
   */
  async cancelMatchAndRefund(matchCode: string) {
    if (!this.usesPersistentDatabase()) {
      const matches = this.inMemoryDb.get('matches') || [];
      const match = matches.find((m) => m.code === matchCode);
      if (!match) return { success: true, count: 0 };
      if (['finished', 'cancelled'].includes(match.status)) return { success: true, count: 0 };

      match.status = 'cancelled';
      const stake = Number(match.stakeAmount || match.stake_amount || 0);
      if (match.p1TelegramId) {
        await this.refundStake(Number(match.p1TelegramId), stake, matchCode);
      }
      if (match.p2TelegramId) {
        await this.refundStake(Number(match.p2TelegramId), stake, matchCode);
      }
      return { success: true, count: (match.p1TelegramId ? 1 : 0) + (match.p2TelegramId ? 1 : 0) };
    }

    return this.withTransaction(async (client) => {
      const matchRes = await client.query(
        'SELECT * FROM matches WHERE code = $1 FOR UPDATE',
        [matchCode]
      );
      if (matchRes.rowCount === 0) {
        return { success: true, count: 0 };
      }
      const match = matchRes.rows[0];
      if (['finished', 'cancelled'].includes(match.status)) {
        return { success: true, count: 0 };
      }

      const playerIds = [match.p1_id, match.p2_id].filter(Boolean);
      if (playerIds.length > 0) {
        const users = await client.query(
          'SELECT * FROM users WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE',
          [playerIds]
        );
        const stakeNano = gramsToNano(Number(match.stake_amount));

        for (const user of users.rows) {
          const settlementCode = `${matchCode}:cancel-refund:${user.telegram_id}`;
          const res = await client.query(
            `INSERT INTO settlements (match_id, kind, calculation, metadata) VALUES ($1,$2,$3,$4)
             ON CONFLICT (match_id) DO NOTHING RETURNING match_id`,
            [settlementCode, 'cancel_refund', { refund: Number(match.stake_amount) }, { telegramId: user.telegram_id, matchCode }]
          );
          if (res.rowCount && res.rowCount > 0) {
            const updated = await client.query(
              `UPDATE users SET balance_nano = balance_nano + $1::numeric, balance_gram = nano_to_gram(balance_nano + $1::numeric), updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
              [stakeNano, user.id]
            );
            await client.query(
              `INSERT INTO transactions
                (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [user.id, matchCode, `refund:${matchCode}:${user.telegram_id}`, 'match_cancelled_refund',
                stakeNano, '0', String(updated.rows[0].balance_nano)]
            );
          }
        }
      }

      await client.query(
        "UPDATE matches SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE code = $1",
        [matchCode]
      );
      return { success: true, count: playerIds.length };
    });
  }

  async loadLeaderboard(limit = 50, period: 'alltime' | 'daily' | 'weekly' = 'alltime') {
    if (period !== 'alltime') {
      const since = new Date(Date.now() - (period === 'daily' ? 24 : 168) * 60 * 60 * 1000);
      if (!this.usesPersistentDatabase()) {
        const usersByTelegramId = new Map(this.getUsers().map((user) => [user.telegram_id, user]));
        const totals = new Map<number, { wins: number; earned: number }>();
        for (const match of this.inMemoryDb.get('matches') || []) {
          const finishedAt = new Date(match.finished_at || match.updated_at || 0);
          const winnerTelegramId = Number(match.winner_telegram_id);
          if (match.status !== 'finished' || !winnerTelegramId || finishedAt < since || !usersByTelegramId.has(winnerTelegramId)) continue;
          const total = totals.get(winnerTelegramId) || { wins: 0, earned: 0 };
          total.wins += 1;
          total.earned += Math.max(0, Number(match.winner_payout || 0) - Number(match.stakeAmount ?? match.stake_amount ?? 0));
          totals.set(winnerTelegramId, total);
        }
        return [...totals.entries()]
          .map(([telegramId, total]) => {
            const user = usersByTelegramId.get(telegramId)!;
            return {
              name: user.first_name,
              handle: user.username ? `@${user.username}` : undefined,
              wins: total.wins,
              earned: total.earned,
              tier: user.level >= 20 ? 'Grandmaster' : user.level >= 10 ? 'Diamond' : user.level >= 5 ? 'Gold' : 'Unranked',
            };
          })
          .sort((a, b) => b.wins - a.wins || b.earned - a.earned || a.name.localeCompare(b.name))
          .slice(0, limit)
          .map((player, index) => ({ ...player, rank: index + 1 }));
      }

      const result = await this.query<any>(
        `SELECT u.telegram_id, u.username, u.first_name, u.level,
                COUNT(m.id)::integer AS wins,
                COALESCE(SUM(GREATEST(t.amount - m.stake_amount, 0)), 0) AS earned
           FROM matches m
           JOIN users u ON u.id = m.winner_id
           LEFT JOIN transactions t ON t.match_code = m.code AND t.user_id = u.id AND t.type = 'match_win'
          WHERE m.status = 'finished' AND m.finished_at >= $1
          GROUP BY u.id, u.telegram_id, u.username, u.first_name, u.level
          ORDER BY wins DESC, earned DESC, u.telegram_id ASC
          LIMIT $2`,
        [since, limit]
      );
      return result.rows.map((row: any, index: number) => ({
        rank: index + 1,
        name: row.first_name,
        handle: row.username ? `@${row.username}` : undefined,
        wins: Number(row.wins),
        earned: Number(row.earned),
        tier: Number(row.level) >= 20 ? 'Grandmaster' : Number(row.level) >= 10 ? 'Diamond' : Number(row.level) >= 5 ? 'Gold' : 'Unranked',
      }));
    }

    if (!this.usesPersistentDatabase()) {
      const users = this.getUsers();
      return users
        .slice()
        .sort((a, b) => b.wins - a.wins || b.total_winnings - a.total_winnings || a.telegram_id - b.telegram_id)
        .slice(0, limit)
        .map((user, index) => ({
          rank: index + 1,
          name: user.first_name,
          handle: user.username ? `@${user.username}` : undefined,
          wins: user.wins,
          earned: user.total_winnings,
          tier: user.level >= 20 ? 'Grandmaster' : user.level >= 10 ? 'Diamond' : user.level >= 5 ? 'Gold' : 'Unranked',
        }));
    }

    const result = await this.query<any>(
      `SELECT telegram_id, username, first_name, wins, total_winnings, level
         FROM users
        ORDER BY wins DESC, total_winnings DESC, telegram_id ASC
        LIMIT $1`,
      [limit]
    );
    return result.rows.map((row: any, index: number) => ({
      rank: index + 1,
      name: row.first_name,
      handle: row.username ? `@${row.username}` : undefined,
      wins: Number(row.wins),
      earned: Number(row.total_winnings),
      tier: Number(row.level) >= 20 ? 'Grandmaster' : Number(row.level) >= 10 ? 'Diamond' : Number(row.level) >= 5 ? 'Gold' : 'Unranked',
    }));
  }

  private normalizeUser(user: any) {
    const balanceNano = String(user.balance_nano ?? gramsToNano(Number(user.balance_gram || 0)));
    return {
      ...user,
      id: Number(user.id),
      telegram_id: Number(user.telegram_id),
      balance_nano: balanceNano,
      balance_gram: nanoToGrams(balanceNano),
      total_winnings: Number(user.total_winnings),
      total_volume: Number(user.total_volume),
      total_matches: Number(user.total_matches),
      wins: Number(user.wins),
      losses: Number(user.losses),
      draws: Number(user.draws),
      current_streak: Number(user.current_streak),
      best_streak: Number(user.best_streak),
      level: Number(user.level),
      xp: Number(user.xp),
    };
  }

  async persistTransaction(tx: any) {
    if (!this.usesPersistentDatabase()) {
      this.recordTransaction(tx);
      return;
    }
    const amountNano = tx.amount_nano ?? (Number(tx.amount || 0) < 0
      ? `-${gramsToNano(Math.abs(Number(tx.amount || 0)))}`
      : gramsToNano(Number(tx.amount || 0)));
    const feeNano = tx.fee_nano ?? gramsToNano(Number(tx.fee || 0));
    const balanceAfterNano = tx.balance_after_nano ?? gramsToNano(Number(tx.balance_after || 0));
    await this.query(
      `INSERT INTO transactions
        (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano, tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tx.user_id, tx.match_id || tx.match_code || null, tx.operation_key || null, tx.type,
        amountNano, feeNano, balanceAfterNano, tx.tx_hash || null]
    );
  }

  async loadSettlement(matchCode: string) {
    if (!this.usesPersistentDatabase()) return this.getSettlement(matchCode);
    const result = await this.query<any>('SELECT * FROM settlements WHERE match_id = $1', [matchCode]);
    return result.rows[0];
  }

  async persistSettlement(settlement: any) {
    if (!this.usesPersistentDatabase()) return this.saveSettlement(settlement);
    const existing = await this.loadSettlement(settlement.match_id);
    if (existing) return existing;
    const result = await this.query<any>(
      'INSERT INTO settlements (match_id, kind, calculation, metadata) VALUES ($1,$2,$3,$4) RETURNING *',
      [settlement.match_id, settlement.kind, settlement.calculation || {}, settlement]
    );
    return result.rows[0];
  }

  async addTreasuryRakePersistent(rakeAmount: number, isDrawFee: boolean, volume: number) {
    if (!this.usesPersistentDatabase()) {
      this.addTreasuryRake(rakeAmount, isDrawFee, volume);
      return;
    }
    const rakeNano = gramsToNano(rakeAmount);
    const volumeNano = gramsToNano(volume);
    await this.query(
      `UPDATE treasury SET
        total_rake_nano = total_rake_nano + $1,
        win_rake_nano = win_rake_nano + $2,
        draw_fees_nano = draw_fees_nano + $3,
        total_volume_nano = total_volume_nano + $4,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [rakeNano, isDrawFee ? 0 : rakeNano, isDrawFee ? rakeNano : 0, volumeNano]
    );
  }

  async loadDepositIntentByBoc(boc: string) {
    if (!this.usesPersistentDatabase()) return this.getDepositIntentByBoc(boc);
    const result = await this.query<any>('SELECT * FROM deposit_intents WHERE boc = $1', [boc]);
    return result.rows[0];
  }

  async loadDepositIntentsForUser(telegramId: number) {
    if (!this.usesPersistentDatabase()) return this.getDepositIntentsForUser(telegramId);
    const result = await this.query<any>('SELECT * FROM deposit_intents WHERE telegram_id = $1 ORDER BY created_at DESC', [telegramId]);
    return result.rows;
  }

  async loadPendingDepositIntents() {
    if (!this.usesPersistentDatabase()) return this.getPendingDepositIntents();
    const result = await this.query<any>("SELECT * FROM deposit_intents WHERE status = 'pending' ORDER BY created_at ASC");
    return result.rows;
  }

  async expireDepositIntentIfDue(id: string, now = new Date()) {
    if (!this.usesPersistentDatabase()) {
      const intent = this.getDepositIntentById(id);
      if (!intent || intent.status !== 'pending' || !intent.expires_at || new Date(intent.expires_at) > now) {
        return false;
      }
      this.updateDepositIntent(id, { status: 'expired' });
      return true;
    }

    const result = await this.query(
      "UPDATE deposit_intents SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending' AND expires_at <= $2 RETURNING id",
      [id, now]
    );
    return (result.rowCount || 0) > 0;
  }

  async loadDepositIntentById(id: string) {
    if (!this.usesPersistentDatabase()) return this.getDepositIntentById(id);
    const result = await this.query<any>('SELECT * FROM deposit_intents WHERE id = $1', [id]);
    return result.rows[0];
  }

  async loadDepositIntentByTxHash(txHash: string) {
    if (!this.usesPersistentDatabase()) return this.getDepositIntentByTxHash(txHash);
    const result = await this.query<any>('SELECT * FROM deposit_intents WHERE tx_hash = $1 AND status = $2', [txHash, 'confirmed']);
    return result.rows[0];
  }

  async loadDepositIntentByMemo(memo: string) {
    if (!this.usesPersistentDatabase()) return this.getDepositIntentByMemo(memo);
    const result = await this.query<any>('SELECT * FROM deposit_intents WHERE memo = $1', [memo]);
    return result.rows[0];
  }

  getDepositIntentByMemo(memo: string) {
    const intents = this.inMemoryDb.get('deposit_intents') || [];
    return intents.find((intent) => intent.memo === memo);
  }

  async createDepositIntent(params: {
    telegramId: number;
    amountNano: string;
    walletAddress?: string;
    depositAddress: string;
    network: 'mainnet' | 'testnet';
  }) {
    if (!/^\d{1,30}$/.test(params.amountNano)) throw new Error('Invalid deposit amount');
    const nanoAmount = BigInt(params.amountNano);
    if (nanoAmount <= 0n) {
      throw new Error('Deposit amount must be greater than zero');
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    if (!this.usesPersistentDatabase()) {
      const user = this.getUserByTelegramId(params.telegramId);
      if (!user) throw new Error('Account not found');

      let memo = '';
      const intents = this.inMemoryDb.get('deposit_intents') || [];
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateDepositMemo();
        if (!intents.some((it: any) => it.memo === candidate)) {
          memo = candidate;
          break;
        }
      }
      if (!memo) throw new Error('Failed to generate unique deposit memo');

      const record = {
        id: crypto.randomUUID(),
        telegram_id: params.telegramId,
        wallet_address: params.walletAddress || '',
        deposit_address: params.depositAddress,
        amount_nano: params.amountNano,
        amount_gram: nanoToGrams(params.amountNano),
        memo,
        boc: null,
        network: params.network,
        status: 'pending' as const,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date(),
      };
      intents.push(record);
      this.inMemoryDb.set('deposit_intents', intents);
      return record;
    }

    const userRes = await this.query<{ exists: number }>('SELECT 1 AS exists FROM users WHERE telegram_id = $1', [params.telegramId]);
    if (!userRes.rows[0]) {
      throw new Error('Account not found');
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const memo = generateDepositMemo();
      try {
        const result = await this.query<any>(
          `INSERT INTO deposit_intents
            (telegram_id, wallet_address, deposit_address, amount_nano, memo, network, status, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
           RETURNING *`,
          [params.telegramId, params.walletAddress || '', params.depositAddress, params.amountNano, memo, params.network, expiresAt]
        );
        return result.rows[0];
      } catch (err: any) {
        if (err.code === '23505' && err.constraint === 'deposit_intents_memo_key' && attempt < 4) {
          continue;
        }
        throw err;
      }
    }
    throw new Error('Failed to allocate unique deposit memo');
  }

  async persistDepositIntent(intent: any) {
    if (!this.usesPersistentDatabase()) return this.saveDepositIntent(intent);
    const result = await this.query<any>(
      `INSERT INTO deposit_intents
        (telegram_id, wallet_address, deposit_address, amount_nano, boc, memo, network, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (boc) DO UPDATE SET boc = EXCLUDED.boc
       RETURNING *`,
      [intent.telegram_id, intent.wallet_address, intent.deposit_address, intent.amount_nano, intent.boc, intent.memo, intent.network, intent.status]
    );
    return result.rows[0];
  }

  async updatePersistentDepositIntent(id: string, patch: Record<string, unknown>) {
    const ALLOWED_COLUMNS = new Set(['status', 'tx_hash', 'deposit_address', 'wallet_address', 'boc', 'memo', 'expires_at']);
    const fields = Object.keys(patch);
    for (const field of fields) {
      if (!ALLOWED_COLUMNS.has(field)) {
        throw new Error(`Security Violation: Disallowed column in deposit_intents update: ${field}`);
      }
    }
    if (!this.usesPersistentDatabase()) return this.updateDepositIntent(id, patch);
    if (fields.length === 0) return this.loadDepositIntentById(id);

    const values = Object.values(patch);
    const assignments = fields.map((field, index) => `"${field}" = $${index + 2}`).join(', ');
    const result = await this.query<any>(
      `UPDATE deposit_intents SET ${assignments}, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0];
  }

  /** Cancel only an unsigned draft; a submitted BOC may already be on-chain. */
  async cancelPendingDepositIntent(id: string): Promise<boolean> {
    if (!this.usesPersistentDatabase()) {
      const intent = this.getDepositIntentById(id);
      if (!intent || intent.status !== 'pending' || intent.boc) return false;
      this.updateDepositIntent(id, { status: 'cancelled' });
      return true;
    }
    const result = await this.query(
      "UPDATE deposit_intents SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'pending' AND boc IS NULL RETURNING id",
      [id]
    );
    return result.rowCount === 1;
  }

  /** Atomically bind one signed BOC to a pending intent without permitting replacement or replay. */
  async claimPendingDepositBoc(id: string, boc: string, walletAddress?: string) {
    if (!this.usesPersistentDatabase()) {
      const intent = this.getDepositIntentById(id);
      if (!intent || intent.status !== 'pending') return undefined;
      if (intent.boc && intent.boc !== boc) return undefined;
      const existing = this.getDepositIntentByBoc(boc);
      if (existing && existing.id !== id) return undefined;
      return this.updateDepositIntent(id, {
        boc,
        ...(walletAddress ? { wallet_address: walletAddress } : {}),
      });
    }

    try {
      const result = await this.query<any>(
        `UPDATE deposit_intents
            SET boc = $2,
                wallet_address = CASE WHEN $3::text IS NULL OR $3 = '' THEN wallet_address ELSE $3 END,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND status = 'pending' AND (boc IS NULL OR boc = $2)
          RETURNING *`,
        [id, boc, walletAddress || null]
      );
      return result.rows[0];
    } catch (error: any) {
      // The unique BOC index arbitrates concurrent claims made against different intent rows.
      if (error?.code === '23505' && error?.constraint === 'idx_deposit_intents_boc_unique') return undefined;
      throw error;
    }
  }

  /**
   * Get direct reference to user in memory or DB
   */
  getUserByTelegramId(telegramId: number) {
    const users = this.inMemoryDb.get('users') || [];
    return users.find((u) => u.telegram_id === telegramId);
  }

  getUsers() {
    return (this.inMemoryDb.get('users') || []) as any[];
  }

  getTransactionsForUser(userId: number) {
    return (this.inMemoryDb.get('transactions') || []).filter((tx) => tx.user_id === userId);
  }

  getTransactionByOperationKey(operationKey: string) {
    return (this.inMemoryDb.get('transactions') || []).find((tx) => tx.operation_key === operationKey);
  }

  saveUser(user: any) {
    const users = this.inMemoryDb.get('users') || [];
    const idx = users.findIndex((u) => u.telegram_id === user.telegram_id);
    const balanceNano = user.balance_nano !== undefined
      ? String(user.balance_nano)
      : gramsToNano(Number(user.balance_gram ?? 0));
    const balanceGram = user.balance_gram !== undefined
      ? Number(user.balance_gram)
      : nanoToGrams(balanceNano);

    if (idx >= 0) {
      const existing = users[idx];
      users[idx] = {
        ...existing,
        ...user,
        id: existing.id,
        balance_nano: user.balance_nano !== undefined ? String(user.balance_nano) : (user.balance_gram !== undefined ? balanceNano : existing.balance_nano),
        balance_gram: user.balance_gram !== undefined ? balanceGram : (user.balance_nano !== undefined ? nanoToGrams(String(user.balance_nano)) : existing.balance_gram),
        updated_at: new Date(),
      };
      user.id = existing.id;
    } else {
      const id = users.length + 1;
      user.id = id;
      users.push({
        total_winnings: 0,
        total_volume: 0,
        total_matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        current_streak: 0,
        best_streak: 0,
        level: 1,
        xp: 0,
        favorite_game: 'snake',
        ...user,
        id,
        balance_nano: balanceNano,
        balance_gram: balanceGram,
        created_at: new Date(),
      });
    }
  }

  recordTransaction(tx: any) {
    const txs = this.inMemoryDb.get('transactions') || [];
    if (tx.operation_key) {
      const existing = txs.find((item) => item.operation_key === tx.operation_key);
      if (existing) return existing;
    }
    txs.push({
      ...tx,
      match_code: tx.match_code || tx.match_id,
      id: txs.length + 1,
      created_at: new Date(),
    });
  }

  getDepositIntentByBoc(boc: string) {
    const intents = this.inMemoryDb.get('deposit_intents') || [];
    return intents.find((intent) => intent.boc === boc);
  }

  getDepositIntentsForUser(telegramId: number) {
    const intents = this.inMemoryDb.get('deposit_intents') || [];
    return intents.filter((intent) => intent.telegram_id === telegramId);
  }

  getPendingDepositIntents() {
    const intents = this.inMemoryDb.get('deposit_intents') || [];
    return intents.filter((intent) => intent.status === 'pending');
  }

  getDepositIntentById(id: string) {
    const intents = this.inMemoryDb.get('deposit_intents') || [];
    return intents.find((intent) => intent.id === id);
  }

  getDepositIntentByTxHash(txHash: string) {
    const intents = this.inMemoryDb.get('deposit_intents') || [];
    return intents.find((intent) => intent.tx_hash === txHash && intent.status === 'confirmed');
  }

  updateDepositIntent(id: string, patch: Record<string, unknown>) {
    const intent = this.getDepositIntentById(id);
    if (!intent) return undefined;
    Object.assign(intent, patch, { updated_at: new Date() });
    return intent;
  }

  saveDepositIntent(intent: any) {
    const intents = this.inMemoryDb.get('deposit_intents') || [];
    const existing = intents.find((item) => item.boc === intent.boc);
    if (existing) return existing;
    const amountGram = Number(intent.amount_gram ?? (Number(intent.amount_nano || 0) / 1e9));
    const record = {
      ...intent,
      id: `dep_${intents.length + 1}`,
      amount_gram: amountGram,
      created_at: new Date(),
    };
    intents.push(record);
    return record;
  }

  getSettlement(matchCode: string) {
    const settlements = this.inMemoryDb.get('settlements') || [];
    return settlements.find((settlement) => settlement.match_id === matchCode);
  }

  saveSettlement(settlement: any) {
    const settlements = this.inMemoryDb.get('settlements') || [];
    const existing = settlements.find((item) => item.match_id === settlement.match_id);
    if (existing) return existing;
    const record = { ...settlement, id: settlements.length + 1, created_at: new Date() };
    settlements.push(record);
    return record;
  }

  addTreasuryRake(rakeAmount: number, isDrawFee: boolean, volume: number) {
    const treasury = this.inMemoryDb.get('treasury') || [];
    if (treasury[0]) {
      treasury[0].total_rake_collected += rakeAmount;
      if (isDrawFee) {
        treasury[0].draw_fees_collected += rakeAmount;
      } else {
        treasury[0].win_rake_collected += rakeAmount;
      }
      treasury[0].total_volume_processed += volume;
    }
  }
}
