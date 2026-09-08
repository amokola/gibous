/**
 * Room Command Queue & Mutex
 * Provides strict sequential command processing per room code.
 * Ensures cross-socket gameplay actions, reconnects, and forfeit requests
 * for the same room are executed in strict deterministic order without races.
 */

export class RoomCommandQueue {
  private queues: Map<string, Promise<unknown>> = new Map();

  async enqueue<T>(roomCode: string, task: () => Promise<T>): Promise<T> {
    const normalizedCode = (roomCode || '').trim().toUpperCase();
    const previousPromise = this.queues.get(normalizedCode) ?? Promise.resolve();

    let nextPromise!: Promise<T>;
    nextPromise = previousPromise
      .catch(() => {})
      .then(async () => {
        try {
          return await task();
        } finally {
          if (this.queues.get(normalizedCode) === nextPromise) {
            this.queues.delete(normalizedCode);
          }
        }
      });

    this.queues.set(normalizedCode, nextPromise);
    return await nextPromise;
  }

  async withRoomLock<T>(roomCode: string, task: () => Promise<T>): Promise<T> {
    return this.enqueue(roomCode, task);
  }

  getActiveQueueCount(): number {
    return this.queues.size;
  }
}

export const roomCommandQueue = new RoomCommandQueue();
