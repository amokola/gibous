import React, { useId, useMemo } from 'react';
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
  const leafGradientId = `board-leaf-${useId().replace(/:/g, '')}`;
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

        // Project paper and success tokens give the board its warm ivory/mint checker.
        let bgClass = isEvenTile ? 'bg-[#faf6ee]' : 'bg-[#dcfce7]';
        if (tileNumber === 100) bgClass = 'bg-[#b7e5c1] border border-[#166534]/55 font-black';
        if (tileNumber === 1) bgClass = 'bg-[#fff2bd] border border-[#a66b13]/55 font-black';
        if (isLadderStart) bgClass = 'bg-[#dcfce7]/90 border border-[#166534]/35';
        if (isSnakeHazard) bgClass = 'bg-[#f5d5c7] border border-[#9b2c2c]/35';

        tiles.push(
          <div
            key={tileNumber}
            id={`tile-${tileNumber}`}
            className={`relative flex items-center justify-center p-0.5 border border-[#324b35]/35 transition-colors duration-200 ${bgClass} ${
              isTarget ? 'ring-2 ring-[#9b2c2c] bg-[#fee2e2]/80 z-10' : ''
            }`}
            style={{ aspectRatio: '1/1' }}
          >
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

  const renderLabels = () => {
    const labels = [];
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 10; col++) {
        const tileNumber = row % 2 === 0
          ? 100 - (row * 10 + col)
          : 100 - (row * 10 + (9 - col));
        labels.push(
          <div key={tileNumber} className="relative pointer-events-none">
            <span className={`board-tile-label absolute top-0.5 left-0.5 sm:left-1 z-20 font-sketch text-[8px] sm:text-[10px] font-bold leading-none select-none ${
              tileNumber === 100
                ? 'text-[#166534] font-black text-[9px] sm:text-[11px]'
                : tileNumber === 1
                ? 'text-[#854d0e] font-black text-[9px] sm:text-[11px]'
                : 'text-[#1a1a1a]/80'
            }`}>{tileNumber}</span>
            {(tileNumber === 1 || tileNumber === 100) && (
              <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 z-20 border px-1 py-[1px] font-sketch text-[5px] sm:text-[7px] font-black leading-none tracking-[0.12em] ${tileNumber === 1 ? 'border-[#9b6b2c]/70 bg-[#f6dfa4] text-[#76481f]' : 'border-[#477f4f]/70 bg-[#e8f6df] text-[#285d34]'}`}>
                {tileNumber === 1 ? 'START' : 'FINISH'}
              </span>
            )}
          </div>,
        );
      }
    }
    return labels;
  };

  return (
    <div className="snakes-ladders-board-frame w-full max-w-[min(94vw,540px)] aspect-square mx-auto relative rounded-none p-2 sm:p-2.5 select-none">
      <div className="snakes-ladders-board-canvas w-full h-full relative rounded-none overflow-hidden">
      {/* 10x10 Grid Matrix */}
      <div className="w-full h-full grid grid-cols-10 grid-rows-10">
        {renderTiles()}
      </div>

      {/* Corner vines echo the hand-painted reference while staying behind labels and pieces. */}
      <svg className="absolute inset-0 z-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
            <linearGradient id={leafGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#80a955" />
            <stop offset="48%" stopColor="#46783c" />
            <stop offset="100%" stopColor="#244d32" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((corner) => {
          const transforms = [
            'translate(1 1)',
            'translate(99 1) scale(-1 1)',
            'translate(1 99) scale(1 -1)',
            'translate(99 99) scale(-1 -1)',
          ];
          return (
            <g key={corner} transform={transforms[corner]} opacity="0.96">
              <path d="M 1 1 C 4 3, 6 5, 10 12" fill="none" stroke="#315b36" strokeWidth="0.72" strokeLinecap="round" />
              <path d="M 3 4 C 1 3, 0.6 1.4, 1.2 0.2 C 3.2 0.3, 4.4 1.4, 4.4 3.6 C 4 4.2, 3.5 4.2, 3 4 Z" fill={`url(#${leafGradientId})`} stroke="#254b30" strokeWidth="0.2" />
              <path d="M 5.2 6.2 C 3 5.6, 2 3.9, 2.8 2.4 C 5.1 2.5, 6.3 3.9, 6.4 5.8 C 6 6.4, 5.7 6.4, 5.2 6.2 Z" fill={`url(#${leafGradientId})`} stroke="#254b30" strokeWidth="0.2" />
              <path d="M 7.4 9 C 6.8 6.9, 7.5 5.3, 9.2 4.9 C 10.5 6.6, 10.1 8.4, 8.3 9.5 C 7.9 9.5, 7.7 9.3, 7.4 9 Z" fill={`url(#${leafGradientId})`} stroke="#254b30" strokeWidth="0.2" />
              <path d="M 8.4 10.7 C 9.2 8.8, 10.8 8.1, 12.2 8.9 C 11.9 11, 10.5 12.1, 8.8 11.8 C 8.5 11.5, 8.4 11.2, 8.4 10.7 Z" fill={`url(#${leafGradientId})`} stroke="#254b30" strokeWidth="0.2" />
              <path d="M 2 2 L 3.8 3.3 M 4 4 L 5.7 5.1 M 8.1 8.6 L 9.5 9.6" fill="none" stroke="#d4df98" strokeWidth="0.2" strokeLinecap="round" opacity="0.8" />
            </g>
          );
        })}
      </svg>

      {/* Realistic Curved Snake Layer */}
      <SnakeOverlay activeSnakeId={activeSnakeId} />

      {/* 3D Wooden Ladder Layer */}
      <LadderOverlay activeLadderId={activeLadderId} />

      {/* Keep cell numbers readable above oversized illustrated routes. */}
      <div className="absolute inset-0 z-20 grid grid-cols-10 grid-rows-10 pointer-events-none" aria-hidden="true">
        {renderLabels()}
      </div>

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
    </div>
  );
};
