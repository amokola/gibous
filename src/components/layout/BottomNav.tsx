import React from 'react';
import { NavTab } from '../../types/game';
import { Gamepad2, Swords, Trophy, User, Wallet } from 'lucide-react';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
}) => {
  const tabs: { id: NavTab; label: string; icon: React.ReactNode }[] = [
    { id: 'home', label: 'Arena', icon: <Gamepad2 className="w-4 h-4" /> },
    { id: 'lobby', label: 'Lobby', icon: <Swords className="w-4 h-4" /> },
    { id: 'leaderboard', label: 'Ranks', icon: <Trophy className="w-4 h-4" /> },
    { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
    { id: 'wallet', label: 'Vault', icon: <Wallet className="w-4 h-4" /> },
  ];

  return (
    <nav
      aria-label="Main Navigation"
      className="w-full bg-[#f2efe9] border-t-2 border-black px-1.5 py-1.5 flex items-center justify-around select-none z-30 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`min-w-[48px] min-h-[48px] flex flex-col items-center justify-center py-1 px-2 transition-all duration-150 active:scale-95 cursor-pointer ${
              isActive
                ? 'text-[#1a1a1a]'
                : 'text-[#1a1a1a]/50 hover:text-[#1a1a1a]'
            }`}
          >
            {/* Icon with active 4real sketch background */}
            <div
              className={`p-1.5 rounded-none border-2 transition-all ${
                isActive
                  ? 'bg-[#9b2c2c] text-white border-black sketch-shadow-xs scale-105'
                  : 'border-transparent text-[#1a1a1a]'
              }`}
            >
              {tab.icon}
            </div>

            {/* Label in Cabin Sketch */}
            <span
              className={`font-sketch text-[11px] sm:text-xs tracking-wider mt-0.5 ${
                isActive ? 'text-[#9b2c2c] font-bold' : 'text-[#1a1a1a]/60 font-semibold'
              }`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
