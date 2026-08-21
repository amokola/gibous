import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { X, Sparkles } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';
import { SketchButton } from '../ui/SketchButton';
import { GiftRewardIcon } from '../icons/GameIcons';
import { useSoundEffects } from '../../hooks/useSoundEffects';

interface DailyBonusModalProps {
  onClaim: (amount: number) => void;
  onClose: () => void;
}

export const DailyBonusModal: React.FC<DailyBonusModalProps> = ({ onClaim, onClose }) => {
  const [claimed, setClaimed] = useState(false);
  const sounds = useSoundEffects();

  const handleClaim = () => {
    if (claimed) return;
    setClaimed(true);
    sounds.playVictory();
    
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.6 },
    });

    onClaim(100);
    setTimeout(() => {
      onClose();
    }, 1600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="w-full max-w-[360px] bg-[#fbfaf7] bg-dot-grid-dark border-3 border-black rounded-3xl p-6 sketch-shadow-lg flex flex-col items-center relative text-center text-[#1a1a1a]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-xl bg-white hover:bg-[#f2efe9] border-2 border-black text-[#1a1a1a] sketch-shadow-xs active:scale-95"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 4real Stamped Gift Icon with Handcrafted Vector SVG */}
        <div className="w-20 h-20 rounded-3xl bg-[#fff9c4] border-3 border-black flex items-center justify-center sketch-shadow-lg my-3 animate-bounce-subtle">
          <GiftRewardIcon size={48} />
        </div>

        <h3 className="font-sketch text-3xl font-bold text-[#1a1a1a] mt-1">Daily Reward</h3>
        <p className="text-xs text-[#1a1a1a]/70 mt-1 max-w-[240px] font-sketch">
          Claim your daily free Play GRAM bonus to enter matches and boost your pot!
        </p>

        {/* Reward Value Badge */}
        <div className="my-4 px-6 py-3 rounded-2xl bg-white border-2 border-black flex items-center gap-2 sketch-shadow">
          <Sparkles className="w-5 h-5 text-[#ca8a04] fill-[#ca8a04]" />
          <span className="font-sketch text-4xl font-bold text-[#166534]">+100</span>
          <GramIcon size="md" />
        </div>

        {/* Claim Action Button */}
        <div className="w-full">
          <SketchButton
            variant={claimed ? 'dark' : 'primary'}
            size="lg"
            fullWidth
            onClick={handleClaim}
            disabled={claimed}
          >
            {claimed ? 'Claimed +100 Play GRAM!' : 'Claim Free Reward'}
          </SketchButton>
        </div>
      </div>
    </div>
  );
};
