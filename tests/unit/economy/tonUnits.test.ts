import { describe, it, expect } from 'vitest';
import { toNanoGram, fromNanoGram, formatGram } from '../../../src/utils/tonUnits';

describe('TON / GRAM Unit Conversion Utilities', () => {
  it('converts GRAM amounts to nanograms accurately', () => {
    expect(toNanoGram(1)).toBe('1000000000');
    expect(toNanoGram(0.5)).toBe('500000000');
    expect(toNanoGram(0.1)).toBe('100000000');
    expect(toNanoGram(0.01)).toBe('10000000');
    expect(toNanoGram(2.45)).toBe('2450000000');
    expect(toNanoGram(0)).toBe('0');
  });

  it('converts nanograms back to GRAM amounts accurately', () => {
    expect(fromNanoGram('1000000000')).toBe(1);
    expect(fromNanoGram('500000000')).toBe(0.5);
    expect(fromNanoGram('100000000')).toBe(0.1);
    expect(fromNanoGram(2450000000n)).toBe(2.45);
    expect(fromNanoGram('0')).toBe(0);
  });

  it('formats GRAM values for clean UI presentation', () => {
    expect(formatGram(1)).toBe('1.00');
    expect(formatGram(0.5)).toBe('0.50');
    expect(formatGram(2.456, 2)).toBe('2.46');
    expect(formatGram(1000)).toBe('1,000.00');
  });

  it('handles negative or invalid values gracefully', () => {
    expect(toNanoGram(-1)).toBe('0');
    expect(fromNanoGram('-500')).toBe(0);
    expect(fromNanoGram('invalid')).toBe(0);
  });
});
