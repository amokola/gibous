import React, { useMemo } from 'react';
import { UserProfile } from '../../types/game';
import { StatMetricBox } from './StatMetricBox';
import { BoastCard } from './BoastCard';
import { GameMasteryRow } from './GameMasteryRow';
import { CrownRankIcon } from '../icons/GameIcons';
import {
  Coins,
  Flame,
  Trophy,
  TrendingUp,
  HelpCircle,
  MessageSquare,
  ExternalLink,
  Crown,
  ArrowUpRight,
} from 'lucide-react';
import { useTelegram } from '../../hooks/useTelegram';
import { BRAND } from '../../config/brand';

interface ProfileScreenProps {
  userProfile?: UserProfile;
  onOpenBank?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userProfile,
  onOpenBank,
}) => {
  const { user, tg } = useTelegram();

  // Calculated / fallback profile statistics
  const profile: UserProfile = userProfile || {
    name: user?.first_name || 'You',
    avatarId: '1',
    level: 1,
    xp: 0,
    rank: 'Unranked',
    balance: 0,
    winRate: 0,
    totalMatches: 0,
    winStreak: 0,
    totalWon: 0,
    favoriteGame: 'Not enough data',
  };

  const totalVolume = profile.totalVolume || 0;
  const totalWins = profile.wins || 0;
  const totalLosses = profile.losses || 0;
  const totalDraws = profile.draws || 0;
  const netPnl = profile.totalWon;
  const formattedNetPnl = netPnl > 0 ? `+${netPnl} GRAM` : `${netPnl} GRAM`;
  const netPnlBadge = netPnl > 0 ? 'PROFITABLE' : netPnl < 0 ? 'DEFICIT' : 'BREAK-EVEN';
  const netPnlBadgeColor = netPnl > 0
    ? 'bg-[#dcfce7] text-[#166534]'
    : netPnl < 0
    ? 'bg-[#fee2e2] text-[#991b1b]'
    : 'bg-[#f2efe9] text-neutral-600';

  const nextLevelXp = Math.max(250, profile.level * 250);
  const currentLevelXp = profile.xp % 250;

  const openTelegramCommunity = () => {
    const url = BRAND.links.communityUrl;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  };

  const openTelegramSupport = () => {
    const url = BRAND.links.supportUrl;
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  };

  const snakesRecord = useMemo(() => {
    if (totalWins === 0 && totalLosses === 0) return { wins: 0, losses: 0, pnl: 0 };
    const portion = profile.favoriteGame === 'snake' ? 0.5 : 0.25;
    return {
      wins: Math.round(totalWins * portion),
      losses: Math.round(totalLosses * portion),
      pnl: Math.round(netPnl * portion),
    };
  }, [totalWins, totalLosses, netPnl, profile.favoriteGame]);

  const connect4Record = useMemo(() => {
    if (totalWins === 0 && totalLosses === 0) return { wins: 0, losses: 0, pnl: 0 };
    const portion = profile.favoriteGame === 'connect4' ? 0.5 : 0.25;
    return {
      wins: Math.round(totalWins * portion),
      losses: Math.round(totalLosses * portion),
      pnl: Math.round(netPnl * portion),
    };
  }, [totalWins, totalLosses, netPnl, profile.favoriteGame]);

  const rpsRecord = useMemo(() => {
    if (totalWins === 0 && totalLosses === 0) return { wins: 0, losses: 0, pnl: 0 };
    return {
      wins: Math.max(0, totalWins - snakesRecord.wins - connect4Record.wins),
      losses: Math.max(0, totalLosses - snakesRecord.losses - connect4Record.losses),
      pnl: netPnl - snakesRecord.pnl - connect4Record.pnl,
    };
  }, [totalWins, totalLosses, netPnl, snakesRecord, connect4Record]);

  return (
    <div className="w-full max-w-[420px] mx-auto h-auto flex flex-col gap-3.5 p-3 sm:p-4 select-none animate-fade-in pb-10 bg-[#fbfaf7] text-[#1a1a1a]">
      {/* 1. Top Header Identity Card (Sharp Neo-Brutalist) */}
      <div className="w-full bg-white border-2 border-black p-4 sketch-shadow rounded-none relative">
        <div className="flex items-center gap-3">
          {/* Avatar Box (Sharp square with black border) */}
          <div className="w-14 h-14 bg-[#fff9c4] border-2 border-black flex items-center justify-center relative flex-shrink-0 overflow-hidden">
            {user?.photo_url ? (
              <img
                src={user.photo_url}
                alt={profile.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <CrownRankIcon size={36} />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 bg-[#9b2c2c] text-white font-sketch text-[10px] font-bold px-1 border border-black z-10">
              Lv.{profile.level}
            </span>
          </div>

          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-1.5">
              <h2 className="font-sketch text-2xl font-bold text-[#1a1a1a] truncate leading-none">
                {profile.name}
              </h2>
            </div>
            <span className="font-sketch text-xs text-[#1a1a1a]/60 block mt-0.5">
              {user?.username ? `@${user.username}` : 'Telegram account'}
            </span>

            {/* Rank Tag & Bank Trigger */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 border border-black bg-[#fff9c4] text-[#854d0e] font-sketch text-xs font-bold">
                <Crown className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{profile.rank} Tier</span>
              </div>
              {onOpenBank && (
                <button
                  type="button"
                  onClick={onOpenBank}
                  className="inline-flex items-center gap-1 px-2 py-0.5 border border-black bg-white hover:bg-[#f2efe9] text-[#1a365d] font-sketch text-xs font-bold sketch-shadow-xs active:scale-95 transition-transform cursor-pointer"
                >
                  <span>Vault</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div className="mt-3 pt-2.5 border-t border-black/10">
          <div className="flex justify-between items-center text-[10px] font-sketch font-bold text-[#1a1a1a]/70 mb-1">
            <span>Level Progress</span>
            <span>{currentLevelXp} / {nextLevelXp} XP</span>
          </div>
          <div className="w-full h-2.5 bg-[#f2efe9] border border-black overflow-hidden">
            <div
              className="h-full bg-[#9b2c2c] border-r border-black transition-all duration-500"
              style={{ width: `${Math.min(100, (currentLevelXp / nextLevelXp) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. Career Overview */}
      <div className="flex flex-col gap-1.5">
        <span className="font-sketch text-xs font-bold uppercase tracking-wider text-[#1a1a1a]/60">
          Career Overview
        </span>
        <div className="grid grid-cols-2 gap-2.5">
          <StatMetricBox
            label="Net Winnings"
            value={formattedNetPnl}
            subtext="Updated from match history"
            badge={netPnlBadge}
            badgeColor={netPnlBadgeColor}
            variant={netPnl >= 0 ? 'green' : 'red'}
            isHero={true}
            icon={<TrendingUp className="w-4 h-4 text-[#166534]" />}
          />

          <StatMetricBox
            label="Current Streak"
            value={`${profile.winStreak}X STREAK`}
            subtext={`Best Record: ${profile.bestStreak || 0}X`}
            badge={profile.winStreak >= 5 ? 'ON FIRE' : 'BUILDING'}
            badgeColor="bg-[#fee2e2] text-[#991b1b]"
            variant="yellow"
            isHero={true}
            icon={<Flame className="w-4 h-4 text-[#b91c1c]" />}
          />

          <StatMetricBox
            label="Total Volume"
            value={`${totalVolume} GRAM`}
            subtext={`Across ${profile.totalMatches} matches`}
            variant="paper"
            icon={<Coins className="w-4 h-4 text-[#1a365d]" />}
          />

          <StatMetricBox
            label="Win / Loss Record"
            value={`${profile.winRate}% WR`}
            subtext={`${totalWins}W • ${totalLosses}L • ${totalDraws}D`}
            variant="paper"
            icon={<Trophy className="w-4 h-4 text-[#ca8a04]" />}
          />
        </div>
      </div>

      {/* 3. Game-by-Game Mastery Breakdown */}
      <GameMasteryRow
        snakesRecord={snakesRecord}
        connect4Record={connect4Record}
        rpsRecord={rpsRecord}
      />

      {/* 4. Interactive Telegram Boast Card */}
      <BoastCard
        pnl={netPnl}
        winRate={profile.winRate}
        winStreak={profile.winStreak}
        totalVolume={totalVolume}
        totalWins={totalWins}
      />

      {/* 5. Community & Support Cards */}
      <div className="flex flex-col gap-1.5">
        <span className="font-sketch text-xs font-bold uppercase tracking-wider text-[#1a1a1a]/60">
          Community & Support
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* Telegram Community Card */}
          <div className="bg-white border-2 border-black p-3.5 sketch-shadow-xs flex flex-col justify-between rounded-none">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 bg-[#e0f2fe] border border-black flex items-center justify-center rounded-none">
                  <MessageSquare className="w-4 h-4 text-[#1a365d]" />
                </div>
                <div className="border border-black px-2 py-0.2 bg-[#f2efe9] font-sketch text-[10px] font-bold text-[#1a365d] uppercase">
                  Announcements
                </div>
              </div>

              <h4 className="font-sketch text-base font-bold text-[#1a1a1a] leading-snug">
                Telegram Community
              </h4>
              <p className="font-sketch text-[11px] text-[#1a1a1a]/60 mt-0.5">
                Updates, announcements, and community chatter.
              </p>
            </div>

            <button
              type="button"
              onClick={openTelegramCommunity}
              className="w-full mt-3 py-2 px-3 bg-[#fff9c4] hover:bg-[#fef08a] border-2 border-black font-sketch text-xs font-bold text-[#1a1a1a] flex items-center justify-center gap-1.5 sketch-btn-press sketch-shadow-xs active:scale-95 transition-all rounded-none cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Join Community</span>
            </button>
          </div>

          {/* Telegram Support Card */}
          <div className="bg-white border-2 border-black p-3.5 sketch-shadow-xs flex flex-col justify-between rounded-none">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 bg-[#e0f2fe] border border-black flex items-center justify-center rounded-none">
                  <HelpCircle className="w-4 h-4 text-[#1a365d]" />
                </div>
                <div className="border border-black px-2 py-0.2 bg-[#f2efe9] font-sketch text-[10px] font-bold text-[#1a365d] uppercase">
                  Help Desk
                </div>
              </div>

              <h4 className="font-sketch text-base font-bold text-[#1a1a1a] leading-snug">
                Telegram Support
              </h4>
              <p className="font-sketch text-[11px] text-[#1a1a1a]/60 mt-0.5">
                Get help with your account, deposits, or duels.
              </p>
            </div>

            <button
              type="button"
              onClick={openTelegramSupport}
              className="w-full mt-3 py-2 px-3 bg-[#fff9c4] hover:bg-[#fef08a] border-2 border-black font-sketch text-xs font-bold text-[#1a1a1a] flex items-center justify-center gap-1.5 sketch-btn-press sketch-shadow-xs active:scale-95 transition-all rounded-none cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Contact Support</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
