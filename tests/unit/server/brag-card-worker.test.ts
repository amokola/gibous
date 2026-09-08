import { describe, it, expect } from 'vitest';
import { renderBragCard, BragCardData } from '../../../server/bragCardRenderer';

describe('Brag Card Renderer & Thread Isolation', () => {
  const sampleStats: BragCardData = {
    name: 'Alice Champion',
    username: 'alice_winner',
    today: {
      pnl: 450.5,
      roiPercent: 120.5,
      winRate: 85.0,
      wins: 17,
      losses: 3,
      draws: 1,
    },
    currentStreak: 6,
    history: [
      { date: '2026-08-23', pnl: 50 },
      { date: '2026-08-24', pnl: -20 },
      { date: '2026-08-25', pnl: 100 },
      { date: '2026-08-26', pnl: 150 },
      { date: '2026-08-27', pnl: -50 },
      { date: '2026-08-28', pnl: 200 },
      { date: '2026-08-29', pnl: 450.5 },
    ],
    dateLabel: '29 AUG 2026',
  };

  it('renders a valid non-empty JPEG image buffer', async () => {
    const buffer = await renderBragCard(sampleStats);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    // Verify JPEG SOI marker (0xFF, 0xD8)
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
  });

  it('handles concurrent rendering requests safely through the bounded queue', async () => {
    const renders = Array.from({ length: 5 }, () => renderBragCard(sampleStats));
    const results = await Promise.all(renders);

    for (const buf of results) {
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf[0]).toBe(0xff);
      expect(buf[1]).toBe(0xd8);
    }
  });
});
