import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Address, beginCell } from '@ton/core';
import { DepositVerificationService } from '../../../server/tonVerifier';
import { PendingDepositIntent, StorageService } from '../../../server/storage';

const vault = Address.parse('UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz');
const sender = new Address(0, Buffer.alloc(32, 21));
const other = new Address(0, Buffer.alloc(32, 22));
const memo = 'dep_expanded_scenario';
const amount = 1_750_000_000n;
const comment = () => beginCell().storeUint(0, 32).storeStringTail(memo).endCell();

function vaultTransaction() {
  return {
    now: 1_792_128_000,
    inMessage: { info: { type: 'internal', src: sender, dest: vault, value: { coins: amount } }, body: comment() },
    hash: () => Buffer.alloc(32, 9),
  };
}

function senderTransaction() {
  return {
    now: 1_792_128_000,
    outMessages: new Map([['message', { info: { type: 'internal', src: sender, dest: vault, value: { coins: amount } }, body: comment() }]]),
    hash: () => Buffer.alloc(32, 10),
  };
}

type State = { intent: PendingDepositIntent; verifier: DepositVerificationService; good: any };
type ListMutation = (list: any[], state: State) => void;

const vaultScenarios: Array<[string, ListMutation, boolean]> = [
  ['skip a missing timestamp and continue to a valid row', (rows, s) => { const bad = s.good(); delete bad.now; rows.unshift(bad); }, true],
  ['skip a NaN timestamp and continue to a valid row', (rows, s) => { const bad = s.good(); bad.now = Number.NaN; rows.unshift(bad); }, true],
  ['skip an infinite timestamp and continue to a valid row', (rows, s) => { const bad = s.good(); bad.now = Number.POSITIVE_INFINITY; rows.unshift(bad); }, true],
  ['skip null transaction entries and continue', (rows) => { rows.unshift(null); }, true],
  ['skip primitive transaction entries and continue', (rows) => { rows.unshift('corrupt-row'); }, true],
  ['reject an inbound message marked as bounced', (rows) => { rows[0].inMessage.info.bounced = true; }, false],
  ['reject a non-internal transaction message', (rows) => { rows[0].inMessage.info.type = 'external-out'; }, false],
  ['reject a sender on a different workchain', (rows) => { rows[0].inMessage.info.src = new Address(-1, Buffer.alloc(32, 21)); }, false],
  ['accept an equivalent sender address with another friendly format', (rows, s) => { rows[0].inMessage.info.src = Address.parse(s.intent.wallet_address); }, true],
  ['reject a vault on a different workchain', (rows) => { rows[0].inMessage.info.dest = new Address(-1, Buffer.alloc(32, 9)); }, false],
  ['return null for a malformed expected amount', (_rows, s) => { s.intent.amount_nano = '1.75e9'; }, false],
  ['skip a destination whose equals method throws', (rows) => { rows[0].inMessage.info.dest = { equals: () => { throw new Error('bad address'); } }; }, false],
  ['skip a source whose equals method throws', (rows) => { rows[0].inMessage.info.src = { equals: () => { throw new Error('bad address'); } }; }, false],
  ['skip a hash failure and continue to a later match', (rows, s) => { const bad = s.good(); bad.hash = () => { throw new Error('hash unavailable'); }; rows.unshift(bad); }, true],
  ['choose the first matching vault transaction returned by the indexer', (rows, s) => { const first = s.good(); first.hash = () => Buffer.alloc(32, 9); rows[0].hash = () => Buffer.alloc(32, 1); rows.unshift(first); }, true],
  ['accept a transfer on the earliest inclusive time boundary', (rows, s) => { s.intent.created_at = new Date(1_792_128_000_000 + 120_000); rows[0].now = 1_792_128_000; }, true],
  ['accept a transfer on the latest inclusive time boundary', (rows) => { vi.setSystemTime(new Date(1_792_128_000_000 - 120_000)); rows[0].now = 1_792_128_000; }, true],
  ['reject an empty comment cell', (rows) => { rows[0].inMessage.body = beginCell().endCell(); }, false],
  ['reject a case-changed memo', (rows) => { rows[0].inMessage.body = beginCell().storeUint(0, 32).storeStringTail(memo.toUpperCase()).endCell(); }, false],
  ['reject a transfer from the other configured network', (_rows, s) => { s.intent.network = 'testnet'; }, false],
  ['accept a memo-bound transfer when the optional sender is absent', (_rows, s) => { s.intent.wallet_address = ''; }, true],
  ['accept a non-bounceable friendly vault string resolving to the same address', (_rows, s) => { s.intent.deposit_address = vault.toString({ urlSafe: true, bounceable: false, testOnly: false }); }, true],
  ['accept an intent whose expiry is exactly the current instant', (_rows, s) => { s.intent.expires_at = new Date(Date.now()); }, true],
  ['skip a malformed transaction before a later valid candidate', (rows, s) => { rows.unshift({ now: 1_792_128_000, get inMessage() { throw new Error('bad row'); } }); }, true],
  ['accept a transaction after an unrelated candidate', (rows, s) => { const wrong = s.good(); wrong.inMessage.info.value.coins = amount + 1n; rows.unshift(wrong); }, true],
];

const senderScenarios: Array<[string, ListMutation, boolean]> = [
  ['skip a missing timestamp and continue to a valid row', (rows, s) => { const bad = s.good(); delete bad.now; rows.unshift(bad); }, true],
  ['skip a NaN timestamp and continue to a valid row', (rows, s) => { const bad = s.good(); bad.now = Number.NaN; rows.unshift(bad); }, true],
  ['skip an infinite timestamp and continue to a valid row', (rows, s) => { const bad = s.good(); bad.now = Number.NEGATIVE_INFINITY; rows.unshift(bad); }, true],
  ['skip null sender transaction rows', (rows) => { rows.unshift(null); }, true],
  ['skip a malformed message collection and continue', (rows, s) => { const bad = s.good(); bad.outMessages = null; rows.unshift(bad); }, true],
  ['reject an outgoing message marked as bounced', (rows) => { [...rows[0].outMessages.values()][0].info.bounced = true; }, false],
  ['reject a non-internal outgoing message', (rows) => { [...rows[0].outMessages.values()][0].info.type = 'external-out'; }, false],
  ['reject an outgoing message from another sender', (rows) => { [...rows[0].outMessages.values()][0].info.src = other; }, false],
  ['reject an outgoing message from another workchain', (rows) => { [...rows[0].outMessages.values()][0].info.src = new Address(-1, Buffer.alloc(32, 21)); }, false],
  ['reject a destination on the wrong address', (rows) => { [...rows[0].outMessages.values()][0].info.dest = other; }, false],
  ['reject a destination on another workchain', (rows) => { [...rows[0].outMessages.values()][0].info.dest = new Address(-1, Buffer.alloc(32, 9)); }, false],
  ['reject a smaller outgoing amount', (rows) => { [...rows[0].outMessages.values()][0].info.value.coins = amount - 1n; }, false],
  ['reject an outgoing message with no coin value', (rows) => { [...rows[0].outMessages.values()][0].info.value = null; }, false],
  ['reject an outgoing message without a comment body', (rows) => { [...rows[0].outMessages.values()][0].body = null; }, false],
  ['reject an outgoing message with an unsupported opcode', (rows) => { [...rows[0].outMessages.values()][0].body = beginCell().storeUint(2, 32).storeStringTail(memo).endCell(); }, false],
  ['find a valid outgoing message after malformed sibling messages', (rows) => { rows[0].outMessages = new Map([['bad', null], ...rows[0].outMessages]); }, true],
  ['skip a transaction hash failure and continue', (rows, s) => { const bad = s.good(); bad.hash = () => { throw new Error('hash unavailable'); }; rows.unshift(bad); }, true],
  ['accept the inclusive earliest transfer time', (rows, s) => { s.intent.created_at = new Date(1_792_128_000_000 + 120_000); rows[0].now = 1_792_128_000; }, true],
  ['accept the inclusive latest transfer time', (rows) => { vi.setSystemTime(new Date(1_792_128_000_000 - 120_000)); rows[0].now = 1_792_128_000; }, true],
  ['reject an expired intent before searching transactions', (_rows, s) => { s.intent.expires_at = new Date(Date.now() - 1); }, false],
  ['reject an intent for a different network', (_rows, s) => { s.intent.network = 'testnet'; }, false],
  ['reject an invalid sender address before querying the client', (_rows, s) => { s.intent.wallet_address = 'malformed'; }, false],
  ['reject an invalid vault address before querying the client', (_rows, s) => { s.intent.deposit_address = 'malformed'; }, false],
  ['propagate provider errors for the caller to isolate', (_rows, s) => { (s.verifier as any).client = { getTransactions: async () => { throw new Error('indexer down'); } }; }, false],
  ['match a valid second output after an unrelated output', (rows) => { rows[0].outMessages = new Map([['noise', { info: { type: 'internal', src: sender, dest: other, value: { coins: amount } }, body: comment() }], ...rows[0].outMessages]); }, true],
];

describe('expanded deposit matching scenarios', () => {
  let verifier: DepositVerificationService;
  let intent: PendingDepositIntent;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));
    vi.stubEnv('TON_NETWORK', 'mainnet');
    verifier = new DepositVerificationService(new StorageService());
    (verifier as any).vaultAddress = vault;
    intent = {
      id: 'expanded-intent', telegram_id: 99101,
      wallet_address: sender.toString({ urlSafe: true, bounceable: true, testOnly: false }),
      deposit_address: vault.toString({ urlSafe: true, bounceable: true, testOnly: false }),
      amount_nano: amount.toString(), memo, network: 'mainnet', status: 'pending',
      created_at: new Date(1_792_128_000_000),
    };
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it.each(vaultScenarios)('vault lookup: %s', (label, mutate, shouldMatch) => {
    const good = vaultTransaction;
    const rows = [good()];
    mutate(rows, { intent, verifier, good });
    const result = (verifier as any).findMatchingVaultTransfer(intent, rows);
    const expected = shouldMatch ? Buffer.alloc(32, 9).toString('hex') : null;
    expect(result, label).toBe(expected);
  });

  it.each(senderScenarios)('sender lookup: %s', async (label, mutate, shouldMatch) => {
    const good = senderTransaction;
    const rows = [good()];
    mutate(rows, { intent, verifier, good });
    if (!(verifier as any).client) {
      (verifier as any).client = { getTransactions: async () => rows };
    }
    const find = (verifier as any).findMatchingTransfer.bind(verifier);
    if (label === 'propagate provider errors for the caller to isolate') {
      await expect(find(intent)).rejects.toThrow('indexer down');
      return;
    }
    const expected = shouldMatch ? Buffer.alloc(32, 10).toString('hex') : null;
    await expect(find(intent), label).resolves.toBe(expected);
  });
});
