import { beforeEach, describe, expect, it } from 'vitest';
import { DatabasePool } from '../../../server/db/index';
import { StorageService } from '../../../server/storage';

describe('on-chain deposit intent boundary', () => {
  let storage: StorageService;

  beforeEach(() => {
    storage = new StorageService();
  });

  it('records a signed deposit as pending without crediting the ledger', async () => {
    const telegramId = 991001;
    const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'Depositor' });
    const balanceBefore = user.balance_gram;

    const result = await storage.recordPendingDeposit({
      telegramId,
      walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
      depositAddress: 'EQD48x9_gibous_vault_address_12345',
      amountNano: '500000000',
      boc: 'signed-boc-1',
      network: 'testnet',
    });

    expect(result.success).toBe(true);
    expect(result.transaction?.status).toBe('pending');
    expect(result.transaction?.amountGram).toBe(0.5);
    expect(DatabasePool.getInstance().getUserByTelegramId(telegramId)?.balance_gram).toBe(balanceBefore);
  });

  it('deduplicates the same signed payload', async () => {
    const telegramId = 991002;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Duplicate Depositor' });
    const input = {
      telegramId,
      walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
      depositAddress: 'EQD48x9_gibous_vault_address_12345',
      amountNano: '1000000000',
      boc: 'signed-boc-duplicate',
      network: 'testnet' as const,
    };

    const first = await storage.recordPendingDeposit(input);
    const second = await storage.recordPendingDeposit(input);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(second.transaction?.id).toBe(first.transaction?.id);
  });

  it('credits only after confirmation and never credits the same transfer twice', async () => {
    const telegramId = 991003;
    const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'Confirmed Depositor' });
    const balanceBefore = user.balance_gram;
    const intent = await storage.recordPendingDeposit({
      telegramId,
      walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
      depositAddress: 'EQD48x9_gibous_vault_address_12345',
      amountNano: '500000000',
      boc: 'signed-boc-confirmed',
      network: 'testnet',
    });

    expect(intent.success).toBe(true);
    const first = await storage.confirmDeposit(intent.transaction!.id, 'tx-hash-1');
    const second = await storage.confirmDeposit(intent.transaction!.id, 'tx-hash-1');

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(DatabasePool.getInstance().getUserByTelegramId(telegramId)?.balance_gram).toBe(balanceBefore + 0.5);
  });

  describe('Ledger Isolation & Cancellation Lifecycle', () => {
    it('does not include draft intents without BOC in transactions or activeDeposit', async () => {
      const telegramId = 991004;
      await storage.getOrCreateUser({ id: telegramId, first_name: 'DraftUser' });

      // Create pre-flight intent without BOC
      const draft = await storage.createDepositIntent({
        telegramId,
        amountNano: '2000000000',
        walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        network: 'testnet',
      });

      expect(draft.id).toBeDefined();

      const snapshot = await storage.getAccountSnapshot(telegramId);
      // Transactions ledger must remain empty
      expect(snapshot?.transactions).toHaveLength(0);
      // activeDeposit must be null because no signed BOC was submitted
      expect(snapshot?.activeDeposit).toBeNull();
    });

    it('cancels pending deposit intent when wallet rejects or closes', async () => {
      const telegramId = 991005;
      await storage.getOrCreateUser({ id: telegramId, first_name: 'CancelUser' });

      const intent = await storage.createDepositIntent({
        telegramId,
        amountNano: '1000000000',
        walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        network: 'testnet',
      });

      const cancelResult = await storage.cancelDepositIntent(intent.id, telegramId);
      expect(cancelResult.success).toBe(true);

      const dbIntent = DatabasePool.getInstance().getDepositIntentById(intent.id);
      expect(dbIntent?.status).toBe('cancelled');

      const snapshot = await storage.getAccountSnapshot(telegramId);
      expect(snapshot?.transactions).toHaveLength(0);
      expect(snapshot?.activeDeposit).toBeNull();
    });

    it('tracks activeDeposit with signed BOC and moves to confirmed transactions upon confirmation', async () => {
      const telegramId = 991006;
      await storage.getOrCreateUser({ id: telegramId, first_name: 'InFlightUser' });

      const intent = await storage.createDepositIntent({
        telegramId,
        amountNano: '3000000000',
        walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        network: 'testnet',
      });

      // Submit signed BOC
      await storage.recordPendingDeposit({
        intentId: intent.id,
        telegramId,
        walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        amountNano: '3000000000',
        boc: 'boc-in-flight-123',
        network: 'testnet',
      });

      // While in flight: activeDeposit is present, but transactions ledger is still empty!
      const inFlightSnapshot = await storage.getAccountSnapshot(telegramId);
      expect(inFlightSnapshot?.transactions).toHaveLength(0);
      expect(inFlightSnapshot?.activeDeposit).toBeDefined();
      expect(inFlightSnapshot?.activeDeposit?.id).toBe(intent.id);
      expect(inFlightSnapshot?.activeDeposit?.amountGram).toBe(3);

      // Confirm on-chain
      await storage.confirmDeposit(intent.id, 'tx_hash_confirmed_123');

      // After confirmation: activeDeposit is null, and transactions contains the confirmed deposit!
      const confirmedSnapshot = await storage.getAccountSnapshot(telegramId);
      expect(confirmedSnapshot?.activeDeposit).toBeNull();
      expect(confirmedSnapshot?.transactions).toHaveLength(1);
      expect(confirmedSnapshot?.transactions[0].type).toBe('deposit');
      expect(confirmedSnapshot?.transactions[0].amountGram).toBe(3);
      expect(confirmedSnapshot?.transactions[0].status).toBe('confirmed');
    });
  });
});
