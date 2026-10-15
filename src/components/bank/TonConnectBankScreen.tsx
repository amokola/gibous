import { Buffer } from 'buffer';
import React, { lazy, Suspense } from 'react';
import type { BankTransactionItem } from './BankScreen';

if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
  (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer ??= Buffer;
}

const BankScreen = lazy(() => import('./BankScreen').then((module) => ({ default: module.BankScreen })));
const TonConnectUIProvider = lazy(() =>
  import('@tonconnect/ui-react').then((module) => ({ default: module.TonConnectUIProvider })),
);

interface TonConnectBankScreenProps {
  balance: number;
  onSubmitDeposit?: React.ComponentProps<typeof BankScreen>['onSubmitDeposit'];
  onRequestWithdrawalQuote?: React.ComponentProps<typeof BankScreen>['onRequestWithdrawalQuote'];
  onConfirmWithdrawal?: React.ComponentProps<typeof BankScreen>['onConfirmWithdrawal'];
  initialTransactions?: BankTransactionItem[];
  activeDeposit?: React.ComponentProps<typeof BankScreen>['activeDeposit'];
}

const getManifestUrl = (): string => {
  const envUrl = import.meta.env.VITE_TONCONNECT_MANIFEST_URL;
  if (envUrl && (envUrl.startsWith('https://') || envUrl.startsWith('http://'))) return envUrl;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/tonconnect-manifest.json`;
  }
  return 'https://gibous.win/tonconnect-manifest.json';
};

export const TonConnectBankScreen: React.FC<TonConnectBankScreenProps> = (props) => (
  <Suspense fallback={<div className="p-6 text-center font-sketch">Loading wallet connection…</div>}>
    <TonConnectUIProvider manifestUrl={getManifestUrl()}>
      <BankScreen {...props} />
    </TonConnectUIProvider>
  </Suspense>
);
