import { runMigrations } from '../../server/db/migrate';

export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env.E2E_DATABASE_URL || process.env.TEST_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('Set E2E_DATABASE_URL (or TEST_DATABASE_URL) to a dedicated PostgreSQL database ending in _test.');
  }
  const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ''));
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run browser tests against "${databaseName}"; the database name must end in _test.`);
  }
  await runMigrations(databaseUrl);
}
