import React, { useEffect, useState } from 'react';

export interface OpponentStatusOverlayProps {
  opponentDisconnected: boolean;
  opponentReconnected: boolean;
  timeoutSeconds?: number;
  className?: string;
}

export const OpponentStatusOverlay: React.FC<OpponentStatusOverlayProps> = ({
  opponentDisconnected,
  opponentReconnected,
  timeoutSeconds = 45,
  className = '',
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(timeoutSeconds);

  useEffect(() => {
    if (!opponentDisconnected) {
      setSecondsRemaining(timeoutSeconds);
      return;
    }

    setSecondsRemaining(timeoutSeconds);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [opponentDisconnected, timeoutSeconds]);

  if (opponentDisconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`w-full shrink-0 z-30 bg-[#fef3c7] border-2 border-black p-2 font-sketch text-sm sketch-shadow-xs flex items-center justify-between animate-fade-in ${className}`.trim()}
      >
        <div className="flex items-center gap-2">
          <span>⚠️ Opponent disconnected. Waiting...</span>
        </div>
        <span className="font-bold font-mono bg-[#fde68a] text-black px-2 py-0.5 border border-black/30 rounded">
          {secondsRemaining}s
        </span>
      </div>
    );
  }

  if (opponentReconnected) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`w-full shrink-0 z-30 bg-[#dcfce7] border-2 border-black text-[#166534] p-2 font-sketch text-sm sketch-shadow-xs flex items-center gap-2 animate-fade-in ${className}`.trim()}
      >
        <span>✅ Opponent reconnected!</span>
      </div>
    );
  }

  return null;
};

export default OpponentStatusOverlay;
