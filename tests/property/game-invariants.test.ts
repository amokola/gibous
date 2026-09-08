import { describe, it } from 'vitest';
import fc from 'fast-check';
import { ServerSnakeLadderEngine } from '../../server/engines/SnakeLadderEngine';
import { ServerConnect4Engine } from '../../server/engines/Connect4Engine';
import { ServerRPSEngine } from '../../server/engines/RPSEngine';

describe('Game Engine Invariants (Property-Based Tests via fast-check)', () => {
  it('Property: Snake & Ladder player positions always remain within [1, 100]', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 50 }), (diceRolls) => {
        const engine = new ServerSnakeLadderEngine();
        let turn = 0;

        for (const roll of diceRolls) {
          if (engine.isGameOver()) break;
          const player = turn % 2 === 0 ? 'p1' : 'p2';

          // Override Math.random for deterministic dice roll
          const mockRandom = (roll - 1) / 6;
          const origRandom = Math.random;
          Math.random = () => mockRandom;

          engine.handleAction(player, 'ROLL_DICE');
          Math.random = origRandom;
          turn++;

          const state: any = engine.getState();
          if (state.p1Position < 1 || state.p1Position > 100) return false;
          if (state.p2Position < 1 || state.p2Position > 100) return false;
        }

        return true;
      })
    );
  });

  it('Property: Connect 4 columns never exceed 6 pieces and piece count equals successful moves', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 6 }), { minLength: 1, maxLength: 50 }), (columns) => {
        const engine = new ServerConnect4Engine();
        let turn = 0;
        let successfulMoves = 0;

        for (const col of columns) {
          if (engine.isGameOver()) break;
          const player = turn % 2 === 0 ? 'p1' : 'p2';
          const res = engine.handleAction(player, 'DROP_DISC', { column: col });

          if (res.success) {
            successfulMoves++;
            turn++;
          }
        }

        const state: any = engine.getState();
        let totalPiecesOnBoard = 0;
        for (let r = 0; r < 6; r++) {
          for (let c = 0; c < 7; c++) {
            if (state.board[r][c] !== null) {
              totalPiecesOnBoard++;
            }
          }
        }

        return totalPiecesOnBoard === successfulMoves;
      })
    );
  });

  it('Property: RPS scores never decrease and do not exceed target max points', () => {
    const choices = ['rock', 'paper', 'scissors'] as const;
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.constantFrom(...choices), fc.constantFrom(...choices)), { minLength: 1, maxLength: 20 }),
        (rounds) => {
          const engine = new ServerRPSEngine(3);
          let prevP1 = 0;
          let prevP2 = 0;

          for (const [c1, c2] of rounds) {
            if (engine.isGameOver()) break;

            engine.handleAction('p1', 'CHOOSE_RPS', { choice: c1 });
            engine.handleAction('p2', 'CHOOSE_RPS', { choice: c2 });

            const state: any = engine.getState();
            if (state.p1Score < prevP1 || state.p2Score < prevP2) return false;
            if (state.p1Score > 3 || state.p2Score > 3) return false;

            prevP1 = state.p1Score;
            prevP2 = state.p2Score;
          }

          return true;
        }
      )
    );
  });
});
