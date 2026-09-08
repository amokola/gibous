import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../../../server/storage';
import { RoomManager } from '../../../server/roomManager';
import { DatabasePool } from '../../../server/db/index';

describe('Concurrency & Race Condition Integration Tests', () => {
  let storage: StorageService;
  let roomManager: RoomManager;
  let db: DatabasePool;

  beforeEach(() => {
    storage = new StorageService();
    roomManager = new RoomManager();
    db = DatabasePool.getInstance();
  });

  it('should prevent double-joining a room when two opponents join concurrently', async () => {
    const hostTgId = 760101;
    const joiner1TgId = 760102;
    const joiner2TgId = 760103;
    const code = 'CONCURR_JOIN';

    await storage.getOrCreateUser({ id: hostTgId, first_name: 'Host' });
    await storage.getOrCreateUser({ id: joiner1TgId, first_name: 'Joiner1' });
    await storage.getOrCreateUser({ id: joiner2TgId, first_name: 'Joiner2' });

    await roomManager.createRoom(code, 'snake', 100, hostTgId, 'Host');

    // Attempt concurrent joins
    const [join1, join2] = await Promise.all([
      roomManager.joinRoom(code, joiner1TgId, 'Joiner1'),
      roomManager.joinRoom(code, joiner2TgId, 'Joiner2'),
    ]);

    // Exactly one should succeed and one should fail
    const successes = [join1, join2].filter((r) => r.room && !r.error);
    const failures = [join1, join2].filter((r) => r.error);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(failures[0].error).toContain('Room is full');
  });

  it('should prevent spending funds twice when creating two rooms concurrently with only enough balance for one', async () => {
    const tgId = 760201;
    const user = await storage.getOrCreateUser({ id: tgId, first_name: 'ExactBalanceUser' });
    user.balance_gram = 100; // Exactly enough for ONE 100-stake room
    db.saveUser(user);

    const [c1, c2] = await Promise.all([
      storage.debitStake(tgId, 100, 'ROOM-A'),
      storage.debitStake(tgId, 100, 'ROOM-B'),
    ]);

    const successes = [c1, c2].filter((r) => r.success);
    const failures = [c1, c2].filter((r) => !r.success);

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);
    expect(failures[0].error).toContain('Not enough GRAM');
    expect(db.getUserByTelegramId(tgId)!.balance_gram).toBe(0);
  });
});
