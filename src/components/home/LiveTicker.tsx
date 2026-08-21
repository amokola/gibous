import React, { useEffect, useState } from 'react';
import { GramIcon } from '../ui/GramIcon';
import { Zap } from 'lucide-react';

const RECENT_WINS = [
  { user: '@alex_ton', amount: 200, game: 'Snake & Ladder' },
  { user: '@cyber_ninja', amount: 400, game: 'Four in a Row' },
  { user: '@gram_whale', amount: 1000, game: 'Rock Paper Scissors' },
  { user: '@samurai_x', amount: 200, game: 'Snake & Ladder' },
  { user: '@ton_master', amount: 500, game: 'Four in a Row' },
];

export const LiveTicker: React.FC = () => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % RECENT_WINS.length);
    }, 3200);

    return () => clearInterval(timer);
  }, []);

  const current = RECENT_WINS[index];

  return (
    <div className="w-full bg-white border-2 border-black rounded-none py-2 px-3 flex items-center justify-between overflow-hidden select-none my-1 sketch-shadow-xs">
      <div className="flex items-center gap-1.5 text-xs text-[#854d0e] font-bold flex-shrink-0 bg-[#fff9c4] border border-black px-2 py-0.5 rounded-none">
        <Zap className="w-3.5 h-3.5 text-[#854d0e] fill-[#854d0e]" />
        <span className="font-sketch text-xs uppercase tracking-wider text-[#854d0e]">PVP Live</span>
      </div>

      <div className="flex items-center gap-1.5 text-xs font-bold animate-fade-in truncate mx-2">
        <span className="text-[#1a1a1a] font-extrabold">{current.user}</span>
        <span className="text-[#1a1a1a]/60 font-normal">won</span>
        <span className="font-sketch text-sm text-[#166534] font-bold">+{current.amount}</span>
        <GramIcon size="sm" />
        <span className="text-[#1a1a1a]/50 font-normal text-[10px] hidden sm:inline">in {current.game}</span>
      </div>

      <div className="w-2.5 h-2.5 rounded-none bg-[#9b2c2c] border border-black flex-shrink-0 animate-pulse" />
    </div>
  );
};
