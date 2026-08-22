import React from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Player, PlayerId } from '../../types/game';
import { Avatar } from '../ui/Avatar';

interface ScoreHeaderProps {
  p1: Player;
  p2: Player;
  activePlayer: PlayerId;
  scoreLabel?: string;
  onBack: () => void;
  onLeaveRoom?: () => void;
}

export const ScoreHeader: React.FC<ScoreHeaderProps> = ({
  p1,
  p2,
  activePlayer,
  scoreLabel = 'Tile',
  onBack,
  onLeaveRoom,
}) => {
  const isYourTurn = activePlayer === 'p1';

  return (
    <div className="w-full max-w-[420px] mx-auto mb-3 select-none">
      {/* Top Bar with Turn Pill */}
      <div className="flex items-center justify-between mb-2.5 px-1">
        {/* Back Button */}
        <button
          onClick={onBack}
          aria-label="Go back"
          className="p-2 rounded-none bg-white hover:bg-[#f2efe9] border-2 border-black text-[#1a1a1a] transition-colors sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Turn Indicator Pill */}
        <div
          role="status"
          aria-live="polite"
          className={`px-4 py-1 rounded-none font-sketch text-xs sm:text-sm font-bold tracking-wide transition-all duration-200 border-2 border-black sketch-shadow-xs ${
            isYourTurn
              ? 'bg-[#fff9c4] text-[#854d0e]'
              : 'bg-[#e0f2fe] text-[#1a365d]'
          }`}
        >
          {isYourTurn ? 'Your Turn' : "Opponent's Turn"}
        </div>

        {/* Leave Room Button */}
        <button
          onClick={onLeaveRoom || onBack}
          aria-label="Leave room"
          className="p-2 rounded-none bg-white hover:bg-[#fee2e2] border-2 border-black text-[#9b2c2c] transition-colors sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Players Scoreboard Arena */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-white border-2 border-black rounded-none sketch-shadow-xs text-[#1a1a1a]">
        {/* Player 1 (You) */}
        <div className="flex items-center gap-2">
          <Avatar
            photoUrl={p1.avatarUrl}
            name={p1.name}
            color="green"
            size="md"
            isActive={isYourTurn}
          />
          <div className="flex flex-col">
            <span className="font-sketch text-xs font-bold text-[#1a1a1a]/60">You</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-[#1a1a1a]/50 uppercase font-bold font-sketch">{scoreLabel}</span>
              <span className="font-sketch text-lg font-bold text-[#1a1a1a] leading-none">{p1.score}</span>
            </div>
          </div>
        </div>

        {/* VS Badge */}
        <div className="font-sketch text-xs font-bold text-[#1a1a1a]/60 px-2 py-0.5 rounded-none border-2 border-black bg-[#f2efe9]">
          VS
        </div>

        {/* Player 2 (Opponent) */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col items-end">
            <span className="font-sketch text-xs font-bold text-[#1a1a1a]/60">Opponent</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-[#1a1a1a]/50 uppercase font-bold font-sketch">{scoreLabel}</span>
              <span className="font-sketch text-lg font-bold text-[#1a1a1a] leading-none">{p2.score}</span>
            </div>
          </div>
          <Avatar
            photoUrl={p2.avatarUrl}
            name={p2.name}
            color="blue"
            size="md"
            isActive={!isYourTurn}
          />
        </div>
      </div>
    </div>
  );
};
