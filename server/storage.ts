import { DatabasePool } from './db/index';
import { MAX_STAKE, MIN_STAKE } from '../shared/constants/economics';
import { buildDailyBragStats } from './bragStats';

export interface UserEntity {
  id: number;
  telegram_id: number;
  username: string;
  first_name: string;
  last_name?: string;
  photo_url?: string;
  balance_nano: string;
  balance_gram: number;
  total_winnings: number;
  total_volume: number;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  current_streak: number;
  best_streak: number;
  level: number;
  xp: number;
  favorite_game: string;
}

export interface PendingDepositIntent {
  id: string;
  telegram_id: number;
  wallet_address: string;
  deposit_address: string;
  amount_nano: string;
  amount_gram: number;
  memo?: string;
  boc?: string | null;
  network: 'mainnet' | 'testnet';
  status: 'pending' | 'confirmed' | 'failed' | 'expired' | 'cancelled';
  expires_at?: Date;
  created_at: Date;
}

export class StorageService {
  private db: DatabasePool;
  /**
   * Local in-process deduplication cache to minimize redundant database round-trips
   * within the same Node.js instance. Note: Durable transactional correctness and
   * multi-server concurrency are guaranteed by PostgreSQL row locks and unique constraints.
   */
  private localSettlementDeduplication = new Map<string, Promise<unknown>>();

  constructor() {
    this.db = DatabasePool.getInstance();
  }

  async isReady(): Promise<boolean> {
    return this.db.checkReadiness();
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async persistMatch(match: {
    code: string;
    gameType: string;
    stakeAmount: number;
    potAmount: number;
    p1TelegramId: number;
    p2TelegramId?: number | null;
    status: string;
    statePayload: Record<string, unknown>;
  }) {
    return this.db.persistMatch(match);
  }

  async loadActiveMatches() {
    return this.db.loadActiveMatches();
  }

  async loadMatchByCode(code: string) {
    return this.db.loadMatchByCode(code);
  }

  async createMatchWithEscrow(params: {
    code: string;
    gameType: string;
    stakeAmount: number;
    potAmount: number;
    p1TelegramId: number;
    status?: string;
    statePayload?: Record<string, unknown>;
  }) {
    return this.db.createMatchWithEscrow(params);
  }

  async joinMatchWithEscrow(params: {
    code: string;
    p2TelegramId: number;
    statePayload?: Record<string, unknown>;
  }) {
    return this.db.joinMatchWithEscrow(params);
  }

  async startRematchWithEscrow(params: {
    matchCode: string;
    nextRoundCode: string;
    p1TelegramId: number;
    p2TelegramId: number;
    stake: number;
    statePayload?: Record<string, unknown>;
  }) {
    return this.db.startRematchWithEscrow(params);
  }

  async recordGameAction(params: {
    matchCode: string;
    requestId: string;
    playerId?: number;
    actionType: string;
    payload?: any;
    result: any;
  }) {
    return this.db.recordGameAction(params);
  }

  async getGameAction(matchCode: string, requestId: string) {
    return this.db.getGameAction(matchCode, requestId);
  }

  /**
   * Soft cancel a match and delete from active memory. Real financial state
   * is preserved in PostgreSQL matches and ledger tables for auditability.
   */
  async deleteMatch(code: string) {
    return this.db.deleteMatch(code);
  }

  /**
   * Get or create a user by their Telegram ID
   */
  async getOrCreateUser(telegramUser: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  }): Promise<UserEntity> {
    let user = await this.db.loadUserByTelegramId(telegramUser.id);
    if (user) {
      const hasChanged =
        (telegramUser.first_name && telegramUser.first_name !== user.first_name) ||
        (telegramUser.username && telegramUser.username !== user.username) ||
        (telegramUser.photo_url !== undefined && telegramUser.photo_url !== user.photo_url) ||
        (telegramUser.last_name !== undefined && telegramUser.last_name !== user.last_name);

      if (hasChanged) {
        const updated = await this.db.persistUser({
          ...user,
          first_name: telegramUser.first_name || user.first_name,
          last_name: telegramUser.last_name ?? user.last_name,
          username: telegramUser.username || user.username,
          photo_url: telegramUser.photo_url ?? user.photo_url,
        });
        return updated || user;
      }
      return user;
    }

    const newUserPayload: any = {
      telegram_id: telegramUser.id,
      username: telegramUser.username || `player_${telegramUser.id}`,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name || '',
      photo_url: telegramUser.photo_url || '',
      balance_gram: process.env.NODE_ENV === 'test' || process.env.E2E_TEST_MODE === 'true' ? 2450 : 0,
      total_winnings: 0,
      total_volume: 0,
      total_matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      current_streak: 0,
      best_streak: 0,
      level: 1,
      xp: 0,
      favorite_game: 'snake',
    };
    user = await this.db.persistUser(newUserPayload);
    return user;
  }

  async getAccountSnapshot(telegramId: number) {
    const user = await this.db.loadUserByTelegramId(telegramId);
    if (!user) return null;

    const transactions = (await this.db.loadTransactionsForUser(user.id))
      .map((tx: any) => ({
        id: String(tx.id),
        type: tx.type,
        amountGram: Number(tx.amount || 0),
        status: 'confirmed' as const,
        createdAt: new Date(tx.created_at || Date.now()).toISOString(),
        txHash: tx.tx_hash,
      }))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Isolate financial ledger from ephemeral in-flight intents:
    // Only return activeDeposit if there is an unexpired pending intent with a broadcasted BOC
    const userIntents = (await this.db.loadDepositIntentsForUser(telegramId)) as PendingDepositIntent[];
    const now = Date.now();
    const activeIntent = userIntents.find(
      (intent: PendingDepositIntent) =>
        intent.status === 'pending' &&
        Boolean(intent.boc) &&
        (!intent.expires_at || new Date(intent.expires_at).getTime() > now)
    );

    const activeDeposit = activeIntent
      ? {
          id: activeIntent.id,
          amountGram: activeIntent.amount_gram,
          amountNano: activeIntent.amount_nano,
          status: activeIntent.status,
          createdAt: new Date(activeIntent.created_at).toISOString(),
          boc: activeIntent.boc,
          memo: activeIntent.memo,
          depositAddress: activeIntent.deposit_address,
        }
      : null;

    return { ...user, transactions, activeDeposit };
  }

  async getDailyBragStats(telegramId: number, now = new Date()) {
    const user = await this.db.loadUserByTelegramId(telegramId);
    if (!user) return null;

    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
    const transactions = await this.db.loadTransactionsForUserSince(user.id, since);
    return buildDailyBragStats(user, transactions.map((transaction: any) => ({
      match_code: transaction.match_code,
      type: transaction.type,
      amount: Number(transaction.amount || 0),
      created_at: new Date(transaction.created_at),
    })), now);
  }

  async getLeaderboard(limit = 50) {
    return this.db.loadLeaderboard(limit);
  }

  async createDepositIntent(input: {
    telegramId: number;
    amountNano: string;
    walletAddress?: string;
    depositAddress: string;
    network: 'mainnet' | 'testnet';
  }) {
    const user = await this.db.loadUserByTelegramId(input.telegramId);
    if (!user) throw new Error('Account not found');

    let amountNano: bigint;
    try {
      amountNano = BigInt(input.amountNano);
    } catch {
      throw new Error('Invalid deposit amount');
    }
    if (amountNano <= 0n) throw new Error('Deposit amount must be greater than zero');

    return await this.db.createDepositIntent({
      telegramId: input.telegramId,
      amountNano: input.amountNano,
      walletAddress: input.walletAddress,
      depositAddress: input.depositAddress,
      network: input.network,
    });
  }

  async cancelDepositIntent(intentId: string, telegramId: number) {
    const user = await this.db.loadUserByTelegramId(telegramId);
    if (!user) return { success: false as const, error: 'Account not found' };

    const intent = await this.db.loadDepositIntentById(intentId);
    if (!intent) return { success: false as const, error: 'Deposit intent not found' };

    if (intent.telegram_id !== telegramId) {
      return { success: false as const, error: 'Unauthorized' };
    }

    if (intent.status === 'pending') {
      await this.db.updatePersistentDepositIntent(intentId, {
        status: 'cancelled',
      });
    }

    return { success: true as const };
  }

  async recordPendingDeposit(input: {
    intentId?: string;
    telegramId: number;
    walletAddress: string;
    depositAddress: string;
    amountNano: string;
    boc: string;
    network: 'mainnet' | 'testnet';
  }) {
    const user = await this.db.loadUserByTelegramId(input.telegramId);
    if (!user) return { success: false as const, error: 'Account not found' };

    const configuredDepositAddress = process.env.TON_DEPOSIT_ADDRESS;
    if (configuredDepositAddress && input.depositAddress !== configuredDepositAddress) {
      return { success: false as const, error: 'Invalid deposit address' };
    }
    const configuredNetwork = process.env.TON_NETWORK;
    if (configuredNetwork && input.network !== configuredNetwork) {
      return { success: false as const, error: 'Invalid network' };
    }

    let amountNano: bigint;
    try {
      amountNano = BigInt(input.amountNano);
    } catch {
      return { success: false as const, error: 'Invalid deposit amount' };
    }
    if (amountNano <= 0n) return { success: false as const, error: 'Deposit amount must be greater than zero' };

    if (input.intentId) {
      const intent = await this.db.loadDepositIntentById(input.intentId);
      if (!intent) {
        return { success: false as const, error: 'DEPOSIT_INTENT_NOT_FOUND' };
      }
      if (Number(intent.telegram_id) !== input.telegramId) {
        return { success: false as const, error: 'DEPOSIT_INTENT_OWNERSHIP_MISMATCH' };
      }
      if (intent.status === 'confirmed') {
        return { success: false as const, error: 'DEPOSIT_INTENT_ALREADY_CONFIRMED' };
      }
      if (intent.status !== 'pending') {
        return { success: false as const, error: 'Deposit intent is not pending' };
      }
      if (intent.expires_at && new Date() > new Date(intent.expires_at)) {
        await this.db.updatePersistentDepositIntent(intent.id, { status: 'expired' });
        return { success: false as const, error: 'DEPOSIT_INTENT_EXPIRED' };
      }
      if (String(intent.amount_nano) !== String(input.amountNano)) {
        return { success: false as const, error: 'DEPOSIT_AMOUNT_MISMATCH' };
      }

      const existingByBoc = await this.db.loadDepositIntentByBoc(input.boc);
      if (existingByBoc && existingByBoc.id !== intent.id) {
        return { success: false as const, error: 'This deposit transaction is already associated with another intent' };
      }

      const updated = await this.db.updatePersistentDepositIntent(intent.id, {
        boc: input.boc,
        wallet_address: input.walletAddress || intent.wallet_address,
      });
      return { success: true as const, transaction: this.toPendingDeposit(updated || intent) };
    }

    const existing = await this.db.loadDepositIntentByBoc(input.boc);
    if (existing) {
      // Prevent BOC reconnaissance: verify user ownership before returning details
      if (Number(existing.telegram_id) !== input.telegramId) {
        return { success: false as const, error: 'This deposit is already linked to another account' };
      }
      return { success: true as const, transaction: this.toPendingDeposit(existing) };
    }

    const intent = await this.db.persistDepositIntent({
      telegram_id: input.telegramId,
      wallet_address: input.walletAddress,
      deposit_address: input.depositAddress,
      amount_nano: input.amountNano,
      boc: input.boc,
      network: input.network,
      status: 'pending',
    });

    if (Number(intent.telegram_id) !== input.telegramId) {
      return { success: false as const, error: 'This deposit is already linked to another account' };
    }

    return { success: true as const, transaction: this.toPendingDeposit(intent) };
  }

  async getPendingDepositIntents() {
    return await this.db.loadPendingDepositIntents() as PendingDepositIntent[];
  }

  async confirmDeposit(intentId: string, txHash: string) {
    const confirmed = await this.db.confirmDeposit(intentId, txHash);
    if (!confirmed.success) return confirmed;

    const intent = await this.db.loadDepositIntentById(intentId);
    if (!intent) return { success: false as const, error: 'Deposit intent not found after confirmation' };
    return { success: true as const, user: await this.getAccountSnapshot(intent.telegram_id) };
  }

  async requestWithdrawal(input: {
    telegramId: number;
    walletAddress: string;
    amountNano: string;
  }) {
    const user = await this.db.loadUserByTelegramId(input.telegramId);
    if (!user) return { success: false as const, error: 'Account not found' };

    const trimmedAddress = input.walletAddress.trim();
    if (!trimmedAddress || trimmedAddress.length < 10 || trimmedAddress.length > 128) {
      return { success: false as const, error: 'Invalid recipient wallet address' };
    }

    let amountNano: bigint;
    try {
      amountNano = BigInt(input.amountNano);
    } catch {
      return { success: false as const, error: 'Invalid withdrawal amount' };
    }
    if (amountNano <= 0n) {
      return { success: false as const, error: 'Withdrawal amount must be greater than zero' };
    }

    const result = await this.db.requestWithdrawal(
      input.telegramId,
      trimmedAddress,
      input.amountNano
    );

    if (!result.success) {
      return { success: false as const, error: result.error || 'Withdrawal failed' };
    }

    const snapshot = await this.getAccountSnapshot(input.telegramId);
    return {
      success: true as const,
      transaction: result.transaction,
      withdrawal: result.withdrawal,
      user: snapshot || result.user,
    };
  }

  private toPendingDeposit(intent: any) {
    return {
      id: intent.id,
      type: 'deposit' as const,
      amountGram: Number(intent.amount_gram || (Number(intent.amount_nano || 0) / 1e9)),
      status: intent.status,
      createdAt: new Date(intent.created_at).toISOString(),
      walletAddress: intent.wallet_address,
      network: intent.network,
      boc: intent.boc,
      memo: intent.memo,
    };
  }

  /**
   * Atomically verify and debit stake into match escrow
   */
  async debitStake(
    telegramId: number,
    stake: number,
    matchCode: string
  ): Promise<{ success: boolean; balance?: number; error?: string }> {
    if (!Number.isSafeInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
      return { success: false, error: `Stake must be between ${MIN_STAKE} and ${MAX_STAKE} GRAM` };
    }

    const debit = await this.db.debitUserBalance(telegramId, stake, matchCode);
    if (!debit.success) {
      return {
        success: false,
        error: debit.error === 'Insufficient balance'
          ? `Not enough GRAM. You need ${stake} GRAM, but have ${debit.balance || 0} GRAM.`
          : debit.error,
      };
    }
    return { success: true, balance: debit.user.balance_gram };
  }

  /**
   * Refund escrowed stake if match cancelled before start
   */
  async refundStake(
    telegramId: number,
    stake: number,
    matchCode: string
  ): Promise<{ success: boolean; balance?: number }> {
    if (!Number.isSafeInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
      return { success: false };
    }
    return this.runSettlementOnce(`${matchCode}:cancel-refund:${telegramId}`, async () => {
      const res = await this.db.refundStake(telegramId, stake, matchCode);
      return res || { success: false };
    });
  }

  /**
   * Atomically cancel a match and refund all escrowed players
   */
  async cancelMatch(matchCode: string): Promise<{ success: boolean; count?: number }> {
    return this.runSettlementOnce(`${matchCode}:cancel`, async () => {
      return this.db.cancelMatchAndRefund(matchCode);
    });
  }

  /**
   * Finalize a Win/Loss Match from escrow and credit 90% Net Pot to winner.
   * Delegated entirely to DatabasePool's atomic transaction engine.
   */
  async finalizeWinMatch(
    matchCode: string,
    gameType: string,
    stake: number,
    winnerTgId: number,
    loserTgId: number
  ) {
    return this.runSettlementOnce(matchCode, async () => {
      const res = await this.db.settleWinMatch(matchCode, gameType, stake, winnerTgId, loserTgId);
      return res?.calculation;
    });
  }

  /**
   * Finalize a Draw Match and refund 95% of escrowed stake to both players.
   * Delegated entirely to DatabasePool's atomic transaction engine.
   */
  async finalizeDrawMatch(
    matchCode: string,
    gameType: string,
    stake: number,
    p1TgId: number,
    p2TgId: number
  ) {
    return this.runSettlementOnce(matchCode, async () => {
      const res = await this.db.settleDrawMatch(matchCode, gameType, stake, p1TgId, p2TgId);
      return res?.calculation;
    });
  }

  private async runSettlementOnce<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const inFlight = this.localSettlementDeduplication.get(key);
    if (inFlight) return inFlight as Promise<T>;

    const current = operation();
    this.localSettlementDeduplication.set(key, current);
    try {
      return await current;
    } finally {
      if (this.localSettlementDeduplication.get(key) === current) {
        this.localSettlementDeduplication.delete(key);
      }
    }
  }
}
