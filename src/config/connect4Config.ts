import { Connect4Board, Connect4WinResult, PlayerId } from '../types/game';

export const C4_ROWS = 6;
export const C4_COLS = 7;

export function createEmptyConnect4Board(): Connect4Board {
  return Array.from({ length: C4_ROWS }, () => Array(C4_COLS).fill(null));
}

export function getLowestEmptyRow(board: Connect4Board, col: number): number {
  for (let r = C4_ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) {
      return r;
    }
  }
  return -1;
}

export function isBoardFull(board: Connect4Board): boolean {
  return board[0].every(cell => cell !== null);
}

export function checkConnect4Win(board: Connect4Board): Connect4WinResult | null {
  // 1. Horizontal Check
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS - 3; c++) {
      const cell = board[r][c];
      if (
        cell &&
        cell === board[r][c + 1] &&
        cell === board[r][c + 2] &&
        cell === board[r][c + 3]
      ) {
        return {
          winner: cell,
          winningCells: [
            { row: r, col: c },
            { row: r, col: c + 1 },
            { row: r, col: c + 2 },
            { row: r, col: c + 3 },
          ],
        };
      }
    }
  }

  // 2. Vertical Check
  for (let r = 0; r < C4_ROWS - 3; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      const cell = board[r][c];
      if (
        cell &&
        cell === board[r + 1][c] &&
        cell === board[r + 2][c] &&
        cell === board[r + 3][c]
      ) {
        return {
          winner: cell,
          winningCells: [
            { row: r, col: c },
            { row: r + 1, col: c },
            { row: r + 2, col: c },
            { row: r + 3, col: c },
          ],
        };
      }
    }
  }

  // 3. Diagonal Up-Right Check
  for (let r = 3; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS - 3; c++) {
      const cell = board[r][c];
      if (
        cell &&
        cell === board[r - 1][c + 1] &&
        cell === board[r - 2][c + 2] &&
        cell === board[r - 3][c + 3]
      ) {
        return {
          winner: cell,
          winningCells: [
            { row: r, col: c },
            { row: r - 1, col: c + 1 },
            { row: r - 2, col: c + 2 },
            { row: r - 3, col: c + 3 },
          ],
        };
      }
    }
  }

  // 4. Diagonal Down-Right Check
  for (let r = 0; r < C4_ROWS - 3; r++) {
    for (let c = 0; c < C4_COLS - 3; c++) {
      const cell = board[r][c];
      if (
        cell &&
        cell === board[r + 1][c + 1] &&
        cell === board[r + 2][c + 2] &&
        cell === board[r + 3][c + 3]
      ) {
        return {
          winner: cell,
          winningCells: [
            { row: r, col: c },
            { row: r + 1, col: c + 1 },
            { row: r + 2, col: c + 2 },
            { row: r + 3, col: c + 3 },
          ],
        };
      }
    }
  }

  return null;
}

/**
 * Strategic Heuristic AI Bot
 */
export function getConnect4BotMove(
  board: Connect4Board,
  botPlayer: PlayerId = 'p2',
  opponent: PlayerId = 'p1'
): number {
  const validCols: number[] = [];
  for (let c = 0; c < C4_COLS; c++) {
    if (getLowestEmptyRow(board, c) !== -1) {
      validCols.push(c);
    }
  }

  if (validCols.length === 0) return 0;

  // 1. Check if Bot can win immediately
  for (const col of validCols) {
    const row = getLowestEmptyRow(board, col);
    board[row][col] = botPlayer;
    const win = checkConnect4Win(board);
    board[row][col] = null;
    if (win && win.winner === botPlayer) {
      return col;
    }
  }

  // 2. Check if Opponent can win next turn and block them
  for (const col of validCols) {
    const row = getLowestEmptyRow(board, col);
    board[row][col] = opponent;
    const win = checkConnect4Win(board);
    board[row][col] = null;
    if (win && win.winner === opponent) {
      return col;
    }
  }

  // 3. Avoid giving opponent a win right above us
  const safeCols = validCols.filter(col => {
    const row = getLowestEmptyRow(board, col);
    if (row > 0) {
      board[row][col] = botPlayer;
      board[row - 1][col] = opponent;
      const givesWin = checkConnect4Win(board);
      board[row - 1][col] = null;
      board[row][col] = null;
      if (givesWin && givesWin.winner === opponent) {
        return false;
      }
    }
    return true;
  });

  const candidates = safeCols.length > 0 ? safeCols : validCols;

  // 4. Favor center columns for tactical advantage
  const colPreferences = [3, 2, 4, 1, 5, 0, 6];
  for (const prefCol of colPreferences) {
    if (candidates.includes(prefCol)) {
      return prefCol;
    }
  }

  return candidates[0];
}
