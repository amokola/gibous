-- Migration 005: Leaderboard Index and Cancellation Optimization

CREATE INDEX IF NOT EXISTS idx_users_leaderboard ON users (wins DESC, total_winnings DESC, telegram_id ASC);
