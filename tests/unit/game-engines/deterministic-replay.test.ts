import { describe, expect, it } from 'vitest';
import { ServerSnakeLadderEngine } from '../../../server/engines/SnakeLadderEngine';
import { ServerConnect4Engine } from '../../../server/engines/Connect4Engine';
import { ServerRPSEngine } from '../../../server/engines/RPSEngine';

describe('server game engine replay boundaries', () => {
  it('replays Snake & Ladders identically with injected randomness and clock', () => {
    const random = () => 0.5;
    const clock = () => 100_000;
    const first = new ServerSnakeLadderEngine(random, clock);
    const second = new ServerSnakeLadderEngine(random, clock);

    for (const player of ['p1', 'p2', 'p1'] as const) {
      expect(first.handleAction(player, 'ROLL_DICE')).toEqual(second.handleAction(player, 'ROLL_DICE'));
    }

    expect(first.getState()).toEqual(second.getState());
    expect((first.getState() as any).turnTimeout).toBe(115_000);
  });

  it('does not expose mutable Connect 4 board state through action payloads', () => {
    const engine = new ServerConnect4Engine(() => 100_000);
    const result = engine.handleAction('p1', 'DROP_DISC', { column: 0 });

    (result.payload.board as any[][])[5][0] = null;

    expect((engine.getState() as any).board[5][0]).toBe('p1');
  });

  it('restores hidden RPS choices needed to finish a replay', () => {
    const original = new ServerRPSEngine(1);
    original.handleAction('p1', 'CHOOSE_RPS', { choice: 'rock' });
    const restored = new ServerRPSEngine(1);
    restored.restorePersistenceState(original.getPersistenceState());

    expect(restored.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' })).toEqual(
      original.handleAction('p2', 'CHOOSE_RPS', { choice: 'scissors' }),
    );
    expect(restored.getState()).toEqual(original.getState());
  });
});
