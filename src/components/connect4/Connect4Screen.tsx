import React from 'react';
import { Player, PlayerId } from '../../types/game';
import { ScoreHeader } from '../game/ScoreHeader';
import { Connect4Board } from './Connect4Board';
import { EmoteReactionOverlay } from '../game/EmoteReactionOverlay';
import { useConnect4Engine } from '../../hooks/useConnect4Engine';

interface Connect4ScreenProps {
  p1: Player;
  p2: Player;
  matchType: 'local' | 'online' | 'bot';
  potAmount: number;
  onGameOver: (winner: PlayerId, pot: number) => void;
  onBack: () => void;
}

export const Connect4Screen: React.FC<Connect4ScreenProps> = ({
  p1,
  p2,
  matchType,
  potAmount,
  onGameOver,
  onBack,
}) => {
  const {
    board,
    activePlayer,
    winningCells,
    isProcessing,
    p1Wins,
    p2Wins,
    dropDisc,
  } = useConnect4Engine(matchType, potAmount, onGameOver);

  const isP1Turn = activePlayer === 'p1';
  const player1WithScore = { ...p1, score: p1Wins };
  const player2WithScore = { ...p2, score: p2Wins };

  return (
    <div className="w-full max-w-[420px] mx-auto min-h-screen flex flex-col justify-between p-3 sm:p-4 select-none animate-fade-in bg-[#fbfaf7] text-[#1a1a1a]">
      {/* Top Turn & Scoreboard Header */}
      <ScoreHeader
        p1={player1WithScore}
        p2={player2WithScore}
        activePlayer={activePlayer}
        onBack={onBack}
        onLeaveRoom={onBack}
      />

      {/* Center 7x6 Connect 4 4real Blueprint Board */}
      <div className="my-auto py-2">
        <Connect4Board
          board={board}
          activePlayer={activePlayer}
          winningCells={winningCells || []}
          isLocked={isProcessing}
          onDropDisc={dropDisc}
        />
      </div>

      {/* Bottom Status / Guidance Pill & Emote Bar */}
      <div className="w-full pb-3 flex items-center justify-between px-2">
        <div className="w-8" />

        <div
          className={`px-4 py-1.5 rounded-2xl border-2 border-black font-sketch text-sm sm:text-base font-bold tracking-wide transition-all sketch-shadow-xs ${
            isP1Turn
              ? 'bg-[#fff9c4] text-[#854d0e]'
              : 'bg-[#e0f2fe] text-[#1a365d]'
          }`}
        >
          {isP1Turn
            ? `${p1.name}'s Turn (Drop Disc)`
            : `${p2.name}'s Turn (Drop Disc)`}
        </div>

        <div className="flex items-center">
          <EmoteReactionOverlay />
        </div>
      </div>
    </div>
  );
};
