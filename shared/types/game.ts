/**
 * Universal Game Types for Gibous Duel Arena
 * Shared between Frontend and Server
 */

export type GameType = 'snake' | 'connect4' | 'rps';

export type PlayerRole = 'p1' | 'p2';

export type MatchType = 'local' | 'bot' | 'pvp';

export type GameStatus = 'idle' | 'waiting' | 'playing' | 'gameover';

export type MatchWinner = 'p1' | 'p2' | 'draw' | null;

export type RPSChoice = 'rock' | 'paper' | 'scissors';

export interface BasePlayer {
  id: PlayerRole;
  name: string;
  avatarUrl?: string;
  telegramId?: number;
  isBot?: boolean;
}

export interface PlayerStats {
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  pnl: number;
  volume: number;
}
