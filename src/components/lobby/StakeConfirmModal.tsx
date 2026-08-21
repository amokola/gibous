import React from 'react';
import { GameTitle } from '../../types/game';
import { GAME_CONFIGS, calculatePotBreakdown } from '../../../shared';
import { GramIcon } from '../ui/GramIcon';

export interface StakeConfirmModalProps {
  isOpen: boolean;
  gameType: GameTitle;
  stakeAmount: number;
  mode: 'create' | 'join';
  onConfirm: () => void;
  onCancel: () => void;
}

export const StakeConfirmModal: React.FC<StakeConfirmModalProps> = ({
  isOpen,
  gameType,
  stakeAmount,
  mode,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const config = GAME_CONFIGS[gameType];
  const pot = stakeAmount * 2;
  const breakdown = calculatePotBreakdown(pot);
  const drawRefund = Math.floor(stakeAmount * 0.95);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="stake-confirm-title"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4 animate-fade-in"
    >
      <div className="w-full max-w-[360px] bg-[#fbfaf7] border-4 border-black p-4 sketch-shadow font-sketch text-[#1a1a1a] flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-2">
          <div>
            <h2 id="stake-confirm-title" className="text-lg font-bold text-[#1a1a1a] uppercase tracking-wide">
              {mode === 'create' ? 'Confirm Duel Entry' : 'Join Match Duel'}
            </h2>
            <span className="text-xs text-[#1a365d] font-bold">
              {config?.displayName || gameType.toUpperCase()}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="w-7 h-7 bg-white hover:bg-[#fee2e2] border-2 border-black flex items-center justify-center font-bold text-sm text-[#9b2c2c] cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Stake and Pot Summary */}
        <div className="bg-[#f2efe9] border-2 border-black p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#1a1a1a]/70">Your Entry Stake:</span>
            <span className="font-bold flex items-center gap-1 text-[#9b2c2c]">
              {stakeAmount} GRAM <GramIcon size="sm" />
            </span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-[#1a1a1a]/70">Opponent Match Stake:</span>
            <span className="font-bold flex items-center gap-1 text-[#1a365d]">
              {stakeAmount} GRAM <GramIcon size="sm" />
            </span>
          </div>
          <div className="flex justify-between items-center text-sm font-bold border-t border-black/20 pt-1.5">
            <span>Potential Match Pot:</span>
            <span className="text-[#1a365d] flex items-center gap-1 font-black">
              {pot} GRAM <GramIcon size="sm" />
            </span>
          </div>
        </div>

        {/* Economic Distribution Rules */}
        <div className="grid grid-cols-3 gap-1.5 text-[10px]">
          <div className="bg-white p-2 border border-black/40 text-center">
            <span className="text-[#166534] font-bold block">Winner Net (90%)</span>
            <span className="font-bold text-xs text-[#1a1a1a]">+{breakdown.winnerPayout}G</span>
          </div>
          <div className="bg-white p-2 border border-black/40 text-center">
            <span className="text-[#9b2c2c] font-bold block">Arena Fee (10%)</span>
            <span className="font-bold text-xs text-[#1a1a1a]">-{breakdown.arenaFee}G</span>
          </div>
          <div className="bg-white p-2 border border-black/40 text-center">
            <span className="text-[#854d0e] font-bold block">Draw Refund (95%)</span>
            <span className="font-bold text-xs text-[#1a1a1a]">+{drawRefund}G</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 bg-white hover:bg-[#f2efe9] text-[#1a1a1a] border-2 border-black font-sketch text-xs font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-[#9b2c2c] hover:bg-[#802222] text-white border-2 border-black font-sketch text-xs font-bold sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] transition-transform cursor-pointer"
          >
            {mode === 'create' ? 'Confirm & Create' : 'Confirm & Duel'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default StakeConfirmModal;
