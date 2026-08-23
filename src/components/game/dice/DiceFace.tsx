import React from 'react';
import { PipPattern } from './PipPattern';
import { DICE_FACE_OFFSET_PX } from './constants';

interface DiceFaceProps {
  faceNumber: 1 | 2 | 3 | 4 | 5 | 6;
}

const getFaceTransform = (face: number, offset: number) => {
  switch (face) {
    case 1:
      return `translateZ(${offset}px)`;
    case 2:
      return `rotateX(90deg) translateZ(${offset}px)`;
    case 3:
      return `rotateY(90deg) translateZ(${offset}px)`;
    case 4:
      return `rotateY(-90deg) translateZ(${offset}px)`;
    case 5:
      return `rotateX(-90deg) translateZ(${offset}px)`;
    case 6:
      return `rotateY(180deg) translateZ(${offset}px)`;
    default:
      return `translateZ(${offset}px)`;
  }
};

export const DiceFace: React.FC<DiceFaceProps> = ({ faceNumber }) => {
  return (
    <div
      className="absolute inset-0 bg-[#ffffff] border-2 border-black rounded-none flex items-center justify-center backface-hidden shadow-inner select-none"
      style={{ transform: getFaceTransform(faceNumber, DICE_FACE_OFFSET_PX) }}
      data-testid={`dice-face-${faceNumber}`}
    >
      <PipPattern faceNumber={faceNumber} />
    </div>
  );
};
