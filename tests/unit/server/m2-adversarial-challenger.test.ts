import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomManager, DISCONNECT_FORFEIT_TIMEOUT_MS } from '../../../server/roomManager';
import { MatchmakingQueue } from '../../../server/matchmaking';
import { connectionManager } from '../../../server/connectionManager';
import { ServerRPSEngine } from '../../../server/engines/RPSEngine';
import { StorageService } from '../../../server/storage';

describe('Milestone 2 Adversarial Challenger Stress Suite', () => {
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

  // =========================================================================
  // 1. RECONNECT & FORFEIT RACE CONDITIONS
  // =========================================================================
  describe('Adversarial 1: Reconnect & Forfeit Race Conditions', () => {
    it('handles rapid disconnect/reconnect/disconnect flapping with timer re-arming', async () => {
      const p1TgId = 11001;
      const p2TgId = 11002;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'Flapper1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'Flapper2' });

      await roomManager.createRoom('FLAP_01', 'connect4', 100, p1TgId, 'Flapper1');
      await roomManager.joinRoom('FLAP_01', p2TgId, 'Flapper2');

      const room = roomManager.getRoom('FLAP_01')!;
      expect(room.status).toBe('playing');

      // Flap 1: Disconnect
      await roomManager.handleDisconnect(p1TgId);
      expect(room.p1?.isConnected).toBe(false);
      expect(room.p1DisconnectTimer).toBeDefined();

      // Flap 1: Reconnect
      await roomManager.reconnectPlayer('FLAP_01', p1TgId);
      expect(room.p1?.isConnected).toBe(true);
      expect(room.p1DisconnectTimer).toBeUndefined();

      // Flap 2: Immediate Disconnect again
      await roomManager.handleDisconnect(p1TgId);
      expect(room.p1?.isConnected).toBe(false);
      expect(room.p1DisconnectTimer).toBeDefined();

      // Flap 2: Reconnect again
      await roomManager.reconnectPlayer('FLAP_01', p1TgId);
      expect(room.p1?.isConnected).toBe(true);
      expect(room.p1DisconnectTimer).toBeUndefined();
      expect(room.turnTimer).toBeDefined();
    });

    it('reconnects cleanly when active connection registered right before handleForfeitTimeout', async () => {
      const p1TgId = 11003;
      const p2TgId = 11004;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('RACE_FORFEIT', 'snake', 100, p1TgId, 'P1');
      await roomManager.joinRoom('RACE_FORFEIT', p2TgId, 'P2');

      const room = roomManager.getRoom('RACE_FORFEIT')!;
      await roomManager.handleDisconnect(p1TgId);
      expect(room.p1?.isConnected).toBe(false);

      // Active socket arrives right as timeout executes
      const mockWs: any = { readyState: 1, send: vi.fn(), close: vi.fn() };
      connectionManager.registerConnection(p1TgId, mockWs);

      await roomManager.handleForfeitTimeout('RACE_FORFEIT', 'p1');

      expect(room.status).toBe('playing');
      expect(room.winner).toBeNull();
      expect(room.p1?.isConnected).toBe(true);
      expect(room.p1DisconnectTimer).toBeUndefined();

      connectionManager.removeConnection(p1TgId);
    });

    it('is idempotent when reconnectPlayer is called multiple times on an already connected player', async () => {
      const p1TgId = 11005;
      const p2TgId = 11006;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

      await roomManager.createRoom('IDEMP_RECON', 'connect4', 100, p1TgId, 'P1');
      await roomManager.joinRoom('IDEMP_RECON', p2TgId, 'P2');

      const room = roomManager.getRoom('IDEMP_RECON')!;
      const v0 = room.version;

      const r1 = await roomManager.reconnectPlayer('IDEMP_RECON', p1TgId);
      expect(r1.role).toBe('p1');
      const v1 = room.version;
      expect(v1).toBe(v0 + 1);

      const r2 = await roomManager.reconnectPlayer('IDEMP_RECON', p1TgId);
      expect(r2.role).toBe('p1');
      expect(room.p1?.isConnected).toBe(true);
    });
  });

  // =========================================================================
  // 2. CONCURRENT DUEL ISOLATION & DUPLICATE JOINS
  // =========================================================================
  describe('Adversarial 2: Concurrent Duel Isolation & Duplicate Joins', () => {
    it('strictly forbids a player in an active match from creating or joining another room', async () => {
      const p1TgId = 21001;
      const p2TgId = 21002;
      const p3TgId = 21003;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });
      await storage.getOrCreateUser({ id: p3TgId, first_name: 'P3' });

      await roomManager.createRoom('ACTIVE_ROOM_1', 'snake', 100, p1TgId, 'P1');
      await roomManager.joinRoom('ACTIVE_ROOM_1', p2TgId, 'P2');

      // P1 attempts to create another room
      const resCreate = await roomManager.createRoom('ACTIVE_ROOM_2', 'connect4', 100, p1TgId, 'P1');
      expect(resCreate.error).toBe('You are already in an active duel');
      expect(resCreate.room).toBeUndefined();

      // P2 attempts to join another room created by P3
      await roomManager.createRoom('P3_ROOM', 'snake', 100, p3TgId, 'P3');
      const resJoin = await roomManager.joinRoom('P3_ROOM', p2TgId, 'P2');
      expect(resJoin.error).toBe('You are already in an active duel');
      expect(resJoin.room).toBeUndefined();
    });

    it('rejects player joining their own duel', async () => {
      const p1TgId = 21004;
      await storage.getOrCreateUser({ id: p1TgId, first_name: 'SelfPlayer' });

      await roomManager.createRoom('SELF_JOIN', 'connect4', 100, p1TgId, 'SelfPlayer');
      const joinSelf = await roomManager.joinRoom('SELF_JOIN', p1TgId, 'SelfPlayer');

      expect(joinSelf.error).toBe('You cannot join your own duel');
      expect(joinSelf.room).toBeUndefined();
    });

    it('rejects a 3rd player joining a full 2-player room', async () => {
      const p1 = 21005;
      const p2 = 21006;
      const p3 = 21007;
      await storage.getOrCreateUser({ id: p1, first_name: 'P1' });
      await storage.getOrCreateUser({ id: p2, first_name: 'P2' });
      await storage.getOrCreateUser({ id: p3, first_name: 'P3' });

      await roomManager.createRoom('FULL_ROOM', 'snake', 100, p1, 'P1');
      await roomManager.joinRoom('FULL_ROOM', p2, 'P2');

      const join3 = await roomManager.joinRoom('FULL_ROOM', p3, 'P3');
      expect(join3.error).toBe('Room is full or already in progress');
      expect(join3.room).toBeUndefined();
    });

    it('prevents match creation when a queued player is already in an active playing duel', async () => {
      const p1 = 21008;
      const p2 = 21009;
      await storage.getOrCreateUser({ id: p1, first_name: 'Q_P1' });
      await storage.getOrCreateUser({ id: p2, first_name: 'Q_P2' });

      // Put P1 into an active playing duel first
      await roomManager.createRoom('ACTIVE_P1', 'snake', 100, p1, 'Q_P1');
      await roomManager.joinRoom('ACTIVE_P1', 99999, 'Bot');

      const activeRoom = roomManager.getRoom('ACTIVE_P1')!;
      expect(activeRoom.status).toBe('playing');

      // Create MatchmakingQueue with standard match founder
      const mq = new MatchmakingQueue(async (reservation) => {
        const createRes = await roomManager.createRoom(
          undefined,
          reservation.gameType,
          reservation.stake,
          reservation.p1.telegramId,
          reservation.p1.name
        );
        if (!createRes.room) {
          throw new Error(createRes.error || 'Failed to create room during matchmaking');
        }
      });

      const mockWs1: any = { readyState: 1, send: vi.fn() };
      const mockWs2: any = { readyState: 1, send: vi.fn() };

      // P1 enqueues
      await mq.enqueue({
        telegramId: p1,
        name: 'Q_P1',
        gameType: 'snake',
        stake: 100,
        joinedAt: Date.now(),
        ws: mockWs1,
      });

      // P2 enqueues, triggering match with P1
      await expect(
        mq.enqueue({
          telegramId: p2,
          name: 'Q_P2',
          gameType: 'snake',
          stake: 100,
          joinedAt: Date.now(),
          ws: mockWs2,
        })
      ).rejects.toThrow('You are already in an active duel');

      mq.close();
    });

  });

  // =========================================================================
  // 3. DOUBLE DISCONNECT MUTUAL DRAW & REFUND SYMMETRY
  // =========================================================================
  describe('Adversarial 3: Double Disconnect Mutual Draw & Refund Symmetry', () => {
    it('settles Connect 4 double disconnect symmetrically as a draw refund', async () => {
      const p1 = 31001;
      const p2 = 31002;
      await storage.getOrCreateUser({ id: p1, first_name: 'C4_1' });
      await storage.getOrCreateUser({ id: p2, first_name: 'C4_2' });

      await roomManager.createRoom('C4_DD', 'connect4', 100, p1, 'C4_1');
      await roomManager.joinRoom('C4_DD', p2, 'C4_2');

      const room = roomManager.getRoom('C4_DD')!;
      await roomManager.handleDisconnect(p1);
      await roomManager.handleDisconnect(p2);

      expect(room.p1?.isConnected).toBe(false);
      expect(room.p2?.isConnected).toBe(false);

      // P1 forfeit timer expires
      await roomManager.handleForfeitTimeout('C4_DD', 'p1');

      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('draw');
      expect(room.settlementStatus).toBe('committed');
      expect(room.p1DisconnectTimer).toBeUndefined();
      expect(room.p2DisconnectTimer).toBeUndefined();
    });

    it('settles Snake & Ladder double disconnect symmetrically as a draw refund', async () => {
      const p1 = 31003;
      const p2 = 31004;
      await storage.getOrCreateUser({ id: p1, first_name: 'SL_1' });
      await storage.getOrCreateUser({ id: p2, first_name: 'SL_2' });

      await roomManager.createRoom('SL_DD', 'snake', 100, p1, 'SL_1');
      await roomManager.joinRoom('SL_DD', p2, 'SL_2');

      const room = roomManager.getRoom('SL_DD')!;
      await roomManager.handleDisconnect(p1);
      await roomManager.handleDisconnect(p2);

      // P2 forfeit timer expires first
      await roomManager.handleForfeitTimeout('SL_DD', 'p2');

      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('draw');
      expect(room.settlementStatus).toBe('committed');
    });

    it('settles RPS double disconnect symmetrically as a draw refund', async () => {
      const p1 = 31005;
      const p2 = 31006;
      await storage.getOrCreateUser({ id: p1, first_name: 'RPS_1' });
      await storage.getOrCreateUser({ id: p2, first_name: 'RPS_2' });

      await roomManager.createRoom('RPS_DD', 'rps', 100, p1, 'RPS_1');
      await roomManager.joinRoom('RPS_DD', p2, 'RPS_2');

      const room = roomManager.getRoom('RPS_DD')!;
      await roomManager.handleDisconnect(p1);
      await roomManager.handleDisconnect(p2);

      await roomManager.handleForfeitTimeout('RPS_DD', 'p1');

      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('draw');
      expect(room.settlementStatus).toBe('committed');
    });

    it('awards forfeit win if one player reconnected before timeout fires', async () => {
      const p1 = 31007;
      const p2 = 31008;
      await storage.getOrCreateUser({ id: p1, first_name: 'ASYM_1' });
      await storage.getOrCreateUser({ id: p2, first_name: 'ASYM_2' });

      await roomManager.createRoom('ASYM_ROOM', 'connect4', 100, p1, 'ASYM_1');
      await roomManager.joinRoom('ASYM_ROOM', p2, 'ASYM_2');

      const room = roomManager.getRoom('ASYM_ROOM')!;
      await roomManager.handleDisconnect(p1);
      await roomManager.handleDisconnect(p2);

      // P1 reconnects in time
      await roomManager.reconnectPlayer('ASYM_ROOM', p1);
      expect(room.p1?.isConnected).toBe(true);

      // P2 forfeit timer fires
      await roomManager.handleForfeitTimeout('ASYM_ROOM', 'p2');

      // P1 was online, so P1 wins by forfeit
      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('p1');
      expect(room.settlementStatus).toBe('committed');
    });

    it('gracefully handles database failure during settleMutualDraw without unhandled crash', async () => {
      const p1 = 31009;
      const p2 = 31010;
      await storage.getOrCreateUser({ id: p1, first_name: 'ERR_1' });
      await storage.getOrCreateUser({ id: p2, first_name: 'ERR_2' });

      await roomManager.createRoom('DB_FAIL_DD', 'connect4', 100, p1, 'ERR_1');
      await roomManager.joinRoom('DB_FAIL_DD', p2, 'ERR_2');

      const room = roomManager.getRoom('DB_FAIL_DD')!;
      await roomManager.handleDisconnect(p1);
      await roomManager.handleDisconnect(p2);

      // Mock storage.cancelMatch to reject with db connection failure
      const cancelSpy = vi.spyOn((roomManager as any).storage, 'cancelMatch').mockRejectedValueOnce(
        new Error('PostgreSQL connection terminated unexpectedly')
      );

      const res = await roomManager.settleMutualDraw('DB_FAIL_DD', 'double_disconnect');

      expect(res.success).toBe(false);
      expect(res.error).toBe('Settlement failed');
      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('draw');
      expect(room.settlementStatus).toBe('failed');

      cancelSpy.mockRestore();
    });

  });

  // =========================================================================
  // 4. REMATCH TURN TIMER INITIATION
  // =========================================================================
  describe('Adversarial 4: Rematch Turn Timer Initiation', () => {
    it('starts turn timer immediately upon round 2 rematch initiation', async () => {
      const p1 = 41001;
      const p2 = 41002;
      await storage.getOrCreateUser({ id: p1, first_name: 'R_P1' });
      await storage.getOrCreateUser({ id: p2, first_name: 'R_P2' });

      await roomManager.createRoom('REMATCH_ADV', 'connect4', 100, p1, 'R_P1');
      await roomManager.joinRoom('REMATCH_ADV', p2, 'R_P2');

      const room = roomManager.getRoom('REMATCH_ADV')!;
      room.status = 'gameover';
      room.winner = 'p1';

      await roomManager.handleRematchVote('REMATCH_ADV', p1);
      const res = await roomManager.handleRematchVote('REMATCH_ADV', p2);

      expect(res.bothReady).toBe(true);
      const r2Room = res.room!;
      expect(r2Room.code).toBe('REMATCH_ADV-R2');
      expect(r2Room.turnTimer).toBeDefined();

      // If P1 (opening player) fails to act before turn timeout, forfeit occurs
      await roomManager.handleTurnTimeout('REMATCH_ADV-R2');
      expect(r2Room.status).toBe('gameover');
      expect(r2Room.winner).toBe('p2');
    });
  });

  // =========================================================================
  // 5. RPS MULTI-ROUND TIMEOUT SETTLEMENTS
  // =========================================================================
  describe('Adversarial 5: RPS Multi-Round Timeout Settlements', () => {
    it('settles Bo3 timeout as forfeit for choosing player if one player chose and one did not', async () => {
      const p1 = 51001;
      const p2 = 51002;
      await storage.getOrCreateUser({ id: p1, first_name: 'RPS_T1' });
      await storage.getOrCreateUser({ id: p2, first_name: 'RPS_T2' });

      await roomManager.createRoom('RPS_ASYM_CHOICE', 'rps', 100, p1, 'RPS_T1');
      await roomManager.joinRoom('RPS_ASYM_CHOICE', p2, 'RPS_T2');

      const room = roomManager.getRoom('RPS_ASYM_CHOICE')!;
      const engine = room.engine as ServerRPSEngine;

      // P1 chooses, P2 does not
      engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });

      // Turn timeout fires
      await roomManager.handleTurnTimeout('RPS_ASYM_CHOICE');

      // P2 failed to choose -> P2 forfeits, P1 wins
      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('p1');
    });

    it('settles Bo3 timeout in favor of P2 if P2 chose and P1 did not', async () => {
      const p1 = 51003;
      const p2 = 51004;
      await storage.getOrCreateUser({ id: p1, first_name: 'RPS_T3' });
      await storage.getOrCreateUser({ id: p2, first_name: 'RPS_T4' });

      await roomManager.createRoom('RPS_ASYM_CHOICE2', 'rps', 100, p1, 'RPS_T3');
      await roomManager.joinRoom('RPS_ASYM_CHOICE2', p2, 'RPS_T4');

      const room = roomManager.getRoom('RPS_ASYM_CHOICE2')!;
      const engine = room.engine as ServerRPSEngine;

      // P2 chooses, P1 does not
      engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'paper' });

      // Turn timeout fires
      await roomManager.handleTurnTimeout('RPS_ASYM_CHOICE2');

      // P1 failed to choose -> P1 forfeits, P2 wins
      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('p2');
    });

    it('settles Bo3 timeout as mutual draw when scores are tied 1-1 and neither chooses', async () => {
      const p1 = 51005;
      const p2 = 51006;
      await storage.getOrCreateUser({ id: p1, first_name: 'RPS_T5' });
      await storage.getOrCreateUser({ id: p2, first_name: 'RPS_T6' });

      await roomManager.createRoom('RPS_TIED_1_1', 'rps', 100, p1, 'RPS_T5');
      await roomManager.joinRoom('RPS_TIED_1_1', p2, 'RPS_T6');

      const room = roomManager.getRoom('RPS_TIED_1_1')!;
      const engine = room.engine as ServerRPSEngine;

      // Round 1: P1 wins
      engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
      engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' });
      expect(engine.getState().p1Score).toBe(1);
      expect(engine.getState().p2Score).toBe(0);

      // Round 2: P2 wins
      engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
      engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'paper' });
      expect(engine.getState().p1Score).toBe(1);
      expect(engine.getState().p2Score).toBe(1);

      // Round 3: Neither player chooses -> turn timeout fires
      await roomManager.handleTurnTimeout('RPS_TIED_1_1');

      // Tied 1-1 with mutual non-selection -> mutual draw
      expect(room.status).toBe('gameover');
      expect(room.winner).toBe('draw');
      expect(room.settlementStatus).toBe('committed');
    });
  });

  // =========================================================================
  // 6. SERVER SHUTDOWN CLEANUP
  // =========================================================================
  describe('Adversarial 6: Server Shutdown Cleanup', () => {
    it('cleans up all timers across all rooms and prevents timer arming after close', async () => {
      const p1 = 61001;
      const p2 = 61002;
      await storage.getOrCreateUser({ id: p1, first_name: 'SD_1' });
      await storage.getOrCreateUser({ id: p2, first_name: 'SD_2' });

      await roomManager.createRoom('SHUTDOWN_ADV', 'connect4', 100, p1, 'SD_1');
      await roomManager.joinRoom('SHUTDOWN_ADV', p2, 'SD_2');

      const room = roomManager.getRoom('SHUTDOWN_ADV')!;
      expect(room.turnTimer).toBeDefined();

      // Trigger disconnect to arm disconnect timer
      await roomManager.handleDisconnect(p1);
      expect(room.p1DisconnectTimer).toBeDefined();

      // Close room manager
      roomManager.close();

      expect(room.turnTimer).toBeUndefined();
      expect(room.p1DisconnectTimer).toBeUndefined();
      expect(room.p2DisconnectTimer).toBeUndefined();
      expect(room.emptyRoomTimer).toBeUndefined();

      // Post-close disconnect attempts should be no-ops and never arm timers
      await roomManager.handleDisconnect(p2);
      expect(room.p2DisconnectTimer).toBeUndefined();

      // Calling close a second time is safe and idempotent
      expect(() => roomManager.close()).not.toThrow();
    });

    it('shuts down MatchmakingQueue cleanly', () => {
      const mq = new MatchmakingQueue(async () => {});
      expect((mq as any).cleanupTimer).toBeDefined();
      mq.close();
      expect((mq as any).cleanupTimer).toBeNull();
      // Double close is safe
      expect(() => mq.close()).not.toThrow();
    });
  });
});
