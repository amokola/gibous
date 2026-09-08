/**
 * Frontend Game & UI Types for Gibous Duel Arena
 * Imports and re-exports shared types while extending with React UI state
 */

export * from '../../shared/types/game';
export * from '../../shared/types/protocol';
export * from '../../shared/constants/economics';

import type {
  PlayerRole,
  GameType,
  RoomStatePayload,
  DiceRolledPayload,
  DiscDroppedPayload,
  RPSRoundResolvedPayload,
  RPSChoiceCommittedPayload,
  GameOverPayload,
} from '../../shared';

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
  totalVolume?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  bestStreak?: number;
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

export interface MatchStats {
  turns: number;
  duration: string;
  biggestMove: string;
  potEarned: number;
}

export type Connect4Cell = PlayerId | null;
export type Connect4Board = Connect4Cell[][];

export interface WinningCoord {
  row: number;
  col: number;
}

export type EmoteReaction = '🔥' | '😱' | '😈' | '👏' | '🎲' | '👑';

export interface FloatingEmote {
  id: string;
  player: PlayerRole;
  emoji: string;
  timestamp: number;
}

export interface NormalizedDuelState {
  room: {
    code: string;
    gameType: GameType;
    status: 'waiting' | 'playing' | 'gameover';
    version: number;
  } | null;
  players: {
    p1: RoomStatePayload['p1'];
    p2: RoomStatePayload['p2'];
  };
  myRole: PlayerRole | null;
  activePlayer: PlayerRole;
  turnPhase: string;
  potAmount: number;
  stakeAmount: number;
  winner: string | null;
  gameState: Record<string, any>;
  lastDiceEvent: DiceRolledPayload | null;
  lastDropEvent: DiscDroppedPayload | null;
  lastRPSEvent: RPSRoundResolvedPayload | null;
  lastRPSCommit: RPSChoiceCommittedPayload | null;
  lastGameOverEvent: GameOverPayload | null;
}
