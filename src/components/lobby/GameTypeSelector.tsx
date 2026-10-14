import React from 'react';
import { GameTitle } from '../../types/game';
import { GameBadge } from '../ui/GameBadge';

interface GameTypeSelectorProps {
  selectedGame: GameTitle;
  onSelectGame: (game: GameTitle) => void;
}

export const GameTypeSelector: React.FC<GameTypeSelectorProps> = ({
  selectedGame,
  onSelectGame,
}) => {
  return (
    <div className="w-full grid grid-cols-3 gap-2 bg-game-paper p-1.5 rounded-2xl border-2 border-game-ink-black sketch-shadow-xs select-none mb-3">
      {/* Snake & Ladder Tab */}
      <button
        type="button"
        aria-pressed={selectedGame === 'snake'}
        onClick={() => onSelectGame('snake')}
        className={`min-h-11 py-2 px-1 rounded-xl font-sketch text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-blue focus-visible:ring-offset-2 ${
          selectedGame === 'snake'
            ? 'bg-game-ink-red text-game-surface border-game-ink-black sketch-shadow-xs scale-[1.02]'
            : 'text-game-ink-black/60 border-transparent hover:text-game-ink-black'
        }`}
      >
        <GameBadge game="snake" size="xs" />
        <span className="truncate">Snakes</span>
      </button>

      {/* Four in a Row Tab */}
      <button
        type="button"
        aria-pressed={selectedGame === 'connect4'}
        onClick={() => onSelectGame('connect4')}
        className={`min-h-11 py-2 px-1 rounded-xl font-sketch text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-blue focus-visible:ring-offset-2 ${
          selectedGame === 'connect4'
            ? 'bg-game-ink-blue text-game-surface border-game-ink-black sketch-shadow-xs scale-[1.02]'
            : 'text-game-ink-black/60 border-transparent hover:text-game-ink-black'
        }`}
      >
        <GameBadge game="connect4" size="xs" />
        <span className="truncate">Connect 4</span>
      </button>

      {/* Rock Paper Scissors Tab */}
      <button
        type="button"
        aria-pressed={selectedGame === 'rps'}
        onClick={() => onSelectGame('rps')}
        className={`min-h-11 py-2 px-1 rounded-xl font-sketch text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-blue focus-visible:ring-offset-2 ${
          selectedGame === 'rps'
            ? 'bg-game-note-yellow text-game-ink-black border-game-ink-black sketch-shadow-xs scale-[1.02]'
            : 'text-game-ink-black/60 border-transparent hover:text-game-ink-black'
        }`}
      >
        <GameBadge game="rps" size="xs" />
        <span className="truncate">R.P.S.</span>
      </button>
    </div>
  );
};
