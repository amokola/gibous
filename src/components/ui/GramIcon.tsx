import React from 'react';

interface GramIconProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const GramIcon: React.FC<GramIconProps> = ({
  size = 'md',
  className = '',
}) => {
  const sizeMap = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-7 h-7',
  };

  return (
    <img
      src="/assets/gram_logo.png"
      alt="GRAM"
      className={`inline-block object-contain select-none flex-shrink-0 ${sizeMap[size]} ${className}`}
      draggable={false}
    />
  );
};
