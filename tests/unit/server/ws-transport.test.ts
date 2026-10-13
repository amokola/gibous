import { describe, expect, it, vi } from 'vitest';
import { sendWebSocketMessage } from '../../../server/wsTransport';
import { WebSocket } from 'ws';

describe('WebSocket transport sending', () => {
  it('closes with 1013 before a send would exceed the configured buffer cap', () => {
    const socket = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 10,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;
    const onBufferLimit = vi.fn();

    const sent = sendWebSocketMessage(socket, '123456', { maxBufferedBytes: 15, onBufferLimit });

    expect(sent).toBe(false);
    expect(socket.send).not.toHaveBeenCalled();
    expect(onBufferLimit).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledWith(1013, 'Client is too slow');
  });

  it('handles asynchronous send callback failures and closes with 1013', () => {
    const onSendError = vi.fn();
    const socket = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send: vi.fn((_data: string, callback: (error?: Error) => void) => callback(new Error('transport write failed'))),
      close: vi.fn(),
    } as unknown as WebSocket;

    expect(sendWebSocketMessage(socket, { type: 'PONG' }, { maxBufferedBytes: 100, onSendError })).toBe(true);

    expect(onSendError).toHaveBeenCalledOnce();
    expect(socket.close).toHaveBeenCalledWith(1013, 'WebSocket send failed');
  });

  it('counts UTF-8 bytes when checking the outbound buffer boundary', () => {
    const socket = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 0,
      send: vi.fn((_data: string, callback: (error?: Error) => void) => callback()),
      close: vi.fn(),
    } as unknown as WebSocket;

    expect(sendWebSocketMessage(socket, 'é', { maxBufferedBytes: 2 })).toBe(true);
    expect(socket.send).toHaveBeenCalledOnce();
  });
});
