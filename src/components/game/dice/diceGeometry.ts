export const getRotationForValue = (val: number | null, spinCount: number = 0): string => {
  const extraSpins = spinCount * 360;
  const face = val && val >= 1 && val <= 6 ? val : 1;

  switch (face) {
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
