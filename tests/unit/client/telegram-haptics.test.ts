import { describe, expect, it, vi } from 'vitest';
import { triggerHapticImpact, triggerHapticNotification } from '../../../src/utils/telegramHaptics';

describe('Telegram haptics', () => {
  it('sends impact and notification feedback when Telegram supports it', () => {
    const api = {
      impactOccurred: vi.fn(),
      notificationOccurred: vi.fn(),
    };

    triggerHapticImpact(api, 'light');
    triggerHapticNotification(api, 'success');

    expect(api.impactOccurred).toHaveBeenCalledWith('light');
    expect(api.notificationOccurred).toHaveBeenCalledWith('success');
  });

  it('is a safe no-op when Telegram haptics are unavailable or throw', () => {
    expect(() => triggerHapticImpact(undefined, 'light')).not.toThrow();
    expect(() => triggerHapticNotification(undefined, 'warning')).not.toThrow();
    expect(() => triggerHapticImpact({ impactOccurred: () => { throw new Error('unsupported'); } }, 'light')).not.toThrow();
  });
});
