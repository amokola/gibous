import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
  (globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;
}

import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initEventRouter } from './state/eventRouter';
import './index.css';

// Initialize WebSocket → Zustand event routing before React renders
initEventRouter();

const TonConnectUIProvider = lazy(() =>
  import('@tonconnect/ui-react').then((module) => ({ default: module.TonConnectUIProvider }))
);

const getManifestUrl = (): string => {
  const envUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_TONCONNECT_MANIFEST_URL : undefined;
  if (envUrl && (envUrl.startsWith('https://') || envUrl.startsWith('http://'))) {
    return envUrl;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/tonconnect-manifest.json`;
  }
  return 'https://gibous.fourreal.xyz/tonconnect-manifest.json';
};

const manifestUrl = getManifestUrl();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <div className="telegram-app-shell w-full bg-[#e8e0d0] flex items-center justify-center font-sketch text-sm text-[#1a1a1a]/70">
          Loading Gibous…
        </div>
      }
    >
      <TonConnectUIProvider manifestUrl={manifestUrl}>
        <App />
      </TonConnectUIProvider>
    </Suspense>
  </React.StrictMode>
);
