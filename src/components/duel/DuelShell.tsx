import React, { useState, useEffect } from 'react';
import { ChevronLeft, AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
import { NormalizedDuelState, FloatingEmote } from '../../types/game';
import { PotBreakdownModal } from './PotBreakdownModal';
import { GramIcon } from '../ui/GramIcon';

interface DuelShellProps {
  duelState: NormalizedDuelState;
  onLeave: () => void;
  onSendEmote: (emoji: string) => void;
  opponentDisconnected: boolean;
  opponentReconnected: boolean;
  disconnectTimeoutMs: number;
  floatingEmotes: FloatingEmote[];
  children: React.ReactNode;
}

export const DuelShell: React.FC<DuelShellProps> = ({
  duelState,
  onLeave,
  onSendEmote,
  opponentDisconnected,
  opponentReconnected,
  disconnectTimeoutMs,
  floatingEmotes,
  children,
}) => {
  const [showPotModal, setShowPotModal] = useState(false);
  const [showResignModal, setShowResignModal] = useState(false);
  const [disconnectRemainingSec, setDisconnectRemainingSec] = useState(
    Math.round(disconnectTimeoutMs / 1000)
  );

  const { players, myRole, activePlayer, potAmount, stakeAmount } = duelState;
  const isSimultaneous = duelState.room?.gameType === 'rps';
  const isMyTurn = myRole !== null && (isSimultaneous || activePlayer === myRole);

  const opponentPlayer = myRole === 'p2' ? players.p1 : players.p2;

  // Disconnect timer countdown
  useEffect(() => {
    if (!opponentDisconnected) {
      setDisconnectRemainingSec(Math.round(disconnectTimeoutMs / 1000));
      return;
    }

    const interval = setInterval(() => {
      setDisconnectRemainingSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [opponentDisconnected, disconnectTimeoutMs]);

  const p1Name = players.p1?.name || 'Player 1';
  const p2Name = players.p2?.name || 'Player 2';
  const opponentName = opponentPlayer?.name || (myRole === 'p1' ? 'Player 2' : 'Player 1');

  const emotes = ['🔥', '😎', '💀', '😱', '👏', '🎲'];

  const actualWinner = duelState.winner || duelState.gameState?.winner || null;
  const isGameOver = duelState.room?.status === 'gameover' || Boolean(actualWinner);
  const isDraw = actualWinner === 'draw';
  const isSpectator = myRole === null;
  const isWinner = !isSpectator && !isDraw && actualWinner !== null && actualWinner === myRole;
  const isForfeit = Boolean(duelState.lastGameOverEvent?.isForfeit);

  const getStatusBanner = () => {
    if (isGameOver) {
      if (isDraw) {
        return {
          bg: 'bg-[#e0f2fe] text-[#0369a1]',
          dot: 'bg-[#0369a1]',
          text: '🤝 MATCH ENDED IN A DRAW!',
        };
      }
      if (isForfeit) {
        return isWinner
          ? {
              bg: 'bg-[#dcfce7] text-[#166534] animate-bounce-subtle',
              dot: 'bg-[#166534] animate-ping',
              text: '★ OPPONENT FORFEITED — YOU WON! ★',
            }
          : isSpectator
          ? {
              bg: 'bg-[#fee2e2] text-[#991b1b]',
              dot: 'bg-[#991b1b]',
              text: `★ ${actualWinner === 'p1' ? p1Name.toUpperCase() : p2Name.toUpperCase()} WON BY FORFEIT ★`,
            }
          : {
              bg: 'bg-[#fee2e2] text-[#991b1b]',
              dot: 'bg-[#991b1b]',
              text: '⚠️ YOU FORFEITED THE MATCH',
            };
      }
      return isWinner
        ? {
            bg: 'bg-[#dcfce7] text-[#166534] animate-bounce-subtle',
            dot: 'bg-[#166534] animate-ping',
            text: '🏆 VICTORY! YOU WON THE MATCH!',
          }
        : isSpectator
        ? {
            bg: 'bg-[#dcfce7] text-[#166534]',
            dot: 'bg-[#166534]',
            text: `🏆 ${actualWinner === 'p1' ? p1Name.toUpperCase() : p2Name.toUpperCase()} WON THE MATCH!`,
          }
        : {
            bg: 'bg-[#fee2e2] text-[#991b1b]',
            dot: 'bg-[#991b1b]',
            text: `👑 ${opponentName.toUpperCase()} WON THE MATCH!`,
          };
    }

    if (opponentDisconnected) {
      return {
        bg: 'bg-[#fee2e2] text-[#991b1b]',
        dot: 'bg-[#991b1b] animate-ping',
        text: `⚠️ OPPONENT DISCONNECTED (${disconnectRemainingSec}s)`,
      };
    }

    if (isSimultaneous) {
      const hasChosen = myRole === 'p1' ? duelState.gameState?.p1HasChosen : myRole === 'p2' ? duelState.gameState?.p2HasChosen : false;
      if (hasChosen) {
        return {
          bg: 'bg-[#fff9c4] text-[#854d0e]',
          dot: 'bg-[#854d0e]',
          text: `🔵 WAITING FOR ${opponentName.toUpperCase()}...`,
        };
      }
      return {
        bg: 'bg-[#dcfce7] text-[#166534]',
        dot: 'bg-[#166534] animate-pulse',
        text: '🟢 CHOOSE YOUR WEAPON',
      };
    }

    if (isMyTurn) {
      return {
        bg: 'bg-[#dcfce7] text-[#166534]',
        dot: 'bg-[#166534] animate-pulse',
        text: '🟢 YOUR TURN • MAKE YOUR MOVE',
      };
    }

    if (isSpectator) {
      const activeName = activePlayer === 'p1' ? p1Name : p2Name;
      return {
        bg: 'bg-[#fff9c4] text-[#854d0e]',
        dot: 'bg-[#854d0e]',
        text: `🔵 ${activeName.toUpperCase()}'S TURN`,
      };
    }

    return {
      bg: 'bg-[#fff9c4] text-[#854d0e]',
      dot: 'bg-[#854d0e]',
      text: `🔵 ${opponentName.toUpperCase()}'S TURN • WAITING...`,
    };
  };

  const statusBanner = getStatusBanner();

  return (
    <div className="relative flex flex-col h-full min-h-0 bg-[#f2efe9] text-[#1a1a1a] select-none overflow-hidden pb-2 font-body rounded-none">
      {/* 1. Header Bar with Players, Pot & Resign Button */}
      <header className="flex-shrink-0 px-3 pt-2.5 pb-2 bg-[#fbfaf7] border-b-2 border-black z-30">
        <div className="flex items-center justify-between gap-1.5 max-w-lg mx-auto">
          <button
            onClick={() => setShowResignModal(true)}
            className="w-8 h-8 flex items-center justify-center rounded-none bg-white hover:bg-[#fff9c4] border-2 border-black sketch-shadow-xs sketch-btn-press transition cursor-pointer"
            title="Leave duel"
          >
            <ChevronLeft className="w-5 h-5 text-[#1a1a1a]" />
          </button>

          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-none transition-all border-2 border-black ${
              activePlayer === 'p1'
                ? duelState.room?.gameType === 'connect4'
                  ? 'bg-[#fee2e2] text-[#9b2c2c] sketch-shadow-xs translate-y-[-1px]'
                  : 'bg-[#dcfce7] sketch-shadow-green translate-y-[-1px]'
                : 'bg-white sketch-shadow-xs opacity-80'
            }`}
          >
            <div className="relative">
              {players.p1?.avatarUrl ? (
                <img
                  src={players.p1.avatarUrl}
                  alt={p1Name}
                  className="w-7 h-7 rounded-none object-cover border border-black"
                />
              ) : (
                <div className={`w-7 h-7 rounded-none ${duelState.room?.gameType === 'connect4' ? 'bg-[#fee2e2] text-[#9b2c2c]' : 'bg-[#dcfce7] text-[#166534]'} border border-black flex items-center justify-center font-sketch font-bold text-xs`}>
                  {p1Name.slice(0, 2).toUpperCase()}
                </div>
              )}
              {activePlayer === 'p1' && (
                <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 ${duelState.room?.gameType === 'connect4' ? 'bg-[#9b2c2c]' : 'bg-[#166534]'} border border-white animate-pulse`} />
              )}
            </div>
            <div className="text-left">
              <div className="text-[11px] font-bold truncate max-w-[70px] leading-tight">
                {myRole === 'p1' ? 'You' : p1Name}
              </div>
              <div className="text-[10px] text-neutral-600 font-sketch leading-none">
                {duelState.room?.gameType === 'snake' && (
                  <span>Tile {duelState.gameState?.p1Position || 1}</span>
                )}
                {duelState.room?.gameType === 'rps' && (
                  <span className="text-[#166534] font-bold">
                    {'●'.repeat(duelState.gameState?.p1Score || 0)}
                    {'○'.repeat(Math.max(0, 3 - (duelState.gameState?.p1Score || 0)))}
                  </span>
                )}
                {duelState.room?.gameType === 'connect4' && <span className="text-[#9b2c2c] font-bold">Red Disc</span>}
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowPotModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-none bg-white hover:bg-[#fff9c4] border-2 border-black sketch-shadow-xs sketch-btn-press transition cursor-pointer group"
          >
            <GramIcon className="w-3.5 h-3.5" />
            <span className="font-sketch font-bold text-xs text-[#1a1a1a] tracking-wide">{potAmount}</span>
            <span className="text-[9px] text-neutral-600 font-bold group-hover:translate-y-0.5 transition-transform">▾</span>
          </button>

          <div
            className={`flex items-center gap-1.5 px-2 py-1 rounded-none transition-all border-2 border-black ${
              activePlayer === 'p2'
                ? duelState.room?.gameType === 'connect4'
                  ? 'bg-[#dbeafe] text-[#1e40af] sketch-shadow-xs translate-y-[-1px]'
                  : 'bg-[#e0f2fe] sketch-shadow-cyan translate-y-[-1px]'
                : 'bg-white sketch-shadow-xs opacity-80'
            }`}
          >
            <div className="text-right">
              <div className="text-[11px] font-bold truncate max-w-[70px] leading-tight">
                {myRole === 'p2' ? 'You' : p2Name}
              </div>
              <div className="text-[10px] text-neutral-600 font-sketch leading-none">
                {duelState.room?.gameType === 'snake' && (
                  <span>Tile {duelState.gameState?.p2Position || 1}</span>
                )}
                {duelState.room?.gameType === 'rps' && (
                  <span className="text-[#1a365d] font-bold">
                    {'●'.repeat(duelState.gameState?.p2Score || 0)}
                    {'○'.repeat(Math.max(0, 3 - (duelState.gameState?.p2Score || 0)))}
                  </span>
                )}
                {duelState.room?.gameType === 'connect4' && <span className="text-[#2563eb] font-bold">Blue Disc</span>}
              </div>
            </div>
            <div className="relative">
              {players.p2?.avatarUrl ? (
                <img
                  src={players.p2.avatarUrl}
                  alt={p2Name}
                  className="w-7 h-7 rounded-none object-cover border border-black"
                />
              ) : (
                <div className={`w-7 h-7 rounded-none ${duelState.room?.gameType === 'connect4' ? 'bg-[#dbeafe] text-[#1e40af]' : 'bg-[#e0f2fe] text-[#1a365d]'} border border-black flex items-center justify-center font-sketch font-bold text-xs`}>
                  {p2Name.slice(0, 2).toUpperCase()}
                </div>
              )}
              {activePlayer === 'p2' && (
                <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 ${duelState.room?.gameType === 'connect4' ? 'bg-[#2563eb]' : 'bg-[#1a365d]'} border border-white animate-pulse`} />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* 2. Turn / Status Indicator */}
      <div className="px-3 pt-2 pb-1 max-w-sm mx-auto w-full z-20">
        <div
          className={`flex flex-col rounded-none border-2 border-black sketch-shadow-sm font-sketch overflow-hidden ${statusBanner.bg}`}
        >
          <div className="flex items-center gap-2 px-3 py-1.5">
            <span className={`w-2.5 h-2.5 ${statusBanner.dot}`} />
            <span className="font-bold text-sm tracking-wide">
              {statusBanner.text}
            </span>
          </div>
          {!isGameOver && (
            <div className="w-full h-1 bg-black/10">
              <div
                className={`h-full ${isMyTurn ? 'bg-[#166534] animate-pulse' : 'bg-[#1a365d]/60'} transition-all`}
                style={{ width: '100%' }}
              />
            </div>
          )}
        </div>
      </div>

      {/* 3. Floating reaction layer */}
      <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
        {floatingEmotes.map((e) => (
          <div
            key={e.id}
            className={`absolute bottom-20 text-4xl animate-bounce ${
              e.player === 'p1' ? 'left-8' : 'right-8'
            }`}
            style={{
              animation: 'floatUp 1.8s ease-out forwards',
            }}
          >
            {e.emoji}
          </div>
        ))}
      </div>

      {/* 4. Main game arena stage */}
      <main className="flex-1 flex flex-col justify-center px-3 py-1 relative z-10 overflow-y-auto scrollbar-none">
        {children}
      </main>

      {/* 5. Reaction control deck */}
      <footer className="flex-shrink-0 px-3 pt-1 pb-1 z-20">
        <div className="flex items-center justify-around gap-1 max-w-xs mx-auto p-1 rounded-none bg-[#fbfaf7] border-2 border-black sketch-shadow-sm">
          {emotes.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSendEmote(emoji)}
              className="w-8 h-8 rounded-none bg-white hover:bg-[#fff9c4] border border-black sketch-shadow-xs sketch-btn-press flex items-center justify-center text-lg transition cursor-pointer"
            >
              {emoji}
            </button>
          ))}
        </div>
      </footer>

      {/* 6. Disconnect Alert Banner */}
      {opponentDisconnected && (
        <div className="telegram-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-[#fbfaf7] border-2 sm:border-[2.5px] border-black rounded-none p-5 max-w-xs w-full text-center sketch-shadow-xl text-[#1a1a1a]">
            <div className="w-12 h-12 rounded-none bg-[#fee2e2] border-2 border-black flex items-center justify-center mx-auto mb-3 text-[#991b1b]">
              <WifiOff className="w-6 h-6 animate-pulse" />
            </div>
            <h3 className="font-sketch font-bold text-2xl text-[#991b1b] mb-1">
              OPPONENT DISCONNECTED
            </h3>
            <p className="font-body text-xs text-neutral-600 mb-3">
              Waiting for {opponentName} to reconnect. You will win by forfeit in:
            </p>
            <div className="font-sketch font-black text-4xl text-[#991b1b] mb-4">
              {disconnectRemainingSec}s
            </div>
            <span className="font-body text-[11px] text-neutral-500 block">
              Your match is safe.
            </span>
          </div>
        </div>
      )}

      {/* 7. Opponent Reconnected Toast */}
      {opponentReconnected && (
        <div className="fixed top-14 left-4 right-4 z-50 flex justify-center pointer-events-none animate-bounce">
          <div className="bg-[#dcfce7] border-2 border-black rounded-none px-4 py-2 sketch-shadow text-xs font-bold text-[#166534] flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>{opponentName} is back! Resuming duel...</span>
          </div>
        </div>
      )}

      {/* 8. Pot Breakdown Modal */}
      {showPotModal && (
        <PotBreakdownModal
          stake={stakeAmount || 100}
          pot={potAmount || 200}
          p1Name={p1Name}
          p2Name={p2Name}
          onClose={() => setShowPotModal(false)}
        />
      )}

      {/* 9. Resign / Forfeit Confirmation Modal */}
      {showResignModal && (
        <div className="telegram-safe-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in select-none">
          <div className="bg-[#fbfaf7] border-2 sm:border-[2.5px] border-black rounded-none p-5 max-w-xs w-full text-center sketch-shadow-xl text-[#1a1a1a]">
            <div className="w-12 h-12 rounded-none bg-[#fee2e2] border-2 border-black flex items-center justify-center mx-auto mb-3 text-[#991b1b]">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-sketch font-bold text-2xl mb-1 text-[#1a1a1a]">
              SURRENDER DUEL?
            </h3>
            <p className="font-body text-xs text-neutral-600 mb-4">
              Leaving the match will forfeit your stake of{' '}
              <span className="font-bold text-[#1a1a1a]">{stakeAmount || 100} GRAM</span> to
              your opponent.
            </p>
            <div className="flex gap-2 font-sketch text-base">
              <button
                onClick={() => setShowResignModal(false)}
                className="flex-1 py-2.5 bg-white hover:bg-[#fff9c4] text-[#1a1a1a] border-2 border-black rounded-none sketch-shadow-xs sketch-btn-press cursor-pointer"
              >
                STAY & PLAY
              </button>
              <button
                onClick={() => {
                  setShowResignModal(false);
                  onLeave();
                }}
                className="flex-1 py-2.5 bg-[#9b2c2c] hover:bg-[#b91c1c] text-white border-2 border-black rounded-none sketch-shadow sketch-btn-press cursor-pointer"
              >
                FORFEIT (-{stakeAmount || 100})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
