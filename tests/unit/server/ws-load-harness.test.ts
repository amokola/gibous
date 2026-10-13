import { describe, expect, it } from 'vitest';
import { percentile } from '../../../scripts/ws-load-harness';

describe('WebSocket load harness statistics', () => {
  it('calculates nearest-rank percentiles without mutating input', () => {
    const samples = [9, 1, 5, 3, 7];

    expect(percentile(samples, 50)).toBe(5);
    expect(percentile(samples, 95)).toBe(9);
    expect(samples).toEqual([9, 1, 5, 3, 7]);
  });

  it('returns null when no command responses were measured', () => {
    expect(percentile([], 95)).toBeNull();
  });
});
