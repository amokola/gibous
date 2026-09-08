import { randomBytes } from 'crypto';
import { GameType, PlayerRole, MatchWinner, RoomStatePayload } from '../shared';
import { IServerGameEngine, GameActionResult } from './engines/IServerGameEngine';
import { ServerSnakeLadderEngine } from './engines/SnakeLadderEngine';
import { ServerConnect4Engine } from './engines/Connect4Engine';
import { ServerRPSEngine } from './engines/RPSEngine';
import { connectionManager } from './connectionManager';
import { StorageService } from './storage';
import { MAX_STAKE, MIN_STAKE } from '../shared/constants/economics';

export const DISCONNECT_FORFEIT_TIMEOUT_MS = 45000;

export function getNextRematchCode(currentCode: string): string {
  const match = currentCode.match(/^(.*?)-R(\d+)$/i);
  if (match) {
    const base = match[1];
    const round = parseInt(match[2], 10) + 1;
    return `${base}-R${round}`.toUpperCase();
  }
  return `${currentCode}-R2`.toUpperCase();
}

export interface RoomPlayer {
  id: PlayerRole;
  telegramId: number;
  name: string;
  avatarUrl?: string;
  isReady: boolean;
  isBot?: boolean;
  isConnected: boolean;
}

export interface GameRoom {
  code: string;
  gameType: GameType;
  stakeAmount: number;
  potAmount: number;
  p1: RoomPlayer | null;
  p2: RoomPlayer | null;
  status: 'waiting' | 'playing' | 'gameover';
  winner: MatchWinner;
  settlementStatus?: 'pending' | 'committed' | 'failed';
  version: number;
  createdAt: number;
  lastActivityAt: number;
  engine: IServerGameEngine;
  p1DisconnectTimer?: ReturnType<typeof setTimeout>;
  p2DisconnectTimer?: ReturnType<typeof setTimeout>;
  emptyRoomTimer?: ReturnType<typeof setTimeout>;
  turnTimer?: ReturnType<typeof setTimeout>;
  actionCache: Map<string, GameActionResult>;
  rematchVotes: Set<number>;
}

export interface CalculatedActionTransition {
  success: boolean;
  error?: string;
  actionType: string;
  payload: Record<string, unknown>;
  isGameOver: boolean;
  winner: MatchWinner;
  isCached: boolean;
  expectedVersion: number;
  nextVersion: number;
  nextEngineState: Record<string, unknown>;
  nextStatus: GameRoom['status'];
  nextSettlementStatus?: GameRoom['settlementStatus'];
  actionResult: GameActionResult;
  requestId?: string;
  playerRole: PlayerRole;
}

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private creatingRoomCodes = new Set<string>();
  private creatingUserIds = new Set<number>();
  private storage: StorageService = new StorageService();
  private readonly MAX_ROOM_CAPACITY = 1000;
  private readonly WAITING_ROOM_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
  private readonly GAMEOVER_ROOM_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

  constructor() {
    // Periodic room cleanup every 2 minutes
    const timer = setInterval(() => this.cleanupExpiredRooms(), 2 * 60 * 1000);
    if (timer && typeof timer === 'object' && 'unref' in timer) {
      (timer as any).unref();
    }
  }

  private createEngine(gameType: GameType): IServerGameEngine {
    if (gameType === 'connect4') return new ServerConnect4Engine();
    if (gameType === 'rps') return new ServerRPSEngine();
    if (gameType === 'snake') return new ServerSnakeLadderEngine();
    throw new Error(`Unsupported game type: ${String(gameType)}`);
  }

  private async persistRoomState(room: GameRoom): Promise<void> {
    if (!room.p1) throw new Error(`Cannot persist room ${room.code} without player one`);

    await this.storage.persistMatch({
      code: room.code,
      gameType: room.gameType,
      stakeAmount: room.stakeAmount,
      potAmount: room.potAmount,
      p1TelegramId: room.p1.telegramId,
      p2TelegramId: room.p2?.telegramId,
      status: room.status,
      statePayload: {
        engine: room.engine.getPersistenceState(),
        version: room.version,
        winner: room.winner,
        settlementStatus: room.settlementStatus,
        actionCache: Array.from(room.actionCache.entries()).slice(-50),
      },
    });
  }

  /** Persist the current authoritative room state before transport publication. */
  async persistCurrentState(room: GameRoom): Promise<void> {
    await this.persistRoomState(room);
  }

  private parsePersistedRoom(persisted: any): GameRoom | null {
    const code = String(persisted.code || '').trim().toUpperCase();
    if (!code) return null;

    const gameType = (persisted.game_type || persisted.gameType) as GameType;
    if (!['snake', 'connect4', 'rps'].includes(gameType)) {
      console.error(`Skipping persisted room ${code}: unsupported game type`);
      return null;
    }

    const p1TelegramId = Number(persisted.p1_telegram_id ?? persisted.p1TelegramId);
    if (!Number.isSafeInteger(p1TelegramId)) {
      console.error(`Skipping persisted room ${code}: invalid player one identity`);
      return null;
    }

    let statePayload: Record<string, any> = persisted.state_payload || persisted.statePayload || {};
    try {
      if (typeof statePayload === 'string') statePayload = JSON.parse(statePayload);
    } catch (error) {
      console.error(`Skipping persisted room ${code}: invalid state payload`, error);
      return null;
    }

    const stakeAmount = Number(persisted.stake_amount ?? persisted.stakeAmount);
    const potAmount = Number(persisted.pot_amount ?? persisted.potAmount);
    if (
      !Number.isSafeInteger(stakeAmount) ||
      stakeAmount < MIN_STAKE ||
      stakeAmount > MAX_STAKE ||
      !Number.isSafeInteger(potAmount) ||
      potAmount < stakeAmount
    ) {
      console.error(`Skipping persisted room ${code}: invalid economics`);
      return null;
    }

    const p2Raw = persisted.p2_telegram_id ?? persisted.p2TelegramId;
    const p2TelegramId = p2Raw ? Number(p2Raw) : null;
    if (p2TelegramId !== null && (!Number.isSafeInteger(p2TelegramId) || p2TelegramId === p1TelegramId)) {
      console.error(`Skipping persisted room ${code}: invalid player two identity`);
      return null;
    }

    const status = persisted.status as GameRoom['status'];
    if (!['waiting', 'playing', 'gameover'].includes(status)) {
      console.error(`Skipping persisted room ${code}: invalid room status`);
      return null;
    }

    const engine = this.createEngine(gameType);
    if (statePayload.engine) {
      try {
        engine.restorePersistenceState(statePayload.engine);
      } catch (error) {
        console.error(`Skipping persisted room ${code}: engine failed state validation`, error);
        return null;
      }
    }

    const rawActionCache = Array.isArray(statePayload.actionCache) ? statePayload.actionCache : [];
    const actionCache = new Map<string, GameActionResult>();
    for (const entry of rawActionCache) {
      if (
        Array.isArray(entry) &&
        entry.length === 2 &&
        typeof entry[0] === 'string' &&
        entry[1] &&
        typeof entry[1] === 'object' &&
        typeof entry[1].success === 'boolean'
      ) {
        actionCache.set(entry[0], entry[1]);
      }
    }

    const winner: MatchWinner = ['p1', 'p2', 'draw', null].includes(statePayload.winner)
      ? statePayload.winner
      : null;
    const settlementStatus = ['pending', 'committed', 'failed'].includes(statePayload.settlementStatus)
      ? statePayload.settlementStatus
      : undefined;

    const p1Name = persisted.p1_name || persisted.p1Name || `Player ${p1TelegramId}`;
    const p1AvatarUrl = persisted.p1_photo_url || persisted.p1PhotoUrl || undefined;
    const p2Name = p2TelegramId ? (persisted.p2_name || persisted.p2Name || `Player ${p2TelegramId}`) : undefined;
    const p2AvatarUrl = p2TelegramId ? (persisted.p2_photo_url || persisted.p2PhotoUrl || undefined) : undefined;

    return {
      code,
      gameType,
      stakeAmount,
      potAmount,
      p1: {
        id: 'p1',
        telegramId: p1TelegramId,
        name: p1Name,
        avatarUrl: p1AvatarUrl,
        isReady: true,
        isConnected: false,
      },
      p2: p2TelegramId
        ? {
            id: 'p2',
            telegramId: p2TelegramId,
            name: p2Name!,
            avatarUrl: p2AvatarUrl,
            isReady: true,
            isConnected: false,
          }
        : null,
      status,
      winner,
      settlementStatus,
      version: Number.isSafeInteger(statePayload.version) ? statePayload.version : 1,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      engine,
      actionCache,
      rematchVotes: new Set(),
    };
  }

  /**
   * Rebuild authoritative rooms after a process restart.
   */
  async restorePersistedRooms(): Promise<void> {
    const persistedMatches = await this.storage.loadActiveMatches();

    for (const persisted of persistedMatches) {
      const code = String(persisted.code || '').trim().toUpperCase();
      if (!code || this.rooms.has(code)) continue;

      const room = this.parsePersistedRoom(persisted);
      if (!room) continue;

      this.rooms.set(code, room);

      if (room.status === 'gameover' && ['pending', 'failed'].includes(room.settlementStatus || '')) {
        this.reconcileInterruptedSettlement(room).catch((err) => {
          console.error(`Could not reconcile restored settlement for ${code}:`, err);
        });
      }
    }
  }

  /**
   * Targeted on-demand single room restoration by code to protect against DoS.
   */
  async restorePersistedRoomByCode(code: string): Promise<GameRoom | undefined> {
    const normalized = code.trim().toUpperCase();
    if (!normalized || !/^[A-Z0-9_-]{2,32}$/.test(normalized)) return undefined;
    if (this.rooms.has(normalized)) return this.rooms.get(normalized);

    const persisted = await this.storage.loadMatchByCode(normalized);
    if (!persisted) return undefined;

    const room = this.parsePersistedRoom(persisted);
    if (room) {
      this.rooms.set(normalized, room);
      if (room.status === 'gameover' && ['pending', 'failed'].includes(room.settlementStatus || '')) {
        this.reconcileInterruptedSettlement(room).catch((err) => {
          console.error(`Could not reconcile restored settlement for ${normalized}:`, err);
        });
      }
      return room;
    }
    return undefined;
  }

  private async reconcileInterruptedSettlement(room: GameRoom): Promise<void> {
    if (room.status !== 'gameover' || !room.winner) return;
    const winnerRole = room.winner;
    const p1TgId = room.p1?.telegramId;
    const p2TgId = room.p2?.telegramId;

    if (!p1TgId || !p2TgId) return;

    if (winnerRole === 'draw') {
      try {
        await this.storage.finalizeDrawMatch(
          room.code,
          room.gameType,
          room.stakeAmount,
          p1TgId,
          p2TgId
        );
        room.settlementStatus = 'committed';
      } catch (error) {
        console.error(`Draw settlement reconciliation failed for ${room.code}:`, error);
        room.settlementStatus = 'failed';
      }
    } else {
      const winnerTgId = winnerRole === 'p1' ? p1TgId : p2TgId;
      const loserTgId = winnerRole === 'p1' ? p2TgId : p1TgId;
      try {
        await this.storage.finalizeWinMatch(
          room.code,
          room.gameType,
          room.stakeAmount,
          winnerTgId,
          loserTgId
        );
        room.settlementStatus = 'committed';
      } catch (error) {
        console.error(`Win settlement reconciliation failed for ${room.code}:`, error);
        room.settlementStatus = 'failed';
      }
    }

    await this.persistRoomState(room).catch((persistError) => {
      console.error(`Could not update reconciliation status for ${room.code}:`, persistError);
    });
    await this.notifyAccounts([p1TgId, p2TgId]);
  }

  /**
   * Atomically create a match with Player 1's escrowed stake.
   */
  async createRoom(
    requestedCode: string | undefined,
    gameType: GameType,
    stake: number,
    p1TgId: number,
    p1Name: string,
    avatarUrl?: string
  ): Promise<{ room?: GameRoom; error?: string }> {
    if (!Number.isSafeInteger(stake) || stake < MIN_STAKE || stake > MAX_STAKE) {
      return { error: `Stake must be between ${MIN_STAKE} and ${MAX_STAKE} GRAM` };
    }

    if (this.creatingUserIds.has(p1TgId)) {
      return { error: 'You already have a room creation in progress' };
    }
    this.creatingUserIds.add(p1TgId);

    try {
      // If the host already has an open waiting room, return it idempotently to avoid duplicate escrow charges
      for (const existing of this.rooms.values()) {
        if (existing.status === 'waiting' && existing.p1?.telegramId === p1TgId) {
          return { room: existing };
        }
      }

      const code = this.reserveRoomCode(requestedCode);
      if (!code) return { error: 'Room code is already in use' };

      if (this.rooms.size >= this.MAX_ROOM_CAPACITY) {
        this.cleanupExpiredRooms();
      }

      let engine: IServerGameEngine;
      try {
        engine = this.createEngine(gameType);
      } catch (error) {
        this.creatingRoomCodes.delete(code);
        throw error;
      }

      const initialRoom: GameRoom = {
        code,
        gameType,
        stakeAmount: stake,
        potAmount: stake * 2,
        p1: {
          id: 'p1',
          telegramId: p1TgId,
          name: p1Name,
          avatarUrl,
          isReady: true,
          isConnected: true,
        },
        p2: null,
        status: 'waiting',
        winner: null,
        settlementStatus: undefined,
        version: 1,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        engine,
        actionCache: new Map(),
        rematchVotes: new Set(),
      };

      const initialPayload = {
        engine: engine.getPersistenceState(),
        version: 1,
        winner: null,
        actionCache: [],
      };

      const created = await this.storage.createMatchWithEscrow({
        code,
        gameType,
        stakeAmount: stake,
        potAmount: stake * 2,
        p1TelegramId: p1TgId,
        status: 'waiting',
        statePayload: initialPayload,
      });

      this.creatingRoomCodes.delete(code);

      if (!created.success) {
        // In development fallback, create user if missing and retry once
        if (!created.error?.includes('Insufficient balance')) {
          await this.storage.getOrCreateUser({ id: p1TgId, first_name: p1Name, photo_url: avatarUrl });
          const retry = await this.storage.createMatchWithEscrow({
            code,
            gameType,
            stakeAmount: stake,
            potAmount: stake * 2,
            p1TelegramId: p1TgId,
            status: 'waiting',
            statePayload: initialPayload,
          });
          if (retry.success) {
            this.rooms.set(code, initialRoom);
            return { room: initialRoom };
          }
        }
        return { error: created.error || 'Could not create room' };
      }

      this.rooms.set(code, initialRoom);
      return { room: initialRoom };
    } finally {
      this.creatingUserIds.delete(p1TgId);
    }
  }

  private reserveRoomCode(requestedCode?: string): string | null {
    const normalized = requestedCode?.trim().toUpperCase();
    if (normalized) {
      if (!/^[A-Z0-9_-]{2,32}$/.test(normalized)) return null;
      if (this.rooms.has(normalized) || this.creatingRoomCodes.has(normalized)) return null;
      this.creatingRoomCodes.add(normalized);
      return normalized;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const generated = randomBytes(3).toString('hex').toUpperCase();
      if (!this.rooms.has(generated) && !this.creatingRoomCodes.has(generated)) {
        this.creatingRoomCodes.add(generated);
        return generated;
      }
    }

    return null;
  }

  getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  getOpenRooms(): RoomStatePayload[] {
    const openRooms: RoomStatePayload[] = [];
    for (const room of this.rooms.values()) {
      if (room.status === 'waiting') {
        openRooms.push(this.getRoomSnapshot(room));
      }
    }
    return openRooms;
  }

  hasCachedAction(code: string, requestId?: string): boolean {
    if (!requestId) return false;
    return Boolean(this.rooms.get(code)?.actionCache.has(requestId));
  }

  /**
   * Atomically join an active waiting room with Player 2's escrowed stake.
   */
  async joinRoom(
    code: string,
    p2TgId: number,
    p2Name: string,
    avatarUrl?: string
  ): Promise<{ room?: GameRoom; error?: string }> {
    const normalizedCode = code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,32}$/.test(normalizedCode)) {
      return { error: 'Invalid room code format' };
    }

    let room = this.rooms.get(normalizedCode);
    if (!room) {
      room = await this.restorePersistedRoomByCode(normalizedCode);
      if (!room) {
        return { error: 'Room not found' };
      }
    }

    // Idempotent re-entry if Player 2 has already joined
    if (room.p2 && room.p2.telegramId === p2TgId) {
      return { room };
    }

    if (room.status !== 'waiting' || (room.p2 && room.p2.telegramId !== p2TgId)) {
      return { error: 'Room is full or already in progress' };
    }

    if (room.p1 && room.p1.telegramId === p2TgId) {
      return { error: 'You cannot join your own duel' };
    }

    if (!Number.isSafeInteger(room.stakeAmount) || room.stakeAmount < MIN_STAKE || room.stakeAmount > MAX_STAKE) {
      return { error: 'Invalid stake configuration' };
    }

    const nextVersion = room.version + 1;
    const joinResult = await this.storage.joinMatchWithEscrow({
      code: normalizedCode,
      p2TelegramId: p2TgId,
      statePayload: {
        engine: room.engine.getPersistenceState(),
        version: nextVersion,
        winner: null,
        actionCache: Array.from(room.actionCache.entries()).slice(-50),
      },
    });

    if (!joinResult.success) {
      if (!joinResult.error?.includes('Insufficient balance')) {
        await this.storage.getOrCreateUser({ id: p2TgId, first_name: p2Name, photo_url: avatarUrl });
        const retry = await this.storage.joinMatchWithEscrow({
          code: normalizedCode,
          p2TelegramId: p2TgId,
          statePayload: {
            engine: room.engine.getPersistenceState(),
            version: nextVersion,
            winner: null,
            actionCache: Array.from(room.actionCache.entries()).slice(-50),
          },
        });
        if (!retry.success) {
          return { error: retry.error || 'Could not join room' };
        }
      } else {
        return { error: joinResult.error };
      }
    }

    room.p2 = {
      id: 'p2',
      telegramId: p2TgId,
      name: p2Name,
      avatarUrl,
      isReady: true,
      isBot: false,
      isConnected: true,
    };
    room.potAmount = room.stakeAmount * 2;
    room.status = 'playing';
    room.version = nextVersion;
    room.lastActivityAt = Date.now();
    this.startTurnTimer(normalizedCode);

    return { room };
  }

  async reconnectPlayer(code: string, tgId: number): Promise<{ room?: GameRoom; role?: PlayerRole }> {
    const room = this.rooms.get(code);
    if (!room) return {};

    let role: PlayerRole | undefined;

    if (room.p1 && room.p1.telegramId === tgId) {
      room.p1.isConnected = true;
      role = 'p1';
      if (room.p1DisconnectTimer) {
        clearTimeout(room.p1DisconnectTimer);
        room.p1DisconnectTimer = undefined;
      }
    } else if (room.p2 && room.p2.telegramId === tgId) {
      room.p2.isConnected = true;
      role = 'p2';
      if (room.p2DisconnectTimer) {
        clearTimeout(room.p2DisconnectTimer);
        room.p2DisconnectTimer = undefined;
      }
    }

    if (room.emptyRoomTimer) {
      clearTimeout(room.emptyRoomTimer);
      room.emptyRoomTimer = undefined;
    }

    if (role) {
      room.version += 1;
      room.lastActivityAt = Date.now();

      try {
        await this.persistRoomState(room);
      } catch (error) {
        room.version -= 1;
        room.lastActivityAt = Date.now();
        if (role === 'p1' && room.p1) room.p1.isConnected = false;
        if (role === 'p2' && room.p2) room.p2.isConnected = false;
        console.error(`Could not durably reconnect ${tgId} to room ${code}:`, error);
        return {};
      }

      connectionManager.broadcast(room, {
        type: 'PLAYER_RECONNECTED',
        payload: { player: role, version: room.version },
      });

      if (room.status === 'playing') {
        this.startTurnTimer(code);
      }

      return { room, role };
    }

    return {};
  }

  async handleDisconnect(tgId: number) {
    for (const [code, room] of this.rooms.entries()) {
      let playerRole: PlayerRole | null = null;

      if (room.p1 && room.p1.telegramId === tgId) {
        room.p1.isConnected = false;
        playerRole = 'p1';
      } else if (room.p2 && room.p2.telegramId === tgId) {
        room.p2.isConnected = false;
        playerRole = 'p2';
      }

      if (playerRole) {
        room.version += 1;
        room.lastActivityAt = Date.now();
        await this.persistRoomState(room).catch((error) => {
          console.error(`Could not persist disconnect for room ${code}:`, error);
        });

        if (room.status === 'playing') {
          this.clearTurnTimer(room);
          connectionManager.broadcast(room, {
            type: 'PLAYER_DISCONNECTED',
            payload: {
              player: playerRole,
              version: room.version,
              timeoutMs: DISCONNECT_FORFEIT_TIMEOUT_MS,
            },
          });

          if (playerRole === 'p1' && !room.p1DisconnectTimer) {
            room.p1DisconnectTimer = setTimeout(() => {
              this.handleForfeitTimeout(code, 'p1');
            }, DISCONNECT_FORFEIT_TIMEOUT_MS);
          } else if (playerRole === 'p2' && !room.p2DisconnectTimer) {
            room.p2DisconnectTimer = setTimeout(() => {
              this.handleForfeitTimeout(code, 'p2');
            }, DISCONNECT_FORFEIT_TIMEOUT_MS);
          }
        } else {
          connectionManager.broadcast(room, {
            type: 'PLAYER_DISCONNECTED',
            payload: { player: playerRole, version: room.version },
          });

          const isP1Disconnected = !room.p1 || !room.p1.isConnected;
          const isP2Disconnected = !room.p2 || !room.p2.isConnected;

          if (isP1Disconnected && isP2Disconnected && !room.emptyRoomTimer) {
            room.emptyRoomTimer = setTimeout(() => {
              const currentRoom = this.rooms.get(code);
              if (
                currentRoom &&
                (!currentRoom.p1 || !currentRoom.p1.isConnected) &&
                (!currentRoom.p2 || !currentRoom.p2.isConnected)
              ) {
                this.deleteRoom(code);
              }
            }, 30000);
          }
        }
      }
    }
  }

  /**
   * Unified forfeit settlement for disconnect timeouts and voluntary resignations.
   */
  async settleForfeit(
    code: string,
    forfeiterRole: PlayerRole,
    reason: 'disconnect_timeout' | 'resignation'
  ): Promise<{ success: boolean; winnerRole?: PlayerRole; error?: string }> {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'playing') return { success: false, error: 'Match is not playing' };

    if (room.p1DisconnectTimer) {
      clearTimeout(room.p1DisconnectTimer);
      room.p1DisconnectTimer = undefined;
    }
    if (room.p2DisconnectTimer) {
      clearTimeout(room.p2DisconnectTimer);
      room.p2DisconnectTimer = undefined;
    }
    if (room.emptyRoomTimer) {
      clearTimeout(room.emptyRoomTimer);
      room.emptyRoomTimer = undefined;
    }
    this.clearTurnTimer(room);

    const winnerRole: PlayerRole = forfeiterRole === 'p1' ? 'p2' : 'p1';
    room.status = 'gameover';
    room.winner = winnerRole;
    room.settlementStatus = 'pending';
    room.version += 1;
    room.lastActivityAt = Date.now();

    await this.persistRoomState(room).catch((err) => {
      console.error(`Could not persist pending forfeit for ${code}:`, err);
    });

    const winnerTgId = winnerRole === 'p1' ? room.p1?.telegramId : room.p2?.telegramId;
    const loserTgId = winnerRole === 'p1' ? room.p2?.telegramId : room.p1?.telegramId;

    let winnerPayout = Math.floor(room.potAmount * 0.9);
    let loserPayout = 0;
    let arenaFee = room.potAmount - winnerPayout;
    const xpEarned = 150;

    if (winnerTgId && loserTgId) {
      try {
        const payout = await this.storage.finalizeWinMatch(
          code,
          room.gameType,
          room.stakeAmount,
          winnerTgId,
          loserTgId
        );
        if (payout) {
          winnerPayout = payout.winnerPayout;
          loserPayout = payout.loserPayout;
          arenaFee = payout.arenaFee;
        }
        room.settlementStatus = 'committed';
      } catch (err) {
        console.error(`❌ Error finalizing forfeit match ${code}:`, err);
        room.settlementStatus = 'failed';
        await this.persistRoomState(room).catch((persistError) => {
          console.error(`Could not persist failed forfeit settlement for ${code}:`, persistError);
        });
        connectionManager.broadcast(room, {
          type: 'SETTLEMENT_PENDING',
          payload: { roomCode: code, winner: winnerRole, settlementStatus: 'failed', version: room.version },
        });
        return { success: false, error: 'Settlement failed' };
      }
    }

    await this.persistRoomState(room).catch((error) => {
      console.error(`Could not persist committed forfeit settlement for ${code}:`, error);
    });

    connectionManager.broadcast(room, {
      type: 'GAME_OVER',
      payload: {
        roomCode: code,
        winner: winnerRole,
        potAmount: room.potAmount,
        winnerPayout,
        loserPayout,
        arenaFee,
        xpEarned,
        version: room.version,
        isForfeit: true,
        settlementStatus: 'committed',
      },
    });
    await this.notifyAccounts([room.p1?.telegramId, room.p2?.telegramId]);

    return { success: true, winnerRole };
  }

  async handleForfeitTimeout(code: string, disconnectedRole: PlayerRole) {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'playing') return;
    const disconnectedPlayer = disconnectedRole === 'p1' ? room.p1 : room.p2;
    if (!disconnectedPlayer || disconnectedPlayer.isConnected) return;

    await this.settleForfeit(code, disconnectedRole, 'disconnect_timeout');
  }

  clearTurnTimer(room: GameRoom): void {
    if (room.turnTimer) {
      clearTimeout(room.turnTimer);
      room.turnTimer = undefined;
    }
  }

  startTurnTimer(code: string): void {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'playing' || !room.p1?.isConnected || !room.p2?.isConnected) return;

    this.clearTurnTimer(room);

    // 20s per turn timeout (15s turn + 5s network grace)
    room.turnTimer = setTimeout(() => {
      void this.handleTurnTimeout(code);
    }, 20_000);

    if (room.turnTimer && typeof room.turnTimer === 'object' && 'unref' in room.turnTimer) {
      (room.turnTimer as any).unref();
    }
  }

  async handleTurnTimeout(code: string): Promise<void> {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'playing') return;

    if (room.gameType === 'rps') {
      const state = room.engine.getState() as any;
      const p1HasChosen = Boolean(state.p1HasChosen);
      const p2HasChosen = Boolean(state.p2HasChosen);

      if (!p1HasChosen && p2HasChosen) {
        await this.settleForfeit(code, 'p1', 'disconnect_timeout');
      } else if (!p2HasChosen && p1HasChosen) {
        await this.settleForfeit(code, 'p2', 'disconnect_timeout');
      } else if (!p1HasChosen && !p2HasChosen) {
        this.clearTurnTimer(room);
        await this.storage.cancelMatch(code);
        room.status = 'gameover';
        room.winner = 'draw';
        room.settlementStatus = 'committed';
        room.version += 1;
        connectionManager.broadcast(room, {
          type: 'GAME_OVER',
          payload: {
            roomCode: code,
            winner: 'draw',
            potAmount: room.potAmount,
            winnerPayout: room.stakeAmount,
            loserPayout: room.stakeAmount,
            arenaFee: 0,
            xpEarned: 0,
            version: room.version,
            isForfeit: true,
            settlementStatus: 'committed',
          },
        });
        await this.notifyAccounts([room.p1?.telegramId, room.p2?.telegramId]);
      }
      return;
    }

    const activePlayer = room.engine.getActivePlayer();
    await this.settleForfeit(code, activePlayer, 'disconnect_timeout');
  }

  /**
   * Pure calculation of next state without mutating in-memory room state.
   */
  calculateAction(
    code: string,
    playerRole: PlayerRole,
    actionType: string,
    payload?: unknown,
    requestId?: string
  ): CalculatedActionTransition {
    const room = this.rooms.get(code);
    if (!room) {
      const errorResult: GameActionResult = {
        success: false,
        error: 'Room not found',
        actionType,
        payload: {},
        isGameOver: false,
        winner: null,
      };
      return {
        success: false,
        error: 'Room not found',
        actionType,
        payload: {},
        isGameOver: false,
        winner: null,
        isCached: false,
        expectedVersion: 0,
        nextVersion: 0,
        nextEngineState: {},
        nextStatus: 'waiting',
        actionResult: errorResult,
        requestId,
        playerRole,
      };
    }

    // Durable idempotency check
    if (requestId && room.actionCache.has(requestId)) {
      const cached = room.actionCache.get(requestId)!;
      return {
        success: cached.success,
        error: cached.error,
        actionType: cached.actionType,
        payload: cached.payload,
        isGameOver: cached.isGameOver,
        winner: cached.winner,
        isCached: true,
        expectedVersion: room.version,
        nextVersion: room.version,
        nextEngineState: room.engine.getPersistenceState(),
        nextStatus: room.status,
        nextSettlementStatus: room.settlementStatus,
        actionResult: cached,
        requestId,
        playerRole,
      };
    }

    if (room.status !== 'playing') {
      const rejectedResult: GameActionResult = {
        success: false,
        error: 'Duel is not in progress',
        actionType,
        payload: {},
        isGameOver: room.status === 'gameover',
        winner: room.winner,
      };
      return {
        success: false,
        error: 'Duel is not in progress',
        actionType,
        payload: {},
        isGameOver: room.status === 'gameover',
        winner: room.winner,
        isCached: false,
        expectedVersion: room.version,
        nextVersion: room.version,
        nextEngineState: room.engine.getPersistenceState(),
        nextStatus: room.status,
        nextSettlementStatus: room.settlementStatus,
        actionResult: rejectedResult,
        requestId,
        playerRole,
      };
    }

    // Pure calculation on isolated engine clone
    const clone = this.createEngine(room.gameType);
    clone.restorePersistenceState(room.engine.getPersistenceState());
    const result = clone.handleAction(playerRole, actionType, payload);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Invalid move',
        actionType,
        payload: (payload as Record<string, unknown>) || {},
        isGameOver: false,
        winner: null,
        isCached: false,
        expectedVersion: room.version,
        nextVersion: room.version,
        nextEngineState: room.engine.getPersistenceState(),
        nextStatus: room.status,
        nextSettlementStatus: room.settlementStatus,
        actionResult: result,
        requestId,
        playerRole,
      };
    }

    const nextEngineState = clone.getPersistenceState();
    const nextVersion = room.version + 1;
    const nextStatus: GameRoom['status'] = result.isGameOver ? 'gameover' : 'playing';
    const nextSettlementStatus: GameRoom['settlementStatus'] = result.isGameOver ? 'pending' : undefined;

    return {
      success: true,
      actionType: result.actionType,
      payload: result.payload,
      isGameOver: result.isGameOver,
      winner: result.winner,
      isCached: false,
      expectedVersion: room.version,
      nextVersion,
      nextEngineState,
      nextStatus,
      nextSettlementStatus,
      actionResult: result,
      requestId,
      playerRole,
    };
  }

  /**
   * Persist a calculated action transition to storage before committing in-memory state.
   */
  async persistActionTransition(code: string, transition: CalculatedActionTransition): Promise<void> {
    const room = this.rooms.get(code);
    if (!room) throw new Error(`Room ${code} not found for transition persistence`);
    if (transition.isCached) return;

    const cacheEntries = Array.from(room.actionCache.entries());
    if (transition.requestId) {
      cacheEntries.push([transition.requestId, transition.actionResult]);
    }

    await this.storage.persistMatch({
      code: room.code,
      gameType: room.gameType,
      stakeAmount: room.stakeAmount,
      potAmount: room.potAmount,
      p1TelegramId: room.p1!.telegramId,
      p2TelegramId: room.p2?.telegramId,
      status: transition.nextStatus,
      statePayload: {
        engine: transition.nextEngineState,
        version: transition.nextVersion,
        winner: transition.winner,
        settlementStatus: transition.nextSettlementStatus,
        actionCache: cacheEntries.slice(-50),
      },
    });

    if (transition.requestId) {
      const playerId = transition.playerRole === 'p1' ? room.p1?.telegramId : room.p2?.telegramId;
      await this.storage.recordGameAction({
        matchCode: code,
        requestId: transition.requestId,
        playerId,
        actionType: transition.actionType,
        payload: transition.payload,
        result: transition.actionResult,
      }).catch((err) => console.error(`Could not persist game action ${transition.requestId}:`, err));
    }
  }

  /**
   * Commit a calculated transition to in-memory room state after successful persistence.
   */
  commitTransition(code: string, transition: CalculatedActionTransition): GameActionResult {
    const room = this.rooms.get(code);
    if (!room) return transition.actionResult;
    if (transition.isCached) return transition.actionResult;

    room.engine.restorePersistenceState(transition.nextEngineState);
    room.version = transition.nextVersion;
    room.status = transition.nextStatus;
    room.winner = transition.winner;
    room.settlementStatus = transition.nextSettlementStatus;
    room.lastActivityAt = Date.now();

    if (transition.requestId) {
      if (room.actionCache.size >= 50) {
        const firstKey = room.actionCache.keys().next().value;
        if (firstKey) room.actionCache.delete(firstKey);
      }
      room.actionCache.set(transition.requestId, transition.actionResult);
    }

    if (transition.isGameOver) {
      this.clearTurnTimer(room);
    } else if (room.status === 'playing') {
      this.startTurnTimer(code);
    }

    return transition.actionResult;
  }

  executeAction(
    code: string,
    playerRole: PlayerRole,
    actionType: string,
    payload?: unknown,
    requestId?: string
  ): GameActionResult {
    const transition = this.calculateAction(code, playerRole, actionType, payload, requestId);
    if (!transition.success || transition.isCached) {
      return transition.actionResult;
    }
    const result = this.commitTransition(code, transition);
    this.persistRoomState(this.rooms.get(code)!).catch((err) => {
      console.error(`Could not persist room state after action in ${code}:`, err);
    });
    return result;
  }

  async handleRematchVote(
    code: string,
    tgId: number
  ): Promise<{ bothReady: boolean; room?: GameRoom; error?: string }> {
    const room = this.rooms.get(code);
    if (!room || room.status !== 'gameover') return { bothReady: false };

    room.rematchVotes.add(tgId);

    const p1Id = room.p1?.telegramId;
    const p2Id = room.p2?.telegramId;

    if (p1Id && p2Id && room.rematchVotes.has(p1Id) && room.rematchVotes.has(p2Id)) {
      const nextRoundCode = getNextRematchCode(code);
      const rematch = await this.storage.startRematchWithEscrow({
        matchCode: code,
        nextRoundCode,
        p1TelegramId: p1Id,
        p2TelegramId: p2Id,
        stake: room.stakeAmount,
      });

      if (!rematch.success) {
        room.rematchVotes.delete(tgId);
        connectionManager.broadcast(room, {
          type: 'REMATCH_FAILED',
          payload: {
            roomCode: code,
            reason: rematch.error || 'Insufficient balance for rematch',
            timestamp: Date.now(),
          },
        });
        return { bothReady: false, error: rematch.error };
      }

      // Re-index room in memory under new match code
      this.rooms.delete(code);
      room.code = nextRoundCode;
      this.rooms.set(nextRoundCode, room);

      // Clear any hanging disconnect timers from previous match
      if (room.p1DisconnectTimer) {
        clearTimeout(room.p1DisconnectTimer);
        room.p1DisconnectTimer = undefined;
      }
      if (room.p2DisconnectTimer) {
        clearTimeout(room.p2DisconnectTimer);
        room.p2DisconnectTimer = undefined;
      }
      if (room.emptyRoomTimer) {
        clearTimeout(room.emptyRoomTimer);
        room.emptyRoomTimer = undefined;
      }

      // Reset engine and room state
      room.engine.reset();
      room.status = 'playing';
      room.winner = null;
      room.settlementStatus = undefined;
      room.version = 1;
      room.rematchVotes.clear();
      room.actionCache.clear();
      room.lastActivityAt = Date.now();

      await this.persistRoomState(room).catch((err) => {
        console.error(`Could not persist rematch state for ${nextRoundCode}:`, err);
      });

      return { bothReady: true, room };
    }

    return { bothReady: false, room };
  }

  getRoomSnapshot(room: GameRoom): RoomStatePayload {
    const state = room.engine.getState() as any;
    return {
      code: room.code,
      roomCode: room.code,
      gameType: room.gameType,
      stakeAmount: room.stakeAmount,
      potAmount: room.potAmount,
      p1: room.p1
        ? {
            id: room.p1.id,
            telegramId: room.p1.telegramId,
            name: room.p1.name,
            avatarUrl: room.p1.avatarUrl,
            isReady: room.p1.isReady,
            isBot: room.p1.isBot,
            isConnected: room.p1.isConnected,
          }
        : null,
      p2: room.p2
        ? {
            id: room.p2.id,
            telegramId: room.p2.telegramId,
            name: room.p2.name,
            avatarUrl: room.p2.avatarUrl,
            isReady: room.p2.isReady,
            isBot: room.p2.isBot,
            isConnected: room.p2.isConnected,
          }
        : null,
      status: room.status,
      activePlayer: state?.activePlayer || (room.engine as any).getActivePlayer?.() || 'p1',
      turnPhase: state?.turnPhase || 'waiting_roll',
      gameState: state,
      winner: room.winner,
      version: room.version,
    } as any;
  }

  async handleLeaveRoom(
    code: string,
    requesterTgId: number
  ): Promise<{ resigned?: boolean; deleted?: boolean; error?: string }> {
    const room = this.rooms.get(code);
    if (!room) return { error: 'Room not found' };

    const isP1 = room.p1?.telegramId === requesterTgId;
    const isP2 = room.p2?.telegramId === requesterTgId;
    if (!isP1 && !isP2) return { error: 'You are not a participant in this room' };

    const leaverRole: PlayerRole = isP1 ? 'p1' : 'p2';

    // 1. Resignation during active match
    if (room.status === 'playing') {
      const forfeit = await this.settleForfeit(code, leaverRole, 'resignation');
      return { resigned: true, error: forfeit.error };
    }

    // 2. Waiting in lobby: Host cancels and receives full escrow refund
    if (room.status === 'waiting') {
      if (leaverRole === 'p1') {
        await this.deleteRoom(code, requesterTgId);
        return { deleted: true };
      }
      if (leaverRole === 'p2') {
        const refund = await this.storage.refundStake(requesterTgId, room.stakeAmount, code);
        if (!refund.success) return { error: 'Could not refund the leaving player' };
        room.p2 = null;
        room.version += 1;
        await this.persistRoomState(room).catch((error) => {
          console.error(`Could not persist room ${code} after player departure:`, error);
        });
        return { resigned: false };
      }
    }

    // 3. Match completed (gameover): detach player and garbage collect when both departed
    if (room.status === 'gameover') {
      if (isP1 && room.p1) room.p1.isConnected = false;
      if (isP2 && room.p2) room.p2.isConnected = false;
      const bothDisconnected = (!room.p1 || !room.p1.isConnected) && (!room.p2 || !room.p2.isConnected);
      if (bothDisconnected) {
        if (room.p1DisconnectTimer) clearTimeout(room.p1DisconnectTimer);
        if (room.p2DisconnectTimer) clearTimeout(room.p2DisconnectTimer);
        if (room.emptyRoomTimer) clearTimeout(room.emptyRoomTimer);
        this.rooms.delete(code);
      }
      return { resigned: false };
    }

    return { resigned: false };
  }

  async deleteRoom(code: string, requesterTgId?: number): Promise<boolean> {
    const room = this.rooms.get(code);
    if (!room) return false;
    if (requesterTgId && room.p1?.telegramId !== requesterTgId) return false;

    if (room.p1DisconnectTimer) {
      clearTimeout(room.p1DisconnectTimer);
    }
    if (room.p2DisconnectTimer) {
      clearTimeout(room.p2DisconnectTimer);
    }
    if (room.emptyRoomTimer) {
      clearTimeout(room.emptyRoomTimer);
    }
    this.clearTurnTimer(room);

    // Refund escrowed stake if room is deleted while waiting
    if (room.status === 'waiting') {
      await this.storage.cancelMatch(code);
    }

    try {
      await this.storage.deleteMatch(code);
    } catch (error) {
      console.error(`Could not delete persisted room ${code}:`, error);
      return false;
    }

    this.rooms.delete(code);
    return true;
  }

  getPlayerByRole(room: GameRoom, role: PlayerRole): RoomPlayer | null {
    return role === 'p1' ? room.p1 : room.p2;
  }

  async cleanupExpiredRooms(): Promise<void> {
    const now = Date.now();
    const codes = Array.from(this.rooms.keys());
    for (const code of codes) {
      const room = this.rooms.get(code);
      if (!room) continue;

      if (room.status === 'waiting' && now - room.createdAt > this.WAITING_ROOM_EXPIRY_MS) {
        const { roomCommandQueue } = await import('./roomCommandQueue');
        await roomCommandQueue.withRoomLock(code, async () => {
          const fresh = this.rooms.get(code);
          if (fresh && fresh.status === 'waiting' && now - fresh.createdAt > this.WAITING_ROOM_EXPIRY_MS) {
            await this.deleteRoom(code, fresh.p1?.telegramId);
          }
        });
      } else if (room.status === 'gameover' && now - room.lastActivityAt > this.GAMEOVER_ROOM_EXPIRY_MS) {
        const { roomCommandQueue } = await import('./roomCommandQueue');
        await roomCommandQueue.withRoomLock(code, async () => {
          const fresh = this.rooms.get(code);
          if (fresh && fresh.status === 'gameover' && now - fresh.lastActivityAt > this.GAMEOVER_ROOM_EXPIRY_MS) {
            if (fresh.p1DisconnectTimer) clearTimeout(fresh.p1DisconnectTimer);
            if (fresh.p2DisconnectTimer) clearTimeout(fresh.p2DisconnectTimer);
            if (fresh.emptyRoomTimer) clearTimeout(fresh.emptyRoomTimer);
            this.rooms.delete(code);
          }
        });
      }
    }
  }

  private async notifyAccounts(telegramIds: Array<number | undefined>) {
    const uniqueIds = Array.from(new Set(telegramIds.filter((id): id is number => typeof id === 'number')));
    for (const telegramId of uniqueIds) {
      const snapshot = await this.storage.getAccountSnapshot(telegramId);
      if (snapshot) {
        connectionManager.sendToUser(telegramId, {
          type: 'ACCOUNT_UPDATED',
          payload: { user: snapshot },
        });
      }
    }
  }
}
