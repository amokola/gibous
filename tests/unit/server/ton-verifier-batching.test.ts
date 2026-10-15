import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Address, beginCell } from '@ton/core';
import { DepositVerificationService } from '../../../server/tonVerifier';
import { StorageService, PendingDepositIntent } from '../../../server/storage';

describe('TON Deposit Verifier Concurrency & Error Isolation', () => {
  let storage: StorageService;
  let verifier: DepositVerificationService;

  beforeEach(() => {
    storage = new StorageService();
    verifier = new DepositVerificationService(storage);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

    it('does not attribute a memo-less vault transfer to a legacy intent', () => {
      const vaultText = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
      const vault = Address.parse(vaultText);
      const now = new Date();
      vi.stubEnv('TON_NETWORK', 'mainnet');
      vi.stubEnv('REQUIRE_DEPOSIT_MEMO', '');
      (verifier as any).vaultAddress = vault;

      const intent: PendingDepositIntent = {
        id: 'legacy-intent-without-memo',
        telegram_id: 2002,
        wallet_address: '',
        deposit_address: vaultText,
        amount_nano: '1000000000',
        network: 'mainnet',
        status: 'pending',
        created_at: now,
      };
      const transaction = {
        now: Math.floor(now.getTime() / 1000),
        inMessage: {
          info: { type: 'internal', dest: vault, src: vault, value: { coins: 1_000_000_000n } },
          body: null,
        },
        hash: () => Buffer.alloc(32, 1),
      };
      const findMatch = (verifier as any).findMatchingVaultTransfer.bind(verifier);

      expect(findMatch(intent, [transaction])).toBeNull();
    });

    it('does not attribute a memo-less sender transfer to a legacy intent', async () => {
      const vaultText = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
      const vault = Address.parse(vaultText);
      const wallet = Address.parse(vaultText);
      const now = new Date();
      vi.stubEnv('TON_NETWORK', 'mainnet');
      vi.stubEnv('REQUIRE_DEPOSIT_MEMO', '');
      (verifier as any).vaultAddress = vault;
      (verifier as any).client = {
        getTransactions: async () => [{
          now: Math.floor(now.getTime() / 1000),
          outMessages: new Map([['transfer', {
            info: { type: 'internal', src: wallet, dest: vault, value: { coins: 1_000_000_000n } },
            body: null,
          }]]),
          hash: () => Buffer.alloc(32, 1),
        }],
      };

      const intent: PendingDepositIntent = {
        id: 'legacy-intent-without-memo',
        telegram_id: 2003,
        wallet_address: vaultText,
        deposit_address: vaultText,
        amount_nano: '1000000000',
        network: 'mainnet',
        status: 'pending',
        created_at: now,
      };
      const findMatch = (verifier as any).findMatchingTransfer.bind(verifier);

      await expect(findMatch(intent)).resolves.toBeNull();
    });

    it.each([
      ['exact memo, sender, destination, amount, and time', {}, true],
      ['memo with a suffix', { comment: 'dep_intent_123_suffix' }, false],
      ['memo with a prefix', { comment: 'xdep_intent_123' }, false],
      ['different sender', { source: 'other' }, false],
      ['different destination', { destination: 'other' }, false],
      ['different amount', { coins: 1_000_000_001n }, false],
      ['transaction before the allowed time window', { secondsOffset: -180 }, false],
      ['transaction after the allowed time window', { secondsOffset: 180 }, false],
    ] as const)('matches only an exact vault transfer (%s)', (label, overrides, shouldMatch) => {
      const vaultText = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
      const vault = Address.parse(vaultText);
      const otherAddress = new Address(0, Buffer.alloc(32, 1));
      const now = new Date();
      const memo = 'dep_intent_123';
      vi.stubEnv('TON_NETWORK', 'mainnet');
      (verifier as any).vaultAddress = vault;

      const intent: PendingDepositIntent = {
        id: 'intent-with-memo',
        telegram_id: 2004,
        wallet_address: vaultText,
        deposit_address: vaultText,
        amount_nano: '1000000000',
        memo,
        network: 'mainnet',
        status: 'pending',
        created_at: now,
      };
      const transaction = (options: Record<string, unknown> = {}) => ({
        now: Math.floor(now.getTime() / 1000) + Number(options.secondsOffset || 0),
        inMessage: {
          info: {
            type: 'internal',
            dest: options.destination ? otherAddress : vault,
            src: options.source ? otherAddress : vault,
            value: { coins: typeof options.coins === 'bigint' ? options.coins : 1_000_000_000n },
          },
          body: beginCell().storeUint(0, 32).storeStringTail(String(options.comment || memo)).endCell(),
        },
        hash: () => Buffer.alloc(32, 2),
      });
      const findMatch = (verifier as any).findMatchingVaultTransfer.bind(verifier);

      const match = findMatch(intent, [transaction(overrides as Record<string, unknown>)]);
      expect(match, label).toBe(shouldMatch ? Buffer.alloc(32, 2).toString('hex') : null);
    });

    it('rejects expired intents and malformed expected sender addresses in the vault path', () => {
      const vaultText = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
      const vault = Address.parse(vaultText);
      vi.stubEnv('TON_NETWORK', 'mainnet');
      (verifier as any).vaultAddress = vault;
      const intent: PendingDepositIntent = {
        id: 'expired-or-invalid-sender', telegram_id: 2005, wallet_address: vaultText,
        deposit_address: vaultText, amount_nano: '1000000000', memo: 'dep_expiring_intent',
        network: 'mainnet', status: 'pending', created_at: new Date(Date.now() - 10 * 60_000),
        expires_at: new Date(Date.now() - 1),
      };
      const transaction = {
        now: Math.floor(Date.now() / 1000),
        inMessage: {
          info: { type: 'internal', dest: vault, src: vault, value: { coins: 1_000_000_000n } },
          body: beginCell().storeUint(0, 32).storeStringTail(intent.memo!).endCell(),
        },
        hash: () => Buffer.alloc(32, 3),
      };
      const findMatch = (verifier as any).findMatchingVaultTransfer.bind(verifier);

      expect(findMatch(intent, [transaction])).toBeNull();
      intent.expires_at = undefined;
      intent.wallet_address = 'not-a-valid-ton-address';
      expect(findMatch(intent, [transaction])).toBeNull();
    });

    it('applies exact transfer, network, and expiry checks in the sender-lookup path', async () => {
      const vault = Address.parse('UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz');
      const source = new Address(0, Buffer.alloc(32, 7));
      const other = new Address(0, Buffer.alloc(32, 2));
      const now = new Date();
      const memo = 'dep_sender_lookup_exact';
      vi.stubEnv('TON_NETWORK', 'mainnet');
      (verifier as any).vaultAddress = vault;
      const intent: PendingDepositIntent = {
        id: 'sender-lookup-boundary', telegram_id: 2006,
        wallet_address: source.toString({ urlSafe: true, bounceable: true, testOnly: false }),
        deposit_address: vault.toString({ urlSafe: true, bounceable: true, testOnly: false }),
        amount_nano: '2500000000', memo, network: 'mainnet', status: 'pending',
        created_at: now, expires_at: new Date(now.getTime() + 60_000),
      };
      const transaction = (options: Record<string, unknown> = {}) => ({
        now: Math.floor(now.getTime() / 1000) + Number(options.secondsOffset || 0),
        outMessages: new Map([['transfer', {
          info: {
            type: 'internal',
            src: options.source === 'other' ? other : source,
            dest: options.destination === 'other' ? other : vault,
            value: { coins: typeof options.coins === 'bigint' ? options.coins : 2_500_000_000n },
          },
          body: beginCell().storeUint(0, 32).storeStringTail(String(options.comment || memo)).endCell(),
        }]]),
        hash: () => Buffer.alloc(32, 4),
      });
      const findMatch = (verifier as any).findMatchingTransfer.bind(verifier);
      const cases = [
        ['exact transfer', {}, true],
        ['wrong amount', { coins: 2_500_000_001n }, false],
        ['wrong source', { source: 'other' }, false],
        ['wrong destination', { destination: 'other' }, false],
        ['wrong memo', { comment: `${memo}_suffix` }, false],
        ['outside time window', { secondsOffset: -180 }, false],
      ] as const;

      for (const [label, overrides, expected] of cases) {
        (verifier as any).client = { getTransactions: vi.fn().mockResolvedValue([transaction(overrides as Record<string, unknown>)]) };
        const result = await findMatch(intent);
        expect(result, label).toBe(expected ? Buffer.alloc(32, 4).toString('hex') : null);
      }

      (verifier as any).client = { getTransactions: vi.fn().mockResolvedValue([transaction()]) };
      intent.network = 'testnet';
      expect(await findMatch(intent)).toBeNull();
      intent.network = 'mainnet';
      intent.expires_at = new Date(now.getTime() - 1);
      expect(await findMatch(intent)).toBeNull();
      intent.expires_at = undefined;
      intent.wallet_address = 'not-a-valid-ton-address';
      await expect(findMatch(intent)).resolves.toBeNull();
    });
  });
});
