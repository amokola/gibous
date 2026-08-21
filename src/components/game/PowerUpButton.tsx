import React from 'react';
import { PowerUpType } from '../../types/game';
import { Target, Shield, Zap } from 'lucide-react';

interface PowerUpButtonProps {
  type: PowerUpType;
  used: boolean;
  isActive?: boolean;
  disabled?: boolean;
  onActivate: (type: PowerUpType) => void;
}

export const PowerUpButton: React.FC<PowerUpButtonProps> = ({
  type,
  used,
  isActive = false,
  disabled = false,
  onActivate,
}) => {
  const getDetails = () => {
    switch (type) {
      case 'precision':
        return {
          label: 'Lucky 4-6',
          icon: <Target className="w-3.5 h-3.5 text-[#854d0e] stroke-[2.5]" />,
          activeColor: 'bg-[#fff9c4] border-black text-[#854d0e]',
        };
      case 'shield':
        return {
          label: 'Shield',
          icon: <Shield className="w-3.5 h-3.5 text-[#1a365d] stroke-[2.5]" />,
          activeColor: 'bg-[#e0f2fe] border-black text-[#1a365d]',
        };
      case 'doublestep':
        return {
          label: '+2 Steps',
          icon: <Zap className="w-3.5 h-3.5 text-[#166534] stroke-[2.5]" />,
          activeColor: 'bg-[#dcfce7] border-black text-[#166534]',
        };
    }
  };

  const { label, icon, activeColor } = getDetails();

  return (
    <button
      type="button"
      disabled={used || disabled}
      onClick={() => onActivate(type)}
      className={`px-2 py-1 rounded-none border-2 font-sketch text-xs font-bold flex items-center gap-1 transition-all select-none sketch-btn-press ${
        used
          ? 'bg-[#f2efe9] border-black/30 text-[#1a1a1a]/30 opacity-40 cursor-not-allowed line-through'
          : isActive
          ? `${activeColor} sketch-shadow scale-105 ring-2 ring-black`
          : 'bg-white hover:bg-[#fbfaf7] border-black text-[#1a1a1a] sketch-shadow-xs'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};
