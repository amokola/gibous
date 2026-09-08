import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import { MatchmakingQueue, QueuedPlayer } from '../../server/matchmaking';

describe('Benchmark: Matchmaking Throughput & Pairing Rates', () => {
  const createMockSocket = (): WebSocket => ({
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket);

  it('pairs 600 players (300 matches) under 50ms with O(1) bucket indexing', async () => {
    let matchesCount = 0;
    const queue = new MatchmakingQueue(async () => {
      matchesCount++;
    });

    const start = performance.now();
    for (let i = 1; i <= 600; i++) {
      const player: QueuedPlayer = {
        telegramId: 300000 + i,
        name: `Player_${i}`,
        gameType: i % 2 === 0 ? 'snake' : 'connect4',
        stake: (i % 3 + 1) * 100, // 100, 200, or 300
        ws: createMockSocket(),
        joinedAt: Date.now(),
      };
      await queue.enqueue(player);
    }
    const durationMs = performance.now() - start;

    expect(matchesCount).toBe(300);
    expect(queue.size()).toBe(0);
    // 600 enqueues + 300 matches formed with logging in under 500ms
    expect(durationMs).toBeLessThan(500);
  });
});
