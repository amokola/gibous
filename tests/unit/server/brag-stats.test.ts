import { describe, expect, it } from 'vitest';
import { buildDailyBragStats, type BragLedgerEntry, type BragUser } from '../../../server/bragStats';

const NOW = new Date('2026-08-23T12:00:00.000Z');

const user: BragUser = {
  telegram_id: 42,
  first_name: 'Ada',
  username: 'ada',
  current_streak: 4,
};

const entry = (
  matchCode: string,
  type: BragLedgerEntry['type'],
  amount: number,
  createdAt: string,
): BragLedgerEntry => ({
  match_code: matchCode,
  type,
  amount,
  created_at: new Date(createdAt),
});

describe('buildDailyBragStats', () => {
  it('calculates today PnL, ROI, record, and win rate from grouped ledger entries', () => {
    const stats = buildDailyBragStats(
      user,
      [
        entry('WIN-1', 'match_stake', -100, '2026-08-23T08:00:00.000Z'),
        entry('WIN-1', 'match_win', 180, '2026-08-23T08:01:00.000Z'),
        entry('LOSS-1', 'match_stake', -50, '2026-08-23T09:00:00.000Z'),
        entry('DRAW-1', 'match_stake', -50, '2026-08-22T08:00:00.000Z'),
        entry('DRAW-1', 'match_draw_refund', 47.5, '2026-08-22T08:01:00.000Z'),
        entry('DEPOSIT-1', 'deposit', 500, '2026-08-23T10:00:00.000Z'),
      ],
      NOW,
    );

    expect(stats.today).toEqual({
      pnl: 30,
      volume: 150,
      roiPercent: 20,
      wins: 1,
      losses: 1,
      draws: 0,
      matches: 2,
      winRate: 50,
    });
    expect(stats.currentStreak).toBe(4);
  });

  it('fills a seven-day PnL series with zero days and groups draws correctly', () => {
    const stats = buildDailyBragStats(
      user,
      [
        entry('WIN-1', 'match_stake', -100, '2026-08-23T08:00:00.000Z'),
        entry('WIN-1', 'match_win', 180, '2026-08-23T08:01:00.000Z'),
        entry('DRAW-1', 'match_stake', -50, '2026-08-22T08:00:00.000Z'),
        entry('DRAW-1', 'match_draw_refund', 47.5, '2026-08-22T08:01:00.000Z'),
        entry('WIN-2', 'match_stake', -25, '2026-08-20T08:00:00.000Z'),
        entry('WIN-2', 'match_win', 45, '2026-08-20T08:01:00.000Z'),
      ],
      NOW,
    );

    expect(stats.history).toEqual([
      { date: '2026-08-17', pnl: 0 },
      { date: '2026-08-18', pnl: 0 },
      { date: '2026-08-19', pnl: 0 },
      { date: '2026-08-20', pnl: 20 },
      { date: '2026-08-21', pnl: 0 },
      { date: '2026-08-22', pnl: -2.5 },
      { date: '2026-08-23', pnl: 80 },
    ]);
  });

  it('does not count a cancelled and refunded duel as a loss', () => {
    const stats = buildDailyBragStats(
      user,
      [
        entry('CANCEL-1', 'match_stake', -100, '2026-08-23T08:00:00.000Z'),
        entry('CANCEL-1', 'match_cancelled_refund', 100, '2026-08-23T08:01:00.000Z'),
      ],
      NOW,
    );

    expect(stats.today).toEqual({
      pnl: 0,
      volume: 0,
      roiPercent: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      matches: 0,
      winRate: 0,
    });
    expect(stats.history.at(-1)).toEqual({ date: '2026-08-23', pnl: 0 });
  });
});
