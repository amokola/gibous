import { describe, expect, it } from 'vitest';
import { RoomManager } from '../../../server/roomManager';
import { StorageService } from '../../../server/storage';

describe('Network Resilience & Financial Invariants Integration Tests', () => {
  it('prevents duplicate room creation and escrow deduction when user retries CREATE_ROOM', async () => {
    const storage = new StorageService();
    const roomManager = new RoomManager();
    const hostTgId = 920001;

    await storage.getOrCreateUser({ id: hostTgId, first_name: 'HostPlayer' });
    const initialAccount = await storage.getAccountSnapshot(hostTgId);
    const initialBalance = initialAccount?.balance_gram || 0;

    // First room creation
    const firstCreation = await roomManager.createRoom('RETRY-TEST-1', 'snake', 100, hostTgId, 'HostPlayer');
    expect(firstCreation.room).toBeDefined();
    expect(firstCreation.room?.code).toBe('RETRY-TEST-1');

    // Immediate second creation attempt by the same player while first room is waiting
    const secondCreation = await roomManager.createRoom('RETRY-TEST-2', 'snake', 100, hostTgId, 'HostPlayer');
    expect(secondCreation.room).toBeDefined();
    // Must return the existing open waiting room rather than creating a second one
    expect(secondCreation.room?.code).toBe('RETRY-TEST-1');

    // Verify balance was debited exactly ONCE (100 GRAM), not twice (200 GRAM)
    const afterAccount = await storage.getAccountSnapshot(hostTgId);
    expect(afterAccount?.balance_gram).toBe(initialBalance - 100);
  });

  it('restores disconnected player on reconnect and synchronizes room state', async () => {
    const storage = new StorageService();
    const roomManager = new RoomManager();
    const p1TgId = 920011;
    const p2TgId = 920012;

    await storage.getOrCreateUser({ id: p1TgId, first_name: 'P1' });
    await storage.getOrCreateUser({ id: p2TgId, first_name: 'P2' });

    const code = 'RECONNECT-TEST';
    await roomManager.createRoom(code, 'rps', 100, p1TgId, 'P1');
    await roomManager.joinRoom(code, p2TgId, 'P2');

    // Simulate P1 temporary network drop
    await roomManager.handleDisconnect(p1TgId);
    let room = roomManager.getRoom(code);
    expect(room?.p1?.isConnected).toBe(false);
    expect(room?.p1DisconnectTimer).toBeDefined();

    // P1 reconnects before forfeit timeout
    const reconnected = await roomManager.reconnectPlayer(code, p1TgId);
    expect(reconnected.role).toBe('p1');
    expect(reconnected.room?.p1?.isConnected).toBe(true);
    expect(reconnected.room?.p1DisconnectTimer).toBeUndefined();

    // Snapshot reflects accurate live state
    const currentRoom = roomManager.getRoom(code);
    expect(currentRoom).toBeDefined();
    const snapshot = roomManager.getRoomSnapshot(currentRoom!);
    expect(snapshot?.p1?.isConnected).toBe(true);
    expect(snapshot?.status).toBe('playing');
  });

  it('refunds escrow stake when waiting room is cancelled after server restart', async () => {
    const storage = new StorageService();
    const original = new RoomManager();
    const p1TgId = 920021;

    await storage.getOrCreateUser({ id: p1TgId, first_name: 'RefundHost' });
    const initialAccount = await storage.getAccountSnapshot(p1TgId);
    const startBalance = initialAccount?.balance_gram || 0;

    const code = 'RESTART-CANCEL-TEST';
    await original.createRoom(code, 'connect4', 100, p1TgId, 'RefundHost');

    const debitedAccount = await storage.getAccountSnapshot(p1TgId);
    expect(debitedAccount?.balance_gram).toBe(startBalance - 100);

    // Simulate process crash / server restart
    const replacement = new RoomManager();
    await replacement.restorePersistedRooms();

    const restoredRoom = replacement.getRoom(code);
    expect(restoredRoom?.status).toBe('waiting');

    // Player cancels waiting room on new server process
    const deleted = await replacement.deleteRoom(code, p1TgId);
    expect(deleted).toBe(true);

    // Full stake is refunded atomically
    const finalAccount = await storage.getAccountSnapshot(p1TgId);
    expect(finalAccount?.balance_gram).toBe(startBalance);
  });

  it('handles duplicate deposit submission idempotently with same BOC', async () => {
    const storage = new StorageService();
    const userTgId = 920031;
    await storage.getOrCreateUser({ id: userTgId, first_name: 'DepositUser' });

    const depositInput = {
      telegramId: userTgId,
      walletAddress: 'EQBvW8Z5huBkMJYdnfAEM5JqTNt2XYBaxLVTNVGZDp0_Av',
      depositAddress: process.env.TON_DEPOSIT_ADDRESS || 'UQATZc4GlaIi1yqeAQ8RwG_JpJN27ZdgFrEtVM1UZkOnT8Cz',
      amountNano: '1000000000',
      boc: 'te6cckEBAQEAAgAAAEysrq0=',
      network: 'mainnet' as const,
    };

    const first = await storage.recordPendingDeposit(depositInput);
    expect(first.success).toBe(true);

    // Immediate retry with same BOC (e.g. timeout or double tap)
    const second = await storage.recordPendingDeposit(depositInput);
    expect(second.success).toBe(true);
    expect(second.transaction?.id).toBe(first.transaction?.id);
  });
});
