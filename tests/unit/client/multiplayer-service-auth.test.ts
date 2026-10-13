import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: string[] = [];

  constructor(_url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

let service: any;

describe('MultiplayerService authentication reconnect behavior', () => {
  beforeAll(async () => {
    vi.doUnmock('@/services/multiplayerService');
    vi.resetModules();
    const clientModule = await import('../../../src/services/multiplayerService');
    service = clientModule.multiplayerService;
  });

  beforeEach(() => {
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    MockWebSocket.instances = [];
    service.disconnect();
    service.authPayload = null;
    service.pendingAuthRequestId = null;
    service.authTerminalFailure = false;
    service.reconnectAttempts = 0;
    service.isOnline = true;
  });

  afterEach(() => {
    service.disconnect();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('stops retries after AUTH_FAILED and shows the reopen-app state', () => {
    service.authenticate({ telegramId: 42, playerName: 'Player', initData: 'telegram-init-data' });
    const socket = MockWebSocket.instances[0];
    socket.open();
    socket.receive({ type: 'ERROR', payload: { code: 'AUTH_FAILED', message: 'Reopen the app from Telegram.' } });
    socket.close(1008, 'Authentication failed');

    vi.advanceTimersByTime(60_000);

    expect(service.getConnectionState()).toBe('AUTH_REQUIRED');
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('treats policy close 1008 as terminal, but retries overload close 1013', () => {
    service.authenticate({ telegramId: 42, playerName: 'Player', initData: 'telegram-init-data' });
    MockWebSocket.instances[0].open();
    MockWebSocket.instances[0].close(1008, 'Policy violation');
    expect(service.getConnectionState()).toBe('AUTH_REQUIRED');

    service.authenticate({ telegramId: 42, playerName: 'Player', initData: 'fresh-init-data' });
    const authenticatedAttempt = MockWebSocket.instances.at(-1)!;
    authenticatedAttempt.open();
    authenticatedAttempt.close(1013, 'Try again later');
    expect(service.getConnectionState()).toBe('RECONNECTING');

    vi.advanceTimersByTime(1_000);
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('retains a refreshed reconnect ticket and sends it with initData on the next socket', () => {
    service.authenticate({ telegramId: 42, playerName: 'Player', initData: 'telegram-init-data' });
    const firstSocket = MockWebSocket.instances[0];
    firstSocket.open();
    firstSocket.receive({
      type: 'AUTH_OK',
      payload: { telegramId: 42, user: {}, reconnectTicket: 'signed-ticket-v2' },
    });
    firstSocket.close(1013, 'Try again later');
    vi.advanceTimersByTime(1_000);

    const nextSocket = MockWebSocket.instances[1];
    nextSocket.open();
    const auth = nextSocket.sent.map((frame) => JSON.parse(frame)).find((frame) => frame.type === 'AUTH');
    expect(auth.payload.reconnectTicket).toBe('signed-ticket-v2');
    expect(auth.payload.initData).toBe('telegram-init-data');
  });
});
