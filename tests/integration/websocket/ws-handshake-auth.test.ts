import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { server, wss } from '../../../server/server';
import { connectTestClient, sendAndAwaitResponse, waitForMessage } from '../../setup/test-helpers';
import { generateValidInitData, TEST_BOT_TOKEN } from '../../setup/mock-data';
import { WebSocket } from 'ws';

describe('WebSocket Handshake & Auth Integration Tests', () => {
  let wsUrl: string;
  let clientWs: WebSocket;

  beforeAll(async () => {
    process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
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
    if (clientWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should respond to PING with PONG containing timestamps', async () => {
    clientWs = await connectTestClient(wsUrl);
    const pingTime = Date.now();

    const response = await sendAndAwaitResponse(
      clientWs,
      {
        type: 'PING',
        payload: { timestamp: pingTime },
      },
      'PONG'
    );

    expect(response.type).toBe('PONG');
    expect(response.payload.clientTimestamp).toBe(pingTime);
    expect(response.payload.timestamp).toBeGreaterThanOrEqual(pingTime);
    clientWs.close();
  });

  it('should accept a browser origin when development CORS_ORIGIN is wildcarded', async () => {
    clientWs = await connectTestClient(wsUrl, 'http://localhost:5173');

    const response = await sendAndAwaitResponse(
      clientWs,
      { type: 'PING', payload: { timestamp: Date.now() } },
      'PONG',
    );

    expect(response.type).toBe('PONG');
    clientWs.close();
  });

  it('should configure a bounded WebSocket frame size', () => {
    expect((wss as any).options.maxPayload).toBe(64 * 1024);
  });

  it('should authenticate successfully with valid Telegram initData', async () => {
    clientWs = await connectTestClient(wsUrl);
    const user = { id: 555001, first_name: 'AuthTester', username: 'auth_tester' };
    const initData = generateValidInitData(user, TEST_BOT_TOKEN);

    const response = await sendAndAwaitResponse(
      clientWs,
      {
        type: 'AUTH',
        payload: {
          telegramId: user.id,
          playerName: user.first_name,
          initData,
        },
      },
      'AUTH_OK'
    );

    expect(response.type).toBe('AUTH_OK');
    expect(response.payload.telegramId).toBe(user.id);
    expect(response.payload.user).toBeDefined();
    expect(response.payload.user.telegram_id).toBe(user.id);
    clientWs.close();
  });

  it('should allow the same fresh Telegram initData to authenticate a reconnecting socket', async () => {
    const user = { id: 555003, first_name: 'ReconnectTester' };
    const initData = generateValidInitData(user, TEST_BOT_TOKEN);

    clientWs = await connectTestClient(wsUrl);
    await sendAndAwaitResponse(clientWs, {
      type: 'AUTH',
      payload: { telegramId: user.id, playerName: user.first_name, initData },
    }, 'AUTH_OK');
    clientWs.close();

    clientWs = await connectTestClient(wsUrl);
    const response = await sendAndAwaitResponse(clientWs, {
      type: 'AUTH',
      payload: { telegramId: user.id, playerName: user.first_name, initData },
    }, 'AUTH_OK');

    expect(response.type).toBe('AUTH_OK');
    expect(response.payload.telegramId).toBe(user.id);
    clientWs.close();
  });

  it('should reject authentication with tampered initData', async () => {
    clientWs = await connectTestClient(wsUrl);
    const user = { id: 555002, first_name: 'TamperTester' };
    const validInitData = generateValidInitData(user, TEST_BOT_TOKEN);
    const tampered = validInitData.replace('555002', '999999');

    const response = await sendAndAwaitResponse(
      clientWs,
      {
        type: 'AUTH',
        payload: {
          telegramId: 999999,
          playerName: 'TamperTester',
          initData: tampered,
        },
      },
      'ERROR'
    );

    expect(response.type).toBe('ERROR');
    expect(response.payload.code).toBe('AUTH_FAILED');
    clientWs.close();
  });

  it('should return INVALID_JSON when receiving malformed JSON string', async () => {
    clientWs = await connectTestClient(wsUrl);

    const waitPromise = waitForMessage(clientWs, (msg) => msg.type === 'ERROR');
    clientWs.send('NOT_A_JSON_STRING{{{');

    const response = await waitPromise;
    expect(response.type).toBe('ERROR');
    expect(response.payload.code).toBe('INVALID_JSON');
    clientWs.close();
  });

  it('should return SCHEMA_VALIDATION_ERROR for unknown or invalid message structures', async () => {
    clientWs = await connectTestClient(wsUrl);

    const waitPromise = waitForMessage(clientWs, (msg) => msg.type === 'ERROR');
    clientWs.send(JSON.stringify({ type: 'UNRECOGNIZED_ACTION', payload: {} }));

    const response = await waitPromise;
    expect(response.type).toBe('ERROR');
    expect(response.payload.code).toBe('SCHEMA_VALIDATION_ERROR');
    clientWs.close();
  });
});
