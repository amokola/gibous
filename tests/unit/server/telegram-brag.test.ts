import { describe, expect, it } from 'vitest';
import { buildPreparedBragPhoto, TelegramBragService } from '../../../server/telegramBrag';
import { createBragShareToken, verifyBragShareToken } from '../../../server/bragShareToken';

describe('buildPreparedBragPhoto', () => {
  it('creates an image-only share payload with a Mini App inline button', () => {
    const payload = buildPreparedBragPhoto({
      imageUrl: 'https://gibous.example/api/telegram/brag/image/share-token.jpg',
      challengeUrl: 'https://t.me/gibous_bot/app?startapp=brag_share-token',
    });

    expect(payload).toEqual({
      type: 'photo',
      id: 'gibous-brag-share-token',
      photo_url: 'https://gibous.example/api/telegram/brag/image/share-token.jpg',
      thumbnail_url: 'https://gibous.example/api/telegram/brag/image/share-token.jpg',
      photo_width: 1080,
      photo_height: 1350,
      reply_markup: {
        inline_keyboard: [[{
          text: '⚔️ Challenge me on Gibous',
          url: 'https://t.me/gibous_bot/app?startapp=brag_share-token',
        }]],
      },
    });
    expect('caption' in payload).toBe(false);
  });
});

describe('brag share preparation', () => {
  it('round-trips a signed share token without exposing the raw user id in the token body', () => {
    const token = createBragShareToken(42, new Date('2026-08-23T12:00:00.000Z'), 'test-secret');
    const verified = verifyBragShareToken(token, 'test-secret', new Date('2026-08-23T12:30:00.000Z'));

    expect(token).not.toContain('42');
    expect(verified).toEqual({ telegramId: 42, dateKey: '2026-08-23' });
  });

  it('sends the prepared photo to Telegram with user and group sharing enabled', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const service = new TelegramBragService('bot-token', async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      return new Response(JSON.stringify({ ok: true, result: { id: 'prepared-1', expiration_date: 1_800_000_000 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    await expect(service.preparePhoto(42, {
      imageUrl: 'https://gibous.example/card.jpg',
      challengeUrl: 'https://t.me/gibous_bot/app?startapp=brag_token',
    })).resolves.toEqual({ id: 'prepared-1', expirationDate: 1_800_000_000 });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.telegram.org/botbot-token/savePreparedInlineMessage');
    expect(calls[0].body).toMatchObject({
      user_id: 42,
      allow_user_chats: true,
      allow_group_chats: true,
      allow_channel_chats: false,
    });
  });
});
