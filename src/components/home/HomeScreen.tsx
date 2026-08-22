import React, { useState } from 'react';
import { GameTitle, NavTab, UserProfile } from '../../types/game';
import { UserHeaderBar } from './UserHeaderBar';
import { LiveTicker } from './LiveTicker';
import { HeroBanner } from './HeroBanner';
import { GameCard } from './GameCard';
import { BottomNav } from '../layout/BottomNav';
import { LeaderboardScreen } from '../leaderboard/LeaderboardScreen';
import { BankScreen } from '../bank/BankScreen';
import { ProfileScreen } from '../profile/ProfileScreen';
import { SnakeIcon, Connect4Icon, ScissorsIcon } from '../icons/GameIcons';

interface HomeScreenProps {
  userName: string;
  avatarUrl?: string;
  balance: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onSelectAndPlayGame: (game: GameTitle) => void;
  onUpdateBalance: (newBalance: number) => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userName,
  avatarUrl,
  balance,
  isMuted,
  onToggleMute,
  onSelectAndPlayGame,
  onUpdateBalance,
}) => {
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  const [userProfile, setUserProfile] = useState<UserProfile>({
    name: userName || 'Player',
    avatarUrl,
    avatarId: 'viper',
    level: 14,
    xp: 3450,
    rank: 'Grandmaster',
    balance,
    winRate: 72,
    totalMatches: 68,
    winStreak: 7,
    totalWon: 1420,
    favoriteGame: 'Snake & Ladder',
  });

  const handleTabSelect = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab === 'lobby') {
      onSelectAndPlayGame('snake');
    }
  };

  const handleDeposit = (amount: number) => {
    const nextBal = balance + amount;
    onUpdateBalance(nextBal);
    setUserProfile(prev => ({ ...prev, balance: nextBal }));
  };

  return (
    <div className="w-full max-w-[420px] mx-auto min-h-screen flex flex-col justify-between select-none animate-fade-in bg-[#fbfaf7]">
      {/* Tab 1: Games Home View */}
      {activeTab === 'home' && (
        <main className="flex-1 overflow-y-auto px-4 py-3 pb-6 scrollbar-none">
          {/* User Profile & Wallet Bar with Sound Toggle */}
          <UserHeaderBar
            name={userProfile.name}
            avatarUrl={userProfile.avatarUrl}
            balance={balance}
            level={userProfile.level}
            rank={userProfile.rank}
            isMuted={isMuted}
            onToggleMute={onToggleMute}
            onOpenProfile={() => setActiveTab('profile')}
            onOpenWallet={() => setActiveTab('wallet')}
          />

          {/* Live Winner Ticker */}
          <LiveTicker />

          {/* Hero Feature Banner (PVP Arena Focus) */}
          <HeroBanner
            onQuickJoin={() => onSelectAndPlayGame('snake')}
          />

          {/* Section Header */}
          <div className="flex items-center justify-between mt-4 mb-2.5 px-1">
            <h2 className="font-sketch text-lg sm:text-xl font-bold text-[#1a1a1a] tracking-wide uppercase flex items-center gap-1.5">
              <span>Duel Arenas</span>
            </h2>
            <span className="font-sketch text-xs font-bold text-[#9b2c2c] bg-[#fee2e2] border border-black px-2 py-0.5 rounded-none sketch-shadow-xs">
              3 Live Arenas
            </span>
          </div>

          {/* Game Cards List */}
          <div className="space-y-3">
            {/* 1. Snake & Ladder */}
            <GameCard
              game="snake"
              title="Snakes & Ladders"
              subtitle="Classic race to tile 100"
              badge="Classic"
              badgeColor="bg-[#dcfce7] text-[#166534]"
              playersCount={1840}
              minStake={50}
              bgClass="bg-white"
              icon={<SnakeIcon size={38} />}
              onPlay={onSelectAndPlayGame}
            />

            {/* 2. Four in a Row */}
            <GameCard
              game="connect4"
              title="Four in a Row"
              subtitle="Drop discs. Connect four. Win the pot."
              badge="Tactical"
              badgeColor="bg-[#e0f2fe] text-[#1a365d]"
              playersCount={1420}
              minStake={50}
              bgClass="bg-white"
              icon={<Connect4Icon size={38} />}
              onPlay={onSelectAndPlayGame}
            />

            {/* 3. Rock Paper Scissors */}
            <GameCard
              game="rps"
              title="Rock Paper Scissors"
              subtitle="Fast best-of-three mind game"
              badge="Fast Duel"
              badgeColor="bg-[#fff9c4] text-[#854d0e]"
              playersCount={2150}
              minStake={50}
              bgClass="bg-white"
              icon={<ScissorsIcon size={38} />}
              onPlay={onSelectAndPlayGame}
            />
          </div>
        </main>
      )}

      {/* Tab 2: Full-Page Ranks / Leaderboard View (No Modal) */}
      {activeTab === 'leaderboard' && (
        <main className="flex-1 overflow-y-auto scrollbar-none">
          <LeaderboardScreen />
        </main>
      )}

      {/* Tab 3: Full-Page Boastable Profile View (No Modal) */}
      {activeTab === 'profile' && (
        <main className="flex-1 overflow-y-auto scrollbar-none">
          <ProfileScreen
            userProfile={userProfile}
            onOpenBank={() => setActiveTab('wallet')}
          />
        </main>
      )}

      {/* Tab 4: Full-Page Bank Gaming Vault View (No Modal) */}
      {activeTab === 'wallet' && (
        <main className="flex-1 overflow-y-auto scrollbar-none">
          <BankScreen
            balance={balance}
            onDeposit={handleDeposit}
          />
        </main>
      )}

      {/* Bottom Telegram Mini App Nav Bar (Always Available on All Tabs) */}
      <BottomNav
        activeTab={activeTab}
        onSelectTab={handleTabSelect}
      />
    </div>
  );
};
