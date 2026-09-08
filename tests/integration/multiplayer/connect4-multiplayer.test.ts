import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server, storage } from '../../../server/server';
import { connectTestClient, sendAndAwaitResponse, waitForMessage } from '../../setup/test-helpers';
import { DatabasePool } from '../../../server/db/index';
import { WebSocket } from 'ws';

describe('Connect 4 Multiplayer 2-Client Integration Tests', () => {
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

  it('should run a complete 2-player Connect 4 match producing a horizontal victory', async () => {
    const ws1 = await connectTestClient(wsUrl);
    const ws2 = await connectTestClient(wsUrl);

    const p1TgId = 700201;
    const p2TgId = 700202;
    await storage.getOrCreateUser({ id: p1TgId, first_name: 'ConnectA' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'ConnectB' });

    const p1Start = DatabasePool.getInstance().getUserByTelegramId(p1TgId)!.balance_gram;
    const p2Start = DatabasePool.getInstance().getUserByTelegramId(p2TgId)!.balance_gram;

    // Auth & Room Setup
    await sendAndAwaitResponse(ws1, { type: 'AUTH', payload: { telegramId: p1TgId, playerName: 'ConnectA' } }, 'AUTH_OK');
    await sendAndAwaitResponse(ws1, { type: 'CREATE_ROOM', payload: { roomCode: 'C4MATCH', gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');

    await sendAndAwaitResponse(ws2, { type: 'AUTH', payload: { telegramId: p2TgId, playerName: 'ConnectB' } }, 'AUTH_OK');
    const startP1Promise = waitForMessage(ws1, (m) => m.type === 'GAME_START');
    ws2.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode: 'C4MATCH', telegramId: p2TgId, playerName: 'ConnectB' } }));
    await startP1Promise;

    // Sequence of moves for horizontal win by P1 in bottom row (row 5):
    // Moves: P1(0), P2(0), P1(1), P2(1), P1(2), P2(2), P1(3) -> P1 Wins!
    const moves: { ws: WebSocket; col: number }[] = [
      { ws: ws1, col: 0 },
      { ws: ws2, col: 0 },
      { ws: ws1, col: 1 },
      { ws: ws2, col: 1 },
      { ws: ws1, col: 2 },
      { ws: ws2, col: 2 },
    ];

    for (const move of moves) {
      const dropP1 = waitForMessage(ws1, (m) => m.type === 'DISC_DROPPED');
      const dropP2 = waitForMessage(ws2, (m) => m.type === 'DISC_DROPPED');
      move.ws.send(JSON.stringify({ type: 'DROP_DISC', payload: { roomCode: 'C4MATCH', column: move.col } }));
      await Promise.all([dropP1, dropP2]);
    }

    // Winning Move by P1
    const winDropP1 = waitForMessage(ws1, (m) => m.type === 'DISC_DROPPED' && m.payload?.winner === 'p1');
    const winDropP2 = waitForMessage(ws2, (m) => m.type === 'DISC_DROPPED' && m.payload?.winner === 'p1');
    const gameOverP1 = waitForMessage(ws1, (m) => m.type === 'GAME_OVER');
    const gameOverP2 = waitForMessage(ws2, (m) => m.type === 'GAME_OVER');

    ws1.send(JSON.stringify({ type: 'DROP_DISC', payload: { roomCode: 'C4MATCH', column: 3 } }));

    const [drop1, drop2, over1, over2] = await Promise.all([winDropP1, winDropP2, gameOverP1, gameOverP2]);

    expect(drop1.payload.winner).toBe('p1');
    expect(drop2.payload.winner).toBe('p1');
    expect(over1.payload.winner).toBe('p1');
    expect(over2.payload.winner).toBe('p1');
    expect(over1.payload.winnerPayout).toBe(180);

    const p1End = DatabasePool.getInstance().getUserByTelegramId(p1TgId)!.balance_gram;
    const p2End = DatabasePool.getInstance().getUserByTelegramId(p2TgId)!.balance_gram;
    expect(p1End).toBe(p1Start + 80);
    expect(p2End).toBe(p2Start - 100);

    ws1.close();
    ws2.close();
  });
});
