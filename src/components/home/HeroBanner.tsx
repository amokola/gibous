import React from 'react';
import { Sparkles, Swords } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';
import { SketchButton } from '../ui/SketchButton';
import { TrophyCupIcon } from '../icons/GameIcons';

interface HeroBannerProps {
  onQuickJoin: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ onQuickJoin }) => {
  return (
    <div className="relative w-full rounded-none bg-[#fff9c4] border-2 sm:border-[2.5px] border-black p-4 sm:p-5 sketch-shadow-lg overflow-hidden select-none my-2">
      {/* Gibous Sticky Corner Badge */}
      <div className="absolute -top-1 -right-1 bg-white border-2 border-black px-3 py-0.5 rounded-none font-sketch text-xs font-bold text-[#1a1a1a] sketch-shadow-xs rotate-1 z-20">
        <span>★ PHASE 1</span>
      </div>

      {/* Duel Serial Stamp */}
      <div className="absolute top-1.5 left-4 font-sketch text-[10px] font-bold text-[#854d0e] tracking-wider uppercase pointer-events-none">
        GIBOUS • SEASON 01 DUEL PASS
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col gap-2.5 pt-1.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-black px-2.5 py-0.5 rounded-none shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-[#ca8a04]" />
            <span className="font-sketch text-xs font-bold text-[#854d0e] uppercase tracking-wide">
              Season 1
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs font-bold text-[#1a1a1a]/70">
            <TrophyCupIcon size={16} />
            <span className="font-sketch">Duel Arenas</span>
          </div>
        </div>

        <div>
          <h2 className="font-sketch text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-wide leading-tight flex items-center gap-2">
            <span>Gibous</span>
            <span className="text-[#9b2c2c] flex items-center gap-1">
              GRAM
              <GramIcon size="sm" />
            </span>
          </h2>
          <p className="text-xs text-[#1a1a1a]/80 font-medium mt-0.5 leading-snug">
            Fast duels. Live ranks. On-chain deposits.
          </p>
        </div>

        {/* Action Button */}
        <div className="pt-1">
          <SketchButton
            variant="primary"
            size="md"
            fullWidth
            icon={<Swords className="w-5 h-5 stroke-[2.5]" />}
            onClick={onQuickJoin}
          >
            Enter Arena
          </SketchButton>
        </div>
      </div>
    </div>
  );
};
