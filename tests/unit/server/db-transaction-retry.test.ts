import { describe, it, expect, vi } from 'vitest';
import { isRetryablePgError, executeWithRetry } from '../../../server/db/index';

describe('Database Transaction Retry & Transient Error Classifier', () => {
  it('correctly classifies retryable PostgreSQL error codes', () => {
    // 40001 = serialization_failure
    expect(isRetryablePgError({ code: '40001' })).toBe(true);
    // 40P01 = deadlock_detected
    expect(isRetryablePgError({ code: '40P01' })).toBe(true);
    // 57P01 = admin_shutdown
    expect(isRetryablePgError({ code: '57P01' })).toBe(true);
    // 08006 = connection_failure
    expect(isRetryablePgError({ code: '08006' })).toBe(true);
    // 53300 = too_many_connections
    expect(isRetryablePgError({ code: '53300' })).toBe(true);
    // Transient network errors
    expect(isRetryablePgError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryablePgError({ code: 'ETIMEDOUT' })).toBe(true);
  });

  it('correctly classifies non-retryable PostgreSQL error codes', () => {
    // 23505 = unique_violation
    expect(isRetryablePgError({ code: '23505' })).toBe(false);
    // 23514 = check_violation
    expect(isRetryablePgError({ code: '23514' })).toBe(false);
    // 23503 = foreign_key_violation
    expect(isRetryablePgError({ code: '23503' })).toBe(false);
    // 22000 = data_exception
    expect(isRetryablePgError({ code: '22000' })).toBe(false);
    // Standard application Error
    expect(isRetryablePgError(new Error('Insufficient balance'))).toBe(false);
  });

  it('retries transient errors and succeeds if next attempt succeeds', async () => {
    let attempts = 0;
    const task = vi.fn(async () => {
      attempts++;
      if (attempts === 1) {
        const err: any = new Error('deadlock detected');
        err.code = '40P01';
        throw err;
      }
      return { success: true, attempts };
    });

    const result = await executeWithRetry(task, { maxRetries: 3, baseDelayMs: 5 });
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('fails immediately on non-retryable errors without retrying', async () => {
    const task = vi.fn(async () => {
      const err: any = new Error('duplicate key');
      err.code = '23505';
      throw err;
    });

    await expect(executeWithRetry(task, { maxRetries: 3, baseDelayMs: 5 })).rejects.toThrow('duplicate key');
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('exhausts retries and throws if error persists', async () => {
    const task = vi.fn(async () => {
      const err: any = new Error('serialization failure');
      err.code = '40001';
      throw err;
    });

    await expect(executeWithRetry(task, { maxRetries: 3, baseDelayMs: 5 })).rejects.toThrow('serialization failure');
    expect(task).toHaveBeenCalledTimes(3);
  });
});
