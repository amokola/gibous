import { describe, it, expect, beforeEach } from 'vitest';
import { ServerConnect4Engine } from '../../../server/engines/Connect4Engine';

describe('ServerConnect4Engine Unit Tests', () => {
  let engine: ServerConnect4Engine;

  beforeEach(() => {
    engine = new ServerConnect4Engine();
  });

  it('should initialize with empty 6x7 board and P1 active', () => {
    const state: any = engine.getState();
    expect(state.board.length).toBe(6);
    expect(state.board[0].length).toBe(7);
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        expect(state.board[r][c]).toBeNull();
      }
    }
    expect(engine.getActivePlayer()).toBe('p1');
    expect(engine.isGameOver()).toBe(false);
    expect(engine.getWinner()).toBeNull();
  });

  it('should drop discs to bottom row due to gravity and alternate turns', () => {
    const r1 = engine.handleAction('p1', 'DROP_DISC', { column: 3 });
    expect(r1.success).toBe(true);
    expect(r1.payload.row).toBe(5); // Lowest row in 6-row board (0-indexed 5)
    expect(r1.payload.col).toBe(3);
    expect(r1.payload.player).toBe('p1');
    expect(r1.payload.nextPlayer).toBe('p2');
    expect(engine.getActivePlayer()).toBe('p2');

    // P2 drops in same column -> lands on row 4
    const r2 = engine.handleAction('p2', 'DROP_DISC', { column: 3 });
    expect(r2.success).toBe(true);
    expect(r2.payload.row).toBe(4);
    expect(r2.payload.col).toBe(3);
    expect(r2.payload.player).toBe('p2');
    expect(r2.payload.nextPlayer).toBe('p1');
    expect(engine.getActivePlayer()).toBe('p1');
  });

  it('should reject moves from inactive player', () => {
    const result = engine.handleAction('p2', 'DROP_DISC', { column: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not your turn');
  });

  it('should reject invalid column indices', () => {
    expect(engine.handleAction('p1', 'DROP_DISC', { column: -1 }).success).toBe(false);
    expect(engine.handleAction('p1', 'DROP_DISC', { column: 7 }).success).toBe(false);
    expect(engine.handleAction('p1', 'DROP_DISC', { column: 'abc' as any }).success).toBe(false);
    expect(engine.handleAction('p1', 'DROP_DISC', {}).success).toBe(false);
  });

  it('should reject drops into a full column (6 pieces max)', () => {
    // Fill column 0 with 6 pieces
    for (let i = 0; i < 6; i++) {
      const player = i % 2 === 0 ? 'p1' : 'p2';
      const res = engine.handleAction(player, 'DROP_DISC', { column: 0 });
      expect(res.success).toBe(true);
    }

    // 7th drop into column 0 should fail
    const overflowRes = engine.handleAction('p1', 'DROP_DISC', { column: 0 });
    expect(overflowRes.success).toBe(false);
    expect(overflowRes.error).toContain('full');
  });

  it('should detect horizontal win for 4 in a row', () => {
    // P1: (5,0), (5,1), (5,2), (5,3)
    // P2: (4,0), (4,1), (4,2)
    engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // P1 (5,0)
    engine.handleAction('p2', 'DROP_DISC', { column: 0 }); // P2 (4,0)
    engine.handleAction('p1', 'DROP_DISC', { column: 1 }); // P1 (5,1)
    engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // P2 (4,1)
    engine.handleAction('p1', 'DROP_DISC', { column: 2 }); // P1 (5,2)
    engine.handleAction('p2', 'DROP_DISC', { column: 2 }); // P2 (4,2)
    const winRes = engine.handleAction('p1', 'DROP_DISC', { column: 3 }); // P1 (5,3) -> WIN!

    expect(winRes.success).toBe(true);
    expect(winRes.isGameOver).toBe(true);
    expect(winRes.winner).toBe('p1');
    expect(engine.isGameOver()).toBe(true);
    expect(engine.getWinner()).toBe('p1');
    expect(winRes.payload.winningCells?.length).toBeGreaterThanOrEqual(4);
  });

  it('should detect vertical win for 4 in a column', () => {
    // P1 drops in col 0, P2 drops in col 1
    engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // P1 (5,0)
    engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // P2 (5,1)
    engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // P1 (4,0)
    engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // P2 (4,1)
    engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // P1 (3,0)
    engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // P2 (3,1)
    const winRes = engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // P1 (2,0) -> 4 vertical

    expect(winRes.success).toBe(true);
    expect(winRes.isGameOver).toBe(true);
    expect(winRes.winner).toBe('p1');
  });

  it('should detect diagonal win (ascending /)', () => {
    // Build staircase in columns 0, 1, 2, 3 so P1 gets (5,0), (4,1), (3,2), (2,3)
    engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // P1 (5,0) [WIN PIECE 1]
    engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // P2 (5,1)
    engine.handleAction('p1', 'DROP_DISC', { column: 1 }); // P1 (4,1) [WIN PIECE 2]
    engine.handleAction('p2', 'DROP_DISC', { column: 2 }); // P2 (5,2)
    engine.handleAction('p1', 'DROP_DISC', { column: 3 }); // P1 (5,3)
    engine.handleAction('p2', 'DROP_DISC', { column: 2 }); // P2 (4,2)
    engine.handleAction('p1', 'DROP_DISC', { column: 2 }); // P1 (3,2) [WIN PIECE 3]
    engine.handleAction('p2', 'DROP_DISC', { column: 3 }); // P2 (4,3)
    engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // P1 (4,0) dummy
    engine.handleAction('p2', 'DROP_DISC', { column: 3 }); // P2 (3,3)
    const winRes = engine.handleAction('p1', 'DROP_DISC', { column: 3 }); // P1 (2,3) [WIN PIECE 4]

    expect(winRes.success).toBe(true);
    expect(winRes.isGameOver).toBe(true);
    expect(winRes.winner).toBe('p1');
  });

  it('should detect diagonal win (descending \\)', () => {
    // Build diagonal for P1: (2,0), (3,1), (4,2), (5,3)
    engine.handleAction('p1', 'DROP_DISC', { column: 3 }); // P1 (5,3) [WIN PIECE 1]
    engine.handleAction('p2', 'DROP_DISC', { column: 2 }); // P2 (5,2)
    engine.handleAction('p1', 'DROP_DISC', { column: 2 }); // P1 (4,2) [WIN PIECE 2]
    engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // P2 (5,1)
    engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // P1 (5,0)
    engine.handleAction('p2', 'DROP_DISC', { column: 1 }); // P2 (4,1)
    engine.handleAction('p1', 'DROP_DISC', { column: 1 }); // P1 (3,1) [WIN PIECE 3]
    engine.handleAction('p2', 'DROP_DISC', { column: 0 }); // P2 (4,0)
    engine.handleAction('p1', 'DROP_DISC', { column: 3 }); // P1 (4,3) dummy
    engine.handleAction('p2', 'DROP_DISC', { column: 0 }); // P2 (3,0)
    const winRes = engine.handleAction('p1', 'DROP_DISC', { column: 0 }); // P1 (2,0) [WIN PIECE 4]

    expect(winRes.success).toBe(true);
    expect(winRes.isGameOver).toBe(true);
    expect(winRes.winner).toBe('p1');
  });

  it('should detect draw when board is completely filled without a winner', () => {
    // Fill board in an engineered non-winning pattern
    // Board pattern:
    // C0: P1, P1, P2, P2, P1, P1
    // C1: P2, P2, P1, P1, P2, P2
    // C2: P1, P1, P2, P2, P1, P1
    // C3: P2, P2, P1, P1, P2, P2
    // C4: P1, P1, P2, P2, P1, P1
    // C5: P2, P2, P1, P1, P2, P2
    // C6: P1, P1, P2, P2, P1, P1
    const stateAny = engine as any;
    // Set board to 1 move before full draw
    const testBoard: (string | null)[][] = [
      ['p1', 'p2', 'p1', 'p2', 'p1', 'p2', null],
      ['p1', 'p2', 'p1', 'p2', 'p1', 'p2', 'p1'],
      ['p2', 'p1', 'p2', 'p1', 'p2', 'p1', 'p2'],
      ['p2', 'p1', 'p2', 'p1', 'p2', 'p1', 'p2'],
      ['p1', 'p2', 'p1', 'p2', 'p1', 'p2', 'p1'],
      ['p1', 'p2', 'p1', 'p2', 'p1', 'p2', 'p1'],
    ];
    stateAny.state.board = testBoard;
    stateAny.state.activePlayer = 'p1';

    const lastMove = engine.handleAction('p1', 'DROP_DISC', { column: 6 });
    expect(lastMove.success).toBe(true);
    expect(lastMove.isGameOver).toBe(true);
    expect(lastMove.winner).toBe('draw');
    expect(engine.getWinner()).toBe('draw');
  });

  it('should reject moves after game over', () => {
    const stateAny = engine as any;
    stateAny.state.winner = 'p2';

    const result = engine.handleAction('p1', 'DROP_DISC', { column: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('already ended');
  });

  it('should return immutable state clones in getState()', () => {
    const state1: any = engine.getState();
    state1.board[0][0] = 'p1';

    const state2: any = engine.getState();
    expect(state2.board[0][0]).toBeNull();
  });
});
