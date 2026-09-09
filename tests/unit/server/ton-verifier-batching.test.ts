import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DepositVerificationService } from '../../../server/tonVerifier';
import { StorageService, PendingDepositIntent } from '../../../server/storage';

describe('TON Deposit Verifier Concurrency & Error Isolation', () => {
  let storage: StorageService;
  let verifier: DepositVerificationService;

  beforeEach(() => {
    storage = new StorageService();
    verifier = new DepositVerificationService(storage);
  });

  it('isolates single-intent errors so one failing RPC does not abort processing of other intents', async () => {
    const mockIntents: PendingDepositIntent[] = [
      {
        id: 'intent_error',
        telegram_id: 1001,
        wallet_address: 'EQD___error_wallet___',
        deposit_address: 'EQD___vault_address___',
        amount_nano: '100000000000',
        network: 'testnet',
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'intent_success',
        telegram_id: 1002,
        wallet_address: 'EQD___valid_wallet___',
        deposit_address: 'EQD___vault_address___',
        amount_nano: '50000000000',
        network: 'testnet',
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    vi.spyOn(storage, 'getPendingDepositIntents').mockResolvedValue(mockIntents);
    
    // Simulate intent_error throwing an exception, and intent_success succeeding
    const findTransferSpy = vi.spyOn(verifier as any, 'findMatchingTransfer').mockImplementation(async (intent: any) => {
      if (intent.id === 'intent_error') {
        throw new Error('Toncenter RPC timeout');
      }
      return 'tx_hash_1002';
    });

    const confirmSpy = vi.spyOn(storage, 'confirmDeposit').mockResolvedValue({ success: true, user: {} as any });
    vi.spyOn(storage, 'getAccountSnapshot').mockResolvedValue({} as any);

    // Mock client and vaultAddress so verifier.poll() executes
    (verifier as any).client = {} as any;
    (verifier as any).vaultAddress = {} as any;

    await verifier.poll({ maxBatch: 10, concurrency: 2 });

    // Verify findMatchingTransfer was called for BOTH intents despite the first one throwing
    expect(findTransferSpy).toHaveBeenCalledTimes(2);
    // Verify confirmDeposit was called for the successful intent
    expect(confirmSpy).toHaveBeenCalledWith('intent_success', 'tx_hash_1002');
  });

  describe('TonCenter Endpoint Normalization', () => {
    it('normalizes various endpoint formats to append /jsonRPC without duplicate slashes', async () => {
      const { normalizeToncenterEndpoint } = await import('../../../server/tonVerifier');

      expect(normalizeToncenterEndpoint('https://toncenter.com/api/v2')).toBe('https://toncenter.com/api/v2/jsonRPC');
      expect(normalizeToncenterEndpoint('https://toncenter.com/api/v2/')).toBe('https://toncenter.com/api/v2/jsonRPC');
      expect(normalizeToncenterEndpoint('https://toncenter.com/api/v2/jsonRPC')).toBe('https://toncenter.com/api/v2/jsonRPC');
      expect(normalizeToncenterEndpoint('https://toncenter.com/api/v2/jsonRPC/')).toBe('https://toncenter.com/api/v2/jsonRPC');
      expect(normalizeToncenterEndpoint('https://testnet.toncenter.com/api/v2')).toBe('https://testnet.toncenter.com/api/v2/jsonRPC');
    });
  });

  describe('Vault-Inbound Indexing', () => {
    it('matches incoming transfer on vault address directly and skips per-wallet fallback', async () => {
      const vaultAddrStr = 'EQD48x90_gibous_vault_address_123456789012345678';
      const mockIntent: PendingDepositIntent = {
        id: 'intent_vault_fast',
        telegram_id: 2001,
        wallet_address: 'EQD___sender_wallet___',
        deposit_address: vaultAddrStr,
        amount_nano: '5000000000',
        network: 'testnet',
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(storage, 'getPendingDepositIntents').mockResolvedValue([mockIntent]);
      const confirmSpy = vi.spyOn(storage, 'confirmDeposit').mockResolvedValue({ success: true, user: {} as any });
      vi.spyOn(storage, 'getAccountSnapshot').mockResolvedValue({} as any);

      const findMatchingVaultSpy = vi.spyOn(verifier as any, 'findMatchingVaultTransfer').mockReturnValue('tx_hash_vault_direct');
      const findTransferSpy = vi.spyOn(verifier as any, 'findMatchingTransfer');

      (verifier as any).client = {
        getTransactions: vi.fn().mockResolvedValue([{ id: 'tx_1' }]),
      };
      (verifier as any).vaultAddress = { toString: () => vaultAddrStr };

      await verifier.poll();

      expect(findMatchingVaultSpy).toHaveBeenCalledWith(mockIntent, [{ id: 'tx_1' }]);
      expect(confirmSpy).toHaveBeenCalledWith('intent_vault_fast', 'tx_hash_vault_direct');
      // findMatchingTransfer (fallback) should NOT be called since vault indexer matched
      expect(findTransferSpy).not.toHaveBeenCalled();
    });
  });
});
