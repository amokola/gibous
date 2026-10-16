import { multiplayerService } from '../services/multiplayerService';
import { shouldApplyRoomSnapshot } from './roomSnapshotOrdering';
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

const TECHNICAL_ERROR_COPY: Record<string, string> = {
  UNAUTHORIZED: 'Please reconnect to your account and try again.',
  AUTH_FAILED: "We couldn't verify your account. Please reopen the app from Telegram.",
  AUTH_TIMEOUT: 'Your sign-in took too long. Please reopen the app and try again.',
  ALREADY_AUTHENTICATED: 'Please reopen the app to switch accounts.',
  INVALID_STAKE: 'Choose a stake within the allowed range.',
  ROOM_NOT_FOUND: 'Duel not found. Check the code and try again.',
  ROOM_FULL: 'This duel is full.',
  CREATE_FAILED: 'Could not create the duel. Please try again.',
  JOIN_FAILED: 'Could not join this duel. It may no longer be available.',
  CANCEL_FAILED: 'This duel can no longer be cancelled.',
  ACTION_REJECTED: 'That move could not be made. Please try again.',
  ACTION_RATE_LIMITED: "You're moving too quickly. Please wait a moment.",
  RATE_LIMIT_EXCEEDED: "You're moving too quickly. Please wait a moment.",
  INVALID_JSON: 'We could not process that request. Please try again.',
  SCHEMA_VALIDATION_ERROR: 'We could not process that request. Please try again.',
  INTERNAL_SERVER_ERROR: 'Something went wrong. Please try again.',
  STATE_PERSISTENCE_FAILED: 'We could not save that move. Please try again.',
  DEPOSIT_UNAVAILABLE: 'Deposits are temporarily unavailable. Please try again later.',
  WITHDRAWAL_REJECTED: 'We could not process your withdrawal. Please review the details and try again.',
  WITHDRAWAL_UNAVAILABLE: 'Withdrawals are temporarily unavailable. Please try again later.',
  DEPOSIT_REJECTED: 'We could not process your deposit. Please try again.',
  DEPOSIT_INTENT_FAILED: 'Could not start your deposit. Please try again.',
  CANCEL_DEPOSIT_INTENT_FAILED: 'Could not cancel that deposit request. Please try again.',
};

function userFacingServerError(code?: string, _message?: string, fallback = 'Something went wrong. Please try again.') {
  if (code) return TECHNICAL_ERROR_COPY[code] || fallback;
  return fallback;
}

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
  multiplayerService.on<{ user: any; telegramId?: number; activeRoom?: RoomStatePayload }>('AUTH_OK', (payload) => {
    useAuthStore.getState().setUser(payload.user);
    const tgId = payload.telegramId || payload.user?.id;
    if (tgId) {
      setMyTelegramId(tgId);
    }
    if (payload.activeRoom) {
      useRoomStore.getState().setRoom(payload.activeRoom);
      if (tgId) {
        useRoomStore.getState().resolveMyRole(tgId);
      }
      useGameStore.getState().syncFromRoom(payload.activeRoom);
      multiplayerService.setCurrentRoomCode(payload.activeRoom.code);
    } else {
      const persistedRoomCode = multiplayerService.getCurrentRoomCode();
      if (persistedRoomCode) {
        multiplayerService.send('SYNC_ROOM', { roomCode: persistedRoomCode });
      }
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
    if (shouldApplyRoomSnapshot(currentRoom, payload)) {
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
    const rematchMessage = /insufficient balance/i.test(payload.reason)
      ? 'You need more GRAM to start a rematch.'
      : 'Rematch failed. Please try again.';
    useConnectionStore.getState().setError(rematchMessage);
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
  multiplayerService.on<{ code?: string; message?: string }>('ERROR', (payload) => {
    useConnectionStore.getState().setError(userFacingServerError(payload.code, payload.message));
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

export function requestForfeitDuel(roomCode: string) {
  // Keep the active room until GAME_OVER arrives so the forfeiting player can
  // see the authoritative result and payout receipt.
  multiplayerService.send('LEAVE_ROOM', { roomCode });
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

export function submitDeposit(payload: any): Promise<void> {
  if (!checkAuthAndConnection()) {
    return Promise.reject(new Error('Connect to your account before submitting a deposit.'));
  }
  return new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const cleanups: Array<() => void> = [];
    const finish = (callback: () => void) => {
      clearTimeout(timeout);
      cleanups.forEach((cleanup) => cleanup());
      callback();
    };
    const requestId = multiplayerService.send('SUBMIT_DEPOSIT', payload);
    cleanups.push(multiplayerService.on<any>('TRANSACTION_PENDING', (_transaction, message: any) => {
      if (message?.requestId === requestId) finish(resolve);
    }));
    cleanups.push(multiplayerService.on<any>('ERROR', (error, message: any) => {
      if (message?.requestId === requestId || error?.requestId === requestId) {
        finish(() => reject(new Error(userFacingServerError(error?.code, error?.message, 'Your deposit could not be completed. Please try again.'))));
      }
    }));
    timeout = setTimeout(() => finish(() => reject(new Error('Server timed out confirming the deposit submission.'))), 20_000);
  });
}

export function cancelDepositIntent(intentId: string): Promise<void> {
  return multiplayerService.cancelDepositIntent(intentId);
}

function requestWithdrawalResponse<T>(requestType: 'REQUEST_WITHDRAWAL_QUOTE' | 'CONFIRM_WITHDRAWAL', responseType: 'WITHDRAWAL_QUOTED' | 'WITHDRAWAL_PENDING', payload: any): Promise<T> {
  if (!checkAuthAndConnection()) return Promise.reject(new Error('Connect to your account before withdrawing.'));
  return new Promise<T>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    const cleanups: Array<() => void> = [];
    const finish = (callback: () => void) => {
      clearTimeout(timeout);
      cleanups.forEach((cleanup) => cleanup());
      callback();
    };
    const requestId = multiplayerService.send(requestType, payload);
    cleanups.push(multiplayerService.on<any>(responseType, (response, message: any) => {
      if (message?.requestId === requestId) finish(() => resolve(response as T));
    }));
    cleanups.push(multiplayerService.on<any>('ERROR', (error, message: any) => {
      if (message?.requestId === requestId || error?.requestId === requestId) {
        finish(() => reject(new Error(userFacingServerError(error?.code, error?.message, 'Your withdrawal could not be processed. Please try again.'))));
      }
    }));
    timeout = setTimeout(() => finish(() => reject(new Error('Withdrawal request timed out. Please check your account before retrying.'))), 20_000);
  });
}

export function requestWithdrawalQuote(payload: { walletAddress: string; amountNano: string }) {
  return requestWithdrawalResponse<any>('REQUEST_WITHDRAWAL_QUOTE', 'WITHDRAWAL_QUOTED', payload);
}

export function confirmWithdrawal(quoteId: string) {
  return requestWithdrawalResponse<any>('CONFIRM_WITHDRAWAL', 'WITHDRAWAL_PENDING', { quoteId });
}

export function fetchRooms() {
  multiplayerService.send('GET_ROOMS', {});
}
