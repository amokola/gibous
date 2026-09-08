export type PreparedBragShareResult =
  | { status: 'sent' }
  | { status: 'cancelled' }
  | { status: 'unsupported' };

export interface TelegramBragShareApi {
  shareMessage?: (messageId: string, callback?: (sent: boolean) => void) => void;
}

export type BragPrepareFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface PrepareBragResponse {
  success?: boolean;
  preparedMessageId?: string;
  error?: string;
}

export async function requestPreparedBragShare(
  initData: string,
  telegram: TelegramBragShareApi,
  fetcher: BragPrepareFetcher = fetch,
): Promise<PreparedBragShareResult> {
  if (!telegram.shareMessage) return { status: 'unsupported' };

  const response = await fetcher('/api/telegram/brag/prepare', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initData }),
  });
  const payload = await response.json() as PrepareBragResponse;
  if (!response.ok || !payload.success || !payload.preparedMessageId) {
    throw new Error(payload.error || 'Could not prepare brag card');
  }

  return new Promise((resolve) => {
    telegram.shareMessage?.(payload.preparedMessageId as string, (sent) => {
      resolve({ status: sent ? 'sent' : 'cancelled' });
    });
  });
}
