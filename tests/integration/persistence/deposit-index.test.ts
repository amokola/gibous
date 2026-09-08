import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

describe('Deposit Intents Index Migration (007)', () => {
  it('defines the migration file correctly with composite index', async () => {
    const migrationFile = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../server/db/migrations/007_deposit_intents_user_idx.sql'
    );
    const sql = await readFile(migrationFile, 'utf8');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS idx_deposit_intents_user_created');
    expect(sql).toContain('ON deposit_intents (telegram_id, created_at DESC)');
  });

  it('keeps schema.sql in sync with the new index', async () => {
    const schemaFile = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../server/db/schema.sql'
    );
    const sql = await readFile(schemaFile, 'utf8');
    expect(sql).toContain('idx_deposit_intents_user_created');
    expect(sql).toContain('ON deposit_intents (telegram_id, created_at DESC)');
  });
});
