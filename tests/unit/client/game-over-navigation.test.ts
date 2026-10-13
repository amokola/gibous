import { describe, expect, it } from 'vitest';
import { getGameOverTransition } from '../../../src/state/screenTransitions';

describe('game-over screen transitions', () => {
  it('delays the result screen only while the player is watching gameplay', () => {
    expect(getGameOverTransition('game')).toBe('delayed');
  });

  it('shows a result immediately from the versus intro', () => {
    expect(getGameOverTransition('vs-intro')).toBe('immediate');
  });

  it('does not pull players back after they have left the duel', () => {
    expect(getGameOverTransition('home')).toBe('ignore');
    expect(getGameOverTransition('lobby')).toBe('ignore');
    expect(getGameOverTransition('gameover')).toBe('ignore');
  });
});
