import React from 'react';

interface SketchCardProps {
  variant?: 'blueprint' | 'emerald' | 'amber' | 'slate' | 'paper';
  shadow?: 'sm' | 'md' | 'lg' | 'none';
  tapeBadge?: string;
  tapeColor?: string;
  serialStamp?: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}

export const SketchCard: React.FC<SketchCardProps> = ({
  variant = 'slate',
  shadow = 'md',
  tapeBadge,
  tapeColor = 'bg-[#fef08a] text-black',
  serialStamp,
  className = '',
  children,
  onClick,
}) => {
  const variantClasses = {
    blueprint: 'bg-blueprint-grid border-black text-[#1a1a1a]',
    emerald: 'bg-emerald-grid border-black text-[#1a1a1a]',
    amber: 'bg-amber-grid border-black text-[#1a1a1a]',
    slate: 'bg-white bg-dot-grid-dark border-black text-[#1a1a1a]',
    paper: 'bg-[#fff9c4] border-black text-[#1a1a1a]',
  };

  const shadowClasses = {
    none: '',
    sm: 'sketch-shadow-sm',
    md: 'sketch-shadow',
    lg: 'sketch-shadow-lg',
  };

  return (
    <div
      onClick={onClick}
      className={`relative rounded-none border-2 sm:border-[2.5px] p-4 sm:p-5 select-none transition-all ${
        variantClasses[variant]
      } ${shadowClasses[shadow]} ${
        onClick ? 'cursor-pointer active:translate-x-[2px] active:translate-y-[2px] active:shadow-none' : ''
      } ${className}`}
    >
      {/* Optional Post-It Tape Badge */}
      {tapeBadge && (
        <div
          className={`absolute -top-1.5 -right-1.5 border-2 border-black px-2.5 py-0.5 rounded-none font-sketch text-xs font-bold sketch-shadow-xs rotate-1 z-20 ${tapeColor}`}
        >
          <span>{tapeBadge}</span>
        </div>
      )}

      {/* Optional Blueprint Serial Stamp */}
      {serialStamp && (
        <div className="absolute top-1.5 left-4 font-sketch text-[10px] font-bold text-[#1a365d]/50 tracking-wider uppercase pointer-events-none">
          {serialStamp}
        </div>
      )}

      <div className="relative z-10">{children}</div>
    </div>
  );
};
