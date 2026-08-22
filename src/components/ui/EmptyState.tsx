import React from 'react';
import { Swords } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionText,
  onAction,
  className = '',
}) => {
  return (
    <div
      className={`p-6 bg-white border-2 border-black rounded-none text-center sketch-shadow-xs flex flex-col items-center justify-center ${className}`.trim()}
    >
      <div className="mb-2 text-[#1a1a1a]/40">
        {icon || <Swords className="w-8 h-8 mx-auto" />}
      </div>
      <span className="font-sketch text-sm font-bold text-[#1a1a1a] block">
        {title}
      </span>
      {description && (
        <p className="font-sketch text-xs text-[#1a1a1a]/60 mt-0.5 max-w-[240px]">
          {description}
        </p>
      )}
      {actionText && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-3 px-4 py-1.5 bg-[#9b2c2c] hover:bg-[#802222] text-white border-2 border-black font-sketch text-xs font-bold sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] transition-transform cursor-pointer"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
