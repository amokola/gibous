import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const WS_RECONNECT_TICKET_TTL_SECONDS = 24 * 60 * 60;
const DEVELOPMENT_RECONNECT_SECRET = 'gibous-development-only-reconnect-secret-change-in-production';

interface ReconnectTicketClaims {
  v: 1;
  sub: number;
  iat: number;
  exp: number;
  jti: string;
}

export type ReconnectTicketVerification =
  | { valid: true; telegramId: number }
  | { valid: false; reason: 'malformed' | 'signature' | 'expired' | 'claims' };

export function getWsReconnectSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const configured = env.WS_RECONNECT_SECRET?.trim();
  if (configured) return configured;
  return env.NODE_ENV === 'production' ? undefined : DEVELOPMENT_RECONNECT_SECRET;
}

export function issueReconnectTicket(telegramId: number, secret: string, nowMs = Date.now()): string {
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw new Error('Reconnect ticket requires a positive Telegram user id');
  }
  if (secret.length < 32) {
    throw new Error('Reconnect ticket signing secret must be at least 32 characters');
  }

  const issuedAt = Math.floor(nowMs / 1000);
  const claims: ReconnectTicketClaims = {
    v: 1,
    sub: telegramId,
    iat: issuedAt,
    exp: issuedAt + WS_RECONNECT_TICKET_TTL_SECONDS,
    jti: randomUUID(),
  };
  const encodedClaims = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = sign(encodedClaims, secret).toString('base64url');
  return `${encodedClaims}.${signature}`;
}

export function verifyReconnectTicket(
  ticket: string,
  secret: string,
  nowMs = Date.now(),
): ReconnectTicketVerification {
  if (typeof ticket !== 'string' || ticket.length > 2048 || secret.length < 32) {
    return { valid: false, reason: 'malformed' };
  }

  const parts = ticket.split('.');
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) {
    return { valid: false, reason: 'malformed' };
  }

  const [encodedClaims, encodedSignature] = parts;
  let receivedSignature: Buffer;
  let claims: unknown;
  try {
    receivedSignature = Buffer.from(encodedSignature, 'base64url');
    if (receivedSignature.toString('base64url') !== encodedSignature) {
      return { valid: false, reason: 'malformed' };
    }
    claims = JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'malformed' };
  }

  const expectedSignature = sign(encodedClaims, secret);
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return { valid: false, reason: 'signature' };
  }

  if (!isClaims(claims)) return { valid: false, reason: 'claims' };
  const nowSeconds = Math.floor(nowMs / 1000);
  if (claims.iat > nowSeconds + 60 || claims.exp <= nowSeconds) {
    return { valid: false, reason: claims.exp <= nowSeconds ? 'expired' : 'claims' };
  }

  return { valid: true, telegramId: claims.sub };
}

function sign(encodedClaims: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(encodedClaims).digest();
}

function isClaims(value: unknown): value is ReconnectTicketClaims {
  if (!value || typeof value !== 'object') return false;
  const claims = value as Partial<ReconnectTicketClaims>;
  return claims.v === 1 &&
    Number.isSafeInteger(claims.sub) && Number(claims.sub) > 0 &&
    Number.isSafeInteger(claims.iat) && Number(claims.iat) >= 0 &&
    Number.isSafeInteger(claims.exp) &&
    typeof claims.jti === 'string' && /^[0-9a-f-]{36}$/i.test(claims.jti) &&
    claims.exp! - claims.iat! === WS_RECONNECT_TICKET_TTL_SECONDS;
}
