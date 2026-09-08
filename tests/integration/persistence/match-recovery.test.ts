import { describe, expect, it } from 'vitest';
import { RoomManager } from '../../../server/roomManager';
import { StorageService } from '../../../server/storage';

describe('authoritative match persistence and recovery', () => {
  it('restores a waiting match after the owning manager is replaced', async () => {
    const code = `RECOVER-${Date.now()}`;
    const storage = new StorageService();
    const original = new RoomManager();

    await storage.getOrCreateUser({ id: 910001, first_name: 'RecoveryHost' });
    const created = await original.createRoom(code, 'snake', 100, 910001, 'RecoveryHost');
    expect(created.room).toBeDefined();

    const replacement = new RoomManager();
    await replacement.restorePersistedRooms();

    const restored = replacement.getRoom(code);
    expect(restored?.status).toBe('waiting');
    expect(restored?.p1?.telegramId).toBe(910001);
    expect(restored?.engine.getState()).toMatchObject({
      p1Position: 1,
      p2Position: 1,
      activePlayer: 'p1',
    });
  });

  it('restores durable command results so a retried action cannot execute twice', async () => {
    const code = `RECOVER-ACTION-${Date.now()}`;
    const storage = new StorageService();
    const original = new RoomManager();
    await storage.getOrCreateUser({ id: 910011, first_name: 'ActionHost' });
    await storage.getOrCreateUser({ id: 910012, first_name: 'ActionGuest' });

    await original.createRoom(code, 'connect4', 100, 910011, 'ActionHost');
    await original.joinRoom(code, 910012, 'ActionGuest');
    const first = original.executeAction(code, 'p1', 'DROP_DISC', { column: 0 }, 'action-retry-1');
    const beforeRestart = original.getRoom(code)!;
    await original.persistCurrentState(beforeRestart);

    const replacement = new RoomManager();
    await replacement.restorePersistedRooms();
    const replay = replacement.executeAction(code, 'p1', 'DROP_DISC', { column: 0 }, 'action-retry-1');

    expect(replay).toEqual(first);
    expect((replacement.getRoom(code)!.engine.getState() as any).board[5][0]).toBe('p1');
    expect(replacement.getRoom(code)!.version).toBe(beforeRestart.version);
  });
});
