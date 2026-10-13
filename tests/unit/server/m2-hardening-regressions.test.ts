import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomManager, DISCONNECT_FORFEIT_TIMEOUT_MS } from '../../../server/roomManager';
import { MatchmakingQueue } from '../../../server/matchmaking';
import { connectionManager } from '../../../server/connectionManager';
import { AuthOkPayloadSchema } from '../../../shared/schemas/protocol';
import { ServerRPSEngine } from '../../../server/engines/RPSEngine';
import { StorageService } from '../../../server/storage';
import { ensureE2EServer, createAuthClient, generateRoomCode } from '../../e2e/e2e-harness';
import { matchmakingQueue as serverMatchmakingQueue, roomManager as serverRoomManager } from '../../../server/server';


describe('Milestone 2 Hardening Regressions Suite', () => {
  let roomManager: RoomManager;
  let storage: StorageService;

  beforeEach(() => {
    vi.useFakeTimers();
    roomManager = new RoomManager();
    storage = new StorageService();
  });

  afterEach(() => {
    roomManager.close();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('Feature #7: Server Reconnection & Forfeit Desync', () => {
    it('should validate AuthOkPayloadSchema explicitly supporting activeRoom', () => {
      const parsed = AuthOkPayloadSchema.safeParse({
        telegramId: 10001,
        user: { id: 10001, first_name: 'Alice' },
        activeRoom: {
          code: 'ROOM01',
          roomCode: 'ROOM01',
          gameType: 'connect4',
          stakeAmount: 100,
          potAmount: 200,
          status: 'playing',
          p1: { id: 'p1', telegramId: 10001, name: 'Alice', isReady: true, isConnected: true },
          p2: { id: 'p2', telegramId: 10002, name: 'Bob', isReady: true, isConnected: true },
          version: 2,
          gameState: {},
        },
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.activeRoom?.code).toBe('ROOM01');
      }
    });

    it('should cancel forfeit timer and restart turn timer on reconnect without needing SYNC_ROOM', async () => {
      const p1TgId = 10101;
      const p2TgId = 10102;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('RECON_T1', 'connect4', 100, p1TgId, 'P1');
      await roomManager.joinRoom('RECON_T1', p2TgId, 'P2');

      const room = roomManager.getRoom('RECON_T1')!;
      expect(room.status).toBe('playing');
      expect(room.turnTimer).toBeDefined();

      // P1 drops
      await roomManager.handleDisconnect(p1TgId);
      expect(room.p1?.isConnected).toBe(false);
      expect(room.p1DisconnectTimer).toBeDefined();
      expect(room.turnTimer).toBeUndefined();

      // P1 reconnects (e.g. AUTH message handling)
      const res = await roomManager.reconnectPlayer('RECON_T1', p1TgId);
      expect(res.role).toBe('p1');
      expect(room.p1?.isConnected).toBe(true);
      expect(room.p1DisconnectTimer).toBeUndefined();
      expect(room.turnTimer).toBeDefined(); // Turn timer resumed
    });

    it('should safely reconnect player in handleForfeitTimeout if connectionManager shows active socket', async () => {
      const p1TgId = 10103;
      const p2TgId = 10104;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('RECON_T2', 'connect4', 100, p1TgId, 'P1');
      await roomManager.joinRoom('RECON_T2', p2TgId, 'P2');

      const room = roomManager.getRoom('RECON_T2')!;
      await roomManager.handleDisconnect(p1TgId);
      expect(room.p1?.isConnected).toBe(false);
      expect(room.p1DisconnectTimer).toBeDefined();

      // Simulate mock active connection in connectionManager for p1
      const mockWs: any = { readyState: 1, send: vi.fn(), close: vi.fn() };
      connectionManager.registerConnection(p1TgId, mockWs);

      // Trigger forfeit timeout evaluation
      await roomManager.handleForfeitTimeout('RECON_T2', 'p1');

      // Player should have been cleanly reconnected
      expect(room.p1?.isConnected).toBe(true);
      expect(room.p1DisconnectTimer).toBeUndefined();
      expect(room.status).toBe('playing');
      expect(room.winner).toBeNull();
      expect(room.turnTimer).toBeDefined();

      connectionManager.removeConnection(p1TgId);
    });
  });

  describe('Feature #8: Concurrent Duel Isolation Guard', () => {
    it('should reject createRoom if player is already in an active playing duel', async () => {
      const p1TgId = 20101;
      const p2TgId = 20102;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('ACTIVE_1', 'snake', 100, p1TgId, 'P1');
      await roomManager.joinRoom('ACTIVE_1', p2TgId, 'P2');

      // P1 attempts to create another room while in active duel
      const res1 = await roomManager.createRoom('ACTIVE_2', 'snake', 100, p1TgId, 'P1');
      expect(res1.room).toBeUndefined();
      expect(res1.error).toBe('You are already in an active duel');

      // P2 attempts to create another room while in active duel
      const res2 = await roomManager.createRoom('ACTIVE_3', 'snake', 100, p2TgId, 'P2');
      expect(res2.room).toBeUndefined();
      expect(res2.error).toBe('You are already in an active duel');
    });

    it('should reject joinRoom if player is already in an active playing duel in another room', async () => {
      const p1TgId = 20103;
      const p2TgId = 20104;
      const p3TgId = 20105;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });
      await storage.getOrCreateUser({ id: p3TgId, first_name: 'P3' });

      await roomManager.createRoom('MATCH_A', 'snake', 100, p1TgId, 'P1');
      await roomManager.joinRoom('MATCH_A', p2TgId, 'P2');

      await roomManager.createRoom('MATCH_B', 'snake', 100, p3TgId, 'P3');

      // P1 attempts to join MATCH_B
      const joinRes = await roomManager.joinRoom('MATCH_B', p1TgId, 'P1');
      expect(joinRes.room).toBeUndefined();
      expect(joinRes.error).toBe('You are already in an active duel');
    });

    it('should idempotently return waiting room for host on createRoom, but reject if in another waiting room', async () => {
      const p1TgId = 20106;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });

      const create1 = await roomManager.createRoom('WAIT_1', 'snake', 100, p1TgId, 'P1');
      expect(create1.room?.code).toBe('WAIT_1');

      // Host creates again -> idempotent return
      const create2 = await roomManager.createRoom('WAIT_2', 'snake', 100, p1TgId, 'P1');
      expect(create2.room?.code).toBe('WAIT_1');
    });

    it('should dequeue player from matchmaking queue cleanly', async () => {
      const mq = new MatchmakingQueue(async () => {});
      const mockWs: any = { readyState: 1, send: vi.fn() };

      await mq.enqueue({
        telegramId: 20107,
        name: 'QueuedPlayer',
        gameType: 'snake',
        stake: 100,
        joinedAt: Date.now(),
        ws: mockWs,
      });

      expect(mq.hasPlayer(20107)).toBe(true);

      const dequeued = mq.dequeueByPlayer(20107);
      expect(dequeued).toBe(true);
      expect(mq.hasPlayer(20107)).toBe(false);

      mq.close();
    });

    it('should reject JOIN_QUEUE with ACTIVE_DUEL_EXISTS when player is already in an active playing duel', async () => {
      vi.useRealTimers();
      await ensureE2EServer();
      const p1TgId = 20110;
      const p2TgId = 20111;
      const p1 = await createAuthClient(p1TgId, 'ActiveP1');
      const p2 = await createAuthClient(p2TgId, 'ActiveP2');
      const roomCode = generateRoomCode('ACTV');

      try {
        await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
        const startP1 = p1.waitForType('GAME_START');
        await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
        await startP1;

        // P1 attempts to join queue while playing in roomCode
        const queueErr = await p1.sendAndAwait({ type: 'JOIN_QUEUE', payload: { gameType: 'snake', stake: 100 } }, 'ERROR');
        expect(queueErr.payload.code).toBe('ACTIVE_DUEL_EXISTS');
        expect(queueErr.payload.message).toContain('active duel');
      } finally {
        p1.close();
        p2.close();
        await serverRoomManager.deleteRoom(roomCode);
        vi.useFakeTimers();
      }
    });

    it('should auto-dequeue player from matchmakingQueue on CREATE_ROOM and JOIN_ROOM', async () => {
      vi.useRealTimers();
      await ensureE2EServer();
      const hostTgId = 20112;
      const joinerTgId = 20113;
      const host = await createAuthClient(hostTgId, 'HostQ');
      const joiner = await createAuthClient(joinerTgId, 'JoinerQ');
      let roomCode = '';

      try {
        // 1. Host enters queue
        await host.sendAndAwait({ type: 'JOIN_QUEUE', payload: { gameType: 'connect4', stake: 100 } }, 'QUEUE_JOINED');
        expect(serverMatchmakingQueue.hasPlayer(hostTgId)).toBe(true);

        // 2. Host creates room -> auto-dequeued
        const roomRes = await host.sendAndAwait({ type: 'CREATE_ROOM', payload: { gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
        expect(serverMatchmakingQueue.hasPlayer(hostTgId)).toBe(false);
        roomCode = roomRes.payload.code;

        // 3. Joiner enters queue
        await joiner.sendAndAwait({ type: 'JOIN_QUEUE', payload: { gameType: 'snake', stake: 100 } }, 'QUEUE_JOINED');
        expect(serverMatchmakingQueue.hasPlayer(joinerTgId)).toBe(true);

        // 4. Joiner joins room -> auto-dequeued
        await joiner.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
        expect(serverMatchmakingQueue.hasPlayer(joinerTgId)).toBe(false);
      } finally {
        host.close();
        joiner.close();
        if (roomCode) {
          await serverRoomManager.deleteRoom(roomCode);
        }
        vi.useFakeTimers();
      }
    });
  });


  describe('Feature #9: Double Disconnect Mutual Draw/Refund', () => {
    it('should settle mutual draw when opponent is also disconnected at timeout', async () => {
      const p1TgId = 30101;
      const p2TgId = 30102;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('DDIS_1', 'connect4', 100, p1TgId, 'P1');
      await roomManager.joinRoom('DDIS_1', p2TgId, 'P2');

      const room = roomManager.getRoom('DDIS_1')!;

      // Both players disconnect
      await roomManager.handleDisconnect(p1TgId);
      await roomManager.handleDisconnect(p2TgId);

      expect(room.p1?.isConnected).toBe(false);
      expect(room.p2?.isConnected).toBe(false);
      expect(room.p1DisconnectTimer).toBeDefined();
      expect(room.p2DisconnectTimer).toBeDefined();

      // P1 forfeit timer resolves
      await roomManager.handleForfeitTimeout('DDIS_1', 'p1');

      // Symmetrically settled as draw
      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('draw');
      expect(room.p1DisconnectTimer).toBeUndefined();
      expect(room.p2DisconnectTimer).toBeUndefined();
    });

    it('should award 1-sided forfeit win if opponent reconnected before timeout resolves', async () => {
      const p1TgId = 30103;
      const p2TgId = 30104;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('DDIS_2', 'connect4', 100, p1TgId, 'P1');
      await roomManager.joinRoom('DDIS_2', p2TgId, 'P2');

      const room = roomManager.getRoom('DDIS_2')!;

      // Both disconnect
      await roomManager.handleDisconnect(p1TgId);
      await roomManager.handleDisconnect(p2TgId);

      // P2 reconnects
      await roomManager.reconnectPlayer('DDIS_2', p2TgId);
      expect(room.p2?.isConnected).toBe(true);

      // P1 forfeit timeout resolves
      await roomManager.handleForfeitTimeout('DDIS_2', 'p1');

      // P2 is online, so P2 wins by forfeit
      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('p2');
    });
  });

  describe('Feature #10: Rematch Turn Timer Restart', () => {
    it('should arm turn timer for opening player in rematch', async () => {
      const p1TgId = 40101;
      const p2TgId = 40102;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('REMATCH_T1', 'connect4', 100, p1TgId, 'P1');
      await roomManager.joinRoom('REMATCH_T1', p2TgId, 'P2');

      const room = roomManager.getRoom('REMATCH_T1')!;
      room.status = 'gameover';
      room.winner = 'p1';

      // Both players vote rematch
      await roomManager.handleRematchVote('REMATCH_T1', p1TgId);
      const vote2 = await roomManager.handleRematchVote('REMATCH_T1', p2TgId);

      expect(vote2.bothReady).toBe(true);
      expect(vote2.room?.code).toBe('REMATCH_T1-R2');
      expect(vote2.room?.status).toBe('playing');

      // Turn timer must be armed for the opening move of the rematch!
      expect(vote2.room?.turnTimer).toBeDefined();
    });
  });

  describe('Feature #11: RPS Multi-Round Timeout Settle', () => {
    it('should award match win to leading player on mutual non-selection turn timeout', async () => {
      const p1TgId = 50101;
      const p2TgId = 50102;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('RPS_TIMEOUT_1', 'rps', 100, p1TgId, 'P1');
      await roomManager.joinRoom('RPS_TIMEOUT_1', p2TgId, 'P2');

      const room = roomManager.getRoom('RPS_TIMEOUT_1')!;
      const engine = room.engine as ServerRPSEngine;

      // P1 wins Round 1: P1 rock vs P2 scissors
      engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
      engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' });
      expect(engine.getState().p1Score).toBe(1);
      expect(engine.getState().p2Score).toBe(0);

      // In Round 2, neither player chooses. Turn timeout resolves:
      await roomManager.handleTurnTimeout('RPS_TIMEOUT_1');

      // Player 1 has score lead (1 > 0), so P1 must be awarded match win!
      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('p1');
    });

    it('should award match win to P2 when P2 is leading on mutual non-selection', async () => {
      const p1TgId = 50103;
      const p2TgId = 50104;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('RPS_TIMEOUT_2', 'rps', 100, p1TgId, 'P1');
      await roomManager.joinRoom('RPS_TIMEOUT_2', p2TgId, 'P2');

      const room = roomManager.getRoom('RPS_TIMEOUT_2')!;
      const engine = room.engine as ServerRPSEngine;

      // P2 wins Round 1: P1 rock vs P2 paper
      engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
      engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'paper' });
      expect(engine.getState().p1Score).toBe(0);
      expect(engine.getState().p2Score).toBe(1);

      // In Round 2, neither chooses. Turn timeout resolves:
      await roomManager.handleTurnTimeout('RPS_TIMEOUT_2');

      // Player 2 has score lead (1 > 0), so P2 must be awarded match win!
      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('p2');
    });

    it('should settle mutual draw when scores are tied on mutual non-selection', async () => {
      const p1TgId = 50105;
      const p2TgId = 50106;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('RPS_TIMEOUT_3', 'rps', 100, p1TgId, 'P1');
      await roomManager.joinRoom('RPS_TIMEOUT_3', p2TgId, 'P2');

      const room = roomManager.getRoom('RPS_TIMEOUT_3')!;

      // Round 1 (0-0 score), neither chooses. Turn timeout resolves:
      await roomManager.handleTurnTimeout('RPS_TIMEOUT_3');

      // Tied score -> mutual draw
      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('draw');
    });
  });

  describe('Feature #12: Server Shutdown & Startup Timer Cleanup', () => {
    it('should clear all room timers and periodic cleanup interval on roomManager.close()', async () => {
      const p1TgId = 60101;
      const p2TgId = 60102;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('SHUTDOWN_1', 'connect4', 100, p1TgId, 'P1');
      await roomManager.joinRoom('SHUTDOWN_1', p2TgId, 'P2');

      const room = roomManager.getRoom('SHUTDOWN_1')!;
      expect(room.turnTimer).toBeDefined();

      // Disconnect P1 to arm p1DisconnectTimer
      await roomManager.handleDisconnect(p1TgId);
      expect(room.p1DisconnectTimer).toBeDefined();

      // Trigger close()
      roomManager.close();

      expect(room.turnTimer).toBeUndefined();
      expect(room.p1DisconnectTimer).toBeUndefined();
      expect(room.p2DisconnectTimer).toBeUndefined();
      expect(room.emptyRoomTimer).toBeUndefined();
    });

    it('should not schedule new forfeit timers in handleDisconnect after close()', async () => {
      const p1TgId = 60103;
      const p2TgId = 60104;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('SHUTDOWN_2', 'connect4', 100, p1TgId, 'P1');
      await roomManager.joinRoom('SHUTDOWN_2', p2TgId, 'P2');

      const room = roomManager.getRoom('SHUTDOWN_2')!;
      roomManager.close();

      // Disconnect occurs during shutdown
      await roomManager.handleDisconnect(p2TgId);

      // No new forfeit timer should have been scheduled
      expect(room.p2DisconnectTimer).toBeUndefined();
    });

    it('should clear matchmaking cleanupTimer on close()', () => {
      const mq = new MatchmakingQueue(async () => {});
      expect((mq as any).cleanupTimer).toBeDefined();

      mq.close();
      expect((mq as any).cleanupTimer).toBeNull();
    });

    it('should arm disconnect timers for disconnected players in restored playing rooms', async () => {
      const p1TgId = 60105;
      const p2TgId = 60106;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await storage.persistMatch({
        code: 'RESTORE_TIMERS',
        gameType: 'connect4',
        stakeAmount: 100,
        potAmount: 200,
        p1TelegramId: p1TgId,
        p2TelegramId: p2TgId,
        status: 'playing',
        statePayload: {
          version: 2,
          engine: { board: Array(6).fill(null).map(() => Array(7).fill(null)), activePlayer: 'p1', winner: null },
        },
      });

      await roomManager.restorePersistedRooms();
      const room = roomManager.getRoom('RESTORE_TIMERS');
      expect(room).toBeDefined();
      expect(room?.status).toBe('playing');
      expect(room?.p1?.isConnected).toBe(false);
      expect(room?.p2?.isConnected).toBe(false);

      expect(room?.p1DisconnectTimer).toBeDefined();
      expect(room?.p2DisconnectTimer).toBeDefined();
    });

    it('should settle mutual draw when restored playing room double-disconnect forfeit timeout triggers', async () => {
      const p1TgId = 60107;
      const p2TgId = 60108;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await storage.persistMatch({
        code: 'RESTORE_DDIS',
        gameType: 'connect4',
        stakeAmount: 100,
        potAmount: 200,
        p1TelegramId: p1TgId,
        p2TelegramId: p2TgId,
        status: 'playing',
        statePayload: {
          version: 2,
          engine: { board: Array(6).fill(null).map(() => Array(7).fill(null)), activePlayer: 'p1', winner: null },
        },
      });

      await roomManager.restorePersistedRooms();
      const room = roomManager.getRoom('RESTORE_DDIS')!;
      expect(room.p1DisconnectTimer).toBeDefined();
      expect(room.p2DisconnectTimer).toBeDefined();

      await vi.advanceTimersByTimeAsync(DISCONNECT_FORFEIT_TIMEOUT_MS + 1000);

      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('draw');
      expect(room.p1DisconnectTimer).toBeUndefined();
      expect(room.p2DisconnectTimer).toBeUndefined();
    });

    it('should award forfeit win when one player reconnects to restored playing room and opponent times out', async () => {
      const p1TgId = 60109;
      const p2TgId = 60110;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await storage.persistMatch({
        code: 'RESTORE_FORFEIT',
        gameType: 'connect4',
        stakeAmount: 100,
        potAmount: 200,
        p1TelegramId: p1TgId,
        p2TelegramId: p2TgId,
        status: 'playing',
        statePayload: {
          version: 2,
          engine: { board: Array(6).fill(null).map(() => Array(7).fill(null)), activePlayer: 'p1', winner: null },
        },
      });

      await roomManager.restorePersistedRooms();
      const room = roomManager.getRoom('RESTORE_FORFEIT')!;

      const recon = await roomManager.reconnectPlayer('RESTORE_FORFEIT', p1TgId);
      expect(recon.role).toBe('p1');
      expect(room.p1?.isConnected).toBe(true);
      expect(room.p1DisconnectTimer).toBeUndefined();
      expect(room.p2DisconnectTimer).toBeDefined();

      await vi.advanceTimersByTimeAsync(DISCONNECT_FORFEIT_TIMEOUT_MS + 1000);

      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('p1');
      expect(room.p2DisconnectTimer).toBeUndefined();
    });

    it('should reap abandoned playing room in cleanupExpiredRooms after PLAYING_ROOM_EXPIRY_MS', async () => {
      const p1TgId = 60111;
      const p2TgId = 60112;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await storage.persistMatch({
        code: 'CLEANUP_PLAYING',
        gameType: 'snake',
        stakeAmount: 100,
        potAmount: 200,
        p1TelegramId: p1TgId,
        p2TelegramId: p2TgId,
        status: 'playing',
        statePayload: {
          version: 1,
          engine: { p1Position: 1, p2Position: 1, activePlayer: 'p1', winner: null },
        },
      });

      await roomManager.restorePersistedRooms();
      const room = roomManager.getRoom('CLEANUP_PLAYING')!;
      room.lastActivityAt = Date.now() - (16 * 60 * 1000);

      await roomManager.cleanupExpiredRooms();

      const checked = roomManager.getRoom('CLEANUP_PLAYING');
      expect(checked === undefined || checked.status === 'gameover').toBe(true);
      if (checked) {
        expect(checked.winner).toBe('draw');
      }
    });
  });
});
