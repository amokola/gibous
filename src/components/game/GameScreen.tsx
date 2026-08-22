import React, { useState } from 'react';
import { GameState } from '../../types/game';
import { ScoreHeader } from './ScoreHeader';
import { BoardGrid } from './BoardGrid';
import { Dice3D } from './Dice3D';
import { GameActionTicker } from './GameActionTicker';
import { EmoteReactionOverlay } from './EmoteReactionOverlay';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface GameScreenProps {
  gameState: GameState;
  p1Trail?: number | null;
  p2Trail?: number | null;
  highlightedTile?: number | null;
  statusText?: string;
  actionTicker?: { message: string; type: 'roll' | 'ladder' | 'snake' | 'info' };
  onRollDice: () => void;
  onBack: () => void;
}

export const GameScreen: React.FC<GameScreenProps> = ({
  gameState,
  p1Trail = null,
  p2Trail = null,
  highlightedTile = null,
  statusText,
  actionTicker,
  onRollDice,
  onBack,
}) => {
  const [showResignModal, setShowResignModal] = useState(false);
  const { activePlayer, players, turnPhase, lastDiceRoll } = gameState;
  const isRolling = turnPhase === 'ROLLING';
  const canRoll = turnPhase === 'WAITING_ROLL';

  const handleLeaveTrigger = () => {
    setShowResignModal(true);
  };

  const handleConfirmResign = () => {
    setShowResignModal(false);
    onBack();
  };

  return (
    <div className="w-full max-w-[420px] mx-auto min-h-screen flex flex-col justify-between p-3 sm:p-4 select-none animate-fade-in bg-[#fbfaf7] text-[#1a1a1a]">
      {/* Top Scoreboard Header */}
      <div>
        <ScoreHeader
          p1={players.p1}
          p2={players.p2}
          activePlayer={activePlayer}
          scoreLabel="Tile"
          onBack={handleLeaveTrigger}
          onLeaveRoom={handleLeaveTrigger}
        />

        {/* Live Match Action Feed Ticker */}
        {actionTicker && (
          <GameActionTicker
            message={actionTicker.message}
            type={actionTicker.type}
          />
        )}
      </div>

      {/* Center 10x10 Board Grid */}
      <div className="my-auto py-1">
        <BoardGrid
          p1Position={players.p1.score}
          p2Position={players.p2.score}
          activePlayer={activePlayer}
          p1Trail={p1Trail}
          p2Trail={p2Trail}
          highlightedTile={highlightedTile}
        />
      </div>

      {/* Bottom Interactive Area */}
      <div className="w-full pt-1 pb-2 flex flex-col items-center gap-2">
        {/* Center Controls: 3D Dice + Emote Reactions */}
        <div className="w-full flex items-center justify-between px-3">
          <div className="w-8" />

          <Dice3D
            value={lastDiceRoll}
            isRolling={isRolling}
            activePlayer={activePlayer}
            canRoll={canRoll}
            statusText={statusText}
            onRoll={onRollDice}
          />

          <div className="flex items-center">
            <EmoteReactionOverlay />
          </div>
        </div>
      </div>

      {/* Resign Confirmation Modal */}
      <ConfirmDialog
        isOpen={showResignModal}
        title="Leave Match?"
        message="Leaving now will count as a resignation. Your opponent will win the match."
        detail={`Stake: ${gameState.settings.winningAmount || 100} Play GRAM will be forfeited.`}
        confirmText="Resign & Leave"
        cancelText="Stay & Play"
        variant="danger"
        onConfirm={handleConfirmResign}
        onCancel={() => setShowResignModal(false)}
      />
    </div>
  );
};
