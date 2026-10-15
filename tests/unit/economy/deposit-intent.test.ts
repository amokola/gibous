import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabasePool } from '../../../server/db/index';
import { StorageService } from '../../../server/storage';

describe('on-chain deposit intent boundary', () => {
  let storage: StorageService;

  beforeEach(() => {
    storage = new StorageService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('records a signed deposit as pending without crediting the ledger', async () => {
    const telegramId = 991001;
    const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'Depositor' });
    const balanceBefore = user.balance_gram;
    const intent = await storage.createDepositIntent({
      telegramId,
      amountNano: '500000000',
      walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
      depositAddress: 'EQD48x9_gibous_vault_address_12345',
      network: 'testnet',
    });

    const result = await storage.recordPendingDeposit({
      intentId: intent.id,
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

  it.each(['', 'abc', '0', '-1', '1.5'])('rejects invalid deposit nano amount %j without creating an intent', async (amountNano) => {
    const telegramId = 991025;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Invalid Depositor' });

    await expect(storage.createDepositIntent({
      telegramId,
      amountNano,
      walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
      depositAddress: 'EQD48x9_gibous_vault_address_12345',
      network: 'testnet',
    })).rejects.toThrow();

    expect(DatabasePool.getInstance().getDepositIntentsForUser(telegramId)).toHaveLength(0);
    expect(DatabasePool.getInstance().getTransactionsForUser(DatabasePool.getInstance().getUserByTelegramId(telegramId)!.id)).toHaveLength(0);
  });

  it('deduplicates the same signed payload', async () => {
    const telegramId = 991002;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Duplicate Depositor' });
    const intent = await storage.createDepositIntent({
      telegramId,
      amountNano: '1000000000',
      walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
      depositAddress: 'EQD48x9_gibous_vault_address_12345',
      network: 'testnet',
    });
    const input = {
      intentId: intent.id,
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
    const depositIntent = await storage.createDepositIntent({
      telegramId,
      amountNano: '500000000',
      walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
      depositAddress: 'EQD48x9_gibous_vault_address_12345',
      network: 'testnet',
    });
    const intent = await storage.recordPendingDeposit({
      intentId: depositIntent.id,
      telegramId,
      walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
      depositAddress: 'EQD48x9_gibous_vault_address_12345',
      amountNano: '500000000',
      boc: 'signed-boc-confirmed',
      network: 'testnet',
    });

    expect(intent.success).toBe(true);
    const [first, second] = await Promise.all([
      storage.confirmDeposit(intent.transaction!.id, 'tx-hash-1'),
      storage.confirmDeposit(intent.transaction!.id, 'tx-hash-1'),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    expect(DatabasePool.getInstance().getUserByTelegramId(telegramId)?.balance_gram).toBe(balanceBefore + 0.5);
    expect(DatabasePool.getInstance().getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'deposit')).toHaveLength(1);
  });

  it('rejects a signed submission whose sender, destination, or network differs from its intent', async () => {
    const telegramId = 991020;
    const sender = 'EQD48x9_ton_player_wallet_address_12345';
    const destination = 'EQD48x9_gibous_vault_address_12345';
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Bound Depositor' });
    vi.stubEnv('TON_DEPOSIT_ADDRESS', destination);
    vi.stubEnv('TON_NETWORK', 'testnet');

    const cases = [
      { label: 'sender', walletAddress: 'EQD48x9_different_player_wallet_12345', depositAddress: destination, network: 'testnet' as const },
      { label: 'destination', walletAddress: sender, depositAddress: 'EQD48x9_different_vault_address_12345', network: 'testnet' as const },
      { label: 'network', walletAddress: sender, depositAddress: destination, network: 'mainnet' as const },
    ];

    for (const [index, testCase] of cases.entries()) {
      const intent = await storage.createDepositIntent({
        telegramId,
        amountNano: '1000000000',
        walletAddress: sender,
        depositAddress: destination,
        network: 'testnet',
      });
      const before = DatabasePool.getInstance().getUserByTelegramId(telegramId)!;
      const beforeBalance = before.balance_nano;
      const result = await storage.recordPendingDeposit({
        intentId: intent.id,
        telegramId,
        walletAddress: testCase.walletAddress,
        depositAddress: testCase.depositAddress,
        amountNano: '1000000000',
        boc: `wrong-${testCase.label}-${index}`,
        network: testCase.network,
      });

      expect(result.success, `${testCase.label} mismatch should be rejected`).toBe(false);
      const stored = DatabasePool.getInstance().getDepositIntentById(intent.id);
      expect(stored).toMatchObject({ status: 'pending', wallet_address: sender, deposit_address: destination, network: 'testnet' });
      expect(stored?.boc ?? null).toBeNull();
      expect(DatabasePool.getInstance().getUserByTelegramId(telegramId)?.balance_nano).toBe(beforeBalance);
      expect(DatabasePool.getInstance().getTransactionsForUser(before.id)).toHaveLength(0);
    }
  });

  it('allows one intent to claim a BOC when two different intents race to submit it', async () => {
    const telegramId = 991021;
    const sender = 'EQD48x9_ton_player_wallet_address_12345';
    const destination = 'EQD48x9_gibous_vault_address_12345';
    const replayUser = await storage.getOrCreateUser({ id: telegramId, first_name: 'Replay Depositor' });
    const initialBalance = replayUser.balance_nano;
    const intents = await Promise.all([1, 2].map(() => storage.createDepositIntent({
      telegramId,
      amountNano: '1000000000',
      walletAddress: sender,
      depositAddress: destination,
      network: 'testnet',
    })));
    const submissions = await Promise.all(intents.map((intent) => storage.recordPendingDeposit({
      intentId: intent.id,
      telegramId,
      walletAddress: sender,
      depositAddress: destination,
      amountNano: '1000000000',
      boc: 'same-boc-raced-across-intents',
      network: 'testnet',
    })));

    expect(submissions.filter((result) => result.success)).toHaveLength(1);
    expect(submissions.filter((result) => !result.success)).toHaveLength(1);
    expect(intents.filter((intent) => DatabasePool.getInstance().getDepositIntentById(intent.id)?.boc === 'same-boc-raced-across-intents')).toHaveLength(1);
    expect(DatabasePool.getInstance().getUserByTelegramId(telegramId)?.balance_nano).toBe(initialBalance);
    expect(DatabasePool.getInstance().getTransactionsForUser(DatabasePool.getInstance().getUserByTelegramId(telegramId)!.id)).toHaveLength(0);
  });

  it('does not let a retry replace the BOC already bound to its intent', async () => {
    const telegramId = 991024;
    const sender = 'EQD48x9_ton_player_wallet_address_12345';
    const destination = 'EQD48x9_gibous_vault_address_12345';
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Stable BOC Depositor' });
    const intent = await storage.createDepositIntent({
      telegramId, amountNano: '1000000000', walletAddress: sender,
      depositAddress: destination, network: 'testnet',
    });
    const base = {
      intentId: intent.id, telegramId, walletAddress: sender, depositAddress: destination,
      amountNano: '1000000000', network: 'testnet' as const,
    };
    const first = await storage.recordPendingDeposit({ ...base, boc: 'original-signed-boc' });
    const retryWithDifferentBoc = await storage.recordPendingDeposit({ ...base, boc: 'replacement-signed-boc' });

    expect(first.success).toBe(true);
    expect(retryWithDifferentBoc.success).toBe(false);
    expect(DatabasePool.getInstance().getDepositIntentById(intent.id)?.boc).toBe('original-signed-boc');
  });

  it('rejects reuse of a confirmed transaction hash for another intent without crediting either twice', async () => {
    const telegramIdA = 991022;
    const telegramIdB = 991023;
    const firstUser = await storage.getOrCreateUser({ id: telegramIdA, first_name: 'First Receiver' });
    const secondUser = await storage.getOrCreateUser({ id: telegramIdB, first_name: 'Second Receiver' });
    const firstBalance = firstUser.balance_nano;
    const secondBalance = secondUser.balance_nano;
    const createPending = async (telegramId: number, boc: string) => {
      const intent = await storage.createDepositIntent({
        telegramId,
        amountNano: '2000000000',
        walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        network: 'testnet',
      });
      const submitted = await storage.recordPendingDeposit({
        intentId: intent.id,
        telegramId,
        walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        amountNano: '2000000000', boc, network: 'testnet',
      });
      expect(submitted.success).toBe(true);
      return intent;
    };
    const firstIntent = await createPending(telegramIdA, 'tx-hash-replay-first-boc');
    const secondIntent = await createPending(telegramIdB, 'tx-hash-replay-second-boc');

    expect((await storage.confirmDeposit(firstIntent.id, 'same-onchain-tx')).success).toBe(true);
    const replay = await storage.confirmDeposit(secondIntent.id, 'same-onchain-tx');

    expect(replay.success).toBe(false);
    expect(DatabasePool.getInstance().getUserByTelegramId(telegramIdA)?.balance_nano).toBe((BigInt(firstBalance) + 2000000000n).toString());
    expect(DatabasePool.getInstance().getUserByTelegramId(telegramIdB)?.balance_nano).toBe(secondBalance);
    expect(DatabasePool.getInstance().getDepositIntentById(secondIntent.id)?.status).toBe('pending');
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
      const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'CancelUser' });

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

      const cancelledSubmit = await storage.recordPendingDeposit({
        intentId: intent.id,
        telegramId,
        walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        amountNano: '1000000000',
        boc: 'cancelled-intent-boc',
        network: 'testnet',
      });
      const cancelledConfirm = await storage.confirmDeposit(intent.id, 'cancelled-intent-hash');
      expect(cancelledSubmit.success).toBe(false);
      expect(cancelledConfirm.success).toBe(false);
      expect(DatabasePool.getInstance().getDepositIntentById(intent.id)?.boc ?? null).toBeNull();
      expect(DatabasePool.getInstance().getUserByTelegramId(telegramId)?.balance_nano).toBe(user.balance_nano);
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

  it('moves expired pending intents out of the verifier queue', async () => {
    const telegramId = 991004;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Expired Depositor' });
    const intent = await storage.createDepositIntent({
      telegramId,
      amountNano: '500000000',
      walletAddress: 'EQD48x9_ton_player_wallet_address_12345',
      depositAddress: 'EQD48x9_gibous_vault_address_12345',
      network: 'testnet',
    });
    const expiredAt = new Date(Date.now() - 1000);
    DatabasePool.getInstance().updateDepositIntent(intent.id, { expires_at: expiredAt });

    await expect(storage.expireDepositIntentIfDue(intent.id, new Date())).resolves.toBe(true);
    expect(DatabasePool.getInstance().getDepositIntentById(intent.id)?.status).toBe('expired');
    await expect(storage.expireDepositIntentIfDue(intent.id, new Date())).resolves.toBe(false);
  });
});
