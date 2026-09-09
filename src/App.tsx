import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTelegram } from './hooks/useTelegram';
import { useToast } from './hooks/useToast';
import { ConnectionBanner } from './components/ui/ConnectionBanner';
import { Toast } from './components/ui/Toast';
import { Player } from './types/game';
import { subscribeTelegramSafeArea } from './utils/telegramSafeArea';

// Zustand stores
import { useAuthStore, selectBalance } from './state/useAuthStore';
import { useRoomStore } from './state/useRoomStore';
import { useGameStore } from './state/useGameStore';
import { useConnectionStore } from './state/useConnectionStore';
import { useUIStore } from './state/useUIStore';
import type { GameTitle } from './state/useUIStore';

// Actions from event router (replace old useMultiplayer callbacks)
import {
  authenticate,
  createDuel,
  joinDuel,
  cancelDuel,
  leaveDuel,
  sendSnakeRoll,
  sendConnect4Drop,
  sendRPSChoice,
  sendEmote,
  sendRematch,
  submitDeposit,
  submitWithdrawal,
  fetchRooms,
} from './state/eventRouter';
import { multiplayerService } from './services/multiplayerService';

// Lazy-loaded screens
const HomeScreen = lazy(() => import('./components/home/HomeScreen').then((m) => ({ default: m.HomeScreen })));
const LobbyScreen = lazy(() => import('./components/lobby/LobbyScreen').then((m) => ({ default: m.LobbyScreen })));
const WaitingRoomScreen = lazy(() => import('./components/lobby/WaitingRoomScreen').then((m) => ({ default: m.WaitingRoomScreen })));
const VSIntroOverlay = lazy(() => import('./components/duel/VSIntroOverlay').then((m) => ({ default: m.VSIntroOverlay })));
const DuelShell = lazy(() => import('./components/duel/DuelShell').then((m) => ({ default: m.DuelShell })));
const SnakeLadderArena = lazy(() => import('./components/game/SnakeLadderArena').then((m) => ({ default: m.SnakeLadderArena })));
const Connect4Arena = lazy(() => import('./components/connect4/Connect4Arena').then((m) => ({ default: m.Connect4Arena })));
const RPSArena = lazy(() => import('./components/rps/RPSArena').then((m) => ({ default: m.RPSArena })));
const GameOverScreen = lazy(() => import('./components/gameover/GameOverScreen').then((m) => ({ default: m.GameOverScreen })));

export const App: React.FC = () => {
  // --- Zustand store subscriptions (surgical re-renders) ---
  const connectionState = useConnectionStore((s) => s.connectionState);
  const opponentDisconnected = useConnectionStore((s) => s.opponentDisconnected);
  const opponentReconnected = useConnectionStore((s) => s.opponentReconnected);
  const disconnectTimeoutMs = useConnectionStore((s) => s.disconnectTimeoutMs);
  const lastError = useConnectionStore((s) => s.lastError);

  const currentRoom = useRoomStore((s) => s.currentRoom);
  const myRole = useRoomStore((s) => s.myRole);

  const gameState = useGameStore((s) => s.gameState);
  const activePlayer = useGameStore((s) => s.activePlayer);
  const turnPhase = useGameStore((s) => s.turnPhase);
  const winner = useGameStore((s) => s.winner);
  const lastDiceEvent = useGameStore((s) => s.lastDiceEvent);
  const lastDropEvent = useGameStore((s) => s.lastDropEvent);
  const lastRPSEvent = useGameStore((s) => s.lastRPSEvent);
  const lastRPSCommit = useGameStore((s) => s.lastRPSCommit);
  const lastGameOverEvent = useGameStore((s) => s.lastGameOverEvent);

  const currentScreen = useUIStore((s) => s.currentScreen);
  const selectedGame = useUIStore((s) => s.selectedGame);
  const floatingEmotes = useUIStore((s) => s.floatingEmotes);
  const setScreen = useUIStore((s) => s.setScreen);
  const setSelectedGame = useUIStore((s) => s.setSelectedGame);

  const authenticatedUser = useAuthStore((s) => s.user);
  const userBalance = useAuthStore(selectBalance);

  // --- Non-store hooks ---
  const {
    user: tgUser,
    initData,
    startParam,
    tg,
    showBackButton,
    hideBackButton,
    enableClosingConfirmation,
    disableClosingConfirmation,
  } = useTelegram();
  const { toasts, error, removeToast } = useToast();

  // Telegram safe area
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    return subscribeTelegramSafeArea(tg, document.documentElement.style);
  }, [tg]);

  // Authenticate on connection
  useEffect(() => {
    if (connectionState === 'CONNECTED') {
      authenticate(tgUser.id, tgUser.first_name || 'Player 1', tgUser.photo_url, initData);
      fetchRooms();
    }
  }, [connectionState, tgUser, initData]);

  // Auto-join duel from deep link (startapp or start_param)
  const hasHandledStartParam = useRef(false);
  useEffect(() => {
    if (!startParam || hasHandledStartParam.current) return;
    if (connectionState === 'CONNECTED' && authenticatedUser) {
      const roomCodeCandidate = startParam.trim().toUpperCase();
      if (/^[A-Z0-9]{4,12}$/.test(roomCodeCandidate)) {
        hasHandledStartParam.current = true;
        joinDuel(roomCodeCandidate, tgUser.first_name || 'Player 2', tgUser.photo_url);
      }
    }
  }, [connectionState, authenticatedUser, startParam, tgUser]);

  // Show error toasts
  useEffect(() => {
    if (lastError) {
      error(lastError);
      useConnectionStore.getState().clearError();
    }
  }, [lastError, error]);

  // Auto screen transitions driven by server room status
  useEffect(() => {
    if (!currentRoom) return;

    if (currentRoom.status === 'waiting' && currentScreen !== 'waiting') {
      setScreen('waiting');
    } else if (currentRoom.status === 'playing' && currentScreen !== 'game' && currentScreen !== 'vs-intro') {
      setScreen('vs-intro');
    } else if (currentRoom.status === 'gameover' && currentScreen !== 'gameover') {
      // Delay transition to gameover screen when in active gameplay
      // so players can clearly watch final move animations, clash reveals, and board outcome
      if (currentScreen === 'game') {
        const timer = setTimeout(() => {
          setScreen('gameover');
        }, 3200);
        return () => clearTimeout(timer);
      } else {
        setScreen('gameover');
      }
    }
  }, [currentRoom?.status, currentScreen, setScreen]);

  // Transaction mapping for HomeScreen recent activity feed
  const accountTransactions = useMemo(() => {
    const raw = Array.isArray(authenticatedUser?.transactions) ? authenticatedUser.transactions : [];
    return raw.map((transaction: any) => ({
      id: String(transaction.id),
      type: transaction.type === 'match_win'
        ? 'win'
        : transaction.type === 'match_draw_refund'
        ? 'draw_refund'
        : transaction.type === 'match_cancelled_refund'
        ? 'deposit'
        : transaction.type === 'match_stake'
        ? 'arena_fee'
        : transaction.type,
      amount: transaction.type === 'withdraw'
        ? -Number(transaction.amountGram || 0)
        : Number(transaction.amountGram || 0),
      timestamp: transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : 'Pending',
      description: transaction.status === 'pending'
        ? `Deposit pending (+${transaction.amountGram} GRAM)`
        : transaction.type === 'match_win'
        ? 'Duel Victory'
        : transaction.type === 'match_draw_refund'
        ? 'Duel Draw Refund'
        : transaction.type === 'match_cancelled_refund'
        ? 'Duel Cancelled Refund'
        : transaction.type === 'match_stake'
        ? 'Duel Entry Stake'
        : transaction.type === 'deposit'
        ? 'TON Deposit'
        : transaction.type === 'withdraw'
        ? 'TON Withdrawal'
        : `${String(transaction.type).replace(/_/g, ' ')}`,
      subtext: transaction.status === 'pending' ? 'Confirming on TON...' : 'Completed',
      txHash: transaction.txHash || transaction.boc,
    }));
  }, [authenticatedUser]);

  // --- Handlers ---
  const handleSelectAndPlayGame = (game: GameTitle) => {
    setSelectedGame(game);
    setScreen('lobby');
    fetchRooms();
  };

  const handleCreateRoom = (stake: number, game?: GameTitle) => {
    const targetGame = game || selectedGame;
    if (game) setSelectedGame(game);
    createDuel(targetGame, stake, tgUser.first_name || 'Player 1', tgUser.photo_url);
  };

  const handleJoinRoom = (roomCode: string) => {
    joinDuel(roomCode, tgUser.first_name || 'Player 2', tgUser.photo_url);
  };

  const handleCancelWaitingRoom = useCallback(() => {
    if (currentRoom?.code) cancelDuel(currentRoom.code);
    setScreen('lobby');
  }, [currentRoom, cancelDuel, setScreen]);

  const handleLeaveDuel = useCallback(() => {
    if (currentRoom?.code) leaveDuel(currentRoom.code);
    setScreen('home');
  }, [currentRoom, leaveDuel, setScreen]);

  const handleRematch = useCallback(() => {
    if (currentRoom?.code) sendRematch(currentRoom.code);
  }, [currentRoom, sendRematch]);

  // Synchronize Telegram Native BackButton and ClosingConfirmation with game screens
  useEffect(() => {
    if (currentScreen === 'home') {
      hideBackButton();
      disableClosingConfirmation();
      return;
    }

    if (currentScreen === 'game') {
      enableClosingConfirmation();
    } else {
      disableClosingConfirmation();
    }

    const onTelegramBack = () => {
      if (currentScreen === 'lobby') {
        setScreen('home');
      } else if (currentScreen === 'waiting') {
        handleCancelWaitingRoom();
      } else if (currentScreen === 'game') {
        handleLeaveDuel();
      } else if (currentScreen === 'gameover') {
        if (currentRoom?.code) leaveDuel(currentRoom.code);
        setScreen('home');
      } else {
        setScreen('home');
      }
    };

    showBackButton(onTelegramBack);
    return () => {
      hideBackButton(onTelegramBack);
    };
  }, [
    currentScreen,
    currentRoom,
    showBackButton,
    hideBackButton,
    enableClosingConfirmation,
    disableClosingConfirmation,
    setScreen,
    handleCancelWaitingRoom,
    handleLeaveDuel,
    leaveDuel,
  ]);

  // Build NormalizedDuelState for backward compat with existing screen components
  const duelState = useMemo(() => ({
    room: currentRoom ? {
      code: currentRoom.code,
      gameType: currentRoom.gameType,
      status: currentRoom.status,
      version: currentRoom.version,
    } : null,
    players: {
      p1: currentRoom?.p1 || null,
      p2: currentRoom?.p2 || null,
    },
    myRole,
    activePlayer,
    turnPhase,
    potAmount: currentRoom?.potAmount || 0,
    stakeAmount: currentRoom?.stakeAmount || 0,
    winner,
    gameState,
    lastDiceEvent,
    lastDropEvent,
    lastRPSEvent,
    lastRPSCommit,
    lastGameOverEvent,
  }), [currentRoom, myRole, activePlayer, turnPhase, winner, gameState, lastDiceEvent, lastDropEvent, lastRPSEvent, lastRPSCommit, lastGameOverEvent]);

  // Player objects for GameOverScreen & LobbyScreen
  const p1Player: Player = {
    id: 'p1',
    name: duelState.players.p1?.name || (myRole === 'p1' ? tgUser.first_name : undefined) || 'Player 1',
    telegramId: duelState.players.p1?.telegramId || (myRole === 'p1' ? tgUser.id : undefined),
    color: 'green',
    avatarUrl: duelState.players.p1?.avatarUrl || (myRole === 'p1' ? tgUser.photo_url : undefined),
    score: 0,
    isReady: true,
  };

  const p2Player: Player = {
    id: 'p2',
    name: duelState.players.p2?.name || (myRole === 'p2' ? tgUser.first_name : undefined) || 'Player 2',
    telegramId: duelState.players.p2?.telegramId || (myRole === 'p2' ? tgUser.id : undefined),
    color: 'blue',
    avatarUrl: duelState.players.p2?.avatarUrl || (myRole === 'p2' ? tgUser.photo_url : undefined),
    score: 0,
    isReady: true,
  };

  return (
    <div className="telegram-app-shell w-full bg-[#e8e0d0] flex items-center justify-center p-0 sm:p-3 text-[#1a1a1a] overflow-hidden">
      <div className="app-viewport w-full max-w-[420px] bg-[#fbfaf7] sm:h-[860px] sm:max-h-[96dvh] sm:rounded-[36px] sm:border-[4px] sm:border-[#1a1a1a] shadow-[0_8px_30px_rgba(0,0,0,0.12)] overflow-hidden relative flex flex-col scrollbar-none">
        <ConnectionBanner
          connectionState={connectionState}
          onReconnect={() => multiplayerService.connect()}
        />

        {toasts.length > 0 && (
          <div className="absolute top-3 left-3 right-3 z-50 flex flex-col gap-2 pointer-events-auto">
            {toasts.map((toast) => (
              <Toast
                key={toast.id}
                type={toast.type}
                message={toast.message}
                duration={toast.duration}
                onClose={() => removeToast(toast.id)}
              />
            ))}
          </div>
        )}

        <Suspense
          fallback={
            <div className="flex-1 min-h-0 flex items-center justify-center p-6 font-sketch text-sm text-[#1a1a1a]/70">
              Loading arena…
            </div>
          }
        >
          {currentScreen === 'home' && (
            <HomeScreen
              userName={tgUser.first_name || 'Player 1'}
              avatarUrl={tgUser.photo_url}
              balance={userBalance}
              onSelectAndPlayGame={handleSelectAndPlayGame}
              onSubmitDeposit={submitDeposit}
              onSubmitWithdrawal={submitWithdrawal}
              initialTransactions={accountTransactions}
              account={authenticatedUser}
            />
          )}

          {currentScreen === 'lobby' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <LobbyScreen
                selectedGame={selectedGame}
                onSelectGame={setSelectedGame}
                initialStake={duelState.stakeAmount || 100}
                onCreateDuel={(game, stake) => handleCreateRoom(stake, game)}
                onJoinDuel={(code) => handleJoinRoom(code)}
                onBack={() => setScreen('home')}
              />
            </div>
          )}

          {currentScreen === 'waiting' && currentRoom && (
            <WaitingRoomScreen
              roomCode={currentRoom.code}
              gameType={currentRoom.gameType}
              stake={currentRoom.stakeAmount || 100}
              hostName={tgUser.first_name || 'Player 1'}
              hostAvatar={tgUser.photo_url}
              onCancel={handleCancelWaitingRoom}
            />
          )}

          {currentScreen === 'vs-intro' && currentRoom && (
            <VSIntroOverlay
              gameType={currentRoom.gameType}
              stake={currentRoom.stakeAmount || 100}
              pot={currentRoom.potAmount || 200}
              p1Name={duelState.players.p1?.name || 'Player 1'}
              p1Avatar={duelState.players.p1?.avatarUrl}
              p2Name={duelState.players.p2?.name || 'Player 2'}
              p2Avatar={duelState.players.p2?.avatarUrl}
              onComplete={() => setScreen('game')}
            />
          )}

          {currentScreen === 'game' && currentRoom && (
            <DuelShell
              duelState={duelState}
              onLeave={handleLeaveDuel}
              onSendEmote={(emoji) => sendEmote(currentRoom.code, emoji)}
              opponentDisconnected={opponentDisconnected}
              opponentReconnected={opponentReconnected}
              disconnectTimeoutMs={disconnectTimeoutMs}
              floatingEmotes={floatingEmotes}
            >
              {currentRoom.gameType === 'snake' && (
                <SnakeLadderArena
                  duelState={duelState}
                  onRoll={() => sendSnakeRoll(currentRoom.code)}
                />
              )}

              {currentRoom.gameType === 'connect4' && (
                <Connect4Arena
                  duelState={duelState}
                  onDropDisc={(col) => sendConnect4Drop(currentRoom.code, col)}
                />
              )}

              {currentRoom.gameType === 'rps' && (
                <RPSArena
                  duelState={duelState}
                  onChooseRPS={(choice) => sendRPSChoice(currentRoom.code, choice)}
                />
              )}
            </DuelShell>
          )}

          {currentScreen === 'gameover' && (
            <div className="flex-1 min-h-0 flex flex-col">
              <GameOverScreen
                winnerId={duelState.winner as any}
                result={
                  duelState.lastGameOverEvent?.isForfeit
                    ? {
                        type: 'FORFEIT',
                        winner: duelState.winner === 'p2' ? 'p2' : 'p1',
                        reason: 'resign',
                      }
                    : duelState.winner === 'draw'
                    ? { type: 'DRAW' }
                    : duelState.winner === 'p1' || duelState.winner === 'p2'
                    ? { type: 'WIN', winner: duelState.winner }
                    : null
                }
                myRole={myRole}
                p1={p1Player}
                p2={p2Player}
                potAmount={duelState.potAmount || 200}
                onPlayAgain={handleRematch}
                onBackToLobby={() => {
                  if (currentRoom?.code) leaveDuel(currentRoom.code);
                  setScreen('home');
                }}
              />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
};

export default App;
