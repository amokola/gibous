import { describe, it, expect } from 'vitest';
import { ServerConnect4Engine } from '../../../server/engines/Connect4Engine';
import { ServerSnakeLadderEngine } from '../../../server/engines/SnakeLadderEngine';
import crypto from 'crypto';

describe('Milestone 1 Challenger 2 - Engine Hardening Empirical Verification', () => {
  describe('Connect 4 Persistence Restore Validation', () => {
    const createBaseBoard = () => Array(6).fill(null).map(() => Array(7).fill(null));

    it('should restore from legacy winningCells format with { row, col } objects', () => {
      const engine = new ServerConnect4Engine();
      const board = createBaseBoard();
      // Set a winning row for p1 at bottom
      board[5][0] = 'p1';
      board[5][1] = 'p1';
      board[5][2] = 'p1';
      board[5][3] = 'p1';

      const legacyState = {
        board,
        activePlayer: 'p2',
        winner: 'p1',
        winningCells: [
          { row: 5, col: 0 },
          { row: 5, col: 1 },
          { row: 5, col: 2 },
          { row: 5, col: 3 },
        ],
        lastMove: { row: 5, col: 3 },
        turnTimeout: Date.now() + 15000,
      };

      engine.restorePersistenceState(legacyState);

      const state = engine.getState() as any;
      expect(engine.isGameOver()).toBe(true);
      expect(engine.getWinner()).toBe('p1');
      expect(state.winningCoords).toEqual([
        [5, 0],
        [5, 1],
        [5, 2],
        [5, 3],
      ]);
      expect(state.winningCells).toEqual([
        { row: 5, col: 0 },
        { row: 5, col: 1 },
        { row: 5, col: 2 },
        { row: 5, col: 3 },
      ]);
    });

    it('should restore from legacy winningCells format with [r, c] coordinate tuples', () => {
      const engine = new ServerConnect4Engine();
      const board = createBaseBoard();
      board[2][3] = 'p2';
      board[3][3] = 'p2';
      board[4][3] = 'p2';
      board[5][3] = 'p2';

      const legacyTupleState = {
        board,
        activePlayer: 'p1',
        winner: 'p2',
        winningCells: [
          [2, 3],
          [3, 3],
          [4, 3],
          [5, 3],
        ],
        turnTimeout: Date.now() + 15000,
      };

      engine.restorePersistenceState(legacyTupleState);

      const state = engine.getState() as any;
      expect(engine.isGameOver()).toBe(true);
      expect(engine.getWinner()).toBe('p2');
      expect(state.winningCoords).toEqual([
        [2, 3],
        [3, 3],
        [4, 3],
        [5, 3],
      ]);
      expect(state.winningCells).toEqual([
        { row: 2, col: 3 },
        { row: 3, col: 3 },
        { row: 4, col: 3 },
        { row: 5, col: 3 },
      ]);
    });

    it('should restore from hardened winningCoords format with [r, c] coordinates', () => {
      const engine = new ServerConnect4Engine();
      const board = createBaseBoard();
      board[5][1] = 'p1';
      board[4][2] = 'p1';
      board[3][3] = 'p1';
      board[2][4] = 'p1';

      const hardenedState = {
        board,
        activePlayer: 'p2',
        winner: 'p1',
        winningCoords: [
          [5, 1],
          [4, 2],
          [3, 3],
          [2, 4],
        ],
        turnTimeout: Date.now() + 15000,
      };

      engine.restorePersistenceState(hardenedState);

      const state = engine.getState() as any;
      expect(state.winningCoords).toEqual([
        [5, 1],
        [4, 2],
        [3, 3],
        [2, 4],
      ]);
      expect(state.winningCells).toEqual([
        { row: 5, col: 1 },
        { row: 4, col: 2 },
        { row: 3, col: 3 },
        { row: 2, col: 4 },
      ]);
    });

    it('should prefer winningCoords if both winningCoords and winningCells are provided', () => {
      const engine = new ServerConnect4Engine();
      const board = createBaseBoard();

      const dualState = {
        board,
        activePlayer: 'p1',
        winner: 'p1',
        winningCoords: [
          [5, 0],
          [5, 1],
          [5, 2],
          [5, 3],
        ],
        winningCells: [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
        ],
        turnTimeout: Date.now() + 15000,
      };

      engine.restorePersistenceState(dualState);
      const state = engine.getState() as any;
      expect(state.winningCoords).toEqual([
        [5, 0],
        [5, 1],
        [5, 2],
        [5, 3],
      ]);
    });

    it('should correctly restore in-progress game with null winning coordinates', () => {
      const engine = new ServerConnect4Engine();
      const board = createBaseBoard();
      board[5][3] = 'p1';

      const inProgressState = {
        board,
        activePlayer: 'p2',
        winner: null,
        winningCoords: null,
        winningCells: null,
        lastMove: { row: 5, col: 3 },
        turnTimeout: Date.now() + 15000,
      };

      engine.restorePersistenceState(inProgressState);
      const state = engine.getState() as any;
      expect(engine.isGameOver()).toBe(false);
      expect(engine.getWinner()).toBeNull();
      expect(state.winningCoords).toBeNull();
      expect(state.winningCells).toBeNull();
      expect(engine.getActivePlayer()).toBe('p2');
    });

    it('should correctly restore draw game state', () => {
      const engine = new ServerConnect4Engine();
      const board = Array(6).fill(null).map((_, r) =>
        Array(7).fill(null).map((_, c) => ((r + c) % 2 === 0 ? 'p1' : 'p2'))
      );

      const drawState = {
        board,
        activePlayer: 'p1',
        winner: 'draw',
        winningCoords: null,
        winningCells: null,
        turnTimeout: Date.now() + 15000,
      };

      engine.restorePersistenceState(drawState);
      expect(engine.isGameOver()).toBe(true);
      expect(engine.getWinner()).toBe('draw');
    });

    it('should guarantee getPersistenceState -> restorePersistenceState idempotency', () => {
      const engine1 = new ServerConnect4Engine();
      engine1.handleAction('p1', 'DROP_DISC', { column: 0 });
      engine1.handleAction('p2', 'DROP_DISC', { column: 1 });
      engine1.handleAction('p1', 'DROP_DISC', { column: 0 });

      const persisted = engine1.getPersistenceState();

      const engine2 = new ServerConnect4Engine();
      engine2.restorePersistenceState(persisted);

      expect(engine2.getState()).toEqual(engine1.getState());
      expect(engine2.getActivePlayer()).toBe(engine1.getActivePlayer());
      expect(engine2.isGameOver()).toBe(engine1.isGameOver());
    });

    it('should reject malformed persistence states', () => {
      const engine = new ServerConnect4Engine();

      // Invalid board row count
      expect(() =>
        engine.restorePersistenceState({
          board: Array(5).fill(null).map(() => Array(7).fill(null)),
          activePlayer: 'p1',
          winner: null,
        })
      ).toThrow('Invalid persisted Connect 4 state');

      // Invalid column count
      expect(() =>
        engine.restorePersistenceState({
          board: Array(6).fill(null).map(() => Array(6).fill(null)),
          activePlayer: 'p1',
          winner: null,
        })
      ).toThrow('Invalid persisted Connect 4 state');

      // Invalid cell value
      expect(() =>
        engine.restorePersistenceState({
          board: Array(6).fill(null).map((_, r) =>
            Array(7).fill(null).map((_, c) => (r === 0 && c === 0 ? 'invalid_cell' : null))
          ),
          activePlayer: 'p1',
          winner: null,
        })
      ).toThrow('Invalid persisted Connect 4 state');

      // Invalid active player
      expect(() =>
        engine.restorePersistenceState({
          board: createBaseBoard(),
          activePlayer: 'spectator',
          winner: null,
        })
      ).toThrow('Invalid persisted Connect 4 state');

      // Invalid winner
      expect(() =>
        engine.restorePersistenceState({
          board: createBaseBoard(),
          activePlayer: 'p1',
          winner: 'unknown',
        })
      ).toThrow('Invalid persisted Connect 4 state');
    });
  });

  describe('Snake & Ladder CSPRNG Empirical Distribution Validation', () => {
    it('should verify 100,000 rolls are strictly integers within [1, 6] with zero out-of-bounds', () => {
      // Real unmocked engine with default crypto.randomInt(1, 7)
      const engine = new ServerSnakeLadderEngine();

      const numRolls = 100000;
      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
      let outOfBoundsCount = 0;
      let nonIntegerCount = 0;

      for (let i = 0; i < numRolls; i++) {
        // Reset player positions to tile 1 so game doesn't terminate
        (engine as any).state.p1Position = 1;
        (engine as any).state.p2Position = 1;
        (engine as any).state.activePlayer = 'p1';
        (engine as any).state.winner = null;

        const result = engine.handleAction('p1', 'ROLL_DICE');
        const roll = result.payload.value;

        if (typeof roll !== 'number' || !Number.isInteger(roll)) {
          nonIntegerCount++;
        } else if (roll < 1 || roll > 6) {
          outOfBoundsCount++;
        } else {
          counts[roll]++;
        }
      }

      // Assert zero out-of-bounds and zero non-integers
      expect(outOfBoundsCount).toBe(0);
      expect(nonIntegerCount).toBe(0);

      // Verify each face was rolled
      for (let face = 1; face <= 6; face++) {
        expect(counts[face]).toBeGreaterThan(0);
      }

      // Check total rolls accounted for
      const totalRecorded = Object.values(counts).reduce((a, b) => a + b, 0);
      expect(totalRecorded).toBe(numRolls);
    });

    it('should pass Chi-Squared uniformity test across 120,000 CSPRNG rolls (p > 0.001)', () => {
      const engine = new ServerSnakeLadderEngine();
      const numRolls = 120000;
      const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

      for (let i = 0; i < numRolls; i++) {
        (engine as any).state.p1Position = 1;
        (engine as any).state.p2Position = 1;
        (engine as any).state.activePlayer = 'p1';
        (engine as any).state.winner = null;

        const result = engine.handleAction('p1', 'ROLL_DICE');
        counts[result.payload.value]++;
      }

      const expected = numRolls / 6; // 20,000 per face
      let chiSquare = 0;

      for (let face = 1; face <= 6; face++) {
        const observed = counts[face];
        const diff = observed - expected;
        chiSquare += (diff * diff) / expected;

        // Individual face proportion should be ~16.67% within ±1.5% tolerance
        const proportion = observed / numRolls;
        expect(proportion).toBeGreaterThan(0.15);
        expect(proportion).toBeLessThan(0.18);
      }

      // Degrees of freedom = 6 - 1 = 5
      // Chi-squared critical value for df=5 at alpha=0.001 is 20.515
      // A fair CSPRNG should yield chiSquare < 20.515
      expect(chiSquare).toBeLessThan(20.515);
    });

    it('should complete 250 simulated games to completion under real CSPRNG without errors', () => {
      let p1Wins = 0;
      let p2Wins = 0;
      let maxTurns = 0;
      let minTurns = Infinity;

      for (let game = 0; game < 250; game++) {
        const engine = new ServerSnakeLadderEngine();
        let turns = 0;

        while (!engine.isGameOver() && turns < 2000) {
          const activePlayer = engine.getActivePlayer();
          const result = engine.handleAction(activePlayer, 'ROLL_DICE');
          expect(result.success).toBe(true);
          expect(result.payload.value).toBeGreaterThanOrEqual(1);
          expect(result.payload.value).toBeLessThanOrEqual(6);
          turns++;
        }

        expect(engine.isGameOver()).toBe(true);
        const winner = engine.getWinner();
        expect(winner === 'p1' || winner === 'p2').toBe(true);

        const finalState = engine.getState() as any;
        const winnerPos = winner === 'p1' ? finalState.p1Position : finalState.p2Position;
        expect(winnerPos).toBe(100);

        if (winner === 'p1') p1Wins++;
        else p2Wins++;

        maxTurns = Math.max(maxTurns, turns);
        minTurns = Math.min(minTurns, turns);
      }

      // Both players should win roughly balanced proportion of matches
      expect(p1Wins).toBeGreaterThan(75);
      expect(p2Wins).toBeGreaterThan(75);
      expect(minTurns).toBeGreaterThan(5);
      expect(maxTurns).toBeLessThan(1000);
    }, 30000);
  });
});
