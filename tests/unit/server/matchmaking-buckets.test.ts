import { describe, it, expect } from 'vitest';
import { WebSocket } from 'ws';
import { MatchmakingQueue, QueuedPlayer } from '../../../server/matchmaking';

describe('MatchmakingQueue Bucket Indexing & Scalability', () => {
  const createMockSocket = (): WebSocket => ({
    readyState: WebSocket.OPEN,
  } as unknown as WebSocket);

  it('matches players instantly in O(1) via gameType:stake buckets', async () => {
    let matchedReservation: any = null;
    const queue = new MatchmakingQueue(async (reservation) => {
      matchedReservation = reservation;
    });

    const p1: QueuedPlayer = {
      telegramId: 101,
      name: 'Player 1',
      gameType: 'snake',
      stake: 100,
      ws: createMockSocket(),
      joinedAt: Date.now(),
    };

    const p2: QueuedPlayer = {
      telegramId: 102,
      name: 'Player 2',
      gameType: 'snake',
      stake: 100,
      ws: createMockSocket(),
      joinedAt: Date.now(),
    };

    const res1 = await queue.enqueue(p1);
    expect(res1.status).toBe('searching');
    expect(queue.size()).toBe(1);

    const res2 = await queue.enqueue(p2);
    expect(res2.status).toBe('matched');
    expect(queue.size()).toBe(0);
    expect(matchedReservation).toBeDefined();
    expect(matchedReservation.p1.telegramId).toBe(101);
    expect(matchedReservation.p2.telegramId).toBe(102);
  });

  it('efficiently isolates non-matching buckets under 500+ queued players with distinct stakes', async () => {
    const queue = new MatchmakingQueue(async () => {});

    // Enqueue 500 snake players with distinct stakes (100 to 600) so they remain searching
    for (let i = 1; i <= 500; i++) {
      await queue.enqueue({
        telegramId: 10000 + i,
        name: `Snake_${i}`,
        gameType: 'snake',
        stake: 100 + i,
        ws: createMockSocket(),
        joinedAt: Date.now(),
      });
    }

    // Enqueue 1 connect4 player at stake 250
    const start = performance.now();
    const result = await queue.enqueue({
      telegramId: 99999,
      name: 'Solo Connect4',
      gameType: 'connect4',
      stake: 250,
      ws: createMockSocket(),
      joinedAt: Date.now(),
    });
    const duration = performance.now() - start;

    expect(result.status).toBe('searching');
    expect(duration).toBeLessThan(10); // Under 10ms thanks to bucket indexing
    expect(queue.size()).toBe(501);
  });

  it('dequeues by WebSocket in O(1)', async () => {
    const queue = new MatchmakingQueue(async () => {});
    const socket = createMockSocket();
    await queue.enqueue({
      telegramId: 5050,
      name: 'Test Socket',
      gameType: 'rps',
      stake: 100,
      ws: socket,
      joinedAt: Date.now(),
    });

    expect(queue.hasPlayer(5050)).toBe(true);
    const dequeued = queue.dequeue(socket);
    expect(dequeued).toBe(true);
    expect(queue.hasPlayer(5050)).toBe(false);
  });
});
