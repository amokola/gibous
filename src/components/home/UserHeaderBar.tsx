import React from 'react';
import { Avatar } from '../ui/Avatar';
import { GramIcon } from '../ui/GramIcon';
import { Plus } from 'lucide-react';

interface UserHeaderBarProps {
  name: string;
  avatarUrl?: string;
  balance: number;
  level?: number;
  rank?: string;
  onOpenProfile: () => void;
  onOpenWallet: () => void;
}

export const UserHeaderBar: React.FC<UserHeaderBarProps> = ({
  name,
  avatarUrl,
  balance,
  level = 5,
  rank = 'Diamond',
  onOpenProfile,
  onOpenWallet,
}) => {
  return (
    <header className="w-full flex items-center justify-between gap-2 py-1 select-none">
      {/* Left User Profile (Clickable to open profile career stats) */}
      <div
        onClick={onOpenProfile}
        className="min-w-0 flex flex-1 items-center gap-2 cursor-pointer hover:opacity-90 active:scale-95 transition-all group"
      >
        <div className="relative">
          <Avatar
            photoUrl={avatarUrl}
            name={name}
            color="green"
            size="md"
            showCheck={false}
            isActive={true}
          />
        </div>

        <div className="min-w-0 flex flex-col">
          <div className="flex items-center gap-1">
            <span className="font-sketch text-base sm:text-lg font-bold text-[#1a1a1a] tracking-wide leading-none truncate group-hover:text-[#9b2c2c] transition-colors">
              {name || 'Player'}
            </span>
            <span role="img" aria-label="Online" className="w-1.5 h-1.5 shrink-0 rounded-full bg-[#166534]" />
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-sketch text-xs bg-[#fff9c4] text-[#1a1a1a] border border-black px-2 py-0.2 rounded-none font-bold sketch-shadow-xs -rotate-1">
              Lv.{level}
            </span>
            <span className="text-[10px] truncate text-[#1a1a1a]/70 font-bold uppercase tracking-wider font-sketch">
              {rank}
            </span>
          </div>
        </div>
      </div>

      {/* Right Controls: GRAM Balance Button */}
      <div className="shrink-0 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenWallet}
          title="Open wallet"
          className="max-w-[145px] flex items-center gap-1.5 bg-white hover:bg-[#fbfaf7] border-2 border-black rounded-none px-2 py-1.5 sketch-shadow-xs transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none group"
        >
          <GramIcon size="sm" />
          <div className="min-w-0 flex flex-col items-start leading-none">
            <span className="text-[9px] font-bold text-[#1a1a1a]/70 uppercase tracking-wider font-sketch">
              Vault
            </span>
            <span className="max-w-[88px] truncate font-sketch text-sm sm:text-base font-bold text-[#1a365d] group-hover:text-[#9b2c2c] transition-colors">
              {balance.toLocaleString()} GRAM
            </span>
          </div>
          <div className="w-5 h-5 rounded-none bg-[#9b2c2c] border border-black flex items-center justify-center text-white font-black ml-0.5 shadow-sm">
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
          </div>
        </button>
      </div>
    </header>
  );
};
