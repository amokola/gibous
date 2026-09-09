import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { connectionManager } from './connectionManager';
import { StorageService, PendingDepositIntent } from './storage';
import { validateMainnetTonConfig } from './tonConfig';
import { metrics } from './observability';

/**
 * Verifies native TON transfers after TON Connect returns a signed BoC.
 * The BoC is retained as an audit/idempotency key; funds are only credited
 * after an indexer reports a matching wallet -> configured vault transfer.
 */
function extractComment(bodyCell: any): string | null {
  try {
    if (!bodyCell) return null;
    const slice = bodyCell.beginParse();
    if (slice.remainingBits < 32) return null;
    const op = slice.loadUint(32);
    if (op === 0) {
      return slice.loadStringTail();
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeToncenterEndpoint(url: string): string {
  let trimmed = url.trim();
  if (trimmed.endsWith('/')) {
    trimmed = trimmed.slice(0, -1);
  }
  if (!trimmed.endsWith('/jsonRPC')) {
    trimmed = `${trimmed}/jsonRPC`;
  }
  return trimmed;
}

export class DepositVerificationService {
  private readonly storage: StorageService;
  private readonly client: TonClient | null;
  private readonly vaultAddress: Address | null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;

  constructor(storage: StorageService) {
    this.storage = storage;

    if (process.env.NODE_ENV === 'production') {
      const issues = validateMainnetTonConfig();
      if (issues.length > 0) {
        console.error('TON deposit verifier disabled: unsafe mainnet configuration', issues);
        this.client = null;
        this.vaultAddress = null;
        return;
      }
    }

    const rawEndpoint = process.env.TONCENTER_API_URL;
    const configuredVault = process.env.TON_DEPOSIT_ADDRESS;

    if (process.env.TON_ASSET_MODE && process.env.TON_ASSET_MODE !== 'native_ton') {
      console.error('TON deposit verifier disabled: only native_ton is implemented; configure a jetton verifier before using another asset');
      this.client = null;
      this.vaultAddress = null;
      return;
    }

    if (!rawEndpoint || !configuredVault) {
      this.client = null;
      this.vaultAddress = null;
      return;
    }

    try {
      const endpoint = normalizeToncenterEndpoint(rawEndpoint);
      this.client = new TonClient({
        endpoint,
        apiKey: process.env.TONCENTER_API_KEY || undefined,
      });
      this.vaultAddress = Address.parse(configuredVault);
    } catch (error) {
      console.error('TON deposit verifier disabled: invalid indexer or vault configuration', error);
      this.client = null;
      this.vaultAddress = null;
    }
  }

  start() {
    if (!this.client || !this.vaultAddress || this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), 15_000);
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      (this.timer as any).unref();
    }
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async poll(options?: { maxBatch?: number; concurrency?: number }) {
    if (!this.client || !this.vaultAddress || this.polling) return;
    this.polling = true;
    const maxBatch = options?.maxBatch ?? 20;
    const concurrency = options?.concurrency ?? 5;

    try {
      const allPending = await this.storage.getPendingDepositIntents();
      metrics.setGauge('pending_deposits_count', allPending.length);
      if (allPending.length === 0) return;

      const remainingIntents: PendingDepositIntent[] = [];

      // 1. Primary fast-path: Check incoming transactions directly on the vault address
      let vaultTxs: any[] = [];
      if (typeof this.client.getTransactions === 'function') {
        try {
          vaultTxs = await this.client.getTransactions(this.vaultAddress, { limit: 30 });
        } catch (vaultErr) {
          console.warn('Vault incoming transaction check failed, falling back to per-wallet check:', (vaultErr as Error).message);
        }
      }

      for (const intent of allPending) {
        if (intent.expires_at && new Date() > new Date(intent.expires_at)) {
          continue;
        }

        let match: string | null = null;
        if (vaultTxs && vaultTxs.length > 0) {
          try {
            match = this.findMatchingVaultTransfer(intent, vaultTxs);
          } catch (err) {
            console.warn(`Vault transfer matching error for intent ${intent.id}:`, (err as Error).message);
          }
        }

        if (match) {
          await this.confirmIntent(intent, match);
        } else {
          remainingIntents.push(intent);
        }
      }

      // 2. Fallback: For remaining intents, query sender wallets with bounded concurrency
      const batch = remainingIntents.slice(0, maxBatch);
      for (let i = 0; i < batch.length; i += concurrency) {
        const chunk = batch.slice(i, i + concurrency);
        await Promise.allSettled(
          chunk.map(async (intent) => {
            try {
              const match = await this.findMatchingTransfer(intent);
              if (!match) return;
              await this.confirmIntent(intent, match);
            } catch (err) {
              console.warn(`Verification failed for deposit intent ${intent.id}:`, (err as Error).message);
            }
          })
        );
      }
    } catch (error) {
      console.warn('TON deposit verification poll failed:', (error as Error).message);
    } finally {
      this.polling = false;
    }
  }

  private async confirmIntent(intent: PendingDepositIntent, txHash: string) {
    const confirmed = await this.storage.confirmDeposit(intent.id, txHash);
    if (confirmed.success) {
      metrics.incrementCounter('deposits_verified_total', 1);
      const user = await this.storage.getAccountSnapshot(intent.telegram_id);
      if (user) {
        connectionManager.sendToPlayer(intent.telegram_id, {
          type: 'ACCOUNT_UPDATED',
          payload: { user },
        });
      }
    }
  }

  private findMatchingVaultTransfer(intent: PendingDepositIntent, vaultTransactions: any[]): string | null {
    if (!this.vaultAddress) return null;
    if (intent.network !== process.env.TON_NETWORK) return null;

    let intentDepositAddress: Address;
    try {
      intentDepositAddress = Address.parse(intent.deposit_address);
    } catch {
      return null;
    }
    if (!intentDepositAddress.equals(this.vaultAddress)) return null;

    let source: Address | null = null;
    try {
      if (intent.wallet_address) {
        source = Address.parse(intent.wallet_address);
      }
    } catch {
      source = null;
    }

    const expectedAmount = BigInt(intent.amount_nano);
    const earliestAllowed = intent.created_at.getTime() - 2 * 60_000;
    const latestAllowed = Date.now() + 2 * 60_000;

    for (const transaction of vaultTransactions) {
      if (transaction.now * 1000 < earliestAllowed) continue;
      if (transaction.now * 1000 > latestAllowed) continue;

      const inMsg = transaction.inMessage;
      if (!inMsg || inMsg.info?.type !== 'internal') continue;
      if (!inMsg.info.dest?.equals(this.vaultAddress)) continue;
      if (inMsg.info.value?.coins !== expectedAmount) continue;
      if (source && !inMsg.info.src?.equals(source)) continue;

      const comment = extractComment(inMsg.body);
      if (intent.memo) {
        if (comment !== intent.memo) continue;
      } else {
        if (process.env.REQUIRE_DEPOSIT_MEMO === 'true') {
          if (!comment || (!comment.includes(intent.id) && !comment.includes(String(intent.telegram_id)))) {
            continue;
          }
        } else if (comment) {
          if (!comment.includes(intent.id) && !comment.includes(String(intent.telegram_id))) {
            continue;
          }
        }
      }

      return transaction.hash().toString('hex');
    }

    return null;
  }

  private async findMatchingTransfer(intent: PendingDepositIntent): Promise<string | null> {
    if (!this.client || !this.vaultAddress) return null;

    if (intent.network !== process.env.TON_NETWORK) return null;

    let intentDepositAddress: Address;
    try {
      intentDepositAddress = Address.parse(intent.deposit_address);
    } catch {
      return null;
    }
    if (!intentDepositAddress.equals(this.vaultAddress)) return null;

    const source = Address.parse(intent.wallet_address);
    const expectedAmount = BigInt(intent.amount_nano);
    const transactions = await this.client.getTransactions(source, { limit: 20 });
    const earliestAllowed = intent.created_at.getTime() - 2 * 60_000;
    const latestAllowed = Date.now() + 2 * 60_000;

    if (intent.expires_at && new Date() > new Date(intent.expires_at)) {
      return null;
    }

    for (const transaction of transactions) {
      if (transaction.now * 1000 < earliestAllowed) continue;
      if (transaction.now * 1000 > latestAllowed) continue;

      for (const message of transaction.outMessages.values()) {
        if (message.info.type !== 'internal') continue;
        if (!message.info.src.equals(source)) continue;
        if (!message.info.dest.equals(this.vaultAddress)) continue;
        if (message.info.value.coins !== expectedAmount) continue;

        const comment = extractComment(message.body);
        if (intent.memo) {
          // --- NEW MEMO MATCHING (Strict exact equality) ---
          if (comment !== intent.memo) {
            continue;
          }
        } else {
          // --- LEGACY MATCHING (Fallback for older intents created before migration) ---
          if (process.env.REQUIRE_DEPOSIT_MEMO === 'true') {
            if (!comment || (!comment.includes(intent.id) && !comment.includes(String(intent.telegram_id)))) {
              continue;
            }
          } else if (comment) {
            if (!comment.includes(intent.id) && !comment.includes(String(intent.telegram_id))) {
              continue;
            }
          }
        }

        return transaction.hash().toString('hex');
      }
    }

    return null;
  }
}
