import { GameType, PlayerRole, MatchWinner } from '../../shared';
import { IServerGameEngine, GameActionResult } from './IServerGameEngine';

export type Connect4Cell = PlayerRole | null;

export interface Connect4State {
  board: Connect4Cell[][]; // 6 rows x 7 cols
  activePlayer: PlayerRole;
  winner: MatchWinner;
  winningCoords: [number, number][] | null;
  lastMove: { row: number; col: number } | null;
  turnTimeout: number;
}

const ROWS = 6;
const COLS = 7;

export class ServerConnect4Engine implements IServerGameEngine {
  readonly gameType: GameType = 'connect4';
  private state: Connect4State;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): Connect4State {
    return {
      board: Array(ROWS).fill(null).map(() => Array(COLS).fill(null)),
      activePlayer: 'p1',
      winner: null,
      winningCoords: null,
      lastMove: null,
      turnTimeout: Date.now() + 15000,
    };
  }

  getState(): Record<string, unknown> {
    return {
      board: this.state.board.map((row) => [...row]),
      activePlayer: this.state.activePlayer,
      winner: this.state.winner,
      winningCoords: this.state.winningCoords ? [...this.state.winningCoords] : null,
      lastMove: this.state.lastMove ? { ...this.state.lastMove } : null,
      turnTimeout: this.state.turnTimeout,
    };
  }

  getActivePlayer(): PlayerRole {
    return this.state.activePlayer;
  }

  isGameOver(): boolean {
    return this.state.winner !== null;
  }

  getWinner(): MatchWinner {
    return this.state.winner;
  }

  reset(): void {
    this.state = this.createInitialState();
  }

  handleAction(player: PlayerRole, actionType: string, payload?: unknown): GameActionResult {
    if (actionType !== 'DROP_DISC') {
      return {
        success: false,
        error: `Unsupported action type: ${actionType}`,
        actionType,
        payload: {},
        isGameOver: this.isGameOver(),
        winner: this.getWinner(),
      };
    }

    if (this.isGameOver()) {
      return {
        success: false,
        error: 'Match has already ended',
        actionType,
        payload: {},
        isGameOver: true,
        winner: this.getWinner(),
      };
    }

    if (this.state.activePlayer !== player) {
      return {
        success: false,
        error: 'Not your turn to drop',
        actionType,
        payload: {},
        isGameOver: false,
        winner: null,
      };
    }

    const { column } = (payload as { column?: number }) || {};
    if (typeof column !== 'number' || column < 0 || column >= COLS) {
      return {
        success: false,
        error: `Invalid column: ${column}`,
        actionType,
        payload: {},
        isGameOver: false,
        winner: null,
      };
    }

    // Find lowest empty row in column (gravity drop)
    let dropRow = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (!this.state.board[r][column]) {
        dropRow = r;
        break;
      }
    }

    if (dropRow === -1) {
      return {
        success: false,
        error: `Column ${column} is full`,
        actionType,
        payload: {},
        isGameOver: false,
        winner: null,
      };
    }

    // Place disc
    this.state.board[dropRow][column] = player;
    this.state.lastMove = { row: dropRow, col: column };

    // Check Win
    const winningLine = this.checkWin(dropRow, column, player);
    if (winningLine) {
      this.state.winner = player;
      this.state.winningCoords = winningLine;
      return {
        success: true,
        actionType: 'DISC_DROPPED',
        payload: {
          player,
          row: dropRow,
          col: column,
          board: this.state.board,
          nextPlayer: player,
          winner: player,
          winningCells: winningLine.map(([r, c]) => ({ row: r, col: c })),
        },
        isGameOver: true,
        winner: player,
      };
    }

    // Check Draw (Board Full)
    let isFull = true;
    for (let c = 0; c < COLS; c++) {
      if (!this.state.board[0][c]) {
        isFull = false;
        break;
      }
    }

    if (isFull) {
      this.state.winner = 'draw';
      return {
        success: true,
        actionType: 'DISC_DROPPED',
        payload: {
          player,
          row: dropRow,
          col: column,
          board: this.state.board,
          nextPlayer: player,
          winner: 'draw',
        },
        isGameOver: true,
        winner: 'draw',
      };
    }

    // Switch active player
    const nextPlayer: PlayerRole = player === 'p1' ? 'p2' : 'p1';
    this.state.activePlayer = nextPlayer;
    this.state.turnTimeout = Date.now() + 15000;

    return {
      success: true,
      actionType: 'DISC_DROPPED',
      payload: {
        player,
        row: dropRow,
        col: column,
        board: this.state.board,
        nextPlayer,
        winner: null,
      },
      isGameOver: false,
      winner: null,
    };
  }

  private checkWin(row: number, col: number, player: PlayerRole): [number, number][] | null {
    const directions: [number, number][] = [
      [0, 1],  // Horizontal (—)
      [1, 0],  // Vertical (|)
      [1, 1],  // Diagonal (\)
      [1, -1], // Diagonal (/)
    ];

    for (const [dr, dc] of directions) {
      const line: [number, number][] = [[row, col]];

      for (let i = 1; i < 4; i++) {
        const r = row + dr * i;
        const c = col + dc * i;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && this.state.board[r][c] === player) {
          line.push([r, c]);
        } else {
          break;
        }
      }

      for (let i = 1; i < 4; i++) {
        const r = row - dr * i;
        const c = col - dc * i;
        if (r >= 0 && r < ROWS && c >= 0 && c < COLS && this.state.board[r][c] === player) {
          line.push([r, c]);
        } else {
          break;
        }
      }

      if (line.length >= 4) {
        return line;
      }
    }

    return null;
  }
}
