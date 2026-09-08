import { GameType, PlayerRole, MatchWinner, SNAKES_MAP, LADDERS_MAP } from '../../shared';
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

const SNAKES: Record<number, number> = SNAKES_MAP;
const LADDERS: Record<number, number> = LADDERS_MAP;

export class ServerSnakeLadderEngine implements IServerGameEngine {
  readonly gameType: GameType = 'snake';
  private state: SnakeLadderState;
  private readonly randomSource: () => number;
  private readonly clock: () => number;

  constructor(randomSource: () => number = () => Math.random(), clock: () => number = () => Date.now()) {
    this.randomSource = randomSource;
    this.clock = clock;
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
      turnTimeout: this.clock() + 15000,
    };
  }

  getState(): Record<string, unknown> {
    return { ...this.state };
  }

  getPersistenceState(): Record<string, unknown> {
    return this.getState();
  }

  restorePersistenceState(state: Record<string, unknown>): void {
    const candidate = state as Partial<SnakeLadderState>;
    const p1Position = Number(candidate.p1Position);
    const p2Position = Number(candidate.p2Position);
    const lastRoll = candidate.lastRoll;
    if (
      !Number.isInteger(p1Position) || p1Position < 1 || p1Position > 100 ||
      !Number.isInteger(p2Position) || p2Position < 1 || p2Position > 100 ||
      (candidate.activePlayer !== 'p1' && candidate.activePlayer !== 'p2') ||
      !['p1', 'p2', 'draw', null].includes(candidate.winner as any) ||
      (lastRoll !== null && lastRoll !== undefined && (!Number.isInteger(lastRoll) || lastRoll < 1 || lastRoll > 6))
    ) {
      throw new Error('Invalid persisted Snake & Ladders state');
    }
    this.state = {
      ...this.createInitialState(),
      p1Position,
      p2Position,
      activePlayer: candidate.activePlayer as PlayerRole,
      lastRoll: lastRoll ?? null,
      lastAction: candidate.lastAction ?? null,
      winner: candidate.winner ?? null,
      turnTimeout: Number.isFinite(candidate.turnTimeout) ? Number(candidate.turnTimeout) : this.clock() + 15000,
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
    const rollVal = Math.floor(this.randomSource() * 6) + 1;
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
    this.state.turnTimeout = this.clock() + 15000;

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
