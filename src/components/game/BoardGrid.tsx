import React, { useMemo } from 'react';
import { Pawn } from './Pawn';
import { SnakeOverlay } from './SnakeOverlay';
import { LadderOverlay } from './LadderOverlay';
import { PlayerId } from '../../types/game';
import { CANONICAL_LADDERS, CANONICAL_SNAKES } from '../../../shared/constants/board';

interface BoardGridProps {
  p1Position: number;
  p2Position: number;
  activePlayer: PlayerId;
  p1Hopping?: boolean;
  p2Hopping?: boolean;
  p1CustomPos?: { x: number; y: number } | null;
  p2CustomPos?: { x: number; y: number } | null;
  activeSnakeId?: string | null;
  activeLadderId?: string | null;
  p1Trail?: number | null;
  p2Trail?: number | null;
  highlightedTile?: number | null;
}

export const BoardGrid: React.FC<BoardGridProps> = ({
  p1Position,
  p2Position,
  activePlayer,
  p1Hopping = false,
  p2Hopping = false,
  p1CustomPos = null,
  p2CustomPos = null,
  activeSnakeId = null,
  activeLadderId = null,
  p1Trail = null,
  p2Trail = null,
  highlightedTile = null,
}) => {
  const isSharedTile = p1Position === p2Position && !p1CustomPos && !p2CustomPos;

  const ladderBottoms = useMemo(
    () => new Set(CANONICAL_LADDERS.map((l) => l.bottom)),
    []
  );
  const snakeHeads = useMemo(
    () => new Set(CANONICAL_SNAKES.map((s) => s.head)),
    []
  );

  // 10x10 Grid representation: 100 tiles total (Row 0: 100..91 down to Row 9: 1..10)
  const renderTiles = () => {
    const tiles = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        // Tile number calculation from top-left (100)
        let tileNumber: number;
        if (row % 2 === 0) {
          tileNumber = 100 - (row * 10 + col);
        } else {
          tileNumber = 100 - (row * 10 + (9 - col));
        }

        const isEvenTile = (row + col) % 2 === 0;
        const isTarget = highlightedTile === tileNumber;
        const isP1Trail = p1Trail === tileNumber;
        const isP2Trail = p2Trail === tileNumber;
        const isLadderStart = ladderBottoms.has(tileNumber);
        const isSnakeHazard = snakeHeads.has(tileNumber);

        // Tile background styling: alternating light ivory and honey parchment
        let bgClass = isEvenTile ? 'bg-[#faf6ee]' : 'bg-[#eadbba]';
        if (tileNumber === 100) bgClass = 'bg-[#dcfce7] border border-[#15803d]/60 font-black';
        if (tileNumber === 1) bgClass = 'bg-[#fff9c4] border border-[#ca8a04]/60 font-black';
        if (isLadderStart) bgClass = 'bg-[#dcfce7]/70 border border-[#166534]/40';
        if (isSnakeHazard) bgClass = 'bg-[#fee2e2]/70 border border-[#9b2c2c]/40';

        tiles.push(
          <div
            key={tileNumber}
            id={`tile-${tileNumber}`}
            className={`relative flex items-center justify-center p-0.5 border border-black/25 transition-colors duration-200 ${bgClass} ${
              isTarget ? 'ring-2 ring-[#9b2c2c] bg-[#fee2e2]/80 z-10' : ''
            }`}
            style={{ aspectRatio: '1/1' }}
          >
            {/* Tile Number with Cabin Sketch font */}
            <span
              className={`absolute top-0.5 left-0.5 sm:left-1 font-sketch text-[8px] sm:text-[10px] font-bold leading-none select-none ${
                tileNumber === 100
                  ? 'text-[#166534] font-black text-[9px] sm:text-[11px]'
                  : tileNumber === 1
                  ? 'text-[#854d0e] font-black text-[9px] sm:text-[11px]'
                  : 'text-[#1a1a1a]/80'
              }`}
            >
              {tileNumber}
            </span>

            {/* Tactical ladder bottom and snake head indicators */}
            {isLadderStart && (
              <span className="absolute bottom-0.5 right-0.5 font-sketch text-[7px] sm:text-[9px] font-black text-[#166534] leading-none pointer-events-none">
                ▲UP
              </span>
            )}
            {isSnakeHazard && (
              <span className="absolute bottom-0.5 right-0.5 font-sketch text-[7px] sm:text-[9px] font-black text-[#9b2c2c] leading-none pointer-events-none">
                ▼DN
              </span>
            )}

            {/* Subtle Movement Trails */}
            {isP1Trail && (
              <div className="absolute inset-0 bg-[#9b2c2c]/15 pointer-events-none" />
            )}
            {isP2Trail && (
              <div className="absolute inset-0 bg-[#1a365d]/15 pointer-events-none" />
            )}
          </div>
        );
      }
    }
    return tiles;
  };

  return (
    <div className="w-full max-w-[340px] aspect-square mx-auto relative rounded-none overflow-hidden border-2 sm:border-[2.5px] border-black sketch-shadow-md bg-[#faf6ee] select-none">
      {/* 10x10 Grid Matrix */}
      <div className="w-full h-full grid grid-cols-10 grid-rows-10">
        {renderTiles()}
      </div>

      {/* Realistic Curved Snake Layer */}
      <SnakeOverlay activeSnakeId={activeSnakeId} />

      {/* 3D Wooden Ladder Layer */}
      <LadderOverlay activeLadderId={activeLadderId} />

      {/* Player 1 Pawn */}
      <Pawn
        player="p1"
        tile={p1Position}
        isActive={activePlayer === 'p1'}
        isHopping={p1Hopping}
        isSharedTile={isSharedTile}
        customPos={p1CustomPos}
        trailFrom={p1Trail}
      />

      {/* Player 2 Pawn */}
      <Pawn
        player="p2"
        tile={p2Position}
        isActive={activePlayer === 'p2'}
        isHopping={p2Hopping}
        isSharedTile={isSharedTile}
        customPos={p2CustomPos}
        trailFrom={p2Trail}
      />
    </div>
  );
};
