import { useEffect, useState, useCallback, useRef } from 'react';
import { multiplayerService } from '../services/multiplayerService';
import {
  ConnectionState,
  RoomStatePayload,
  RPSChoice,
} from '../../shared';

export function useMultiplayer() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(multiplayerService.getConnectionState());
  const [isSearchingMatch, setIsSearchingMatch] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<RoomStatePayload | null>(null);
  const roomVersionRef = useRef<number>(0);

  useEffect(() => {
    multiplayerService.connect();

    const unsubState = multiplayerService.onStateChange((state) => {
      setConnectionState(state);
    });

    const unsubGameStart = multiplayerService.on<RoomStatePayload>('GAME_START', (payload) => {
      setIsSearchingMatch(false);
      roomVersionRef.current = payload.version;
      setCurrentRoom(payload);
    });

    const unsubRoomState = multiplayerService.on<RoomStatePayload>('ROOM_STATE', (payload) => {
      if (payload.version >= roomVersionRef.current) {
        roomVersionRef.current = payload.version;
        setCurrentRoom(payload);
      }
    });

    return () => {
      unsubState();
      unsubGameStart();
      unsubRoomState();
    };
  }, []);

  const authenticate = useCallback((telegramId: number, playerName: string, avatarUrl?: string) => {
    multiplayerService.send('AUTH', { telegramId, playerName, avatarUrl });
  }, []);

  const joinRoom = useCallback((roomCode: string, telegramId: number, playerName: string, avatarUrl?: string) => {
    multiplayerService.send('JOIN_ROOM', { roomCode, telegramId, playerName, avatarUrl });
  }, []);

  const syncRoom = useCallback((roomCode: string) => {
    multiplayerService.send('SYNC_ROOM', { roomCode });
  }, []);

  const sendSnakeRoll = useCallback((roomCode: string) => {
    multiplayerService.send('ROLL_DICE', { roomCode });
  }, []);

  const sendConnect4Drop = useCallback((roomCode: string, column: number) => {
    multiplayerService.send('DROP_DISC', { roomCode, column });
  }, []);

  const sendRPSChoice = useCallback((roomCode: string, choice: RPSChoice) => {
    multiplayerService.send('CHOOSE_RPS', { roomCode, choice });
  }, []);

  const sendEmote = useCallback((roomCode: string, emoji: string) => {
    multiplayerService.send('EMOTE', { roomCode, emoji });
  }, []);

  return {
    connectionState,
    isConnected: connectionState === 'CONNECTED',
    isReconnecting: connectionState === 'RECONNECTING',
    isSearchingMatch,
    currentRoom,
    authenticate,
    joinRoom,
    syncRoom,
    sendSnakeRoll,
    sendConnect4Drop,
    sendRPSChoice,
    sendEmote,
    service: multiplayerService,
  };
}
