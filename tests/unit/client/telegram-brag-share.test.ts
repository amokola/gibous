import { describe, expect, it, vi } from 'vitest';
import { requestPreparedBragShare } from '../../../src/services/telegramBragService';

describe('requestPreparedBragShare', () => {
  it('prepares the image and resolves sent when Telegram accepts it', async () => {
    const shareMessage = vi.fn((_id: string, callback: (sent: boolean) => void) => callback(true));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      preparedMessageId: 'prepared-1',
    }), { status: 200 }));

    await expect(requestPreparedBragShare('signed-init-data', { shareMessage }, fetcher)).resolves.toEqual({ status: 'sent' });
    expect(fetcher).toHaveBeenCalledWith('/api/telegram/brag/prepare', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ initData: 'signed-init-data' }),
    }));
    expect(shareMessage).toHaveBeenCalledWith('prepared-1', expect.any(Function));
  });

  it('reports cancellation separately from a successful share', async () => {
    const shareMessage = vi.fn((_id: string, callback: (sent: boolean) => void) => callback(false));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      preparedMessageId: 'prepared-2',
    }), { status: 200 }));

    await expect(requestPreparedBragShare('signed-init-data', { shareMessage }, fetcher)).resolves.toEqual({ status: 'cancelled' });
  });

  it('does not call the API when prepared media sharing is unavailable', async () => {
    const fetcher = vi.fn();

    await expect(requestPreparedBragShare('signed-init-data', {}, fetcher)).resolves.toEqual({ status: 'unsupported' });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
