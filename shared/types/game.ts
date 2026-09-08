/**
 * Universal Game Types for Gibous Duel Arena
 * Shared between Frontend and Server
 */

export type GameType = 'snake' | 'connect4' | 'rps';

export type PlayerRole = 'p1' | 'p2';

export type MatchWinner = 'p1' | 'p2' | 'draw' | null;

export type RPSChoice = 'rock' | 'paper' | 'scissors';

export interface WinningCoord {
  row: number;
  col: number;
}
