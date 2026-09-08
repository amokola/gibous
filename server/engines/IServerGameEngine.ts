import { GameType, PlayerRole, MatchWinner } from '../../shared';

export interface GameActionResult {
  success: boolean;
  error?: string;
  actionType: string;
  payload: Record<string, unknown>;
  isGameOver: boolean;
  winner: MatchWinner;
  revealed?: boolean;
}

export interface IServerGameEngine {
  readonly gameType: GameType;
  getState(): Record<string, unknown>;
  getPersistenceState(): Record<string, unknown>;
  restorePersistenceState(state: Record<string, unknown>): void;
  getActivePlayer(): PlayerRole;
  isGameOver(): boolean;
  getWinner(): MatchWinner;
  handleAction(player: PlayerRole, actionType: string, payload?: unknown): GameActionResult;
  reset(): void;
}
