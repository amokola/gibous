const testDatabaseUrl = process.env.TEST_DATABASE_URL;

process.env.NODE_ENV = 'integration';
process.env.RUN_POSTGRES_TESTS = 'true';
if (testDatabaseUrl) {
  const parsed = new URL(testDatabaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!databaseName.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL must point to a dedicated database whose name ends with _test');
  }
  process.env.DATABASE_URL = testDatabaseUrl;
}
