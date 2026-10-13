import { WebSocket } from 'ws';
import { logEvent } from './observability';

export interface WebSocketSendOptions {
  maxBufferedBytes: number;
  onBufferLimit?: () => void;
  onSendError?: (error: Error) => void;
}

export function sendWebSocketMessage(
  ws: WebSocket,
  message: object | string,
  options: WebSocketSendOptions,
): boolean {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  let data: string;
  try {
    data = typeof message === 'string' ? message : JSON.stringify(message);
  } catch {
    logEvent('warn', 'ws.send.failed', { reason: 'serialization' });
    return false;
  }

  if ((ws.bufferedAmount || 0) + Buffer.byteLength(data, 'utf8') > options.maxBufferedBytes) {
    logEvent('warn', 'ws.send.buffer_limit', {
      bufferedBytes: ws.bufferedAmount || 0,
      outgoingBytes: Buffer.byteLength(data, 'utf8'),
      limitBytes: options.maxBufferedBytes,
    });
    options.onBufferLimit?.();
    closeOverloadedSocket(ws, 'Client is too slow');
    return false;
  }

  try {
    ws.send(data, (error?: Error) => {
      if (!error) return;
      logEvent('warn', 'ws.send.failed', { errorName: error.name });
      options.onSendError?.(error);
      closeOverloadedSocket(ws, 'WebSocket send failed');
    });
    return true;
  } catch (error) {
    logEvent('warn', 'ws.send.failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    options.onSendError?.(error instanceof Error ? error : new Error('WebSocket send failed'));
    closeOverloadedSocket(ws, 'WebSocket send failed');
    return false;
  }
}

function closeOverloadedSocket(ws: WebSocket, reason: string): void {
  if (ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) return;
  try {
    ws.close(1013, reason);
  } catch {
    try {
      ws.terminate();
    } catch {
      // Socket is already gone.
    }
  }
}
