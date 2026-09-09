import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { GameType } from '../shared';
import { MAX_STAKE, MIN_STAKE } from '../shared/constants/economics';
import { logEvent, metrics } from './observability';

export interface QueuedPlayer {
  telegramId: number;
  name: string;
  avatarUrl?: string;
  gameType: GameType;
  stake: number;
  ws: WebSocket;
  joinedAt: number;
}

export interface MatchReservation {
  matchId: string;
  p1: QueuedPlayer;
  p2: QueuedPlayer;
  gameType: GameType;
  stake: number;
  createdAt: number;
}

export type MatchHandler = (reservation: MatchReservation) => Promise<void>;

const MAX_QUEUE_WAIT_MS = 60_000;
const VALID_GAME_TYPES = new Set<GameType>(['snake', 'connect4', 'rps']);

export class MatchmakingQueue {
  private readonly queue = new Map<number, QueuedPlayer>();
  private readonly buckets = new Map<string, Set<number>>();
  private readonly socketToTgId = new Map<WebSocket, number>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly onMatchFound: MatchHandler) {
    // Schedule periodic stale purge every 5 seconds
    this.cleanupTimer = setInterval(() => this.purgeStaleEntries(), 5000);
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      (this.cleanupTimer as any).unref();
    }
  }

  private getBucketKey(gameType: GameType, stake: number): string {
    return `${gameType}:${stake}`;
  }

  private addToBucket(player: QueuedPlayer): void {
    const key = this.getBucketKey(player.gameType, player.stake);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Set();
      this.buckets.set(key, bucket);
    }
    bucket.add(player.telegramId);
  }

  private removeFromBucket(player: QueuedPlayer): void {
    const key = this.getBucketKey(player.gameType, player.stake);
    const bucket = this.buckets.get(key);
    if (bucket) {
      bucket.delete(player.telegramId);
      if (bucket.size === 0) {
        this.buckets.delete(key);
      }
    }
  }

  private lastPurgeAt = 0;
  private readonly PURGE_THROTTLE_MS = 2000;

  async enqueue(player: QueuedPlayer): Promise<{ status: 'searching' | 'matched' }> {
    this.validatePlayer(player);

    // Remove previous queue entry if present
    this.dequeueByPlayer(player.telegramId, false);

    // Periodically purge stale entries without running full O(N) scan on every single enqueue
    const now = Date.now();
    if (now - this.lastPurgeAt >= this.PURGE_THROTTLE_MS) {
      this.lastPurgeAt = now;
      this.purgeStaleEntries();
    }

    // Look for matching opponent in the exact (gameType, stake) bucket in O(1)
    const opponent = this.findOpponent(player);

    if (!opponent) {
      this.queue.set(player.telegramId, player);
      this.addToBucket(player);
      this.socketToTgId.set(player.ws, player.telegramId);
      metrics.setGauge('matchmaking_queue_size', this.queue.size);

      logEvent('info', 'matchmaking.player.queued', {
        telegramId: player.telegramId,
        gameType: player.gameType,
        stake: player.stake,
      });
      return { status: 'searching' };
    }

    // Atomically reserve both players out of queue before invoking match establishment
    this.dequeueByPlayer(opponent.telegramId, false);

    const reservation: MatchReservation = {
      matchId: randomUUID(),
      p1: opponent,
      p2: player,
      gameType: player.gameType,
      stake: player.stake,
      createdAt: Date.now(),
    };

    logEvent('info', 'matchmaking.match.reserved', {
      matchId: reservation.matchId,
      p1: opponent.telegramId,
      p2: player.telegramId,
      gameType: player.gameType,
      stake: player.stake,
    });

    try {
      await this.onMatchFound(reservation);
      metrics.incrementCounter('matchmaking_matches_total', 1);
      return { status: 'matched' };
    } catch (error) {
      logEvent('error', 'matchmaking.match.failed', {
        matchId: reservation.matchId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Restore active players if match creation failed
      this.restoreIfStillValid(opponent);
      this.restoreIfStillValid(player);

      throw error;
    }
  }

  dequeueByPlayer(telegramId: number, emitLog = true): boolean {
    const player = this.queue.get(telegramId);
    if (!player) return false;

    this.queue.delete(telegramId);
    this.removeFromBucket(player);
    this.socketToTgId.delete(player.ws);
    metrics.setGauge('matchmaking_queue_size', this.queue.size);

    if (emitLog) {
      logEvent('info', 'matchmaking.player.dequeued', { telegramId });
    }
    return true;
  }

  dequeue(identifier: WebSocket | number): boolean {
    if (typeof identifier === 'number') {
      return this.dequeueByPlayer(identifier);
    }

    const tgId = this.socketToTgId.get(identifier);
    if (tgId !== undefined) {
      return this.dequeueByPlayer(tgId);
    }

    for (const [telegramId, player] of this.queue) {
      if (player.ws === identifier) {
        return this.dequeueByPlayer(telegramId);
      }
    }

    return false;
  }

  hasPlayer(telegramId: number): boolean {
    return this.queue.has(telegramId);
  }

  isQueued(identifier: WebSocket | number): boolean {
    if (typeof identifier === 'number') {
      return this.queue.has(identifier);
    }
    return this.socketToTgId.has(identifier);
  }

  size(): number {
    return this.queue.size;
  }

  getQueueLength(): number {
    return this.queue.size;
  }

  private findOpponent(player: QueuedPlayer): QueuedPlayer | undefined {
    const key = this.getBucketKey(player.gameType, player.stake);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.size === 0) return undefined;

    const candidatesToRemove: number[] = [];
    let matchedOpponent: QueuedPlayer | undefined = undefined;

    for (const candidateTgId of bucket) {
      if (candidateTgId === player.telegramId) continue;
      const opponent = this.queue.get(candidateTgId);
      if (!opponent) {
        candidatesToRemove.push(candidateTgId);
        continue;
      }
      if (opponent.ws.readyState !== WebSocket.OPEN || Date.now() - opponent.joinedAt > MAX_QUEUE_WAIT_MS) {
        candidatesToRemove.push(candidateTgId);
        continue;
      }
      matchedOpponent = opponent;
      break;
    }

    for (const id of candidatesToRemove) {
      this.dequeueByPlayer(id, false);
      logEvent('info', 'matchmaking.player.purged', {
        telegramId: id,
        reason: 'disconnected',
      });
    }

    return matchedOpponent;
  }

  private purgeStaleEntries(): void {
    const now = Date.now();

    for (const [telegramId, player] of this.queue) {
      const expired = now - player.joinedAt > MAX_QUEUE_WAIT_MS;
      const disconnected = player.ws.readyState !== WebSocket.OPEN;

      if (expired || disconnected) {
        this.dequeueByPlayer(telegramId, false);
        logEvent('info', 'matchmaking.player.purged', {
          telegramId,
          reason: expired ? 'expired' : 'disconnected',
        });
      }
    }
  }

  private restoreIfStillValid(player: QueuedPlayer): void {
    if (
      player.ws.readyState === WebSocket.OPEN &&
      !this.queue.has(player.telegramId)
    ) {
      this.queue.set(player.telegramId, player);
      this.addToBucket(player);
      this.socketToTgId.set(player.ws, player.telegramId);
      metrics.setGauge('matchmaking_queue_size', this.queue.size);
    }
  }

  private validatePlayer(player: QueuedPlayer): void {
    if (!Number.isSafeInteger(player.telegramId) || player.telegramId <= 0) {
      throw new Error('INVALID_PLAYER_ID');
    }

    if (!Number.isFinite(player.stake) || player.stake < MIN_STAKE || player.stake > MAX_STAKE) {
      throw new Error('INVALID_STAKE');
    }

    if (!VALID_GAME_TYPES.has(player.gameType)) {
      throw new Error('INVALID_GAME_TYPE');
    }

    if (!player.ws || player.ws.readyState !== WebSocket.OPEN) {
      throw new Error('PLAYER_SOCKET_NOT_OPEN');
    }
  }

  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
