import { describe, expect, it, vi } from 'vitest';
import { DatabasePool } from '../../../server/db';

describe('DatabasePool persistence failures', () => {
  it('propagates PostgreSQL query failures when a database URL is configured', async () => {
    const db = DatabasePool.getInstance();
    const previousNodeEnv = process.env.NODE_ENV;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const databaseError = new Error('database unavailable');
    const postgresQuery = vi.fn().mockRejectedValue(databaseError);
    const poolSpy = vi.spyOn(db as any, 'getPgPool').mockResolvedValue({ query: postgresQuery });

    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgres://localhost/gibous_test';

    try {
      await expect(db.query('SELECT * FROM users WHERE telegram_id = $1', [123]))
        .rejects.toBe(databaseError);
      expect(postgresQuery).toHaveBeenCalledOnce();
    } finally {
      poolSpy.mockRestore();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
    }
  });
});
