import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Address } from '@ton/core';
import { DatabasePool } from '../../../server/db';
import { StorageService } from '../../../server/storage';
import { loadWithdrawalWorkerConfig, TonWithdrawalPayoutClient, tonCenterMessageIsMasterchainFinalized, WithdrawalPayoutWorker } from '../../../server/withdrawalPayout';

const wallet = 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz';
let nextTelegramId = 779900;

describe('mainnet withdrawal payout worker', () => {
  let storage: StorageService;
  let client: TonWithdrawalPayoutClient;
  let broadcasts: string[];
  let inspection: any;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('PAYOUT_NETWORK', 'mainnet');
    vi.stubEnv('PAYOUT_MIN_WITHDRAWAL_NANO', '100000000');
    vi.stubEnv('PAYOUT_MAX_WITHDRAWAL_NANO', '5000000000');
    vi.stubEnv('PAYOUT_USER_DAILY_LIMIT_NANO', '6000000000');
    vi.stubEnv('PAYOUT_GLOBAL_DAILY_LIMIT_NANO', '20000000000');
    vi.stubEnv('PAYOUT_WORKER_ENABLED', 'true');
    vi.stubEnv('TONCENTER_API_URL', 'https://toncenter.com');
    vi.stubEnv('PAYOUT_SIGNER_MNEMONIC', 'secret phrase is not read by these tests');
    vi.stubEnv('PAYOUT_WALLET_RESERVE_NANO', '100000000');
    vi.stubEnv('PAYOUT_TRANSACTION_ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('hex'));
    storage = new StorageService();
    DatabasePool.getInstance().resetInMemoryWithdrawalStateForTests();
    broadcasts = [];
    inspection = { status: 'pending' };
    client = {
      address: wallet,
      estimateFee: async () => 1_000_000n,
      getBalance: async () => 10_000_000_000n,
      getSeqno: async () => 12,
      prepareSignedTransfer: async ({ seqno, validUntil }) => ({
        boc: 'same-signed-payload', messageHash: 'signed-hash', seqno, validUntil,
      }),
      broadcast: async (tx) => { broadcasts.push(tx.boc); throw new Error('response lost'); },
      inspectTransaction: async () => inspection,
    };
  });

  afterEach(() => {
    vi.useRealTimers(); vi.unstubAllEnvs();
  });

  it('requires masterchain inclusion for both sender and recipient message lookups', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ transactions: [
      { account: Address.parse(wallet).toRawString(), mc_block_seqno: 0 },
    ] }), { status: 200 }));
    const input = { endpoint: new URL('https://toncenter.com/jsonRPC'), messageHash: 'message-hash', account: Address.parse(wallet), fetcher: fetcher as typeof fetch };

    expect(await tonCenterMessageIsMasterchainFinalized(input)).toBe(false);
    expect(new URL(String(fetcher.mock.calls[0][0])).pathname).toBe('/api/v3/transactionsByMessage');
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get('msg_hash')).toBe('message-hash');

    fetcher.mockImplementationOnce(async () => new Response(JSON.stringify({ transactions: [
      { account: Address.parse(wallet).toRawString(), mc_block_seqno: '42' },
    ] }), { status: 200 }));
    expect(await tonCenterMessageIsMasterchainFinalized({ ...input, queryByBody: true })).toBe(true);
    expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get('body_hash')).toBe('message-hash');
  });

  async function confirmedWithdrawal() {
    const telegramId = nextTelegramId++;
    await storage.getOrCreateUser({ id: telegramId, first_name: 'Payout' });
    const db = DatabasePool.getInstance();
    const user = db.getUserByTelegramId(telegramId)!;
    user.balance_nano = '5000000000'; user.balance_gram = 5; db.saveUser(user);
    const quote = await storage.createWithdrawalQuote({
      telegramId, walletAddress: wallet, grossAmountNano: '2000000000', feeNano: '1000000', network: 'mainnet',
    });
    if (!quote.success) throw new Error('Quote failed');
    const result = await storage.confirmWithdrawalQuote({ telegramId, quoteId: quote.quote.quoteId, operationKey: `worker-test-${telegramId}` });
    if (!result.success) throw new Error('Confirmation failed');
    return result.withdrawal;
  }

  it('requires explicit mainnet configuration and valid secrets when enabled', () => {
    expect(loadWithdrawalWorkerConfig({ PAYOUT_WORKER_ENABLED: 'false' })).toBeNull();
    expect(() => loadWithdrawalWorkerConfig({ PAYOUT_WORKER_ENABLED: 'true', PAYOUT_NETWORK: 'testnet' })).toThrow('mainnet');
  });

  it('persists encrypted signed bytes before broadcast and reuses them after restart', async () => {
    const withdrawal = await confirmedWithdrawal();
    const config = loadWithdrawalWorkerConfig()!;
    const worker = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'worker-one' });
    await worker.start();
    await worker.stop();
    expect(broadcasts).toEqual(['same-signed-payload']);
    const db = DatabasePool.getInstance();
    const stored = db.getTransactionsForUser(db.getUserByTelegramId(Number(withdrawal.telegram_id))!.id);
    expect(stored).toHaveLength(1);
    const firstRow = (DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id);
    expect(Buffer.from(firstRow.signed_payload_ciphertext).toString('utf8')).not.toContain('same-signed-payload');

    vi.setSystemTime(new Date(Date.now() + config.leaseMs + 1));
    const restarted = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'worker-two' });
    await restarted.start();
    await restarted.stop();
    expect(broadcasts).toEqual(['same-signed-payload', 'same-signed-payload']);
    expect(firstRow.payout_attempt_count).toBe(2);
  });

  it('settles only a finalized exact transfer and reports the stored state', async () => {
    const withdrawal = await confirmedWithdrawal();
    inspection = {
      status: 'finalized_success', destination: withdrawal.wallet_address, amountNano: withdrawal.net_amount_nano,
      txHash: 'final-hash', actualFeeNano: '400000',
    };
    const updates: any[] = [];
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, onStatus: (w) => { updates.push(w); } });
    await worker.start();
    await worker.stop();
    expect(updates[0]).toMatchObject({ id: withdrawal.id, status: 'completed', tx_hash: 'final-hash' });
    expect((DatabasePool.getInstance() as any).inMemoryDb.get('withdrawals').find((item: any) => item.id === withdrawal.id).status).toBe('completed');
  });

  it('does not rebroadcast or create a replacement after the signed message expires', async () => {
    await confirmedWithdrawal();
    const config = loadWithdrawalWorkerConfig()!;
    const prepare = vi.spyOn(client, 'prepareSignedTransfer');
    const first = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'expiry-one' });
    await first.start();
    await first.stop();
    vi.setSystemTime(new Date(Date.now() + 70_000));
    const restarted = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'expiry-two' });
    await restarted.start();
    await restarted.stop();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(broadcasts).toEqual(['same-signed-payload']);
  });

  it('fails closed when the deployment encryption key cannot decrypt a persisted payload', async () => {
    await confirmedWithdrawal();
    const config = loadWithdrawalWorkerConfig()!;
    const prepare = vi.spyOn(client, 'prepareSignedTransfer');
    const first = new WithdrawalPayoutWorker({ storage, client, config, workerId: 'key-one' });
    await first.start();
    await first.stop();
    vi.setSystemTime(new Date(Date.now() + config.leaseMs + 1));
    const wrongKey = { ...config, encryptionKey: Buffer.alloc(32, 9) };
    const restarted = new WithdrawalPayoutWorker({ storage, client, config: wrongKey, workerId: 'key-two' });
    await restarted.start();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(broadcasts).toEqual(['same-signed-payload']);
    await restarted.stop();
  });

  it('keeps new confirmations unavailable when the Mainnet RPC health check fails', async () => {
    client.getBalance = vi.fn().mockRejectedValue(new Error('RPC unavailable'));
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'rpc-down' });
    await worker.start();
    expect(worker.getHealth().ready).toBe(false);
    await worker.stop();
  });

  it('does not sign or broadcast below the payout wallet reserve', async () => {
    await confirmedWithdrawal();
    client.getBalance = vi.fn().mockResolvedValue(2_000_000_000n);
    const prepare = vi.spyOn(client, 'prepareSignedTransfer');
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'low-reserve' });
    await worker.start();
    await worker.stop();
    expect(prepare).not.toHaveBeenCalled();
    expect(broadcasts).toHaveLength(0);
  });

  it('refunds a finalized failure once through the worker', async () => {
    const withdrawal = await confirmedWithdrawal();
    inspection = { status: 'finalized_failure', evidenceHash: 'finalized-failure-evidence' };
    const worker = new WithdrawalPayoutWorker({ storage, client, config: loadWithdrawalWorkerConfig()!, workerId: 'failure-worker' });
    await worker.start();
    await worker.stop();
    const db = DatabasePool.getInstance();
    expect(db.getUserByTelegramId(Number(withdrawal.telegram_id))?.balance_nano).toBe('5000000000');
    expect(db.getTransactionsForUser(db.getUserByTelegramId(Number(withdrawal.telegram_id))!.id).filter((tx: any) => tx.type === 'withdrawal_refund')).toHaveLength(1);
  });
});
