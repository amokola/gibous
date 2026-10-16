import crypto from 'node:crypto';
import { Address, beginCell, Cell, MessageRelaxed, storeMessage } from '@ton/core';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { internal, SendMode, TonClient, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton';
import { StorageService } from './storage';

export type SignedPayoutTransaction = {
  boc: string;
  messageHash: string;
  seqno: number;
  validUntil: number;
};

export type PayoutInspection =
  | { status: 'pending' | 'unknown' }
  | { status: 'finalized_success'; destination: string; amountNano: string; txHash: string; actualFeeNano: string }
  | { status: 'finalized_failure'; evidenceHash: string };

export interface TonWithdrawalPayoutClient {
  readonly address: string;
  estimateFee(input: { destination: string; amountNano: string; memo: string }): Promise<bigint>;
  getBalance(): Promise<bigint>;
  getSeqno(): Promise<number>;
  prepareSignedTransfer(input: { destination: string; amountNano: string; memo: string; seqno: number; validUntil: number }): Promise<SignedPayoutTransaction>;
  broadcast(transaction: SignedPayoutTransaction): Promise<void>;
  inspectTransaction(input: { messageHash: string; seqno: number }): Promise<PayoutInspection>;
}

export type WithdrawalWorkerConfig = {
  enabled: boolean;
  network: 'mainnet';
  reserveNano: bigint;
  encryptionKey: Buffer;
  leaseMs: number;
  pollMs: number;
  transactionLifetimeSeconds: number;
};

export async function tonCenterMessageIsMasterchainFinalized(input: {
  endpoint: URL;
  apiKey?: string;
  messageHash: string;
  account: Address;
  queryByBody?: boolean;
  fetcher?: typeof fetch;
}): Promise<boolean> {
  const url = new URL('/api/v3/transactionsByMessage', input.endpoint.origin);
  url.searchParams.set(input.queryByBody ? 'body_hash' : 'msg_hash', input.messageHash);
  url.searchParams.set('direction', 'in');
  url.searchParams.set('limit', '10');
  const response = await (input.fetcher || fetch)(url, {
    headers: input.apiKey ? { 'X-API-Key': input.apiKey } : undefined,
  });
  if (!response.ok) throw new Error(`TON Mainnet finality query failed (${response.status})`);
  const data = await response.json() as { transactions?: Array<{ account?: string; mc_block_seqno?: number | string }> };
  return (data.transactions || []).some((transaction) => {
    if (!transaction?.account) return false;
    const seqno = transaction.mc_block_seqno;
    const hasFinalizedSeqno = typeof seqno === 'number'
      ? Number.isSafeInteger(seqno) && seqno > 0
      : typeof seqno === 'string' && /^\d+$/.test(seqno) && BigInt(seqno) > 0n;
    if (!hasFinalizedSeqno) return false;
    try { return Address.parse(transaction.account).equals(input.account); } catch { return false; }
  });
}

export function loadWithdrawalWorkerConfig(env: Record<string, string | undefined> = process.env): WithdrawalWorkerConfig | null {
  if (env.PAYOUT_WORKER_ENABLED !== 'true') return null;
  if (env.PAYOUT_NETWORK !== 'mainnet') throw new Error('PAYOUT_NETWORK must be mainnet when payouts are enabled');
  if (!env.TONCENTER_API_URL || !env.PAYOUT_SIGNER_MNEMONIC) throw new Error('Mainnet payout RPC and signer secrets are required');
  const reserveText = env.PAYOUT_WALLET_RESERVE_NANO;
  const keyText = env.PAYOUT_TRANSACTION_ENCRYPTION_KEY;
  if (!reserveText || !/^\d+$/.test(reserveText) || BigInt(reserveText) <= 0n || !keyText) throw new Error('Payout reserve and transaction encryption key are required');
  const key = /^[0-9a-fA-F]{64}$/.test(keyText) ? Buffer.from(keyText, 'hex') : Buffer.from(keyText, 'base64');
  if (key.length !== 32) throw new Error('PAYOUT_TRANSACTION_ENCRYPTION_KEY must encode exactly 32 bytes');
  for (const name of ['PAYOUT_MIN_WITHDRAWAL_NANO', 'PAYOUT_MAX_WITHDRAWAL_NANO', 'PAYOUT_USER_DAILY_LIMIT_NANO']) {
    if (!env[name] || !/^\d+$/.test(env[name]! ) || BigInt(env[name]!) <= 0n) throw new Error(`${name} must be a positive integer`);
  }
  if (BigInt(env.PAYOUT_MAX_WITHDRAWAL_NANO!) < BigInt(env.PAYOUT_MIN_WITHDRAWAL_NANO!)) throw new Error('Payout maximum must be at least the minimum');
  return {
    enabled: true,
    network: 'mainnet',
    reserveNano: BigInt(reserveText),
    encryptionKey: key,
    leaseMs: 30_000,
    pollMs: 5_000,
    transactionLifetimeSeconds: 60,
  };
}

export type PayoutWalletVersion = 'v5r1' | 'v4r2' | 'v3r2';
export type PayoutWalletContract = WalletContractV5R1 | WalletContractV4 | WalletContractV3R2;

type PayoutTransferArgs = {
  seqno: number;
  secretKey: Buffer;
  messages: MessageRelaxed[];
  sendMode: SendMode;
  timeout: number;
};

/**
 * Wallet contract factories ordered newest-first. A mnemonic always derives the same keypair, but the
 * on-chain address depends on the wallet contract version, so we detect which version owns the
 * configured payout address instead of assuming V4R2.
 */
export const PAYOUT_WALLET_FACTORIES: ReadonlyArray<{ version: PayoutWalletVersion; create: (publicKey: Buffer) => PayoutWalletContract }> = [
  { version: 'v5r1', create: (publicKey) => WalletContractV5R1.create({ workchain: 0, publicKey }) },
  { version: 'v4r2', create: (publicKey) => WalletContractV4.create({ workchain: 0, publicKey }) },
  { version: 'v3r2', create: (publicKey) => WalletContractV3R2.create({ workchain: 0, publicKey }) },
];

/** Every supported wallet version shares the same signed-transfer argument shape. */
export function createPayoutTransfer(wallet: PayoutWalletContract, args: PayoutTransferArgs): Cell {
  return (wallet as WalletContractV4).createTransfer(args);
}

export function selectPayoutWallet(publicKey: Buffer, expectedAddress: Address): { version: PayoutWalletVersion; wallet: PayoutWalletContract } {
  const candidates = PAYOUT_WALLET_FACTORIES.map(({ version, create }) => ({ version, wallet: create(publicKey) }));
  const matched = candidates.find((candidate) => candidate.wallet.address.equals(expectedAddress));
  if (!matched) {
    const derived = candidates.map((candidate) => `${candidate.version}=${candidate.wallet.address.toRawString()}`).join(', ');
    throw new Error(`Payout signer does not match PAYOUT_WALLET_ADDRESS (derived from mnemonic: ${derived})`);
  }
  return matched;
}

export async function createMainnetTonWithdrawalClient(env: Record<string, string | undefined> = process.env): Promise<TonWithdrawalPayoutClient> {
  if (env.PAYOUT_NETWORK !== 'mainnet') throw new Error('Only TON Mainnet is supported for payouts');
  const endpointText = env.TONCENTER_API_URL;
  const mnemonicText = env.PAYOUT_SIGNER_MNEMONIC;
  if (!endpointText || !mnemonicText) throw new Error('TONCENTER_API_URL and payout signer mnemonic are required');
  const endpoint = new URL(endpointText);
  if (endpoint.protocol !== 'https:' || endpoint.hostname.toLowerCase().includes('testnet')) throw new Error('Payout RPC must be a TON Mainnet HTTPS endpoint');
  const expected = env.PAYOUT_WALLET_ADDRESS;
  if (!expected) throw new Error('PAYOUT_WALLET_ADDRESS is required for mainnet payouts');
  let expectedAddress: Address;
  try {
    expectedAddress = Address.parse(expected);
  } catch {
    throw new Error('PAYOUT_WALLET_ADDRESS is not a valid TON address');
  }
  const keyPair = await mnemonicToPrivateKey(mnemonicText.trim().split(/\s+/));
  const { wallet } = selectPayoutWallet(keyPair.publicKey, expectedAddress);
  const endpointUrl = endpoint.toString().replace(/\/$/, '').endsWith('/jsonRPC') ? endpoint.toString() : `${endpoint.toString().replace(/\/$/, '')}/jsonRPC`;
  const client = new TonClient({ endpoint: endpointUrl, apiKey: env.TONCENTER_API_KEY || undefined });
  const openedWallet = client.open(wallet as WalletContractV4);
  const canonicalAddress = wallet.address.toString({ urlSafe: true, bounceable: true, testOnly: false });
  const isMasterchainFinalized = (messageHash: string, account: Address, queryByBody = false) =>
    tonCenterMessageIsMasterchainFinalized({ endpoint, apiKey: env.TONCENTER_API_KEY, messageHash, account, queryByBody });
  const makeMessage = (destination: string, amountNano: string, memo: string) => internal({
    to: Address.parse(destination), value: BigInt(amountNano), body: beginCell().storeUint(0, 32).storeStringTail(memo).endCell(),
  });
  return {
    address: canonicalAddress,
    estimateFee: async ({ destination, amountNano, memo }) => {
      const transfer = createPayoutTransfer(wallet, {
        seqno: 0, secretKey: keyPair.secretKey, timeout: Math.floor(Date.now() / 1000) + 60,
        sendMode: SendMode.PAY_GAS_SEPARATELY, messages: [makeMessage(destination, amountNano, memo)],
      });
      const estimate = await client.estimateExternalMessageFee(wallet.address, {
        body: transfer, initCode: wallet.init.code, initData: wallet.init.data, ignoreSignature: false,
      });
      const fees = estimate.source_fees;
      return BigInt(fees.in_fwd_fee + fees.storage_fee + fees.gas_fee + fees.fwd_fee);
    },
    getBalance: () => openedWallet.getBalance(),
    getSeqno: () => openedWallet.getSeqno(),
    prepareSignedTransfer: async ({ destination, amountNano, memo, seqno, validUntil }) => {
      const body = createPayoutTransfer(wallet, {
        seqno, secretKey: keyPair.secretKey, timeout: validUntil,
        sendMode: SendMode.PAY_GAS_SEPARATELY, messages: [makeMessage(destination, amountNano, memo)],
      });
      return { boc: body.toBoc().toString('base64'), messageHash: body.hash().toString('hex'), seqno, validUntil };
    },
    broadcast: async (transaction) => { await client.sendFile(Buffer.from(transaction.boc, 'base64')); },
    inspectTransaction: async ({ messageHash, seqno }) => {
      const txs = await client.getTransactions(wallet.address, { limit: 20 });
      const tx = txs.find((item) => item.inMessage?.body.hash().toString('hex') === messageHash || item.hash().toString('hex') === messageHash);
      if (!tx) {
        const currentSeqno = await openedWallet.getSeqno();
        return currentSeqno > seqno ? { status: 'unknown' } : { status: 'pending' };
      }
      if (!tx.inMessage || !await isMasterchainFinalized(tx.inMessage.body.hash().toString('hex'), wallet.address, true)) {
        return { status: 'pending' };
      }
      if (tx.description.type !== 'generic') return { status: 'unknown' };
      const action = tx.description.actionPhase;
      if (tx.description.aborted || !action || !action.success) {
        return { status: 'finalized_failure', evidenceHash: tx.hash().toString('hex') };
      }
      const expected = Address.parse(canonicalAddress);
      const outgoing = [...tx.outMessages.values()].find((message) => message.info.type === 'internal' && message.info.src.equals(expected));
      if (!outgoing || outgoing.info.type !== 'internal') return { status: 'finalized_failure', evidenceHash: tx.hash().toString('hex') };
      let recipientTransaction;
      try {
        recipientTransaction = await client.tryLocateResultTx(expected, outgoing.info.dest, outgoing.info.createdLt.toString());
      } catch {
        return { status: 'pending' };
      }
      const outgoingMessageHash = beginCell().store(storeMessage(outgoing)).endCell().hash().toString('hex');
      if (!await isMasterchainFinalized(outgoingMessageHash, outgoing.info.dest)) return { status: 'pending' };
      const received = recipientTransaction?.inMessage;
      if (!received || received.info.type !== 'internal' || received.info.bounced) return { status: 'unknown' };
      if (recipientTransaction.description.type !== 'generic' || recipientTransaction.description.aborted ||
          Boolean(recipientTransaction.description.bouncePhase)) return { status: 'unknown' };
      return {
        status: 'finalized_success',
        destination: outgoing.info.dest.toString({ urlSafe: true, bounceable: true, testOnly: false }),
        amountNano: outgoing.info.value.coins.toString(),
        txHash: tx.hash().toString('hex'),
        actualFeeNano: tx.totalFees.coins.toString(),
      };
    },
  };
}

export class WithdrawalPayoutWorker {
  private readonly storage: StorageService;
  private readonly client: TonWithdrawalPayoutClient;
  private readonly config: WithdrawalWorkerConfig;
  private readonly workerId: string;
  private readonly onStatus?: (withdrawal: any) => void | Promise<void>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private stopped = true;
  private lastHealthCheckAt = 0;
  private lastError: string | null = null;

  constructor(input: { storage: StorageService; client: TonWithdrawalPayoutClient; config: WithdrawalWorkerConfig; workerId?: string; onStatus?: (withdrawal: any) => void | Promise<void> }) {
    this.storage = input.storage; this.client = input.client; this.config = input.config;
    this.workerId = input.workerId || crypto.randomUUID(); this.onStatus = input.onStatus;
  }

  async start() {
    if (!this.config.enabled || this.timer) return;
    this.stopped = false;
    await this.pollOnce();
    if (this.stopped) return;
    this.timer = setInterval(() => void this.pollOnce(), this.config.pollMs);
    this.timer.unref?.();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 10));
  }

  getHealth() {
    const ready = this.config.enabled && !this.stopped && !this.lastError && Date.now() - this.lastHealthCheckAt <= this.config.pollMs * 3;
    return { ready, enabled: this.config.enabled, lastHealthCheckAt: this.lastHealthCheckAt || null, lastError: this.lastError };
  }

  async pollOnce() {
    if (this.running || this.stopped || !this.config.enabled) return;
    this.running = true;
    try {
      await this.client.getBalance();
      await this.client.getSeqno();
      this.lastHealthCheckAt = Date.now();
      this.lastError = null;
      const claim = await this.storage.claimNextWithdrawalPayout(this.workerId, this.config.leaseMs);
      if (!claim) return;
      const withdrawal = claim.withdrawal;
      const payout = withdrawal.signed_payload_ciphertext
        ? this.decryptPayload(withdrawal)
        : await this.prepare(claim);
      if (!payout) return;
      let observed = await this.client.inspectTransaction({ messageHash: payout.messageHash, seqno: payout.seqno });
      if ((observed.status === 'pending' || observed.status === 'unknown') && payout.validUntil > Math.floor(Date.now() / 1000)) {
        try { await this.client.broadcast(payout); } catch { /* A send timeout is ambiguous; reconcile this same payload. */ }
        observed = await this.client.inspectTransaction({ messageHash: payout.messageHash, seqno: payout.seqno });
      }
      if (observed.status === 'finalized_success') {
        const result = await this.storage.finalizeWithdrawalPayout({
          withdrawalId: withdrawal.id, workerId: this.workerId, fencingToken: claim.fencingToken,
          finalized: true, destination: observed.destination, amountNano: observed.amountNano,
          txHash: observed.txHash, actualFeeNano: observed.actualFeeNano,
        });
        if (result.success) await this.onStatus?.({ ...withdrawal, status: 'completed', tx_hash: observed.txHash });
      } else if (observed.status === 'finalized_failure') {
        const result = await this.storage.refundFailedWithdrawal({
          withdrawalId: withdrawal.id, workerId: this.workerId, fencingToken: claim.fencingToken,
          finalizedFailure: true, evidenceHash: observed.evidenceHash,
        });
        if (result.success && result.refunded) await this.onStatus?.({ ...withdrawal, status: 'failed' });
      }
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'unknown error';
      console.error('Withdrawal payout attempt failed:', error instanceof Error ? error.message : 'unknown error');
      // Preserve the durable claim/payload for lease-expiry recovery; never refund ambiguous failures.
    } finally {
      this.running = false;
    }
  }

  private async prepare(claim: any): Promise<SignedPayoutTransaction | null> {
    const w = claim.withdrawal;
    const amountNano = BigInt(String(w.net_amount_nano));
    const estimatedFee = BigInt(String(w.fee_nano));
    const walletBalance = await this.client.getBalance();
    if (walletBalance < amountNano + estimatedFee + this.config.reserveNano) return null;
    const seqno = await this.client.getSeqno();
    const validUntil = Math.floor(Date.now() / 1000) + this.config.transactionLifetimeSeconds;
    const signed = await this.client.prepareSignedTransfer({
      destination: w.wallet_address, amountNano: amountNano.toString(), memo: w.memo, seqno, validUntil,
    });
    const encrypted = this.encryptPayload(signed);
    const persisted = await this.storage.persistSignedWithdrawalPayload({
      withdrawalId: w.id, workerId: this.workerId, fencingToken: claim.fencingToken,
      ...encrypted, seqno, validUntil, messageHash: signed.messageHash,
    });
    return persisted ? signed : null;
  }

  private encryptPayload(payload: SignedPayoutTransaction) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.config.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return { ciphertext, iv, tag: cipher.getAuthTag() };
  }

  private decryptPayload(withdrawal: any): SignedPayoutTransaction {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.config.encryptionKey, Buffer.from(withdrawal.signed_payload_iv));
    decipher.setAuthTag(Buffer.from(withdrawal.signed_payload_tag));
    const json = Buffer.concat([
      decipher.update(Buffer.from(withdrawal.signed_payload_ciphertext)), decipher.final(),
    ]).toString('utf8');
    const payload = JSON.parse(json) as SignedPayoutTransaction;
    if (payload.messageHash !== withdrawal.payout_message_hash || payload.seqno !== Number(withdrawal.payout_seqno) || payload.validUntil !== Number(withdrawal.payout_valid_until)) {
      throw new Error('Persisted payout payload metadata does not match');
    }
    return payload;
  }
}
