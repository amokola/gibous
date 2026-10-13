import { describe, expect, it } from 'vitest';
import { BoundedInboundQueue } from '../../../server/wsInboundQueue';

describe('BoundedInboundQueue', () => {
  it('rejects messages before either queued count or byte limits can be exceeded', async () => {
    const queue = new BoundedInboundQueue(2, 5);
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => { release = resolve; });

    expect(queue.enqueue(2, () => blocker)).toBe(true);
    expect(queue.enqueue(3, async () => undefined)).toBe(true);
    expect(queue.enqueue(1, async () => undefined)).toBe(false);
    expect(queue.queuedMessages).toBe(2);
    expect(queue.queuedBytes).toBe(5);

    release();
    await queue.drain();
    expect(queue.queuedMessages).toBe(0);
    expect(queue.queuedBytes).toBe(0);
  });

  it('serializes work and continues after one task rejects', async () => {
    const queue = new BoundedInboundQueue(3, 20);
    const order: number[] = [];

    expect(queue.enqueue(1, async () => { order.push(1); throw new Error('failure'); })).toBe(true);
    expect(queue.enqueue(1, async () => { order.push(2); })).toBe(true);

    await queue.drain();
    expect(order).toEqual([1, 2]);
  });

  it('reports time spent waiting behind earlier work', async () => {
    const queue = new BoundedInboundQueue(2, 20);
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => { release = resolve; });
    let observedWaitMs = -1;

    expect(queue.enqueue(1, () => blocker)).toBe(true);
    expect(queue.enqueue(1, (waitMs) => { observedWaitMs = waitMs; })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    await queue.drain();

    expect(observedWaitMs).toBeGreaterThanOrEqual(15);
  });
});
