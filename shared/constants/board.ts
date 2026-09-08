/**
 * Canonical Snake and Ladder Board Configuration
 * Shared single source of truth for both Server Engine and Client Board Renderer
 */

export interface BoardSnake {
  id: string;
  head: number;
  tail: number;
  color: 'green' | 'red' | 'purple';
}

export interface BoardLadder {
  id: string;
  bottom: number;
  top: number;
}

export const CANONICAL_SNAKES: BoardSnake[] = [
  { id: 'snake-95-75', head: 95, tail: 75, color: 'green' },
  { id: 'snake-82-42', head: 82, tail: 42, color: 'red' },
  { id: 'snake-68-53', head: 68, tail: 53, color: 'green' },
  { id: 'snake-36-14', head: 36, tail: 14, color: 'red' },
  { id: 'snake-48-26', head: 48, tail: 26, color: 'green' },
  { id: 'snake-98-78', head: 98, tail: 78, color: 'red' },
];

export const CANONICAL_LADDERS: BoardLadder[] = [
  { id: 'ladder-6-27', bottom: 6, top: 27 },
  { id: 'ladder-24-44', bottom: 24, top: 44 },
  { id: 'ladder-43-63', bottom: 43, top: 63 },
  { id: 'ladder-67-87', bottom: 67, top: 87 },
  { id: 'ladder-72-92', bottom: 72, top: 92 },
  { id: 'ladder-16-35', bottom: 16, top: 35 },
];

export const SNAKES_MAP: Record<number, number> = Object.fromEntries(
  CANONICAL_SNAKES.map((s) => [s.head, s.tail])
);

export const LADDERS_MAP: Record<number, number> = Object.fromEntries(
  CANONICAL_LADDERS.map((l) => [l.bottom, l.top])
);
