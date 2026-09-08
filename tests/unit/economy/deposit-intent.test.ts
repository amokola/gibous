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
});
