import React from 'react';
import { PlayerId, RPSChoice } from '../../types/game';
import { RPS_CHOICES } from '../../config/rpsConfig';
import { SwordsClashIcon, RockIcon, PaperIcon, ScissorsIcon } from '../icons/GameIcons';

interface ClashAnimationProps {
  p1Choice: RPSChoice | null;
  p2Choice: RPSChoice | null;
  countdown: number | null;
  roundWinner: PlayerId | 'draw' | null;
  isClashing: boolean;
  p1Wins?: number;
  p2Wins?: number;
  targetWins?: number;
  isDoubleClash?: boolean;
}

export const ClashAnimation: React.FC<ClashAnimationProps> = ({
  p1Choice,
  p2Choice,
  countdown,
  roundWinner,
  isClashing,
  p1Wins = 0,
  p2Wins = 0,
  targetWins = 3,
  isDoubleClash = false,
}) => {
  const renderChoiceSvg = (choice: RPSChoice) => {
    switch (choice) {
      case 'rock':
        return <RockIcon size={46} />;
      case 'paper':
        return <PaperIcon size={46} />;
      case 'scissors':
        return <ScissorsIcon size={46} />;
    }
  };

  return (
    <div className="w-full max-w-[390px] mx-auto bg-white border-3 border-black rounded-3xl p-4 sm:p-5 sketch-shadow-lg flex flex-col items-center relative overflow-hidden select-none text-[#1a1a1a]">
      {/* Gibous Tag */}
      <div className="absolute top-1 left-4 font-sketch text-[10px] font-bold text-[#1a1a1a]/40 tracking-wider">
        GIBOUS • WEAPON SHOWDOWN ARENA
      </div>

      {/* Duel Arena Matchup */}
      <div className="w-full flex items-center justify-around py-3 relative z-10">
        {/* Player 1 Side */}
        <div className="flex flex-col items-center">
          <span className="font-sketch text-sm font-bold text-[#1a1a1a]/60 mb-1">Player 1</span>
          
          {/* Series Victory Stars */}
          <div className="flex gap-1 mb-2">
            {Array.from({ length: targetWins }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full border border-black transition-all ${
                  i < p1Wins ? 'bg-[#9b2c2c] scale-110 shadow-sm' : 'bg-[#f2efe9]'
                }`}
              />
            ))}
          </div>

          <div
            className={`w-20 h-24 sm:w-24 sm:h-28 rounded-2xl bg-[#fbfaf7] border-2 border-black flex items-center justify-center transition-all duration-200 ${
              p1Choice && !countdown
                ? 'bg-[#fee2e2] sketch-shadow scale-105 ring-2 ring-[#9b2c2c]'
                : 'sketch-shadow-xs'
            }`}
          >
            {countdown !== null ? (
              <RockIcon size={42} className="animate-bounce" />
            ) : p1Choice ? (
              <div className="animate-fade-in flex items-center justify-center">
                {renderChoiceSvg(p1Choice)}
              </div>
            ) : (
              <span className="font-sketch text-3xl text-[#1a1a1a]/40 font-black">?</span>
            )}
          </div>
          <span className="font-sketch text-sm font-bold text-[#9b2c2c] mt-1.5">
            {p1Choice && countdown === null ? RPS_CHOICES[p1Choice].label : 'Ready'}
          </span>
        </div>

        {/* Center Swords / Countdown */}
        <div className="flex flex-col items-center justify-center px-2">
          {countdown !== null ? (
            <div className="w-12 h-12 rounded-full bg-[#fff9c4] border-2 border-black flex items-center justify-center font-sketch text-2xl font-black text-[#854d0e] sketch-shadow animate-ping">
              {countdown}
            </div>
          ) : isClashing ? (
            <div className="w-12 h-12 rounded-full bg-[#f2efe9] border-2 border-black flex items-center justify-center animate-spin sketch-shadow-xs">
              <SwordsClashIcon size={26} />
            </div>
          ) : (
            <div className="w-11 h-11 rounded-full bg-[#f2efe9] border-2 border-black flex items-center justify-center sketch-shadow-xs">
              <SwordsClashIcon size={24} />
            </div>
          )}
        </div>

        {/* Player 2 Side */}
        <div className="flex flex-col items-center">
          <span className="font-sketch text-sm font-bold text-[#1a1a1a]/60 mb-1">Player 2</span>

          {/* Series Victory Stars */}
          <div className="flex gap-1 mb-2">
            {Array.from({ length: targetWins }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full border border-black transition-all ${
                  i < p2Wins ? 'bg-[#1a365d] scale-110 shadow-sm' : 'bg-[#f2efe9]'
                }`}
              />
            ))}
          </div>

          <div
            className={`w-20 h-24 sm:w-24 sm:h-28 rounded-2xl bg-[#fbfaf7] border-2 border-black flex items-center justify-center transition-all duration-200 ${
              p2Choice && !countdown
                ? 'bg-[#e0f2fe] sketch-shadow scale-105 ring-2 ring-[#1a365d]'
                : 'sketch-shadow-xs'
            }`}
          >
            {countdown !== null ? (
              <RockIcon size={42} className="animate-bounce" />
            ) : p2Choice ? (
              <div className="animate-fade-in flex items-center justify-center">
                {renderChoiceSvg(p2Choice)}
              </div>
            ) : (
              <span className="font-sketch text-3xl text-[#1a1a1a]/40 font-black">?</span>
            )}
          </div>
          <span className="font-sketch text-sm font-bold text-[#1a365d] mt-1.5">
            {p2Choice && countdown === null ? RPS_CHOICES[p2Choice].label : 'Ready'}
          </span>
        </div>
      </div>

      {/* Round Outcome Stamped Result Badge */}
      {roundWinner && countdown === null && (
        <div
          className={`mt-2 px-4 py-1.5 rounded-xl font-sketch text-sm sm:text-base font-bold tracking-wide animate-fade-in border-2 border-black sketch-shadow-xs ${
            roundWinner === 'p1'
              ? 'bg-[#fee2e2] text-[#991b1b]'
              : roundWinner === 'p2'
              ? 'bg-[#e0f2fe] text-[#1a365d]'
              : 'bg-[#fff9c4] text-[#854d0e]'
          }`}
        >
          {roundWinner === 'p1'
            ? '🔥 Player 1 Wins The Round!'
            : roundWinner === 'p2'
            ? '⚡ Player 2 Wins The Round!'
            : isDoubleClash
            ? '⚔️ DOUBLE CLASH! Choose Again!'
            : '🤝 It’s A Draw! Choose Again!'}
        </div>
      )}
    </div>
  );
};
