import { DatabasePool } from './db/index';
import { EconomyEngine } from './economy';

export interface UserEntity {
  id: number;
  telegram_id: number;
  username: string;
  first_name: string;
  last_name?: string;
  photo_url?: string;
  balance_gram: number;
  total_winnings: number;
  total_volume: number;
  total_matches: number;
  wins: number;
  losses: number;
  draws: number;
  current_streak: number;
  best_streak: number;
  level: number;
  xp: number;
  favorite_game: string;
}

export class StorageService {
  private db: DatabasePool;

  constructor() {
    this.db = DatabasePool.getInstance();
  }

  /**
   * Get or create a user by their Telegram ID
   */
  async getOrCreateUser(telegramUser: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  }): Promise<UserEntity> {
    let user = this.db.getUserByTelegramId(telegramUser.id);
    if (!user) {
      user = {
        id: Date.now(),
        telegram_id: telegramUser.id,
        username: telegramUser.username || `player_${telegramUser.id}`,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name || '',
        photo_url: telegramUser.photo_url || '',
        balance_gram: 2450, // Initial welcome bonus
        total_winnings: 0,
        total_volume: 0,
        total_matches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        current_streak: 0,
        best_streak: 0,
        level: 1,
        xp: 0,
        favorite_game: 'snake',
      };
      this.db.saveUser(user);
    }
    return user;
  }

  /**
   * Finalize a Win/Loss Match and apply 10% Dev Rake
   */
  async finalizeWinMatch(
    matchCode: string,
    gameType: string,
    stake: number,
    winnerTgId: number,
    loserTgId: number
  ) {
    const calc = EconomyEngine.calculateWinPayout(stake);
    const winner = this.db.getUserByTelegramId(winnerTgId);
    const loser = this.db.getUserByTelegramId(loserTgId);

    if (winner) {
      winner.balance_gram += calc.winnerPayout;
      winner.total_winnings += calc.winnerPayout - stake;
      winner.total_volume += stake;
      winner.total_matches += 1;
      winner.wins += 1;
      winner.current_streak += 1;
      if (winner.current_streak > winner.best_streak) {
        winner.best_streak = winner.current_streak;
      }
      winner.xp += EconomyEngine.calculateXP(true, false);
      winner.level = Math.floor(winner.xp / 250) + 1;
      this.db.saveUser(winner);

      this.db.recordTransaction({
        user_id: winner.id,
        match_id: matchCode,
        type: 'match_win',
        amount: calc.winnerPayout,
        fee: calc.devRake,
        balance_after: winner.balance_gram,
      });
    }

    if (loser) {
      loser.total_volume += stake;
      loser.total_matches += 1;
      loser.losses += 1;
      loser.current_streak = 0;
      loser.xp += EconomyEngine.calculateXP(false, false);
      loser.level = Math.floor(loser.xp / 250) + 1;
      this.db.saveUser(loser);
    }

    // Record Platform Treasury Arena Fee (10% of total pot)
    this.db.addTreasuryRake(calc.arenaFee, false, calc.totalPot);

    return calc;
  }

  /**
   * Finalize a Draw Match and refund 95% to both players (5% admin fee per player to Dev)
   */
  async finalizeDrawMatch(
    matchCode: string,
    gameType: string,
    stake: number,
    p1TgId: number,
    p2TgId: number
  ) {
    const calc = EconomyEngine.calculateDrawRefund(stake);
    const p1 = this.db.getUserByTelegramId(p1TgId);
    const p2 = this.db.getUserByTelegramId(p2TgId);

    if (p1) {
      p1.balance_gram += calc.p1Refund;
      p1.total_volume += stake;
      p1.total_matches += 1;
      p1.draws += 1;
      p1.xp += EconomyEngine.calculateXP(false, true);
      this.db.saveUser(p1);

      this.db.recordTransaction({
        user_id: p1.id,
        match_id: matchCode,
        type: 'match_draw_refund',
        amount: calc.p1Refund,
        fee: stake - calc.p1Refund,
        balance_after: p1.balance_gram,
      });
    }

    if (p2) {
      p2.balance_gram += calc.p2Refund;
      p2.total_volume += stake;
      p2.total_matches += 1;
      p2.draws += 1;
      p2.xp += EconomyEngine.calculateXP(false, true);
      this.db.saveUser(p2);

      this.db.recordTransaction({
        user_id: p2.id,
        match_id: matchCode,
        type: 'match_draw_refund',
        amount: calc.p2Refund,
        fee: stake - calc.p2Refund,
        balance_after: p2.balance_gram,
      });
    }

    // Record Platform Treasury Admin Arena Fee
    this.db.addTreasuryRake(calc.arenaFee, true, calc.totalPot);

    return calc;
  }
}
