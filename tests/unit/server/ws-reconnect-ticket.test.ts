import { describe, expect, it } from 'vitest';
import { issueReconnectTicket, verifyReconnectTicket } from '../../../server/wsReconnectTicket';

const SECRET = 'unit-test-reconnect-secret-with-32-bytes-minimum';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('WebSocket reconnect tickets', () => {
  it('signs a ticket that authenticates its Telegram user id for 24 hours', () => {
    const ticket = issueReconnectTicket(555001, SECRET, 1_800_000_000_000);

    expect(verifyReconnectTicket(ticket, SECRET, 1_800_000_000_000 + DAY_MS - 1)).toEqual({
      valid: true,
      telegramId: 555001,
    });
  });

  it('rejects a ticket at its expiration time', () => {
    const issuedAt = 1_800_000_000_000;
    const ticket = issueReconnectTicket(555002, SECRET, issuedAt);

    expect(verifyReconnectTicket(ticket, SECRET, issuedAt + DAY_MS)).toEqual({
      valid: false,
      reason: 'expired',
    });
  });

  it('rejects tickets whose signed contents or signature were changed', () => {
    const ticket = issueReconnectTicket(555003, SECRET, 1_800_000_000_000);
    const [body, signature] = ticket.split('.');
    const changedSignature = `${ticket.slice(0, -1)}${ticket.endsWith('A') ? 'B' : 'A'}`;
    const changedBody = `${Buffer.from(JSON.stringify({ v: 1, sub: 42, iat: 1_800_000_000, exp: 1_800_086_400 })).toString('base64url')}.${signature}`;

    expect(verifyReconnectTicket(changedSignature, SECRET, 1_800_000_000_000).valid).toBe(false);
    expect(verifyReconnectTicket(changedBody, SECRET, 1_800_000_000_000).valid).toBe(false);
    expect(body).toBeTruthy();
  });

  it('issues a fresh expiry when authentication succeeds again', () => {
    const first = issueReconnectTicket(555004, SECRET, 1_800_000_000_000);
    const refreshed = issueReconnectTicket(555004, SECRET, 1_800_000_002_000);

    expect(refreshed).not.toBe(first);
    expect(verifyReconnectTicket(refreshed, SECRET, 1_800_000_002_000).valid).toBe(true);
  });
});
