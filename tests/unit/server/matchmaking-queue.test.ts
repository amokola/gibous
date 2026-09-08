import { describe, it, expect, vi } from 'vitest';
import { MatchmakingQueue, QueuedPlayer, MatchReservation } from '../../../server/matchmaking';
import { WebSocket } from 'ws';

describe('MatchmakingQueue Unit Tests', () => {
  const createMockSocket = (readyState: number = WebSocket.OPEN): WebSocket =>
    ({ readyState } as unknown as WebSocket);

  it('should pair two players who match gameType and stake and create a reservation with matchId', async () => {
    let capturedReservation: MatchReservation | undefined;
    const onMatchFound = vi.fn(async (reservation: MatchReservation) => {
      capturedReservation = reservation;
    });
    const queue = new MatchmakingQueue(onMatchFound);

    const ws1 = createMockSocket();
    const ws2 = createMockSocket();

    const p1: QueuedPlayer = {
      telegramId: 101,
      name: 'Player 1',
      gameType: 'snake',
      stake: 100,
      ws: ws1,
      joinedAt: Date.now(),
    };

    const p2: QueuedPlayer = {
      telegramId: 102,
      name: 'Player 2',
      gameType: 'snake',
      stake: 100,
      ws: ws2,
      joinedAt: Date.now(),
    };

    const res1 = await queue.enqueue(p1);
    expect(res1.status).toBe('searching');
    expect(onMatchFound).not.toHaveBeenCalled();

    const res2 = await queue.enqueue(p2);
    expect(res2.status).toBe('matched');
    expect(onMatchFound).toHaveBeenCalledTimes(1);
    expect(capturedReservation).toBeDefined();
    expect(capturedReservation?.p1.telegramId).toBe(101);
    expect(capturedReservation?.p2.telegramId).toBe(102);
    expect(capturedReservation?.gameType).toBe('snake');
    expect(capturedReservation?.stake).toBe(100);
    expect(capturedReservation?.matchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(queue.size()).toBe(0);
  });

  it('should not pair players with different game types or different stakes', async () => {
    const onMatchFound = vi.fn(async () => {});
    const queue = new MatchmakingQueue(onMatchFound);

    const p1: QueuedPlayer = {
      telegramId: 103,
      name: 'Player 1',
      gameType: 'snake',
      stake: 100,
      ws: createMockSocket(),
      joinedAt: Date.now(),
    };

    const p2: QueuedPlayer = {
      telegramId: 104,
      name: 'Player 2',
      gameType: 'connect4', // Different game
      stake: 100,
      ws: createMockSocket(),
      joinedAt: Date.now(),
    };

    const p3: QueuedPlayer = {
      telegramId: 105,
      name: 'Player 3',
      gameType: 'snake',
      stake: 250, // Different stake
      ws: createMockSocket(),
      joinedAt: Date.now(),
    };

    await queue.enqueue(p1);
    await queue.enqueue(p2);
    await queue.enqueue(p3);

    expect(onMatchFound).not.toHaveBeenCalled();
    expect(queue.size()).toBe(3);
  });

  it('should dequeue player on cancel or disconnect by Telegram ID or socket', async () => {
    const onMatchFound = vi.fn(async () => {});
    const queue = new MatchmakingQueue(onMatchFound);

    const ws1 = createMockSocket();
    const p1: QueuedPlayer = {
      telegramId: 106,
      name: 'Player 1',
      gameType: 'snake',
      stake: 100,
      ws: ws1,
      joinedAt: Date.now(),
    };

    await queue.enqueue(p1);
    expect(queue.hasPlayer(106)).toBe(true);

    queue.dequeueByPlayer(106);
    expect(queue.hasPlayer(106)).toBe(false);

    const p2: QueuedPlayer = {
      telegramId: 107,
      name: 'Player 2',
      gameType: 'snake',
      stake: 100,
      ws: createMockSocket(),
      joinedAt: Date.now(),
    };

    await queue.enqueue(p2);
    expect(onMatchFound).not.toHaveBeenCalled();
    expect(queue.size()).toBe(1);
  });

  it('should reject invalid stakes outside economics bounds or closed sockets', async () => {
    const onMatchFound = vi.fn(async () => {});
    const queue = new MatchmakingQueue(onMatchFound);

    const invalidPlayer1: QueuedPlayer = {
      telegramId: 108,
      name: 'Player 1',
      gameType: 'snake',
      stake: -50,
      ws: createMockSocket(),
      joinedAt: Date.now(),
    };

    const invalidPlayer2: QueuedPlayer = {
      telegramId: 109,
      name: 'Player 2',
      gameType: 'snake',
      stake: 9999999,
      ws: createMockSocket(),
      joinedAt: Date.now(),
    };

    const closedSocketPlayer: QueuedPlayer = {
      telegramId: 110,
      name: 'Closed',
      gameType: 'snake',
      stake: 100,
      ws: createMockSocket(WebSocket.CLOSED),
      joinedAt: Date.now(),
    };

    await expect(queue.enqueue(invalidPlayer1)).rejects.toThrow('INVALID_STAKE');
    await expect(queue.enqueue(invalidPlayer2)).rejects.toThrow('INVALID_STAKE');
    await expect(queue.enqueue(closedSocketPlayer)).rejects.toThrow('PLAYER_SOCKET_NOT_OPEN');
    expect(queue.getQueueLength()).toBe(0);
  });

  it('should deduplicate multiple entries from the same Telegram ID across sockets', async () => {
    const onMatchFound = vi.fn(async () => {});
    const queue = new MatchmakingQueue(onMatchFound);

    const wsA = createMockSocket();
    const wsB = createMockSocket();

    const socketAEntry: QueuedPlayer = {
      telegramId: 110,
      name: 'MultiSocketPlayer',
      gameType: 'snake',
      stake: 100,
      ws: wsA,
      joinedAt: Date.now(),
    };

    const socketBEntry: QueuedPlayer = {
      telegramId: 110, // Same Telegram ID
      name: 'MultiSocketPlayer',
      gameType: 'snake',
      stake: 100,
      ws: wsB,
      joinedAt: Date.now(),
    };

    await queue.enqueue(socketAEntry);
    expect(queue.getQueueLength()).toBe(1);

    await queue.enqueue(socketBEntry);
    // Queue should still only have 1 entry (socketB replaced socketA for Telegram ID 110)
    expect(queue.getQueueLength()).toBe(1);
    expect(queue.isQueued(wsA)).toBe(false);
    expect(queue.isQueued(wsB)).toBe(true);
  });

  it('should restore players to queue if match establishment throws an error', async () => {
    const onMatchFound = vi.fn(async () => {
      throw new Error('Database temporary connection failure');
    });
    const queue = new MatchmakingQueue(onMatchFound);

    const ws1 = createMockSocket();
    const ws2 = createMockSocket();

    const p1: QueuedPlayer = {
      telegramId: 111,
      name: 'Player 1',
      gameType: 'snake',
      stake: 100,
      ws: ws1,
      joinedAt: Date.now(),
    };

    const p2: QueuedPlayer = {
      telegramId: 112,
      name: 'Player 2',
      gameType: 'snake',
      stake: 100,
      ws: ws2,
      joinedAt: Date.now(),
    };

    await queue.enqueue(p1);
    await expect(queue.enqueue(p2)).rejects.toThrow('Database temporary connection failure');

    // Both players should be safely restored to the queue
    expect(queue.hasPlayer(111)).toBe(true);
    expect(queue.hasPlayer(112)).toBe(true);
    expect(queue.size()).toBe(2);
  });

  it('should ignore closed sockets during opponent selection and purge stale entries', async () => {
    const onMatchFound = vi.fn(async () => {});
    const queue = new MatchmakingQueue(onMatchFound);

    const wsClosed = createMockSocket(WebSocket.CLOSED);
    const p1: QueuedPlayer = {
      telegramId: 113,
      name: 'Player 1',
      gameType: 'snake',
      stake: 100,
      ws: wsClosed,
      joinedAt: Date.now() - 100_000, // Expired wait time
    };

    // Direct insertion simulating dropped connection
    (queue as any).queue.set(p1.telegramId, p1);
    expect(queue.size()).toBe(1);

    const ws2 = createMockSocket(WebSocket.OPEN);
    const p2: QueuedPlayer = {
      telegramId: 114,
      name: 'Player 2',
      gameType: 'snake',
      stake: 100,
      ws: ws2,
      joinedAt: Date.now(),
    };

    // p2 enqueues: should purge p1 and NOT match with dead socket
    const res = await queue.enqueue(p2);
    expect(res.status).toBe('searching');
    expect(onMatchFound).not.toHaveBeenCalled();
    expect(queue.hasPlayer(113)).toBe(false);
    expect(queue.hasPlayer(114)).toBe(true);
    expect(queue.size()).toBe(1);
  });
});
