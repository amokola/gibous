import React from 'react';
import { RPSChoice } from '../../types/game';
import { RPS_CHOICES } from '../../config/rpsConfig';
import { RockIcon, PaperIcon, ScissorsIcon } from '../icons/GameIcons';

interface RPSCardProps {
  choice: RPSChoice;
  isSelected: boolean;
  disabled: boolean;
  onSelect: (choice: RPSChoice) => void;
}

export const RPSCard: React.FC<RPSCardProps> = ({
  choice,
  isSelected,
  disabled,
  onSelect,
}) => {
  const config = RPS_CHOICES[choice];

  const renderIcon = () => {
    switch (choice) {
      case 'rock':
        return <RockIcon size={44} className="transition-transform duration-150 group-hover:scale-110" />;
      case 'paper':
        return <PaperIcon size={44} className="transition-transform duration-150 group-hover:scale-110" />;
      case 'scissors':
        return <ScissorsIcon size={44} className="transition-transform duration-150 group-hover:scale-110" />;
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(choice)}
      className={`group relative flex-1 py-3 px-2 rounded-2xl bg-white border-2.5 border-black transition-all duration-150 flex flex-col items-center justify-center select-none disabled:opacity-40 disabled:pointer-events-none sketch-btn-press ${
        isSelected
          ? 'bg-[#fff9c4] border-black sketch-shadow scale-105 ring-2 ring-black'
          : 'hover:bg-[#fbfaf7] sketch-shadow-xs hover:sketch-shadow'
      }`}
    >
      {/* Custom Vector Icon */}
      <div className="mb-1 flex items-center justify-center">
        {renderIcon()}
      </div>

      {/* Label in Cabin Sketch */}
      <span className="font-sketch text-base sm:text-lg font-bold text-[#1a1a1a] tracking-wider">
        {config.label}
      </span>

      {/* Subtitle description */}
      <span className="text-[10px] text-[#1a1a1a]/60 font-semibold font-sketch mt-0.5">
        {config.description}
      </span>

      {/* Active Indicator Pip */}
      {isSelected && (
        <span
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full border-2 border-black animate-ping"
          style={{ backgroundColor: config.color }}
        />
      )}
    </button>
  );
};
