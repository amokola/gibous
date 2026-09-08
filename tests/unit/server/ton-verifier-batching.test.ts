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
});
