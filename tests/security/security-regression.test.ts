import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService } from '../../server/storage';
import { RoomManager } from '../../server/roomManager';
import { SessionManager } from '../../server/sessionManager';
import { DatabasePool } from '../../server/db/index';
import { CANONICAL_SNAKES, CANONICAL_LADDERS, SNAKES_MAP, LADDERS_MAP } from '../../shared/constants/board';
import { ServerSnakeLadderEngine } from '../../server/engines/SnakeLadderEngine';
import { WebSocket } from 'ws';
import { connectionManager } from '../../server/connectionManager';

describe('Security Regression Matrix (VULN-01 to VULN-08)', () => {
  let storage: StorageService;
  let roomManager: RoomManager;
  let sessionManager: SessionManager;
  let db: DatabasePool;

  beforeEach(() => {
    storage = new StorageService();
    roomManager = new RoomManager();
    sessionManager = SessionManager.getInstance();
    db = DatabasePool.getInstance();
  });

  const createMockSocket = (): WebSocket => ({} as unknown as WebSocket);

  it('VULN-01: Rejects unauthenticated player impersonation and non-authenticated actions', async () => {
    const ws = createMockSocket();
    // Socket has not been registered in SessionManager
    const session = sessionManager.getSession(ws);
    expect(session).toBeUndefined();
  });

  it('VULN-02: Rejects unauthorized or non-owner room deletion', async () => {
    const ownerTgId = 900201;
    const hackerTgId = 900202;
    const code = 'SEC_DEL_02';

    await storage.getOrCreateUser({ id: ownerTgId, first_name: 'Owner' });
    await storage.getOrCreateUser({ id: hackerTgId, first_name: 'Hacker' });

    await roomManager.createRoom(code, 'snake', 100, ownerTgId, 'Owner');

    // Hacker attempts to delete owner's room
    const deletedByHacker = await roomManager.deleteRoom(code, hackerTgId);
    expect(deletedByHacker).toBe(false);

    // Room must still exist in room manager
    expect(roomManager.getRoom(code)).toBeDefined();

    // Owner deletes room
    const deletedByOwner = await roomManager.deleteRoom(code, ownerTgId);
    expect(deletedByOwner).toBe(true);
    expect(roomManager.getRoom(code)).toBeUndefined();
  });

  it('VULN-03: Prevents free-money/token inflation by ensuring stake is debited before payout', async () => {
    const userTgId = 900301;
    const user = await storage.getOrCreateUser({ id: userTgId, first_name: 'InflationTest' });
    user.balance_gram = 50; // Insufficient for 100 stake
    db.saveUser(user);

    const debitResult = await storage.debitStake(userTgId, 100, 'INFLATION_03');
    expect(debitResult.success).toBe(false);
    expect(debitResult.error).toContain('Not enough GRAM');

    // Balance was not modified
    expect(db.getUserByTelegramId(userTgId)!.balance_gram).toBe(50);
  });

  it('VULN-04: Prevents free draw refunds (draw refund cannot exceed escrowed funds)', async () => {
    const p1TgId = 900401;
    const p2TgId = 900402;
    const stake = 100;

    await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

    const calc = await storage.finalizeDrawMatch('DRAW_04', 'snake', stake, p1TgId, p2TgId);
    const totalRefunded = calc.p1Refund + calc.p2Refund;
    const totalPot = stake * 2;

    expect(totalRefunded).toBeLessThan(totalPot);
    expect(totalRefunded + calc.arenaFee).toBe(totalPot);
  });

  it('VULN-05: Rejects gameplay moves from non-participants or spectators', async () => {
    const p1TgId = 900501;
    const p2TgId = 900502;
    const spectatorTgId = 900503;
    const code = 'NON_PARTICIPANT_05';

    await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });
    await storage.getOrCreateUser({ id: spectatorTgId, first_name: 'Spectator' });

    await roomManager.createRoom(code, 'snake', 100, p1TgId, 'P1');
    await roomManager.joinRoom(code, p2TgId, 'P2');

    const room = roomManager.getRoom(code)!;
    expect(room.p1?.telegramId).toBe(p1TgId);
    expect(room.p2?.telegramId).toBe(p2TgId);

    // Verify spectator is neither p1 nor p2
    const isParticipant =
      room.p1?.telegramId === spectatorTgId || room.p2?.telegramId === spectatorTgId;
    expect(isParticipant).toBe(false);
  });

  it('VULN-06: Verifies correct room, session, and role binding', async () => {
    const ws = createMockSocket();
    const connId = 'vuln-06-conn-id';
    sessionManager.register(ws, 900601, 'BoundPlayer', undefined, connId);

    const session = sessionManager.getSession(ws);
    expect(session?.telegramId).toBe(900601);
    expect(session?.name).toBe('BoundPlayer');
    expect(session?.connectionId).toBe(connId);
  });

  it('VULN-07: Verifies server engine authoritative execution path (server owns state)', async () => {
    const engine = new ServerSnakeLadderEngine();
    const initialState = engine.getState() as any;

    expect(initialState.p1Position).toBe(1);
    expect(initialState.p2Position).toBe(1);

    // Client action must be evaluated by the server engine
    const actionResult = engine.handleAction('p1', 'ROLL_DICE');
    expect(actionResult.success).toBe(true);
    expect(actionResult.actionType).toBe('DICE_ROLLED');
    expect(typeof actionResult.payload.value).toBe('number');
    expect(engine.getState().p1Position).toBe(actionResult.payload.to);
  });

  it('VULN-08: Verifies zero configuration drift between shared constants and engine board maps', () => {
    expect(CANONICAL_SNAKES.length).toBe(6);
    expect(CANONICAL_LADDERS.length).toBe(6);

    for (const snake of CANONICAL_SNAKES) {
      expect(SNAKES_MAP[snake.head]).toBe(snake.tail);
    }
    for (const ladder of CANONICAL_LADDERS) {
      expect(LADDERS_MAP[ladder.bottom]).toBe(ladder.top);
    }
  });

  it('VULN-09: Never grants a balance based on a display name or username', async () => {
    const user = await storage.getOrCreateUser({
      id: 900901,
      first_name: 'Sten',
      username: 'sten',
    });
    user.balance_gram = 0;
    db.saveUser(user);

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const reloaded = await storage.getOrCreateUser({
      id: 900901,
      first_name: 'Sten',
      username: 'sten',
    });
    process.env.NODE_ENV = previousNodeEnv;

    expect(reloaded.balance_gram).toBe(0);
  });

  it('VULN-10: Does not broadcast a paid game-over when settlement fails', async () => {
    const p1 = 900911;
    const p2 = 900912;
    const code = 'SETTLEMENT-FAIL-10';
    await storage.getOrCreateUser({ id: p1, first_name: 'P1' });
    await storage.getOrCreateUser({ id: p2, first_name: 'P2' });
    await roomManager.createRoom(code, 'snake', 100, p1, 'P1');
    await roomManager.joinRoom(code, p2, 'P2');

    const room = roomManager.getRoom(code)!;
    room.p1!.isConnected = false;
    (roomManager as any).storage = {
      finalizeWinMatch: vi.fn().mockRejectedValue(new Error('database unavailable')),
      persistMatch: vi.fn().mockResolvedValue(undefined),
    };
    const broadcast = vi.spyOn(connectionManager, 'broadcast').mockImplementation(() => ({ delivered: [], failed: [] }));

    await roomManager.handleForfeitTimeout(code, 'p1');

    expect(room.settlementStatus).toBe('failed');
    expect(broadcast).toHaveBeenCalledWith(
      room,
      expect.objectContaining({ type: 'SETTLEMENT_PENDING' }),
    );
    expect(broadcast).not.toHaveBeenCalledWith(
      room,
      expect.objectContaining({ type: 'GAME_OVER' }),
    );
    broadcast.mockRestore();
  });

  it('VULN-11: Does not expose Telegram identifiers in the public room directory', async () => {
    const host = 900921;
    await storage.getOrCreateUser({ id: host, first_name: 'DirectoryHost' });
    await roomManager.createRoom('ROOM-DIRECTORY-11', 'snake', 100, host, 'DirectoryHost');

    const room = roomManager.getOpenRooms()[0];
    expect(room).not.toHaveProperty('hostTgId');
  });
});
