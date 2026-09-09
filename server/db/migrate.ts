import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Pool } from 'pg';

export async function runMigrations(customDatabaseUrl?: string): Promise<void> {
  const databaseUrl = customDatabaseUrl || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required to run database migrations');

  const dbDir = path.dirname(fileURLToPath(import.meta.url));
  const schemaPath = path.join(dbDir, 'schema.sql');
  const migrationPaths = [
    path.join(dbDir, 'migrations', '001_real_currency.sql'),
    path.join(dbDir, 'migrations', '002_financial_invariants.sql'),
    path.join(dbDir, 'migrations', '003_hardened_production_schema.sql'),
    path.join(dbDir, 'migrations', '004_settlement_foreign_keys_and_guards.sql'),
    path.join(dbDir, 'migrations', '005_leaderboard_and_cancellation.sql'),
    path.join(dbDir, 'migrations', '006_game_actions.sql'),
    path.join(dbDir, 'migrations', '007_deposit_intents_user_idx.sql'),
    path.join(dbDir, 'migrations', '008_deposit_withdrawal_memos.sql'),
    path.join(dbDir, 'migrations', '009_allow_cancelled_deposit_intent.sql'),
  ];

  const schemaSql = await readFile(schemaPath, 'utf8');
  const migrations = await Promise.all(migrationPaths.map(async (migrationPath) => ({
    id: path.basename(migrationPath, '.sql'),
    sql: await readFile(migrationPath, 'utf8'),
  })));
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED === 'true' }
        : undefined,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(schemaSql);
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id VARCHAR(128) PRIMARY KEY,
          applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    console.log('Applied schema.sql');

    for (const migration of migrations) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const applied = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [migration.id]);
        if (applied.rowCount === 0) {
          await client.query(migration.sql);
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
          console.log(`Applied ${migration.id}.sql`);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations().then(() => {
    console.log('Migrations completed successfully.');
    process.exit(0);
  }).catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
