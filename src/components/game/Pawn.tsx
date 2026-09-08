import React from 'react';
import { getTileCenterPercent } from '../../config/boardConfig';
import { PlayerId } from '../../types/game';

interface PawnProps {
  player: PlayerId;
  tile: number;
  isActive: boolean;
  isHopping?: boolean;
  isSharedTile?: boolean;
  customPos?: { x: number; y: number } | null;
  trailFrom?: number | null;
}

export const Pawn: React.FC<PawnProps> = ({
  player,
  tile,
  isActive,
  isHopping = false,
  isSharedTile = false,
  customPos = null,
  trailFrom = null,
}) => {
  const basePos = getTileCenterPercent(tile);
  const x = customPos ? customPos.x : basePos.x;
  const y = customPos ? customPos.y : basePos.y;
  const isP1 = player === 'p1';

  // Offset pawns if they are on the same tile so neither is obscured
  const offsetX = isSharedTile ? (isP1 ? -4.5 : 4.5) : (isP1 ? -2 : 2);
  const offsetY = isSharedTile ? (isP1 ? -2 : 2) : 0;

  // Calculate trail line if there's a previous tile
  const trailPos = trailFrom ? getTileCenterPercent(trailFrom) : null;

  return (
    <>
      {/* Dashed Movement Trail Line */}
      {trailPos && !customPos && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line
            x1={trailPos.x}
            y1={trailPos.y}
            x2={x}
            y2={y}
            stroke={isP1 ? '#9b2c2c' : '#1a365d'}
            strokeWidth="1.2"
            strokeDasharray="1.5 1.5"
            opacity="0.9"
          />
        </svg>
      )}

      {/* Pawn Container */}
      <div
        className={`absolute z-30 pointer-events-none ${
          customPos ? 'transition-none' : 'transition-all duration-200 ease-out'
        }`}
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`,
        }}
        title={isP1 ? 'Player 1' : 'Player 2'}
        data-testid={`pawn-${player}`}
      >
        <div className={`relative flex items-center justify-center ${isHopping ? 'animate-bounce' : ''}`}>
          {/* Active Turn Indicator (Dashed Ink Ring) */}
          {isActive && (
            <div className="absolute -inset-1.5 rounded-full border-2 border-dashed border-black animate-spin" />
          )}

          {/* Solid Matte Token Body with Hand-Drawn Sketch Aesthetic */}
          <div
            className={`relative w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center border-2 border-black shadow-md transition-transform ${
              isHopping ? 'scale-125 -translate-y-1' : 'scale-100'
            } ${
              isP1
                ? 'bg-[#9b2c2c] text-white ring-1 ring-white/30'
                : 'bg-[#1a365d] text-white ring-1 ring-white/30'
            }`}
          >
            {/* Inner Core Dot */}
            <div className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-xs" />
          </div>

          {/* Flat Ground Shadow */}
          <div
            className={`absolute -bottom-1 w-4 h-1 bg-black/40 rounded-full blur-[0.5px] transition-all ${
              isHopping ? 'scale-75 opacity-20' : 'scale-100 opacity-60'
            }`}
          />
        </div>
      </div>
    </>
  );
};
