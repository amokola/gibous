import React, { useState } from 'react';
import { NormalizedDuelState } from '../../types/game';

interface Connect4ArenaProps {
  duelState: NormalizedDuelState;
  onDropDisc: (col: number) => void;
}

export const Connect4Arena: React.FC<Connect4ArenaProps> = ({ duelState, onDropDisc }) => {
  const { myRole, activePlayer, gameState, lastDropEvent } = duelState;
  const isMyTurn = myRole !== null && activePlayer === myRole;

  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  const rawBoard: (string | null)[][] =
    gameState?.board || Array(6).fill(null).map(() => Array(7).fill(null));
  const winningCells: any[] = gameState?.winningCells || [];

  const isWinningCoord = (cell: any, r: number, c: number): boolean => {
    if (!cell) return false;
    if (Array.isArray(cell)) return cell[0] === r && cell[1] === c;
    if (typeof cell === 'object') return cell.row === r && cell.col === c;
    return false;
  };

  const actualWinner = duelState.winner || gameState?.winner || null;
  const isGameOver = Boolean(actualWinner) || duelState.room?.status === 'gameover' || winningCells.length > 0;
  const isDraw = actualWinner === 'draw';
  const isSpectator = myRole === null;
  const isWinner = !isSpectator && !isDraw && actualWinner !== null && actualWinner === myRole;
  const opponentRole = myRole === 'p2' ? 'p1' : 'p2';
  const opponentName = duelState.players[opponentRole]?.name || (myRole === 'p1' ? 'Player 2' : 'Player 1');
  const p1Name = duelState.players.p1?.name || 'Player 1';
  const p2Name = duelState.players.p2?.name || 'Player 2';

  const handleColumnClick = (col: number) => {
    if (!isMyTurn || isGameOver) return;
    onDropDisc(col);
  };

  const lastRow = lastDropEvent?.row;
  const lastCol = lastDropEvent?.col;

  return (
    <div className="flex flex-col items-center justify-center w-full h-full max-w-sm mx-auto py-1 font-body select-none">
      {/* Column Drop Controls */}
      <div className="grid grid-cols-7 gap-1.5 w-full px-1 mb-2">
        {Array.from({ length: 7 }).map((_, c) => {
          const isHovered = hoveredCol === c && isMyTurn && !isGameOver;
          return (
            <button
              key={c}
              onClick={() => handleColumnClick(c)}
              onMouseEnter={() => setHoveredCol(c)}
              onMouseLeave={() => setHoveredCol(null)}
              disabled={!isMyTurn || isGameOver}
              className={`h-7 rounded-none flex items-center justify-center border-2 transition-all font-sketch font-bold cursor-pointer ${
                isGameOver
                  ? 'bg-neutral-200/50 border-black/20 text-neutral-400 cursor-not-allowed'
                  : isHovered
                  ? 'bg-[#fff9c4] border-black text-[#1a1a1a] sketch-shadow-xs scale-105'
                  : 'bg-white/60 border-dashed border-black/40 text-neutral-400 hover:border-black hover:text-[#1a1a1a]'
              }`}
              title={`Drop in column ${c + 1}`}
            >
              <span className="text-xs">{isHovered ? '↓' : '•'}</span>
            </button>
          );
        })}
      </div>

      {/* 7x6 Board with Navy Casing */}
      <div className="w-full bg-[#1a365d] border-2 sm:border-[3px] border-black rounded-none p-2.5 sketch-shadow-lg">
        <div className="grid grid-cols-7 gap-1.5 w-full">
          {rawBoard.map((row, rIdx) =>
            row.map((cell, cIdx) => {
              const isWinning = winningCells.some((c) => isWinningCoord(c, rIdx, cIdx));
              const isP1 = cell === 'p1';
              const isP2 = cell === 'p2';
              const isLastDropped = lastRow === rIdx && lastCol === cIdx;
              const isColumnHovered = hoveredCol === cIdx && isMyTurn && !isGameOver;

              return (
                <div
                  key={`${rIdx}-${cIdx}`}
                  onClick={() => handleColumnClick(cIdx)}
                  onMouseEnter={() => setHoveredCol(cIdx)}
                  onMouseLeave={() => setHoveredCol(null)}
                  className={`relative flex items-center justify-center rounded-full border-2 border-black shadow-inner cursor-pointer transition-colors ${
                    isColumnHovered ? 'bg-[#fff9c4]/80' : 'bg-[#f2efe9]'
                  }`}
                  style={{ aspectRatio: '1/1' }}
                >
                  {isP1 && (
                    <div
                      className={`w-[86%] h-[86%] rounded-full bg-[#9b2c2c] border-2 border-black sketch-shadow-xs transition-transform flex items-center justify-center ${
                        isWinning
                          ? 'animate-bounce ring-4 ring-[#fff9c4]'
                          : isLastDropped
                          ? 'animate-disc-fall'
                          : ''
                      }`}
                    >
                      {isLastDropped && !isWinning && (
                        <span className="w-2 h-2 rounded-full bg-white/90 shadow-sm animate-pulse" />
                      )}
                    </div>
                  )}
                  {isP2 && (
                    <div
                      className={`w-[86%] h-[86%] rounded-full bg-[#2563eb] border-2 border-black sketch-shadow-xs transition-transform flex items-center justify-center ${
                        isWinning
                          ? 'animate-bounce ring-4 ring-[#fff9c4]'
                          : isLastDropped
                          ? 'animate-disc-fall'
                          : ''
                      }`}
                    >
                      {isLastDropped && !isWinning && (
                        <span className="w-2 h-2 rounded-full bg-white/90 shadow-sm animate-pulse" />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Helper Footer */}
      <div className="mt-2 text-center font-sketch text-xs text-neutral-600">
        {isGameOver ? (
          <span className={`font-bold ${isDraw ? 'text-[#0369a1]' : isWinner ? 'text-[#166534] animate-bounce-subtle' : isSpectator ? 'text-[#1a365d]' : 'text-[#991b1b]'}`}>
            {isDraw
              ? 'MATCH ENDED IN A DRAW'
              : isWinner
              ? '4-IN-A-ROW! YOU WON THE DUEL!'
              : isSpectator
              ? `4-IN-A-ROW! ${actualWinner === 'p1' ? p1Name.toUpperCase() : p2Name.toUpperCase()} WON!`
              : `4-IN-A-ROW! ${opponentName.toUpperCase()} WON!`}
          </span>
        ) : isMyTurn ? (
          <span className="text-[#166534] font-bold animate-pulse">
            YOUR TURN — TAP A COLUMN TO DROP YOUR DISC
          </span>
        ) : isSpectator ? (
          <span>{activePlayer === 'p1' ? `${p1Name}'s turn` : `${p2Name}'s turn`}</span>
        ) : (
          <span>WAITING FOR OPPONENT'S MOVE...</span>
        )}
      </div>
    </div>
  );
};
