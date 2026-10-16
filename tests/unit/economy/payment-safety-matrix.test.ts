import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabasePool } from '../../../server/db/index';
import { StorageService } from '../../../server/storage';

const sender = 'EQD48x9_ton_player_wallet_address_12345';
const vault = 'EQD48x9_gibous_vault_address_12345';
const payoutWallet = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
const bigLimit = '99999999999999999999999999999999';
const scenarios = Array.from({ length: 20 }, (_, index) => index + 1);
let nextTelegramId = 9_700_000;

function telegramId() {
  nextTelegramId += 1;
  return nextTelegramId;
}

function configureWithdrawalLimits(overrides: Record<string, string> = {}) {
  vi.stubEnv('PAYOUT_NETWORK', 'mainnet');
  vi.stubEnv('PAYOUT_MIN_WITHDRAWAL_NANO', '1');
  vi.stubEnv('PAYOUT_MAX_WITHDRAWAL_NANO', bigLimit);
  vi.stubEnv('PAYOUT_USER_DAILY_LIMIT_NANO', bigLimit);
  vi.stubEnv('PAYOUT_GLOBAL_DAILY_LIMIT_NANO', bigLimit);
  for (const [key, value] of Object.entries(overrides)) vi.stubEnv(key, value);
}

async function createPendingDeposit(storage: StorageService, id: number, amountNano = '1000000000') {
  await storage.getOrCreateUser({ id, first_name: 'Deposit Matrix' });
  const intent = await storage.createDepositIntent({
    telegramId: id, amountNano, walletAddress: sender, depositAddress: vault, network: 'testnet',
  });
  const result = await storage.recordPendingDeposit({
    intentId: intent.id, telegramId: id, walletAddress: sender, depositAddress: vault,
    amountNano, boc: `matrix-boc-${id}`, network: 'testnet',
  });
  expect(result.success).toBe(true);
  return { intent, user: DatabasePool.getInstance().getUserByTelegramId(id)! };
}

async function fundUser(id: number, amountNano: string) {
  await new StorageService().getOrCreateUser({ id, first_name: 'Withdrawal Matrix' });
  const db = DatabasePool.getInstance();
  const user = db.getUserByTelegramId(id)!;
  user.balance_nano = amountNano;
  user.balance_gram = Number(BigInt(amountNano)) / 1_000_000_000;
  db.saveUser(user);
  return user;
}

async function createQuote(storage: StorageService, id: number, grossAmountNano: string, feeNano = '1') {
  return storage.createWithdrawalQuote({
    telegramId: id, walletAddress: payoutWallet, grossAmountNano, feeNano, network: 'mainnet',
  });
}

describe('100 additional deposit money-safety scenarios', () => {
  let storage: StorageService;

  beforeEach(() => {
    storage = new StorageService();
    vi.stubEnv('TON_NETWORK', 'testnet');
    vi.stubEnv('TON_DEPOSIT_ADDRESS', vault);
  });

  afterEach(() => vi.unstubAllEnvs());

  describe('exact integer credit and ledger integrity', () => {
    it.each(scenarios)('credits exact nano amount and ledger balance for amount case %i', async (caseNumber) => {
      const id = telegramId();
      const amounts = [
        '1', '2', '9', '10', '99', '100', '999999', '100000001', '999999999', '1000000001',
        '9007199254740991', '9007199254740992', '9007199254740993', '12345678901234567',
        '999999999999999999', '1000000000000000000', '123456789012345678901',
        '99999999999999999999999999999', '100000000000000000000000000000',
        '999999999999999999999999999999',
      ];
      const amount = BigInt(amounts[caseNumber - 1]);
      const { intent, user } = await createPendingDeposit(storage, id, amount.toString());
      const before = BigInt(user.balance_nano);
      const result = await storage.confirmDeposit(intent.id, `exact-amount-${caseNumber}`);
      const after = DatabasePool.getInstance().getUserByTelegramId(id)!;
      const ledger = DatabasePool.getInstance().getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'deposit');

      expect(result.success).toBe(true);
      expect(after.balance_nano).toBe((before + amount).toString());
      expect(ledger).toHaveLength(1);
      expect(String(ledger[0].amount_nano)).toBe(amount.toString());
      expect(String(ledger[0].balance_after_nano)).toBe((before + amount).toString());
    });
  });

  describe('confirmation idempotency and evidence binding', () => {
    it.each(scenarios)('accepts same evidence retry and rejects changed evidence case %i', async (caseNumber) => {
      const id = telegramId();
      const amount = String(caseNumber * 100_000_003);
      const { intent, user } = await createPendingDeposit(storage, id, amount);
      const txHash = `bound-evidence-${caseNumber}`;
      const first = await storage.confirmDeposit(intent.id, txHash);
      const sameEvidenceRetry = await storage.confirmDeposit(intent.id, ` ${txHash} `);
      const changedEvidence = await storage.confirmDeposit(intent.id, `different-evidence-${caseNumber}`);
      const ledger = DatabasePool.getInstance().getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'deposit');

      expect(first.success).toBe(true);
      expect(sameEvidenceRetry.success).toBe(true);
      expect(changedEvidence.success).toBe(false);
      expect(ledger).toHaveLength(1);
      expect(ledger[0].tx_hash).toBe(txHash);
    });
  });

  describe('concurrent duplicate confirmation fanout', () => {
    it.each(scenarios)('credits once when case %i sends parallel confirm retries', async (caseNumber) => {
      const id = telegramId();
      const amount = String(caseNumber * 10_000_019);
      const { intent, user } = await createPendingDeposit(storage, id, amount);
      const balanceBefore = BigInt(user.balance_nano);
      const fanout = caseNumber + 1;
      const results = await Promise.all(Array.from({ length: fanout }, () => storage.confirmDeposit(intent.id, `parallel-confirm-${caseNumber}`)));
      const after = DatabasePool.getInstance().getUserByTelegramId(id)!;
      const rows = DatabasePool.getInstance().getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'deposit');

      expect(results.every((result) => result.success)).toBe(true);
      expect(BigInt(after.balance_nano) - balanceBefore).toBe(BigInt(amount));
      expect(rows).toHaveLength(1);
    });
  });

  describe('one signed payload cannot bind to competing intents', () => {
    it.each(scenarios)('allows only one of %i+1 intents to claim the same BOC', async (caseNumber) => {
      const id = telegramId();
      await storage.getOrCreateUser({ id, first_name: 'Competing intents' });
      const count = caseNumber + 1;
      const intents = await Promise.all(Array.from({ length: count }, () => storage.createDepositIntent({
        telegramId: id, amountNano: '1000000000', walletAddress: sender, depositAddress: vault, network: 'testnet',
      })));
      const claims = await Promise.all(intents.map((intent) => storage.recordPendingDeposit({
        intentId: intent.id, telegramId: id, walletAddress: sender, depositAddress: vault,
        amountNano: '1000000000', boc: `shared-race-boc-${caseNumber}`, network: 'testnet',
      })));

      expect(claims.filter((claim) => claim.success)).toHaveLength(1);
      expect(intents.filter((intent) => DatabasePool.getInstance().getDepositIntentById(intent.id)?.boc === `shared-race-boc-${caseNumber}`)).toHaveLength(1);
      expect(DatabasePool.getInstance().getTransactionsForUser(DatabasePool.getInstance().getUserByTelegramId(id)!.id)).toHaveLength(0);
    });
  });

  describe('deposit submissions fail closed on altered or invalid data', () => {
    it.each(scenarios)('rejects malformed scenario %i without binding or credit', async (caseNumber) => {
      const id = telegramId();
      const { intent, user } = await createPendingDeposit(storage, id);
      // Start each case with a fresh, unbound intent; the helper above exercises the happy path.
      const freshIntent = await storage.createDepositIntent({ telegramId: id, amountNano: '1000000000', walletAddress: sender, depositAddress: vault, network: 'testnet' });
      const input: any = {
        intentId: freshIntent.id, telegramId: id, walletAddress: sender, depositAddress: vault,
        amountNano: '1000000000', boc: `invalid-matrix-${caseNumber}`, network: 'testnet',
      };
      const alternateOwner = telegramId();
      const variants: Array<(value: any) => void> = [
        (v) => { v.amountNano = '0'; }, (v) => { v.amountNano = '-1'; }, (v) => { v.amountNano = '1.25'; },
        (v) => { v.amountNano = '1000000001'; }, (v) => { v.amountNano = '9'.repeat(31); },
        (v) => { v.walletAddress = 'different-sender'; }, (v) => { v.depositAddress = 'different-vault'; },
        (v) => { v.network = 'mainnet'; }, (v) => { v.intentId = 'missing-intent-id'; },
        (v) => { v.boc = ''; }, (v) => { v.boc = '   '; }, (v) => { v.boc = 'x'.repeat(250_001); },
        (v) => { v.telegramId = alternateOwner; }, (v) => { v.intentId = intent.id; v.boc = `already-claimed-${caseNumber}`; },
        (v) => { v.walletAddress = ''; }, (v) => { v.depositAddress = ''; }, (v) => { v.network = 'invalid'; },
        (v) => { v.amountNano = ''; }, (v) => { v.amountNano = ' 1000000000'; }, (v) => { v.intentId = ''; },
      ];
      if (caseNumber === 13) await storage.getOrCreateUser({ id: alternateOwner, first_name: 'Other owner' });
      if (caseNumber === 14) {
        await storage.recordPendingDeposit({ ...input, intentId: intent.id, boc: `already-claimed-${caseNumber}` });
      }
      variants[caseNumber - 1](input);
      const result = await storage.recordPendingDeposit(input);

      expect(result.success, `variant ${caseNumber} must be rejected`).toBe(false);
      expect(DatabasePool.getInstance().getDepositIntentById(freshIntent.id)?.boc).toBeNull();
      expect(DatabasePool.getInstance().getTransactionsForUser(user.id)).toHaveLength(0);
    });
  });
});

describe('100 additional withdrawal money-safety scenarios', () => {
  let storage: StorageService;

  beforeEach(() => {
    storage = new StorageService();
    DatabasePool.getInstance().resetInMemoryWithdrawalStateForTests();
    configureWithdrawalLimits();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('exact amount, fee, and balance arithmetic', () => {
    it.each(scenarios)('preserves exact nano arithmetic for withdrawal amount case %i', async (caseNumber) => {
      const id = telegramId();
      const amounts = [
        '1', '2', '9', '10', '99', '100', '999999', '100000001', '999999999', '1000000001',
        '9007199254740991', '9007199254740992', '9007199254740993', '12345678901234567',
        '999999999999999999', '1000000000000000000', '123456789012345678901',
        '99999999999999999999999999999', '100000000000000000000000000000',
        '999999999999999999999999999999',
      ];
      const gross = BigInt(amounts[caseNumber - 1]);
      const fee = gross > 1n ? BigInt(caseNumber) % gross : 0n;
      await fundUser(id, (gross + 123n).toString());
      const quote = await createQuote(storage, id, gross.toString(), fee.toString());
      expect(quote.success).toBe(true);
      if (!quote.success) return;
      expect(quote.quote.grossAmountNano).toBe(gross.toString());
      expect(quote.quote.netAmountNano).toBe((gross - fee).toString());
      const confirmed = await storage.confirmWithdrawalQuote({ telegramId: id, quoteId: quote.quote.quoteId, operationKey: `exact-withdraw-${caseNumber}-${id}` });
      expect(confirmed.success).toBe(true);
      expect(DatabasePool.getInstance().getUserByTelegramId(id)?.balance_nano).toBe('123');
      expect(confirmed.withdrawal?.amount_nano).toBe(gross.toString());
      expect(confirmed.withdrawal?.net_amount_nano).toBe((gross - fee).toString());
    });
  });

  describe('parallel confirmation is one debit and one withdrawal', () => {
    it.each(scenarios)('debits once for case %i confirmation fanout', async (caseNumber) => {
      const id = telegramId();
      const gross = BigInt(caseNumber) * 10_000_019n;
      await fundUser(id, (gross * 3n).toString());
      const quote = await createQuote(storage, id, gross.toString(), '1');
      expect(quote.success).toBe(true);
      if (!quote.success) return;
      const fanout = caseNumber + 1;
      const results = await Promise.all(Array.from({ length: fanout }, () => storage.confirmWithdrawalQuote({
        telegramId: id, quoteId: quote.quote.quoteId, operationKey: `parallel-withdraw-${caseNumber}-${id}`,
      })));
      const db = DatabasePool.getInstance();
      const withdrawals = (db as any).inMemoryDb.get('withdrawals').filter((item: any) => item.telegram_id === id);
      const debits = db.getTransactionsForUser(db.getUserByTelegramId(id)!.id).filter((tx: any) => tx.type === 'withdraw');
      expect(results.every((result) => result.success)).toBe(true);
      expect(withdrawals).toHaveLength(1);
      expect(debits).toHaveLength(1);
      expect(db.getUserByTelegramId(id)?.balance_nano).toBe((gross * 2n).toString());
    });
  });

  describe('idempotency keys remain bound to the original quote', () => {
    it.each(scenarios)('blocks key reuse across a different quote in case %i', async (caseNumber) => {
      const id = telegramId();
      const firstGross = BigInt(caseNumber) * 1_000_003n + 100n;
      const secondGross = firstGross + 7n;
      await fundUser(id, (firstGross + secondGross + 100n).toString());
      const firstQuote = await createQuote(storage, id, firstGross.toString(), '1');
      const secondQuote = await createQuote(storage, id, secondGross.toString(), '2');
      expect(firstQuote.success && secondQuote.success).toBe(true);
      if (!firstQuote.success || !secondQuote.success) return;
      const key = `collision-key-${caseNumber}-${id}`;
      const first = await storage.confirmWithdrawalQuote({ telegramId: id, quoteId: firstQuote.quote.quoteId, operationKey: key });
      const replay = await storage.confirmWithdrawalQuote({ telegramId: id, quoteId: secondQuote.quote.quoteId, operationKey: key });
      const db = DatabasePool.getInstance();

      expect(first.success).toBe(true);
      expect(replay.success).toBe(false);
      expect(db.getUserByTelegramId(id)?.balance_nano).toBe((firstGross + secondGross + 100n - firstGross).toString());
      expect((db as any).inMemoryDb.get('withdrawals').filter((item: any) => item.telegram_id === id)).toHaveLength(1);
    });
  });

  describe('quote ownership is enforced for every account boundary', () => {
    it.each(scenarios)('rejects a different account confirming case %i quote', async (caseNumber) => {
      const owner = telegramId();
      const attacker = telegramId();
      const amount = BigInt(caseNumber) * 1_000_033n + 10_000n;
      await fundUser(owner, (amount * 2n).toString());
      await fundUser(attacker, (amount * 2n).toString());
      const quote = await createQuote(storage, owner, amount.toString(), '5');
      expect(quote.success).toBe(true);
      if (!quote.success) return;
      const beforeOwner = DatabasePool.getInstance().getUserByTelegramId(owner)!.balance_nano;
      const beforeAttacker = DatabasePool.getInstance().getUserByTelegramId(attacker)!.balance_nano;
      const rejected = await storage.confirmWithdrawalQuote({ telegramId: attacker, quoteId: quote.quote.quoteId, operationKey: `owner-attack-${caseNumber}-${attacker}` });
      expect(rejected.success).toBe(false);
      expect(DatabasePool.getInstance().getUserByTelegramId(owner)?.balance_nano).toBe(beforeOwner);
      expect(DatabasePool.getInstance().getUserByTelegramId(attacker)?.balance_nano).toBe(beforeAttacker);
      const authorized = await storage.confirmWithdrawalQuote({ telegramId: owner, quoteId: quote.quote.quoteId, operationKey: `authorized-${caseNumber}-${owner}` });
      expect(authorized.success).toBe(true);
      expect(DatabasePool.getInstance().getUserByTelegramId(owner)?.balance_nano).toBe((BigInt(beforeOwner) - amount).toString());
    });
  });

  describe('withdrawal validation and daily caps fail closed', () => {
    it.each(scenarios)('rejects unsafe withdrawal request variation %i without debit', async (caseNumber) => {
      const id = telegramId();
      const amount = 100_000_000n + BigInt(caseNumber);
      const variants: Array<() => Promise<{ success: boolean; error?: string }>> = [];
      await fundUser(id, (amount * 10n).toString());
      const normal = (overrides: Record<string, any> = {}) => storage.createWithdrawalQuote({
        telegramId: id, walletAddress: payoutWallet, grossAmountNano: amount.toString(), feeNano: '1', network: 'mainnet', ...overrides,
      });
      variants.push(() => normal({ grossAmountNano: '0' }));
      variants.push(() => normal({ grossAmountNano: '-1' }));
      variants.push(() => normal({ grossAmountNano: '1.5' }));
      variants.push(() => normal({ grossAmountNano: '' }));
      variants.push(() => normal({ grossAmountNano: '9'.repeat(31) }));
      variants.push(() => normal({ feeNano: '-1' }));
      variants.push(() => normal({ feeNano: amount.toString() }));
      variants.push(() => normal({ feeNano: '1.5' }));
      variants.push(() => normal({ walletAddress: 'not-a-ton-address' }));
      variants.push(() => normal({ network: 'testnet' }));
      variants.push(() => normal({ grossAmountNano: '9999999999999999999999999999999' }));
      variants.push(() => normal({ feeNano: '9'.repeat(31) }));
      variants.push(() => normal({ grossAmountNano: ` ${amount}` }));
      variants.push(() => normal({ grossAmountNano: `+${amount}` }));
      variants.push(async () => {
        vi.stubEnv('PAYOUT_MIN_WITHDRAWAL_NANO', (amount + 1n).toString());
        return normal();
      });
      variants.push(async () => {
        vi.stubEnv('PAYOUT_MAX_WITHDRAWAL_NANO', (amount - 1n).toString());
        return normal();
      });
      variants.push(async () => {
        vi.stubEnv('PAYOUT_USER_DAILY_LIMIT_NANO', (amount - 1n).toString());
        const quote = await normal();
        if (!quote.success) return quote;
        return storage.confirmWithdrawalQuote({ telegramId: id, quoteId: quote.quote.quoteId, operationKey: `user-cap-${id}` });
      });
      variants.push(async () => {
        vi.stubEnv('PAYOUT_GLOBAL_DAILY_LIMIT_NANO', (amount - 1n).toString());
        const quote = await normal();
        if (!quote.success) return quote;
        return storage.confirmWithdrawalQuote({ telegramId: id, quoteId: quote.quote.quoteId, operationKey: `global-cap-${id}` });
      });
      variants.push(async () => {
        const db = DatabasePool.getInstance();
        const user = db.getUserByTelegramId(id)!;
        user.balance_nano = (amount - 1n).toString();
        user.balance_gram = Number(user.balance_nano) / 1_000_000_000;
        db.saveUser(user);
        const quote = await normal();
        if (!quote.success) return quote;
        return storage.confirmWithdrawalQuote({ telegramId: id, quoteId: quote.quote.quoteId, operationKey: `balance-${id}` });
      });
      variants.push(async () => {
        vi.stubEnv('PAYOUT_NETWORK', 'testnet');
        return normal();
      });
      const before = DatabasePool.getInstance().getUserByTelegramId(id)!.balance_nano;
      const result = await variants[caseNumber - 1]();

      expect(result.success, `unsafe withdrawal variation ${caseNumber} should fail`).toBe(false);
      expect(DatabasePool.getInstance().getUserByTelegramId(id)?.balance_nano).not.toBe('');
      if (caseNumber <= 16) expect(DatabasePool.getInstance().getUserByTelegramId(id)?.balance_nano).toBe(before);
      expect(DatabasePool.getInstance().getTransactionsForUser(DatabasePool.getInstance().getUserByTelegramId(id)!.id).filter((tx: any) => tx.type === 'withdraw')).toHaveLength(0);
    });
  });
});
