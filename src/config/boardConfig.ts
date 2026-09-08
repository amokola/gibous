import { CANONICAL_SNAKES, CANONICAL_LADDERS } from '../../shared/constants/board';
import { Snake, Ladder } from '../types/game';

// Standard 10x10 Snake and Ladder configuration from shared single source of truth
export const SNAKES: Snake[] = CANONICAL_SNAKES;
export const LADDERS: Ladder[] = CANONICAL_LADDERS;

/**
 * Returns (col, row) on the 10x10 grid for a given tile number (1-100).
 * Grid indexing:
 * col: 0 (left) to 9 (right)
 * row: 0 (bottom) to 9 (top)
 */
export function getTileCoordinates(tileNumber: number): { col: number; row: number } {
  const clamped = Math.max(1, Math.min(100, tileNumber));
  const rowFromBottom = Math.floor((clamped - 1) / 10);
  const remainder = (clamped - 1) % 10;
  
  // Odd rows (1, 3, 5, 7, 9) go Right-to-Left (e.g. Row 1 has 20 on left to 11 on right)
  // Even rows (0, 2, 4, 6, 8) go Left-to-Right (e.g. Row 0 has 1 on left to 10 on right)
  const isEvenRow = rowFromBottom % 2 === 0;
  const col = isEvenRow ? remainder : 9 - remainder;

  return { col, row: rowFromBottom };
}

/**
 * Returns center percentage position { x: 0-100, y: 0-100 } for SVG/HTML absolute positioning.
 * x: 0% is left edge, 100% is right edge.
 * y: 0% is top edge, 100% is bottom edge.
 */
export function getTileCenterPercent(tileNumber: number): { x: number; y: number } {
  const { col, row } = getTileCoordinates(tileNumber);
  // Each tile is 10% wide and 10% tall. Center is (col * 10 + 5)%, ((9 - row) * 10 + 5)%
  const x = col * 10 + 5;
  const y = (9 - row) * 10 + 5;
  return { x, y };
}

/**
 * Calculates the exact sequence of tiles traversed one by one for a dice roll.
 * Handles normal advancement and bounce-back rule when overshooting tile 100.
 *
 * Example: from 23 with roll 4 -> [24, 25, 26, 27]
 * Example: from 98 with roll 4 -> [99, 100, 99, 98]
 */
export function calculateStepSequence(fromTile: number, steps: number): number[] {
  if (steps <= 0) return [];
  const sequence: number[] = [];
  let current = fromTile;
  let direction = 1;

  for (let i = 0; i < steps; i++) {
    if (current === 100) {
      direction = -1;
    }
    current += direction;
    sequence.push(current);
  }

  return sequence;
}

/**
 * Computes the {x, y} coordinate at progress t (0 to 1) along a wooden ladder from bottom to top.
 */
export function getLadderLinePoint(ladder: Ladder, progress: number): { x: number; y: number } {
  const bottomPos = getTileCenterPercent(ladder.bottom);
  const topPos = getTileCenterPercent(ladder.top);
  const clampedT = Math.max(0, Math.min(1, progress));

  return {
    x: bottomPos.x + (topPos.x - bottomPos.x) * clampedT,
    y: bottomPos.y + (topPos.y - bottomPos.y) * clampedT,
  };
}

/**
 * Computes the {x, y} coordinate at progress t (0 to 1) along a snake's cubic bezier curve from head to tail.
 */
export function getSnakeCurvePoint(snake: Snake, progress: number): { x: number; y: number } {
  const headPos = getTileCenterPercent(snake.head);
  const tailPos = getTileCenterPercent(snake.tail);
  const clampedT = Math.max(0, Math.min(1, progress));

  const dx = tailPos.x - headPos.x;
  const dy = tailPos.y - headPos.y;
  const distance = Math.hypot(dx, dy);

  // Perpendicular offset for S-curve body matching SnakeOverlay
  const perpX = (-dy / (distance || 1)) * 8;
  const perpY = (dx / (distance || 1)) * 8;

  const p0 = headPos;
  const p1 = { x: headPos.x + dx * 0.33 + perpX, y: headPos.y + dy * 0.33 + perpY };
  const p2 = { x: headPos.x + dx * 0.66 - perpX, y: headPos.y + dy * 0.66 - perpY };
  const p3 = tailPos;

  // Cubic Bezier formula: B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
  const u = 1 - clampedT;
  const tt = clampedT * clampedT;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * clampedT;

  const x = uuu * p0.x + 3 * uu * clampedT * p1.x + 3 * u * tt * p2.x + ttt * p3.x;
  const y = uuu * p0.y + 3 * uu * clampedT * p1.y + 3 * u * tt * p2.y + ttt * p3.y;

  return { x, y };
}

/**
 * Generates the full 10x10 board matrix (100 down to 1) for rendering rows from top to bottom
 */
export function generateBoardRows(): number[][] {
  const rows: number[][] = [];
  for (let r = 9; r >= 0; r--) {
    const rowNumbers: number[] = [];
    const isEvenRow = r % 2 === 0;
    for (let c = 0; c < 10; c++) {
      const tile = isEvenRow ? r * 10 + c + 1 : r * 10 + (10 - c);
      rowNumbers.push(tile);
    }
    rows.push(rowNumbers);
  }
  return rows;
}
