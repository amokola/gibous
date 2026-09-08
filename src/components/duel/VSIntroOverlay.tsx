import React, { useEffect, useState } from 'react';
import { Swords } from 'lucide-react';
import { GameType } from '../../../shared';
import { GramIcon } from '../ui/GramIcon';

interface VSIntroOverlayProps {
  gameType: GameType;
  stake: number;
  pot: number;
  p1Name: string;
  p1Avatar?: string;
  p2Name: string;
  p2Avatar?: string;
  onComplete: () => void;
}

export const VSIntroOverlay: React.FC<VSIntroOverlayProps> = ({
  gameType,
  stake,
  pot,
  p1Name,
  p1Avatar,
  p2Name,
  p2Avatar,
  onComplete,
}) => {
  const [phase, setPhase] = useState<'matchup' | 'countdown'>('matchup');
  const [count, setCount] = useState(3);

  const gameTitles: Record<GameType, string> = {
    snake: 'SNAKES & LADDERS',
    connect4: 'FOUR IN A ROW',
    rps: 'ROCK PAPER SCISSORS',
  };

  useEffect(() => {
    // Phase 1: 1.5s visual matchup presentation
    const t1 = setTimeout(() => {
      setPhase('countdown');
    }, 1500);

    return () => clearTimeout(t1);
  }, []);

  useEffect(() => {
    if (phase !== 'countdown') return;

    if (count > 1) {
      const timer = setTimeout(() => setCount((c) => c - 1), 700);
      return () => clearTimeout(timer);
    } else if (count === 1) {
      const timer = setTimeout(() => {
        setCount(0); // "FIGHT!"
        const completeTimer = setTimeout(onComplete, 500);
        return () => clearTimeout(completeTimer);
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [phase, count, onComplete]);

  return (
    <div className="telegram-safe-overlay fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm p-4 text-[#1a1a1a] select-none animate-fade-in font-body">
      {/* Main Comic Duel Poster */}
      <div className="relative w-full max-w-xs sm:max-w-sm bg-[#fbfaf7] border-2 sm:border-[3.5px] border-black rounded-none p-6 text-center sketch-shadow-2xl">
        {/* Game Title Stamp */}
        <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-none bg-[#fff9c4] border-2 border-black sketch-shadow-xs font-sketch text-xs font-bold text-[#1a1a1a] tracking-widest uppercase mb-4">
          <Swords className="w-3.5 h-3.5 text-[#9b2c2c]" />
          <span>{gameTitles[gameType] || 'DUEL'}</span>
        </div>

        {phase === 'matchup' ? (
          /* 1.5s Comic Matchup Card */
          <div className="flex flex-col items-center w-full animate-fade-in">
            <div className="flex items-center justify-around w-full gap-2 px-1">
              {/* Player 1 */}
              <div className="flex flex-col items-center flex-1">
                <div className="relative">
                  {p1Avatar ? (
                    <img
                      src={p1Avatar}
                      alt={p1Name}
                      className="w-16 h-16 rounded-none object-cover border-2 border-black sketch-shadow-sm"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-none bg-[#dcfce7] border-2 border-black flex items-center justify-center font-sketch font-bold text-2xl text-[#166534] sketch-shadow-sm">
                      {p1Name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="font-sketch font-bold text-sm mt-2 truncate max-w-[90px] text-[#166534]">
                  {p1Name}
                </span>
                <span className="text-[11px] font-body text-neutral-600 flex items-center gap-0.5">
                  {stake} <GramIcon className="w-3 h-3 inline" />
                </span>
              </div>

              {/* VS Comic Stamp */}
              <div className="flex flex-col items-center px-1">
                <span className="font-sketch font-black text-4xl text-[#9b2c2c] italic tracking-tighter">
                  VS
                </span>
              </div>

              {/* Player 2 */}
              <div className="flex flex-col items-center flex-1">
                <div className="relative">
                  {p2Avatar ? (
                    <img
                      src={p2Avatar}
                      alt={p2Name}
                      className="w-16 h-16 rounded-none object-cover border-2 border-black sketch-shadow-sm"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-none bg-[#e0f2fe] border-2 border-black flex items-center justify-center font-sketch font-bold text-2xl text-[#1a365d] sketch-shadow-sm">
                      {p2Name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="font-sketch font-bold text-sm mt-2 truncate max-w-[90px] text-[#1a365d]">
                  {p2Name}
                </span>
                <span className="text-[11px] font-body text-neutral-600 flex items-center gap-0.5">
                  {stake} <GramIcon className="w-3 h-3 inline" />
                </span>
              </div>
            </div>

            {/* Match Stake Sticky Note */}
            <div className="sticky-note rounded-none border-2 border-black p-2.5 mt-5 w-full flex items-center justify-between font-sketch">
              <span className="text-xs text-neutral-700 font-bold tracking-wide">TOTAL MATCH POT:</span>
              <span className="font-black text-base flex items-center gap-1 text-[#1a1a1a]">
                {pot} <GramIcon className="w-4 h-4 inline" />
              </span>
            </div>
          </div>
        ) : (
          /* 3-2-1 Countdown & FIGHT */
          <div className="flex flex-col items-center justify-center min-h-[160px] py-4 animate-fade-in">
            <span className="font-sketch font-bold text-base text-neutral-600 uppercase tracking-widest mb-1">
              {count > 0 ? 'GET READY...' : 'ARENA OPEN!'}
            </span>
            <div className="flex items-center justify-center h-24">
              {count > 0 ? (
                <span className="font-sketch font-black text-8xl text-[#9b2c2c] animate-bounce tracking-tighter">
                  {count}
                </span>
              ) : (
                <span className="font-sketch font-black text-6xl text-[#166534] animate-pulse tracking-wider">
                  FIGHT!
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
