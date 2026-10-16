import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabasePool, generateDepositMemo, generateWithdrawalMemo } from '../../../server/db/index';
import { StorageService } from '../../../server/storage';

describe('Server-Generated Deposit and Withdrawal Memos', () => {
  let storage: StorageService;
  let db: DatabasePool;

  beforeEach(() => {
    storage = new StorageService();
    db = DatabasePool.getInstance();
  });

  describe('Memo format validation', () => {
    const MEMO_REGEX = /^(dep|wit)_([a-f0-9]{32})$/;

    it('generates opaque deposit memos with 128 bits of randomness', () => {
      const memo1 = generateDepositMemo();
      const memo2 = generateDepositMemo();

      expect(memo1).toMatch(/^dep_[a-f0-9]{32}$/);
      expect(memo2).toMatch(/^dep_[a-f0-9]{32}$/);
      expect(memo1).not.toBe(memo2);

      expect(MEMO_REGEX.test(memo1)).toBe(true);
    });

    it('generates opaque withdrawal memos with 128 bits of randomness', () => {
      const memo1 = generateWithdrawalMemo();
      const memo2 = generateWithdrawalMemo();

      expect(memo1).toMatch(/^wit_[a-f0-9]{32}$/);
      expect(memo2).toMatch(/^wit_[a-f0-9]{32}$/);
      expect(memo1).not.toBe(memo2);

      expect(MEMO_REGEX.test(memo1)).toBe(true);
    });

    it('uses only an opaque token after the transaction type prefix', () => {
      const memo = generateDepositMemo();

      expect(MEMO_REGEX.test(memo)).toBe(true);
    });
  });

  describe('Uniqueness & Entropy', () => {
    it('generates 200 unique memos without collisions', () => {
      const memos = new Set<string>();
      for (let i = 0; i < 200; i++) {
        const memo = generateDepositMemo();
        expect(memos.has(memo)).toBe(false);
        memos.add(memo);
      }
      expect(memos.size).toBe(200);
    });
  });

  describe('Pre-flight Deposit Intent Lifecycle', () => {
    it('creates deposit intent with an opaque memo associated by the stored user relation', async () => {
      const telegramId = 6304557924; // Big Telegram ID
      const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'Sten' });

      // In database/in-memory, user.id is an integer (e.g. 1, 2, etc.)
      expect(user.id).toBeDefined();
      expect(typeof user.id).toBe('number');
      expect(user.id).not.toBe(telegramId);

      const intent = await storage.createDepositIntent({
        telegramId,
        amountNano: '10000000000',
        walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        network: 'testnet',
      });

      expect(intent.id).toBeDefined();
      expect(intent.memo).toBeDefined();
      expect(intent.memo).toMatch(/^dep_[a-f0-9]{32}$/);
      expect(intent.status).toBe('pending');
      expect(intent.expires_at).toBeDefined();
      expect(new Date(intent.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('submits signed BOC for existing intent and enforces ownership', async () => {
      const telegramIdA = 7001;
      const telegramIdB = 7002;
      await storage.getOrCreateUser({ id: telegramIdA, first_name: 'Alice' });
      await storage.getOrCreateUser({ id: telegramIdB, first_name: 'Bob' });

      const intentA = await storage.createDepositIntent({
        telegramId: telegramIdA,
        amountNano: '5000000000',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        network: 'testnet',
      });

      // User B cannot submit BOC for User A's intent
      const maliciousSubmit = await storage.recordPendingDeposit({
        intentId: intentA.id,
        telegramId: telegramIdB,
        walletAddress: 'UQ_bob_wallet_1234567890',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        amountNano: '5000000000',
        boc: 'boc-bob-stolen',
        network: 'testnet',
      });

      expect(maliciousSubmit.success).toBe(false);
      expect(maliciousSubmit.error).toBe('DEPOSIT_INTENT_OWNERSHIP_MISMATCH');

      // User A submitting wrong amount fails
      const amountMismatchSubmit = await storage.recordPendingDeposit({
        intentId: intentA.id,
        telegramId: telegramIdA,
        walletAddress: 'UQ_alice_wallet_1234567890',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        amountNano: '9999999999', // Wrong amount
        boc: 'boc-alice-signed',
        network: 'testnet',
      });

      expect(amountMismatchSubmit.success).toBe(false);
      expect(amountMismatchSubmit.error).toBe('DEPOSIT_AMOUNT_MISMATCH');

      // Legitimate submit by User A succeeds
      const legitSubmit = await storage.recordPendingDeposit({
        intentId: intentA.id,
        telegramId: telegramIdA,
        walletAddress: 'UQ_alice_wallet_1234567890',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        amountNano: '5000000000',
        boc: 'boc-alice-signed',
        network: 'testnet',
      });

      expect(legitSubmit.success).toBe(true);
      expect(legitSubmit.transaction?.id).toBe(intentA.id);
      expect(legitSubmit.transaction?.memo).toBe(intentA.memo);
    });

    it('rejects expired deposit intents during submission and confirmation', async () => {
      const telegramId = 7003;
      await storage.getOrCreateUser({ id: telegramId, first_name: 'SlowPlayer' });

      const intent = await storage.createDepositIntent({
        telegramId,
        amountNano: '5000000000',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        network: 'testnet',
      });

      // Manually expire the intent
      db.updateDepositIntent(intent.id, {
        expires_at: new Date(Date.now() - 60_000), // Expired 1 min ago
      });

      // Submitting BOC for expired intent must fail
      const submitExpired = await storage.recordPendingDeposit({
        intentId: intent.id,
        telegramId,
        walletAddress: 'UQ_slow_wallet_1234567890',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        amountNano: '5000000000',
        boc: 'boc-expired',
        network: 'testnet',
      });

      expect(submitExpired.success).toBe(false);
      expect(submitExpired.error).toBe('DEPOSIT_INTENT_EXPIRED');

      // Attempting to confirm an expired intent must fail
      const confirmExpired = await storage.confirmDeposit(intent.id, 'tx_hash_expired');
      expect(confirmExpired.success).toBe(false);
      expect(confirmExpired.error).toBe('Deposit intent has expired');
    });

    it('ensures atomic idempotent confirmation and prevents replay', async () => {
      const telegramId = 7004;
      const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'IdempotentPlayer' });
      const initialBalance = user.balance_gram;

      const intent = await storage.createDepositIntent({
        telegramId,
        amountNano: '1000000000', // 1 GRAM
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        network: 'testnet',
      });

      await storage.recordPendingDeposit({
        intentId: intent.id,
        telegramId,
        walletAddress: 'UQ_player_wallet_1234567890',
        depositAddress: 'EQD48x9_gibous_vault_address_12345',
        amountNano: '1000000000',
        boc: 'boc-idempotent',
        network: 'testnet',
      });

      // First confirmation succeeds
      const first = await storage.confirmDeposit(intent.id, 'tx_hash_unique_1');
      expect(first.success).toBe(true);

      const updatedUser = db.getUserByTelegramId(telegramId);
      expect(updatedUser?.balance_gram).toBe(initialBalance + 1);

      // Second confirmation returns success without double-crediting
      const second = await storage.confirmDeposit(intent.id, 'tx_hash_unique_1');
      expect(second.success).toBe(true);
      expect(db.getUserByTelegramId(telegramId)?.balance_gram).toBe(initialBalance + 1);
    });
  });

  describe('Withdrawal Memo Generation and Storage', () => {
    it('generates a unique opaque memo for a confirmed server quote', async () => {
      vi.stubEnv('PAYOUT_NETWORK', 'mainnet');
      vi.stubEnv('PAYOUT_MIN_WITHDRAWAL_NANO', '100000000');
      vi.stubEnv('PAYOUT_MAX_WITHDRAWAL_NANO', '5000000000');
      vi.stubEnv('PAYOUT_USER_DAILY_LIMIT_NANO', '6000000000');
      const telegramId = 880099;
      const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'WithdrawerMemo' });

      // Give balance
      const inMemUser = db.getUserByTelegramId(telegramId)!;
      inMemUser.balance_nano = '10000000000';
      inMemUser.balance_gram = 10;
      db.saveUser(inMemUser);

      const quote = await storage.createWithdrawalQuote({
        telegramId,
        walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
        grossAmountNano: '2000000000', // 2 GRAM gross
        feeNano: '1000000',
        network: 'mainnet',
      });
      expect(quote.success).toBe(true);
      if (!quote.success) return;

      const result = await storage.confirmWithdrawalQuote({
        telegramId,
        quoteId: quote.quote.quoteId,
        operationKey: 'memo-test-confirmation',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.withdrawal).toBeDefined();
      expect(result.withdrawal.memo).toBeDefined();

      expect(result.withdrawal.memo).toMatch(/^wit_[a-f0-9]{32}$/);

      // Section 19 requirement: client-facing transaction object must NOT expose withdrawal memo
      expect(result.transaction.memo).toBeUndefined();
    });
  });

});
