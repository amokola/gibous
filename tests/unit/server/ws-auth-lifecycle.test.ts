import { describe, expect, it, vi } from 'vitest';
import { completeAuthAfterStorage } from '../../../server/wsAuthLifecycle';
import { WebSocket } from 'ws';

describe('WebSocket authentication lifecycle', () => {
  it('does not register a session when the auth timeout invalidates pending storage work', async () => {
    let finishStorage!: (value: { id: number }) => void;
    let timedOut = false;
    const storage = new Promise<{ id: number }>((resolve) => { finishStorage = resolve; });
    const socket = { readyState: WebSocket.OPEN } as WebSocket;
    const register = vi.fn();

    const pendingAuth = completeAuthAfterStorage(socket, () => timedOut, () => storage, register);
    timedOut = true;
    finishStorage({ id: 555001 });

    await expect(pendingAuth).resolves.toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it('registers after storage only while the socket remains open', async () => {
    const socket = { readyState: WebSocket.OPEN } as WebSocket;
    const register = vi.fn();

    await expect(completeAuthAfterStorage(socket, () => false, async () => ({ id: 555002 }), register)).resolves.toBe(true);
    expect(register).toHaveBeenCalledWith({ id: 555002 });
  });
});
