export type BragLedgerEntryType =
  | 'match_stake'
  | 'match_win'
  | 'match_draw_refund'
  | 'match_cancelled_refund'
  | 'deposit'
  | 'withdraw'
  | 'daily_bonus'
  | string;

export interface BragLedgerEntry {
  match_code?: string | null;
  type: BragLedgerEntryType;
  amount: number;
  created_at: Date | string;
}

export interface BragUser {
  telegram_id: number;
  first_name: string;
  username?: string | null;
  current_streak: number;
}

export interface BragDaySummary {
  pnl: number;
  volume: number;
  roiPercent: number;
  wins: number;
  losses: number;
  draws: number;
  matches: number;
  winRate: number;
}

export interface DailyBragStats {
  telegramId: number;
  name: string;
  username?: string;
  currentStreak: number;
  today: BragDaySummary;
  history: Array<{ date: string; pnl: number }>;
}

interface MatchLedgerGroup {
  date: string;
  pnl: number;
  volume: number;
  outcome: 'win' | 'loss' | 'draw' | 'cancelled';
}

export function getUtcDateKey(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function roundToTenth(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function shiftUtcDay(value: Date, days: number): Date {
  const shifted = new Date(value);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function isMatchLedgerEntry(entry: BragLedgerEntry): boolean {
  return entry.type === 'match_stake'
    || entry.type === 'match_win'
    || entry.type === 'match_draw_refund'
    || entry.type === 'match_cancelled_refund';
}

export function buildDailyBragStats(user: BragUser, entries: BragLedgerEntry[], now = new Date()): DailyBragStats {
  const today = startOfUtcDay(now);
  const firstDay = shiftUtcDay(today, -6);
  const firstDateKey = getUtcDateKey(firstDay);
  const lastDateKey = getUtcDateKey(today);
  const groups = new Map<string, MatchLedgerGroup>();

  for (const entry of entries) {
    if (!isMatchLedgerEntry(entry) || !entry.match_code || !Number.isFinite(entry.amount)) continue;

    const entryDate = new Date(entry.created_at);
    if (Number.isNaN(entryDate.getTime())) continue;

    const date = getUtcDateKey(entryDate);
    if (date < firstDateKey || date > lastDateKey) continue;

    const existing = groups.get(entry.match_code);
    const group = existing || {
      date,
      pnl: 0,
      volume: 0,
      outcome: 'loss' as const,
    };
    group.date = date < group.date ? date : group.date;
    group.pnl += entry.amount;
    if (entry.type === 'match_stake') group.volume += Math.abs(entry.amount);
    if (entry.type === 'match_win') group.outcome = 'win';
    if (entry.type === 'match_draw_refund') group.outcome = 'draw';
    if (entry.type === 'match_cancelled_refund') group.outcome = 'cancelled';
    groups.set(entry.match_code, group);
  }

  const dailyPnl = new Map<string, number>();
  const todaySummary: BragDaySummary = {
    pnl: 0,
    volume: 0,
    roiPercent: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    matches: 0,
    winRate: 0,
  };

  for (const group of groups.values()) {
    if (group.outcome === 'cancelled') continue;
    dailyPnl.set(group.date, (dailyPnl.get(group.date) || 0) + group.pnl);
    if (group.date !== lastDateKey) continue;

    todaySummary.pnl += group.pnl;
    todaySummary.volume += group.volume;
    todaySummary.matches += 1;
    if (group.outcome === 'win') todaySummary.wins += 1;
    else if (group.outcome === 'draw') todaySummary.draws += 1;
    else todaySummary.losses += 1;
  }

  todaySummary.pnl = roundToTenth(todaySummary.pnl);
  todaySummary.volume = roundToTenth(todaySummary.volume);
  todaySummary.roiPercent = todaySummary.volume > 0
    ? roundToTenth((todaySummary.pnl / todaySummary.volume) * 100)
    : 0;
  todaySummary.winRate = todaySummary.matches > 0
    ? roundToTenth((todaySummary.wins / todaySummary.matches) * 100)
    : 0;

  const history = Array.from({ length: 7 }, (_, index) => {
    const day = shiftUtcDay(firstDay, index);
    const date = getUtcDateKey(day);
    return { date, pnl: roundToTenth(dailyPnl.get(date) || 0) };
  });

  return {
    telegramId: user.telegram_id,
    name: user.first_name,
    username: user.username || undefined,
    currentStreak: user.current_streak,
    today: todaySummary,
    history,
  };
}
