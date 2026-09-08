import { createHmac, timingSafeEqual } from 'node:crypto';
import { getUtcDateKey } from './bragStats';

interface BragShareTokenPayload {
  telegramId: number;
  dateKey: string;
  expiresAt: number;
}

function encodePayload(payload: BragShareTokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function createBragShareToken(
  telegramId: number,
  date = new Date(),
  secret = process.env.TELEGRAM_BRAG_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'demo-brag-secret',
): string {
  const encodedPayload = encodePayload({
    telegramId,
    dateKey: getUtcDateKey(date),
    expiresAt: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  });
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

export function verifyBragShareToken(
  token: string,
  secret = process.env.TELEGRAM_BRAG_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'demo-brag-secret',
  now = new Date(),
): { telegramId: number; dateKey: string } | null {
  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) return null;

  const expectedSignature = sign(encodedPayload, secret);
  const providedBytes = Buffer.from(providedSignature);
  const expectedBytes = Buffer.from(expectedSignature);
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as BragShareTokenPayload;
    if (!Number.isSafeInteger(payload.telegramId) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.dateKey)) return null;
    if (!Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < Math.floor(now.getTime() / 1000)) return null;
    return { telegramId: payload.telegramId, dateKey: payload.dateKey };
  } catch {
    return null;
  }
}

export function dateFromBragShareKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00.000Z`);
}
