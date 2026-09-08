import React, { useState } from 'react';
import { Share2, Clock, Swords, Zap, Check } from 'lucide-react';
import { MatchStats } from '../../types/game';
import { useTelegram } from '../../hooks/useTelegram';

interface MatchStatsCardProps {
  stats: MatchStats;
  gameTitle: string;
  isWinner: boolean;
}

export const MatchStatsCard: React.FC<MatchStatsCardProps> = ({
  stats,
  gameTitle,
  isWinner,
}) => {
  const [copied, setCopied] = useState(false);
  const { shareRoomInvite } = useTelegram();

  const handleShare = () => {
    shareRoomInvite('PVP_MATCH', stats.potEarned / 2);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full bg-white border-2 border-black rounded-none p-3.5 flex flex-col gap-2.5 select-none sketch-shadow-xs my-2 text-[#1a1a1a]">
      <div className="flex items-center justify-between">
        <span className="font-sketch text-xs font-bold text-[#1a1a1a]/60 uppercase tracking-wider">
          Match Stats
        </span>
        <span className="font-sketch text-xs font-bold text-[#1a365d]">
          {gameTitle}
        </span>
      </div>

      {/* 3 Metric Grid */}
      <div className="grid grid-cols-3 gap-2">
        {/* Turns */}
        <div className="bg-[#f2efe9] border border-black rounded-none p-2 flex flex-col items-center text-center">
          <Swords className="w-3.5 h-3.5 text-[#1a365d] mb-0.5" />
          <span className="text-[9px] font-bold text-[#1a1a1a]/60 uppercase font-sketch">Turns</span>
          <span className="font-sketch text-base font-bold text-[#1a1a1a]">{stats.turns}</span>
        </div>

        {/* Duration */}
        <div className="bg-[#f2efe9] border border-black rounded-none p-2 flex flex-col items-center text-center">
          <Clock className="w-3.5 h-3.5 text-[#ca8a04] mb-0.5" />
          <span className="text-[9px] font-bold text-[#1a1a1a]/60 uppercase font-sketch">Duration</span>
          <span className="font-sketch text-base font-bold text-[#1a1a1a]">{stats.duration}</span>
        </div>

        {/* Best Move */}
        <div className="bg-[#f2efe9] border border-black rounded-none p-2 flex flex-col items-center text-center">
          <Zap className="w-3.5 h-3.5 text-[#166534] mb-0.5" />
          <span className="text-[9px] font-bold text-[#1a1a1a]/60 uppercase font-sketch">Highlight</span>
          <span className="font-sketch text-xs font-bold text-[#166534] truncate max-w-[70px]">
            {stats.biggestMove}
          </span>
        </div>
      </div>

      {/* Share to Telegram Button */}
      <button
        type="button"
        onClick={handleShare}
        className="w-full py-2 px-3 rounded-none bg-[#fff9c4] hover:bg-[#fef08a] border-2 border-black flex items-center justify-center gap-1.5 font-sketch text-xs font-bold text-[#1a1a1a] transition-all sketch-btn-press active:scale-95 sketch-shadow-xs"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-[#166534] stroke-[3]" />
            <span>Shared to Telegram!</span>
          </>
        ) : (
          <>
            <Share2 className="w-3.5 h-3.5" />
            <span>{isWinner ? 'Share Victory' : 'Invite For Rematch'}</span>
          </>
        )}
      </button>
    </div>
  );
};
