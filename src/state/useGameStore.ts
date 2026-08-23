import { create } from 'zustand';
import type { 
  PlayerRole, 
  DiceRolledPayload, 
  DiscDroppedPayload, 
  RPSRoundResolvedPayload, 
  RPSChoiceCommittedPayload, 
  GameOverPayload,
  RoomStatePayload
} from '../../shared';
import { useRoomStore } from './useRoomStore';

interface GameState {
  gameState: Record<string, any>;
  activePlayer: PlayerRole;
  turnPhase: string;
  winner: string | null;
  gameVersion: number;
  
  lastDiceEvent: DiceRolledPayload | null;
  lastDropEvent: DiscDroppedPayload | null;
  lastRPSEvent: RPSRoundResolvedPayload | null;
  lastRPSCommit: RPSChoiceCommittedPayload | null;
  lastGameOverEvent: GameOverPayload | null;

  applyDiceRoll: (payload: DiceRolledPayload) => void;
  applyDiscDrop: (payload: DiscDroppedPayload) => void;
  applyRPSCommit: (payload: RPSChoiceCommittedPayload) => void;
  applyRPSRound: (payload: RPSRoundResolvedPayload) => void;
  applyGameOver: (payload: GameOverPayload) => void;
  syncFromRoom: (roomPayload: RoomStatePayload) => void;
  reset: () => void;
}

const initialState = {
  gameState: {},
  activePlayer: 'p1' as PlayerRole,
  turnPhase: 'WAITING_ROLL',
  winner: null,
  gameVersion: -1,
  lastDiceEvent: null,
  lastDropEvent: null,
  lastRPSEvent: null,
  lastRPSCommit: null,
  lastGameOverEvent: null,
};

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  applyDiceRoll: (payload) => {
    const state = get();
    const roomVersion = useRoomStore.getState().roomVersion;
    if (payload.version < roomVersion) return;

    set({
      gameVersion: payload.version,
      activePlayer: payload.nextPlayer,
      lastDiceEvent: payload,
      gameState: {
        ...state.gameState,
        p1Position: payload.player === 'p1' ? payload.to : state.gameState?.p1Position,
        p2Position: payload.player === 'p2' ? payload.to : state.gameState?.p2Position,
        lastRoll: payload.value,
        lastAction: payload.snakeOrLadder
          ? `${payload.player.toUpperCase()} landed on ${payload.snakeOrLadder.type} to ${payload.snakeOrLadder.to}`
          : `${payload.player.toUpperCase()} rolled ${payload.value}`,
      }
    });
  },

  applyDiscDrop: (payload) => {
    const state = get();
    const roomVersion = useRoomStore.getState().roomVersion;
    if (payload.version < roomVersion) return;

    set({
      gameVersion: payload.version,
      activePlayer: payload.nextPlayer,
      lastDropEvent: payload,
      gameState: {
        ...state.gameState,
        board: payload.board,
        lastDrop: { player: payload.player, row: payload.row, col: payload.col },
        winningCells: payload.winningCells || [],
        winner: payload.winner,
      }
    });
  },

  applyRPSCommit: (payload) => {
    const state = get();
    const roomVersion = useRoomStore.getState().roomVersion;
    if (payload.version < roomVersion) return;

    set({
      gameVersion: payload.version,
      lastRPSCommit: payload,
      gameState: {
        ...state.gameState,
        p1HasChosen: payload.player === 'p1' || Boolean(state.gameState?.p1HasChosen),
        p2HasChosen: payload.player === 'p2' || Boolean(state.gameState?.p2HasChosen),
        roundNumber: payload.round,
      }
    });
  },

  applyRPSRound: (payload) => {
    const state = get();
    const roomVersion = useRoomStore.getState().roomVersion;
    if (payload.version < roomVersion) return;

    set({
      gameVersion: payload.version,
      lastRPSEvent: payload,
      gameState: {
        ...state.gameState,
        p1Choice: payload.p1Choice,
        p2Choice: payload.p2Choice,
        roundWinner: payload.roundWinner,
        p1Score: payload.p1Score,
        p2Score: payload.p2Score,
        roundNumber: payload.round,
        p1HasChosen: false,
        p2HasChosen: false,
      }
    });
  },

  applyGameOver: (payload) => {
    const roomVersion = useRoomStore.getState().roomVersion;
    if (payload.version < roomVersion) return;

    set({
      gameVersion: payload.version,
      lastGameOverEvent: payload,
      winner: payload.winner,
    });
  },

  syncFromRoom: (roomPayload) => {
    set({
      gameVersion: roomPayload.version,
      gameState: roomPayload.gameState || {},
      activePlayer: roomPayload.activePlayer || 'p1',
      turnPhase: roomPayload.turnPhase || 'WAITING_ROLL',
      winner: roomPayload.winner || null,
      lastDiceEvent: null,
      lastDropEvent: null,
      lastRPSEvent: null,
      lastRPSCommit: null,
      lastGameOverEvent: null,
    });
  },

  reset: () => set(initialState),
}));
