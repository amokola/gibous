import React, { useState } from 'react';
import { Send, Check, Sparkles, Flame, Trophy, Coins, Loader2 } from 'lucide-react';
import { useTelegram } from '../../hooks/useTelegram';

interface BoastCardProps {
  pnl: number;
  winRate: number;
  winStreak: number;
  totalVolume: number;
  totalWins: number;
}

export const BoastCard: React.FC<BoastCardProps> = ({
  pnl,
  winRate,
  winStreak,
  totalVolume,
  totalWins,
}) => {
  const [shareState, setShareState] = useState<'idle' | 'preparing' | 'sent' | 'cancelled' | 'unsupported' | 'error'>('idle');
  const { sharePreparedBragCard } = useTelegram();
  const hasActivity = totalVolume > 0 || totalWins > 0;

  const handleShareToTelegram = async () => {
    if (!hasActivity || shareState === 'preparing') return;
    setShareState('preparing');
    try {
      const result = await sharePreparedBragCard();
      setShareState(
        result.status === 'sent'
          ? 'sent'
          : result.status === 'cancelled'
            ? 'cancelled'
            : result.status === 'unsupported'
              ? 'unsupported'
              : 'error',
      );
    } catch {
      setShareState('error');
    }
  };

  const isProfit = pnl >= 0;

  return (
    <div className="w-full bg-[#fff9c4] border-2 border-black p-4 select-none sketch-shadow rounded-none relative">
      {/* Top Tape Badge */}
      <div className="absolute -top-3 right-4 border border-black px-2.5 py-0.5 bg-[#fef08a] font-sketch text-[10px] font-bold rotate-1 uppercase tracking-wider">
        Brag Card
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 bg-white border border-black flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[#854d0e]" />
        </div>
        <div>
          <h4 className="font-sketch text-lg font-bold text-[#1a1a1a] leading-tight">
            Brag Card
          </h4>
          <span className="font-sketch text-[11px] text-[#1a1a1a]/60">
            Share your stats and challenge friends
          </span>
        </div>
      </div>

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-2 gap-2 my-2 bg-white border border-black p-2.5">
        <div>
          <div className="flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-[#166534]" />
            <span className="text-[10px] font-bold font-sketch text-[#1a1a1a]/60 uppercase">Net PnL</span>
          </div>
          <span className={`font-sketch text-lg font-bold ${isProfit ? 'text-[#166534]' : 'text-[#991b1b]'}`}>
            {isProfit ? `+${pnl}` : pnl} GRAM
          </span>
        </div>

        <div>
          <div className="flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 text-[#b91c1c]" />
            <span className="text-[10px] font-bold font-sketch text-[#1a1a1a]/60 uppercase">Streak</span>
          </div>
          <span className="font-sketch text-lg font-bold text-[#b91c1c]">
            {winStreak}X Streak
          </span>
        </div>

        <div>
          <div className="flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-[#ca8a04]" />
            <span className="text-[10px] font-bold font-sketch text-[#1a1a1a]/60 uppercase">Win Rate</span>
          </div>
          <span className="font-sketch text-lg font-bold text-[#1a1a1a]">
            {winRate}% ({totalWins}W)
          </span>
        </div>

        <div>
          <div className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#1a365d]" />
            <span className="text-[10px] font-bold font-sketch text-[#1a1a1a]/60 uppercase">Volume</span>
          </div>
          <span className="font-sketch text-lg font-bold text-[#1a365d]">
            {totalVolume} GRAM
          </span>
        </div>
      </div>

      {/* Share a prepared Telegram image with an inline keyboard */}
      <button
        type="button"
        onClick={handleShareToTelegram}
        disabled={!hasActivity || shareState === 'preparing'}
        className="w-full mt-1 py-2.5 px-4 bg-white hover:bg-[#fbfaf7] border-2 border-black font-sketch text-sm sm:text-base font-bold text-[#1a1a1a] flex items-center justify-center gap-2 sketch-btn-press sketch-shadow-xs active:scale-95 transition-all rounded-none disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100 cursor-pointer"
      >
        {shareState === 'preparing' ? (
          <>
            <Loader2 className="w-4 h-4 text-[#1a365d] animate-spin" />
            <span>Generating card...</span>
          </>
        ) : shareState === 'sent' ? (
          <>
            <Check className="w-4 h-4 text-[#166534] stroke-[3]" />
            <span>Shared!</span>
          </>
        ) : shareState === 'cancelled' ? (
          <>
            <Send className="w-4 h-4 text-[#1a365d]" />
            <span>Share cancelled</span>
          </>
        ) : shareState === 'unsupported' ? (
          <>
            <Send className="w-4 h-4 text-[#854d0e]" />
            <span>Open in Telegram to share</span>
          </>
        ) : shareState === 'error' ? (
          <>
            <Send className="w-4 h-4 text-[#991b1b]" />
            <span>Could not share. Try again.</span>
          </>
        ) : !hasActivity ? (
          <>
            <Sparkles className="w-4 h-4 text-[#854d0e]" />
            <span>Play a match to unlock</span>
          </>
        ) : (
          <>
            <Send className="w-4 h-4 text-[#1a365d]" />
            <span>Share Brag Card</span>
          </>
        )}
      </button>
    </div>
  );
};
