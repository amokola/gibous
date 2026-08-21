import React from 'react';
import { Avatar } from '../ui/Avatar';
import { GramIcon } from '../ui/GramIcon';
import { Plus, ShieldCheck, Volume2, VolumeX } from 'lucide-react';

interface UserHeaderBarProps {
  name: string;
  avatarUrl?: string;
  balance: number;
  level?: number;
  rank?: string;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenProfile: () => void;
  onOpenWallet: () => void;
}

export const UserHeaderBar: React.FC<UserHeaderBarProps> = ({
  name,
  avatarUrl,
  balance,
  level = 5,
  rank = 'Diamond',
  isMuted,
  onToggleMute,
  onOpenProfile,
  onOpenWallet,
}) => {
  return (
    <div className="w-full flex items-center justify-between py-2 select-none">
      {/* Left User Profile (Clickable to open profile career stats) */}
      <div
        onClick={onOpenProfile}
        className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 active:scale-95 transition-all group"
      >
        <div className="relative">
          <Avatar
            photoUrl={avatarUrl}
            name={name}
            color="green"
            size="md"
            showCheck={true}
            isActive={true}
          />
        </div>

        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="font-sketch text-lg font-bold text-[#1a1a1a] tracking-wide leading-none group-hover:text-[#9b2c2c] transition-colors">
              {name || 'Player'}
            </span>
            <ShieldCheck className="w-4 h-4 text-[#9b2c2c]" />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-sketch text-xs bg-[#fff9c4] text-[#1a1a1a] border border-black px-2 py-0.2 rounded-none font-bold sketch-shadow-xs -rotate-1">
              Lv.{level}
            </span>
            <span className="text-[11px] text-[#1a1a1a]/60 font-bold uppercase tracking-wider font-sketch">
              {rank}
            </span>
          </div>
        </div>
      </div>

      {/* Right Controls: Sound Toggle & GRAM Balance Button */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label="Toggle sound"
          className="p-2 rounded-none bg-white hover:bg-[#fbfaf7] border-2 border-black text-[#1a1a1a] transition-colors sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-[#ef4444]" />
          ) : (
            <Volume2 className="w-4 h-4 text-[#9b2c2c]" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenWallet}
          className="flex items-center gap-2 bg-white hover:bg-[#fbfaf7] border-2 border-black rounded-none px-3 py-1.5 sketch-shadow-xs transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none group"
        >
          <GramIcon size="sm" />
          <div className="flex flex-col items-start leading-none">
            <span className="text-[9px] font-bold text-[#1a1a1a]/50 uppercase tracking-wider font-sketch">
              Vault
            </span>
            <span className="font-sketch text-base font-bold text-[#1a365d] group-hover:text-[#9b2c2c] transition-colors">
              {balance.toLocaleString()} Play GRAM
            </span>
          </div>
          <div className="w-5 h-5 rounded-none bg-[#9b2c2c] border border-black flex items-center justify-center text-white font-black ml-0.5 shadow-sm">
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
          </div>
        </button>
      </div>
    </div>
  );
};
