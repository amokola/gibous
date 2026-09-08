import { describe, expect, it } from 'vitest';
import { renderBragCard } from '../../../server/bragCardRenderer';

describe('renderBragCard', () => {
  it('returns a non-empty JPEG for the Telegram media message', async () => {
    const image = await renderBragCard({
      name: 'Ada',
      username: 'ada',
      dateLabel: '23 AUG 2026',
      today: {
        pnl: 80,
        volume: 100,
        roiPercent: 80,
        wins: 1,
        losses: 0,
        draws: 0,
        matches: 1,
        winRate: 100,
      },
      currentStreak: 4,
      history: [
        { date: '2026-08-17', pnl: 0 },
        { date: '2026-08-18', pnl: 10 },
        { date: '2026-08-19', pnl: -5 },
        { date: '2026-08-20', pnl: 20 },
        { date: '2026-08-21', pnl: 0 },
        { date: '2026-08-22', pnl: 15 },
        { date: '2026-08-23', pnl: 80 },
      ],
    });

    expect(Buffer.isBuffer(image)).toBe(true);
    expect(image.byteLength).toBeGreaterThan(1_000);
    expect([...image.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  });
});
