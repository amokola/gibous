import React, { useEffect, useState } from 'react';
import { TrophyCupIcon, CrownRankIcon } from '../icons/GameIcons';
import { GramIcon } from '../ui/GramIcon';
import { Sparkles } from 'lucide-react';

type TimeTab = 'daily' | 'weekly' | 'alltime';

interface RankedPlayer {
  rank: number;
  name: string;
  handle?: string;
  wins: number;
  earned: number;
  tier: string;
}

export const LeaderboardScreen: React.FC = () => {
  const [timeTab, setTimeTab] = useState<TimeTab>('alltime');
  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleTabChange = (tab: TimeTab) => {
    setTimeTab(tab);
  };

  useEffect(() => {
    let active = true;
    setLoadError(null);
    if (timeTab !== 'alltime') {
      setPlayers([]);
      setIsLoading(false);
      return () => { active = false; };
    }

    setIsLoading(true);
    fetch('/api/leaderboard')
      .then((response) => {
        if (!response.ok) throw new Error('Leaderboard unavailable');
        return response.json();
      })
      .then((data) => {
        if (active) setPlayers(Array.isArray(data.players) ? data.players : []);
      })
      .catch(() => {
        if (active) setLoadError('Could not load rankings. Please try again.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, [timeTab]);

  return (
    <div className="w-full max-w-[420px] mx-auto h-auto flex flex-col gap-3 p-3 sm:p-4 select-none animate-fade-in pb-10 bg-[#fbfaf7] text-[#1a1a1a]">
      {/* Header Banner */}
      <div className="w-full bg-white border-2 border-black p-4 sketch-shadow rounded-none flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 bg-[#fff9c4] border-2 border-black flex items-center justify-center">
            <TrophyCupIcon size={24} />
          </div>
          <div>
            <h1 className="font-sketch text-2xl font-bold tracking-wide leading-none">Leaderboard</h1>
            <span className="font-sketch text-xs text-[#1a1a1a]/60">Top players & winnings</span>
          </div>
        </div>
        <div className="bg-[#fee2e2] border border-black px-2.5 py-1 text-[#9b2c2c] font-sketch text-xs font-bold">
          ★ Season 1
        </div>
      </div>

      {/* Time Tabs Switcher (Sharp Rectangular) */}
      <div className="grid grid-cols-3 gap-2 bg-[#f2efe9] p-1.5 border-2 border-black rounded-none">
        {(['daily', 'weekly', 'alltime'] as TimeTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => handleTabChange(tab)}
            className={`py-2 rounded-none font-sketch text-xs sm:text-sm font-bold transition-all sketch-btn-press ${
              timeTab === tab
                ? 'bg-[#9b2c2c] text-white border-2 border-black sketch-shadow-xs'
                : 'text-[#1a1a1a]/70 hover:text-[#1a1a1a] bg-white border border-black/30'
            }`}
          >
            {tab === 'daily' ? 'Daily' : tab === 'weekly' ? 'Weekly' : 'All-Time'}
          </button>
        ))}
      </div>

      {/* Top 3 Podium Cards */}
      {players.length >= 3 && <div className="grid grid-cols-3 gap-2 my-1">
        {/* #2 Rank */}
        <div className="bg-[#e0f2fe] border-2 border-black rounded-none p-2.5 flex flex-col items-center text-center sketch-shadow-xs pt-4 relative">
          <div className="w-7 h-7 rounded-none bg-[#1a365d] border border-black font-sketch text-xs font-black text-white flex items-center justify-center -mt-6 mb-1 shadow">
            #2
          </div>
          <span className="font-sketch text-xs font-bold text-[#1a1a1a] truncate max-w-[90px]">
            {players[1].name}
          </span>
          <span className="text-[10px] text-[#1a365d] font-black font-sketch mt-0.5">
            +{players[1].earned.toLocaleString()}
          </span>
          <span className="text-[9px] text-[#1a1a1a]/60 font-semibold mt-0.5">
            {players[1].wins} Wins
          </span>
        </div>

        {/* #1 Champion */}
        <div className="bg-[#fff9c4] border-2 border-black rounded-none p-2.5 flex flex-col items-center text-center sketch-shadow -mt-2 pt-4 relative">
          <div className="w-8 h-8 rounded-none bg-[#fbc02d] border border-black flex items-center justify-center -mt-7 mb-1 shadow-md">
            <CrownRankIcon size={20} />
          </div>
          <span className="font-sketch text-xs font-black text-[#854d0e] truncate max-w-[90px]">
            {players[0].name}
          </span>
          <span className="text-[11px] text-[#166534] font-black font-sketch mt-0.5">
            +{players[0].earned.toLocaleString()}
          </span>
          <span className="text-[9px] text-[#854d0e] font-bold mt-0.5">
            {players[0].wins} Wins 👑
          </span>
        </div>

        {/* #3 Rank */}
        <div className="bg-[#fef3c7] border-2 border-black rounded-none p-2.5 flex flex-col items-center text-center sketch-shadow-xs pt-4 relative">
          <div className="w-7 h-7 rounded-none bg-[#ca8a04] border border-black font-sketch text-xs font-black text-white flex items-center justify-center -mt-6 mb-1 shadow">
            #3
          </div>
          <span className="font-sketch text-xs font-bold text-[#1a1a1a] truncate max-w-[90px]">
            {players[2].name}
          </span>
          <span className="text-[10px] text-[#854d0e] font-black font-sketch mt-0.5">
            +{players[2].earned.toLocaleString()}
          </span>
          <span className="text-[9px] text-[#1a1a1a]/60 font-semibold mt-0.5">
            {players[2].wins} Wins
          </span>
        </div>
      </div>}

      {/* Ranked Players List */}
      <div className="flex flex-col gap-2 my-1">
        <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 uppercase tracking-wider px-1">
          Global Rankings ({players.length} Players)
        </span>

        {isLoading && <div className="p-5 bg-white border-2 border-black text-center font-sketch">Loading rankings…</div>}
        {!isLoading && loadError && <div className="p-5 bg-[#fee2e2] border-2 border-black text-center font-sketch text-[#991b1b]">{loadError}</div>}
        {!isLoading && !loadError && timeTab !== 'alltime' && <div className="p-5 bg-white border-2 border-black text-center font-sketch">Daily and weekly rankings are coming soon.</div>}
        {!isLoading && !loadError && timeTab === 'alltime' && players.length === 0 && <div className="p-5 bg-white border-2 border-black text-center font-sketch">No ranked matches yet.</div>}
        {players.slice(3).map((player) => (
          <div
            key={player.rank}
            className="flex items-center justify-between p-3 rounded-none border-2 border-black bg-white text-[#1a1a1a] sketch-shadow-xs"
          >
            <div className="flex items-center gap-3">
              <span className="w-7 text-center font-sketch text-sm font-black text-[#1a1a1a]/60">
                #{player.rank}
              </span>
              <div className="flex flex-col">
                <span className="font-sketch text-sm font-bold leading-tight text-[#1a1a1a]">
                  {player.name}
                </span>
                <span className="text-[10px] font-semibold text-[#1a1a1a]/60 mt-0.5">
                  {player.wins} Wins • {player.tier}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 font-sketch text-sm font-bold text-[#1a365d]">
              <span>+{player.earned.toLocaleString()}</span>
              <GramIcon size="sm" />
            </div>
          </div>
        ))}
      </div>

      {/* Your Rank Footer Card */}
      <div className="p-3.5 bg-[#fff9c4] border-2 border-black rounded-none flex items-center justify-between font-sketch text-xs font-bold sketch-shadow-xs mt-1">
        <span className="flex items-center gap-1.5 text-[#854d0e]">
          <Sparkles className="w-4 h-4 text-[#ca8a04]" />
          Play matches to rank up
        </span>
        <span className="text-[#9b2c2c] bg-white px-2 py-0.5 border border-black">
          Season 1
        </span>
      </div>
    </div>
  );
};
