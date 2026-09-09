/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PORT?: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_WS_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_TELEGRAM_BOT_USERNAME?: string;
  readonly VITE_TELEGRAM_BOT_APP_URL?: string;
  readonly VITE_COMMUNITY_URL?: string;
  readonly VITE_SUPPORT_URL?: string;
  readonly VITE_TON_NETWORK?: string;
  readonly VITE_TON_ASSET_MODE?: string;
  readonly VITE_SYSTEM_DEPOSIT_ADDRESS?: string;
  readonly VITE_TONCONNECT_MANIFEST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  Buffer: typeof import('buffer').Buffer;
}
