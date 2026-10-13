export class BoundedInboundQueue {
  private chain: Promise<void> = Promise.resolve();
  private messageCount = 0;
  private byteCount = 0;

  constructor(
    private readonly maxMessages: number,
    private readonly maxBytes: number,
  ) {
    if (!Number.isSafeInteger(maxMessages) || maxMessages < 1) throw new Error('maxMessages must be a positive integer');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('maxBytes must be a positive integer');
  }

  get queuedMessages(): number {
    return this.messageCount;
  }

  get queuedBytes(): number {
    return this.byteCount;
  }

  enqueue(messageBytes: number, task: (queueWaitMs: number) => Promise<void> | void): boolean {
    if (!Number.isSafeInteger(messageBytes) || messageBytes < 0) return false;
    if (this.messageCount >= this.maxMessages || this.byteCount + messageBytes > this.maxBytes) return false;

    const enqueuedAt = performance.now();
    this.messageCount++;
    this.byteCount += messageBytes;
    const next = this.chain.then(() => task(performance.now() - enqueuedAt));
    this.chain = next.catch(() => undefined).finally(() => {
      this.messageCount--;
      this.byteCount -= messageBytes;
    });
    return true;
  }

  drain(): Promise<void> {
    return this.chain;
  }
}
