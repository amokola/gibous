import { WebSocket } from 'ws';

/**
 * Wait for a specific message type on a WebSocket client
 */
export function waitForMessage(
  ws: WebSocket,
  filter: (msg: any) => boolean,
  timeoutMs: number = 5000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for WebSocket message`));
    }, timeoutMs);

    function onMessage(data: string | Buffer) {
      try {
        const parsed = JSON.parse(data.toString());
        if (filter(parsed)) {
          clearTimeout(timer);
          ws.off('message', onMessage);
          resolve(parsed);
        }
      } catch {
        // Continue listening
      }
    }

    ws.on('message', onMessage);
  });
}

/**
 * Send a message on a WebSocket and wait for a response matching the requestId or type
 */
export async function sendAndAwaitResponse(
  ws: WebSocket,
  message: object & { type: string; requestId?: string },
  responseType?: string,
  timeoutMs: number = 5000
): Promise<any> {
  const reqId = message.requestId || `test-${Date.now()}-${Math.random()}`;
  message.requestId = reqId;

  const waitPromise = waitForMessage(
    ws,
    (msg) => {
      if (msg.requestId && msg.requestId === reqId) return true;
      if (responseType && msg.type === responseType) return true;
      return false;
    },
    timeoutMs
  );

  ws.send(JSON.stringify(message));
  return waitPromise;
}

/**
 * Connect a test WebSocket client
 */
export function connectTestClient(url: string, origin?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, origin ? { origin } : undefined);
    const timeout = setTimeout(() => {
      ws.terminate();
      reject(new Error(`Timeout connecting to ${url}`));
    }, 5000);

    ws.on('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
