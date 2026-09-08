import { beforeEach, describe, expect, it } from 'vitest';
import { useRoomStore } from '../../../src/state/useRoomStore';

const room = {
  code: 'VERSION-01',
  gameType: 'connect4' as const,
  status: 'playing' as const,
  stakeAmount: 100,
  potAmount: 200,
  p1: { id: 'p1' as const, telegramId: 1, name: 'P1', isReady: true },
  p2: { id: 'p2' as const, telegramId: 2, name: 'P2', isReady: true },
  activePlayer: 'p1' as const,
  turnPhase: 'PLAYING',
  winner: null,
  version: 1,
  gameState: { board: [] },
};

describe('room event version convergence', () => {
  beforeEach(() => {
    useRoomStore.getState().clearRoom();
  });

  it('ignores duplicate and stale patches without a newer authoritative snapshot', () => {
    useRoomStore.getState().setRoom(room);
    useRoomStore.getState().updateRoomFromEvent({ version: 2, status: 'gameover' });
    useRoomStore.getState().updateRoomFromEvent({ version: 2, status: 'waiting' });
    useRoomStore.getState().updateRoomFromEvent({ version: 1, status: 'waiting' });

    expect(useRoomStore.getState().currentRoom?.status).toBe('gameover');
    expect(useRoomStore.getState().roomVersion).toBe(2);
  });
});
