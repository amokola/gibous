import React from 'react';
import { getTileCenterPercent } from '../../config/boardConfig';
import { PlayerId } from '../../types/game';

interface PawnProps {
  player: PlayerId;
  tile: number;
  isActive: boolean;
  trailFrom?: number | null;
}

export const Pawn: React.FC<PawnProps> = ({
  player,
  tile,
  isActive,
  trailFrom,
}) => {
  const { x, y } = getTileCenterPercent(tile);
  const isP1 = player === 'p1';

  // Calculate trail line if there's a previous tile
  const trailPos = trailFrom ? getTileCenterPercent(trailFrom) : null;

  return (
    <>
      {/* Dashed Movement Trail Line */}
      {trailPos && (
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

      {/* Pawn Container (Zero Neon) */}
      <div
        className="absolute z-30 pointer-events-none transition-all duration-300 ease-out"
        style={{
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(-50%, -50%) ${isP1 ? 'translateX(-4px)' : 'translateX(4px)'}`,
        }}
      >
        <div className="relative flex items-center justify-center">
          {/* Active Turn Indicator (Solid Ink Ring) */}
          {isActive && (
            <div className="absolute -inset-1.5 rounded-full border-2 border-dashed border-black animate-spin" />
          )}

          {/* Solid Matte Token Body */}
          <div
            className={`relative w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center border-2 border-black ${
              isP1
                ? 'bg-[#9b2c2c] text-white'
                : 'bg-[#1a365d] text-white'
            }`}
          >
            {/* Inner Core Dot */}
            <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
          </div>

          {/* Flat Shadow */}
          <div className="absolute -bottom-1 w-4 h-1 bg-black/50 rounded-full" />
        </div>
      </div>
    </>
  );
};
