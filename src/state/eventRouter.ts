import { multiplayerService } from '../services/multiplayerService';
import {
  useAuthStore,
  useRoomStore,
  useGameStore,
  useConnectionStore,
  useUIStore,
} from './index';
import {
  RoomStatePayload,
  PlayerRole,
  GameType,
  RPSChoice,
  ConnectionState,
  DiceRolledPayload,
  DiscDroppedPayload,
  RPSRoundResolvedPayload,
  RPSChoiceCommittedPayload,
  GameOverPayload,
  PendingTransaction,
  RematchFailedPayload,
} from '../../shared';

let myTelegramId: number | null = null;
let initialized = false;

export function getMyTelegramId(): number | null {
  return myTelegramId;
}

export function setMyTelegramId(id: number): void {
  myTelegramId = id;
}

export function initEventRouter() {
  if (initialized) return;
  initialized = true;

  multiplayerService.onStateChange((state) => {
    useConnectionStore.getState().setConnectionState(state as ConnectionState);
  });

  // Auth events
  multiplayerService.on<{ user: any; telegramId?: number }>('AUTH_OK', (payload) => {
    useAuthStore.getState().setUser(payload.user);
    if (payload.telegramId) {
      setMyTelegramId(payload.telegramId);
    }
    const persistedRoomCode = multiplayerService.getCurrentRoomCode();
    if (persistedRoomCode) {
      multiplayerService.send('SYNC_ROOM', { roomCode: persistedRoomCode });
    }
  });

  multiplayerService.on<any>('ACCOUNT_UPDATED', (payload) => {
    const user = payload?.user || payload;
    if (user) {
      useAuthStore.getState().setUser(user);
    }
  });

  multiplayerService.on<PendingTransaction>('TRANSACTION_PENDING', (payload) => {
    useAuthStore.getState().setPendingTransaction(payload);
    useAuthStore.getState().addTransactionOptimistic(payload);
  });

  // Room events
  multiplayerService.on<RoomStatePayload>('ROOM_CREATED', (payload) => {
    useRoomStore.getState().setRoom(payload);
    if (myTelegramId) {
      useRoomStore.getState().resolveMyRole(myTelegramId);
    }
    useGameStore.getState().reset();
    multiplayerService.setCurrentRoomCode(payload.code);
  });

  multiplayerService.on<{ roomCode: string }>('ROOM_CANCELLED', (payload) => {
    if (multiplayerService.getCurrentRoomCode() === payload.roomCode) {
      useRoomStore.getState().clearRoom();
      useGameStore.getState().reset();
      multiplayerService.setCurrentRoomCode(null);
    }
  });

  multiplayerService.on<RoomStatePayload>('GAME_START', (payload) => {
    useRoomStore.getState().setRoom(payload);
    if (myTelegramId) {
      useRoomStore.getState().resolveMyRole(myTelegramId);
    }
    useGameStore.getState().syncFromRoom(payload);
    useConnectionStore.getState().clearOpponentStatus();
    multiplayerService.setCurrentRoomCode(payload.code);
  });

  multiplayerService.on<RoomStatePayload>('ROOM_STATE', (payload) => {
    const currentRoom = useRoomStore.getState().currentRoom;
    if (!currentRoom || payload.version >= currentRoom.version) {
      useRoomStore.getState().setRoom(payload);
      if (myTelegramId) {
        useRoomStore.getState().resolveMyRole(myTelegramId);
      }
      useGameStore.getState().syncFromRoom(payload);
    }
  });

  multiplayerService.on<{ rooms: any[] }>('ROOMS_LIST', (payload) => {
    useRoomStore.getState().setOpenRooms(payload.rooms || []);
  });

  // Game events
  multiplayerService.on<DiceRolledPayload>('DICE_ROLLED', (payload) => {
    useGameStore.getState().applyDiceRoll(payload);
    useRoomStore.getState().updateRoomFromEvent({
      version: payload.version,
      activePlayer: payload.nextPlayer,
      gameState: (payload as any).patch || useGameStore.getState().gameState,
    });
  });

  multiplayerService.on<DiscDroppedPayload>('DISC_DROPPED', (payload) => {
    useGameStore.getState().applyDiscDrop(payload);
    useRoomStore.getState().updateRoomFromEvent({
      version: payload.version,
      activePlayer: payload.nextPlayer,
      gameState: (payload as any).patch || useGameStore.getState().gameState,
    });
  });

  multiplayerService.on<RPSChoiceCommittedPayload>('RPS_CHOICE_COMMITTED', (payload) => {
    useGameStore.getState().applyRPSCommit(payload);
    useRoomStore.getState().updateRoomFromEvent({
      version: payload.version,
      gameState: useGameStore.getState().gameState,
    });
  });

  multiplayerService.on<RPSRoundResolvedPayload>('RPS_ROUND_RESOLVED', (payload) => {
    useGameStore.getState().applyRPSRound(payload);
    useRoomStore.getState().updateRoomFromEvent({
      version: payload.version,
      gameState: (payload as any).patch || useGameStore.getState().gameState,
    });
  });

  multiplayerService.on<GameOverPayload>('GAME_OVER', (payload) => {
    useGameStore.getState().applyGameOver(payload);
    useRoomStore.getState().updateRoomFromEvent({
      status: 'gameover',
      winner: payload.winner,
      version: payload.version,
    });
    useConnectionStore.getState().clearOpponentStatus();
    useConnectionStore.getState().clearError();
  });

  multiplayerService.on<{ roomCode: string; winner: PlayerRole | 'draw' | null; settlementStatus?: 'failed'; version: number }>('SETTLEMENT_PENDING', (payload) => {
    useRoomStore.getState().updateRoomFromEvent({
      status: 'gameover',
      winner: payload.winner,
      settlementStatus: payload.settlementStatus,
      version: payload.version,
    });
    if (payload.settlementStatus === 'failed') {
      useConnectionStore.getState().setError('Payout confirmation encountered a delay. Retrying...');
    }
  });

  multiplayerService.on<RematchFailedPayload>('REMATCH_FAILED', (payload) => {
    useConnectionStore.getState().setError(payload.reason || 'Rematch failed. Please try again.');
  });

  // Connection events
  multiplayerService.on<{ player: PlayerRole; timeoutMs?: number }>('PLAYER_DISCONNECTED', (payload) => {
    if (payload.player !== useRoomStore.getState().myRole) {
      useConnectionStore.getState().setOpponentDisconnected(payload.timeoutMs);
    }
  });

  multiplayerService.on<{ player: PlayerRole }>('PLAYER_RECONNECTED', (payload) => {
    if (payload.player !== useRoomStore.getState().myRole) {
      useConnectionStore.getState().setOpponentReconnected();
    }
  });

  // UI events
  multiplayerService.on<{ emoji: string; player: PlayerRole }>('EMOTE', (payload) => {
    useUIStore.getState().addEmote({
      id: Math.random().toString(36).substring(2, 9),
      emoji: payload.emoji,
      player: payload.player,
      timestamp: Date.now(),
    });
  });

  // Error events
  multiplayerService.on<{ message?: string }>('ERROR', (payload) => {
    useConnectionStore.getState().setError(payload.message || 'Something went wrong. Please try again.');
  });

  // Register every handler before opening the socket so an immediately
  // completing handshake cannot race the event router.
  multiplayerService.connect();
}

// Actions

function checkAuthAndConnection(): boolean {
  const isAuth = !!useAuthStore.getState().user;
  const isConnected = useConnectionStore.getState().connectionState === 'CONNECTED';
  const isTransportAuthenticated = multiplayerService.isAuthenticated?.() ?? isConnected;
  if (!isAuth || !isConnected || !isTransportAuthenticated) {
    useConnectionStore.getState().setError('Please wait, connecting...');
    return false;
  }
  return true;
}

export function authenticate(telegramId: number, playerName: string, avatarUrl?: string, initData?: string) {
  setMyTelegramId(telegramId);
  multiplayerService.authenticate({
    telegramId,
    playerName,
    avatarUrl,
    initData,
  });
}

export function createDuel(gameType: GameType, stake: number, playerName: string, avatarUrl?: string) {
  if (!checkAuthAndConnection()) return;
  multiplayerService.send('CREATE_ROOM', {
    gameType,
    stake,
    playerName,
    avatarUrl,
  });
}

export function joinDuel(roomCode: string, playerName: string, avatarUrl?: string) {
  if (!checkAuthAndConnection()) return;
  multiplayerService.send('JOIN_ROOM', {
    roomCode,
    playerName,
    avatarUrl,
  });
}

export function cancelDuel(roomCode: string) {
  multiplayerService.send('CANCEL_ROOM', { roomCode });
  useRoomStore.getState().clearRoom();
  useGameStore.getState().reset();
  multiplayerService.setCurrentRoomCode(null);
}

export function leaveDuel(roomCode: string) {
  multiplayerService.send('LEAVE_ROOM', { roomCode });
  useRoomStore.getState().clearRoom();
  useGameStore.getState().reset();
  useConnectionStore.getState().clearOpponentStatus();
  multiplayerService.setCurrentRoomCode(null);
}

export function sendSnakeRoll(roomCode: string) {
  multiplayerService.send('ROLL_DICE', { roomCode });
}

export function sendConnect4Drop(roomCode: string, column: number) {
  multiplayerService.send('DROP_DISC', { roomCode, column });
}

export function sendRPSChoice(roomCode: string, choice: RPSChoice) {
  multiplayerService.send('CHOOSE_RPS', { roomCode, choice });
}

export function sendEmote(roomCode: string, emoji: string) {
  multiplayerService.send('EMOTE', { roomCode, emoji });
}

export function sendRematch(roomCode: string) {
  multiplayerService.send('REMATCH_REQUEST', { roomCode });
}

export function submitDeposit(payload: any) {
  if (!checkAuthAndConnection()) return;
  multiplayerService.send('SUBMIT_DEPOSIT', payload);
}

export function submitWithdrawal(payload: { walletAddress: string; amountNano: string }) {
  if (!checkAuthAndConnection()) return;
  multiplayerService.send('SUBMIT_WITHDRAWAL', payload);
}

export function fetchRooms() {
  multiplayerService.send('GET_ROOMS', {});
}
