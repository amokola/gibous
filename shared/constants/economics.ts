/**
 * Gibous Duel Arena Economics & Stake Rules
 * Shared between Frontend and Server
 */

export const ARENA_FEE_PERCENT = 10;
export const DRAW_REFUND_PERCENT = 95;
export const DEFAULT_STAKE_PRESETS = [50, 100, 250, 500, 1000] as const;

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
  const totalPot = stakePerPlayer * 2;
  const arenaFee = Math.floor(totalPot * (ARENA_FEE_PERCENT / 100));
  const winnerPayout = totalPot - arenaFee;
  const loserPayout = 0;
  const drawRefundPerPlayer = Math.floor(stakePerPlayer * (DRAW_REFUND_PERCENT / 100));

  return {
    stakePerPlayer,
    totalPot,
    arenaFee,
    winnerPayout,
    loserPayout,
    drawRefundPerPlayer,
  };
}
