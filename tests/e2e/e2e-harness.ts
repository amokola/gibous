import { WebSocket } from 'ws';
import { server, storage } from '../../server/server';
import { DatabasePool } from '../../server/db/index';

let globalWsUrl: string | null = null;

/**
 * Ensures the HTTP/WebSocket server is listening on an ephemeral port.
 */
export async function ensureE2EServer(): Promise<string> {
  if (globalWsUrl && server.listening) {
    return globalWsUrl;
  }

  if (server.listening) {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3001;
    globalWsUrl = `ws://127.0.0.1:${port}/ws`;
    return globalWsUrl;
  }

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 3001;
      globalWsUrl = `ws://127.0.0.1:${port}/ws`;
      resolve();
    });
  });

  return globalWsUrl!;
}

/**
 * Creates or retrieves a test user in the database pool with initial balance.
 */
export async function setupE2EUser(telegramId: number, name: string = `Player_${telegramId}`, initialBalance: number = 10000): Promise<void> {
  const user = await storage.getOrCreateUser({
    id: telegramId,
    first_name: name,
    username: name.toLowerCase(),
  });
  if (user && user.balance_gram < 1000) {
    DatabasePool.getInstance().creditUserBalance(telegramId, initialBalance);
  }
}

/**
 * Gets user's current GRAM balance from the database pool.
 */
export function getE2EUserBalance(telegramId: number): number {
  const user = DatabasePool.getInstance().getUserByTelegramId(telegramId);
  return user ? user.balance_gram : 0;
}

/**
 * High-level E2E WebSocket Client wrapper.
 */
export class E2EClient {
  public ws!: WebSocket;
  public telegramId: number = 0;
  public playerName: string = '';
  public messages: any[] = [];
  private messageWaiters: Array<{
    filter: (msg: any) => boolean;
    resolve: (msg: any) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(private readonly url: string) {}

  async connect(origin: string = 'http://localhost:5173'): Promise<this> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, { origin });
      const timeout = setTimeout(() => {
        this.ws.terminate();
        reject(new Error(`E2EClient connection timeout to ${this.url}`));
      }, 5000);

      this.ws.on('open', () => {
        clearTimeout(timeout);
        resolve(this);
      });

      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
          this.messages.push(parsed);

          for (let i = this.messageWaiters.length - 1; i >= 0; i--) {
            const waiter = this.messageWaiters[i];
            if (waiter.filter(parsed)) {
              clearTimeout(waiter.timer);
              this.messageWaiters.splice(i, 1);
              waiter.resolve(parsed);
            }
          }
        } catch {
          // Ignore non-JSON
        }
      });
    });
  }

  send(message: object & { type: string; requestId?: string }): void {
    this.ws.send(JSON.stringify(message));
  }

  async sendAndAwait(
    message: object & { type: string; requestId?: string },
    expectedType?: string,
    timeoutMs: number = 5000
  ): Promise<any> {
    const reqId = message.requestId || `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    message.requestId = reqId;

    const waitPromise = this.waitForNext((msg) => {
      if (msg.requestId && msg.requestId === reqId) return true;
      if (expectedType && msg.type === expectedType) return true;
      return false;
    }, timeoutMs);

    this.send(message);
    return waitPromise;
  }

  waitForNext(filter: (msg: any) => boolean, timeoutMs: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.messageWaiters.findIndex((w) => w.timer === timer);
        if (idx !== -1) this.messageWaiters.splice(idx, 1);
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for WebSocket message`));
      }, timeoutMs);

      this.messageWaiters.push({ filter, resolve, reject, timer });
    });
  }

  waitFor(filter: (msg: any) => boolean, timeoutMs: number = 5000): Promise<any> {
    const existing = this.messages.find(filter);
    if (existing) {
      return Promise.resolve(existing);
    }
    return this.waitForNext(filter, timeoutMs);
  }

  waitForType(type: string, timeoutMs: number = 5000): Promise<any> {
    return this.waitForNext((msg) => msg.type === type, timeoutMs);
  }

  async auth(telegramId: number, playerName: string = `Player_${telegramId}`): Promise<any> {
    this.telegramId = telegramId;
    this.playerName = playerName;
    await setupE2EUser(telegramId, playerName);
    return this.sendAndAwait(
      {
        type: 'AUTH',
        payload: { telegramId, playerName },
      },
      'AUTH_OK'
    );
  }

  close(): void {
    for (const waiter of this.messageWaiters) {
      clearTimeout(waiter.timer);
    }
    this.messageWaiters = [];
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close();
    }
  }

  terminate(): void {
    for (const waiter of this.messageWaiters) {
      clearTimeout(waiter.timer);
    }
    this.messageWaiters = [];
    if (this.ws) {
      this.ws.terminate();
    }
  }
}

/**
 * Creates and connects an authenticated E2E client.
 */
export async function createAuthClient(telegramId: number, playerName?: string): Promise<E2EClient> {
  const url = await ensureE2EServer();
  const client = new E2EClient(url);
  await client.connect();
  await client.auth(telegramId, playerName || `Player_${telegramId}`);
  return client;
}

let codeCounter = 2000;
export function generateRoomCode(prefix: string = 'E2E'): string {
  codeCounter++;
  return `${prefix}${Date.now().toString().slice(-4)}${codeCounter}`;
}
