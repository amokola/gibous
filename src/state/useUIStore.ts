import { create } from 'zustand';
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

  setScreen: (screen: ExtendedScreenState) => void;
  setSelectedGame: (game: GameTitle) => void;
  addEmote: (emote: FloatingEmote) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentScreen: 'home',
  selectedGame: 'snake',
  floatingEmotes: [],

  setScreen: (screen) => set({ currentScreen: screen }),

  setSelectedGame: (game) => set({ selectedGame: game }),

  addEmote: (emote) => set((state) => {
    const newEmotes = [...state.floatingEmotes, emote];
    if (newEmotes.length > 5) {
      return { floatingEmotes: newEmotes.slice(newEmotes.length - 5) };
    }
    return { floatingEmotes: newEmotes };
  }),
}));
