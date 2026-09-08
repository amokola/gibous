import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ServerSnakeLadderEngine } from '../../../server/engines/SnakeLadderEngine';
import { CANONICAL_SNAKES, CANONICAL_LADDERS } from '../../../shared/constants/board';

describe('ServerSnakeLadderEngine Unit Tests', () => {
  let engine: ServerSnakeLadderEngine;

  beforeEach(() => {
    engine = new ServerSnakeLadderEngine();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with P1 and P2 at tile 1 and P1 active', () => {
    const state = engine.getState();
    expect(state.p1Position).toBe(1);
    expect(state.p2Position).toBe(1);
    expect(engine.getActivePlayer()).toBe('p1');
    expect(engine.isGameOver()).toBe(false);
    expect(engine.getWinner()).toBeNull();
  });

  it('should reject actions from the inactive player', () => {
    const result = engine.handleAction('p2', 'ROLL_DICE');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not your turn');
    expect(engine.getActivePlayer()).toBe('p1');
  });

  it('should reject unsupported action types', () => {
    const result = engine.handleAction('p1', 'DROP_DISC', { column: 3 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unsupported action type');
  });

  it('should advance player by rolled dice value (1-6) and alternate turn', () => {
    // Mock Math.random to return 0.5 -> roll = Math.floor(0.5 * 6) + 1 = 4
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const result = engine.handleAction('p1', 'ROLL_DICE');
    expect(result.success).toBe(true);
    expect(result.actionType).toBe('DICE_ROLLED');
    expect(result.payload.value).toBe(4);
    expect(result.payload.from).toBe(1);
    expect(result.payload.to).toBe(5);
    expect(result.payload.nextPlayer).toBe('p2');
    expect(engine.getActivePlayer()).toBe('p2');

    const state = engine.getState();
    expect(state.p1Position).toBe(5);
    expect(state.p2Position).toBe(1);
  });

  it('should correctly climb ladders when landing on ladder bottom', () => {
    // First ladder is ladder-6-27 (bottom: 6, top: 27)
    // From 1, rolling a 5 lands on 6
    vi.spyOn(Math, 'random').mockReturnValue(4 / 6); // 5

    const result = engine.handleAction('p1', 'ROLL_DICE');
    expect(result.success).toBe(true);
    expect(result.payload.value).toBe(5);
    expect(result.payload.from).toBe(1);
    expect(result.payload.to).toBe(27);
    expect(result.payload.snakeOrLadder).toEqual({
      type: 'ladder',
      from: 6,
      to: 27,
    });

    const state = engine.getState();
    expect(state.p1Position).toBe(27);
  });

  it('should slide down snakes when landing on snake head', () => {
    // snake-36-14 (head: 36, tail: 14)
    // First let's move P1 to tile 30
    const stateAny = engine as any;
    stateAny.state.p1Position = 30;

    // Roll a 6 to land on 36
    vi.spyOn(Math, 'random').mockReturnValue(0.99); // 6

    const result = engine.handleAction('p1', 'ROLL_DICE');
    expect(result.success).toBe(true);
    expect(result.payload.value).toBe(6);
    expect(result.payload.to).toBe(14);
    expect(result.payload.snakeOrLadder).toEqual({
      type: 'snake',
      from: 36,
      to: 14,
    });

    expect((engine.getState() as any).p1Position).toBe(14);
  });

  it('should test transitions for all canonical ladders', () => {
    for (const ladder of CANONICAL_LADDERS) {
      engine.reset();
      const stateAny = engine as any;
      stateAny.state.p1Position = ladder.bottom - 1;

      // Roll 1 to land exactly on ladder.bottom
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // 1
      const result = engine.handleAction('p1', 'ROLL_DICE');

      expect(result.success).toBe(true);
      expect(result.payload.to).toBe(ladder.top);
      expect(result.payload.snakeOrLadder?.type).toBe('ladder');
    }
  });

  it('should test transitions for all canonical snakes', () => {
    for (const snake of CANONICAL_SNAKES) {
      engine.reset();
      const stateAny = engine as any;
      stateAny.state.p1Position = snake.head - 1;

      // Roll 1 to land exactly on snake.head
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // 1
      const result = engine.handleAction('p1', 'ROLL_DICE');

      expect(result.success).toBe(true);
      expect(result.payload.to).toBe(snake.tail);
      expect(result.payload.snakeOrLadder?.type).toBe('snake');
    }
  });

  it('should bounce back if overshooting tile 100', () => {
    const stateAny = engine as any;
    stateAny.state.p1Position = 98;

    // Roll 5 -> 98 + 5 = 103 -> bounce back: 100 - (103 - 100) = 97
    vi.spyOn(Math, 'random').mockReturnValue(4 / 6); // 5

    const result = engine.handleAction('p1', 'ROLL_DICE');
    expect(result.success).toBe(true);
    expect(result.payload.to).toBe(97);
    expect(result.isGameOver).toBe(false);
    expect(stateAny.state.p1Position).toBe(97);
  });

  it('should declare victory immediately when landing exactly on tile 100', () => {
    const stateAny = engine as any;
    stateAny.state.p1Position = 96;

    // Roll 4 -> 96 + 4 = 100
    vi.spyOn(Math, 'random').mockReturnValue(3 / 6); // 4

    const result = engine.handleAction('p1', 'ROLL_DICE');
    expect(result.success).toBe(true);
    expect(result.payload.to).toBe(100);
    expect(result.payload.isWinner).toBe(true);
    expect(result.isGameOver).toBe(true);
    expect(result.winner).toBe('p1');
    expect(engine.isGameOver()).toBe(true);
    expect(engine.getWinner()).toBe('p1');
  });

  it('should reject moves after game over', () => {
    const stateAny = engine as any;
    stateAny.state.winner = 'p1';

    const result = engine.handleAction('p2', 'ROLL_DICE');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already ended');
    expect(result.isGameOver).toBe(true);
  });

  it('should reset state cleanly', () => {
    const stateAny = engine as any;
    stateAny.state.p1Position = 50;
    stateAny.state.winner = 'p1';

    engine.reset();
    expect(engine.getState().p1Position).toBe(1);
    expect(engine.getState().p2Position).toBe(1);
    expect(engine.getActivePlayer()).toBe('p1');
    expect(engine.isGameOver()).toBe(false);
    expect(engine.getWinner()).toBeNull();
  });
});
