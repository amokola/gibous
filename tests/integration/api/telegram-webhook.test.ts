import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../../server/server';

describe('Telegram webhook authentication', () => {
  const secret = 'unit-test-webhook-secret-1234567890';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456789:fixture-token');
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', secret);
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rejects unauthenticated /start requests before they can call the bot API', async () => {
    const response = await request(app)
      .post('/api/telegram/webhook')
      .send({ message: { text: '/start', chat: { id: 12345 } } });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the webhook secret is not configured', async () => {
    vi.stubEnv('TELEGRAM_WEBHOOK_SECRET', '');

    const response = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', secret)
      .send({ message: { text: '/start', chat: { id: 12345 } } });

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects requests with an incorrect webhook secret', async () => {
    const response = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', 'incorrect-secret')
      .send({ message: { text: '/start', chat: { id: 12345 } } });

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts requests carrying the configured secret', async () => {
    const response = await request(app)
      .post('/api/telegram/webhook')
      .set('X-Telegram-Bot-Api-Secret-Token', secret)
      .send({ message: { text: '/start', chat: { id: 12345 } } });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
