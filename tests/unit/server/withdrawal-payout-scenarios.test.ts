import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Address } from '@ton/core';
import { DatabasePool } from '../../../server/db';
import { StorageService } from '../../../server/storage';
import {
  loadWithdrawalWorkerConfig,
  tonCenterMessageIsMasterchainFinalized,
  TonWithdrawalPayoutClient,
  WithdrawalPayoutWorker,
} from '../../../server/withdrawalPayout';

const wallet = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
let nextTelegramId = 889900;

const validEnv = () => ({
  PAYOUT_WORKER_ENABLED: 'true', PAYOUT_NETWORK: 'mainnet',
  TONCENTER_API_URL: 'https://toncenter.com', PAYOUT_SIGNER_MNEMONIC: 'test-only secret words',
  PAYOUT_WALLET_RESERVE_NANO: '100000000', PAYOUT_TRANSACTION_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('hex'),
  PAYOUT_MIN_WITHDRAWAL_NANO: '100000000', PAYOUT_MAX_WITHDRAWAL_NANO: '5000000000',
  PAYOUT_USER_DAILY_LIMIT_NANO: '6000000000', PAYOUT_GLOBAL_DAILY_LIMIT_NANO: '20000000000',
});

const invalidConfigCases: Array<[string, (env: Record<string, string | undefined>) => void, string]> = [
  ['missing the Mainnet RPC endpoint', (env) => { delete env.TONCENTER_API_URL; }, 'RPC and signer secrets'],
  ['missing the signer mnemonic', (env) => { delete env.PAYOUT_SIGNER_MNEMONIC; }, 'RPC and signer secrets'],
  ['a nonnumeric wallet reserve', (env) => { env.PAYOUT_WALLET_RESERVE_NANO = '1e9'; }, 'reserve'],
  ['a zero wallet reserve', (env) => { env.PAYOUT_WALLET_RESERVE_NANO = '0'; }, 'reserve'],
  ['an encryption key shorter than 32 bytes', (env) => { env.PAYOUT_TRANSACTION_ENCRYPTION_KEY = Buffer.alloc(31, 3).toString('hex'); }, 'exactly 32 bytes'],
  ['a fractional minimum withdrawal', (env) => { env.PAYOUT_MIN_WITHDRAWAL_NANO = '1.5'; }, 'positive integer'],
  ['a zero global daily limit', (env) => { env.PAYOUT_GLOBAL_DAILY_LIMIT_NANO = '0'; }, 'positive integer'],
  ['a maximum withdrawal below the minimum', (env) => { env.PAYOUT_MAX_WITHDRAWAL_NANO = '99999999'; }, 'at least the minimum'],
];

const expandedInvalidConfigCases: Array<[string, (env: Record<string, string | undefined>) => void, string]> = [
  ['an empty network selector', (env) => { env.PAYOUT_NETWORK = ''; }, 'mainnet'],
  ['a test-network selector with mixed case', (env) => { env.PAYOUT_NETWORK = 'Mainnet'; }, 'mainnet'],
  ['a missing wallet reserve', (env) => { delete env.PAYOUT_WALLET_RESERVE_NANO; }, 'reserve'],
  ['a negative wallet reserve', (env) => { env.PAYOUT_WALLET_RESERVE_NANO = '-1'; }, 'reserve'],
  ['a malformed base64 encryption key', (env) => { env.PAYOUT_TRANSACTION_ENCRYPTION_KEY = '!not-base64!'; }, 'exactly 32 bytes'],
  ['a zero minimum withdrawal', (env) => { env.PAYOUT_MIN_WITHDRAWAL_NANO = '0'; }, 'positive integer'],
  ['a nonnumeric maximum withdrawal', (env) => { env.PAYOUT_MAX_WITHDRAWAL_NANO = 'five'; }, 'positive integer'],
  ['a fractional user daily cap', (env) => { env.PAYOUT_USER_DAILY_LIMIT_NANO = '3.5'; }, 'positive integer'],
  ['a negative global daily cap', (env) => { env.PAYOUT_GLOBAL_DAILY_LIMIT_NANO = '-2'; }, 'positive integer'],
  ['a missing user daily cap', (env) => { delete env.PAYOUT_USER_DAILY_LIMIT_NANO; }, 'positive integer'],
];

const senderAccount = Address.parse(wallet);
const otherAccount = Address.parse('UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ');
const finalityCases: Array<[string, unknown, boolean]> = [
  ['an empty transaction list', { transactions: [] }, false],
  ['a missing transactions field', {}, false],
  ['a null transaction list', { transactions: null }, false],
  ['a record without an account', { transactions: [{ mc_block_seqno: 12 }] }, false],
  ['a finalized record for another account', { transactions: [{ account: otherAccount.toRawString(), mc_block_seqno: 12 }] }, false],
  ['a malformed account address', { transactions: [{ account: 'not-an-address', mc_block_seqno: 12 }] }, false],
  ['a zero masterchain sequence number', { transactions: [{ account: senderAccount.toRawString(), mc_block_seqno: 0 }] }, false],
  ['a negative masterchain sequence number', { transactions: [{ account: senderAccount.toRawString(), mc_block_seqno: -3 }] }, false],
  ['a missing masterchain sequence number', { transactions: [{ account: senderAccount.toRawString() }] }, false],
  ['a malformed sequence number string', { transactions: [{ account: senderAccount.toRawString(), mc_block_seqno: 'final' }] }, false],
  ['a fractional sequence number string', { transactions: [{ account: senderAccount.toRawString(), mc_block_seqno: '12.5' }] }, false],
  ['a boolean sequence number', { transactions: [{ account: senderAccount.toRawString(), mc_block_seqno: true }] }, false],
  ['a matching finalized row after invalid rows', { transactions: [null, { account: 'bad', mc_block_seqno: 9 }, { account: senderAccount.toRawString(), mc_block_seqno: 15 }] }, true],
  ['an equivalent friendly address representation', { transactions: [{ account: wallet, mc_block_seqno: '42' }] }, true],
  ['any finalized match among multiple accounts', { transactions: [{ account: otherAccount.toRawString(), mc_block_seqno: 99 }, { account: senderAccount.toRawString(), mc_block_seqno: '1' }] }, true],
];

describe('expanded TON Center withdrawal finality response scenarios', () => {
  it.each(finalityCases)('handles %s', async (_label, body, expected) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
    const result = await tonCenterMessageIsMasterchainFinalized({
      endpoint: new URL('https://toncenter.com/custom/path'), messageHash: 'message-hash', account: senderAccount, fetcher: fetcher as typeof fetch,
    });
    expect(result).toBe(expected);
  });

  it.each([404, 500])('surfaces an unsuccessful finality response (%s)', async (status) => {
    const fetcher = vi.fn(async () => new Response('unavailable', { status }));
    await expect(tonCenterMessageIsMasterchainFinalized({
      endpoint: new URL('https://toncenter.com'), messageHash: 'message-hash', account: senderAccount, fetcher: fetcher as typeof fetch,
    })).rejects.toThrow('finality query failed');
  });

  it('sends the message hash query with the API key and finalized-message filters', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ transactions: [] }), { status: 200 }));
    await tonCenterMessageIsMasterchainFinalized({ endpoint: new URL('https://toncenter.com'), apiKey: 'test-api-key', messageHash: 'abc123', account: senderAccount, fetcher: fetcher as typeof fetch });
    const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.searchParams.get('msg_hash')).toBe('abc123');
    expect(url.searchParams.get('direction')).toBe('in');
    expect(url.searchParams.get('limit')).toBe('10');
    expect((options.headers as Record<string, string>)['X-API-Key']).toBe('test-api-key');
  });

  it('uses the outgoing message body hash query when asked', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ transactions: [] }), { status: 200 }));
    await tonCenterMessageIsMasterchainFinalized({ endpoint: new URL('https://toncenter.com'), messageHash: 'body123', account: senderAccount, queryByBody: true, fetcher: fetcher as typeof fetch });
    const requestedUrl = new URL(String(fetcher.mock.calls[0][0]));
    expect(requestedUrl.searchParams.get('body_hash')).toBe('body123');
    expect(requestedUrl.searchParams.has('msg_hash')).toBe(false);
  });

  it('uses the TON Center v3 endpoint at the configured host root', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ transactions: [] }), { status: 200 }));
    await tonCenterMessageIsMasterchainFinalized({ endpoint: new URL('https://toncenter.com/subpath/jsonRPC'), messageHash: 'hash', account: senderAccount, fetcher: fetcher as typeof fetch });
    expect(new URL(String(fetcher.mock.calls[0][0])).pathname).toBe('/api/v3/transactionsByMessage');
  });
});

describe('additional withdrawal payout scenarios', () => {
  let storage: StorageService;
  let client: TonWithdrawalPayoutClient;
  let inspection: any;
  let broadcasts: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    vi.stubEnv('NODE_ENV', 'test');
    Object.entries(validEnv()).forEach(([key, value]) => vi.stubEnv(key, value!));
    storage = new StorageService();
    DatabasePool.getInstance().resetInMemoryWithdrawalStateForTests();
    inspection = { status: 'pending' };
    broadcasts = [];
    client = {
      address: wallet,
      estimateFee: async () => 1_000_000n,
      getBalance: async () => 10_000_000_000n,
      getSeqno: async () => 12,
      prepareSignedTransfer: async ({ seqno, validUntil }) => ({ boc: 'scenario-payload', messageHash: 'scenario-hash', seqno, validUntil }),
      broadcast: async (payload) => { broadcasts.push(payload.boc); },
      inspectTransaction: async () => inspection,
    };
  });

  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  async function confirmedWithdrawal() {
    const telegramId = nextTelegramId++;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Payout scenario' });
    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(telegramId)!;
    user.balance_nano = '5000000000'; user.balance_gram = 5; db.saveUser(user);
    const quote = await storage.createWithdrawalQuote({ telegramId, walletAddress: wallet, grossAmountNano: '2000000000', feeNano: '1000000', network: 'mainnet' });
    if (!quote.success) throw new Error('Quote failed');
    const confirmed = await storage.confirmWithdrawalQuote({ telegramId, quoteId: quote.quote.quoteId, operationKey: `payout-scenario-${telegramId}` });
    if (!confirmed.success) throw new Error('Confirmation failed');
    return confirmed.withdrawal;
  }

  it.each(invalidConfigCases)('rejects enabled payout config with %s', (_name, mutate, expectedError) => {
    const env = validEnv();
    mutate(env);
    expect(() => loadWithdrawalWorkerConfig(env)).toThrow(expectedError);
  });

  it('permits signing when balance exactly covers amount, fee, and configured reserve', async () => {
    await confirmedWithdrawal();
    // Net amount is 1,999,000,000; withdrawal fee is 1,000,000; reserve is 100,000,000.
    client.getBalance = vi.fn().mockResolvedValue(2_100_000_000n);
    const prepare = vi.spyOn(client, 'prepareSignedTransfer');
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'exact-reserve' });
    await worker.start(); await worker.stop();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(broadcasts).toEqual(['scenario-payload']);
  });

  it('does not sign when balance is one nanoton below the required reserve', async () => {
    await confirmedWithdrawal();
    client.getBalance = vi.fn().mockResolvedValue(2_099_999_999n);
    const prepare = vi.spyOn(client, 'prepareSignedTransfer');
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'reserve-minus-one' });
    await worker.start(); await worker.stop();
    expect(prepare).not.toHaveBeenCalled();
    expect(broadcasts).toHaveLength(0);
  });

  it('does not claim work when the payout wallet sequence number health check fails', async () => {
    await confirmedWithdrawal();
    client.getSeqno = vi.fn().mockRejectedValue(new Error('seqno endpoint unavailable'));
    const prepare = vi.spyOn(client, 'prepareSignedTransfer');
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'seqno-down' });
    await worker.start();
    expect(worker.getHealth().ready).toBe(false);
    expect(prepare).not.toHaveBeenCalled();
    expect(broadcasts).toHaveLength(0);
    await worker.stop();
  });

  it('keeps a claimed withdrawal pending if signing throws before a payload is stored', async () => {
    const withdrawal = await confirmedWithdrawal();
    client.prepareSignedTransfer = vi.fn().mockRejectedValue(new Error('signer temporarily unavailable'));
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'signer-down' });
    await worker.start(); await worker.stop();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(row.status).toBe('processing');
    expect(row.signed_payload_ciphertext).toBeUndefined();
    expect(broadcasts).toHaveLength(0);
  });

  it('does not broadcast a payload rejected by the durable storage fence', async () => {
    await confirmedWithdrawal();
    vi.spyOn(storage, 'persistSignedWithdrawalPayload').mockResolvedValue(false as any);
    const prepare = vi.spyOn(client, 'prepareSignedTransfer');
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'stale-fence' });
    await worker.start(); await worker.stop();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(broadcasts).toHaveLength(0);
  });

  it('settles an already-finalized transfer without broadcasting it again', async () => {
    const withdrawal = await confirmedWithdrawal();
    inspection = { status: 'finalized_success', destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano, txHash: 'found-before-send', actualFeeNano: '500000' };
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'already-finalized' });
    await worker.start(); await worker.stop();
    expect(broadcasts).toHaveLength(0);
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(row).toMatchObject({ status: 'completed', tx_hash: 'found-before-send' });
  });

  it('leaves an unknown chain result pending without refunding the user', async () => {
    const withdrawal = await confirmedWithdrawal();
    inspection = { status: 'unknown' };
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'chain-unknown' });
    await worker.start(); await worker.stop();
    const db = DatabasePool.getInstance();
    const row = (db as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    const user = db.getUserByTelegramId(Number(withdrawal.telegram_id))!;
    expect(row.status).toBe('processing');
    expect(user.balance_nano).toBe('3000000000');
    expect(db.getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'withdrawal_refund')).toHaveLength(0);
  });

  it('keeps an accepted broadcast pending until chain finality is observed', async () => {
    const withdrawal = await confirmedWithdrawal();
    inspection = { status: 'pending' };
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'accepted-pending' });
    await worker.start(); await worker.stop();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(broadcasts).toEqual(['scenario-payload']);
    expect(row.status).toBe('processing');
    expect(row.tx_hash).toBeUndefined();
  });

  it('reconciles a transfer that finalizes between the pre-send and post-send inspections', async () => {
    const withdrawal = await confirmedWithdrawal();
    inspection = { status: 'pending' };
    const inspect = vi.fn().mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({
      status: 'finalized_success', destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano, txHash: 'final-after-send', actualFeeNano: '600000',
    });
    client.inspectTransaction = inspect;
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'final-after-send' });
    await worker.start(); await worker.stop();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(broadcasts).toEqual(['scenario-payload']);
    expect(row).toMatchObject({ status: 'completed', tx_hash: 'final-after-send' });
  });

  it('reports worker health as stale after three polling intervals without a fresh check', async () => {
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'stale-health' });
    await worker.start();
    expect(worker.getHealth().ready).toBe(true);
    vi.setSystemTime(new Date(Date.now() + 15_001));
    expect(worker.getHealth().ready).toBe(false);
    await worker.stop();
  });

  it('ignores overlapping polls while one wallet health request is still running', async () => {
    await confirmedWithdrawal();
    let releaseBalance!: (balance: bigint) => void;
    const heldBalance = new Promise<bigint>((resolve) => { releaseBalance = resolve; });
    const balance = vi.fn(() => heldBalance);
    client.getBalance = balance;
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'poll-overlap' });
    const firstPoll = worker.start();
    await Promise.resolve();
    await worker.pollOnce();
    expect(balance).toHaveBeenCalledTimes(1);
    releaseBalance(10_000_000_000n);
    await firstPoll;
    await worker.stop();
    expect(balance).toHaveBeenCalledTimes(2); // health check and reserve check within the single poll
  });

  it('does not notify completion when finalization rejects the worker fencing token', async () => {
    await confirmedWithdrawal();
    inspection = { status: 'finalized_success', destination: wallet, amountNano: '1999000000', txHash: 'fenced-final', actualFeeNano: '500000' };
    vi.spyOn(storage, 'finalizeWithdrawalPayout').mockResolvedValue({ success: false, error: 'stale worker' } as any);
    const onStatus = vi.fn();
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'fenced-finalizer', onStatus });
    await worker.start(); await worker.stop();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it.each(expandedInvalidConfigCases)('rejects payout configuration with %s', (_label, mutate, message) => {
    const env = validEnv();
    mutate(env);
    expect(() => loadWithdrawalWorkerConfig(env)).toThrow(message);
  });

  it('does not run an explicitly disabled worker', async () => {
    const getBalance = vi.spyOn(client, 'getBalance');
    const worker = new WithdrawalPayoutWorker({ storage, client, config: { ...loadWithdrawalWorkerConfig()!, enabled: false } });
    await worker.start();
    expect(getBalance).not.toHaveBeenCalled();
    expect(worker.getHealth()).toMatchObject({ ready: false, enabled: false });
    await worker.stop();
  });

  it('marks worker health unready after it is stopped', async () => {
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start();
    expect(worker.getHealth().ready).toBe(true);
    await worker.stop();
    expect(worker.getHealth().ready).toBe(false);
  });

  it('does not prepare a transfer when no withdrawals are queued', async () => {
    const prepare = vi.spyOn(client, 'prepareSignedTransfer');
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start(); await worker.stop();
    expect(prepare).not.toHaveBeenCalled();
    expect(broadcasts).toHaveLength(0);
  });

  it('does not sign a withdrawal that is not payout eligible', async () => {
    const withdrawal = await confirmedWithdrawal();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    row.payout_eligible = false;
    const prepare = vi.spyOn(client, 'prepareSignedTransfer');
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start(); await worker.stop();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('records a health error and leaves work untouched when balance lookup fails', async () => {
    const withdrawal = await confirmedWithdrawal();
    client.getBalance = vi.fn().mockRejectedValue(new Error('balance RPC failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(worker.getHealth()).toMatchObject({ ready: false, lastError: 'balance RPC failed' });
    expect(row.status).toBe('pending');
    await worker.stop();
  });

  it('retains the encrypted payload and does not broadcast when transaction inspection fails', async () => {
    const withdrawal = await confirmedWithdrawal();
    client.inspectTransaction = vi.fn().mockRejectedValue(new Error('indexer timeout'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start(); await worker.stop();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(row.status).toBe('processing');
    expect(row.signed_payload_ciphertext).toBeDefined();
    expect(broadcasts).toHaveLength(0);
  });

  it('settles after a broadcast timeout when the follow-up inspection finds finalized success', async () => {
    const withdrawal = await confirmedWithdrawal();
    const inspect = vi.fn().mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({
      status: 'finalized_success', destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano,
      txHash: 'success-after-timeout', actualFeeNano: '450000',
    });
    client.inspectTransaction = inspect;
    client.broadcast = vi.fn().mockRejectedValue(new Error('timed out after acceptance'));
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start(); await worker.stop();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(row).toMatchObject({ status: 'completed', tx_hash: 'success-after-timeout' });
  });

  it('refunds after a broadcast timeout only when follow-up inspection proves finalized failure', async () => {
    const withdrawal = await confirmedWithdrawal();
    const inspect = vi.fn().mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'finalized_failure', evidenceHash: 'timeout-final-failure' });
    client.inspectTransaction = inspect;
    client.broadcast = vi.fn().mockRejectedValue(new Error('response lost'));
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start(); await worker.stop();
    const db = DatabasePool.getInstance();
    const row = (db as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    const user = db.getUserByTelegramId(Number(withdrawal.telegram_id))!;
    expect(row.status).toBe('failed');
    expect(user.balance_nano).toBe('5000000000');
    expect(db.getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'withdrawal_refund')).toHaveLength(1);
  });

  it('does not refund after a broadcast timeout when follow-up inspection stays unknown', async () => {
    const withdrawal = await confirmedWithdrawal();
    client.inspectTransaction = vi.fn().mockResolvedValueOnce({ status: 'pending' }).mockResolvedValueOnce({ status: 'unknown' });
    client.broadcast = vi.fn().mockRejectedValue(new Error('response lost'));
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start(); await worker.stop();
    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(Number(withdrawal.telegram_id))!;
    expect((db as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id).status).toBe('processing');
    expect(user.balance_nano).toBe('3000000000');
    expect(db.getTransactionsForUser(user.id).filter((tx: any) => tx.type === 'withdrawal_refund')).toHaveLength(0);
  });

  it('does not rebroadcast a persisted signed payload after its validity window expires', async () => {
    const withdrawal = await confirmedWithdrawal();
    const config = loadWithdrawalWorkerConfig()!;
    const first = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'expired-payload-first' });
    await first.start(); await first.stop();
    expect(broadcasts).toHaveLength(1);
    vi.setSystemTime(new Date(Date.now() + 70_000));
    const second = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'expired-payload-recovery' });
    await second.start(); await second.stop();
    expect(broadcasts).toHaveLength(1);
    expect((DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id).status).toBe('processing');
  });

  it('settles an expired payload if inspection already reports finalized success', async () => {
    const withdrawal = await confirmedWithdrawal();
    const config = loadWithdrawalWorkerConfig()!;
    const first = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'expired-final-first' });
    await first.start(); await first.stop();
    vi.setSystemTime(new Date(Date.now() + 70_000));
    inspection = { status: 'finalized_success', destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano, txHash: 'late-final-success', actualFeeNano: '400000' };
    const second = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'expired-final-recovery' });
    await second.start(); await second.stop();
    expect(broadcasts).toHaveLength(1);
    expect((DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id)).toMatchObject({ status: 'completed', tx_hash: 'late-final-success' });
  });

  it('fails closed on authenticated ciphertext tampering during recovery', async () => {
    const withdrawal = await confirmedWithdrawal();
    const config = loadWithdrawalWorkerConfig()!;
    const first = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'tamper-first' });
    await first.start(); await first.stop();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    row.signed_payload_ciphertext = Buffer.from(row.signed_payload_ciphertext);
    row.signed_payload_ciphertext[0] ^= 0xff;
    vi.setSystemTime(new Date(Date.now() + config.leaseMs + 1));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'tamper-recovery' });
    await second.start(); await second.stop();
    expect(broadcasts).toEqual(['scenario-payload']);
    expect(row.status).toBe('processing');
  });

  it('fails closed when signed payload metadata no longer matches the stored payout hash', async () => {
    const withdrawal = await confirmedWithdrawal();
    const config = loadWithdrawalWorkerConfig()!;
    const first = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'metadata-first' });
    await first.start(); await first.stop();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    row.payout_message_hash = 'different-hash';
    vi.setSystemTime(new Date(Date.now() + config.leaseMs + 1));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'metadata-recovery' });
    await second.start(); await second.stop();
    expect(broadcasts).toEqual(['scenario-payload']);
    expect(row.status).toBe('processing');
  });

  it('leaves a finalized transfer processing when its reported network fee is negative', async () => {
    const withdrawal = await confirmedWithdrawal();
    inspection = { status: 'finalized_success', destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano, txHash: 'negative-fee', actualFeeNano: '-1' };
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start(); await worker.stop();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(row.status).toBe('processing');
    expect(row.tx_hash).toBeUndefined();
  });

  it('keeps a committed payout completed if the optional status callback throws', async () => {
    const withdrawal = await confirmedWithdrawal();
    inspection = { status: 'finalized_success', destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano, txHash: 'callback-error-final', actualFeeNano: '0' };
    const callback = vi.fn().mockRejectedValue(new Error('notification unavailable'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, onStatus: callback });
    await worker.start();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(row).toMatchObject({ status: 'completed', tx_hash: 'callback-error-final' });
    expect(worker.getHealth()).toMatchObject({ ready: false, lastError: 'notification unavailable' });
    await worker.stop();
  });

  it('waits for an asynchronous status callback before completing startup polling', async () => {
    const withdrawal = await confirmedWithdrawal();
    inspection = { status: 'finalized_success', destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano, txHash: 'async-callback-final', actualFeeNano: '1' };
    let releaseCallback!: () => void;
    const callbackGate = new Promise<void>((resolve) => { releaseCallback = resolve; });
    const callback = vi.fn(() => callbackGate);
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, onStatus: callback });
    let startFinished = false;
    const start = worker.start().then(() => { startFinished = true; });
    for (let i = 0; i < 30 && callback.mock.calls.length === 0; i += 1) await Promise.resolve();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(startFinished).toBe(false);
    releaseCallback();
    await start;
    await worker.stop();
  });

  it('creates only one polling loop if start is called repeatedly', async () => {
    const getBalance = vi.spyOn(client, 'getBalance');
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start();
    await worker.start();
    expect(getBalance).toHaveBeenCalledTimes(1);
    await worker.stop();
  });

  it('does not poll again after stop even if pollOnce is called manually', async () => {
    const getBalance = vi.spyOn(client, 'getBalance');
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start();
    await worker.stop();
    await worker.pollOnce();
    expect(getBalance).toHaveBeenCalledTimes(1);
  });

  it('processes a newly queued withdrawal on the next scheduled poll', async () => {
    const config = loadWithdrawalWorkerConfig()!;
    const worker = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'scheduled-poll' });
    await worker.start();
    const withdrawal = await confirmedWithdrawal();
    inspection = { status: 'finalized_success', destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano, txHash: 'scheduled-final', actualFeeNano: '1' };
    await vi.advanceTimersByTimeAsync(config.pollMs);
    await worker.stop();
    const row = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(row).toMatchObject({ status: 'completed', tx_hash: 'scheduled-final' });
  });

  it('reaches finalized failure without broadcasting when it is known before send', async () => {
    const withdrawal = await confirmedWithdrawal();
    inspection = { status: 'finalized_failure', evidenceHash: 'known-failure-before-send' };
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()! });
    await worker.start(); await worker.stop();
    expect(broadcasts).toHaveLength(0);
    expect((DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id).status).toBe('failed');
  });
});
