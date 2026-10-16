import { describe, it, expect, vi, afterEach } from 'vitest';
import { ServerConnect4Engine } from '../../../server/engines/Connect4Engine';
import { ServerSnakeLadderEngine } from '../../../server/engines/SnakeLadderEngine';
import { ServerRPSEngine } from '../../../server/engines/RPSEngine';
import { DropDiscPayloadSchema } from '../../../shared/schemas/protocol';
import { CANONICAL_SNAKES, CANONICAL_LADDERS } from '../../../shared/constants/board';
import crypto from 'crypto';

describe('Milestone 1 Challenger 1 - Adversarial & Stress Testing Harness', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. CONNECT 4 ADVERSARIAL CHALLENGES
  // =========================================================================
  describe('Connect 4 Adversarial Challenges', () => {
    it('should reject extreme floating point column inputs at schema and engine level', () => {
      const engine = new ServerConnect4Engine();
      const extremeFloats = [
        0.1,
        0.0000001,
        0.9999999,
        1.5,
        2.0000000001,
        3.1415926535,
        4.999,
        5.00001,
        6.9,
        6.0000001,
        1e-10,
        1e-300,
        Number.EPSILON,
      ];

      for (const floatVal of extremeFloats) {
        // 1. Schema check
        const schemaRes = DropDiscPayloadSchema.safeParse({ roomCode: 'ROOM', column: floatVal });
        expect(schemaRes.success, `Schema should reject float ${floatVal}`).toBe(false);

        // 2. Engine check
        const engineRes = engine.handleAction('p1', 'DROP_DISC', { column: floatVal });
        expect(engineRes.success, `Engine should reject float ${floatVal}`).toBe(false);
        expect(engineRes.error).toContain('Invalid column');
        expect(engine.getActivePlayer()).toBe('p1');
        expect(engine.isGameOver()).toBe(false);
      }
    });

    it('should reject NaN, +Infinity, -Infinity, and negative column values', () => {
      const engine = new ServerConnect4Engine();
      const invalidNumbers = [
        NaN,
        Infinity,
        -Infinity,
        -1,
        -2,
        -100,
        -0.5,
        -1e-5,
        Number.MIN_SAFE_INTEGER,
      ];

      for (const val of invalidNumbers) {
        const schemaRes = DropDiscPayloadSchema.safeParse({ roomCode: 'ROOM', column: val });
        expect(schemaRes.success, `Schema should reject ${val}`).toBe(false);

        const engineRes = engine.handleAction('p1', 'DROP_DISC', { column: val });
        expect(engineRes.success, `Engine should reject ${val}`).toBe(false);
        expect(engineRes.error).toContain('Invalid column');
        expect(engine.getActivePlayer()).toBe('p1');
      }
    });

    it('should handle JavaScript -0 safely as column 0 without string key pollution', () => {
      const engine = new ServerConnect4Engine();
      // In JS, Number.isInteger(-0) is true, -0 < 0 is false, -0 >= 7 is false.
      // Dropping at -0 maps to index 0.
      const res = engine.handleAction('p1', 'DROP_DISC', { column: -0 });
      expect(res.success).toBe(true);
      expect(Math.abs(res.payload.col)).toBe(0);
      expect(res.payload.row).toBe(5);

      const state: any = engine.getState();
      expect(state.board[5][0]).toBe('p1');
      expect((state.board[5] as any)['-0']).toBeUndefined();
    });

    it('should reject non-number types and JSON-deserializable malformed payloads', () => {
      const engine = new ServerConnect4Engine();
      const badPayloads = [
        { column: '0' },
        { column: '6' },
        { column: '3' },
        { column: '2.5' },
        { column: 'NaN' },
        { column: true },
        { column: false },
        { column: null },
        { column: undefined },
        { column: {} },
        { column: [] },
        { column: [2] },
        { column: '💣' },
        {},
        null,
        undefined,
        'random_string',
        123,
      ];

      for (const payload of badPayloads) {
        const engineRes = engine.handleAction('p1', 'DROP_DISC', payload);
        expect(engineRes.success, `Engine should reject payload: ${JSON.stringify(payload)}`).toBe(false);
        expect(engine.getActivePlayer()).toBe('p1');
      }
    });

    it('should strictly enforce column boundary limits (0 to 6)', () => {
      const engine = new ServerConnect4Engine();

      // Below boundary: -1
      expect(engine.handleAction('p1', 'DROP_DISC', { column: -1 }).success).toBe(false);

      // Left boundary: 0 (valid)
      const leftRes = engine.handleAction('p1', 'DROP_DISC', { column: 0 });
      expect(leftRes.success).toBe(true);
      expect(leftRes.payload.col).toBe(0);

      // Right boundary: 6 (valid for p2)
      const rightRes = engine.handleAction('p2', 'DROP_DISC', { column: 6 });
      expect(rightRes.success).toBe(true);
      expect(rightRes.payload.col).toBe(6);

      // Above boundary: 7, 8, 100, MAX_SAFE_INTEGER
      const oobColumns = [7, 8, 9, 10, 100, 2 ** 31 - 1, Number.MAX_SAFE_INTEGER];
      for (const col of oobColumns) {
        expect(engine.handleAction('p1', 'DROP_DISC', { column: col }).success).toBe(false);
        expect(DropDiscPayloadSchema.safeParse({ roomCode: 'ROOM', column: col }).success).toBe(false);
      }
    });

    it('should reject drops into saturated columns across each column independently', () => {
      // For each column 0 to 6 independently:
      for (let col = 0; col < 7; col++) {
        const engine = new ServerConnect4Engine();

        // Drop 6 pieces into column (alternating players)
        for (let drop = 0; drop < 6; drop++) {
          const active = engine.getActivePlayer();
          const res = engine.handleAction(active, 'DROP_DISC', { column: col });
          expect(res.success).toBe(true);
          expect(res.payload.row).toBe(5 - drop);
        }

        // Attempt 7th drop into full column
        const currentActive = engine.getActivePlayer();
        const overflowRes = engine.handleAction(currentActive, 'DROP_DISC', { column: col });
        expect(overflowRes.success).toBe(false);
        expect(overflowRes.error).toContain(`Column ${col + 1} is full`);
        // Crucial invariant: active player must NOT switch on rejected move
        expect(engine.getActivePlayer()).toBe(currentActive);
      }
    });

    it('should reject rapid consecutive drops by the same player', () => {
      const engine = new ServerConnect4Engine();

      // P1 drops first
      const r1 = engine.handleAction('p1', 'DROP_DISC', { column: 3 });
      expect(r1.success).toBe(true);

      // P1 attempts rapid second drop before P2 has acted
      const r2 = engine.handleAction('p1', 'DROP_DISC', { column: 3 });
      expect(r2.success).toBe(false);
      expect(r2.error).toContain('Not your turn to drop');

      // State remains unchanged, P2 is still active
      expect(engine.getActivePlayer()).toBe('p2');
    });

    it('should reject unauthorized player roles and unsupported action types', () => {
      const engine = new ServerConnect4Engine();
      const unauthorizedRoles = ['spectator', 'p3', 'admin', '', undefined as any, null as any];

      for (const role of unauthorizedRoles) {
        const res = engine.handleAction(role, 'DROP_DISC', { column: 0 });
        expect(res.success).toBe(false);
      }

      const badActions = ['ROLL_DICE', 'CHOOSE_RPS', '__proto__', 'constructor', 'dropDisc', ''];
      for (const act of badActions) {
        const res = engine.handleAction('p1', act, { column: 0 });
        expect(res.success).toBe(false);
        expect(res.error).toContain('Unsupported action type');
      }
    });

    it('should accurately detect diagonal and horizontal wins and populate matching coordinates', () => {
      // Ascending diagonal win: (5,0), (4,1), (3,2), (2,3)
      const engine = new ServerConnect4Engine();
      engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // p1 (5,0)
      engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // p2 (5,1)
      engine.handleAction('p1', 'DROP_DISC', { column: 1 }); // p1 (4,1)
      engine.handleAction('p2', 'DROP_DISC', { column: 2 }); // p2 (5,2)
      engine.handleAction('p1', 'DROP_DISC', { column: 3 }); // p1 (5,3)
      engine.handleAction('p2', 'DROP_DISC', { column: 2 }); // p2 (4,2)
      engine.handleAction('p1', 'DROP_DISC', { column: 2 }); // p1 (3,2)
      engine.handleAction('p2', 'DROP_DISC', { column: 3 }); // p2 (4,3)
      engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // p1 (4,0)
      engine.handleAction('p2', 'DROP_DISC', { column: 3 }); // p2 (3,3)
      const winRes = engine.handleAction('p1', 'DROP_DISC', { column: 3 }); // p1 (2,3) -> WIN

      expect(winRes.success).toBe(true);
      expect(winRes.isGameOver).toBe(true);
      expect(winRes.winner).toBe('p1');
      expect(winRes.payload.winningCells).toHaveLength(4);

      const state = engine.getState() as any;
      expect(state.winningCoords).toHaveLength(4);
      expect(state.winningCells).toHaveLength(4);
      // Both representations must mirror each other
      for (let i = 0; i < state.winningCoords.length; i++) {
        expect(state.winningCells[i].row).toBe(state.winningCoords[i][0]);
        expect(state.winningCells[i].col).toBe(state.winningCoords[i][1]);
      }

      // Subsequent actions must be rejected
      const postOverRes = engine.handleAction('p2', 'DROP_DISC', { column: 4 });
      expect(postOverRes.success).toBe(false);
      expect(postOverRes.error).toContain('already ended');
    });

    it('should correctly conclude a full 42-move game as draw without false wins', () => {
      const engine = new ServerConnect4Engine();
      // 42-move draw pattern where no 4 in a row is formed
      // Columns pattern sequence:
      // Fill columns 0-5 in pairs [0,0, 1,1, 2,2, 3,3, 4,4, 5,5] alternating players
      const moves = [
        // Bottom 2 rows: rows 5 & 4
        0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
        // Middle 2 rows: rows 3 & 2 (reverse player parity to prevent vertical 4)
        1, 1, 0, 0, 3, 3, 2, 2, 5, 5, 4, 4,
        // Top 2 rows: rows 1 & 0
        0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
        // Finally column 6: 6 drops
        6, 6, 6, 6, 6, 6,
      ];

      // Instead of manual sequence, let's use restorePersistenceState with 41 moves placed
      // Board pattern designed to have 0 winning lines:
      // C0: P1, P1, P2, P2, P1, P1
      // C1: P2, P2, P1, P1, P2, P2
      // C2: P1, P1, P2, P2, P1, P1
      // C3: P2, P2, P1, P1, P2, P2
      // C4: P1, P1, P2, P2, P1, P1
      // C5: P2, P2, P1, P1, P2, P2
      // C6: P1, P1, P2, P2, P1, null (empty spot at [0][6])
      const almostDrawBoard: (string | null)[][] = [
        ['p1', 'p2', 'p1', 'p2', 'p1', 'p2', null],
        ['p1', 'p2', 'p1', 'p2', 'p1', 'p2', 'p1'],
        ['p2', 'p1', 'p2', 'p1', 'p2', 'p1', 'p2'],
        ['p2', 'p1', 'p2', 'p1', 'p2', 'p1', 'p2'],
        ['p1', 'p2', 'p1', 'p2', 'p1', 'p2', 'p1'],
        ['p1', 'p2', 'p1', 'p2', 'p1', 'p2', 'p1'],
      ];

      engine.restorePersistenceState({
        board: almostDrawBoard,
        activePlayer: 'p2',
        winner: null,
      });

      // 42nd move: P2 drops in column 6
      const lastMove = engine.handleAction('p2', 'DROP_DISC', { column: 6 });
      expect(lastMove.success).toBe(true);
      expect(lastMove.isGameOver).toBe(true);
      expect(lastMove.winner).toBe('draw');
      expect(engine.isGameOver()).toBe(true);
      expect(engine.getWinner()).toBe('draw');

      // 43rd move must be rejected
      const move43 = engine.handleAction('p1', 'DROP_DISC', { column: 6 });
      expect(move43.success).toBe(false);
      expect(move43.error).toContain('already ended');
    });

    it('should withstand randomized action fuzzing without throwing or corrupting board', () => {
      const engine = new ServerConnect4Engine();
      const roles: any[] = ['p1', 'p2', 'spectator', null, undefined, 123];
      const actionTypes = ['DROP_DISC', 'ROLL_DICE', 'RESET', 'INVALID', ''];
      const columnValues = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 2.5, NaN, Infinity, '3', null, undefined, {}];

      for (let i = 0; i < 500; i++) {
        const role = roles[Math.floor(Math.random() * roles.length)];
        const act = actionTypes[Math.floor(Math.random() * actionTypes.length)];
        const col = columnValues[Math.floor(Math.random() * columnValues.length)];

        // Must never throw an uncaught exception
        expect(() => engine.handleAction(role, act, { column: col })).not.toThrow();

        // Invariant: board dimensions must always remain 6x7
        const state: any = engine.getState();
        expect(state.board.length).toBe(6);
        for (const row of state.board) {
          expect(row.length).toBe(7);
        }
      }
    });
  });

  // =========================================================================
  // 2. SNAKE & LADDER ADVERSARIAL CHALLENGES
  // =========================================================================
  describe('Snake & Ladder Adversarial Challenges', () => {
    it('should enforce exact 100 win condition from every tile in range [94, 99]', () => {
      for (let startPos = 94; startPos <= 99; startPos++) {
        const requiredRoll = 100 - startPos;
        const engine = new ServerSnakeLadderEngine();
        (engine as any).state.p1Position = startPos;

        vi.spyOn(crypto, 'randomInt').mockReturnValue(requiredRoll);
        const res = engine.handleAction('p1', 'ROLL_DICE');

        expect(res.success).toBe(true);
        expect(res.payload.to).toBe(100);
        expect(res.payload.isWinner).toBe(true);
        expect(res.isGameOver).toBe(true);
        expect(res.winner).toBe('p1');
        expect(engine.isGameOver()).toBe(true);
        expect(engine.getWinner()).toBe('p1');
        expect(engine.getState().p1Position).toBe(100);

        // Move after win rejected
        const postWin = engine.handleAction('p2', 'ROLL_DICE');
        expect(postWin.success).toBe(false);
        expect(postWin.error).toContain('already ended');
      }
    });

    it('should bounce back correctly on overshoots past 100 from tile 99 for all rolls 2-6', () => {
      // At tile 99:
      // Roll 2 -> 99 + 2 = 101 -> bounce: 100 - (101 - 100) = 99
      // Roll 3 -> 99 + 3 = 102 -> bounce: 100 - (102 - 100) = 98 -> SNAKE at 98 slides to 78!
      // Roll 4 -> 99 + 4 = 103 -> bounce: 100 - (103 - 100) = 97
      // Roll 5 -> 99 + 5 = 104 -> bounce: 100 - (104 - 100) = 96
      // Roll 6 -> 99 + 6 = 105 -> bounce: 100 - (105 - 100) = 95 -> SNAKE at 95 slides to 75!
      const expectations: Record<number, { expectedTo: number; snake?: boolean }> = {
        2: { expectedTo: 99 },
        3: { expectedTo: 78, snake: true },
        4: { expectedTo: 97 },
        5: { expectedTo: 96 },
        6: { expectedTo: 75, snake: true },
      };

      for (const [rollStr, exp] of Object.entries(expectations)) {
        const roll = Number(rollStr);
        const engine = new ServerSnakeLadderEngine();
        (engine as any).state.p1Position = 99;

        vi.spyOn(crypto, 'randomInt').mockReturnValue(roll);
        const res = engine.handleAction('p1', 'ROLL_DICE');

        expect(res.success).toBe(true);
        expect(res.payload.value).toBe(roll);
        expect(res.payload.to).toBe(exp.expectedTo);
        expect(res.isGameOver).toBe(false);
        expect(res.winner).toBeNull();
        expect(engine.isGameOver()).toBe(false);
        expect(engine.getWinner()).toBeNull();

        if (exp.snake) {
          expect(res.payload.snakeOrLadder?.type).toBe('snake');
        }
      }
    });

    it('should test bounce cascade into snake from tile 97 with roll 5', () => {
      // 97 + 5 = 102 -> bounce to 98 -> snake-98-78 slides to 78!
      const engine = new ServerSnakeLadderEngine();
      (engine as any).state.p1Position = 97;

      vi.spyOn(crypto, 'randomInt').mockReturnValue(5);
      const res = engine.handleAction('p1', 'ROLL_DICE');

      expect(res.success).toBe(true);
      expect(res.payload.to).toBe(78);
      expect(res.payload.snakeOrLadder).toEqual({
        type: 'snake',
        from: 98,
        to: 78,
      });
      expect(res.isGameOver).toBe(false);
      expect(engine.getState().p1Position).toBe(78);
    });

    it('should test bounce cascade into snake from tile 96 with roll 6', () => {
      // 96 + 6 = 102 -> bounce to 98 -> snake-98-78 slides to 78!
      const engine = new ServerSnakeLadderEngine();
      (engine as any).state.p1Position = 96;

      vi.spyOn(crypto, 'randomInt').mockReturnValue(6);
      const res = engine.handleAction('p1', 'ROLL_DICE');

      expect(res.success).toBe(true);
      expect(res.payload.to).toBe(78);
      expect(res.payload.snakeOrLadder).toEqual({
        type: 'snake',
        from: 98,
        to: 78,
      });
      expect(res.isGameOver).toBe(false);
      expect(engine.getState().p1Position).toBe(78);
    });

    it('should document bounce from 98 with roll 4 under newPos !== fromPos guard', () => {
      // 98 + 4 = 102 -> bounces back to 98
      // Because fromPos === 98 and newPos === 98, newPos !== fromPos is false
      // This test verifies the engine maintains consistent internal state without game-over
      const engine = new ServerSnakeLadderEngine();
      (engine as any).state.p1Position = 98;

      vi.spyOn(crypto, 'randomInt').mockReturnValue(4);
      const res = engine.handleAction('p1', 'ROLL_DICE');

      expect(res.success).toBe(true);
      expect(res.payload.to).toBe(98);
      expect(res.isGameOver).toBe(false);
      expect(res.winner).toBeNull();
      expect(engine.isGameOver()).toBe(false);
      expect(engine.getState().p1Position).toBe(98);
    });

    it('should verify all canonical ladders advance player to top', () => {
      for (const ladder of CANONICAL_LADDERS) {
        const engine = new ServerSnakeLadderEngine();
        // Position player 1 space before ladder bottom
        (engine as any).state.p1Position = ladder.bottom - 1;

        vi.spyOn(crypto, 'randomInt').mockReturnValue(1);
        const res = engine.handleAction('p1', 'ROLL_DICE');

        expect(res.success).toBe(true);
        expect(res.payload.to).toBe(ladder.top);
        expect(res.payload.snakeOrLadder).toEqual({
          type: 'ladder',
          from: ladder.bottom,
          to: ladder.top,
        });
        expect(engine.getState().p1Position).toBe(ladder.top);
      }
    });

    it('should verify all canonical snakes drop player to tail', () => {
      for (const snake of CANONICAL_SNAKES) {
        const engine = new ServerSnakeLadderEngine();
        // Position player 1 space before snake head
        (engine as any).state.p1Position = snake.head - 1;

        vi.spyOn(crypto, 'randomInt').mockReturnValue(1);
        const res = engine.handleAction('p1', 'ROLL_DICE');

        expect(res.success).toBe(true);
        expect(res.payload.to).toBe(snake.tail);
        expect(res.payload.snakeOrLadder).toEqual({
          type: 'snake',
          from: snake.head,
          to: snake.tail,
        });
        expect(engine.getState().p1Position).toBe(snake.tail);
      }
    });

    it('should reject rolls out of turn and invalid actions', () => {
      const engine = new ServerSnakeLadderEngine();

      // P2 tries to roll when P1 is active
      const p2Roll = engine.handleAction('p2', 'ROLL_DICE');
      expect(p2Roll.success).toBe(false);
      expect(p2Roll.error).toContain('Not your turn to roll');

      // Invalid action type
      const badAction = engine.handleAction('p1', 'CHOOSE_RPS');
      expect(badAction.success).toBe(false);
      expect(badAction.error).toContain('Unsupported action type');
    });
  });

  // =========================================================================
  // 3. ROCK PAPER SCISSORS ADVERSARIAL CHALLENGES
  // =========================================================================
  describe('Rock Paper Scissors Adversarial Challenges', () => {
    it('should run multi-round matches to completion (Bo3 first-to-2 and Bo5 first-to-3)', () => {
      // Bo3: First to 2
      const bo3Engine = new ServerRPSEngine(2);

      // Round 1: P1 rock, P2 scissors -> P1 scores
      bo3Engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
      const r1 = bo3Engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' });
      expect(r1.payload.p1Score).toBe(1);
      expect(r1.payload.p2Score).toBe(0);
      expect(r1.isGameOver).toBe(false);

      // Round 2: P1 rock, P2 paper -> P2 scores
      bo3Engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
      const r2 = bo3Engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'paper' });
      expect(r2.payload.p1Score).toBe(1);
      expect(r2.payload.p2Score).toBe(1);
      expect(r2.isGameOver).toBe(false);

      // Round 3: P1 scissors, P2 paper -> P1 scores 2 -> Match Win!
      bo3Engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'scissors' });
      const r3 = bo3Engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'paper' });
      expect(r3.payload.p1Score).toBe(2);
      expect(r3.payload.p2Score).toBe(1);
      expect(r3.isGameOver).toBe(true);
      expect(r3.winner).toBe('p1');
      expect(bo3Engine.isGameOver()).toBe(true);
      expect(bo3Engine.getWinner()).toBe('p1');

      // Further moves rejected
      const postMatch = bo3Engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
      expect(postMatch.success).toBe(false);
      expect(postMatch.error).toContain('already ended');
    });

    it('should handle tie rounds cleanly without incrementing score or ending match', () => {
      const engine = new ServerRPSEngine(2);
      const weapons: ('rock' | 'paper' | 'scissors')[] = ['rock', 'paper', 'scissors'];

      for (let i = 0; i < weapons.length; i++) {
        const weapon = weapons[i];
        engine.handleAction('p1', 'CHOOSE_RPS', { choice: weapon });
        const res = engine.handleAction('p2', 'CHOOSE_RPS', { choice: weapon });

        expect(res.success).toBe(true);
        expect(res.actionType).toBe('RPS_ROUND_RESOLVED');
        expect(res.payload.roundWinner).toBe('draw');
        expect(res.payload.p1Score).toBe(0);
        expect(res.payload.p2Score).toBe(0);
        expect(res.isGameOver).toBe(false);
        expect(engine.isGameOver()).toBe(false);
        expect(res.payload.round).toBe(i + 1);
        expect(res.payload.nextRound).toBe(i + 2);
      }
    });

    it('should preserve choice secrecy in getState() and prevent information leaks to spectators', () => {
      const engine = new ServerRPSEngine(3);

      // 1. Initial state: activePlayer is 'all'
      const initSpectatorView = engine.getState() as any;
      expect(initSpectatorView.activePlayer).toBe('all');
      expect(initSpectatorView.p1HasChosen).toBe(false);
      expect(initSpectatorView.p2HasChosen).toBe(false);
      expect(initSpectatorView.lastP1Choice).toBeNull();
      expect(initSpectatorView.lastP2Choice).toBeNull();
      expect(initSpectatorView.secretChoices).toBeUndefined();

      // 2. P1 commits secretly
      const p1Res = engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'paper' });
      expect(p1Res.success).toBe(true);
      expect(p1Res.revealed).toBe(false);

      // Spectator view after P1 choice
      const postP1View = engine.getState() as any;
      expect(postP1View.activePlayer).toBe('p2');
      expect(postP1View.p1HasChosen).toBe(true);
      expect(postP1View.p2HasChosen).toBe(false);
      // Choice must NOT be visible to opponent or spectator!
      expect(postP1View.lastP1Choice).toBeNull();
      expect(postP1View.lastP2Choice).toBeNull();
      expect(postP1View.secretChoices).toBeUndefined();

      // 3. P2 commits secretly
      const p2Res = engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'rock' });
      expect(p2Res.success).toBe(true);
      expect(p2Res.revealed).toBe(true);
      expect(p2Res.payload.p1Choice).toBe('paper');
      expect(p2Res.payload.p2Choice).toBe('rock');

      // Post clash view
      const postClashView = engine.getState() as any;
      expect(postClashView.activePlayer).toBe('all');
      expect(postClashView.p1HasChosen).toBe(false);
      expect(postClashView.p2HasChosen).toBe(false);
      expect(postClashView.lastP1Choice).toBe('paper');
      expect(postClashView.lastP2Choice).toBe('rock');
      expect(postClashView.secretChoices).toBeUndefined();
    });

    it('should reject double commits from the same player within the same round', () => {
      const engine = new ServerRPSEngine(3);

      // P1 commits choice
      const firstCommit = engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
      expect(firstCommit.success).toBe(true);

      // P1 tries to change or resubmit choice
      const secondCommit = engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'scissors' });
      expect(secondCommit.success).toBe(false);
      expect(secondCommit.error).toContain('Choice already committed');

      // When P2 commits, original P1 choice ('rock') must still be honored!
      const p2Commit = engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' });
      expect(p2Commit.success).toBe(true);
      expect(p2Commit.payload.p1Choice).toBe('rock');
      expect(p2Commit.payload.roundWinner).toBe('p1');
    });

    it('should reject invalid choices, type coercions, and malformed actions', () => {
      const engine = new ServerRPSEngine(3);
      const invalidChoices = [
        'lizard',
        'spock',
        'gun',
        'ROCK',
        'PAPER',
        'SCISSORS',
        1,
        0,
        true,
        false,
        null,
        undefined,
        {},
        [],
        ['rock'],
      ];

      for (const choice of invalidChoices) {
        const res = engine.handleAction('p1', 'CHOOSE_RPS', { choice });
        expect(res.success).toBe(false);
        expect(res.error).toContain('Invalid choice');
        expect(engine.getState().p1HasChosen).toBe(false);
      }

      const badActions = ['DROP_DISC', 'ROLL_DICE', 'COMMIT', ''];
      for (const act of badActions) {
        const res = engine.handleAction('p1', act, { choice: 'rock' });
        expect(res.success).toBe(false);
        expect(res.error).toContain('Unsupported action type');
      }
    });

    it('should preserve mid-round secret choices across persistence save and restore', () => {
      const engine1 = new ServerRPSEngine(3);
      engine1.handleAction('p1', 'CHOOSE_RPS', { choice: 'scissors' });

      // Save persistence state while P1 is committed and P2 has not chosen
      const persisted = engine1.getPersistenceState();

      // Restore into fresh engine
      const engine2 = new ServerRPSEngine(3);
      engine2.restorePersistenceState(persisted);

      // Verify active player is still p2
      expect(engine2.getActivePlayer()).toBe('p2');
      const restoredState = engine2.getState() as any;
      expect(restoredState.p1HasChosen).toBe(true);
      expect(restoredState.p2HasChosen).toBe(false);

      // Now P2 chooses paper in engine2 -> P1 scissors must win!
      const p2Res = engine2.handleAction('p2', 'CHOOSE_RPS', { choice: 'paper' });
      expect(p2Res.success).toBe(true);
      expect(p2Res.payload.p1Choice).toBe('scissors');
      expect(p2Res.payload.p2Choice).toBe('paper');
      expect(p2Res.payload.roundWinner).toBe('p1');
      expect(p2Res.payload.p1Score).toBe(1);
    });
  });
});
