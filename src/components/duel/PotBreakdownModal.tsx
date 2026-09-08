import React from 'react';
import { X, ShieldCheck, Percent, HelpCircle } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';

interface PotBreakdownModalProps {
  stake: number;
  pot: number;
  p1Name: string;
  p2Name?: string;
  onClose: () => void;
}

export const PotBreakdownModal: React.FC<PotBreakdownModalProps> = ({
  stake,
  pot,
  p1Name,
  p2Name = 'Opponent',
  onClose,
}) => {
  const winnerPayout = Math.floor(pot * 0.9);
  const arenaFee = pot - winnerPayout;
  const drawRefund = Math.floor(stake * 0.95);

  return (
    <div className="telegram-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
      <div className="relative w-full max-w-xs sm:max-w-sm bg-[#fbfaf7] border-2 sm:border-[2.5px] border-black rounded-none p-5 text-[#1a1a1a] sketch-shadow-xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-none bg-white hover:bg-[#fff9c4] border-2 border-black sketch-shadow-xs sketch-btn-press transition cursor-pointer"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-[#1a1a1a]" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-10 h-10 rounded-none bg-[#fff9c4] border-2 border-black sketch-shadow-xs flex items-center justify-center">
            <GramIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-sketch font-bold text-2xl leading-none text-[#1a1a1a]">
              DUEL POT BREAKDOWN
            </h3>
            <p className="font-body text-xs text-neutral-600 mt-0.5">GRAM Stakes & Rules</p>
          </div>
        </div>

        {/* Sticky Note Stake Ledger */}
        <div className="sticky-note rounded-none p-3.5 border-2 border-black mb-3.5 font-body text-xs space-y-2">
          <div className="flex justify-between items-center text-neutral-700">
            <span className="font-semibold truncate max-w-[130px]">{p1Name} Stake</span>
            <span className="font-bold flex items-center gap-1 text-[#1a1a1a]">
              {stake} <GramIcon className="w-3.5 h-3.5 inline" />
            </span>
          </div>
          <div className="flex justify-between items-center text-neutral-700">
            <span className="font-semibold truncate max-w-[130px]">{p2Name} Stake</span>
            <span className="font-bold flex items-center gap-1 text-[#1a1a1a]">
              {stake} <GramIcon className="w-3.5 h-3.5 inline" />
            </span>
          </div>
          <div className="border-t-2 border-dashed border-black/30 pt-2 flex justify-between items-center font-sketch text-base text-[#1a1a1a]">
            <span className="tracking-wide">TOTAL MATCH POT:</span>
            <span className="font-black text-lg flex items-center gap-1 text-[#1a1a1a]">
              {pot} <GramIcon className="w-4 h-4 inline" />
            </span>
          </div>
        </div>

        {/* Financial Rules Card */}
        <div className="space-y-2 bg-[#f2efe9] border-2 border-black rounded-none p-3 mb-4 font-body text-xs">
          <div className="flex justify-between items-center text-[#166534] font-bold">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> Winner Payout (90%)
            </span>
            <span className="flex items-center gap-1">
              +{winnerPayout} <GramIcon className="w-3.5 h-3.5 inline" />
            </span>
          </div>
          <div className="flex justify-between items-center text-neutral-600">
            <span className="flex items-center gap-1.5">
              <Percent className="w-4 h-4" /> Arena Fee (10%)
            </span>
            <span className="flex items-center gap-1">
              -{arenaFee} <GramIcon className="w-3.5 h-3.5 inline" />
            </span>
          </div>
          <div className="flex justify-between items-center text-[#1a365d] border-t border-black/20 pt-1.5 font-medium">
            <span className="flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" /> Draw Refund (95% each)
            </span>
            <span className="flex items-center gap-1">
              {drawRefund} <GramIcon className="w-3.5 h-3.5 inline" />
            </span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 bg-[#9b2c2c] hover:bg-[#b91c1c] text-white border-2 border-black font-sketch font-bold text-lg tracking-wider rounded-none sketch-shadow sketch-btn-press transition cursor-pointer"
        >
          GOT IT
        </button>
      </div>
    </div>
  );
};
