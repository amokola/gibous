import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Player, PlayerId, MatchStats } from '../../types/game';
import { MatchResult, PlayerRole } from '../../../shared';
import { Avatar } from '../ui/Avatar';
import { GramIcon } from '../ui/GramIcon';
import { SketchButton } from '../ui/SketchButton';
import { TrophyCupIcon } from '../icons/GameIcons';
import { useConnectionStore } from '../../state';
import { MatchStatsCard } from './MatchStatsCard';
import { RotateCcw, Home, ArrowLeft, Swords, Scale } from 'lucide-react';

interface GameOverScreenProps {
  winnerId?: PlayerId | 'draw' | null;
  result?: MatchResult | null;
  myRole?: PlayerRole | null;
  p1: Player;
  p2: Player;
  potAmount: number;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

export const GameOverScreen: React.FC<GameOverScreenProps> = ({
  winnerId,
  result,
  myRole,
  p1,
  p2,
  potAmount,
  onPlayAgain,
  onBackToLobby,
}) => {
  const isDraw = result?.type === 'DRAW' || winnerId === 'draw';
  const isForfeit = result?.type === 'FORFEIT';
  const winnerRole: PlayerRole | null = result
    ? (result.type !== 'DRAW' ? result.winner : null)
    : (winnerId && winnerId !== 'draw' ? (winnerId as PlayerRole) : null);

  const isSpectator = myRole === null;
  const currentRole: PlayerRole = myRole || 'p1';
  const isWinner = !isSpectator && !isDraw && winnerRole !== null && winnerRole === currentRole;
  const isP1Winner = !isDraw && winnerRole === 'p1';
  const isP2Winner = !isDraw && winnerRole === 'p2';

  const winner = winnerRole === 'p1' ? p1 : winnerRole === 'p2' ? p2 : null;

  const [rematchRequested, setRematchRequested] = React.useState(false);
  const lastError = useConnectionStore((s) => s.lastError);

  useEffect(() => {
    if (lastError && rematchRequested) {
      setRematchRequested(false);
    }
  }, [lastError, rematchRequested]);

  useEffect(() => {
    if (isDraw) {
      return;
    }

    if (isWinner) {
      const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!prefersReducedMotion) {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });

        const timer = setTimeout(() => {
          confetti({
            particleCount: 50,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
          });
          confetti({
            particleCount: 50,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
          });
        }, 400);

        return () => clearTimeout(timer);
      }
    }
  }, [isWinner, isDraw]);

  const handleRematchClick = () => {
    setRematchRequested(true);
    onPlayAgain();
  };

  const matchStats: MatchStats = {
    turns: isDraw ? 16 : isWinner ? 14 : 15,
    duration: '1m 12s',
    biggestMove: isDraw ? 'Stalemate' : isWinner ? 'Pot Secured' : 'Runner Up',
    potEarned: isDraw ? Math.floor(potAmount / 2 * 0.95) : isWinner ? Math.floor(potAmount * 0.9) : 0,
  };

  return (
    <div className="w-full max-w-[420px] mx-auto min-h-screen flex flex-col justify-between p-4 sm:p-5 select-none animate-fade-in bg-[#fbfaf7] text-[#1a1a1a]">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToLobby}
          aria-label="Back to Lobby"
          className="p-2.5 rounded-none bg-white hover:bg-[#f2efe9] border-2 border-black text-[#1a1a1a] transition-colors sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-sketch text-lg font-bold text-[#1a1a1a]/70 tracking-wider">
          Match Complete
        </span>
        <div className="w-9 h-9" />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center my-auto py-1">
        {/* Stamped Trophy / Medal Badge */}
        <div className="relative mb-2 flex flex-col items-center">
          <div
            className={`w-18 h-18 sm:w-20 sm:h-20 rounded-none border-2 sm:border-[2.5px] border-black flex items-center justify-center sketch-shadow-lg ${
              isDraw
                ? 'bg-[#e0f2fe]'
                : isWinner
                ? 'bg-[#fff9c4] animate-bounce-subtle'
                : 'bg-[#f2efe9]'
            }`}
          >
            {isDraw ? (
              <Scale className="w-10 h-10 text-[#0369a1]" />
            ) : isWinner ? (
              <TrophyCupIcon size={46} />
            ) : (
              <Swords className="w-10 h-10 text-[#1a1a1a]/60" />
            )}
          </div>
          <span
            className={`font-sketch text-xs font-bold border-2 border-black px-2.5 py-0.5 rounded-none sketch-shadow-xs -mt-2.5 rotate-1 ${
              isDraw
                ? 'bg-[#e0f2fe] text-[#0369a1]'
                : isWinner
                ? 'bg-[#dcfce7] text-[#166534]'
                : 'bg-[#fee2e2] text-[#991b1b]'
            }`}
          >
            {isDraw
              ? '🤝 MATCH DRAW'
              : isWinner
              ? isForfeit
                ? '★ FORFEIT WIN ★'
                : '★ VICTORY ★'
              : isForfeit
              ? 'FORFEITED'
              : 'RUNNER UP'}
          </span>
        </div>

        {/* Winner / Outcome Banner */}
        <h1 className="font-sketch text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-wide text-center">
          {isDraw
            ? 'Match Ended in a Draw!'
            : isWinner
            ? isForfeit
              ? 'Opponent Forfeited! You Won!'
              : 'You Won The Match!'
            : isForfeit
            ? 'You Forfeited The Match'
            : `${winner?.name || 'Opponent'} Won The Match`}
        </h1>

        {/* Stamped Prize Receipt Card */}
        {(() => {
          const arenaFee = Math.floor(potAmount * 0.10);
          const netWinnerPrize = potAmount - arenaFee;
          const drawRefundPerPlayer = Math.floor((potAmount / 2) * 0.95);

          return (
            <div className="w-full bg-[#fff9c4] border-2 sm:border-[2.5px] border-black rounded-none p-3.5 sm:p-4 sketch-shadow-lg my-3 flex flex-col items-center relative overflow-hidden">
              <div className="font-sketch text-xs font-bold text-[#854d0e]/80 uppercase tracking-widest mb-0.5">
                {isDraw
                  ? 'Draw (95% Refund)'
                  : isWinner
                  ? 'Winner Payout (90% of Pot)'
                  : 'Match Completed'}
              </div>

              <div className="flex items-center gap-2 my-1">
                <span
                  className={`font-sketch text-4xl sm:text-5xl font-bold ${
                    isDraw ? 'text-[#0369a1]' : isWinner ? 'text-[#166534]' : 'text-[#854d0e]'
                  }`}
                >
                  +{isDraw ? drawRefundPerPlayer : isWinner ? netWinnerPrize : 0}
                </span>
                <span className="font-sketch text-3xl sm:text-4xl font-bold text-[#9b2c2c]">
                  GRAM
                </span>
                <GramIcon size="md" />
              </div>

              <div className="flex items-center justify-between w-full border-t border-black/10 pt-1.5 mt-1 text-[11px] text-[#1a1a1a]/70 font-sketch font-bold">
                <span>
                  {isDraw
                    ? '5% Arena Fee'
                    : `Gibous 10% Arena Fee: -${arenaFee} GRAM`}
                </span>
                <span className={isWinner ? 'text-[#166534]' : 'text-[#854d0e]'}>
                  {isWinner ? '+150 XP' : '+25 XP'}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Player Matchup Summary */}
        <div className="w-full grid grid-cols-2 gap-2.5 mb-1">
          {/* Player 1 Card */}
          <div className="bg-white border-2 border-black rounded-none p-2.5 flex flex-col items-center text-center sketch-shadow-xs">
            <Avatar
              photoUrl={p1.avatarUrl}
              name={p1.name}
              color={p1.color}
              size="md"
              showCheck={isP1Winner}
            />
            <span className="font-sketch text-sm font-bold text-[#1a1a1a] mt-1 truncate max-w-[110px]">
              {p1.name}
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider font-sketch ${
                isDraw ? 'text-[#0369a1]' : isP1Winner ? 'text-[#166534]' : 'text-[#1a1a1a]/60'
              }`}
            >
              {isDraw
                ? `Refund (+${Math.floor((potAmount / 2) * 0.95)}G)`
                : isP1Winner
                ? `Winner (+${Math.floor(potAmount * 0.9)}G)`
                : 'Runner Up (0G)'}
            </span>
          </div>

          {/* Player 2 Card */}
          <div className="bg-white border-2 border-black rounded-none p-2.5 flex flex-col items-center text-center sketch-shadow-xs">
            <Avatar
              photoUrl={p2.avatarUrl}
              name={p2.name}
              color={p2.color}
              size="md"
              showCheck={isP2Winner}
            />
            <span className="font-sketch text-sm font-bold text-[#1a1a1a] mt-1 truncate max-w-[110px]">
              {p2.name}
            </span>
            <span
              className={`text-[10px] font-bold uppercase tracking-wider font-sketch ${
                isDraw ? 'text-[#0369a1]' : isP2Winner ? 'text-[#166534]' : 'text-[#1a1a1a]/60'
              }`}
            >
              {isDraw
                ? `Refund (+${Math.floor((potAmount / 2) * 0.95)}G)`
                : isP2Winner
                ? `Winner (+${Math.floor(potAmount * 0.9)}G)`
                : 'Runner Up (0G)'}
            </span>
          </div>
        </div>

        {/* Match Performance Analytics Breakdown Card */}
        <MatchStatsCard
          stats={matchStats}
          gameTitle="Duel Arena"
          isWinner={isWinner}
        />
      </div>

      {/* Action Buttons */}
      <div className="w-full flex flex-col gap-2 pb-1">
        {!isSpectator && (
          <SketchButton
            variant="primary"
            size="md"
            fullWidth
            disabled={rematchRequested}
            icon={<RotateCcw className={`w-4 h-4 stroke-[3] ${rematchRequested ? 'animate-spin' : ''}`} />}
            onClick={handleRematchClick}
          >
            {rematchRequested
              ? 'Waiting for Opponent...'
              : isWinner
              ? 'Play Rematch'
              : 'Request Rematch'}
          </SketchButton>
        )}

        <SketchButton
          variant={isSpectator ? 'primary' : 'yellow'}
          size={isSpectator ? 'md' : 'sm'}
          fullWidth
          icon={<Home className="w-4 h-4" />}
          onClick={onBackToLobby}
        >
          Back to Lobby
        </SketchButton>
      </div>
    </div>
  );
};
