import React from 'react';
import { Swords } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';
import { SketchButton } from '../ui/SketchButton';

interface HeroBannerProps {
  onQuickJoin: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({ onQuickJoin }) => {
  return (
    <div className="relative flex min-h-44 sm:min-h-48 w-full flex-col rounded-none bg-game-note-yellow border-2 sm:border-[2.5px] border-black p-4 sm:p-5 sketch-shadow-lg overflow-hidden select-none my-2">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src="/assets/gibous-watercolor-watermark.webp"
          alt=""
          draggable={false}
          className="absolute -right-8 top-1/2 w-40 -translate-y-1/2 opacity-10 mix-blend-multiply select-none sm:w-48 sm:opacity-20"
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-1 flex-col justify-between gap-2.5">
        <div>
          <h2 className="font-sketch text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-wide leading-tight flex items-center gap-2">
            <span>Gibous</span>
            <span className="text-[#9b2c2c] flex items-center gap-1">
              Earn GRAM
              <GramIcon size="sm" />
            </span>
          </h2>
          <p className="text-xs text-[#1a1a1a]/80 font-medium mt-0.5 leading-snug">
            Fast duels. PVP.
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
