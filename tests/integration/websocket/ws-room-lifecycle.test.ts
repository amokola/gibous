import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server, storage } from '../../../server/server';
import { connectTestClient, sendAndAwaitResponse, waitForMessage } from '../../setup/test-helpers';
import { WebSocket } from 'ws';

describe('WebSocket Room Lifecycle Integration Tests', () => {
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

  it('should support full lifecycle: CREATE_ROOM -> GET_ROOMS -> JOIN_ROOM -> GAME_START', async () => {
    const ws1 = await connectTestClient(wsUrl);
    const ws2 = await connectTestClient(wsUrl);

    const hostTgId = 600101;
    const joinerTgId = 600102;
    await storage.getOrCreateUser({ id: hostTgId, first_name: 'Host' });
    await storage.getOrCreateUser({ id: joinerTgId, first_name: 'Joiner' });

    // 1. Host AUTH & CREATE_ROOM
    await sendAndAwaitResponse(ws1, {
      type: 'AUTH',
      payload: { telegramId: hostTgId, playerName: 'Host' },
    }, 'AUTH_OK');

    const createRes = await sendAndAwaitResponse(ws1, {
      type: 'CREATE_ROOM',
      payload: {
        roomCode: 'LIFE01',
        gameType: 'snake',
        stake: 100,
        telegramId: hostTgId,
        playerName: 'Host',
      },
    }, 'ROOM_CREATED');

    expect(createRes.type).toBe('ROOM_CREATED');
    expect(createRes.payload.code).toBe('LIFE01');
    expect(createRes.payload.status).toBe('waiting');
    expect(createRes.payload.p1.telegramId).toBe(hostTgId);

    // 2. Host GET_ROOMS
    const listRes = await sendAndAwaitResponse(ws1, {
      type: 'GET_ROOMS',
    }, 'ROOMS_LIST');
    expect(listRes.type).toBe('ROOMS_LIST');

    // 3. Joiner AUTH & JOIN_ROOM
    await sendAndAwaitResponse(ws2, {
      type: 'AUTH',
      payload: { telegramId: joinerTgId, playerName: 'Joiner' },
    }, 'AUTH_OK');

    // Both should receive GAME_START
    const startPromise1 = waitForMessage(ws1, (msg) => msg.type === 'GAME_START');
    const startPromise2 = waitForMessage(ws2, (msg) => msg.type === 'GAME_START');

    ws2.send(JSON.stringify({
      type: 'JOIN_ROOM',
      payload: {
        roomCode: 'LIFE01',
        telegramId: joinerTgId,
        playerName: 'Joiner',
      },
    }));

    const [start1, start2] = await Promise.all([startPromise1, startPromise2]);
    expect(start1.type).toBe('GAME_START');
    expect(start2.type).toBe('GAME_START');
    expect(start1.payload.code).toBe('LIFE01');
    expect(start1.payload.status).toBe('playing');
    expect(start1.payload.p1.telegramId).toBe(hostTgId);
    expect(start1.payload.p2.telegramId).toBe(joinerTgId);

    ws1.close();
    ws2.close();
  });

  it('should allow host to cancel waiting room and reject unauthorized cancel', async () => {
    const ws1 = await connectTestClient(wsUrl);
    const ws2 = await connectTestClient(wsUrl);

    const hostTgId = 600201;
    const hackerTgId = 600202;
    await storage.getOrCreateUser({ id: hostTgId, first_name: 'Host' });
    await storage.getOrCreateUser({ id: hackerTgId, first_name: 'Hacker' });

    // Host creates room
    await sendAndAwaitResponse(ws1, {
      type: 'AUTH',
      payload: { telegramId: hostTgId, playerName: 'Host' },
    }, 'AUTH_OK');

    await sendAndAwaitResponse(ws1, {
      type: 'CREATE_ROOM',
      payload: { roomCode: 'CANCEL01', gameType: 'connect4', stake: 100 },
    }, 'ROOM_CREATED');

    // Unauthorized user attempts to cancel
    await sendAndAwaitResponse(ws2, {
      type: 'AUTH',
      payload: { telegramId: hackerTgId, playerName: 'Hacker' },
    }, 'AUTH_OK');

    const unauthorizedRes = await sendAndAwaitResponse(ws2, {
      type: 'CANCEL_ROOM',
      payload: { roomCode: 'CANCEL01' },
    }, 'ERROR');

    expect(unauthorizedRes.type).toBe('ERROR');
    expect(unauthorizedRes.payload.code).toBe('CANCEL_FAILED');

    // Host cancels room successfully
    const cancelRes = await sendAndAwaitResponse(ws1, {
      type: 'CANCEL_ROOM',
      payload: { roomCode: 'CANCEL01' },
    }, 'ROOM_CANCELLED');

    expect(cancelRes.type).toBe('ROOM_CANCELLED');
    expect(cancelRes.payload.roomCode).toBe('CANCEL01');

    ws1.close();
    ws2.close();
  });

  it('should trigger forfeiture and GAME_OVER when player leaves an active match', async () => {
    const ws1 = await connectTestClient(wsUrl);
    const ws2 = await connectTestClient(wsUrl);

    const p1TgId = 600301;
    const p2TgId = 600302;
    await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

    // Setup active match
    await sendAndAwaitResponse(ws1, { type: 'AUTH', payload: { telegramId: p1TgId, playerName: 'P1' } }, 'AUTH_OK');
    await sendAndAwaitResponse(ws1, { type: 'CREATE_ROOM', payload: { roomCode: 'FORFEIT01', gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');

    await sendAndAwaitResponse(ws2, { type: 'AUTH', payload: { telegramId: p2TgId, playerName: 'P2' } }, 'AUTH_OK');
    const startP1 = waitForMessage(ws1, (m) => m.type === 'GAME_START');
    ws2.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode: 'FORFEIT01', telegramId: p2TgId, playerName: 'P2' } }));
    await startP1;

    // P1 resigns by sending LEAVE_ROOM
    const gameOverPromiseP2 = waitForMessage(ws2, (m) => m.type === 'GAME_OVER');
    ws1.send(JSON.stringify({ type: 'LEAVE_ROOM', payload: { roomCode: 'FORFEIT01' } }));

    const gameOverP2 = await gameOverPromiseP2;
    expect(gameOverP2.type).toBe('GAME_OVER');
    expect(gameOverP2.payload.winner).toBe('p2'); // P2 wins because P1 left
    expect(gameOverP2.payload.isForfeit).toBe(true);

    ws1.close();
    ws2.close();
  });
});
