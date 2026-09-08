import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { server, storage, roomManager } from '../../../server/server';
import { connectTestClient, sendAndAwaitResponse, waitForMessage } from '../../setup/test-helpers';
import { DatabasePool } from '../../../server/db/index';
import { WebSocket } from 'ws';

describe('Snake & Ladders Multiplayer 2-Client Integration Tests', () => {
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
    vi.restoreAllMocks();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should run a complete 2-player Snake match from creation to rolls and victory settlement', async () => {
    const ws1 = await connectTestClient(wsUrl);
    const ws2 = await connectTestClient(wsUrl);

    const p1TgId = 700101;
    const p2TgId = 700102;
    await storage.getOrCreateUser({ id: p1TgId, first_name: 'SnakeA' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'SnakeB' });

    const p1StartBalance = DatabasePool.getInstance().getUserByTelegramId(p1TgId)!.balance_gram;
    const p2StartBalance = DatabasePool.getInstance().getUserByTelegramId(p2TgId)!.balance_gram;

    // 1. P1 Auth & Create Room
    await sendAndAwaitResponse(ws1, { type: 'AUTH', payload: { telegramId: p1TgId, playerName: 'SnakeA' } }, 'AUTH_OK');
    await sendAndAwaitResponse(ws1, {
      type: 'CREATE_ROOM',
      payload: { roomCode: 'SNAKEMATCH', gameType: 'snake', stake: 100 },
    }, 'ROOM_CREATED');

    // 2. P2 Auth & Join Room
    await sendAndAwaitResponse(ws2, { type: 'AUTH', payload: { telegramId: p2TgId, playerName: 'SnakeB' } }, 'AUTH_OK');

    const startP1Promise = waitForMessage(ws1, (m) => m.type === 'GAME_START');
    const startP2Promise = waitForMessage(ws2, (m) => m.type === 'GAME_START');
    ws2.send(JSON.stringify({ type: 'JOIN_ROOM', payload: { roomCode: 'SNAKEMATCH', telegramId: p2TgId, playerName: 'SnakeB' } }));

    const [startP1, startP2] = await Promise.all([startP1Promise, startP2Promise]);
    expect(startP1.payload.code).toBe('SNAKEMATCH');
    expect(startP2.payload.code).toBe('SNAKEMATCH');

    // 3. P1 Turn: Rolls Dice
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // roll = 4

    const dice1PromiseP1 = waitForMessage(ws1, (m) => m.type === 'DICE_ROLLED');
    const dice1PromiseP2 = waitForMessage(ws2, (m) => m.type === 'DICE_ROLLED');

    ws1.send(JSON.stringify({ type: 'ROLL_DICE', payload: { roomCode: 'SNAKEMATCH' } }));

    const [dice1P1, dice1P2] = await Promise.all([dice1PromiseP1, dice1PromiseP2]);
    expect(dice1P1).toEqual(dice1P2);
    expect(dice1P1.payload.player).toBe('p1');
    expect(dice1P1.payload.value).toBe(4);
    expect(dice1P1.payload.to).toBe(5);
    expect(dice1P1.payload.nextPlayer).toBe('p2');

    // 4. P2 Turn: Rolls Dice
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // roll = 1
    const dice2PromiseP1 = waitForMessage(ws1, (m) => m.type === 'DICE_ROLLED');
    const dice2PromiseP2 = waitForMessage(ws2, (m) => m.type === 'DICE_ROLLED');

    ws2.send(JSON.stringify({ type: 'ROLL_DICE', payload: { roomCode: 'SNAKEMATCH' } }));

    const [dice2P1, dice2P2] = await Promise.all([dice2PromiseP1, dice2PromiseP2]);
    expect(dice2P1.payload.player).toBe('p2');
    expect(dice2P1.payload.value).toBe(1);
    expect(dice2P1.payload.to).toBe(2);
    expect(dice2P1.payload.nextPlayer).toBe('p1');

    // 5. Final Winning Roll: Set P1 pos to 98 and roll 2 to hit 100
    const room = roomManager.getRoom('SNAKEMATCH')!;
    const engineState = room.engine.getState() as any;
    (room.engine as any).state.p1Position = 98;
    (room.engine as any).state.activePlayer = 'p1';

    vi.spyOn(Math, 'random').mockReturnValue(1 / 6); // roll = 2 -> 98 + 2 = 100

    const winDicePromise = waitForMessage(ws1, (m) => m.type === 'DICE_ROLLED');
    const gameOverPromiseP1 = waitForMessage(ws1, (m) => m.type === 'GAME_OVER');
    const gameOverPromiseP2 = waitForMessage(ws2, (m) => m.type === 'GAME_OVER');

    ws1.send(JSON.stringify({ type: 'ROLL_DICE', payload: { roomCode: 'SNAKEMATCH' } }));

    const [winDice, gameOverP1, gameOverP2] = await Promise.all([
      winDicePromise,
      gameOverPromiseP1,
      gameOverPromiseP2,
    ]);

    expect(winDice.payload.to).toBe(100);
    expect(winDice.payload.isWinner).toBe(true);

    expect(gameOverP1.payload.winner).toBe('p1');
    expect(gameOverP2.payload.winner).toBe('p1');
    expect(gameOverP1.payload.winnerPayout).toBe(180);
    expect(gameOverP1.payload.arenaFee).toBe(20);

    // Verify balances after financial settlement:
    // P1 staked 100, won 180 -> net +80
    // P2 staked 100, lost -> net -100
    const p1EndBalance = DatabasePool.getInstance().getUserByTelegramId(p1TgId)!.balance_gram;
    const p2EndBalance = DatabasePool.getInstance().getUserByTelegramId(p2TgId)!.balance_gram;

    expect(p1EndBalance).toBe(p1StartBalance + 80);
    expect(p2EndBalance).toBe(p2StartBalance - 100);

    ws1.close();
    ws2.close();
  });
});
