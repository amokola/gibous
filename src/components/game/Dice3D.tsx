import React, { useState, useEffect } from 'react';
import { PlayerId } from '../../types/game';

interface Dice3DProps {
  value: number | null;
  isRolling: boolean;
  activePlayer: PlayerId;
  canRoll: boolean;
  statusText?: string;
  onRoll: () => void;
}

export const Dice3D: React.FC<Dice3DProps> = ({
  value,
  isRolling,
  activePlayer,
  canRoll,
  statusText,
  onRoll,
}) => {
  const isP1 = activePlayer === 'p1';
  const [spinCount, setSpinCount] = useState(0);

  // Increment spin accumulator on every roll so the die spins multiple full 3D rotations
  useEffect(() => {
    if (isRolling) {
      setSpinCount(prev => prev + 2);
    }
  }, [isRolling]);

  // Compute final resting 3D rotation angles for target face 1..6
  const getTransformForValue = (val: number | null) => {
    const extraSpins = spinCount * 360;
    switch (val) {
      case 1: // Front
        return `rotateX(${extraSpins}deg) rotateY(${extraSpins}deg)`;
      case 2: // Top
        return `rotateX(${-90 + extraSpins}deg) rotateY(${extraSpins}deg)`;
      case 3: // Right
        return `rotateX(${extraSpins}deg) rotateY(${-90 + extraSpins}deg)`;
      case 4: // Left
        return `rotateX(${extraSpins}deg) rotateY(${90 + extraSpins}deg)`;
      case 5: // Bottom
        return `rotateX(${90 + extraSpins}deg) rotateY(${extraSpins}deg)`;
      case 6: // Back
        return `rotateX(${extraSpins}deg) rotateY(${180 + extraSpins}deg)`;
      default:
        return `rotateX(${extraSpins}deg) rotateY(${extraSpins}deg)`;
    }
  };

  const currentTransform = getTransformForValue(value || 1);

  // Render solid ink black pips for each 3D face
  const renderFacePips = (faceNumber: number) => {
    const dotClass = "w-2.5 h-2.5 rounded-full bg-[#1a1a1a]";

    switch (faceNumber) {
      case 1:
        return (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-3.5 h-3.5 rounded-full bg-[#9b2c2c]" />
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

  const faceStyleBase =
    "absolute inset-0 bg-[#ffffff] border-2 border-black rounded-none flex items-center justify-center backface-hidden shadow-inner select-none";

  return (
    <div className="flex flex-col items-center select-none">
      {/* 3D Perspective Stage Container */}
      <div
        className="perspective-container relative w-16 h-16 sm:w-18 sm:h-18 flex items-center justify-center cursor-pointer my-1"
        onClick={() => {
          if (canRoll && !isRolling) onRoll();
        }}
      >
        {/* Physical 3D Cube */}
        <div
          className={`relative w-14 h-14 sm:w-14 sm:h-14 dice-cube-3d ${
            isRolling ? 'animate-dice-roll-3d' : ''
          }`}
          style={{
            transform: isRolling ? undefined : currentTransform,
          }}
        >
          {/* Face 1 (Front) -> translateZ(28px) */}
          <div
            className={faceStyleBase}
            style={{ transform: 'translateZ(28px)' }}
          >
            {renderFacePips(1)}
          </div>

          {/* Face 6 (Back) -> rotateY(180deg) translateZ(28px) */}
          <div
            className={faceStyleBase}
            style={{ transform: 'rotateY(180deg) translateZ(28px)' }}
          >
            {renderFacePips(6)}
          </div>

          {/* Face 3 (Right) -> rotateY(90deg) translateZ(28px) */}
          <div
            className={faceStyleBase}
            style={{ transform: 'rotateY(90deg) translateZ(28px)' }}
          >
            {renderFacePips(3)}
          </div>

          {/* Face 4 (Left) -> rotateY(-90deg) translateZ(28px) */}
          <div
            className={faceStyleBase}
            style={{ transform: 'rotateY(-90deg) translateZ(28px)' }}
          >
            {renderFacePips(4)}
          </div>

          {/* Face 2 (Top) -> rotateX(90deg) translateZ(28px) */}
          <div
            className={faceStyleBase}
            style={{ transform: 'rotateX(90deg) translateZ(28px)' }}
          >
            {renderFacePips(2)}
          </div>

          {/* Face 5 (Bottom) -> rotateX(-90deg) translateZ(28px) */}
          <div
            className={faceStyleBase}
            style={{ transform: 'rotateX(-90deg) translateZ(28px)' }}
          >
            {renderFacePips(5)}
          </div>
        </div>

        {/* Dynamic Physical Ground Shadow */}
        <div
          className={`absolute -bottom-2 w-12 h-2.5 bg-black/30 rounded-full blur-[1.5px] transition-all pointer-events-none ${
            isRolling ? 'animate-shadow-pulse' : 'scale-100 opacity-30'
          }`}
        />
      </div>

      {/* Chunky Roll Action CTA & Turn Badge */}
      <div className="mt-2.5 flex flex-col items-center gap-1">
        {canRoll && !isRolling ? (
          <button
            type="button"
            onClick={onRoll}
            className="px-4 py-1.5 bg-[#9b2c2c] hover:bg-[#802222] text-white border-2 border-black rounded-none font-sketch text-xs sm:text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all"
          >
            🎲 TAP TO ROLL
          </button>
        ) : (
          <span
            className={`font-sketch text-xs sm:text-sm font-bold tracking-wide px-3 py-1 rounded-none border-2 border-black sketch-shadow-xs ${
              isRolling
                ? 'bg-[#fff9c4] text-[#854d0e] animate-pulse'
                : isP1
                ? 'bg-[#fff9c4] text-[#854d0e]'
                : 'bg-[#e0f2fe] text-[#1a365d]'
            }`}
          >
            {isRolling ? '🎲 Rolling 3D Die...' : statusText || (isP1 ? 'Your Turn' : "Opponent's Turn")}
          </span>
        )}
      </div>
    </div>
  );
};
