import React from 'react';

interface StatMetricBoxProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: React.ReactNode;
  badge?: string;
  badgeColor?: string;
  variant?: 'green' | 'blue' | 'yellow' | 'red' | 'paper';
  isHero?: boolean;
}

export const StatMetricBox: React.FC<StatMetricBoxProps> = ({
  label,
  value,
  subtext,
  icon,
  badge,
  badgeColor = 'bg-[#dcfce7] text-[#166534]',
  variant = 'paper',
  isHero = false,
}) => {
  const bgStyles = {
    green: 'bg-[#dcfce7] text-[#166534]',
    blue: 'bg-[#e0f2fe] text-[#1a365d]',
    yellow: 'bg-[#fff9c4] text-[#854d0e]',
    red: 'bg-[#fee2e2] text-[#991b1b]',
    paper: 'bg-white text-[#1a1a1a]',
  };

  return (
    <div
      className={`relative border-2 border-black p-3.5 select-none transition-all sketch-shadow-xs rounded-none ${
        bgStyles[variant]
      } ${isHero ? 'sm:p-5' : ''}`}
    >
      {/* Top Header: Label & Icon */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="font-sketch text-xs font-bold uppercase tracking-wider text-[#1a1a1a]/60">
          {label}
        </span>
        {icon && (
          <div className="p-1 border border-black bg-white rounded-none sketch-shadow-xs">
            {icon}
          </div>
        )}
      </div>

      {/* Main Metric Value */}
      <div className="flex items-baseline gap-2">
        <span
          className={`font-sketch font-bold tracking-tight text-[#1a1a1a] ${
            isHero ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
          }`}
        >
          {value}
        </span>

        {badge && (
          <span
            className={`font-sketch text-[10px] sm:text-xs font-bold border border-black px-1.5 py-0.2 rounded-none ${badgeColor}`}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Subtitle / Context */}
      {subtext && (
        <p className="font-sketch text-[11px] text-[#1a1a1a]/60 mt-0.5">
          {subtext}
        </p>
      )}
    </div>
  );
};
