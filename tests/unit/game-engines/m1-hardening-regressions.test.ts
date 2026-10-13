import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ServerConnect4Engine } from '../../../server/engines/Connect4Engine';
import { ServerSnakeLadderEngine } from '../../../server/engines/SnakeLadderEngine';
import { ServerRPSEngine } from '../../../server/engines/RPSEngine';
import { DropDiscPayloadSchema } from '../../../shared/schemas/protocol';
import crypto from 'crypto';

describe('Milestone 1 Hardening Regressions', () => {
  describe('Connect 4 Integer Validation (Bug C4-01)', () => {
    it('should reject non-integer float column in DropDiscPayloadSchema', () => {
      const floatPayload = { roomCode: 'TESTROOM', column: 2.5 };
      const parsed = DropDiscPayloadSchema.safeParse(floatPayload);
      expect(parsed.success).toBe(false);

      const intPayload = { roomCode: 'TESTROOM', column: 2 };
      expect(DropDiscPayloadSchema.safeParse(intPayload).success).toBe(true);
    });

    it('should reject non-integer float column in Connect4Engine.handleAction', () => {
      const engine = new ServerConnect4Engine();
      const result = engine.handleAction('p1', 'DROP_DISC', { column: 2.5 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid column: 2.5');
      expect(engine.getActivePlayer()).toBe('p1');

      // Verify array has not been polluted with non-integer string property
      const state = engine.getState() as any;
      expect(Object.keys(state.board[5]).length).toBe(7);
      expect((state.board[5] as any)['2.5']).toBeUndefined();
    });

    it('should reject NaN and Infinity in Connect4Engine.handleAction', () => {
      const engine = new ServerConnect4Engine();
      expect(engine.handleAction('p1', 'DROP_DISC', { column: NaN }).success).toBe(false);
      expect(engine.handleAction('p1', 'DROP_DISC', { column: Infinity }).success).toBe(false);
      expect(engine.handleAction('p1', 'DROP_DISC', { column: -Infinity }).success).toBe(false);
      expect(engine.getActivePlayer()).toBe('p1');
    });
  });

  describe('Connect 4 Winning Line Synchronization (Bug C4-02)', () => {
    it('should expose both winningCoords and winningCells in Connect4Engine.getState() on win', () => {
      const engine = new ServerConnect4Engine();
      // Drop discs to produce a horizontal win for p1 on bottom row (row 5, cols 0, 1, 2, 3)
      // p1: 0, p2: 0, p1: 1, p2: 1, p1: 2, p2: 2, p1: 3 (win!)
      engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // p1 at (5, 0)
      engine.handleAction('p2', 'DROP_DISC', { column: 0 }); // p2 at (4, 0)
      engine.handleAction('p1', 'DROP_DISC', { column: 1 }); // p1 at (5, 1)
      engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // p2 at (4, 1)
      engine.handleAction('p1', 'DROP_DISC', { column: 2 }); // p1 at (5, 2)
      engine.handleAction('p2', 'DROP_DISC', { column: 2 }); // p2 at (4, 2)
      const winResult = engine.handleAction('p1', 'DROP_DISC', { column: 3 }); // p1 at (5, 3) -> WIN

      expect(winResult.success).toBe(true);
      expect(winResult.isGameOver).toBe(true);
      expect(winResult.winner).toBe('p1');

      const state = engine.getState() as any;
      expect(state.winner).toBe('p1');
      expect(state.winningCoords).toBeDefined();
      expect(Array.isArray(state.winningCoords)).toBe(true);
      expect(state.winningCoords.length).toBe(4);

      expect(state.winningCells).toBeDefined();
      expect(Array.isArray(state.winningCells)).toBe(true);
      expect(state.winningCells.length).toBe(4);
      expect(state.winningCells[0]).toHaveProperty('row');
      expect(state.winningCells[0]).toHaveProperty('col');

      // Verify coordinate equivalence
      for (let i = 0; i < state.winningCoords.length; i++) {
        expect(state.winningCells[i].row).toBe(state.winningCoords[i][0]);
        expect(state.winningCells[i].col).toBe(state.winningCoords[i][1]);
      }
    });

    it('should restore winningCoords and winningCells from persistence state', () => {
      const engine = new ServerConnect4Engine();
      const mockState = {
        board: Array(6).fill(null).map(() => Array(7).fill(null)),
        activePlayer: 'p1',
        winner: 'p1',
        winningCoords: [[5, 0], [5, 1], [5, 2], [5, 3]],
        turnTimeout: Date.now() + 15000,
      };

      engine.restorePersistenceState(mockState);
      const restored = engine.getState() as any;
      expect(restored.winningCoords).toEqual([[5, 0], [5, 1], [5, 2], [5, 3]]);
      expect(restored.winningCells).toEqual([
        { row: 5, col: 0 },
        { row: 5, col: 1 },
        { row: 5, col: 2 },
        { row: 5, col: 3 },
      ]);
    });
  });

  describe('Snake & Ladder CSPRNG and Overshoot Cascade (Bugs SL-01, SL-02, SL-03)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should use crypto.randomInt(1, 7) by default for CSPRNG dice rolling', () => {
      const randomIntSpy = vi.spyOn(crypto, 'randomInt').mockReturnValue(4);
      const engine = new ServerSnakeLadderEngine();

      const result = engine.handleAction('p1', 'ROLL_DICE');
      expect(result.success).toBe(true);
      expect(result.payload.value).toBe(4);
      expect(randomIntSpy).toHaveBeenCalledWith(1, 7);
    });

    it('should correctly cascade into snake on bounce-back from tile 97 with roll 5', () => {
      // Tile 97 + roll 5 = 102 -> bounce back to 98.
      // Canonical snake at 98 slides down to 78!
      const randomIntSpy = vi.spyOn(crypto, 'randomInt').mockReturnValue(5);
      const engine = new ServerSnakeLadderEngine();
      (engine as any).state.p1Position = 97;

      const result = engine.handleAction('p1', 'ROLL_DICE');
      expect(result.success).toBe(true);
      expect(result.payload.value).toBe(5);
      expect(result.payload.to).toBe(78);
      expect(result.payload.snakeOrLadder).toEqual({
        type: 'snake',
        from: 98,
        to: 78,
      });
      expect(result.isGameOver).toBe(false);
      expect(engine.isGameOver()).toBe(false);
      expect(engine.getState().p1Position).toBe(78);
    });

    it('should not mark game over when bouncing back from tile 98 with roll 4', () => {
      // 98 + 4 = 102 -> bounce to 98
      const randomIntSpy = vi.spyOn(crypto, 'randomInt').mockReturnValue(4);
      const engine = new ServerSnakeLadderEngine();
      (engine as any).state.p1Position = 98;

      const result = engine.handleAction('p1', 'ROLL_DICE');
      expect(result.success).toBe(true);
      expect(result.payload.to).toBe(98);
      expect(result.isGameOver).toBe(false);
      expect(result.winner).toBeNull();
      expect(engine.isGameOver()).toBe(false);
      expect(engine.getWinner()).toBeNull();
    });
  });

  describe('RPS Engine Active Player & Spectator State (Bug RPS-02)', () => {
    it('should reflect activePlayer as all when neither player has chosen', () => {
      const engine = new ServerRPSEngine(3);
      const state = engine.getState() as any;
      expect(state.activePlayer).toBe('all');
    });

    it('should reflect activePlayer as the pending player when one has chosen', () => {
      const engine = new ServerRPSEngine(3);
      engine.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });

      const stateAfterP1 = engine.getState() as any;
      expect(stateAfterP1.activePlayer).toBe('p2');
      expect(engine.getActivePlayer()).toBe('p2');

      // Now reset and test p2 choosing first
      engine.reset();
      engine.handleAction('p2', 'CHOOSE_RPS', { choice: 'rock' });
      const stateAfterP2 = engine.getState() as any;
      expect(stateAfterP2.activePlayer).toBe('p1');
      expect(engine.getActivePlayer()).toBe('p1');
    });
  });

  describe('RPS Choice Watchdog (Bug RPS-01)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should unlock choice buttons after 6000ms watchdog timeout', () => {
      let myLockedChoice: string | null = null;
      let choiceWatchdog: ReturnType<typeof setTimeout> | null = null;

      const clearChoiceWatchdog = () => {
        if (choiceWatchdog) {
          clearTimeout(choiceWatchdog);
          choiceWatchdog = null;
        }
      };

      const handleSelect = (choice: string) => {
        myLockedChoice = choice;
        clearChoiceWatchdog();
        choiceWatchdog = setTimeout(() => {
          myLockedChoice = null;
        }, 6000);
      };

      handleSelect('rock');
      expect(myLockedChoice).toBe('rock');

      // 5999ms -> still locked
      vi.advanceTimersByTime(5999);
      expect(myLockedChoice).toBe('rock');

      // 6000ms -> watchdog fires and unlocks
      vi.advanceTimersByTime(1);
      expect(myLockedChoice).toBeNull();
    });
  });
});
