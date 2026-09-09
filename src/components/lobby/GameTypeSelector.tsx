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
    <div className="w-full grid grid-cols-3 gap-2 bg-[#f2efe9] p-1.5 rounded-2xl border-2 border-black sketch-shadow-xs select-none mb-3">
      {/* Snake & Ladder Tab */}
      <button
        type="button"
        onClick={() => onSelectGame('snake')}
        className={`py-2 px-1 rounded-xl font-sketch text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all border-2 ${
          selectedGame === 'snake'
            ? 'bg-[#9b2c2c] text-white border-black sketch-shadow-xs scale-[1.02]'
            : 'text-[#1a1a1a]/60 border-transparent hover:text-[#1a1a1a]'
        }`}
      >
        <GameBadge game="snake" size="xs" />
        <span className="truncate">Snakes</span>
      </button>

      {/* Four in a Row Tab */}
      <button
        type="button"
        onClick={() => onSelectGame('connect4')}
        className={`py-2 px-1 rounded-xl font-sketch text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all border-2 ${
          selectedGame === 'connect4'
            ? 'bg-[#1a365d] text-white border-black sketch-shadow-xs scale-[1.02]'
            : 'text-[#1a1a1a]/60 border-transparent hover:text-[#1a1a1a]'
        }`}
      >
        <GameBadge game="connect4" size="xs" />
        <span className="truncate">Connect 4</span>
      </button>

      {/* Rock Paper Scissors Tab */}
      <button
        type="button"
        onClick={() => onSelectGame('rps')}
        className={`py-2 px-1 rounded-xl font-sketch text-xs sm:text-sm font-bold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition-all border-2 ${
          selectedGame === 'rps'
            ? 'bg-[#fff9c4] text-[#1a1a1a] border-black sketch-shadow-xs scale-[1.02]'
            : 'text-[#1a1a1a]/60 border-transparent hover:text-[#1a1a1a]'
        }`}
      >
        <GameBadge game="rps" size="xs" />
        <span className="truncate">R.P.S.</span>
      </button>
    </div>
  );
};
