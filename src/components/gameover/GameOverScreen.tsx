import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Player, PlayerId, MatchStats } from '../../types/game';
import { Avatar } from '../ui/Avatar';
import { GramIcon } from '../ui/GramIcon';
import { SketchButton } from '../ui/SketchButton';
import { TrophyCupIcon } from '../icons/GameIcons';
import { MatchStatsCard } from './MatchStatsCard';
import { RotateCcw, Home, ArrowLeft, Swords } from 'lucide-react';
import { useSoundEffects } from '../../hooks/useSoundEffects';

interface GameOverScreenProps {
  winnerId: PlayerId;
  p1: Player;
  p2: Player;
  potAmount: number;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

export const GameOverScreen: React.FC<GameOverScreenProps> = ({
  winnerId,
  p1,
  p2,
  potAmount,
  onPlayAgain,
  onBackToLobby,
}) => {
  const winner = winnerId === 'p1' ? p1 : p2;
  const loser = winnerId === 'p1' ? p2 : p1;
  const isP1Winner = winnerId === 'p1';
  const sounds = useSoundEffects();

  useEffect(() => {
    if (isP1Winner) {
      // 4real Victory Confetti Cannon
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
    } else {
      sounds.playDefeat();
    }
  }, [isP1Winner, sounds]);

  const matchStats: MatchStats = {
    turns: Math.floor(Math.random() * 8) + 12,
    duration: '1m 28s',
    biggestMove: isP1Winner ? 'Climb 28➔84' : 'Connect 4-in-a-row',
    potEarned: isP1Winner ? potAmount : 10,
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
              isP1Winner
                ? 'bg-[#fff9c4] animate-bounce-subtle'
                : 'bg-[#f2efe9]'
            }`}
          >
            {isP1Winner ? (
              <TrophyCupIcon size={46} />
            ) : (
              <Swords className="w-10 h-10 text-[#1a1a1a]/60" />
            )}
          </div>
          <span
            className={`font-sketch text-xs font-bold border-2 border-black px-2.5 py-0.5 rounded-none sketch-shadow-xs -mt-2.5 rotate-1 ${
              isP1Winner
                ? 'bg-[#dcfce7] text-[#166534]'
                : 'bg-[#fee2e2] text-[#991b1b]'
            }`}
          >
            {isP1Winner ? '★ VICTORY ★' : 'RUNNER UP'}
          </span>
        </div>

        {/* Winner / Outcome Banner */}
        <h1 className="font-sketch text-2xl sm:text-3xl font-bold text-[#1a1a1a] tracking-wide text-center">
          {isP1Winner ? 'You Won The Match!' : `${winner.name} Won The Match`}
        </h1>

        {/* Stamped Prize Receipt Card */}
        {(() => {
          const arenaFee = Math.floor(potAmount * 0.10);
          const netWinnerPrize = potAmount - arenaFee;

          return (
            <div className="w-full bg-[#fff9c4] border-2 sm:border-[2.5px] border-black rounded-none p-3.5 sm:p-4 sketch-shadow-lg my-3 flex flex-col items-center relative overflow-hidden">
              <div className="font-sketch text-xs font-bold text-[#854d0e]/80 uppercase tracking-widest mb-0.5">
                {isP1Winner ? 'Net Winner Prize (90% of Pot)' : 'Match Completed'}
              </div>

              <div className="flex items-center gap-2 my-1">
                <span
                  className={`font-sketch text-4xl sm:text-5xl font-bold ${
                    isP1Winner ? 'text-[#166534]' : 'text-[#854d0e]'
                  }`}
                >
                  +{isP1Winner ? netWinnerPrize : 0}
                </span>
                <span className="font-sketch text-3xl sm:text-4xl font-bold text-[#9b2c2c]">
                  Play GRAM
                </span>
                <GramIcon size="md" />
              </div>

              <div className="flex items-center justify-between w-full border-t border-black/10 pt-1.5 mt-1 text-[11px] text-[#1a1a1a]/70 font-sketch font-bold">
                <span>Gibous 10% Arena Fee: -{arenaFee} Play GRAM</span>
                <span className="text-[#166534]">+150 XP Earned</span>
              </div>
            </div>
          );
        })()}

        {/* Player Matchup Summary */}
        <div className="w-full grid grid-cols-2 gap-2.5 mb-1">
          {/* Winner Card */}
          <div className="bg-white border-2 border-black rounded-none p-2.5 flex flex-col items-center text-center sketch-shadow-xs">
            <Avatar
              photoUrl={winner.avatarUrl}
              name={winner.name}
              color={winner.color}
              size="md"
              showCheck={true}
            />
            <span className="font-sketch text-sm font-bold text-[#1a1a1a] mt-1 truncate max-w-[110px]">
              {winner.name}
            </span>
            <span className="text-[10px] font-bold text-[#166534] uppercase tracking-wider font-sketch">
              Winner (+{Math.floor(potAmount * 0.9)} Play GRAM)
            </span>
          </div>

          {/* Runner Up Card */}
          <div className="bg-white border-2 border-black rounded-none p-2.5 flex flex-col items-center text-center sketch-shadow-xs opacity-90">
            <Avatar
              photoUrl={loser.avatarUrl}
              name={loser.name}
              color={loser.color}
              size="md"
            />
            <span className="font-sketch text-sm font-bold text-[#1a1a1a] mt-1 truncate max-w-[110px]">
              {loser.name}
            </span>
            <span className="text-[10px] font-bold text-[#1a1a1a]/60 uppercase tracking-wider font-sketch">
              Runner Up (0 Play GRAM)
            </span>
          </div>
        </div>

        {/* Match Performance Analytics Breakdown Card */}
        <MatchStatsCard
          stats={matchStats}
          gameTitle="Duel Arena"
          isWinner={isP1Winner}
        />
      </div>

      {/* Action Buttons */}
      <div className="w-full flex flex-col gap-2 pb-1">
        <SketchButton
          variant="primary"
          size="md"
          fullWidth
          icon={<RotateCcw className="w-4 h-4 stroke-[3]" />}
          onClick={onPlayAgain}
        >
          {isP1Winner ? 'Play Rematch' : 'Request Rematch'}
        </SketchButton>

        <SketchButton
          variant="yellow"
          size="sm"
          fullWidth
          icon={<Home className="w-4 h-4" />}
          onClick={onBackToLobby}
        >
          Enter Arena Hub
        </SketchButton>
      </div>
    </div>
  );
};
