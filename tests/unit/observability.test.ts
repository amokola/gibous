import { afterEach, describe, expect, it, vi } from 'vitest';
import { actorKeyForLog } from '../../server/observability';

describe('actorKeyForLog', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('returns a stable pseudonym instead of the raw Telegram ID', () => {
    vi.stubEnv('LOG_PSEUDONYM_SECRET', 'test-only-log-secret');

    const actorKey = actorKeyForLog(6304557924);

    expect(actorKey).toMatch(/^[a-f0-9]{16}$/);
    expect(actorKey).toBe(actorKeyForLog(6304557924));
    expect(actorKey).not.toBe(String(6304557924));
    expect(actorKeyForLog(6304557925)).not.toBe(actorKey);
  });

  it('omits the actor pseudonym when no server secret is configured', () => {
    vi.stubEnv('LOG_PSEUDONYM_SECRET', '');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');

    expect(actorKeyForLog(6304557924)).toBeUndefined();
  });
});
