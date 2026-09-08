import { describe, it, expect } from 'vitest';
import { RoomCommandQueue, roomCommandQueue } from '../../../server/roomCommandQueue';

describe('RoomCommandQueue Unit Tests', () => {
  it('should serialize tasks for the same room code sequentially', async () => {
    const queue = new RoomCommandQueue();
    const executionOrder: number[] = [];

    const task1 = queue.enqueue('ROOM1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      executionOrder.push(1);
      return 'task1-done';
    });

    const task2 = queue.enqueue('ROOM1', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      executionOrder.push(2);
      return 'task2-done';
    });

    const task3 = queue.enqueue('ROOM1', async () => {
      executionOrder.push(3);
      return 'task3-done';
    });

    const [res1, res2, res3] = await Promise.all([task1, task2, task3]);

    expect(res1).toBe('task1-done');
    expect(res2).toBe('task2-done');
    expect(res3).toBe('task3-done');
    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('should allow concurrent execution across different room codes', async () => {
    const queue = new RoomCommandQueue();
    const completionOrder: string[] = [];

    const slowRoomA = queue.enqueue('ROOM_A', async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      completionOrder.push('room_a');
    });

    const fastRoomB = queue.enqueue('ROOM_B', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      completionOrder.push('room_b');
    });

    await Promise.all([slowRoomA, fastRoomB]);
    expect(completionOrder).toEqual(['room_b', 'room_a']);
  });

  it('should continue executing queue even if a preceding task throws', async () => {
    const queue = new RoomCommandQueue();
    const executionOrder: number[] = [];

    const failingTask = queue.enqueue('ROOM_ERR', async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      executionOrder.push(1);
      throw new Error('Simulation failure');
    });

    const succeedingTask = queue.enqueue('ROOM_ERR', async () => {
      executionOrder.push(2);
      return 'ok';
    });

    await expect(failingTask).rejects.toThrow('Simulation failure');
    const result = await succeedingTask;
    expect(result).toBe('ok');
    expect(executionOrder).toEqual([1, 2]);
  });

  it('should clean up map entry once queue drains', async () => {
    const queue = new RoomCommandQueue();
    expect(queue.getActiveQueueCount()).toBe(0);

    const task = queue.enqueue('ROOM_CLEANUP', async () => {
      expect(queue.getActiveQueueCount()).toBe(1);
      return 42;
    });

    await task;
    expect(queue.getActiveQueueCount()).toBe(0);
  });
});
