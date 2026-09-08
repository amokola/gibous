import { Connect4Board } from '../types/game';

export const C4_ROWS = 6;
export const C4_COLS = 7;

export function getLowestEmptyRow(board: Connect4Board, col: number): number {
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) {
      return r;
    }
  }
  return -1;
}
