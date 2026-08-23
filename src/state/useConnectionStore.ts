import { create } from 'zustand';
import type { ConnectionState } from '../../shared';

interface ConnectionStoreState {
  connectionState: ConnectionState;
  opponentDisconnected: boolean;
  opponentReconnected: boolean;
  disconnectTimeoutMs: number;
  lastError: string | null;

  setConnectionState: (state: ConnectionState) => void;
  setOpponentDisconnected: (timeoutMs?: number) => void;
  setOpponentReconnected: () => void;
  clearOpponentStatus: () => void;
  setError: (msg: string) => void;
  clearError: () => void;
}

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

export const useConnectionStore = create<ConnectionStoreState>((set) => ({
  connectionState: 'DISCONNECTED',
  opponentDisconnected: false,
  opponentReconnected: false,
  disconnectTimeoutMs: 45000,
  lastError: null,

  setConnectionState: (state) => set({ connectionState: state }),

  setOpponentDisconnected: (timeoutMs?: number) => {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    set({
      opponentDisconnected: true,
      opponentReconnected: false,
      ...(timeoutMs ? { disconnectTimeoutMs: timeoutMs } : {})
    });
  },

  setOpponentReconnected: () => {
    set({
      opponentDisconnected: false,
      opponentReconnected: true
    });

    if (dismissTimer) {
      clearTimeout(dismissTimer);
    }
    
    dismissTimer = setTimeout(() => {
      set({ opponentReconnected: false });
      dismissTimer = null;
    }, 3000);
  },

  clearOpponentStatus: () => {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    set({
      opponentDisconnected: false,
      opponentReconnected: false
    });
  },

  setError: (msg) => set({ lastError: msg }),
  
  clearError: () => set({ lastError: null }),
}));
