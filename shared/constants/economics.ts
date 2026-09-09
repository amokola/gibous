/**
 * Gibous Duel Arena Economics & Stake Rules
 * Shared between Frontend and Server
 */

export const ARENA_FEE_PERCENT = 10;
export const DRAW_REFUND_PERCENT = 95;
export const DEFAULT_STAKE_PRESETS = [0.5, 1, 2, 5, 10] as const;
export const MIN_STAKE = 0.5;
export const MAX_STAKE = 10_000;
export const STAKE_INCREMENT = 0.5;

export interface PotBreakdown {
  stakePerPlayer: number;
  totalPot: number;
  arenaFee: number;
  winnerPayout: number;
  loserPayout: number;
  drawRefundPerPlayer: number;
}

/**
 * Calculate the pot breakdown for a duel
 * @param stakePerPlayer Play GRAM amount staked by each player (S)
 */
export function calculatePotBreakdown(stakePerPlayer: number): PotBreakdown {
  const totalPot = Number((stakePerPlayer * 2).toFixed(9));
  const arenaFee = Number((totalPot * (ARENA_FEE_PERCENT / 100)).toFixed(9));
  const winnerPayout = Number((totalPot - arenaFee).toFixed(9));
  const loserPayout = 0;
  const drawRefundPerPlayer = Number((stakePerPlayer * (DRAW_REFUND_PERCENT / 100)).toFixed(9));

  return {
    stakePerPlayer,
    totalPot,
    arenaFee,
    winnerPayout,
    loserPayout,
    drawRefundPerPlayer,
  };
}
