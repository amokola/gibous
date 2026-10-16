import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Address, beginCell } from '@ton/core';
import { DepositVerificationService } from '../../../server/tonVerifier';
import { StorageService, PendingDepositIntent } from '../../../server/storage';

const vaultText = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
const sender = new Address(0, Buffer.alloc(32, 11));

describe('deposit verifier adversarial vault-transfer scenarios', () => {
  let verifier: DepositVerificationService;
  let vault: Address;
  let intent: PendingDepositIntent;
  let transaction: any;

  beforeEach(() => {
    vi.stubEnv('TON_NETWORK', 'mainnet');
    vault = Address.parse(vaultText);
    verifier = new DepositVerificationService(new StorageService());
    (verifier as any).vaultAddress = vault;
    const now = new Date();
    intent = {
      id: 'adversarial-deposit', telegram_id: 88101,
      wallet_address: sender.toString({ urlSafe: true, bounceable: true, testOnly: false }),
      deposit_address: vaultText, amount_nano: '1250000000', memo: 'dep_adversarial_001',
      network: 'mainnet', status: 'pending', created_at: now,
    };
    transaction = {
      now: Math.floor(now.getTime() / 1000),
      inMessage: {
        info: { type: 'internal', dest: vault, src: sender, value: { coins: 1_250_000_000n } },
        body: beginCell().storeUint(0, 32).storeStringTail(intent.memo!).endCell(),
      },
      hash: () => Buffer.alloc(32, 5),
    };
  });

  afterEach(() => vi.unstubAllEnvs());

  const adversarialCases: Array<[string, (tx: any, state: { intent: PendingDepositIntent; vault: Address }) => void, boolean]> = [
    ['omitted inbound message', (tx) => { tx.inMessage = undefined; }, false],
    ['external inbound message', (tx) => { tx.inMessage.info.type = 'external-in'; }, false],
    ['missing destination address', (tx) => { tx.inMessage.info.dest = undefined; }, false],
    ['missing source when sender is pinned', (tx) => { tx.inMessage.info.src = undefined; }, false],
    ['missing coin value', (tx) => { tx.inMessage.info.value = undefined; }, false],
    ['comment body shorter than the opcode', (tx) => { tx.inMessage.body = beginCell().storeUint(0, 16).endCell(); }, false],
    ['non-comment TON opcode', (tx) => { tx.inMessage.body = beginCell().storeUint(1, 32).storeStringTail('dep_adversarial_001').endCell(); }, false],
    ['malformed comment body', (tx) => { tx.inMessage.body = { beginParse: () => { throw new Error('bad cell'); } }; }, false],
    ['comment with leading whitespace', (tx, { intent }) => { tx.inMessage.body = beginCell().storeUint(0, 32).storeStringTail(` ${intent.memo}`).endCell(); }, false],
    ['comment with trailing whitespace', (tx, { intent }) => { tx.inMessage.body = beginCell().storeUint(0, 32).storeStringTail(`${intent.memo} `).endCell(); }, false],
    ['comment with a newline suffix', (tx, { intent }) => { tx.inMessage.body = beginCell().storeUint(0, 32).storeStringTail(`${intent.memo}\n`).endCell(); }, false],
    ['comment with a Unicode lookalike', (tx, { intent }) => { tx.inMessage.body = beginCell().storeUint(0, 32).storeStringTail(`${intent.memo}０`).endCell(); }, false],
    ['transaction just before the accepted time boundary', (tx, { intent }) => { tx.now = Math.floor((intent.created_at.getTime() - 120_000) / 1000) - 1; }, false],
    ['transaction just after the future time boundary', (tx) => { tx.now = Math.floor((Date.now() + 120_000) / 1000) + 1; }, false],
    ['already expired intent', (_tx, { intent }) => { intent.expires_at = new Date(Date.now() - 1); }, false],
    ['intent without a memo', (_tx, { intent }) => { intent.memo = undefined; }, false],
    ['intent deposit address points elsewhere', (_tx, { intent }) => { intent.deposit_address = sender.toString(); }, false],
    ['intent sender is malformed', (_tx, { intent }) => { intent.wallet_address = 'bad-address'; }, false],
    ['zero-value transfer', (tx) => { tx.inMessage.info.value.coins = 0n; }, false],
    ['valid exact inbound transfer', () => {}, true],
  ];

  it.each(adversarialCases)('handles %s safely', (label, mutate, shouldMatch) => {
    mutate(transaction, { intent, vault });
    const findMatch = (verifier as any).findMatchingVaultTransfer.bind(verifier);
    const expected = shouldMatch ? Buffer.alloc(32, 5).toString('hex') : null;
    expect(findMatch(intent, [transaction]), label).toBe(expected);
  });
});
