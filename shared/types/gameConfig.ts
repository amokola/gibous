import { GameType } from './game';

export interface GameConfig {
  scoreLabel: string;
  displayName: string;
  shortName: string;
  description: string;
  maxPlayers: number;
}

export const GAME_CONFIGS: Record<GameType, GameConfig> = {
  snake: {
    scoreLabel: 'Tile',
    displayName: 'Snakes & Ladders',
    shortName: 'Snake',
    description: 'Classic race to tile 100',
    maxPlayers: 2,
  },
  connect4: {
    scoreLabel: 'Wins',
    displayName: 'Four in a Row',
    shortName: 'Connect4',
    description: 'Drop discs. Connect four. Win the pot.',
    maxPlayers: 2,
  },
  rps: {
    scoreLabel: 'Wins',
    displayName: 'Rock Paper Scissors',
    shortName: 'RPS',
    description: 'Fast best-of-five mind game',
    maxPlayers: 2,
  },
};
