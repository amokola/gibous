import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlayerRole } from '../../shared';

export type GameTitle = 'snake' | 'connect4' | 'rps';
export type ScreenState = 'home' | 'lobby' | 'game' | 'gameover';
export type ExtendedScreenState = ScreenState | 'waiting' | 'vs-intro';

export interface FloatingEmote {
  id: string;
  player: PlayerRole;
  emoji: string;
  timestamp: number;
}

interface UIState {
  currentScreen: ExtendedScreenState;
  selectedGame: GameTitle;
  floatingEmotes: FloatingEmote[];
  isMuted: boolean;

  setScreen: (screen: ExtendedScreenState) => void;
  setSelectedGame: (game: GameTitle) => void;
  addEmote: (emote: FloatingEmote) => void;
  setMuted: (val: boolean) => void;
  toggleMute: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      currentScreen: 'home',
      selectedGame: 'snake',
      floatingEmotes: [],
      isMuted: false,

      setScreen: (screen) => set({ currentScreen: screen }),
      
      setSelectedGame: (game) => set({ selectedGame: game }),
      
      addEmote: (emote) => set((state) => {
        const newEmotes = [...state.floatingEmotes, emote];
        if (newEmotes.length > 5) {
          return { floatingEmotes: newEmotes.slice(newEmotes.length - 5) };
        }
        return { floatingEmotes: newEmotes };
      }),
      
      setMuted: (val) => set({ isMuted: val }),
      
      toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
    }),
    {
      name: 'ui-storage',
      // Only persist isMuted
      partialize: (state) => ({ isMuted: state.isMuted }),
    }
  )
);
