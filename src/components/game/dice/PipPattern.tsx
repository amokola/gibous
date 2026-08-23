import React from 'react';

interface PipPatternProps {
  faceNumber: number;
}

export const PipPattern: React.FC<PipPatternProps> = ({ faceNumber }) => {
  const dotClass = 'w-2.5 h-2.5 rounded-full bg-[#1a1a1a] shadow-inner';

  switch (faceNumber) {
    case 1:
      return (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-3.5 h-3.5 rounded-full bg-[#9b2c2c] shadow-inner ring-1 ring-[#7f1d1d]/40" />
        </div>
      );
    case 2:
      return (
        <div className="w-full h-full flex justify-between p-2">
          <div className={dotClass} />
          <div className={`${dotClass} self-end`} />
        </div>
      );
    case 3:
      return (
        <div className="w-full h-full flex justify-between p-2">
          <div className={dotClass} />
          <div className={`${dotClass} self-center`} />
          <div className={`${dotClass} self-end`} />
        </div>
      );
    case 4:
      return (
        <div className="w-full h-full grid grid-cols-2 gap-2 p-2 place-items-center">
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
        </div>
      );
    case 5:
      return (
        <div className="w-full h-full grid grid-cols-3 p-1.5 place-items-center">
          <div className={dotClass} />
          <div />
          <div className={dotClass} />
          <div />
          <div className={dotClass} />
          <div />
          <div className={dotClass} />
          <div />
          <div className={dotClass} />
        </div>
      );
    case 6:
      return (
        <div className="w-full h-full grid grid-cols-2 grid-rows-3 gap-1 p-1.5 place-items-center">
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
          <div className={dotClass} />
        </div>
      );
    default:
      return null;
  }
};
