/**
 * Frontend Game & UI Types for Gibous Duel Arena
 * Imports and re-exports shared types while extending with React UI state
 */

export * from '../../shared/types/game';
export * from '../../shared/types/protocol';
export * from '../../shared/constants/economics';

import type { PlayerRole } from '../../shared/types/game';

export type PlayerId = PlayerRole;
export type GameTitle = 'snake' | 'connect4' | 'rps';
export type ScreenState = 'home' | 'lobby' | 'game' | 'gameover';
export type NavTab = 'home' | 'lobby' | 'leaderboard' | 'profile' | 'wallet';

export interface UserProfile {
  name: string;
  avatarUrl?: string;
  avatarId: string;
  level: number;
  xp: number;
  rank: string;
  balance: number;
  winRate: number;
  totalMatches: number;
  winStreak: number;
  totalWon: number;
  favoriteGame: string;
}

export interface Player {
  id: PlayerId;
  name: string;
  username?: string;
  telegramId?: number;
  avatarUrl?: string;
  avatarId?: string;
  color: 'green' | 'blue';
  score: number;
  isReady: boolean;
  isBot?: boolean;
}

export interface Snake {
  id: string;
  head: number;
  tail: number;
  color: 'green' | 'red' | 'purple';
}

export interface Ladder {
  id: string;
  bottom: number;
  top: number;
}

export type GameMode = 'classic' | 'blitz';
export type MatchType = 'local' | 'online' | 'bot';

export interface GameSettings {
  mode: GameMode;
  boardSize: number;
  winningAmount: number; // e.g. 50, 100, 250, 500, 1000 Play GRAM
}

export type TurnPhase = 
  | 'WAITING_ROLL' 
  | 'ROLLING' 
  | 'MOVING' 
  | 'CLIMBING_LADDER' 
  | 'SLIDING_SNAKE' 
  | 'TURN_END'
  | 'GAME_OVER';

export interface TurnHistoryStep {
  player: PlayerId;
  from: number;
  diceRoll: number;
  to: number;
  snakeOrLadder?: {
    type: 'snake' | 'ladder';
    from: number;
    to: number;
  };
}

export interface GameState {
  roomCode: string;
  matchType: MatchType;
  settings: GameSettings;
  players: {
    p1: Player;
    p2: Player;
  };
  activePlayer: PlayerId;
  turnPhase: TurnPhase;
  lastDiceRoll: number | null;
  history: TurnHistoryStep[];
  winner: PlayerId | null;
  potAmount: number;
  isHost: boolean;
  statusMessage?: string;
}

// Power-Up System
export type PowerUpType = 'precision' | 'shield' | 'doublestep';

export interface PowerUp {
  id: PowerUpType;
  name: string;
  description: string;
  icon: string;
  used: boolean;
}

// In-Game Emote Reactions
export type EmoteReaction = '🔥' | '😱' | '😈' | '👏' | '🎲' | '👑';

// Bank / Vault Transactions
export interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'match_win' | 'tournament';
  amount: number;
  time: string;
  txHash: string;
}

// Post Match Analytics
export interface MatchStats {
  turns: number;
  duration: string;
  biggestMove: string;
  potEarned: number;
}

// Connect 4 Types
export type Connect4Cell = PlayerId | null;
export type Connect4Board = Connect4Cell[][];

export interface WinningCoord {
  row: number;
  col: number;
}

export interface Connect4WinResult {
  winner: PlayerId;
  winningCells: WinningCoord[];
}

// Rock Paper Scissors Types
export type RPSChoice = 'rock' | 'paper' | 'scissors';
export type RPSResult = 'win' | 'lose' | 'draw';

export interface RPSRound {
  round: number;
  p1Choice: RPSChoice;
  p2Choice: RPSChoice;
  winner: PlayerId | 'draw';
}
