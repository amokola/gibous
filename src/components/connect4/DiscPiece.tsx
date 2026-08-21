import React from 'react';
import { PlayerId } from '../../types/game';

interface DiscPieceProps {
  player: PlayerId;
  isWinning?: boolean;
  isGhost?: boolean;
}

export const DiscPiece: React.FC<DiscPieceProps> = ({
  player,
  isWinning = false,
  isGhost = false,
}) => {
  const isP1 = player === 'p1';

  const discStyles = isP1
    ? 'bg-[#ef4444] border-2 border-black text-white'
    : 'bg-[#3b82f6] border-2 border-black text-white';

  const winningIndicator = isWinning
    ? 'ring-3 ring-black ring-offset-2 ring-offset-yellow-400 scale-105'
    : '';

  if (isGhost) {
    return (
      <div
        className={`w-full h-full rounded-full opacity-40 border-2 border-dashed border-black ${
          isP1 ? 'bg-[#ef4444]/30' : 'bg-[#3b82f6]/30'
        }`}
      />
    );
  }

  return (
    <div
      className={`w-full h-full rounded-full flex items-center justify-center transition-all duration-200 relative select-none sketch-shadow-xs ${discStyles} ${winningIndicator}`}
    >
      {/* Concentric Inner Stamped Ring */}
      <div className="w-3/5 h-3/5 rounded-full border border-black/30 flex items-center justify-center">
        {/* Core Dot */}
        <div
          className={`w-2 h-2 rounded-full ${
            isP1 ? 'bg-[#991b1b]' : 'bg-[#1e40af]'
          }`}
        />
      </div>
    </div>
  );
};
