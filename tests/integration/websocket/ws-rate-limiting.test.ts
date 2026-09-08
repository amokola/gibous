import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server, storage } from '../../../server/server';
import { connectTestClient, sendAndAwaitResponse, waitForMessage } from '../../setup/test-helpers';
import { WebSocket } from 'ws';

describe('WebSocket Rate Limiting Integration Tests', () => {
  let wsUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 3001;
        wsUrl = `ws://127.0.0.1:${port}/ws`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should enforce gameplay action rate limiting when client floods moves', async () => {
    const ws1 = await connectTestClient(wsUrl);
    const ws2 = await connectTestClient(wsUrl);

    const p1TgId = 650001;
    const p2TgId = 650002;
    await storage.getOrCreateUser({ id: p1TgId, first_name: 'FastRoller' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'SlowRoller' });

    await sendAndAwaitResponse(ws1, { type: 'AUTH', payload: { telegramId: p1TgId, playerName: 'FastRoller' } }, 'AUTH_OK');
    await sendAndAwaitResponse(ws1, { type: 'CREATE_ROOM', payload: { roomCode: 'FLOOD01', gameType: 'snake', stake: 50 } }, 'ROOM_CREATED');

    await sendAndAwaitResponse(ws2, { type: 'AUTH', payload: { telegramId: p2TgId, playerName: 'SlowRoller' } }, 'AUTH_OK');
    const startP1 = waitForMessage(ws1, (m) => m.type === 'GAME_START');
    ws2.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode: 'FLOOD01', telegramId: p2TgId, playerName: 'SlowRoller' } }));
    await startP1;

    // Send 10 ROLL_DICE requests in rapid succession (> 5/sec limit)
    const errorPromise = waitForMessage(ws1, (msg) => msg.type === 'ERROR' && msg.payload?.code === 'ACTION_RATE_LIMITED');

    for (let i = 0; i < 10; i++) {
      ws1.send(JSON.stringify({
        type: 'ROLL_DICE',
        payload: { roomCode: 'FLOOD01' },
      }));
    }

    try {
      const rateLimitError = await errorPromise;
      expect(rateLimitError.type).toBe('ERROR');
      expect(rateLimitError.payload.code).toBe('ACTION_RATE_LIMITED');
      expect(rateLimitError.payload.message).toContain('too quickly');
    } finally {
      ws1.close();
      ws2.close();
    }
  });
});
