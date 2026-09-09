import React from 'react';
import { GameTitle } from '../../types/game';

export type GameBadgeSize = 'xs' | 'sm' | 'md' | 'lg';

interface GameBadgeProps {
  game: GameTitle;
  size?: GameBadgeSize;
  className?: string;
  alt?: string;
}

const GAME_BADGE_URLS: Record<GameTitle, string> = {
  snake: '/images/snake.png',
  connect4: '/images/connect4.png',
  rps: '/images/rps.png',
};

const GAME_BADGE_ALTS: Record<GameTitle, string> = {
  snake: 'Snakes & Ladders Badge',
  connect4: 'Four in a Row Badge',
  rps: 'Rock Paper Scissors Badge',
};

const SIZE_CLASSES: Record<GameBadgeSize, string> = {
  xs: 'w-5 h-5',
  sm: 'w-7 h-7',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
};

export const GameBadge: React.FC<GameBadgeProps> = ({
  game,
  size = 'md',
  className = '',
  alt,
}) => {
  const src = GAME_BADGE_URLS[game] || GAME_BADGE_URLS.snake;
  const defaultAlt = GAME_BADGE_ALTS[game] || 'Game Badge';

  return (
    <img
      src={src}
      alt={alt || defaultAlt}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`inline-block select-none object-contain pointer-events-none drop-shadow-sm ${SIZE_CLASSES[size]} ${className}`}
    />
  );
};
