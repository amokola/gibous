import { create } from 'zustand';
import type { RoomStatePayload, PlayerRole } from '../../shared';

interface RoomState {
  currentRoom: RoomStatePayload | null;
  openRooms: any[];
  myRole: PlayerRole | null;
  roomVersion: number;

  setRoom: (room: RoomStatePayload | null) => void;
  clearRoom: () => void;
  setOpenRooms: (rooms: any[]) => void;
  setMyRole: (role: PlayerRole | null) => void;
  resolveMyRole: (telegramId: number) => void;
  updateRoomFromEvent: (patch: Partial<RoomStatePayload> & { version?: number }) => void;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  currentRoom: null,
  openRooms: [],
  myRole: null,
  roomVersion: -1,

  setRoom: (room) => set({ 
    currentRoom: room, 
    roomVersion: room?.version ?? -1 
  }),

  clearRoom: () => set({ 
    currentRoom: null, 
    myRole: null, 
    roomVersion: -1 
  }),

  setOpenRooms: (openRooms) => set({ openRooms }),

  setMyRole: (myRole) => set({ myRole }),

  resolveMyRole: (telegramId: number) => {
    const { currentRoom } = get();
    if (!currentRoom) return set({ myRole: null });
    
    if (currentRoom.p1?.telegramId === telegramId) {
      set({ myRole: 'p1' });
    } else if (currentRoom.p2?.telegramId === telegramId) {
      set({ myRole: 'p2' });
    } else {
      set({ myRole: null });
    }
  },

  updateRoomFromEvent: (patch) => {
    const state = get();
    const patchVersion = patch.version ?? -1;
    
    // Only apply if version is newer or equal
    if (patchVersion >= state.roomVersion) {
      set({
        currentRoom: state.currentRoom ? { ...state.currentRoom, ...patch } : (patch as RoomStatePayload),
        roomVersion: patchVersion
      });
    }
  }
}));
