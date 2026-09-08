import { describe, it, expect } from 'vitest';
import {
  ARENA_FEE_PERCENT,
  DRAW_REFUND_PERCENT,
  DEFAULT_STAKE_PRESETS,
  calculatePotBreakdown,
} from '../../../shared/constants/economics';

describe('Shared Economics Constants & Math', () => {
  it('should have standard arena fee of 10% and draw refund of 95%', () => {
    expect(ARENA_FEE_PERCENT).toBe(10);
    expect(DRAW_REFUND_PERCENT).toBe(95);
  });

  it('should define expected stake presets', () => {
    expect(DEFAULT_STAKE_PRESETS).toEqual([50, 100, 250, 500, 1000]);
  });

  it('should accurately calculate pot breakdown for standard 100 stake', () => {
    const breakdown = calculatePotBreakdown(100);
    expect(breakdown.stakePerPlayer).toBe(100);
    expect(breakdown.totalPot).toBe(200);
    expect(breakdown.arenaFee).toBe(20); // 10% of 200
    expect(breakdown.winnerPayout).toBe(180); // 200 - 20
    expect(breakdown.loserPayout).toBe(0);
    expect(breakdown.drawRefundPerPlayer).toBe(95); // 95% of 100
  });

  it('should satisfy winnerPayout + arenaFee === totalPot for all preset stakes', () => {
    for (const stake of DEFAULT_STAKE_PRESETS) {
      const b = calculatePotBreakdown(stake);
      expect(b.totalPot).toBe(stake * 2);
      expect(b.winnerPayout + b.arenaFee).toBe(b.totalPot);
      expect(b.loserPayout).toBe(0);
    }
  });

  it('should satisfy drawRefund * 2 + fee <= totalPot for all preset stakes', () => {
    for (const stake of DEFAULT_STAKE_PRESETS) {
      const b = calculatePotBreakdown(stake);
      const totalRefunded = b.drawRefundPerPlayer * 2;
      expect(totalRefunded).toBeLessThanOrEqual(b.totalPot);
    }
  });

  it('should handle zero stake edge case cleanly', () => {
    const breakdown = calculatePotBreakdown(0);
    expect(breakdown.totalPot).toBe(0);
    expect(breakdown.arenaFee).toBe(0);
    expect(breakdown.winnerPayout).toBe(0);
    expect(breakdown.drawRefundPerPlayer).toBe(0);
  });
});
