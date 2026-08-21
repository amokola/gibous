import React, { useState } from 'react';
import { Connect4Board as BoardType, PlayerId, WinningCoord } from '../../types/game';
import { getLowestEmptyRow } from '../../config/connect4Config';
import { DiscPiece } from './DiscPiece';
import { ChevronDown } from 'lucide-react';

interface Connect4BoardProps {
  board: BoardType;
  activePlayer: PlayerId;
  winningCells: WinningCoord[];
  isLocked: boolean;
  onDropDisc: (col: number) => void;
}

export const Connect4Board: React.FC<Connect4BoardProps> = ({
  board,
  activePlayer,
  winningCells,
  isLocked,
  onDropDisc,
}) => {
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  const isWinningCell = (r: number, c: number) => {
    return winningCells.some(cell => cell.row === r && cell.col === c);
  };

  const handleColumnClick = (col: number) => {
    if (isLocked) return;
    if (board[0][col] !== null) return; // Column full
    onDropDisc(col);
  };

  // Find lowest empty row for ghost preview
  const ghostRow = hoveredCol !== null ? getLowestEmptyRow(board, hoveredCol) : -1;

  return (
    <div className="w-full max-w-[370px] mx-auto flex flex-col items-center select-none">
      {/* 4real Top Hover Drop Arrows */}
      <div className="grid grid-cols-7 gap-1.5 w-full px-2.5 pb-2 min-h-[30px] items-center">
        {Array.from({ length: 7 }).map((_, c) => (
          <div
            key={c}
            className="flex items-center justify-center cursor-pointer"
            onClick={() => handleColumnClick(c)}
            onMouseEnter={() => setHoveredCol(c)}
            onMouseLeave={() => setHoveredCol(null)}
          >
            {hoveredCol === c && !isLocked && board[0][c] === null ? (
              <div
                className={`w-6 h-6 rounded-full border border-black flex items-center justify-center sketch-shadow-xs animate-bounce ${
                  activePlayer === 'p1' ? 'bg-[#ef4444]' : 'bg-[#3b82f6]'
                }`}
              >
                <ChevronDown className="w-4 h-4 text-white stroke-[3]" />
              </div>
            ) : (
              <div className="w-2 h-2 rounded-full bg-black/10" />
            )}
          </div>
        ))}
      </div>

      {/* 4real Blueprint Connect4 Chassis */}
      <div className="relative w-full bg-[#fff9c4] border-4 border-black rounded-3xl p-3 sm:p-3.5 sketch-shadow-lg">
        {/* Stamped Blueprint Header */}
        <div className="absolute top-1 left-4 font-sketch text-[10px] font-bold text-[#854d0e]/60 tracking-wider">
          GIBOUS • TACTICAL CHASSIS
        </div>

        {/* 7 Columns x 6 Rows Grid */}
        <div className="grid grid-cols-7 gap-2 sm:gap-2.5 pt-3">
          {Array.from({ length: 7 }).map((_, colIdx) => (
            <div
              key={colIdx}
              onClick={() => handleColumnClick(colIdx)}
              onMouseEnter={() => setHoveredCol(colIdx)}
              onMouseLeave={() => setHoveredCol(null)}
              className={`flex flex-col gap-2 sm:gap-2.5 cursor-pointer p-0.5 rounded-xl transition-colors duration-150 ${
                hoveredCol === colIdx && !isLocked ? 'bg-black/5' : ''
              }`}
            >
              {Array.from({ length: 6 }).map((_, rowIdx) => {
                const cell = board[rowIdx][colIdx];
                const isWin = isWinningCell(rowIdx, colIdx);
                const isGhost =
                  !cell &&
                  hoveredCol === colIdx &&
                  ghostRow === rowIdx &&
                  !isLocked;

                return (
                  <div
                    key={`${rowIdx}-${colIdx}`}
                    className="aspect-square w-full rounded-full bg-[#f2efe9] border-2 border-black/80 flex items-center justify-center relative overflow-hidden shadow-inner"
                  >
                    {cell ? (
                      <DiscPiece
                        player={cell}
                        isWinning={isWin}
                      />
                    ) : isGhost ? (
                      <div
                        className={`w-full h-full rounded-full border-2 border-dashed border-black opacity-40 animate-pulse ${
                          activePlayer === 'p1' ? 'bg-[#ef4444]' : 'bg-[#3b82f6]'
                        }`}
                      />
                    ) : (
                      <div className="w-full h-full rounded-full bg-[#f2efe9] border border-black/5" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* 4real Chassis Bottom Leg Stands */}
        <div className="flex justify-between items-center -mb-5 px-4 pt-2">
          <div className="w-8 h-4 bg-white border-2 border-black rounded-b-lg sketch-shadow-xs" />
          <div className="w-8 h-4 bg-white border-2 border-black rounded-b-lg sketch-shadow-xs" />
        </div>
      </div>
    </div>
  );
};
