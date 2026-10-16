import { describe, it, expect, beforeAll } from 'vitest';
import { ensureE2EServer, createAuthClient, generateRoomCode, E2EClient } from './e2e-harness';
import { MIN_STAKE, MAX_STAKE } from '../../shared/constants/economics';

describe('Tier 2: Boundary & Corner Cases E2E Test Suite', () => {
  let wsUrl: string;

  beforeAll(async () => {
    wsUrl = await ensureE2EServer();
  });

  // ==========================================
  // CATEGORY 1: CONNECT 4 BOUNDARIES & CORNERS
  // ==========================================
  describe('Connect 4 Boundary & Corner Cases', () => {
    it('2.1 should permit dropping at minimum boundary column (0)', async () => {
      const p1 = await createAuthClient(201001, 'C4_Bound_Col0_P1');
      const p2 = await createAuthClient(201002, 'C4_Bound_Col0_P2');
      const roomCode = generateRoomCode('C4B0');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const dropWait = p1.waitForType('DISC_DROPPED');
      p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 0 } });
      const drop = await dropWait;

      expect(drop.payload.col).toBe(0);
      expect(drop.payload.row).toBe(5);
      expect(drop.payload.player).toBe('p1');

      p1.close();
      p2.close();
    });

    it('2.2 should permit dropping at maximum boundary column (6)', async () => {
      const p1 = await createAuthClient(201003, 'C4_Bound_Col6_P1');
      const p2 = await createAuthClient(201004, 'C4_Bound_Col6_P2');
      const roomCode = generateRoomCode('C4B6');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const dropWait = p1.waitForType('DISC_DROPPED');
      p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 6 } });
      const drop = await dropWait;

      expect(drop.payload.col).toBe(6);
      expect(drop.payload.row).toBe(5);
      expect(drop.payload.player).toBe('p1');

      p1.close();
      p2.close();
    });

    it('2.3 should reject out-of-bounds column indices (-1 and 7)', async () => {
      const p1 = await createAuthClient(201005, 'C4_OOB_P1');
      const p2 = await createAuthClient(201006, 'C4_OOB_P2');
      const roomCode = generateRoomCode('C4OOB');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // Negative column
      const err1 = await p1.sendAndAwait({ type: 'DROP_DISC', payload: { roomCode, column: -1 } }, 'ERROR');
      expect(err1.type).toBe('ERROR');

      // Column >= 7
      const err2 = await p1.sendAndAwait({ type: 'DROP_DISC', payload: { roomCode, column: 7 } }, 'ERROR');
      expect(err2.type).toBe('ERROR');

      p1.close();
      p2.close();
    });

    it('2.4 should reject dropping into a completely full column', async () => {
      const p1 = await createAuthClient(201007, 'C4_Full_P1');
      const p2 = await createAuthClient(201008, 'C4_Full_P2');
      const roomCode = generateRoomCode('C4FULLCOL');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // Fill column 0 with 6 discs (alternating P1 and P2)
      for (let i = 0; i < 6; i++) {
        const active = i % 2 === 0 ? p1 : p2;
        const dropWait = p1.waitForType('DISC_DROPPED');
        active.send({ type: 'DROP_DISC', payload: { roomCode, column: 0 } });
        await dropWait;
      }

      // 7th drop into column 0 by P1 should fail
      const fullColErr = await p1.sendAndAwait({ type: 'DROP_DISC', payload: { roomCode, column: 0 } }, 'ERROR');
      expect(fullColErr.type).toBe('ERROR');
      expect(fullColErr.payload.message).toContain('Column 1 is full');

      p1.close();
      p2.close();
    });

    it('2.5 should reject out-of-turn drop attempts', async () => {
      const p1 = await createAuthClient(201009, 'C4_Turn_P1');
      const p2 = await createAuthClient(201010, 'C4_Turn_P2');
      const roomCode = generateRoomCode('C4TURNERR');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // P2 tries to drop when P1 is active
      const turnErr = await p2.sendAndAwait({ type: 'DROP_DISC', payload: { roomCode, column: 3 } }, 'ERROR');
      expect(turnErr.type).toBe('ERROR');
      expect(turnErr.payload.message).toContain('Not your turn');

      p1.close();
      p2.close();
    });

    it('2.6 should reject disc drops after match has ended', async () => {
      const p1 = await createAuthClient(201011, 'C4_Post_P1');
      const p2 = await createAuthClient(201012, 'C4_Post_P2');
      const roomCode = generateRoomCode('C4POSTWIN');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // Quick forfeit to end game
      const gameOverWait = p1.waitForType('GAME_OVER');
      p2.send({ type: 'LEAVE_ROOM', payload: { roomCode } });
      await gameOverWait;

      // P1 attempts to drop after game is over
      const postErr = await p1.sendAndAwait({ type: 'DROP_DISC', payload: { roomCode, column: 2 } }, 'ERROR');
      expect(postErr.type).toBe('ERROR');
      expect(postErr.payload.message).toContain('Duel is not in progress');

      p1.close();
      p2.close();
    });
  });

  // ==========================================
  // CATEGORY 2: SNAKE & LADDER BOUNDARIES & CORNERS
  // ==========================================
  describe('Snake & Ladder Boundary & Corner Cases', () => {
    it('2.7 should accurately advance from tile 1 starting boundary', async () => {
      const p1 = await createAuthClient(202001, 'SL_Bound_Start_P1');
      const p2 = await createAuthClient(202002, 'SL_Bound_Start_P2');
      const roomCode = generateRoomCode('SLB1');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      const start = await startPromise;

      expect(start.payload.gameState.p1Position).toBe(1);

      const rollWait = p1.waitForType('DICE_ROLLED');
      p1.send({ type: 'ROLL_DICE', payload: { roomCode } });
      const roll = await rollWait;

      expect(roll.payload.from).toBe(1);
      expect(roll.payload.to).toBeGreaterThanOrEqual(2);

      p1.close();
      p2.close();
    });

    it('2.8 should reject out-of-turn dice roll attempts', async () => {
      const p1 = await createAuthClient(202003, 'SL_Turn_P1');
      const p2 = await createAuthClient(202004, 'SL_Turn_P2');
      const roomCode = generateRoomCode('SLTURNERR');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // P2 tries to roll when activePlayer is P1
      const turnErr = await p2.sendAndAwait({ type: 'ROLL_DICE', payload: { roomCode } }, 'ERROR');
      expect(turnErr.type).toBe('ERROR');
      expect(turnErr.payload.message).toContain('Not your turn');

      p1.close();
      p2.close();
    });

    it('2.9 should reject dice rolling after match is ended', async () => {
      const p1 = await createAuthClient(202005, 'SL_Post_P1');
      const p2 = await createAuthClient(202006, 'SL_Post_P2');
      const roomCode = generateRoomCode('SLPOST');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // End game via forfeit
      const gameOverWait = p1.waitForType('GAME_OVER');
      p2.send({ type: 'LEAVE_ROOM', payload: { roomCode } });
      await gameOverWait;

      // P1 attempts to roll after game over
      const postErr = await p1.sendAndAwait({ type: 'ROLL_DICE', payload: { roomCode } }, 'ERROR');
      expect(postErr.type).toBe('ERROR');
      expect(postErr.payload.message).toContain('Duel is not in progress');

      p1.close();
      p2.close();
    });
  });

  // ==========================================
  // CATEGORY 3: ROCK PAPER SCISSORS BOUNDARIES & CORNERS
  // ==========================================
  describe('Rock Paper Scissors Boundary & Corner Cases', () => {
    it('2.10 should reject invalid weapon choice string', async () => {
      const p1 = await createAuthClient(203001, 'RPS_Inv_P1');
      const p2 = await createAuthClient(203002, 'RPS_Inv_P2');
      const roomCode = generateRoomCode('RPSINVAL');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const invErr = await p1.sendAndAwait(
        { type: 'CHOOSE_RPS', payload: { roomCode, choice: 'dynamite' as any } },
        'ERROR'
      );
      expect(invErr.type).toBe('ERROR');

      p1.close();
      p2.close();
    });

    it('2.11 should reject choices made after the match has ended', async () => {
      const p1 = await createAuthClient(203003, 'RPS_Post_P1');
      const p2 = await createAuthClient(203004, 'RPS_Post_P2');
      const roomCode = generateRoomCode('RPSPOST');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const gameOverWait = p1.waitForType('GAME_OVER');
      p2.send({ type: 'LEAVE_ROOM', payload: { roomCode } });
      await gameOverWait;

      const postErr = await p1.sendAndAwait(
        { type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } },
        'ERROR'
      );
      expect(postErr.type).toBe('ERROR');
      expect(postErr.payload.message).toContain('Duel is not in progress');

      p1.close();
      p2.close();
    });

    it('2.12 should reject unauthenticated requests', async () => {
      const client = new E2EClient(wsUrl);
      await client.connect();

      // Send CREATE_ROOM without authenticating first
      const err = await client.sendAndAwait(
        { type: 'CREATE_ROOM', payload: { gameType: 'connect4', stake: 100 } },
        'ERROR'
      );
      expect(err.type).toBe('ERROR');
      expect(err.payload.code).toBe('UNAUTHORIZED');

      client.close();
    });
  });

  // ==========================================
  // CATEGORY 4: ROOM LIFECYCLE & ECONOMICS BOUNDARIES
  // ==========================================
  describe('Room Lifecycle & Economics Boundaries', () => {
    it('2.13 should reject stakes below MIN_STAKE (0.5)', async () => {
      const client = await createAuthClient(204001, 'Stake_Low');
      const res = await client.sendAndAwait(
        { type: 'CREATE_ROOM', payload: { gameType: 'connect4', stake: 0.1 } },
        'ERROR'
      );
      expect(res.type).toBe('ERROR');

      client.close();
    });

    it('2.14 should reject stakes above MAX_STAKE (10,000)', async () => {
      const client = await createAuthClient(204002, 'Stake_High');
      const res = await client.sendAndAwait(
        { type: 'CREATE_ROOM', payload: { gameType: 'connect4', stake: 50000 } },
        'ERROR'
      );
      expect(res.type).toBe('ERROR');

      client.close();
    });

    it('2.15 should reject joining a non-existent room code', async () => {
      const client = await createAuthClient(204003, 'Join_Ghost');
      const res = await client.sendAndAwait(
        { type: 'JOIN_ROOM', payload: { roomCode: 'NONEXISTENT999' } },
        'ERROR'
      );
      expect(res.type).toBe('ERROR');
      expect(res.payload.code).toBe('JOIN_FAILED');

      client.close();
    });

    it('2.16 should reject joining an already full room with ROOM_FULL error', async () => {
      const p1 = await createAuthClient(204004, 'Full_P1');
      const p2 = await createAuthClient(204005, 'Full_P2');
      const p3 = await createAuthClient(204006, 'Full_P3');
      const roomCode = generateRoomCode('FULLRM');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // P3 attempts to join full room
      const res = await p3.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'ERROR');
      expect(res.type).toBe('ERROR');
      expect(res.payload.message).toContain('Room is full');

      p1.close();
      p2.close();
      p3.close();
    });

    it('2.17 should reject unauthorized cancel room attempts by non-hosts', async () => {
      const host = await createAuthClient(204007, 'Host_Legit');
      const intruder = await createAuthClient(204008, 'Intruder_Bad');
      const roomCode = generateRoomCode('CANCELGUARD');

      await host.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');

      const cancelErr = await intruder.sendAndAwait({ type: 'CANCEL_ROOM', payload: { roomCode } }, 'ERROR');
      expect(cancelErr.type).toBe('ERROR');
      expect(cancelErr.payload.code).toBe('CANCEL_FAILED');

      await host.sendAndAwait({ type: 'CANCEL_ROOM', payload: { roomCode } }, 'ROOM_CANCELLED');
      host.close();
      intruder.close();
    });
  });
});
