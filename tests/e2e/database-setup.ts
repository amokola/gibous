import type { Page } from '@playwright/test';
import { Pool } from 'pg';

const databaseUrl = process.env.E2E_DATABASE_URL || process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Set E2E_DATABASE_URL (or TEST_DATABASE_URL) to a dedicated PostgreSQL database ending in _test.');
}

const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
if (!databaseName.endsWith('_test')) {
  throw new Error(`Refusing to seed E2E data in database "${databaseName}"; the database name must end in _test.`);
}

let nextTelegramId = Date.now() * 1000;

/** Gives each browser page a fresh, funded database identity and deterministic guest ID. */
export async function prepareE2EUser(page: Page, balanceGram = 100): Promise<number> {
  const telegramId = ++nextTelegramId;
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5_000 });
  try {
    await pool.query(
      `INSERT INTO users (telegram_id, username, first_name, balance_nano, balance_gram)
       VALUES ($1, $2, $3, $4::numeric, $5::numeric)
       ON CONFLICT (telegram_id) DO UPDATE
         SET username = EXCLUDED.username,
             first_name = EXCLUDED.first_name,
             balance_nano = EXCLUDED.balance_nano,
             balance_gram = EXCLUDED.balance_gram`,
      [telegramId, `e2e_${telegramId}`, `E2E ${telegramId}`, String(balanceGram * 1_000_000_000), String(balanceGram)],
    );
  } finally {
    await pool.end();
  }
  await page.addInitScript((id) => {
    window.sessionStorage.setItem('gibous_mock_tg_id', String(id));
  }, telegramId);
  return telegramId;
}
