import React from 'react';
import { Sparkles, ArrowUp, ArrowDown, Dice5 } from 'lucide-react';

interface GameActionTickerProps {
  message?: string;
  type?: 'roll' | 'ladder' | 'snake' | 'info';
}

export const GameActionTicker: React.FC<GameActionTickerProps> = ({
  message = 'Tap dice to roll',
  type = 'info',
}) => {
  const getIcon = () => {
    switch (type) {
      case 'ladder':
        return <ArrowUp className="w-3.5 h-3.5 text-[#166534] stroke-[3]" />;
      case 'snake':
        return <ArrowDown className="w-3.5 h-3.5 text-[#991b1b] stroke-[3]" />;
      case 'roll':
        return <Dice5 className="w-3.5 h-3.5 text-[#1a365d]" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-[#ca8a04]" />;
    }
  };

  const getStyle = () => {
    switch (type) {
      case 'ladder':
        return 'bg-[#dcfce7] text-[#166534] border-[#15803d]/40';
      case 'snake':
        return 'bg-[#fee2e2] text-[#991b1b] border-[#b91c1c]/40';
      case 'roll':
        return 'bg-[#e0f2fe] text-[#1a365d] border-[#1a365d]/40';
      default:
        return 'bg-white text-[#1a1a1a] border-black';
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full flex items-center justify-center my-1 select-none animate-fade-in"
    >
      <div
        className={`px-3 py-1 rounded-none border-2 border-black flex items-center gap-1.5 font-sketch text-xs font-bold tracking-wide sketch-shadow-xs transition-all ${getStyle()}`}
      >
        {getIcon()}
        <span>{message}</span>
      </div>
    </div>
  );
};
