/**
 * Gibous Brand Configuration
 * Central source of truth for branding, copy, palette, and links across the Telegram Duel Arena.
 */

export const BRAND = {
  name: 'Gibous',
  category: 'Telegram Duel Arena',
  tagline: 'Fast duels. Real ranks. Play-credit rewards.',
  currency: {
    label: 'Play GRAM',
    shortLabel: 'GRAM',
    symbol: '💎',
  },
  surfaces: {
    vault: 'Gibous Vault',
    balance: 'Play-Credit Balance',
    ranks: 'Gibous Ranks',
    standings: 'Season 1 Global Standings',
    lobby: 'Arena Lobby',
    rooms: 'Duel Rooms',
    createRoom: 'Create Duel',
    passAndPlay: 'Pass & Play Duel',
  },
  economics: {
    arenaFeePercent: 10,
    drawRefundPercent: 95,
    winnerPotPercent: 90,
    rulesSummary: 'Winner receives 90% of the play-credit pot. Gibous keeps a 10% arena fee. Draws refund 95% of each player’s stake.',
  },
  gameCards: {
    snake: {
      title: 'Snakes & Ladders',
      subtitle: 'Classic race to tile 100',
      badge: 'Classic',
    },
    connect4: {
      title: 'Four in a Row',
      subtitle: 'Drop discs. Connect four. Win the pot.',
      badge: 'Tactical',
    },
    rps: {
      title: 'Rock Paper Scissors',
      subtitle: 'Fast best-of-three mind game',
      badge: 'Fast Duel',
    },
  },
  cta: {
    enterArena: 'Enter Arena',
    quickJoin: 'Quick Join Arena',
    createDuel: 'Create Duel',
    joinRoom: 'Join Room',
    challengeFriend: 'Challenge Friend',
    openVault: 'Open Vault',
    viewRanks: 'View Ranks',
    requestRematch: 'Request Rematch',
    playRematch: 'Play Rematch',
    backToHub: 'Back to Hub',
  },
  links: {
    botUsername: 'gibous_bot',
    botAppUrl: 'https://t.me/gibous_bot/app',
    communityUrl: 'https://t.me/gibous_community',
    supportUrl: 'https://t.me/gibous_support',
  },
  palette: {
    inkBlack: '#141414',
    paperWhite: '#FBFAF7',
    warmPaper: '#F2EFE9',
    lunarBlue: '#1F3A5F',
    duelRed: '#9B2C2C',
    rankGold: '#F6C945',
    winGreen: '#1E7A3A',
  },
  launchBlurb:
    'Gibous is a Telegram duel arena for quick competitive games. Create a room, challenge a friend, stake play GRAM, and climb the ranks through fair server-run matches.',
} as const;

export function formatShareInvite(roomCode: string, stake: number): { text: string; url: string } {
  const pot = stake * 2;
  const text = `⚔️ Challenge me in Gibous Duel Arena!\n🎲 Room Code: ${roomCode}\n💎 Pot: ${pot} Play GRAM (10% Arena Fee • 95% Draw Refund)\n\nTap below to play now!`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(`${BRAND.links.botAppUrl}?startapp=${roomCode}`)}&text=${encodeURIComponent(text)}`;
  return { text, url };
}

export function formatBoastReceipt(params: {
  name: string;
  username?: string;
  pnl: number;
  winStreak: number;
  winRate: number;
  totalVolume: number;
  totalWins: number;
}): { text: string; url: string } {
  const pnlSign = params.pnl >= 0 ? `+${params.pnl}` : `${params.pnl}`;
  const bragText = `🌙 GIBOUS DUEL ARENA STATS\n\n👤 Player: ${params.name} (@${params.username || 'ton_master'})\n💰 PnL: ${pnlSign} Play GRAM\n🔥 Win Streak: ${params.winStreak}X\n🏆 Win Rate: ${params.winRate}%\n💎 Volume: ${params.totalVolume} Play GRAM (${params.totalWins} Wins)\n\nCan you beat my record? Challenge me now in Gibous! 👇`;
  const url = `https://t.me/share/url?url=${encodeURIComponent(BRAND.links.botAppUrl)}&text=${encodeURIComponent(bragText)}`;
  return { text: bragText, url };
}
