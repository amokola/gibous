import { GameType, PlayerRole, MatchWinner } from '../../shared';
import { IServerGameEngine, GameActionResult } from './IServerGameEngine';

export interface SnakeLadderState {
  p1Position: number;
  p2Position: number;
  activePlayer: PlayerRole;
  lastRoll: number | null;
  lastAction: string | null;
  winner: MatchWinner;
  turnTimeout: number;
}

const SNAKES: Record<number, number> = {
  98: 78,
  95: 56,
  87: 24,
  64: 60,
  62: 19,
  54: 34,
  17: 7,
};

const LADDERS: Record<number, number> = {
  4: 14,
  9: 31,
  20: 38,
  28: 84,
  40: 59,
  51: 67,
  63: 81,
  71: 91,
};

export class ServerSnakeLadderEngine implements IServerGameEngine {
  readonly gameType: GameType = 'snake';
  private state: SnakeLadderState;

  constructor() {
    this.state = this.createInitialState();
  }

  private createInitialState(): SnakeLadderState {
    return {
      p1Position: 1,
      p2Position: 1,
      activePlayer: 'p1',
      lastRoll: null,
      lastAction: null,
      winner: null,
      turnTimeout: Date.now() + 15000,
    };
  }

  getState(): Record<string, unknown> {
    return { ...this.state };
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

  handleAction(player: PlayerRole, actionType: string, _payload?: unknown): GameActionResult {
    if (actionType !== 'ROLL_DICE') {
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
        error: 'Not your turn to roll',
        actionType,
        payload: {},
        isGameOver: false,
        winner: null,
      };
    }

    // Standard fair 1-6 dice roll
    const rollVal = Math.floor(Math.random() * 6) + 1;
    this.state.lastRoll = rollVal;

    const fromPos = player === 'p1' ? this.state.p1Position : this.state.p2Position;
    let newPos = fromPos + rollVal;

    // Bounce back if overshoot 100
    if (newPos > 100) {
      newPos = 100 - (newPos - 100);
    }

    let snakeOrLadder: { type: 'snake' | 'ladder'; from: number; to: number } | undefined;
    let actionText = `${player === 'p1' ? 'Player 1' : 'Player 2'} rolled a ${rollVal}`;

    if (LADDERS[newPos]) {
      const top = LADDERS[newPos];
      snakeOrLadder = { type: 'ladder', from: newPos, to: top };
      actionText = `🪜 Climbed ladder from ${newPos} ➔ ${top}!`;
      newPos = top;
    } else if (SNAKES[newPos]) {
      const tail = SNAKES[newPos];
      snakeOrLadder = { type: 'snake', from: newPos, to: tail };
      actionText = `🐍 Bitten by snake at ${newPos}, slid to ${tail}!`;
      newPos = tail;
    }

    if (player === 'p1') {
      this.state.p1Position = newPos;
    } else {
      this.state.p2Position = newPos;
    }

    this.state.lastAction = actionText;

    if (newPos === 100) {
      this.state.winner = player;
      this.state.lastAction = `👑 ${player === 'p1' ? 'Player 1' : 'Player 2'} reached 100 and WON!`;
      return {
        success: true,
        actionType: 'DICE_ROLLED',
        payload: {
          player,
          value: rollVal,
          from: fromPos,
          to: newPos,
          snakeOrLadder,
          nextPlayer: player,
          isWinner: true,
        },
        isGameOver: true,
        winner: player,
      };
    }

    // Switch turn
    const nextPlayer: PlayerRole = player === 'p1' ? 'p2' : 'p1';
    this.state.activePlayer = nextPlayer;
    this.state.turnTimeout = Date.now() + 15000;

    return {
      success: true,
      actionType: 'DICE_ROLLED',
      payload: {
        player,
        value: rollVal,
        from: fromPos,
        to: newPos,
        snakeOrLadder,
        nextPlayer,
        isWinner: false,
      },
      isGameOver: false,
      winner: null,
    };
  }
}
