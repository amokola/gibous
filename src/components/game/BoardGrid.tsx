import React from 'react';
import { Pawn } from './Pawn';
import { SnakeOverlay } from './SnakeOverlay';
import { LadderOverlay } from './LadderOverlay';
import { PlayerId } from '../../types/game';

interface BoardGridProps {
  p1Position: number;
  p2Position: number;
  p1Trail?: number | null;
  p2Trail?: number | null;
  highlightedTile?: number | null;
  activePlayer: PlayerId;
}

export const BoardGrid: React.FC<BoardGridProps> = ({
  p1Position,
  p2Position,
  p1Trail = null,
  p2Trail = null,
  highlightedTile = null,
  activePlayer,
}) => {
  // 10x10 Grid representation: 100 tiles total
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

        // Tile background styling: alternating light ivory and honey parchment
        let bgClass = isEvenTile ? 'bg-[#faf6ee]' : 'bg-[#eadbba]';
        if (tileNumber === 100) bgClass = 'bg-[#dcfce7] border border-[#15803d]/50';
        if (tileNumber === 1) bgClass = 'bg-[#fff9c4] border border-[#ca8a04]/50';

        tiles.push(
          <div
            key={tileNumber}
            id={`tile-${tileNumber}`}
            className={`relative flex items-center justify-center p-0.5 border border-black/30 transition-colors duration-200 ${bgClass} ${
              isTarget ? 'ring-2 ring-[#9b2c2c] bg-[#fee2e2]/40 z-10' : ''
            }`}
          >
            {/* Tile Number with 4real Cabin Sketch font */}
            <span
              className={`absolute top-0.5 left-0.5 font-sketch text-[9px] sm:text-[10px] font-bold leading-none select-none ${
                tileNumber === 100
                  ? 'text-[#166534] font-black'
                  : tileNumber === 1
                  ? 'text-[#854d0e] font-black'
                  : 'text-[#1a1a1a]/60'
              }`}
            >
              {tileNumber}
            </span>

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
    <div className="w-full max-w-[340px] aspect-square mx-auto relative rounded-none overflow-hidden border-2 border-black sketch-shadow bg-[#faf6ee] select-none">
      {/* 10x10 Grid Matrix */}
      <div className="w-full h-full grid grid-cols-10 grid-rows-10">
        {renderTiles()}
      </div>

      {/* Realistic Curved Snake Layer */}
      <SnakeOverlay />

      {/* 3D Wooden Ladder Layer */}
      <LadderOverlay />

      {/* Player 1 Pawn */}
      <Pawn
        player="p1"
        tile={p1Position}
        isActive={activePlayer === 'p1'}
        trailFrom={p1Trail}
      />

      {/* Player 2 Pawn */}
      <Pawn
        player="p2"
        tile={p2Position}
        isActive={activePlayer === 'p2'}
        trailFrom={p2Trail}
      />
    </div>
  );
};
