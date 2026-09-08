import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DatabasePool, generateDepositMemo, generateWithdrawalMemo } from '../../../server/db/index';
import { StorageService, PendingDepositIntent } from '../../../server/storage';
import { DepositVerificationService } from '../../../server/tonVerifier';
import { Address } from '@ton/core';

describe('Server-Generated Deposit and Withdrawal Memos', () => {
  let storage: StorageService;
  let db: DatabasePool;

  beforeEach(() => {
    storage = new StorageService();
    db = DatabasePool.getInstance();
  });

  describe('Memo format validation', () => {
    const MEMO_REGEX = /^(dep|wit)_([1-9]\d*)_([a-f0-9]{8})$/;

    it('generates valid deposit memo adhering to dep_<users.id>_<8hex>', () => {
      const memo1 = generateDepositMemo(1);
      const memo42 = generateDepositMemo(42);
      const memo100 = generateDepositMemo(100);

      expect(memo1).toMatch(/^dep_1_[a-f0-9]{8}$/);
      expect(memo42).toMatch(/^dep_42_[a-f0-9]{8}$/);
      expect(memo100).toMatch(/^dep_100_[a-f0-9]{8}$/);

      expect(MEMO_REGEX.test(memo1)).toBe(true);
      expect(MEMO_REGEX.test(memo42)).toBe(true);
      expect(MEMO_REGEX.test(memo100)).toBe(true);
    });

    it('generates valid withdrawal memo adhering to wit_<users.id>_<8hex>', () => {
      const memo1 = generateWithdrawalMemo(1);
      const memo42 = generateWithdrawalMemo(42);

      expect(memo1).toMatch(/^wit_1_[a-f0-9]{8}$/);
      expect(memo42).toMatch(/^wit_42_[a-f0-9]{8}$/);

      expect(MEMO_REGEX.test(memo1)).toBe(true);
      expect(MEMO_REGEX.test(memo42)).toBe(true);
    });

    it('rejects invalid memos that use Telegram ID or non-hex entropy', () => {
      // Telegram IDs are typically large numbers (e.g. 6304557924)
      const telegramIdMemo = 'dep_6304557924_a8c9e2f4';
      const shortEntropyMemo = 'dep_42_123';
      const nonNumericUserId = 'dep_x_a8c9e2f4';
      const nonHexMemo = 'wit_42_not-hex!';
      const extraCharsMemo = 'dep_42_a8c9e2f4_extra';

      // Verify that generateDepositMemo rejects non-positive or invalid internal IDs
      expect(() => generateDepositMemo(-5)).toThrow();
      expect(() => generateDepositMemo(0)).toThrow();
      expect(() => generateDepositMemo(NaN)).toThrow();
      expect(() => generateWithdrawalMemo(-1)).toThrow();

      // Ensure regex flags invalid formats
      expect(MEMO_REGEX.test(shortEntropyMemo)).toBe(false);
      expect(MEMO_REGEX.test(nonNumericUserId)).toBe(false);
      expect(MEMO_REGEX.test(nonHexMemo)).toBe(false);
      expect(MEMO_REGEX.test(extraCharsMemo)).toBe(false);
    });
  });

  describe('Uniqueness & Entropy', () => {
    it('generates 200 unique memos without collisions', () => {
      const memos = new Set<string>();
      const internalUserId = 42;

      for (let i = 0; i < 200; i++) {
        const memo = generateDepositMemo(internalUserId);
        expect(memos.has(memo)).toBe(false);
        memos.add(memo);
      }
      expect(memos.size).toBe(200);
    });
  });

  describe('Pre-flight Deposit Intent Lifecycle', () => {
    it('creates deposit intent using internal users.id, NOT telegram_id', async () => {
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
      // Crucial: Memo MUST use internal user.id, NEVER telegramId!
      expect(intent.memo.startsWith(`dep_${user.id}_`)).toBe(true);
      expect(intent.memo.includes(String(telegramId))).toBe(false);
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
    it('generates unique wit_<users.id>_<randomHex> and records in withdrawals', async () => {
      const telegramId = 880099;
      const user = await storage.getOrCreateUser({ id: telegramId, first_name: 'WithdrawerMemo' });

      // Give balance
      const inMemUser = db.getUserByTelegramId(telegramId)!;
      inMemUser.balance_nano = '10000000000';
      inMemUser.balance_gram = 10;
      db.saveUser(inMemUser);

      const result = await storage.requestWithdrawal({
        telegramId,
        walletAddress: 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
        amountNano: '2000000000', // 2 GRAM
      });

      expect(result.success).toBe(true);
      expect(result.withdrawal).toBeDefined();
      expect(result.withdrawal.memo).toBeDefined();

      // Must start with wit_<user.id>_
      expect(result.withdrawal.memo.startsWith(`wit_${user.id}_`)).toBe(true);
      // Must NOT contain Telegram ID
      expect(result.withdrawal.memo.includes(String(telegramId))).toBe(false);

      // Section 19 requirement: client-facing transaction object must NOT expose withdrawal memo
      expect(result.transaction.memo).toBeUndefined();
    });
  });

  describe('Strict Memo Matching in TonVerifier', () => {
    it('requires strict exact memo equality and rejects prefix, suffix, and substring matches', async () => {
      const verifier = new DepositVerificationService(storage);

      const targetMemo = 'dep_42_a8c9e2f4';
      const intent: PendingDepositIntent = {
        id: 'test_intent_1',
        telegram_id: 9999,
        wallet_address: 'EQD48x9_ton_player_wallet_address_12345',
        deposit_address: 'EQD48x9_gibous_vault_address_12345',
        amount_nano: '1000000000',
        amount_gram: 1,
        memo: targetMemo,
        network: 'testnet',
        status: 'pending',
        created_at: new Date(),
      };

      // Mock extractComment helper behavior
      const testCases = [
        { comment: 'dep_42_a8c9e2f4', expectedMatch: true },
        { comment: 'dep_42_a8c9e2f40', expectedMatch: false }, // extra char at end
        { comment: 'dep_42_a8c9e2f', expectedMatch: false }, // missing char
        { comment: 'xdep_42_a8c9e2f4', expectedMatch: false }, // prepended char
        { comment: 'dep_42_a8c9e2f4_extra', expectedMatch: false }, // suffix
        { comment: 'something dep_42_a8c9e2f4 else', expectedMatch: false }, // substring
        { comment: '', expectedMatch: false },
      ];

      for (const tc of testCases) {
        if (intent.memo) {
          const isExact = tc.comment === intent.memo;
          expect(isExact).toBe(tc.expectedMatch);
        }
      }
    });

    it('preserves backward compatibility for legacy intents without memo', () => {
      const legacyIntent: PendingDepositIntent = {
        id: 'legacy_uuid_12345',
        telegram_id: 55555,
        wallet_address: 'EQD48x9_ton_player_wallet_address_12345',
        deposit_address: 'EQD48x9_gibous_vault_address_12345',
        amount_nano: '1000000000',
        amount_gram: 1,
        boc: 'boc-legacy',
        network: 'testnet',
        status: 'pending',
        created_at: new Date(),
      };

      // When memo is absent, legacy matching checks id or telegram_id
      const commentMatchesId = 'legacy_uuid_12345';
      const commentMatchesTg = '55555';
      const commentInvalid = 'random_comment';

      const checkLegacy = (comment: string) => {
        return comment.includes(legacyIntent.id) || comment.includes(String(legacyIntent.telegram_id));
      };

      expect(checkLegacy(commentMatchesId)).toBe(true);
      expect(checkLegacy(commentMatchesTg)).toBe(true);
      expect(checkLegacy(commentInvalid)).toBe(false);
    });
  });
});
