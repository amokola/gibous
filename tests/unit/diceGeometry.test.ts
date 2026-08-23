import { describe, it, expect } from 'vitest';
import { getRotationForValue } from '../../src/components/game/dice/diceGeometry';

describe('diceGeometry unit tests', () => {
  it('returns identity rotation for face 1 without extra spins', () => {
    const rotation = getRotationForValue(1, 0);
    expect(rotation).toBe('rotateX(0deg) rotateY(0deg)');
  });

  it('returns correct 3D angles for faces 1 through 6', () => {
    expect(getRotationForValue(1, 0)).toBe('rotateX(0deg) rotateY(0deg)');
    expect(getRotationForValue(2, 0)).toBe('rotateX(-90deg) rotateY(0deg)');
    expect(getRotationForValue(3, 0)).toBe('rotateX(0deg) rotateY(-90deg)');
    expect(getRotationForValue(4, 0)).toBe('rotateX(0deg) rotateY(90deg)');
    expect(getRotationForValue(5, 0)).toBe('rotateX(90deg) rotateY(0deg)');
    expect(getRotationForValue(6, 0)).toBe('rotateX(0deg) rotateY(180deg)');
  });

  it('accumulates multi-turn full spins forward without rewinding', () => {
    const rotationWithSpins = getRotationForValue(3, 2); // 2 full spins = 720deg
    expect(rotationWithSpins).toBe('rotateX(720deg) rotateY(630deg)');
  });

  it('falls back safely to face 1 rotation when value is null', () => {
    expect(getRotationForValue(null, 1)).toBe('rotateX(360deg) rotateY(360deg)');
  });
});
