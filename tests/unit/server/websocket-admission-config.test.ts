import { describe, expect, it } from 'vitest';
import { readWebSocketLimits, getWebSocketProductionConfigErrors } from '../../../server/wsConfig';
import { resolveWebSocketClientIp } from '../../../server/websocketAdmission';

describe('WebSocket admission configuration', () => {
  it('uses deployment-configured connection, rate, buffer, and queue limits', () => {
    const limits = readWebSocketLimits({
      WS_MAX_CONNECTIONS_PER_IP: '8',
      WS_MAX_TOTAL_CONNECTIONS: '420',
      WS_TRANSPORT_BURST: '17',
      WS_MAX_QUEUED_MESSAGES: '24',
      WS_MAX_QUEUED_BYTES: '65536',
    } as NodeJS.ProcessEnv);

    expect(limits.maxConnectionsPerIp).toBe(8);
    expect(limits.maxTotalConnections).toBe(420);
    expect(limits.transportBurst).toBe(17);
    expect(limits.maxQueuedMessages).toBe(24);
    expect(limits.maxQueuedBytes).toBe(65536);
  });

  it('rejects invalid limit values and requires a measured production total cap', () => {
    expect(() => readWebSocketLimits({ WS_MAX_QUEUED_BYTES: '0' } as NodeJS.ProcessEnv)).toThrow('WS_MAX_QUEUED_BYTES');
    expect(getWebSocketProductionConfigErrors({ NODE_ENV: 'production' } as NodeJS.ProcessEnv))
      .toContain('WS_MAX_TOTAL_CONNECTIONS (set from the production-equivalent load harness)');
    expect(getWebSocketProductionConfigErrors({ NODE_ENV: 'production', WS_MAX_TOTAL_CONNECTIONS: '250' } as NodeJS.ProcessEnv))
      .toEqual([]);
  });
});

describe('WebSocket client IP resolution', () => {
  it('ignores forwarded headers from an untrusted direct peer', () => {
    expect(resolveWebSocketClientIp('203.0.113.5', '198.51.100.9', new Set(['198.51.100.9'])))
      .toBe('203.0.113.5');
  });

  it('walks past configured trusted proxies and uses the nearest untrusted address', () => {
    const trusted = new Set(['192.0.2.20', '192.0.2.10']);
    expect(resolveWebSocketClientIp('192.0.2.20', '198.51.100.44, 192.0.2.10', trusted))
      .toBe('198.51.100.44');
  });

  it('falls back to the direct peer when a trusted proxy sends malformed forwarded data', () => {
    expect(resolveWebSocketClientIp('192.0.2.20', 'not-an-ip', new Set(['192.0.2.20'])))
      .toBe('192.0.2.20');
  });
});
