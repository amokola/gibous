/**
 * Settlement Worker & Durable Reconciliation Engine
 * Decouples real-money settlement and ledger accounting from in-band WebSocket packet handling.
 * Provides idempotent settlement execution, persistent status transitions, and automatic retry.
 */

import { RoomManager, GameRoom } from './roomManager';
import { StorageService } from './storage';
import { connectionManager } from './connectionManager';
import { logEvent, metrics } from './observability';

export interface SettlementJob {
  roomCode: string;
  requestId?: string;
  enqueuedAt: number;
  attempts: number;
}

export class SettlementWorker {
  private activeJobs: Map<string, SettlementJob> = new Map();
  private inFlightPromises: Map<string, Promise<boolean>> = new Map();
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;

  private readonly MAX_RETRIES = 5;
  private readonly BASE_BACKOFF_MS = 1000;

  constructor(
    private roomManager: RoomManager,
    private storage: StorageService
  ) {
    this.retryTimer = setInterval(() => {
      if (!this.isShuttingDown) {
        void this.processRetryBatch();
      }
    }, 5000);

    if (this.retryTimer && typeof this.retryTimer === 'object' && 'unref' in this.retryTimer) {
      (this.retryTimer as any).unref();
    }
  }

  async enqueueSettlement(roomCode: string, requestId?: string): Promise<void> {
    const code = roomCode.trim().toUpperCase();
    if (!this.activeJobs.has(code)) {
      this.activeJobs.set(code, {
        roomCode: code,
        requestId,
        enqueuedAt: Date.now(),
        attempts: 0,
      });
    }

    // Process immediately in background
    void this.processSettlement(code, requestId);
  }

  async processSettlement(roomCode: string, requestId?: string): Promise<boolean> {
    const code = roomCode.trim().toUpperCase();
    const existing = this.inFlightPromises.get(code);
    if (existing) return existing;

    const promise = this.executeSettlementInternal(code, requestId);
    this.inFlightPromises.set(code, promise);
    try {
      return await promise;
    } finally {
      this.inFlightPromises.delete(code);
    }
  }

  private async executeSettlementInternal(code: string, requestId?: string): Promise<boolean> {
    const room = this.roomManager.getRoom(code);
    if (!room) {
      this.activeJobs.delete(code);
      return false;
    }

    if (room.settlementStatus === 'committed') {
      this.activeJobs.delete(code);
      return true;
    }

    const winnerRole = room.winner;
    if (!winnerRole) {
      this.activeJobs.delete(code);
      return false;
    }

    const job = this.activeJobs.get(code) || {
      roomCode: code,
      requestId,
      enqueuedAt: Date.now(),
      attempts: 0,
    };
    job.attempts += 1;
    this.activeJobs.set(code, job);

    const operationId = `settlement:${code}`;
    const startTime = performance.now();
    logEvent('info', 'financial.settlement.started', {
      requestId,
      operationId,
      roomCode: code,
      winner: winnerRole,
      attempt: job.attempts,
    });

    try {
      if (winnerRole === 'draw') {
        if (!room.p1?.telegramId || !room.p2?.telegramId) {
          throw new Error('Both players required for draw settlement');
        }

        const refund = await this.storage.finalizeDrawMatch(
          code,
          room.gameType,
          room.stakeAmount,
          room.p1.telegramId,
          room.p2.telegramId
        );

        room.settlementStatus = 'committed';
        room.version += 1;
        await this.roomManager.persistCurrentState(room);

        const duration = performance.now() - startTime;
        metrics.recordHistogram('settlement_duration_ms', duration, { result: 'draw' });
        metrics.incrementCounter('settlements_committed_total', 1, { result: 'draw' });

        logEvent('info', 'financial.settlement.committed', {
          requestId,
          operationId,
          roomCode: code,
        });

        connectionManager.broadcast(room, {
          type: 'GAME_OVER',
          requestId,
          payload: {
            roomCode: code,
            winner: 'draw',
            potAmount: room.potAmount,
            winnerPayout: refund.p1Refund,
            loserPayout: refund.p2Refund,
            arenaFee: refund.arenaFee,
            xpEarned: 75,
            version: room.version,
            settlementStatus: 'committed',
          },
        });

        await this.notifyPlayerAccounts([room.p1.telegramId, room.p2.telegramId], requestId);
        this.activeJobs.delete(code);
        metrics.setGauge('settlement_backlog_size', this.activeJobs.size);
        return true;
      } else {
        const winnerTgId = winnerRole === 'p1' ? room.p1?.telegramId : room.p2?.telegramId;
        const loserTgId = winnerRole === 'p1' ? room.p2?.telegramId : room.p1?.telegramId;

        if (!winnerTgId || !loserTgId) {
          throw new Error('Both players required for win settlement');
        }

        const payout = await this.storage.finalizeWinMatch(
          code,
          room.gameType,
          room.stakeAmount,
          winnerTgId,
          loserTgId
        );

        room.settlementStatus = 'committed';
        room.version += 1;
        await this.roomManager.persistCurrentState(room);

        const duration = performance.now() - startTime;
        metrics.recordHistogram('settlement_duration_ms', duration, { result: 'win' });
        metrics.incrementCounter('settlements_committed_total', 1, { result: 'win' });

        logEvent('info', 'financial.settlement.committed', {
          requestId,
          operationId,
          roomCode: code,
        });

        connectionManager.broadcast(room, {
          type: 'GAME_OVER',
          requestId,
          payload: {
            roomCode: code,
            winner: winnerRole,
            potAmount: room.potAmount,
            winnerPayout: payout.winnerPayout,
            loserPayout: payout.loserPayout,
            arenaFee: payout.arenaFee,
            xpEarned: 150,
            version: room.version,
            settlementStatus: 'committed',
          },
        });

        await this.notifyPlayerAccounts([winnerTgId, loserTgId], requestId);
        this.activeJobs.delete(code);
        metrics.setGauge('settlement_backlog_size', this.activeJobs.size);
        return true;
      }
    } catch (error) {
      metrics.incrementCounter('settlements_failed_total', 1);
      metrics.setGauge('settlement_backlog_size', this.activeJobs.size);
      console.error(`Settlement failed for room ${code} (attempt ${job.attempts}):`, error);
      logEvent('error', 'financial.settlement.failed', {
        requestId,
        operationId,
        roomCode: code,
        attempt: job.attempts,
        error: error instanceof Error ? error.name : 'unknown_error',
      });

      room.settlementStatus = 'failed';
      room.version += 1;
      await this.roomManager.persistCurrentState(room).catch((err) => {
        console.error(`Could not persist failed settlement state for ${code}:`, err);
      });

      connectionManager.broadcast(room, {
        type: 'SETTLEMENT_PENDING',
        requestId,
        payload: {
          roomCode: code,
          winner: winnerRole,
          settlementStatus: 'failed',
          version: room.version,
        },
      });

      if (job.attempts >= this.MAX_RETRIES) {
        logEvent('error', 'financial.settlement.exhausted', {
          roomCode: code,
          attempts: job.attempts,
        });
      }

      return false;
    }
  }

  private async processRetryBatch(): Promise<void> {
    for (const [code, job] of this.activeJobs.entries()) {
      if (job.attempts < this.MAX_RETRIES && !this.inFlightPromises.has(code)) {
        void this.processSettlement(code, job.requestId);
      }
    }
  }

  async reconcileInterruptedSettlements(options?: { batchSize?: number; batchDelayMs?: number }): Promise<void> {
    const batchSize = options?.batchSize ?? 5;
    const batchDelayMs = options?.batchDelayMs ?? 50;

    const roomsToReconcile = this.roomManager.getAllRooms().filter(
      (room) => room.status === 'gameover' && room.winner && room.settlementStatus !== 'committed'
    );

    for (let i = 0; i < roomsToReconcile.length; i += batchSize) {
      const chunk = roomsToReconcile.slice(i, i + batchSize);
      await Promise.allSettled(
        chunk.map((room) => this.processSettlement(room.code))
      );
      if (i + batchSize < roomsToReconcile.length && batchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
      }
    }
  }

  private async notifyPlayerAccounts(telegramIds: Array<number | undefined>, requestId?: string): Promise<void> {
    for (const tgId of [...new Set(telegramIds.filter((id): id is number => typeof id === 'number'))]) {
      const user = await this.storage.getAccountSnapshot(tgId);
      if (user) {
        connectionManager.sendToPlayer(tgId, {
          type: 'ACCOUNT_UPDATED',
          requestId,
          payload: { user },
        });
      }
    }
  }

  async drain(): Promise<void> {
    this.isShuttingDown = true;
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }

    // Wait for current in-flight settlements to complete
    const inFlight = Array.from(this.inFlightPromises.values());
    if (inFlight.length > 0) {
      await Promise.allSettled(inFlight);
    }
  }
}
