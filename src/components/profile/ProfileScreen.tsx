import React from 'react';
import { UserProfile } from '../../types/game';
import { StatMetricBox } from './StatMetricBox';
import { BoastCard } from './BoastCard';
import { GameMasteryRow } from './GameMasteryRow';
import { CrownRankIcon } from '../icons/GameIcons';
import { Coins, Flame, Trophy, TrendingUp, HelpCircle, MessageSquare, ExternalLink, ShieldCheck } from 'lucide-react';
import { useTelegram } from '../../hooks/useTelegram';

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
    level: 14,
    xp: 3450,
    rank: 'Grandmaster',
    balance: 2450,
    winRate: 72,
    totalMatches: 68,
    winStreak: 7,
    totalWon: 1420,
    favoriteGame: 'Snake & Ladder',
  };

  const totalVolume = 12850;
  const totalWins = 49;
  const totalLosses = 15;
  const totalDraws = 4;
  const netPnl = 1420;

  const openTelegramCommunity = () => {
    const url = 'https://t.me/gibous_community';
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  };

  const openTelegramSupport = () => {
    const url = 'https://t.me/gibous_support';
    if (tg?.openTelegramLink) tg.openTelegramLink(url);
    else window.open(url, '_blank');
  };

  return (
    <div className="w-full max-w-[420px] mx-auto h-auto flex flex-col gap-3.5 p-3 sm:p-4 select-none animate-fade-in pb-10 bg-[#fbfaf7] text-[#1a1a1a]">
      {/* Top Header Identity Card (Sharp Neo-Brutalist) */}
      <div className="w-full bg-white border-2 border-black p-4 sketch-shadow rounded-none relative">
        <div className="flex items-center gap-3">
          {/* Avatar Box (Sharp square with black border) */}
          <div className="w-14 h-14 bg-[#fff9c4] border-2 border-black flex items-center justify-center relative flex-shrink-0">
            <CrownRankIcon size={36} />
            <span className="absolute -bottom-1 -right-1 bg-[#9b2c2c] text-white font-sketch text-[10px] font-bold px-1 border border-black">
              Lv.{profile.level}
            </span>
          </div>

          <div className="flex-1 overflow-hidden">
            <div className="flex items-center gap-1.5">
              <h2 className="font-sketch text-2xl font-bold text-[#1a1a1a] truncate leading-none">
                {profile.name}
              </h2>
              <ShieldCheck className="w-4 h-4 text-[#166534] flex-shrink-0" />
            </div>
            <span className="font-sketch text-xs text-[#1a1a1a]/60 block mt-0.5">
              @{user?.username || 'ton_master'} • Joined Aug 2026
            </span>

            {/* Rank Tag & Bank Trigger */}
            <div className="flex items-center gap-2 mt-1.5">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 border border-black bg-[#fff9c4] text-[#854d0e] font-sketch text-xs font-bold">
                <span>👑 {profile.rank} Tier</span>
              </div>
              {onOpenBank && (
                <button
                  type="button"
                  onClick={onOpenBank}
                  className="px-2 py-0.5 border border-black bg-white hover:bg-[#f2efe9] text-[#1a365d] font-sketch text-xs font-bold sketch-shadow-xs active:scale-95"
                >
                  Gibous Vault ➔
                </button>
              )}
            </div>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div className="mt-3 pt-2.5 border-t border-black/10">
          <div className="flex justify-between items-center text-[10px] font-sketch font-bold text-[#1a1a1a]/70 mb-1">
            <span>XP PROGRESSION</span>
            <span>{profile.xp} / 5,000 XP</span>
          </div>
          <div className="w-full h-2.5 bg-[#f2efe9] border border-black overflow-hidden">
            <div
              className="h-full bg-[#9b2c2c] border-r border-black transition-all duration-500"
              style={{ width: `${(profile.xp / 5000) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Hero Boastable Metric Grid (PnL, Volume, Win Streak, Record) */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatMetricBox
          label="Net PnL (Profit)"
          value={`+${netPnl} GRAM`}
          subtext="+78.4% Win ROI"
          badge="PROFITABLE"
          badgeColor="bg-[#dcfce7] text-[#166534]"
          variant="green"
          isHero={true}
          icon={<TrendingUp className="w-4 h-4 text-[#166534]" />}
        />

        <StatMetricBox
          label="Current Streak"
          value={`${profile.winStreak}X STREAK`}
          subtext="Best Record: 12X"
          badge="🔥 ON FIRE"
          badgeColor="bg-[#fee2e2] text-[#991b1b]"
          variant="yellow"
          isHero={true}
          icon={<Flame className="w-4 h-4 text-[#b91c1c]" />}
        />

        <StatMetricBox
          label="Total Volume"
          value={`${totalVolume} GRAM`}
          subtext="Across 68 matches"
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

      {/* Interactive Telegram Boast Card */}
      <BoastCard
        name={profile.name}
        username={user?.username}
        pnl={netPnl}
        winRate={profile.winRate}
        winStreak={profile.winStreak}
        totalVolume={totalVolume}
        totalWins={totalWins}
      />

      {/* Game-by-Game Mastery Breakdown */}
      <GameMasteryRow
        snakesRecord={{ wins: 22, losses: 6, pnl: 680 }}
        connect4Record={{ wins: 18, losses: 5, pnl: 540 }}
        rpsRecord={{ wins: 9, losses: 4, pnl: 200 }}
      />

      {/* Achievement Trophy Cabinet (Sharp Badges) */}
      <div className="w-full bg-white border-2 border-black p-3.5 sketch-shadow-xs rounded-none select-none">
        <div className="flex items-center justify-between mb-2">
          <span className="font-sketch text-xs font-bold uppercase tracking-wider text-[#1a1a1a]/60">
            Trophy Cabinet & Badges
          </span>
          <span className="font-sketch text-xs text-[#9b2c2c] font-bold">4 / 6 Unlocked</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 border border-black bg-[#dcfce7] flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <div className="font-sketch text-xs font-bold text-[#166534]">Streak King</div>
              <div className="text-[9px] font-sketch text-[#1a1a1a]/60">Won 5+ duels in a row</div>
            </div>
          </div>

          <div className="p-2 border border-black bg-[#fff9c4] flex items-center gap-2">
            <span className="text-xl">💎</span>
            <div>
              <div className="font-sketch text-xs font-bold text-[#854d0e]">1K Club</div>
              <div className="text-[9px] font-sketch text-[#1a1a1a]/60">Earned 1,000+ GRAM</div>
            </div>
          </div>

          <div className="p-2 border border-black bg-[#e0f2fe] flex items-center gap-2">
            <span className="text-xl">🎲</span>
            <div>
              <div className="font-sketch text-xs font-bold text-[#1a365d]">High Roller</div>
              <div className="text-[9px] font-sketch text-[#1a1a1a]/60">Played 500 GRAM pot</div>
            </div>
          </div>

          <div className="p-2 border border-black bg-[#fee2e2] flex items-center gap-2">
            <span className="text-xl">👑</span>
            <div>
              <div className="font-sketch text-xs font-bold text-[#991b1b]">Grandmaster</div>
              <div className="text-[9px] font-sketch text-[#1a1a1a]/60">Top 50 global leaderboard</div>
            </div>
          </div>
        </div>
      </div>

      {/* Community & Support Cards (Matching User Reference Image 2) */}
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
              Follow product updates, game announcements, leaderboard chatter, and community discussion.
            </p>
          </div>

          <button
            type="button"
            onClick={openTelegramCommunity}
            className="w-full mt-3 py-2 px-3 bg-[#fff9c4] hover:bg-[#fef08a] border-2 border-black font-sketch text-xs font-bold text-[#1a1a1a] flex items-center justify-center gap-1.5 sketch-btn-press sketch-shadow-xs active:scale-95 transition-all rounded-none"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Telegram Community</span>
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
              Use support for account questions, payment issues, withdrawal help, and issue reporting.
            </p>
          </div>

          <button
            type="button"
            onClick={openTelegramSupport}
            className="w-full mt-3 py-2 px-3 bg-[#fff9c4] hover:bg-[#fef08a] border-2 border-black font-sketch text-xs font-bold text-[#1a1a1a] flex items-center justify-center gap-1.5 sketch-btn-press sketch-shadow-xs active:scale-95 transition-all rounded-none"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Telegram Support</span>
          </button>
        </div>
      </div>
    </div>
  );
};
