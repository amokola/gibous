/**
 * Gibous PostgreSQL Database Client Pool & Transaction Manager
 * Follows PostgreSQL transaction and concurrency guidance (connection pooling,
 * parameterized queries, row locks, and durable operation keys).
 */

import crypto from 'crypto';
import { gramsToNano, integerGramsToNano, nanoToGrams } from '../money';
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

export function generateDepositMemo(internalUserId: number): string {
  if (!Number.isInteger(internalUserId) || internalUserId <= 0) {
    throw new Error(`Invalid internal user ID for deposit memo: ${internalUserId}`);
  }
  const randomHex = crypto.randomBytes(4).toString('hex');
  return `dep_${internalUserId}_${randomHex}`;
}

export function generateWithdrawalMemo(internalUserId: number): string {
  if (!Number.isInteger(internalUserId) || internalUserId <= 0) {
    throw new Error(`Invalid internal user ID for withdrawal memo: ${internalUserId}`);
  }
  const randomHex = crypto.randomBytes(4).toString('hex');
  return `wit_${internalUserId}_${randomHex}`;
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

  /**
   * Execute parameterized SQL query with PostgreSQL or high-speed memory fallback
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
    const trimmed = sql.trim().toLowerCase();

    // If real DATABASE_URL is configured, we connect via pg (skip in automated test suite)
    if (process.env.DATABASE_URL && process.env.NODE_ENV !== 'test') {
      try {
        // Dynamic import to support optional pg installation
        // @ts-ignore
        const pool = await this.getPgPool();
        const res = await pool.query(sql, params);
        return { rows: res.rows, rowCount: res.rowCount || res.rows.length };
      } catch (err) {
        if (process.env.NODE_ENV === 'production') {
          throw err;
        }
        console.warn('PostgreSQL connection fallback to memory:', (err as Error).message);
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
        statement_timeout: 5_000,
        query_timeout: 5_000,
        lock_timeout: 3_000,
        idle_in_transaction_session_timeout: 5_000,
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
    if (!this.usesPersistentDatabase()) return this.getTransactionsForUser(userId);
    const result = await this.query<any>(
      'SELECT id, type, amount, fee, balance_after, tx_hash, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
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
    const balanceNano = gramsToNano(Number(user.balance_gram || 0));
    const result = await this.query<any>(
      `INSERT INTO users (
        telegram_id, username, first_name, last_name, photo_url, balance_nano,
        total_winnings, total_volume, total_matches, wins, losses, draws,
        current_streak, best_streak, level, xp, favorite_game
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
        balanceNano, user.total_winnings, user.total_volume, user.total_matches,
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
    const stakeNano = integerGramsToNano(stakeAmount);

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
                balance_gram = (balance_nano - $1::numeric) / 1000000000.0,
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
      const stakeNano = integerGramsToNano(stake);
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
                balance_gram = (balance_nano - $1::numeric) / 1000000000.0,
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
    const stakeNano = integerGramsToNano(stake);

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
        'UPDATE users SET balance_nano = balance_nano - $1::numeric, balance_gram = (balance_nano - $1::numeric) / 1000000000.0, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [stakeNano, u1Row.id]
      );
      const up2 = await client.query(
        'UPDATE users SET balance_nano = balance_nano - $1::numeric, balance_gram = (balance_nano - $1::numeric) / 1000000000.0, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
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
    const amountNano = integerGramsToNano(amount);
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
                balance_gram = (balance_nano - $1::numeric) / 1000000000.0,
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
    if (!this.usesPersistentDatabase()) {
      const intent = this.getDepositIntentById(intentId);
      if (!intent) return { success: false as const, error: 'Deposit intent not found' };
      if (intent.status === 'confirmed') return { success: true as const, user: this.getUserByTelegramId(intent.telegram_id) };
      if (intent.status === 'expired' || (intent.expires_at && new Date() > new Date(intent.expires_at))) {
        this.updateDepositIntent(intentId, { status: 'expired' });
        return { success: false as const, error: 'Deposit intent has expired' };
      }
      if (intent.status !== 'pending') return { success: false as const, error: 'Deposit intent is not pending' };
      const alreadyCredited = this.getDepositIntentByTxHash(txHash);
      if (alreadyCredited && alreadyCredited.id !== intentId) {
        return { success: false as const, error: 'This on-chain transfer was already credited' };
      }
      const user = this.getUserByTelegramId(intent.telegram_id);
      if (!user) return { success: false as const, error: 'User account not found' };
      const amountGram = Number(intent.amount_gram ?? (Number(intent.amount_nano || 0) / 1e9));
      user.balance_gram += amountGram;
      user.balance_nano = gramsToNano(user.balance_gram);
      this.saveUser(user);
      this.recordTransaction({
        user_id: user.id,
        type: 'deposit',
        operation_key: `deposit:${intentId}`,
        amount: amountGram,
        fee: 0,
        balance_after: user.balance_gram,
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
                balance_gram = (balance_nano + $1::numeric) / 1000000000.0,
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
      const user = this.getUserByTelegramId(telegramId);
      if (!user) return { success: false, error: 'Account not found' };

      const userNano = BigInt(user.balance_nano ?? gramsToNano(user.balance_gram));
      if (userNano < nanoAmount) {
        return { success: false, error: 'Insufficient balance' };
      }

      const newBalanceNano = (userNano - nanoAmount).toString();
      user.balance_nano = newBalanceNano;
      user.balance_gram = nanoToGrams(newBalanceNano);
      this.saveUser(user);

      const withdrawalId = crypto.randomUUID();
      const memo = generateWithdrawalMemo(user.id);
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
        amount: amountGram,
        fee: 0,
        balance_after: user.balance_gram,
        amount_nano: amountNano,
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
        return {
          success: true,
          user: userRes.rows[0] ? this.normalizeUser(userRes.rows[0]) : undefined,
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
                balance_gram = ($1::numeric / 1000000000.0),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
        RETURNING *`,
        [newBalanceNano, userRow.id]
      );
      const updatedUser = this.normalizeUser(updatedUserRes.rows[0]);

      // 4. Insert into withdrawals table
      const memo = generateWithdrawalMemo(userRow.id);
      const withdrawalRes = await client.query(
        `INSERT INTO withdrawals
          (telegram_id, wallet_address, amount_nano, amount_gram, fee_nano, status, operation_key, memo)
         VALUES ($1, $2, $3, $4, 0, 'completed', $5, $6)
         RETURNING *`,
        [telegramId, walletAddress, amountNano, amountGram, opKey, memo]
      );

      // 5. Insert into transactions ledger
      await client.query(
        `INSERT INTO transactions
          (user_id, operation_key, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1, $2, 'withdraw', $3, 0, $4)`,
        [userRow.id, opKey, amountNano, newBalanceNano]
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
      if (m) m.status = 'finished';

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
      const winnerPayoutNano = BigInt(integerGramsToNano(calc.winnerPayout));
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
        `UPDATE users SET balance_nano = $1, balance_gram = ($1::numeric / 1000000000.0), total_winnings = $2, total_volume = $3,
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
          winnerPayoutNano.toString(), integerGramsToNano(calc.arenaFee), winnerNewBalanceNano]
      );
      await client.query(
        `INSERT INTO treasury_ledger (match_code, operation_key, type, rake_nano, volume_nano)
         VALUES ($1, $2, 'win_rake', $3, $4)
         ON CONFLICT (operation_key) DO NOTHING`,
        [matchCode, `treasury:${matchCode}:win`, integerGramsToNano(calc.arenaFee), integerGramsToNano(calc.totalPot)]
      );
      await client.query(
        `UPDATE treasury SET
          total_rake_nano = total_rake_nano + $1,
          win_rake_nano = win_rake_nano + $1,
          total_volume_nano = total_volume_nano + $2,
          updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
        [integerGramsToNano(calc.arenaFee), integerGramsToNano(calc.totalPot)]
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
      const refundNano = integerGramsToNano(calc.p1Refund);
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
          `UPDATE users SET balance_nano = $1, balance_gram = ($1::numeric / 1000000000.0), total_volume = $2, total_matches = $3,
            draws = $4, xp = $5, level = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7`,
          [player.balance_nano, player.total_volume, player.total_matches, player.draws, player.xp, player.level, player.id]
        );
        await client.query(
          `INSERT INTO transactions
            (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [player.id, matchCode, `settlement:${matchCode}:refund:${player.telegram_id}`, 'match_draw_refund',
            refundNano, integerGramsToNano(stake - calc.p1Refund), player.balance_nano]
        );
      }
      await client.query(
        `INSERT INTO treasury_ledger (match_code, operation_key, type, rake_nano, volume_nano)
         VALUES ($1, $2, 'draw_fee', $3, $4)
         ON CONFLICT (operation_key) DO NOTHING`,
        [matchCode, `treasury:${matchCode}:draw`, integerGramsToNano(calc.arenaFee), integerGramsToNano(calc.totalPot)]
      );
      await client.query(
        `UPDATE treasury SET
          total_rake_nano = total_rake_nano + $1,
          draw_fees_nano = draw_fees_nano + $1,
          total_volume_nano = total_volume_nano + $2,
          updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
        [integerGramsToNano(calc.arenaFee), integerGramsToNano(calc.totalPot)]
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
                balance_gram = (balance_nano + $1::numeric) / 1000000000.0,
                updated_at = CURRENT_TIMESTAMP
          WHERE telegram_id = $2
        RETURNING *`,
        [integerGramsToNano(stake), telegramId]
      );
      if (updated.rowCount === 0) throw new Error('Cannot refund a missing player account');
      await client.query(
        `INSERT INTO transactions
          (user_id, match_code, operation_key, type, amount_nano, fee_nano, balance_after_nano)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [updated.rows[0].id, matchCode, `refund:${matchCode}:${telegramId}`, 'match_cancelled_refund',
          integerGramsToNano(stake), '0', String(updated.rows[0].balance_nano)]
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
          'SELECT * FROM users WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
          [playerIds]
        );
        const stakeNano = integerGramsToNano(Number(match.stake_amount));

        for (const user of users.rows) {
          const settlementCode = `${matchCode}:cancel-refund:${user.telegram_id}`;
          const res = await client.query(
            `INSERT INTO settlements (match_id, kind, calculation, metadata) VALUES ($1,$2,$3,$4)
             ON CONFLICT (match_id) DO NOTHING RETURNING match_id`,
            [settlementCode, 'cancel_refund', { refund: Number(match.stake_amount) }, { telegramId: user.telegram_id, matchCode }]
          );
          if (res.rowCount && res.rowCount > 0) {
            const updated = await client.query(
              `UPDATE users SET balance_nano = balance_nano + $1::numeric, balance_gram = (balance_nano + $1::numeric) / 1000000000.0, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
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

  async loadLeaderboard(limit = 50) {
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
    const rakeNano = integerGramsToNano(rakeAmount);
    const volumeNano = integerGramsToNano(volume);
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
    let nanoAmount: bigint;
    try {
      nanoAmount = BigInt(params.amountNano);
    } catch {
      throw new Error('Invalid deposit amount');
    }
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
        const candidate = generateDepositMemo(user.id);
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

    const userRes = await this.query<{ id: number }>('SELECT id FROM users WHERE telegram_id = $1', [params.telegramId]);
    if (!userRes.rows[0]) {
      throw new Error('Account not found');
    }
    const internalUserId = userRes.rows[0].id;

    for (let attempt = 0; attempt < 5; attempt++) {
      const memo = generateDepositMemo(internalUserId);
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
