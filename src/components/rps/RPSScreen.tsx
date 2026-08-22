import React, { useState } from 'react';
import { Player, PlayerId, RPSChoice } from '../../types/game';
import { ScoreHeader } from '../game/ScoreHeader';
import { ClashAnimation } from './ClashAnimation';
import { RPSCard } from './RPSCard';
import { EmoteReactionOverlay } from '../game/EmoteReactionOverlay';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useRPSEngine } from '../../hooks/useRPSEngine';

interface RPSScreenProps {
  p1: Player;
  p2: Player;
  matchType: 'local' | 'online' | 'bot';
  potAmount: number;
  onGameOver: (winner: PlayerId, pot: number) => void;
  onBack: () => void;
}

export const RPSScreen: React.FC<RPSScreenProps> = ({
  p1,
  p2,
  matchType,
  potAmount,
  onGameOver,
  onBack,
}) => {
  const [showResignModal, setShowResignModal] = useState(false);
  const {
    p1Wins,
    p2Wins,
    p1Choice,
    p2Choice,
    countdown,
    roundWinner,
    isProcessing,
    isDoubleClash,
    targetWins,
    playMove,
  } = useRPSEngine(matchType, potAmount, onGameOver);

  const player1WithScore = { ...p1, score: p1Wins };
  const player2WithScore = { ...p2, score: p2Wins };

  const handleLeaveTrigger = () => {
    setShowResignModal(true);
  };

  const handleConfirmResign = () => {
    setShowResignModal(false);
    onBack();
  };

  return (
    <div className="w-full max-w-[420px] mx-auto min-h-screen flex flex-col justify-between p-3 sm:p-4 select-none animate-fade-in bg-[#fbfaf7] text-[#1a1a1a]">
      {/* Top Turn & Series Scoreboard */}
      <ScoreHeader
        p1={player1WithScore}
        p2={player2WithScore}
        activePlayer="p1"
        scoreLabel="Wins"
        onBack={handleLeaveTrigger}
        onLeaveRoom={handleLeaveTrigger}
      />

      {/* Target Series Info Badge */}
      <div className="w-full flex justify-center -mt-1 mb-1">
        <span className="text-[10px] sm:text-[11px] font-bold text-[#1a1a1a]/70 bg-white px-3 py-0.5 rounded-full border border-black/20 font-sketch shadow-sm">
          First to {targetWins} series gems takes the {potAmount} GRAM pot
        </span>
      </div>

      {/* Center Duel Arena */}
      <div className="my-auto py-2">
        <ClashAnimation
          p1Choice={p1Choice}
          p2Choice={p2Choice}
          countdown={countdown}
          roundWinner={roundWinner}
          isClashing={isProcessing}
          p1Wins={p1Wins}
          p2Wins={p2Wins}
          targetWins={targetWins}
          isDoubleClash={isDoubleClash}
        />
      </div>

      {/* Bottom Weapon Selection Deck */}
      <div className="w-full pb-3 flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-[#1a1a1a]/80 font-sketch">
            {isProcessing ? 'Showdown in progress...' : 'Select your weapon:'}
          </span>
          <EmoteReactionOverlay />
        </div>

        <div className="flex gap-2">
          {(['rock', 'paper', 'scissors'] as RPSChoice[]).map((choice) => (
            <RPSCard
              key={choice}
              choice={choice}
              isSelected={p1Choice === choice}
              disabled={isProcessing}
              onSelect={playMove}
            />
          ))}
        </div>
      </div>

      {/* Resign Confirmation Modal */}
      <ConfirmDialog
        isOpen={showResignModal}
        title="Leave Match?"
        message="Leaving now will count as a resignation. Your opponent will win the match."
        detail={`Stake: ${potAmount / 2} Play GRAM will be forfeited.`}
        confirmText="Resign & Leave"
        cancelText="Stay & Play"
        variant="danger"
        onConfirm={handleConfirmResign}
        onCancel={() => setShowResignModal(false)}
      />
    </div>
  );
};
