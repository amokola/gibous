import React, { useState } from 'react';
import { Send, Check, Sparkles, Flame, Trophy, Coins } from 'lucide-react';
import { useTelegram } from '../../hooks/useTelegram';
import { useSoundEffects } from '../../hooks/useSoundEffects';

interface BoastCardProps {
  name: string;
  username?: string;
  pnl: number;
  winRate: number;
  winStreak: number;
  totalVolume: number;
  totalWins: number;
}

export const BoastCard: React.FC<BoastCardProps> = ({
  name,
  username,
  pnl,
  winRate,
  winStreak,
  totalVolume,
  totalWins,
}) => {
  const [copied, setCopied] = useState(false);
  const { tg } = useTelegram();
  const sounds = useSoundEffects();

  const handleShareToTelegram = () => {
    sounds.playClick();
    const isProfit = pnl >= 0;
    const pnlSign = isProfit ? `+${pnl}` : `${pnl}`;
    const bragText = `🌙 GIBOUS DUEL ARENA STATS\n\n👤 Player: ${name} (@${username || 'ton_master'})\n💰 PnL: ${pnlSign} Play GRAM\n🔥 Win Streak: ${winStreak}X\n🏆 Win Rate: ${winRate}%\n💎 Total Volume: ${totalVolume} Play GRAM (${totalWins} Wins)\n\nCan you beat my record? Duel me on Gibous! 👇`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('https://t.me/gibous_bot/app')}&text=${encodeURIComponent(bragText)}`;

    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const isProfit = pnl >= 0;

  return (
    <div className="w-full bg-[#fff9c4] border-2 border-black p-4 select-none sketch-shadow rounded-none relative">
      {/* Top Tape Badge */}
      <div className="absolute -top-3 right-4 border border-black px-2.5 py-0.5 bg-[#fef08a] font-sketch text-[10px] font-bold rotate-1 uppercase tracking-wider">
        Telegram Brag Card
      </div>

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 bg-white border border-black flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[#854d0e]" />
        </div>
        <div>
          <h4 className="font-sketch text-lg font-bold text-[#1a1a1a] leading-tight">
            Boast Receipt
          </h4>
          <span className="font-sketch text-[11px] text-[#1a1a1a]/60">
            Server-Verified Duel Arena Stats
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
            {isProfit ? `+${pnl}` : pnl} Play GRAM
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
            {totalVolume} Play GRAM
          </span>
        </div>
      </div>

      {/* Share to Telegram Button (Matching User Reference) */}
      <button
        type="button"
        onClick={handleShareToTelegram}
        className="w-full mt-1 py-2.5 px-4 bg-white hover:bg-[#fbfaf7] border-2 border-black font-sketch text-sm sm:text-base font-bold text-[#1a1a1a] flex items-center justify-center gap-2 sketch-btn-press sketch-shadow-xs active:scale-95 transition-all rounded-none"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-[#166534] stroke-[3]" />
            <span>Dispatched to Telegram!</span>
          </>
        ) : (
          <>
            <Send className="w-4 h-4 text-[#1a365d]" />
            <span>Boast on Telegram Community / Stories</span>
          </>
        )}
      </button>
    </div>
  );
};
