import React, { useState, useEffect } from 'react';
import { Dices } from 'lucide-react';
import { PlayerId } from '../../types/game';
import { DiceFace } from './dice/DiceFace';
import { getRotationForValue } from './dice/diceGeometry';

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

  // Increment spin accumulator on every roll so the die spins forward
  useEffect(() => {
    if (isRolling) {
      setSpinCount((prev) => prev + 2);
    }
  }, [isRolling]);

  const currentTransform = getRotationForValue(value, spinCount);

  return (
    <div className="flex flex-col items-center select-none">
      {/* 3D Perspective Stage Container */}
      <div
        className="perspective-container relative w-16 h-16 sm:w-18 sm:h-18 flex items-center justify-center cursor-pointer my-1"
        onClick={() => {
          if (canRoll && !isRolling) onRoll();
        }}
        data-testid="dice-3d-stage"
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
          <DiceFace faceNumber={1} />
          <DiceFace faceNumber={6} />
          <DiceFace faceNumber={3} />
          <DiceFace faceNumber={4} />
          <DiceFace faceNumber={2} />
          <DiceFace faceNumber={5} />
        </div>

        {/* Dynamic Physical Ground Shadow */}
        <div
          className={`absolute -bottom-2 w-12 h-2.5 bg-black/30 rounded-full blur-[1.5px] transition-all pointer-events-none ${
            isRolling ? 'animate-shadow-pulse' : 'scale-100 opacity-30'
          }`}
        />
      </div>

      {/* Turn Badge / Action CTA */}
      <div className="mt-1.5 flex flex-col items-center gap-1">
        {canRoll && !isRolling ? (
          <button
            type="button"
            onClick={onRoll}
            className="flex items-center gap-1.5 px-3.5 py-1 bg-[#9b2c2c] hover:bg-[#802222] text-white border-2 border-black rounded-none font-sketch text-xs sm:text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all cursor-pointer"
          >
            <Dices className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>TAP TO ROLL</span>
          </button>
        ) : (
          <span
            className={`font-sketch text-xs sm:text-sm font-bold tracking-wide px-3 py-0.5 rounded-none border-2 border-black sketch-shadow-xs transition-all ${
              isRolling
                ? 'bg-[#fff9c4] text-[#854d0e] animate-pulse'
                : isP1
                ? 'bg-[#fff9c4] text-[#854d0e]'
                : 'bg-[#e0f2fe] text-[#1a365d]'
            }`}
          >
            {isRolling ? 'Rolling 3D Die...' : statusText || (isP1 ? 'Player 1 Turn' : "Opponent's Turn")}
          </span>
        )}
      </div>
    </div>
  );
};
