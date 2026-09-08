import { describe, expect, it } from 'vitest';
import { gramsToNano, integerGramsToNano, nanoToGrams } from '../../../server/money';

describe('server monetary base units', () => {
  it('round-trips supported decimal GRAM values through exact nanograms', () => {
    expect(gramsToNano(0.1)).toBe('100000000');
    expect(gramsToNano(2.45)).toBe('2450000000');
    expect(nanoToGrams('2450000000')).toBe(2.45);
    expect(integerGramsToNano(100)).toBe('100000000000');
  });

  it('rejects invalid monetary input rather than silently changing value', () => {
    expect(() => gramsToNano(Number.NaN)).toThrow('Invalid monetary amount');
    expect(() => integerGramsToNano(0.5)).toThrow('Invalid integer monetary amount');
  });
});
