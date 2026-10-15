import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageService } from '../../../server/storage';

describe('deposit attribution boundary', () => {
  let storage: StorageService;

  beforeEach(() => {
    vi.stubEnv('TON_DEPOSIT_ADDRESS', '');
    vi.stubEnv('TON_NETWORK', '');
    storage = new StorageService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not create a pending deposit without a server-created intent', async () => {
    await storage.getOrCreateUser({ id: 44332211, first_name: 'LegacyDepositor' });

    const result = await storage.recordPendingDeposit({
      telegramId: 44332211,
      walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      depositAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      amountNano: '1000000000',
      boc: 'legacy-boc-without-intent',
      network: 'mainnet',
    } as any);

    expect(result).toEqual({ success: false, error: 'DEPOSIT_INTENT_REQUIRED' });
    await expect(storage.getPendingDepositIntents()).resolves.toEqual([]);
  });
});
