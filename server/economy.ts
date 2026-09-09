/**
 * Gibous Protocol Economy & Arena Fee Calculations
 * Server-authoritative economy engine using shared economic rules
 */

import {
  ARENA_FEE_PERCENT,
  DRAW_REFUND_PERCENT,
  calculatePotBreakdown,
  PotBreakdown,
} from '../shared/constants/economics';

export interface PotCalculationResult {
  stakePerPlayer: number;
  totalPot: number;
  arenaFee: number;
  winnerPayout: number;
  loserPayout: number;
}

export interface DrawCalculationResult {
  stakePerPlayer: number;
  totalPot: number;
  arenaFee: number;
  p1Refund: number;
  p2Refund: number;
}

export class EconomyEngine {
  /**
   * Calculate payouts for a normal Win/Loss match
   * @param stakePerPlayer Play GRAM amount staked by each player (S)
   */
  static calculateWinPayout(stakePerPlayer: number): PotCalculationResult {
    const breakdown: PotBreakdown = calculatePotBreakdown(stakePerPlayer);

    return {
      stakePerPlayer: breakdown.stakePerPlayer,
      totalPot: breakdown.totalPot,
      arenaFee: breakdown.arenaFee,
      winnerPayout: breakdown.winnerPayout,
      loserPayout: breakdown.loserPayout,
    };
  }

  /**
   * Calculate refunds and fee for a Draw match
   * @param stakePerPlayer Play GRAM amount staked by each player (S)
   */
  static calculateDrawRefund(stakePerPlayer: number): DrawCalculationResult {
    const totalPot = Number((stakePerPlayer * 2).toFixed(9));
    // Each player receives 95% of their initial stake
    const p1Refund = Number((stakePerPlayer * (DRAW_REFUND_PERCENT / 100)).toFixed(9));
    const p2Refund = Number((stakePerPlayer * (DRAW_REFUND_PERCENT / 100)).toFixed(9));
    // Gibous keeps the remaining fee
    const arenaFee = Number((totalPot - (p1Refund + p2Refund)).toFixed(9));

    return {
      stakePerPlayer,
      totalPot,
      arenaFee,
      p1Refund,
      p2Refund,
    };
  }

  /**
   * Calculate experience points gained from a match
   */
  static calculateXP(isWinner: boolean, isDraw: boolean): number {
    if (isWinner) return 150;
    if (isDraw) return 75;
    return 30; // Participation XP
  }
}
