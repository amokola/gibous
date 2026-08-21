import { useEffect, useState, useCallback, useRef } from 'react';
import { multiplayerService } from '../services/multiplayerService';
import {
  ConnectionState,
  RoomStatePayload,
  RPSChoice,
  PlayerRole,
} from '../../shared';

export function useMultiplayer() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(multiplayerService.getConnectionState());
  const [isSearchingMatch, setIsSearchingMatch] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<RoomStatePayload | null>(null);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);
  const [opponentReconnected, setOpponentReconnected] = useState(false);

  const roomVersionRef = useRef<number>(0);
  const myRoleRef = useRef<PlayerRole | null>(null);
  const myTgIdRef = useRef<number | null>(null);
  const reconnectDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    multiplayerService.connect();

    const unsubState = multiplayerService.onStateChange((state) => {
      setConnectionState(state);
    });

    const unsubGameStart = multiplayerService.on<RoomStatePayload>('GAME_START', (payload) => {
      setIsSearchingMatch(false);
      roomVersionRef.current = payload.version;
      setCurrentRoom(payload);
      setOpponentDisconnected(false);
      setOpponentReconnected(false);

      if (myTgIdRef.current) {
        if (payload.p2?.telegramId === myTgIdRef.current) {
          myRoleRef.current = 'p2';
        } else if (payload.p1?.telegramId === myTgIdRef.current) {
          myRoleRef.current = 'p1';
        }
      }
    });

    const unsubRoomState = multiplayerService.on<RoomStatePayload>('ROOM_STATE', (payload) => {
      if (payload.version >= roomVersionRef.current) {
        roomVersionRef.current = payload.version;
        setCurrentRoom(payload);

        if (myTgIdRef.current) {
          if (payload.p2?.telegramId === myTgIdRef.current) {
            myRoleRef.current = 'p2';
          } else if (payload.p1?.telegramId === myTgIdRef.current) {
            myRoleRef.current = 'p1';
          }
        }
      }
    });

    const unsubDisconnect = multiplayerService.on<{ player: PlayerRole; version: number; timeoutMs?: number }>(
      'PLAYER_DISCONNECTED',
      (payload) => {
        const isOpponent = myRoleRef.current ? payload.player !== myRoleRef.current : payload.player === 'p2';
        if (isOpponent) {
          if (reconnectDismissTimerRef.current) {
            clearTimeout(reconnectDismissTimerRef.current);
            reconnectDismissTimerRef.current = null;
          }
          setOpponentDisconnected(true);
          setOpponentReconnected(false);
        }
      }
    );

    const unsubReconnect = multiplayerService.on<{ player: PlayerRole; version: number }>(
      'PLAYER_RECONNECTED',
      (payload) => {
        const isOpponent = myRoleRef.current ? payload.player !== myRoleRef.current : payload.player === 'p2';
        if (isOpponent) {
          setOpponentDisconnected(false);
          setOpponentReconnected(true);

          if (reconnectDismissTimerRef.current) {
            clearTimeout(reconnectDismissTimerRef.current);
          }
          reconnectDismissTimerRef.current = setTimeout(() => {
            setOpponentReconnected(false);
            reconnectDismissTimerRef.current = null;
          }, 3000);
        }
      }
    );

    const unsubGameOver = multiplayerService.on('GAME_OVER', () => {
      setOpponentDisconnected(false);
      setOpponentReconnected(false);
      if (reconnectDismissTimerRef.current) {
        clearTimeout(reconnectDismissTimerRef.current);
        reconnectDismissTimerRef.current = null;
      }
    });

    return () => {
      unsubState();
      unsubGameStart();
      unsubRoomState();
      unsubDisconnect();
      unsubReconnect();
      unsubGameOver();
      if (reconnectDismissTimerRef.current) {
        clearTimeout(reconnectDismissTimerRef.current);
      }
    };
  }, []);

  const authenticate = useCallback((telegramId: number, playerName: string, avatarUrl?: string) => {
    myTgIdRef.current = telegramId;
    multiplayerService.send('AUTH', { telegramId, playerName, avatarUrl });
  }, []);

  const joinRoom = useCallback((roomCode: string, telegramId: number, playerName: string, avatarUrl?: string) => {
    myTgIdRef.current = telegramId;
    multiplayerService.send('JOIN_ROOM', { roomCode, telegramId, playerName, avatarUrl });
  }, []);

  const leaveRoom = useCallback((roomCode: string) => {
    multiplayerService.send('LEAVE_ROOM', { roomCode });
    multiplayerService.setCurrentRoomCode(null);
    setCurrentRoom(null);
    setOpponentDisconnected(false);
    setOpponentReconnected(false);
    if (reconnectDismissTimerRef.current) {
      clearTimeout(reconnectDismissTimerRef.current);
      reconnectDismissTimerRef.current = null;
    }
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
    opponentDisconnected,
    opponentReconnected,
    authenticate,
    joinRoom,
    leaveRoom,
    syncRoom,
    sendSnakeRoll,
    sendConnect4Drop,
    sendRPSChoice,
    sendEmote,
    service: multiplayerService,
  };
}
