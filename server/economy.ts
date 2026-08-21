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
  devRake?: number; // legacy alias
  winnerPayout: number;
  loserPayout: number;
}

export interface DrawCalculationResult {
  stakePerPlayer: number;
  totalPot: number;
  arenaFee: number;
  devAdminFee?: number; // legacy alias
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
      devRake: breakdown.arenaFee,
      winnerPayout: breakdown.winnerPayout,
      loserPayout: breakdown.loserPayout,
    };
  }

  /**
   * Calculate refunds and fee for a Draw match
   * @param stakePerPlayer Play GRAM amount staked by each player (S)
   */
  static calculateDrawRefund(stakePerPlayer: number): DrawCalculationResult {
    const totalPot = stakePerPlayer * 2;
    // Each player receives 95% of their initial stake
    const p1Refund = Math.floor(stakePerPlayer * (DRAW_REFUND_PERCENT / 100));
    const p2Refund = Math.floor(stakePerPlayer * (DRAW_REFUND_PERCENT / 100));
    // Gibous keeps the remaining fee
    const arenaFee = totalPot - (p1Refund + p2Refund);

    return {
      stakePerPlayer,
      totalPot,
      arenaFee,
      devAdminFee: arenaFee,
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
