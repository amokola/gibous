import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Automatic Gram withdrawal migration (013)', () => {
  const dbDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../server/db');
  const migrationFile = path.join(dbDirectory, 'migrations/013_gram_withdrawal_payouts.sql');
  const migrationSql = existsSync(migrationFile) ? readFileSync(migrationFile, 'utf8') : '';

  it('adds a durable migration for quotes and payout-eligible withdrawals', () => {
    expect(existsSync(migrationFile)).toBe(true);
  });

  it('keeps historical withdrawals ineligible and payout columns default-safe', () => {
    expect(migrationSql).toContain('payout_eligible BOOLEAN NOT NULL DEFAULT FALSE');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS withdrawal_quotes');
    expect(migrationSql).toContain("CHECK (network = 'mainnet')");
  });

  it('enforces quote, idempotency, and refund uniqueness in PostgreSQL', () => {
    const schemaSql = readFileSync(path.join(dbDirectory, 'schema.sql'), 'utf8');

    expect(migrationSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_quote_id');
    expect(schemaSql).toContain('operation_key VARCHAR(160) UNIQUE');
    expect(migrationSql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_withdrawal_refund');
    expect(migrationSql).toContain("WHERE type = 'withdrawal_refund'");
  });

  it('registers the migration and matches the fresh-install schema', () => {
    const runnerSql = readFileSync(path.join(dbDirectory, 'migrate.ts'), 'utf8');
    const schemaSql = readFileSync(path.join(dbDirectory, 'schema.sql'), 'utf8');

    expect(runnerSql).toContain("'013_gram_withdrawal_payouts.sql'");
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS withdrawal_quotes');
    expect(schemaSql).toContain('payout_eligible BOOLEAN NOT NULL DEFAULT FALSE');
    expect(schemaSql).toContain('idx_transactions_withdrawal_refund');
  });

  it('creates one durable payout-wallet lease with a fencing counter', () => {
    const schemaSql = readFileSync(path.join(dbDirectory, 'schema.sql'), 'utf8');

    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS payout_wallet_locks');
    expect(migrationSql).toContain('fencing_token BIGINT NOT NULL DEFAULT 0');
    expect(migrationSql).toContain('INSERT INTO payout_wallet_locks');
    expect(schemaSql).toContain('CREATE TABLE IF NOT EXISTS payout_wallet_locks');
  });
});
