import React, { useMemo, useState } from 'react';
import { GameTitle, NavTab, UserProfile } from '../../types/game';
import { UserHeaderBar } from './UserHeaderBar';
import { HeroBanner } from './HeroBanner';
import { GameCard } from './GameCard';
import { BottomNav } from '../layout/BottomNav';
import { LeaderboardScreen } from '../leaderboard/LeaderboardScreen';
import { BankScreen } from '../bank/BankScreen';
import { ProfileScreen } from '../profile/ProfileScreen';
import { SnakeIcon, Connect4Icon, ScissorsIcon } from '../icons/GameIcons';
import { BankTransactionItem } from '../bank/BankScreen';

interface HomeScreenProps {
  userName: string;
  avatarUrl?: string;
  balance: number;
  onSelectAndPlayGame: (game: GameTitle) => void;
  onSubmitDeposit?: (payload: {
    intentId?: string;
    walletAddress: string;
    depositAddress: string;
    amountNano: string;
    boc: string;
    network: 'mainnet' | 'testnet';
  }) => void;
  onSubmitWithdrawal?: (payload: {
    walletAddress: string;
    amountNano: string;
  }) => void;
  initialTransactions?: BankTransactionItem[];
  account?: Record<string, unknown> | null;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  userName,
  avatarUrl,
  balance,
  onSelectAndPlayGame,
  onSubmitDeposit,
  onSubmitWithdrawal,
  initialTransactions,
  account,
}) => {
  const [activeTab, setActiveTab] = useState<NavTab>('home');

  const userProfile = useMemo<UserProfile>(() => {
    const totalMatches = Number(account?.total_matches || 0);
    const wins = Number(account?.wins || 0);
    return {
      name: userName || 'Player',
      avatarUrl,
      avatarId: 'default',
      level: Number(account?.level || 1),
      xp: Number(account?.xp || 0),
      rank: 'Unranked',
      balance,
      winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
      totalMatches,
      winStreak: Number(account?.current_streak || 0),
      totalWon: Number(account?.total_winnings || 0),
      favoriteGame: String(account?.favorite_game || 'Not enough data'),
      totalVolume: Number(account?.total_volume || 0),
      wins,
      losses: Number(account?.losses || 0),
      draws: Number(account?.draws || 0),
      bestStreak: Number(account?.best_streak || 0),
    };
  }, [account, avatarUrl, balance, userName]);

  const handleTabSelect = (tab: NavTab) => {
    setActiveTab(tab);
    if (tab === 'lobby') {
      onSelectAndPlayGame('snake');
    }
  };

  return (
    <div className="w-full max-w-[420px] mx-auto h-full min-h-0 flex flex-col select-none animate-fade-in bg-[#fbfaf7]">
      {/* Tab 1: Games Home View */}
      {activeTab === 'home' && (
        <main className="flex-1 min-h-0 overflow-y-auto px-4 py-3 pb-4 scrollbar-none">
          {/* User Profile & Wallet Bar */}
          <UserHeaderBar
            name={userProfile.name}
            avatarUrl={userProfile.avatarUrl}
            balance={balance}
            level={userProfile.level}
            rank={userProfile.rank}
            onOpenProfile={() => setActiveTab('profile')}
            onOpenWallet={() => setActiveTab('wallet')}
          />

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
              3 Arenas
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
        <main className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          <LeaderboardScreen />
        </main>
      )}

      {/* Tab 3: Full-Page Boastable Profile View (No Modal) */}
      {activeTab === 'profile' && (
        <main className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          <ProfileScreen
            userProfile={userProfile}
            onOpenBank={() => setActiveTab('wallet')}
          />
        </main>
      )}

      {/* Tab 4: Full-Page Bank Gaming Vault View (No Modal) */}
      {activeTab === 'wallet' && (
        <main className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
          <BankScreen
            balance={balance}
            onSubmitDeposit={onSubmitDeposit}
            onSubmitWithdrawal={onSubmitWithdrawal}
            initialTransactions={initialTransactions}
            activeDeposit={(account as any)?.activeDeposit}
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
