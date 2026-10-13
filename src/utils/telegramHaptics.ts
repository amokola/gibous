export type HapticImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type HapticNotificationType = 'error' | 'success' | 'warning';

export interface TelegramHapticApi {
  impactOccurred?: (style: HapticImpactStyle) => unknown;
  notificationOccurred?: (type: HapticNotificationType) => unknown;
}

export function triggerHapticImpact(api: TelegramHapticApi | undefined, style: HapticImpactStyle): void {
  try {
    api?.impactOccurred?.(style);
  } catch {
    // Haptics are optional and must never interrupt gameplay.
  }
}

export function triggerHapticNotification(api: TelegramHapticApi | undefined, type: HapticNotificationType): void {
  try {
    api?.notificationOccurred?.(type);
  } catch {
    // Haptics are optional and must never interrupt gameplay.
  }
}
