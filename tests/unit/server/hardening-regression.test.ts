import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RoomManager, getNextRematchCode, DISCONNECT_FORFEIT_TIMEOUT_MS } from '../../../server/roomManager';
import { ServerRPSEngine } from '../../../server/engines/RPSEngine';
import { ServerConnect4Engine } from '../../../server/engines/Connect4Engine';

describe('Production Hardening Regression Tests', () => {
  describe('getNextRematchCode', () => {
    it('should append -R2 to base match codes', () => {
      expect(getNextRematchCode('ABC123')).toBe('ABC123-R2');
      expect(getNextRematchCode('TEST-ROOM')).toBe('TEST-ROOM-R2');
    });

    it('should increment sequential round numbers correctly', () => {
      expect(getNextRematchCode('ABC123-R2')).toBe('ABC123-R3');
      expect(getNextRematchCode('ABC123-R9')).toBe('ABC123-R10');
      expect(getNextRematchCode('MATCH-R99')).toBe('MATCH-R100');
    });
  });

  describe('RPSEngine Round Numbering', () => {
    it('should emit consistent current round in payload and advance nextRound', () => {
      const engine = new ServerRPSEngine(3);
      // Round 1
      engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
      const r1 = engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'paper' });

      expect(r1.payload.round).toBe(1);
      expect(r1.payload.nextRound).toBe(2);
      expect(r1.payload.roundWinner).toBe('p2');

      // Round 2
      engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
      const r2 = engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'rock' });

      expect(r2.payload.round).toBe(2);
      expect(r2.payload.nextRound).toBe(3);
      expect(r2.payload.roundWinner).toBe('draw');
    });
  });

  describe('Connect4Engine Winning Cells Shape', () => {
    it('should provide winningCells as an array of { row, col } objects', () => {
      const engine = new ServerConnect4Engine();
      // Drop 4 discs for P1 in col 0, P2 in col 1
      engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // (5, 0)
      engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // (5, 1)
      engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // (4, 0)
      engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // (4, 1)
      engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // (3, 0)
      engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // (3, 1)
      const winResult = engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // (2, 0)

      expect(winResult.isGameOver).toBe(true);
      expect(winResult.winner).toBe('p1');
      expect(winResult.payload.winningCells).toBeDefined();
      expect(winResult.payload.winningCells.length).toBe(4);
      expect(winResult.payload.winningCells[0]).toHaveProperty('row');
      expect(winResult.payload.winningCells[0]).toHaveProperty('col');
    });
  });

  describe('RoomManager Lifecycle & Timer Isolation', () => {
    let roomManager: RoomManager;

    beforeEach(() => {
      vi.useFakeTimers();
      roomManager = new RoomManager();
    });

    it('should create room with escrow and allow joining idempotently', async () => {
      const p1TgId = 11111;
      const p2TgId = 22222;

      const created = await roomManager.createRoom('TEST1', 'connect4', 100, p1TgId, 'Alice');
      expect(created.room).toBeDefined();
      expect(created.room?.code).toBe('TEST1');
      expect(created.room?.status).toBe('waiting');

      const joined1 = await roomManager.joinRoom('TEST1', p2TgId, 'Bob');
      expect(joined1.room).toBeDefined();
      expect(joined1.room?.status).toBe('playing');
      expect(joined1.room?.p2?.telegramId).toBe(p2TgId);

      // Idempotent re-join by P2
      const joined2 = await roomManager.joinRoom('TEST1', p2TgId, 'Bob');
      expect(joined2.room).toBeDefined();
      expect(joined2.error).toBeUndefined();
    });

    it('should isolate P1 and P2 disconnect timers independently', async () => {
      const p1TgId = 33333;
      const p2TgId = 44444;

      await roomManager.createRoom('TEST2', 'connect4', 100, p1TgId, 'Alice');
      await roomManager.joinRoom('TEST2', p2TgId, 'Bob');

      const room = roomManager.getRoom('TEST2');
      expect(room).toBeDefined();

      // P1 disconnects
      await roomManager.handleDisconnect(p1TgId);
      expect(room?.p1?.isConnected).toBe(false);
      expect(room?.p1DisconnectTimer).toBeDefined();
      expect(room?.p2DisconnectTimer).toBeUndefined();

      // P2 disconnects later
      await roomManager.handleDisconnect(p2TgId);
      expect(room?.p2?.isConnected).toBe(false);
      expect(room?.p2DisconnectTimer).toBeDefined();

      // P1 reconnects -> only P1 timer cleared, P2 timer stays active
      await roomManager.reconnectPlayer('TEST2', p1TgId);
      expect(room?.p1?.isConnected).toBe(true);
      expect(room?.p1DisconnectTimer).toBeUndefined();
      expect(room?.p2DisconnectTimer).toBeDefined();
    });

    it('should settle forfeit when disconnect timer expires', async () => {
      const p1TgId = 55555;
      const p2TgId = 66666;

      await roomManager.createRoom('TEST3', 'connect4', 100, p1TgId, 'Alice');
      await roomManager.joinRoom('TEST3', p2TgId, 'Bob');

      const room = roomManager.getRoom('TEST3');
      expect(room?.status).toBe('playing');

      await roomManager.handleDisconnect(p2TgId);
      expect(room?.p2DisconnectTimer).toBeDefined();

      // Fast-forward past forfeit timeout
      vi.advanceTimersByTime(DISCONNECT_FORFEIT_TIMEOUT_MS + 1000);

      // Settle forfeit executes and awards match to P1
      expect(room?.status).toBe('gameover');
      expect(room?.winner).toBe('p1');
    });

    it('should automatically forfeit active player on turn timeout when both remain connected', async () => {
      const p1TgId = 12345;
      const p2TgId = 67890;

      await roomManager.createRoom('TURNTIMEOUT1', 'connect4', 100, p1TgId, 'Alice');
      await roomManager.joinRoom('TURNTIMEOUT1', p2TgId, 'Bob');

      const room = roomManager.getRoom('TURNTIMEOUT1');
      expect(room?.status).toBe('playing');
      expect(room?.turnTimer).toBeDefined();

      // In Connect 4, Alice (p1) is active first.
      // Fast-forward past 20s turn timeout without any move from Alice
      vi.advanceTimersByTime(21_000);

      // Alice (p1) should be forfeited for inactivity, awarding win to Bob (p2)
      expect(room?.status).toBe('gameover');
      expect(room?.winner).toBe('p2');
    });

    it('should transition room on rematch and index under new sequential code', async () => {
      const p1TgId = 77777;
      const p2TgId = 88888;

      await roomManager.createRoom('MATCH1', 'rps', 100, p1TgId, 'Alice');
      await roomManager.joinRoom('MATCH1', p2TgId, 'Bob');

      const room = roomManager.getRoom('MATCH1')!;
      room.status = 'gameover';
      room.winner = 'p1';

      // P1 votes rematch
      const vote1 = await roomManager.handleRematchVote('MATCH1', p1TgId);
      expect(vote1.bothReady).toBe(false);

      // P2 votes rematch
      const vote2 = await roomManager.handleRematchVote('MATCH1', p2TgId);
      expect(vote2.bothReady).toBe(true);
      expect(vote2.room).toBeDefined();
      expect(vote2.room?.code).toBe('MATCH1-R2');
      expect(vote2.room?.status).toBe('playing');
      expect(vote2.room?.winner).toBeNull();

      // Old code is dereferenced, new code is active
      expect(roomManager.getRoom('MATCH1')).toBeUndefined();
      expect(roomManager.getRoom('MATCH1-R2')).toBeDefined();
    });
  });
});
