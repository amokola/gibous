import React from 'react';
import { ConnectionState } from '../../../shared';

export interface ConnectionBannerProps {
  connectionState: ConnectionState;
  onReconnect?: () => void;
  className?: string;
}

export const ConnectionBanner: React.FC<ConnectionBannerProps> = ({
  connectionState,
  onReconnect,
  className = '',
}) => {
  if (connectionState === 'CONNECTED') {
    return null;
  }

  if (connectionState === 'CONNECTING') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`w-full shrink-0 z-30 bg-[#fff9c4] text-[#854d0e] border-2 border-black font-sketch text-xs font-bold px-3 py-1.5 flex items-center justify-center gap-2 sketch-shadow-xs animate-fade-in ${className}`.trim()}
      >
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span>Connecting...</span>
      </div>
    );
  }

  if (connectionState === 'RECONNECTING') {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`w-full shrink-0 z-30 bg-[#fef3c7] text-[#854d0e] border-2 border-black font-sketch text-xs font-bold px-3 py-1.5 flex items-center justify-between sketch-shadow-xs animate-fade-in ${className}`.trim()}
      >
        <div className="flex items-center gap-2">
          <span>⚠️ Reconnecting... your match is safe</span>
        </div>
      </div>
    );
  }

  if (connectionState === 'DISCONNECTED') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className={`w-full shrink-0 z-30 bg-[#fee2e2] text-[#991b1b] border-2 border-black font-sketch text-xs font-bold px-3 py-1.5 flex items-center justify-between sketch-shadow-xs animate-fade-in ${className}`.trim()}
      >
        <div className="flex items-center gap-2">
          <span>⚡ Connection lost.</span>
        </div>
        {onReconnect && (
          <button
            type="button"
            onClick={onReconnect}
            className="px-2 py-0.5 bg-white hover:bg-[#fbfaf7] text-black border border-black font-sketch text-xs font-bold active:translate-x-[1px] active:translate-y-[1px] transition-transform select-none cursor-pointer"
          >
            Reconnect
          </button>
        )}
      </div>
    );
  }

  return null;
};

export default ConnectionBanner;
