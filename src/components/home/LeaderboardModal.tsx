import React, { useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';
import { TrophyCupIcon, CrownRankIcon } from '../icons/GameIcons';
import { useSoundEffects } from '../../hooks/useSoundEffects';

interface LeaderboardModalProps {
  onClose: () => void;
}

type TimeTab = 'daily' | 'weekly' | 'alltime';

const LEADERBOARDS = {
  daily: [
    { rank: 1, name: 'Alex Ton', handle: '@alex_ton', wins: 28, earned: 5600, tier: 'Diamond' },
    { rank: 2, name: 'Cyber Ronin', handle: '@cyber_ronin', wins: 24, earned: 4800, tier: 'Diamond' },
    { rank: 3, name: 'Gram Whale', handle: '@gram_whale', wins: 19, earned: 3800, tier: 'Gold' },
    { rank: 4, name: 'Samurai X', handle: '@samurai_x', wins: 15, earned: 3000, tier: 'Gold' },
    { rank: 5, name: 'Shadow Knight', handle: '@shadow_k', wins: 12, earned: 2400, tier: 'Silver' },
    { rank: 6, name: 'Crypto King', handle: '@crypto_king', wins: 10, earned: 2000, tier: 'Silver' },
  ],
  weekly: [
    { rank: 1, name: 'Gram Whale', handle: '@gram_whale', wins: 142, earned: 28400, tier: 'Diamond' },
    { rank: 2, name: 'Alex Ton', handle: '@alex_ton', wins: 128, earned: 25600, tier: 'Diamond' },
    { rank: 3, name: 'Cyber Ronin', handle: '@cyber_ronin', wins: 110, earned: 22000, tier: 'Diamond' },
    { rank: 4, name: 'Neon Blade', handle: '@neon_b', wins: 89, earned: 17800, tier: 'Gold' },
    { rank: 5, name: 'Samurai X', handle: '@samurai_x', wins: 76, earned: 15200, tier: 'Gold' },
    { rank: 6, name: 'Shadow Knight', handle: '@shadow_k', wins: 64, earned: 12800, tier: 'Silver' },
  ],
  alltime: [
    { rank: 1, name: 'Alex Ton', handle: '@alex_ton', wins: 680, earned: 136000, tier: 'Grandmaster' },
    { rank: 2, name: 'Gram Whale', handle: '@gram_whale', wins: 612, earned: 122400, tier: 'Grandmaster' },
    { rank: 3, name: 'Cyber Ronin', handle: '@cyber_ronin', wins: 540, earned: 108000, tier: 'Diamond' },
    { rank: 4, name: 'Samurai X', handle: '@samurai_x', wins: 420, earned: 84000, tier: 'Diamond' },
    { rank: 5, name: 'Neon Blade', handle: '@neon_b', wins: 380, earned: 76000, tier: 'Gold' },
    { rank: 6, name: 'Shadow Knight', handle: '@shadow_k', wins: 310, earned: 62000, tier: 'Gold' },
  ],
};

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({ onClose }) => {
  const [timeTab, setTimeTab] = useState<TimeTab>('weekly');
  const sounds = useSoundEffects();

  const handleTabChange = (tab: TimeTab) => {
    sounds.playClick();
    setTimeTab(tab);
  };

  const players = LEADERBOARDS[timeTab];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="w-full max-w-[390px] bg-[#fbfaf7] bg-dot-grid-dark border-2 sm:border-[2.5px] border-black rounded-none p-5 sketch-shadow-lg flex flex-col max-h-[86vh] overflow-hidden text-[#1a1a1a]">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b-2 border-black">
          <div className="flex items-center gap-2 text-[#1a1a1a]">
            <TrophyCupIcon size={26} />
            <span className="font-sketch text-2xl font-bold tracking-wide">Gibous Ranks</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-none bg-white hover:bg-[#f2efe9] border-2 border-black text-[#1a1a1a] sketch-shadow-xs active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Time Tabs Switcher */}
        <div className="grid grid-cols-3 gap-1.5 bg-[#f2efe9] p-1 rounded-none border-2 border-black my-2.5">
          {(['daily', 'weekly', 'alltime'] as TimeTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              className={`py-1.5 rounded-none font-sketch text-xs font-bold transition-all ${
                timeTab === tab
                  ? 'bg-[#9b2c2c] text-white border border-black sketch-shadow-xs'
                  : 'text-[#1a1a1a]/60 hover:text-[#1a1a1a]'
              }`}
            >
              {tab === 'daily' ? 'Daily' : tab === 'weekly' ? 'Weekly' : 'All-Time'}
            </button>
          ))}
        </div>

        {/* Top 3 Podium Highlights */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {/* #2 Player */}
          <div className="bg-[#e0f2fe] border-2 border-black rounded-none p-2 flex flex-col items-center text-center sketch-shadow-xs pt-3">
            <div className="w-6 h-6 rounded-none bg-[#1a365d] border border-black font-sketch text-xs font-black text-white flex items-center justify-center -mt-5 mb-1 shadow">
              #2
            </div>
            <span className="font-sketch text-xs font-bold text-[#1a1a1a] truncate max-w-[80px]">
              {players[1].name}
            </span>
            <span className="text-[10px] text-[#1a365d] font-bold font-sketch">
              +{players[1].earned.toLocaleString()}
            </span>
          </div>

          {/* #1 Champion */}
          <div className="bg-[#fff9c4] border-2 border-black rounded-none p-2 flex flex-col items-center text-center sketch-shadow-xs -mt-1 pt-3">
            <div className="w-7 h-7 rounded-none bg-[#fbc02d] border border-black flex items-center justify-center -mt-6 mb-1 shadow-md">
              <CrownRankIcon size={18} />
            </div>
            <span className="font-sketch text-xs font-black text-[#854d0e] truncate max-w-[80px]">
              {players[0].name}
            </span>
            <span className="text-[10px] text-[#166534] font-black font-sketch">
              +{players[0].earned.toLocaleString()}
            </span>
          </div>

          {/* #3 Player */}
          <div className="bg-[#fef3c7] border-2 border-black rounded-none p-2 flex flex-col items-center text-center sketch-shadow-xs pt-3">
            <div className="w-6 h-6 rounded-none bg-[#ca8a04] border border-black font-sketch text-xs font-black text-white flex items-center justify-center -mt-5 mb-1 shadow">
              #3
            </div>
            <span className="font-sketch text-xs font-bold text-[#1a1a1a] truncate max-w-[80px]">
              {players[2].name}
            </span>
            <span className="text-[10px] text-[#854d0e] font-bold font-sketch">
              +{players[2].earned.toLocaleString()}
            </span>
          </div>
        </div>

        {/* Players List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-none">
          {players.slice(3).map((player) => (
            <div
              key={player.rank}
              className="flex items-center justify-between p-2.5 rounded-none border-2 border-black bg-white text-[#1a1a1a] sketch-shadow-xs"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-6 text-center font-sketch text-sm font-bold text-[#1a1a1a]/50">
                  #{player.rank}
                </span>
                <div className="flex flex-col">
                  <span className="font-sketch text-sm font-bold leading-tight">
                    {player.name}
                  </span>
                  <span className="text-[10px] font-semibold text-[#1a1a1a]/60">
                    {player.wins} PVP Wins • {player.tier}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1 font-sketch text-sm font-bold text-[#1a365d]">
                <span>+{player.earned.toLocaleString()}</span>
                <GramIcon size="sm" />
              </div>
            </div>
          ))}
        </div>

        {/* Your Rank Footer */}
        <div className="pt-2.5 mt-2 border-t-2 border-black flex items-center justify-between font-sketch text-xs font-bold text-[#1a1a1a]/70">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#ca8a04]" />
            Your Rank: #18 (Diamond Tier)
          </span>
          <span className="text-[#9b2c2c]">Next Reward: Top 10</span>
        </div>
      </div>
    </div>
  );
};
