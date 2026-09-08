export interface PreparedBragPhoto {
  type: 'photo';
  id: string;
  photo_url: string;
  thumbnail_url: string;
  photo_width: 1080;
  photo_height: 1350;
  reply_markup: {
    inline_keyboard: Array<Array<{ text: string; url: string }>>;
  };
}

export function buildPreparedBragPhoto(input: {
  imageUrl: string;
  challengeUrl: string;
}): PreparedBragPhoto {
  const token = input.imageUrl.split('/').at(-1)?.replace(/\.jpg$/, '') || 'card';
  const resultId = token.length > 40 ? token.slice(-40) : token;
  return {
    type: 'photo',
    id: `gibous-brag-${resultId}`,
    photo_url: input.imageUrl,
    thumbnail_url: input.imageUrl,
    photo_width: 1080,
    photo_height: 1350,
    reply_markup: {
      inline_keyboard: [[{
        text: '⚔️ Challenge me on Gibous',
        url: input.challengeUrl,
      }]],
    },
  };
}

interface TelegramApiResponse {
  ok: boolean;
  result?: {
    id: string;
    expiration_date?: number;
  };
  description?: string;
}

export type TelegramBragFetcher = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export class TelegramBragService {
  constructor(
    private readonly botToken = process.env.TELEGRAM_BOT_TOKEN || '',
    private readonly fetcher: TelegramBragFetcher = async (url, init) => fetch(url, init),
  ) {}

  async preparePhoto(userId: number, input: { imageUrl: string; challengeUrl: string }): Promise<{ id: string; expirationDate?: number }> {
    if (!this.botToken || this.botToken === 'DEMO_BOT_TOKEN') {
      throw new Error('Telegram bot token is not configured');
    }

    const response = await this.fetcher(
      `https://api.telegram.org/bot${this.botToken}/savePreparedInlineMessage`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          result: buildPreparedBragPhoto(input),
          allow_user_chats: true,
          allow_bot_chats: false,
          allow_group_chats: true,
          allow_channel_chats: false,
        }),
      },
    );
    const data = await response.json() as TelegramApiResponse;
    if (!response.ok || !data.ok || !data.result?.id) {
      throw new Error(data.description || 'Telegram could not prepare the brag card');
    }
    return { id: data.result.id, expirationDate: data.result.expiration_date };
  }
}
