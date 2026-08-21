import { Snake, Ladder } from '../types/game';

// Standard 10x10 Snake and Ladder configuration matching the concept design
export const SNAKES: Snake[] = [
  { id: 'snake-95-75', head: 95, tail: 75, color: 'green' },
  { id: 'snake-82-42', head: 82, tail: 42, color: 'red' },
  { id: 'snake-68-53', head: 68, tail: 53, color: 'green' },
  { id: 'snake-36-14', head: 36, tail: 14, color: 'red' },
  { id: 'snake-48-26', head: 48, tail: 26, color: 'green' },
  { id: 'snake-98-78', head: 98, tail: 78, color: 'red' },
];

export const LADDERS: Ladder[] = [
  { id: 'ladder-6-27', bottom: 6, top: 27 },
  { id: 'ladder-24-44', bottom: 24, top: 44 },
  { id: 'ladder-43-63', bottom: 43, top: 63 },
  { id: 'ladder-67-87', bottom: 67, top: 87 },
  { id: 'ladder-72-92', bottom: 72, top: 92 },
  { id: 'ladder-16-35', bottom: 16, top: 35 },
];

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
