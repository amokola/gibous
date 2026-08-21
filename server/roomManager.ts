import { GameType, PlayerRole, MatchWinner, RoomStatePayload } from '../shared';
import { IServerGameEngine, GameActionResult } from './engines/IServerGameEngine';
import { ServerSnakeLadderEngine } from './engines/SnakeLadderEngine';
import { ServerConnect4Engine } from './engines/Connect4Engine';
import { ServerRPSEngine } from './engines/RPSEngine';
import { connectionManager } from './connectionManager';

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
  version: number;
  createdAt: number;
  lastActivityAt: number;
  engine: IServerGameEngine;
  disconnectTimer?: ReturnType<typeof setTimeout>;
  actionCache: Map<string, GameActionResult>;
}

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private readonly MAX_ROOM_CAPACITY = 1000;
  private readonly WAITING_ROOM_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

  constructor() {
    // Periodic room cleanup every 2 minutes
    setInterval(() => this.cleanupExpiredRooms(), 2 * 60 * 1000);
  }

  createRoom(
    code: string,
    gameType: GameType,
    stake: number,
    p1TgId: number,
    p1Name: string,
    avatarUrl?: string
  ): GameRoom {
    if (this.rooms.size >= this.MAX_ROOM_CAPACITY) {
      this.cleanupExpiredRooms();
    }

    let engine: IServerGameEngine;
    if (gameType === 'connect4') {
      engine = new ServerConnect4Engine();
    } else if (gameType === 'rps') {
      engine = new ServerRPSEngine();
    } else {
      engine = new ServerSnakeLadderEngine();
    }

    const room: GameRoom = {
      code,
      gameType,
      stakeAmount: stake,
      potAmount: stake, // Single player deposited initially
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
      version: 1,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      engine,
      actionCache: new Map(),
    };

    this.rooms.set(code, room);
    return room;
  }

  getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code);
  }

  joinRoom(
    code: string,
    p2TgId: number,
    p2Name: string,
    avatarUrl?: string
  ): { room?: GameRoom; error?: string } {
    const room = this.rooms.get(code);
    if (!room) {
      return { error: 'Room not found' };
    }

    if (room.status !== 'waiting' || (room.p2 && room.p2.telegramId !== p2TgId)) {
      return { error: 'Room is full or match already in progress' };
    }

    if (room.p1 && room.p1.telegramId === p2TgId) {
      return { error: 'Cannot join your own room as opponent' };
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
    room.potAmount = room.stakeAmount * 2; // Both players staked
    room.status = 'playing';
    room.version += 1;
    room.lastActivityAt = Date.now();

    return { room };
  }

  reconnectPlayer(code: string, tgId: number): { room?: GameRoom; role?: PlayerRole } {
    const room = this.rooms.get(code);
    if (!room) return {};

    if (room.p1 && room.p1.telegramId === tgId) {
      room.p1.isConnected = true;
      room.version += 1;
      room.lastActivityAt = Date.now();

      // Cancel disconnect cleanup timer if present
      if (room.disconnectTimer) {
        clearTimeout(room.disconnectTimer);
        room.disconnectTimer = undefined;
      }

      return { room, role: 'p1' };
    }

    if (room.p2 && room.p2.telegramId === tgId) {
      room.p2.isConnected = true;
      room.version += 1;
      room.lastActivityAt = Date.now();

      // Cancel disconnect cleanup timer if present
      if (room.disconnectTimer) {
        clearTimeout(room.disconnectTimer);
        room.disconnectTimer = undefined;
      }

      return { room, role: 'p2' };
    }

    return {};
  }

  handleDisconnect(tgId: number) {
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

        connectionManager.broadcast(room, {
          type: 'PLAYER_DISCONNECTED',
          payload: { player: playerRole, version: room.version },
        });

        // If both players are disconnected, schedule 30-second graceful room cleanup
        const isP1Disconnected = !room.p1 || !room.p1.isConnected;
        const isP2Disconnected = !room.p2 || !room.p2.isConnected;

        if (isP1Disconnected && isP2Disconnected && !room.disconnectTimer) {
          room.disconnectTimer = setTimeout(() => {
            const currentRoom = this.rooms.get(code);
            if (currentRoom && (!currentRoom.p1 || !currentRoom.p1.isConnected) && (!currentRoom.p2 || !currentRoom.p2.isConnected)) {
              this.deleteRoom(code);
            }
          }, 30000);
        }
      }
    }
  }

  executeAction(
    code: string,
    playerRole: PlayerRole,
    actionType: string,
    payload?: unknown,
    requestId?: string
  ): GameActionResult {
    const room = this.rooms.get(code);
    if (!room) {
      return {
        success: false,
        error: 'Room not found',
        actionType,
        payload: {},
        isGameOver: false,
        winner: null,
      };
    }

    // Idempotency check
    if (requestId && room.actionCache.has(requestId)) {
      return room.actionCache.get(requestId)!;
    }

    const result = room.engine.handleAction(playerRole, actionType, payload);
    if (result.success) {
      room.version += 1;
      room.lastActivityAt = Date.now();

      if (result.isGameOver) {
        room.status = 'gameover';
        room.winner = result.winner;
      }

      // Cache result for idempotency (limit cache size to 50 items)
      if (requestId) {
        if (room.actionCache.size >= 50) {
          const firstKey = room.actionCache.keys().next().value;
          if (firstKey) room.actionCache.delete(firstKey);
        }
        room.actionCache.set(requestId, result);
      }
    }

    return result;
  }

  getRoomSnapshot(room: GameRoom): RoomStatePayload {
    const engineState = room.engine.getState();
    const activePlayer = room.engine.getActivePlayer();
    const isOver = room.engine.isGameOver();

    let turnPhase = 'PLAYING';
    if (isOver) {
      turnPhase = 'GAME_OVER';
    } else if (room.gameType === 'snake') {
      turnPhase = 'WAITING_ROLL';
    } else if (room.gameType === 'connect4') {
      turnPhase = 'WAITING_DROP';
    } else if (room.gameType === 'rps') {
      turnPhase = 'WAITING_CHOICE';
    }

    return {
      code: room.code,
      gameType: room.gameType,
      status: room.status,
      stakeAmount: room.stakeAmount,
      potAmount: room.potAmount,
      p1: room.p1
        ? {
            id: 'p1',
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
            id: 'p2',
            telegramId: room.p2.telegramId,
            name: room.p2.name,
            avatarUrl: room.p2.avatarUrl,
            isReady: room.p2.isReady,
            isBot: room.p2.isBot,
            isConnected: room.p2.isConnected,
          }
        : null,
      activePlayer,
      turnPhase,
      winner: room.winner,
      version: room.version,
      gameState: engineState,
    };
  }

  getOpenRooms() {
    const list = [];
    for (const [, room] of this.rooms.entries()) {
      if (room.status === 'waiting' && room.p1) {
        list.push({
          code: room.code,
          gameType: room.gameType,
          stakeAmount: room.stakeAmount,
          potAmount: room.potAmount,
          hostName: room.p1.name,
          hostAvatar: room.p1.avatarUrl,
          hostTgId: room.p1.telegramId,
          createdAt: room.createdAt,
        });
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  deleteRoom(code: string, requesterTgId?: number): boolean {
    const room = this.rooms.get(code);
    if (!room) return false;
    if (requesterTgId && room.p1?.telegramId !== requesterTgId) return false;

    if (room.disconnectTimer) {
      clearTimeout(room.disconnectTimer);
    }

    this.rooms.delete(code);
    return true;
  }

  getPlayerByRole(room: GameRoom, role: PlayerRole): RoomPlayer | null {
    return role === 'p1' ? room.p1 : room.p2;
  }

  cleanupExpiredRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (room.status === 'waiting' && now - room.createdAt > this.WAITING_ROOM_EXPIRY_MS) {
        this.deleteRoom(code);
      }
    }
  }
}
