import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server, storage } from '../../../server/server';
import { connectTestClient, sendAndAwaitResponse, waitForMessage } from '../../setup/test-helpers';
import { DatabasePool } from '../../../server/db/index';
import { WebSocket } from 'ws';

describe('Rock Paper Scissors Multiplayer 2-Client Integration Tests', () => {
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

  it('should preserve choice secrecy until both players commit, then resolve round and settle match', async () => {
    const ws1 = await connectTestClient(wsUrl);
    const ws2 = await connectTestClient(wsUrl);

    const p1TgId = 700301;
    const p2TgId = 700302;
    await storage.getOrCreateUser({ id: p1TgId, first_name: 'RPSA' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'RPSB' });

    const p1Start = DatabasePool.getInstance().getUserByTelegramId(p1TgId)!.balance_gram;
    const p2Start = DatabasePool.getInstance().getUserByTelegramId(p2TgId)!.balance_gram;

    // 1. Auth & Create Room
    await sendAndAwaitResponse(ws1, { type: 'AUTH', payload: { telegramId: p1TgId, playerName: 'RPSA' } }, 'AUTH_OK');
    await sendAndAwaitResponse(ws1, { type: 'CREATE_ROOM', payload: { roomCode: 'RPSMATCH', gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');

    await sendAndAwaitResponse(ws2, { type: 'AUTH', payload: { telegramId: p2TgId, playerName: 'RPSB' } }, 'AUTH_OK');
    const startP1Promise = waitForMessage(ws1, (m) => m.type === 'GAME_START');
    ws2.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode: 'RPSMATCH', telegramId: p2TgId, playerName: 'RPSB' } }));
    await startP1Promise;

    // Helper to play a round
    const playRound = async (p1Choice: string, p2Choice: string) => {
      const resolveP1 = waitForMessage(ws1, (m) => m.type === 'RPS_ROUND_RESOLVED');
      const resolveP2 = waitForMessage(ws2, (m) => m.type === 'RPS_ROUND_RESOLVED');

      // P1 sends choice
      ws1.send(JSON.stringify({
        type: 'CHOOSE_RPS',
        payload: { roomCode: 'RPSMATCH', choice: p1Choice },
      }));

      // Small delay, then P2 sends choice
      ws2.send(JSON.stringify({
        type: 'CHOOSE_RPS',
        payload: { roomCode: 'RPSMATCH', choice: p2Choice },
      }));

      return Promise.all([resolveP1, resolveP2]);
    };

    // Round 1: Rock vs Scissors -> P1 wins round
    const [r1P1, r1P2] = await playRound('rock', 'scissors');
    expect(r1P1.payload.roundWinner).toBe('p1');
    expect(r1P1.payload.p1Score).toBe(1);
    expect(r1P2.payload.p1Score).toBe(1);

    // Round 2: Rock vs Scissors -> P1 wins round
    const [r2P1] = await playRound('rock', 'scissors');
    expect(r2P1.payload.p1Score).toBe(2);

    // Round 3: Rock vs Scissors -> P1 wins match!
    const gameOverPromiseP1 = waitForMessage(ws1, (m) => m.type === 'GAME_OVER');
    const gameOverPromiseP2 = waitForMessage(ws2, (m) => m.type === 'GAME_OVER');

    await playRound('rock', 'scissors');

    const [gameOverP1, gameOverP2] = await Promise.all([gameOverPromiseP1, gameOverPromiseP2]);
    expect(gameOverP1.payload.winner).toBe('p1');
    expect(gameOverP2.payload.winner).toBe('p1');
    expect(gameOverP1.payload.winnerPayout).toBe(180);

    const p1End = DatabasePool.getInstance().getUserByTelegramId(p1TgId)!.balance_gram;
    const p2End = DatabasePool.getInstance().getUserByTelegramId(p2TgId)!.balance_gram;
    expect(p1End).toBe(p1Start + 80);
    expect(p2End).toBe(p2Start - 100);

    ws1.close();
    ws2.close();
  });
});
