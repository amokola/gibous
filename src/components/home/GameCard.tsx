import React from 'react';
import { GameTitle } from '../../types/game';
import { GramIcon } from '../ui/GramIcon';
import { Play } from 'lucide-react';

interface GameCardProps {
  game: GameTitle;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  playersCount?: number;
  minStake: number;
  icon: React.ReactNode;
  bgClass: string;
  onPlay: (game: GameTitle) => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  title,
  subtitle,
  badge,
  badgeColor,
  playersCount,
  minStake,
  icon,
  bgClass,
  onPlay,
}) => {
  return (
    <div
      onClick={() => onPlay(game)}
      className={`relative w-full rounded-none p-4 sm:p-5 border-2 sm:border-[2.5px] border-black transition-all duration-150 cursor-pointer select-none overflow-hidden active:translate-x-[2px] active:translate-y-[2px] active:shadow-none sketch-shadow hover:sketch-shadow-lg group ${bgClass}`}
    >
      <div className="relative z-10 flex items-center justify-between">
        {/* Left Info */}
        <div className="flex items-center gap-3.5">
          {/* Icon Box with 2px border & sharp corners */}
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-none bg-[#f2efe9] border-2 border-black flex items-center justify-center p-1 sketch-shadow-xs group-hover:scale-105 transition-transform duration-150 flex-shrink-0">
            {icon}
          </div>

          <div className="flex flex-col">
            {/* Tag Badge */}
            <div className="flex items-center gap-2 mb-1">
              <span className={`font-sketch text-xs font-bold px-2 py-0.5 rounded-none border border-black sketch-shadow-xs ${badgeColor}`}>
                {badge}
              </span>
              {typeof playersCount === 'number' && (
                <div className="flex items-center gap-1.5 text-[10px] text-[#1a1a1a]/60 font-semibold font-sketch">
                  <span className="w-2 h-2 rounded-none bg-[#15803d] inline-block animate-pulse" />
                  <span>{playersCount.toLocaleString()} in Arena</span>
                </div>
              )}
            </div>

            {/* Title & Subtitle */}
            <h3 className="font-sketch text-xl sm:text-2xl font-bold text-[#1a1a1a] tracking-wide leading-tight group-hover:text-[#9b2c2c] transition-colors">
              {title}
            </h3>
            <span className="text-[11px] text-[#1a1a1a]/70 font-medium -mt-0.5 font-sketch">
              {subtitle}
            </span>

            {/* Stakes preview */}
            <div className="flex items-center gap-1.5 mt-1 font-bold">
              <span className="text-[11px] text-[#1a1a1a]/60 font-medium font-sketch">Stakes:</span>
              <span className="font-sketch text-base text-[#1a365d]">{minStake} - 1,000</span>
              <GramIcon size="sm" />
            </div>
          </div>
        </div>

        {/* Right Play Action Button (Sharp Rectangular 3D Neo-Brutalist Trigger) */}
        <button
          type="button"
          aria-label={`Play ${title}`}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-none bg-[#9b2c2c] group-hover:bg-[#b91c1c] text-white border-2 border-black flex items-center justify-center sketch-shadow group-hover:scale-105 transition-all duration-150 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <Play className="w-5 h-5 fill-white stroke-white ml-0.5" />
        </button>
      </div>
    </div>
  );
};
