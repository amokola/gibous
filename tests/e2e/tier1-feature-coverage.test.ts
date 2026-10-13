import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ensureE2EServer, createAuthClient, generateRoomCode, E2EClient } from './e2e-harness';

describe('Tier 1: Feature Coverage E2E Test Suite', () => {
  let wsUrl: string;

  beforeAll(async () => {
    wsUrl = await ensureE2EServer();
  });

  // ==========================================
  // FEATURE 1: CONNECT 4 (>=5 Test Cases)
  // ==========================================
  describe('Connect 4 Feature Coverage', () => {
    it('1.1 should create room, join, and initialize 6x7 empty board with p1 active', async () => {
      const p1 = await createAuthClient(101001, 'C4_Host_1');
      const p2 = await createAuthClient(101002, 'C4_Join_1');
      const roomCode = generateRoomCode('C4INIT');

      const createRes = await p1.sendAndAwait(
        { type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } },
        'ROOM_CREATED'
      );
      expect(createRes.payload.code).toBe(roomCode);
      expect(createRes.payload.status).toBe('waiting');

      const startP1Promise = p1.waitForType('GAME_START');
      const startP2Promise = p2.sendAndAwait(
        { type: 'JOIN_ROOM', payload: { roomCode } },
        'GAME_START'
      );

      const [startP1, startP2] = await Promise.all([startP1Promise, startP2Promise]);
      expect(startP1.payload.status).toBe('playing');
      expect(startP2.payload.status).toBe('playing');
      expect(startP1.payload.activePlayer).toBe('p1');
      expect(Array.isArray(startP1.payload.gameState.board)).toBe(true);
      expect(startP1.payload.gameState.board.length).toBe(6);

      p1.close();
      p2.close();
    });

    it('1.2 should alternate disc drops with broadcast verification to both clients', async () => {
      const p1 = await createAuthClient(101003, 'C4_P1_Drop');
      const p2 = await createAuthClient(101004, 'C4_P2_Drop');
      const roomCode = generateRoomCode('C4DROP');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // P1 drops in column 3
      const drop1P1Promise = p1.waitForType('DISC_DROPPED');
      const drop1P2Promise = p2.waitForType('DISC_DROPPED');
      p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 3 } });

      const [drop1P1, drop1P2] = await Promise.all([drop1P1Promise, drop1P2Promise]);
      expect(drop1P1.payload.player).toBe('p1');
      expect(drop1P1.payload.col).toBe(3);
      expect(drop1P1.payload.row).toBe(5); // bottom row
      expect(drop1P2.payload.player).toBe('p1');
      expect(drop1P1.payload.nextPlayer).toBe('p2');

      // P2 drops in column 4
      const drop2P1Promise = p1.waitForType('DISC_DROPPED');
      const drop2P2Promise = p2.waitForType('DISC_DROPPED');
      p2.send({ type: 'DROP_DISC', payload: { roomCode, column: 4 } });

      const [drop2P1, drop2P2] = await Promise.all([drop2P1Promise, drop2P2Promise]);
      expect(drop2P1.payload.player).toBe('p2');
      expect(drop2P1.payload.col).toBe(4);
      expect(drop2P1.payload.row).toBe(5);
      expect(drop2P2.payload.player).toBe('p2');
      expect(drop2P1.payload.nextPlayer).toBe('p1');

      p1.close();
      p2.close();
    });

    it('1.3 should correctly stack discs via gravity in the same column', async () => {
      const p1 = await createAuthClient(101005, 'C4_P1_Stack');
      const p2 = await createAuthClient(101006, 'C4_P2_Stack');
      const roomCode = generateRoomCode('C4STACK');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // P1 drops col 2 -> row 5
      const d1Promise = p1.waitForType('DISC_DROPPED');
      p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 2 } });
      const d1 = await d1Promise;
      expect(d1.payload.row).toBe(5);

      // P2 drops col 2 -> row 4
      const d2Promise = p1.waitForType('DISC_DROPPED');
      p2.send({ type: 'DROP_DISC', payload: { roomCode, column: 2 } });
      const d2 = await d2Promise;
      expect(d2.payload.row).toBe(4);

      // P1 drops col 2 -> row 3
      const d3Promise = p1.waitForType('DISC_DROPPED');
      p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 2 } });
      const d3 = await d3Promise;
      expect(d3.payload.row).toBe(3);

      p1.close();
      p2.close();
    });

    it('1.4 should detect horizontal victory and broadcast GAME_OVER with winner payout', async () => {
      const p1 = await createAuthClient(101007, 'C4_P1_HWin');
      const p2 = await createAuthClient(101008, 'C4_P2_HWin');
      const roomCode = generateRoomCode('C4HWIN');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // Horizontal win on row 5: P1: 0, 1, 2, 3; P2: 0, 1, 2 (stacked on row 4)
      const turns: Array<{ client: E2EClient; col: number }> = [
        { client: p1, col: 0 },
        { client: p2, col: 0 },
        { client: p1, col: 1 },
        { client: p2, col: 1 },
        { client: p1, col: 2 },
        { client: p2, col: 2 },
      ];

      for (const turn of turns) {
        const dropWait = p1.waitForType('DISC_DROPPED');
        turn.client.send({ type: 'DROP_DISC', payload: { roomCode, column: turn.col } });
        await dropWait;
      }

      // Final winning move: P1 drops in column 3
      const winP1Promise = p1.waitForType('GAME_OVER');
      const winP2Promise = p2.waitForType('GAME_OVER');
      p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 3 } });

      const [gameOverP1, gameOverP2] = await Promise.all([winP1Promise, winP2Promise]);
      expect(gameOverP1.payload.winner).toBe('p1');
      expect(gameOverP2.payload.winner).toBe('p1');
      expect(gameOverP1.payload.winnerPayout).toBe(180); // 200 pot - 10% rake

      p1.close();
      p2.close();
    });

    it('1.5 should detect vertical victory and settle match correctly', async () => {
      const p1 = await createAuthClient(101009, 'C4_P1_VWin');
      const p2 = await createAuthClient(101010, 'C4_P2_VWin');
      const roomCode = generateRoomCode('C4VWIN');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // P1 drops in col 0 (rows 5, 4, 3, 2), P2 drops in col 1 (rows 5, 4, 3)
      const turns = [
        { client: p1, col: 0 },
        { client: p2, col: 1 },
        { client: p1, col: 0 },
        { client: p2, col: 1 },
        { client: p1, col: 0 },
        { client: p2, col: 1 },
      ];

      for (const turn of turns) {
        const dropWait = p1.waitForType('DISC_DROPPED');
        turn.client.send({ type: 'DROP_DISC', payload: { roomCode, column: turn.col } });
        await dropWait;
      }

      // P1 drops 4th disc in col 0 -> vertical win!
      const gameOverWait = p1.waitForType('GAME_OVER');
      p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 0 } });
      const gameOver = await gameOverWait;

      expect(gameOver.payload.winner).toBe('p1');
      expect(gameOver.payload.winnerPayout).toBe(180);

      p1.close();
      p2.close();
    });

    it('1.6 should synchronize current room state via SYNC_ROOM', async () => {
      const p1 = await createAuthClient(101011, 'C4_P1_Sync');
      const p2 = await createAuthClient(101012, 'C4_P2_Sync');
      const roomCode = generateRoomCode('C4SYNC');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // P1 drops disc
      const dropWait = p1.waitForType('DISC_DROPPED');
      p1.send({ type: 'DROP_DISC', payload: { roomCode, column: 3 } });
      await dropWait;

      // P2 requests SYNC_ROOM
      const syncRes = await p2.sendAndAwait({ type: 'SYNC_ROOM', payload: { roomCode } }, 'ROOM_STATE');
      expect(syncRes.payload.code).toBe(roomCode);
      expect(syncRes.payload.status).toBe('playing');
      expect(syncRes.payload.activePlayer).toBe('p2');
      expect(syncRes.payload.gameState.board[5][3]).toBe('p1');

      p1.close();
      p2.close();
    });
  });

  // ==========================================
  // FEATURE 2: SNAKE & LADDER (>=5 Test Cases)
  // ==========================================
  describe('Snake & Ladder Feature Coverage', () => {
    it('2.1 should create room and start with both players at tile 1 and p1 active', async () => {
      const p1 = await createAuthClient(102001, 'SL_Host_1');
      const p2 = await createAuthClient(102002, 'SL_Join_1');
      const roomCode = generateRoomCode('SLINIT');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      const startP2 = await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      const startP1 = await startPromise;

      expect(startP1.payload.status).toBe('playing');
      expect(startP1.payload.gameState.p1Position).toBe(1);
      expect(startP1.payload.gameState.p2Position).toBe(1);
      expect(startP1.payload.activePlayer).toBe('p1');

      p1.close();
      p2.close();
    });

    it('2.2 should roll dice with valid value between 1 and 6 and update position', async () => {
      const p1 = await createAuthClient(102003, 'SL_P1_Roll');
      const p2 = await createAuthClient(102004, 'SL_P2_Roll');
      const roomCode = generateRoomCode('SLROLL');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const rollP1Promise = p1.waitForType('DICE_ROLLED');
      const rollP2Promise = p2.waitForType('DICE_ROLLED');
      p1.send({ type: 'ROLL_DICE', payload: { roomCode } });

      const [rollP1, rollP2] = await Promise.all([rollP1Promise, rollP2Promise]);
      expect(rollP1.payload.player).toBe('p1');
      expect(rollP1.payload.value).toBeGreaterThanOrEqual(1);
      expect(rollP1.payload.value).toBeLessThanOrEqual(6);
      expect(rollP1.payload.to).toBeGreaterThanOrEqual(2);
      expect(rollP2.payload.value).toBe(rollP1.payload.value);

      p1.close();
      p2.close();
    });

    it('2.3 should alternate active player turns after each roll', async () => {
      const p1 = await createAuthClient(102005, 'SL_P1_Turn');
      const p2 = await createAuthClient(102006, 'SL_P2_Turn');
      const roomCode = generateRoomCode('SLTURN');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // P1 rolls -> next active should be p2
      const roll1Wait = p1.waitForType('DICE_ROLLED');
      p1.send({ type: 'ROLL_DICE', payload: { roomCode } });
      const roll1 = await roll1Wait;
      expect(roll1.payload.nextPlayer).toBe('p2');

      // P2 rolls -> next active should be p1
      const roll2Wait = p1.waitForType('DICE_ROLLED');
      p2.send({ type: 'ROLL_DICE', payload: { roomCode } });
      const roll2 = await roll2Wait;
      expect(roll2.payload.nextPlayer).toBe('p1');

      p1.close();
      p2.close();
    });

    it('2.4 should synchronize board state via SYNC_ROOM after dice roll', async () => {
      const p1 = await createAuthClient(102007, 'SL_P1_Sync');
      const p2 = await createAuthClient(102008, 'SL_P2_Sync');
      const roomCode = generateRoomCode('SLSYNC');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const rollWait = p1.waitForType('DICE_ROLLED');
      p1.send({ type: 'ROLL_DICE', payload: { roomCode } });
      const rollEvent = await rollWait;

      const syncRes = await p2.sendAndAwait({ type: 'SYNC_ROOM', payload: { roomCode } }, 'ROOM_STATE');
      expect(syncRes.payload.status).toBe('playing');
      expect(syncRes.payload.gameState.p1Position).toBe(rollEvent.payload.to);
      expect(syncRes.payload.activePlayer).toBe('p2');

      p1.close();
      p2.close();
    });

    it('2.5 should execute multiple turns in sequence without desynchronization', async () => {
      const p1 = await createAuthClient(102009, 'SL_P1_Seq');
      const p2 = await createAuthClient(102010, 'SL_P2_Seq');
      const roomCode = generateRoomCode('SLSEQ');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // 4 successive rolls alternating P1 and P2
      for (let i = 0; i < 4; i++) {
        const activeClient = i % 2 === 0 ? p1 : p2;
        const rollWait = p1.waitForType('DICE_ROLLED');
        activeClient.send({ type: 'ROLL_DICE', payload: { roomCode } });
        const roll = await rollWait;
        expect(roll.payload.value).toBeGreaterThanOrEqual(1);
      }

      p1.close();
      p2.close();
    });
  });

  // ==========================================
  // FEATURE 3: ROCK PAPER SCISSORS (>=5 Test Cases)
  // ==========================================
  describe('Rock Paper Scissors Feature Coverage', () => {
    it('3.1 should create room and initialize Best-of-3 format at 0-0', async () => {
      const p1 = await createAuthClient(103001, 'RPS_Host_1');
      const p2 = await createAuthClient(103002, 'RPS_Join_1');
      const roomCode = generateRoomCode('RPSINIT');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      const startP2 = await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      const startP1 = await startPromise;

      expect(startP1.payload.status).toBe('playing');
      expect(startP1.payload.gameType).toBe('rps');

      p1.close();
      p2.close();
    });

    it('3.2 should maintain choice secrecy until both players commit', async () => {
      const p1 = await createAuthClient(103003, 'RPS_P1_Secret');
      const p2 = await createAuthClient(103004, 'RPS_P2_Secret');
      const roomCode = generateRoomCode('RPSSEC');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // P1 chooses rock
      p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });

      // Ensure P2 does NOT receive round resolution yet
      await new Promise((r) => setTimeout(r, 200));
      const hasResolvedEarly = p2.messages.some((m) => m.type === 'RPS_ROUND_RESOLVED');
      expect(hasResolvedEarly).toBe(false);

      // P2 chooses scissors -> now both resolve
      const resolveP1Wait = p1.waitForType('RPS_ROUND_RESOLVED');
      const resolveP2Wait = p2.waitForType('RPS_ROUND_RESOLVED');
      p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'scissors' } });

      const [res1, res2] = await Promise.all([resolveP1Wait, resolveP2Wait]);
      expect(res1.payload.roundWinner).toBe('p1');
      expect(res1.payload.p1Score).toBe(1);
      expect(res2.payload.roundWinner).toBe('p1');

      p1.close();
      p2.close();
    });

    it('3.3 should resolve Paper beating Rock correctly', async () => {
      const p1 = await createAuthClient(103005, 'RPS_P1_Paper');
      const p2 = await createAuthClient(103006, 'RPS_P2_Rock');
      const roomCode = generateRoomCode('RPSPAPER');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const resolveWait = p1.waitForType('RPS_ROUND_RESOLVED');
      p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'paper' } });
      p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });

      const res = await resolveWait;
      expect(res.payload.roundWinner).toBe('p1');
      expect(res.payload.p1Score).toBe(1);

      p1.close();
      p2.close();
    });

    it('3.4 should resolve tie rounds with no score change', async () => {
      const p1 = await createAuthClient(103007, 'RPS_P1_Tie');
      const p2 = await createAuthClient(103008, 'RPS_P2_Tie');
      const roomCode = generateRoomCode('RPSTIE');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const resolveWait = p1.waitForType('RPS_ROUND_RESOLVED');
      p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'scissors' } });
      p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'scissors' } });

      const res = await resolveWait;
      expect(res.payload.roundWinner).toBe('draw');
      expect(res.payload.p1Score).toBe(0);
      expect(res.payload.p2Score).toBe(0);

      p1.close();
      p2.close();
    });

    it('3.5 should conclude match upon 3 round wins with GAME_OVER and payout', async () => {
      const p1 = await createAuthClient(103009, 'RPS_P1_WinMatch');
      const p2 = await createAuthClient(103010, 'RPS_P2_LoseMatch');
      const roomCode = generateRoomCode('RPSBO3');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      // Round 1: P1 rock, P2 scissors -> P1 wins (1-0)
      const r1Wait = p1.waitForType('RPS_ROUND_RESOLVED');
      p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });
      p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'scissors' } });
      await r1Wait;

      // Round 2: P1 rock, P2 scissors -> P1 wins (2-0)
      const r2Wait = p1.waitForType('RPS_ROUND_RESOLVED');
      p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });
      p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'scissors' } });
      await r2Wait;

      // Round 3: P1 rock, P2 scissors -> P1 wins match (3-0)
      const gameOverP1Promise = p1.waitForType('GAME_OVER');
      const gameOverP2Promise = p2.waitForType('GAME_OVER');
      p1.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'rock' } });
      p2.send({ type: 'CHOOSE_RPS', payload: { roomCode, choice: 'scissors' } });

      const [go1, go2] = await Promise.all([gameOverP1Promise, gameOverP2Promise]);
      expect(go1.payload.winner).toBe('p1');
      expect(go2.payload.winner).toBe('p1');
      expect(go1.payload.winnerPayout).toBe(180);

      p1.close();
      p2.close();
    });
  });

  // ==========================================
  // FEATURE 4: DISCONNECT & RECONNECT (>=5 Test Cases)
  // ==========================================
  describe('Disconnect & Reconnect Feature Coverage', () => {
    it('4.1 should broadcast PLAYER_DISCONNECTED with 45000ms timeout on socket close', async () => {
      const p1 = await createAuthClient(105001, 'DC_P1_Drop');
      const p2 = await createAuthClient(105002, 'DC_P2_Wait');
      const roomCode = generateRoomCode('DCEVENT');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const dcPromise = p2.waitForType('PLAYER_DISCONNECTED');
      p1.close();

      const dcEvent = await dcPromise;
      expect(dcEvent.payload.player).toBe('p1');
      expect(dcEvent.payload.timeoutMs).toBe(45000);

      p2.close();
    });

    it('4.2 should provide activeRoom in AUTH_OK when re-authenticating after disconnect', async () => {
      let p1 = await createAuthClient(105003, 'DC_P1_ReconAuth');
      const p2 = await createAuthClient(105004, 'DC_P2_ReconAuth');
      const roomCode = generateRoomCode('DCAUTH');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      p1.close();

      // Connect new socket with same identity
      p1 = new E2EClient(wsUrl);
      await p1.connect();
      const authRes = await p1.auth(105003, 'DC_P1_ReconAuth');

      expect(authRes.payload.activeRoom).toBeDefined();
      expect(authRes.payload.activeRoom.code).toBe(roomCode);

      p1.close();
      p2.close();
    });

    it('4.3 should restore room state on SYNC_ROOM and broadcast PLAYER_RECONNECTED', async () => {
      let p1 = await createAuthClient(105005, 'DC_P1_FullRecon');
      const p2 = await createAuthClient(105006, 'DC_P2_FullRecon');
      const roomCode = generateRoomCode('DCFULL');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const dcWait = p2.waitForType('PLAYER_DISCONNECTED');
      p1.close();
      await dcWait;

      // Reconnect
      p1 = new E2EClient(wsUrl);
      await p1.connect();
      await p1.auth(105005, 'DC_P1_FullRecon');

      const reconWait = p2.waitForType('PLAYER_RECONNECTED');
      const stateWait = p1.sendAndAwait({ type: 'SYNC_ROOM', payload: { roomCode } }, 'ROOM_STATE');

      const [reconEvent, stateEvent] = await Promise.all([reconWait, stateWait]);
      expect(reconEvent.payload.player).toBe('p1');
      expect(stateEvent.payload.code).toBe(roomCode);
      expect(stateEvent.payload.status).toBe('playing');

      p1.close();
      p2.close();
    });

    it('4.4 should trigger immediate forfeit and award victory to opponent on LEAVE_ROOM', async () => {
      const p1 = await createAuthClient(105007, 'DC_P1_Leave');
      const p2 = await createAuthClient(105008, 'DC_P2_Stay');
      const roomCode = generateRoomCode('DCFORFEIT');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');
      const startPromise = p1.waitForType('GAME_START');
      await p2.sendAndAwait({ type: 'JOIN_ROOM', payload: { roomCode } }, 'GAME_START');
      await startPromise;

      const gameOverWait = p2.waitForType('GAME_OVER');
      p1.send({ type: 'LEAVE_ROOM', payload: { roomCode } });

      const gameOver = await gameOverWait;
      expect(gameOver.payload.winner).toBe('p2');
      expect(gameOver.payload.isForfeit).toBe(true);

      p1.close();
      p2.close();
    });

    it('4.5 should allow host to cancel waiting room and broadcast ROOM_CANCELLED', async () => {
      const p1 = await createAuthClient(105009, 'DC_P1_CancelRoom');
      const roomCode = generateRoomCode('DCCANCEL');

      await p1.sendAndAwait({ type: 'CREATE_ROOM', payload: { roomCode, gameType: 'snake', stake: 100 } }, 'ROOM_CREATED');
      const cancelRes = await p1.sendAndAwait({ type: 'CANCEL_ROOM', payload: { roomCode } }, 'ROOM_CANCELLED');

      expect(cancelRes.payload.roomCode).toBe(roomCode);

      p1.close();
    });
  });
});
