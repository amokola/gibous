import { describe, it } from 'vitest';
import fc from 'fast-check';
import { EconomyEngine } from '../../server/economy';

describe('Economy Invariants (Property-Based Tests via fast-check)', () => {
  it('Property: Total pot is conserved exactly in win settlement (winnerPayout + arenaFee === 2 * stake)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (stake) => {
        const win = EconomyEngine.calculateWinPayout(stake);
        return win.winnerPayout + win.arenaFee === win.totalPot && win.totalPot === stake * 2;
      })
    );
  });

  it('Property: Total pot is conserved exactly in draw settlement (p1Refund + p2Refund + arenaFee === 2 * stake)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (stake) => {
        const draw = EconomyEngine.calculateDrawRefund(stake);
        return (
          draw.p1Refund + draw.p2Refund + draw.arenaFee === draw.totalPot &&
          draw.totalPot === stake * 2
        );
      })
    );
  });

  it('Property: All payouts and fees are strictly non-negative', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (stake) => {
        const win = EconomyEngine.calculateWinPayout(stake);
        const draw = EconomyEngine.calculateDrawRefund(stake);

        return (
          win.winnerPayout >= 0 &&
          win.arenaFee >= 0 &&
          draw.p1Refund >= 0 &&
          draw.p2Refund >= 0 &&
          draw.arenaFee >= 0
        );
      })
    );
  });
});
