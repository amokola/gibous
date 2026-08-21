import React from 'react';
import { ShieldCheck } from 'lucide-react';

interface AvatarProps {
  photoUrl?: string;
  name?: string;
  color?: 'green' | 'blue';
  size?: 'sm' | 'md' | 'lg';
  showCheck?: boolean;
  isActive?: boolean;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  photoUrl,
  name = 'Player',
  color = 'green',
  size = 'md',
  showCheck = false,
  isActive = false,
  className = '',
}) => {
  const isP1 = color === 'green';

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base',
  };

  const initial = (name && name[0] ? name[0] : 'P').toUpperCase();

  return (
    <div className={`relative inline-block select-none ${className}`}>
      {/* Avatar Container with solid ink outline (Zero Neon) */}
      <div
        className={`relative rounded-2xl overflow-hidden border-2 border-black flex items-center justify-center font-sketch font-bold transition-all ${
          sizeClasses[size]
        } ${
          isP1
            ? 'bg-[#9b2c2c] text-white'
            : 'bg-[#1a365d] text-white'
        } ${isActive ? 'ring-2 ring-black' : ''}`}
      >
        {photoUrl ? (
          <img
            src={photoUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to initial on image error
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>

      {/* Verified Shield Checkmark */}
      {showCheck && (
        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#fff9c4] border border-black rounded-full flex items-center justify-center text-[#1a1a1a]">
          <ShieldCheck className="w-3 h-3 stroke-[3]" />
        </div>
      )}
    </div>
  );
};
