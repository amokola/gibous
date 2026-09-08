import { describe, expect, it, vi } from 'vitest';
import {
  subscribeTelegramSafeArea,
  type TelegramSafeAreaWebApp,
} from '../../../src/utils/telegramSafeArea';

describe('Telegram safe-area bridge', () => {
  it('uses the largest system or Telegram-content inset for each edge', () => {
    const webApp: TelegramSafeAreaWebApp = {
      safeAreaInset: { top: 24, right: 8, bottom: 34, left: 0 },
      contentSafeAreaInset: { top: 48, right: 4, bottom: 12, left: 3 },
    };
    const style = { setProperty: vi.fn() };

    subscribeTelegramSafeArea(webApp, style);

    expect(style.setProperty).toHaveBeenCalledWith('--gibous-telegram-safe-area-top', '48px');
    expect(style.setProperty).toHaveBeenCalledWith('--gibous-telegram-safe-area-right', '8px');
    expect(style.setProperty).toHaveBeenCalledWith('--gibous-telegram-safe-area-bottom', '34px');
    expect(style.setProperty).toHaveBeenCalledWith('--gibous-telegram-safe-area-left', '3px');
  });

  it('refreshes on Telegram inset and viewport changes and removes listeners on cleanup', () => {
    const handlers = new Map<string, () => void>();
    const webApp: TelegramSafeAreaWebApp = {
      safeAreaInset: { top: 20 },
      onEvent: vi.fn((event, handler) => handlers.set(event, handler)),
      offEvent: vi.fn((event, handler) => {
        if (handlers.get(event) === handler) handlers.delete(event);
      }),
    };
    const style = { setProperty: vi.fn() };

    const cleanup = subscribeTelegramSafeArea(webApp, style);
    expect(style.setProperty).toHaveBeenCalledWith('--gibous-telegram-safe-area-top', '20px');
    expect(handlers.has('safeAreaChanged')).toBe(true);
    expect(handlers.has('contentSafeAreaChanged')).toBe(true);
    expect(handlers.has('viewportChanged')).toBe(true);

    webApp.safeAreaInset = { top: 56 };
    handlers.get('safeAreaChanged')?.();
    expect(style.setProperty).toHaveBeenCalledWith('--gibous-telegram-safe-area-top', '56px');

    cleanup();
    expect(webApp.offEvent).toHaveBeenCalledTimes(3);
    expect(handlers.size).toBe(0);
  });
});
