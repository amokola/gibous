import React from 'react';
import { Player } from '../../types/game';
import { Avatar } from '../ui/Avatar';

interface MatchupCardProps {
  p1: Player;
  p2: Player;
  isReady: boolean;
}

export const MatchupCard: React.FC<MatchupCardProps> = ({ p1, p2, isReady }) => {
  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* 2 Players Arena */}
      <div className="w-full flex items-center justify-around py-4 px-2 bg-white border-2 sm:border-[2.5px] border-black rounded-none sketch-shadow">
        {/* Player 1 */}
        <div className="flex flex-col items-center">
          <span className="font-sketch text-xs font-bold text-[#1a1a1a]/60 mb-1.5">Player 1</span>
          <Avatar
            photoUrl={p1.avatarUrl}
            name={p1.name}
            color="green"
            size="lg"
            showCheck={true}
            isActive={true}
          />
          <span className="font-sketch text-base font-bold text-[#1a1a1a] mt-2 truncate max-w-[100px]">
            {p1.name || 'Player 1'}
          </span>
        </div>

        {/* Center VS */}
        <div className="flex flex-col items-center justify-center">
          <div className="w-9 h-9 rounded-none bg-[#f2efe9] border-2 border-black flex items-center justify-center sketch-shadow-xs">
            <span className="font-sketch text-sm font-bold text-[#1a1a1a]">VS</span>
          </div>
        </div>

        {/* Player 2 */}
        <div className="flex flex-col items-center">
          <span className="font-sketch text-xs font-bold text-[#1a1a1a]/60 mb-1.5">Player 2</span>
          <Avatar
            photoUrl={p2.avatarUrl}
            name={p2.name}
            color="blue"
            size="lg"
            showCheck={p2.isReady}
            isActive={p2.isReady}
          />
          <span className="font-sketch text-base font-bold text-[#1a1a1a] mt-2 truncate max-w-[100px]">
            {p2.name || 'Player 2'}
          </span>
        </div>
      </div>

      {/* Room Ready Status Card */}
      <div className="w-full bg-white border-2 border-black rounded-none p-2.5 mt-2 flex flex-col items-start px-4 sketch-shadow-xs">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-none bg-[#15803d] border border-black animate-pulse" />
          <span className="font-sketch text-sm font-bold text-[#1a1a1a]">Room Match Ready</span>
        </div>
        <span className="text-xs text-[#1a1a1a]/70 mt-0.5 font-sketch">
          {isReady
            ? 'Both players are connected and ready to duel!'
            : 'Waiting for opponent to connect...'}
        </span>
      </div>
    </div>
  );
};
