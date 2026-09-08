import { describe, it, expect } from 'vitest';
import { EconomyEngine } from '../../../server/economy';

describe('EconomyEngine Unit Tests', () => {
  it('should calculate win payout with 10% arena fee and 90% winner net for 100 stake', () => {
    const calc = EconomyEngine.calculateWinPayout(100);
    expect(calc.stakePerPlayer).toBe(100);
    expect(calc.totalPot).toBe(200);
    expect(calc.arenaFee).toBe(20);
    expect(calc.winnerPayout).toBe(180);
    expect(calc.loserPayout).toBe(0);
  });

  it('should calculate draw refund with 95% refund to each player for 100 stake', () => {
    const calc = EconomyEngine.calculateDrawRefund(100);
    expect(calc.stakePerPlayer).toBe(100);
    expect(calc.totalPot).toBe(200);
    expect(calc.p1Refund).toBe(95);
    expect(calc.p2Refund).toBe(95);
    expect(calc.arenaFee).toBe(10); // 200 - (95 + 95) = 10
  });

  it('should award 150 XP for win, 75 XP for draw, and 30 XP for loss', () => {
    expect(EconomyEngine.calculateXP(true, false)).toBe(150);
    expect(EconomyEngine.calculateXP(false, true)).toBe(75);
    expect(EconomyEngine.calculateXP(false, false)).toBe(30);
  });

  it('should conserve total money for any stake: winnerPayout + arenaFee === totalPot', () => {
    const testStakes = [10, 25, 50, 100, 250, 500, 1000, 5000];
    for (const stake of testStakes) {
      const winCalc = EconomyEngine.calculateWinPayout(stake);
      expect(winCalc.winnerPayout + winCalc.arenaFee).toBe(winCalc.totalPot);

      const drawCalc = EconomyEngine.calculateDrawRefund(stake);
      expect(drawCalc.p1Refund + drawCalc.p2Refund + drawCalc.arenaFee).toBe(drawCalc.totalPot);
    }
  });
});
