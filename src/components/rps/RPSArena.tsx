import React, { useState, useEffect, useRef } from 'react';
import { NormalizedDuelState } from '../../types/game';
import { RPSChoice } from '../../../shared';
import { RockIcon, PaperIcon, ScissorsIcon, SwordsClashIcon } from '../icons/GameIcons';
import { Lock } from 'lucide-react';

interface RPSArenaProps {
  duelState: NormalizedDuelState;
  onChooseRPS: (choice: RPSChoice) => void;
}

interface RoundHistoryEntry {
  round: number;
  p1Choice: RPSChoice;
  p2Choice: RPSChoice;
  winner: string;
}

export const RPSArena: React.FC<RPSArenaProps> = ({ duelState, onChooseRPS }) => {
  const { myRole, gameState, lastRPSEvent } = duelState;

  const [myLockedChoice, setMyLockedChoice] = useState<RPSChoice | null>(null);
  const [clashState, setClashState] = useState<{
    p1Choice: RPSChoice;
    p2Choice: RPSChoice;
    roundWinner: string;
    roundNumber: number;
  } | null>(null);
  const [clashCountdown, setClashCountdown] = useState<number | null>(null);
  const [history, setHistory] = useState<RoundHistoryEntry[]>([]);
  const processedRoundRef = useRef<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const p1Score = gameState?.p1Score || 0;
  const p2Score = gameState?.p2Score || 0;
  const roundNumber = gameState?.roundNumber || 1;

  const choices: { type: RPSChoice; label: string }[] = [
    { type: 'rock', label: 'ROCK' },
    { type: 'paper', label: 'PAPER' },
    { type: 'scissors', label: 'SCISSORS' },
  ];

  const renderChoiceIcon = (type: RPSChoice, size: number = 32) => {
    switch (type) {
      case 'rock':
        return <RockIcon size={size} />;
      case 'paper':
        return <PaperIcon size={size} />;
      case 'scissors':
        return <ScissorsIcon size={size} />;
    }
  };

  const handleSelect = (choice: RPSChoice) => {
    if (!myRole || myLockedChoice || clashState || clashCountdown !== null) return;
    setMyLockedChoice(choice);
    onChooseRPS(choice);
  };

  // Authoritative clash resolution animation
  useEffect(() => {
    if (!lastRPSEvent) return;
    if (processedRoundRef.current === lastRPSEvent.round) return;
    processedRoundRef.current = lastRPSEvent.round;

    // Clear previous pending timers
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];

    // Run 3-2-1 Clash Countdown
    setClashCountdown(3);

    const t3 = setTimeout(() => {
      setClashCountdown(2);
    }, 500);

    const t2 = setTimeout(() => {
      setClashCountdown(1);
    }, 1000);

    const t1 = setTimeout(() => {
      setClashCountdown(null);
      setClashState({
        p1Choice: lastRPSEvent.p1Choice,
        p2Choice: lastRPSEvent.p2Choice,
        roundWinner: lastRPSEvent.roundWinner,
        roundNumber: lastRPSEvent.round,
      });

      // Record to match round history
      setHistory((prev) => [
        ...prev.filter((h) => h.round !== lastRPSEvent.round),
        {
          round: lastRPSEvent.round,
          p1Choice: lastRPSEvent.p1Choice,
          p2Choice: lastRPSEvent.p2Choice,
          winner: lastRPSEvent.roundWinner,
        },
      ]);

      // Clear for next round after 2.2s (allowing players to digest outcome)
      const tClear = setTimeout(() => {
        setClashState(null);
        setMyLockedChoice(null);
      }, 2200);
      timersRef.current.push(tClear);
    }, 1500);

    timersRef.current.push(t3, t2, t1);

    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };
  }, [lastRPSEvent]);

  const isSpectator = myRole === null;
  const p1Name = duelState.players.p1?.name || 'Player 1';
  const p2Name = duelState.players.p2?.name || 'Player 2';
  const opponentRole = myRole === 'p2' ? 'p1' : 'p2';
  const opponentName = duelState.players[opponentRole]?.name || (myRole === 'p1' ? 'Player 2' : 'Player 1');

  return (
    <div className="flex flex-col items-center justify-between w-full h-full max-w-sm mx-auto py-1 font-body">
      {/* Series Header & Gem Tracker */}
      <div className="w-full bg-[#fbfaf7] border-2 border-black rounded-none p-2.5 text-center mb-1.5 sketch-shadow-xs font-sketch">
        <div className="text-xs font-bold text-[#9b2c2c] tracking-widest uppercase mb-0.5">
          ROUND {roundNumber} • FIRST TO 3 GEMS
        </div>
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-1 font-bold text-[#166534]">
            <span>P1:</span>
            <span className="tracking-widest text-base">
              {'●'.repeat(p1Score)}
              {'○'.repeat(Math.max(0, 3 - p1Score))}
            </span>
          </div>
          <span className="text-[#9b2c2c] font-black italic">VS</span>
          <div className="flex items-center gap-1 font-bold text-[#1a365d]">
            <span className="tracking-widest text-base">
              {'●'.repeat(p2Score)}
              {'○'.repeat(Math.max(0, 3 - p2Score))}
            </span>
            <span>:P2</span>
          </div>
        </div>
      </div>

      {/* Round History Strip */}
      {history.length > 0 && (
        <div className="w-full flex items-center justify-center gap-1.5 mb-1.5 px-1 overflow-x-auto scrollbar-none">
          {history.map((h) => {
            const isMyWin =
              (myRole === 'p1' && h.winner === 'p1') ||
              (myRole === 'p2' && h.winner === 'p2');
            const isDrawRound = h.winner === 'draw';
            const badgeBg = isDrawRound
              ? 'bg-[#fff9c4] text-[#854d0e]'
              : isMyWin
              ? 'bg-[#dcfce7] text-[#166534]'
              : 'bg-[#fee2e2] text-[#991b1b]';

            return (
              <div
                key={h.round}
                className={`flex items-center gap-1 px-2 py-0.5 border border-black text-[10px] font-sketch font-bold ${badgeBg} sketch-shadow-xs shrink-0`}
                title={`Round ${h.round}: ${h.p1Choice} vs ${h.p2Choice}`}
              >
                <span className="opacity-70">R{h.round}:</span>
                <span className="inline-flex items-center">{renderChoiceIcon(h.p1Choice, 13)}</span>
                <span className="opacity-40">vs</span>
                <span className="inline-flex items-center">{renderChoiceIcon(h.p2Choice, 13)}</span>
                <span className="px-1 py-0.2 bg-black text-white text-[8px] font-mono leading-none">
                  {isDrawRound ? 'D' : isMyWin ? 'W' : 'L'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Showdown Display */}
      <div className="flex-1 flex flex-col items-center justify-center w-full min-h-[140px] my-1">
        {clashCountdown !== null ? (
          <div className="flex flex-col items-center animate-bounce">
            <span className="font-sketch font-bold text-xs text-neutral-600 uppercase tracking-widest mb-1">
              CLASHING IN
            </span>
            <span className="font-sketch font-black text-6xl text-[#9b2c2c]">{clashCountdown}</span>
          </div>
        ) : clashState ? (
          <div className="flex flex-col items-center animate-fade-in">
            <div className="flex items-center gap-4 my-1">
              <div className="flex flex-col items-center p-2.5 rounded-none bg-white border-2 border-black sketch-shadow-xs min-w-[72px]">
                <div className="my-1 animate-bounce flex items-center justify-center">
                  {renderChoiceIcon(clashState.p1Choice, 40)}
                </div>
                <span className="font-sketch font-bold text-xs text-[#166534] mt-0.5 uppercase">
                  {clashState.p1Choice}
                </span>
              </div>
              <div className="flex items-center justify-center">
                <SwordsClashIcon size={32} />
              </div>
              <div className="flex flex-col items-center p-2.5 rounded-none bg-white border-2 border-black sketch-shadow-xs min-w-[72px]">
                <div className="my-1 animate-bounce flex items-center justify-center">
                  {renderChoiceIcon(clashState.p2Choice, 40)}
                </div>
                <span className="font-sketch font-bold text-xs text-[#1a365d] mt-0.5 uppercase">
                  {clashState.p2Choice}
                </span>
              </div>
            </div>
            <div
              className={`mt-2 py-1 px-3 rounded-none font-sketch font-bold text-xs border-2 border-black sketch-shadow-xs tracking-wider uppercase ${
                clashState.roundWinner === 'draw'
                  ? 'bg-[#fff9c4] text-[#854d0e]'
                  : isSpectator
                  ? (clashState.roundWinner === 'p1' ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#e0f2fe] text-[#1a365d]')
                  : ((myRole === 'p1' && clashState.roundWinner === 'p1') ||
                      (myRole === 'p2' && clashState.roundWinner === 'p2'))
                  ? 'bg-[#dcfce7] text-[#166534]'
                  : 'bg-[#fee2e2] text-[#991b1b]'
              }`}
            >
              {clashState.roundWinner === 'draw'
                ? 'DOUBLE CLASH — DRAW'
                : isSpectator
                ? `${clashState.roundWinner === 'p1' ? p1Name.toUpperCase() : p2Name.toUpperCase()} WON ROUND`
                : ((myRole === 'p1' && clashState.roundWinner === 'p1') ||
                    (myRole === 'p2' && clashState.roundWinner === 'p2'))
                ? 'YOU WON THIS ROUND'
                : `${opponentName.toUpperCase()} WON ROUND`}
            </div>
          </div>
        ) : myLockedChoice ? (
          <div className="flex flex-col items-center text-center animate-card-lock">
            <div className="relative w-20 h-24 rounded-none bg-white border-2 border-black sketch-shadow-md flex flex-col items-center justify-center p-2 mb-2">
              <div className="mb-1 flex items-center justify-center">
                {renderChoiceIcon(myLockedChoice, 36)}
              </div>
              <div className="flex items-center gap-1 font-sketch font-bold text-[9px] text-[#9b2c2c] tracking-widest uppercase border border-[#9b2c2c] px-1.5 py-0.5 bg-[#fee2e2]">
                <Lock className="w-2.5 h-2.5 stroke-[2.5]" />
                <span>SEALED</span>
              </div>
            </div>
            <span className="font-sketch font-bold text-xs text-[#166534] uppercase tracking-wider">
              YOUR CHOICE: {myLockedChoice}
            </span>
            <span className="font-body text-xs text-neutral-600 mt-0.5 animate-pulse">
              Waiting for {opponentName} to commit...
            </span>
          </div>
        ) : (
          <div className="text-center font-sketch">
            <span className="font-bold text-base text-[#1a1a1a] tracking-wider uppercase block">
              CHOOSE YOUR WEAPON
            </span>
            <p className="font-body text-xs text-neutral-600 mt-0.5">
              Choices remain secret until clash
            </p>
          </div>
        )}
      </div>

      {/* 3 Weapon Stamp Cards */}
      <div className="grid grid-cols-3 gap-2 w-full mt-1">
        {choices.map((c) => {
          const isSelected = myLockedChoice === c.type;
          const isDisabled = !myRole || myLockedChoice !== null || clashState !== null || clashCountdown !== null;
          return (
            <button
              key={c.type}
              onClick={() => handleSelect(c.type)}
              disabled={isDisabled}
              className={`flex flex-col items-center justify-center p-3 rounded-none border-2 border-black transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#fff9c4] sketch-shadow-sm scale-105 ring-2 ring-[#9b2c2c]'
                  : isDisabled
                  ? 'bg-white/50 opacity-40 cursor-not-allowed'
                  : 'bg-white hover:bg-[#fff9c4] sketch-shadow sketch-btn-press'
              }`}
            >
              <div className="mb-1.5 flex items-center justify-center">
                {renderChoiceIcon(c.type, 36)}
              </div>
              <span className="font-sketch font-bold text-xs tracking-wider text-[#1a1a1a]">{c.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
