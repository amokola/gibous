export interface TelegramSafeAreaInset {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface TelegramSafeAreaWebApp {
  safeAreaInset?: TelegramSafeAreaInset;
  contentSafeAreaInset?: TelegramSafeAreaInset;
  onEvent?: (eventType: string, eventHandler: () => void) => void;
  offEvent?: (eventType: string, eventHandler: () => void) => void;
}

export interface TelegramSafeAreaStyle {
  setProperty: (property: string, value: string) => void;
}

export interface TelegramSafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const SAFE_AREA_EVENTS = [
  'safeAreaChanged',
  'contentSafeAreaChanged',
  'viewportChanged',
] as const;

const SAFE_AREA_VARIABLES = {
  top: '--gibous-telegram-safe-area-top',
  right: '--gibous-telegram-safe-area-right',
  bottom: '--gibous-telegram-safe-area-bottom',
  left: '--gibous-telegram-safe-area-left',
} as const;

function normalizeInset(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function getTelegramSafeAreaInsets(webApp?: TelegramSafeAreaWebApp): TelegramSafeAreaInsets {
  const safeArea = webApp?.safeAreaInset;
  const contentSafeArea = webApp?.contentSafeAreaInset;

  return {
    top: Math.max(normalizeInset(safeArea?.top), normalizeInset(contentSafeArea?.top)),
    right: Math.max(normalizeInset(safeArea?.right), normalizeInset(contentSafeArea?.right)),
    bottom: Math.max(normalizeInset(safeArea?.bottom), normalizeInset(contentSafeArea?.bottom)),
    left: Math.max(normalizeInset(safeArea?.left), normalizeInset(contentSafeArea?.left)),
  };
}

export function applyTelegramSafeArea(
  style: TelegramSafeAreaStyle,
  webApp?: TelegramSafeAreaWebApp,
): void {
  const insets = getTelegramSafeAreaInsets(webApp);

  (Object.keys(SAFE_AREA_VARIABLES) as Array<keyof TelegramSafeAreaInsets>).forEach((edge) => {
    style.setProperty(SAFE_AREA_VARIABLES[edge], `${insets[edge]}px`);
  });
}

export function subscribeTelegramSafeArea(
  webApp: TelegramSafeAreaWebApp | undefined,
  style: TelegramSafeAreaStyle,
): () => void {
  const sync = () => applyTelegramSafeArea(style, webApp);
  sync();

  SAFE_AREA_EVENTS.forEach((eventType) => {
    webApp?.onEvent?.(eventType, sync);
  });

  return () => {
    SAFE_AREA_EVENTS.forEach((eventType) => {
      webApp?.offEvent?.(eventType, sync);
    });
  };
}
