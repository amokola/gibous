import React from 'react';
import { GameBadge } from '../ui/GameBadge';

interface GameMasteryRowProps {
  snakesRecord: { wins: number; losses: number; pnl: number };
  connect4Record: { wins: number; losses: number; pnl: number };
  rpsRecord: { wins: number; losses: number; pnl: number };
}

export const GameMasteryRow: React.FC<GameMasteryRowProps> = ({
  snakesRecord,
  connect4Record,
  rpsRecord,
}) => {
  const games = [
    {
      title: 'Snakes & Ladders',
      icon: <GameBadge game="snake" size="sm" />,
      iconBg: 'bg-[#dcfce7]',
      stats: snakesRecord,
    },
    {
      title: 'Four in a Row',
      icon: <GameBadge game="connect4" size="sm" />,
      iconBg: 'bg-[#e0f2fe]',
      stats: connect4Record,
    },
    {
      title: 'Rock Paper Scissors',
      icon: <GameBadge game="rps" size="sm" />,
      iconBg: 'bg-[#fff9c4]',
      stats: rpsRecord,
    },
  ];

  return (
    <div className="w-full flex flex-col gap-1.5 select-none">
      <div className="flex items-center justify-between">
        <span className="font-sketch text-xs font-bold uppercase tracking-wider text-[#1a1a1a]/60">
          Discipline Mastery
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {games.map((g) => {
          const total = g.stats.wins + g.stats.losses;
          const winRate = total > 0 ? Math.round((g.stats.wins / total) * 100) : 0;
          const isProfit = g.stats.pnl >= 0;

          return (
            <div
              key={g.title}
              className="bg-white border-2 border-black p-3 sketch-shadow-xs flex flex-col justify-between rounded-none"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 ${g.iconBg} border border-black flex items-center justify-center p-0.5 rounded-none flex-shrink-0`}>
                  {g.icon}
                </div>
                <div className="overflow-hidden">
                  <h5 className="font-sketch text-sm font-bold text-[#1a1a1a] truncate leading-tight">
                    {g.title}
                  </h5>
                  <span className="font-sketch text-[10px] text-[#1a1a1a]/60">
                    {total === 0 ? 'No matches played' : `${winRate}% Win Rate (${g.stats.wins}W / ${g.stats.losses}L)`}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-black/10">
                <span className="text-[10px] font-bold font-sketch text-[#1a1a1a]/60 uppercase">
                  Net PnL
                </span>
                <span
                  className={`font-sketch text-sm font-bold ${
                    isProfit ? 'text-[#166534]' : 'text-[#991b1b]'
                  }`}
                >
                  {isProfit ? `+${g.stats.pnl}` : g.stats.pnl} GRAM
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
