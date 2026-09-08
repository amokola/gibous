import { describe, it, expect } from 'vitest';
import {
  CANONICAL_SNAKES,
  CANONICAL_LADDERS,
  SNAKES_MAP,
  LADDERS_MAP,
} from '../../../shared/constants/board';

describe('Shared Board Constants (Canonical Snake & Ladder Config)', () => {
  it('should define canonical snakes with valid head > tail positions within [1, 100]', () => {
    expect(CANONICAL_SNAKES.length).toBeGreaterThan(0);
    for (const snake of CANONICAL_SNAKES) {
      expect(snake.head).toBeGreaterThan(1);
      expect(snake.head).toBeLessThan(100);
      expect(snake.tail).toBeGreaterThanOrEqual(1);
      expect(snake.tail).toBeLessThan(snake.head);
      expect(['green', 'red', 'purple']).toContain(snake.color);
    }
  });

  it('should define canonical ladders with valid bottom < top positions within [1, 100]', () => {
    expect(CANONICAL_LADDERS.length).toBeGreaterThan(0);
    for (const ladder of CANONICAL_LADDERS) {
      expect(ladder.bottom).toBeGreaterThan(1);
      expect(ladder.bottom).toBeLessThan(100);
      expect(ladder.top).toBeGreaterThan(ladder.bottom);
      expect(ladder.top).toBeLessThanOrEqual(100);
    }
  });

  it('should not place a snake head on tile 100 or tile 1', () => {
    const snakeHeads = CANONICAL_SNAKES.map((s) => s.head);
    expect(snakeHeads).not.toContain(100);
    expect(snakeHeads).not.toContain(1);
  });

  it('should not place a ladder bottom on tile 100 or tile 1', () => {
    const ladderBottoms = CANONICAL_LADDERS.map((l) => l.bottom);
    expect(ladderBottoms).not.toContain(100);
    expect(ladderBottoms).not.toContain(1);
  });

  it('should ensure no overlap between snake heads and ladder bottoms (infinite loop prevention)', () => {
    const snakeHeads = new Set(CANONICAL_SNAKES.map((s) => s.head));
    const ladderBottoms = new Set(CANONICAL_LADDERS.map((l) => l.bottom));

    for (const head of snakeHeads) {
      expect(ladderBottoms.has(head)).toBe(false);
    }
  });

  it('should ensure SNAKES_MAP and LADDERS_MAP match canonical arrays exactly', () => {
    for (const snake of CANONICAL_SNAKES) {
      expect(SNAKES_MAP[snake.head]).toBe(snake.tail);
    }
    for (const ladder of CANONICAL_LADDERS) {
      expect(LADDERS_MAP[ladder.bottom]).toBe(ladder.top);
    }
  });
});
