import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server, storage, roomManager } from '../../../server/server';
import { connectTestClient, sendAndAwaitResponse, waitForMessage } from '../../setup/test-helpers';
import { WebSocket } from 'ws';

describe('WebSocket Disconnect, Reconnect & Forfeit Integration Tests', () => {
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

  it('should broadcast PLAYER_DISCONNECTED when a socket closes during active match', async () => {
    let ws1 = await connectTestClient(wsUrl);
    const ws2 = await connectTestClient(wsUrl);

    const p1TgId = 660001;
    const p2TgId = 660002;
    await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

    await sendAndAwaitResponse(ws1, { type: 'AUTH', payload: { telegramId: p1TgId, playerName: 'P1' } }, 'AUTH_OK');
    await sendAndAwaitResponse(ws1, { type: 'CREATE_ROOM', payload: { roomCode: 'RECON01', gameType: 'connect4', stake: 100 } }, 'ROOM_CREATED');

    await sendAndAwaitResponse(ws2, { type: 'AUTH', payload: { telegramId: p2TgId, playerName: 'P2' } }, 'AUTH_OK');
    const startP1 = waitForMessage(ws1, (m) => m.type === 'GAME_START');
    ws2.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode: 'RECON01', telegramId: p2TgId, playerName: 'P2' } }));
    await startP1;

    // Disconnect P1 socket
    const disconnectPromiseP2 = waitForMessage(ws2, (msg) => msg.type === 'PLAYER_DISCONNECTED');
    ws1.close();

    const disconnectEvent = await disconnectPromiseP2;
    expect(disconnectEvent.type).toBe('PLAYER_DISCONNECTED');
    expect(disconnectEvent.payload.player).toBe('p1');
    expect(disconnectEvent.payload.timeoutMs).toBe(45000);

    // Reconnect P1 with new socket
    ws1 = await connectTestClient(wsUrl);
    await sendAndAwaitResponse(ws1, { type: 'AUTH', payload: { telegramId: p1TgId, playerName: 'P1' } }, 'AUTH_OK');

    const reconnectPromiseP2 = waitForMessage(ws2, (msg) => msg.type === 'PLAYER_RECONNECTED');

    // Send JOIN_ROOM to rejoin active room
    const statePromiseP1 = waitForMessage(ws1, (msg) => msg.type === 'ROOM_STATE');
    ws1.send(JSON.stringify({
      type: 'JOIN_ROOM',
      payload: { roomCode: 'RECON01', telegramId: p1TgId, playerName: 'P1' },
    }));

    const [reconnectEvent, p1State] = await Promise.all([reconnectPromiseP2, statePromiseP1]);
    expect(reconnectEvent.type).toBe('PLAYER_RECONNECTED');
    expect(reconnectEvent.payload.player).toBe('p1');
    expect(p1State.type).toBe('ROOM_STATE');
    expect(p1State.payload.code).toBe('RECON01');

    ws1.close();
    ws2.close();
  });

  it('should forfeit match when forfeit timeout resolves', async () => {
    const ws1 = await connectTestClient(wsUrl);
    const ws2 = await connectTestClient(wsUrl);

    const p1TgId = 660003;
    const p2TgId = 660004;
    await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

    await sendAndAwaitResponse(ws1, { type: 'AUTH', payload: { telegramId: p1TgId, playerName: 'P1' } }, 'AUTH_OK');
    await sendAndAwaitResponse(ws1, { type: 'CREATE_ROOM', payload: { roomCode: 'TIMEO01', gameType: 'rps', stake: 100 } }, 'ROOM_CREATED');

    await sendAndAwaitResponse(ws2, { type: 'AUTH', payload: { telegramId: p2TgId, playerName: 'P2' } }, 'AUTH_OK');
    const startP1 = waitForMessage(ws1, (m) => m.type === 'GAME_START');
    ws2.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode: 'TIMEO01', telegramId: p2TgId, playerName: 'P2' } }));
    await startP1;

    // Disconnect P1
    const disconnectPromiseP2 = waitForMessage(ws2, (msg) => msg.type === 'PLAYER_DISCONNECTED');
    ws1.close();
    await disconnectPromiseP2;

    // Trigger forfeit resolution directly on room manager
    const gameOverPromiseP2 = waitForMessage(ws2, (msg) => msg.type === 'GAME_OVER');
    await roomManager.handleForfeitTimeout('TIMEO01', 'p1');

    const gameOverEvent = await gameOverPromiseP2;
    expect(gameOverEvent.type).toBe('GAME_OVER');
    expect(gameOverEvent.payload.winner).toBe('p2');
    expect(gameOverEvent.payload.isForfeit).toBe(true);

    ws2.close();
  });
});
