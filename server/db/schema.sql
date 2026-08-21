-- ==============================================================================
-- 4real | Earn with GRAM - PostgreSQL Production Database Schema
-- Optimized for High-Throughput Telegram PVP Gaming
-- ==============================================================================

-- 1. Users & Accounts Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(64),
    first_name VARCHAR(128) NOT NULL,
    last_name VARCHAR(128),
    photo_url TEXT,
    balance_gram BIGINT NOT NULL DEFAULT 1000,
    total_winnings BIGINT NOT NULL DEFAULT 0,
    total_volume BIGINT NOT NULL DEFAULT 0,
    total_matches INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    current_streak INTEGER NOT NULL DEFAULT 0,
    best_streak INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    favorite_game VARCHAR(32) DEFAULT 'snake',
    wallet_address VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for Telegram ID lookups and Leaderboards
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_winnings ON users (total_winnings DESC);
CREATE INDEX IF NOT EXISTS idx_users_wins ON users (wins DESC);

-- 2. Matches & Duels Table
CREATE TABLE IF NOT EXISTS matches (
    id SERIAL PRIMARY KEY,
    code VARCHAR(16) UNIQUE NOT NULL,
    game_type VARCHAR(32) NOT NULL, -- 'snake', 'connect4', 'rps'
    stake_amount BIGINT NOT NULL,   -- Initial stake per player (e.g. 50, 100, 250, 500, 1000)
    pot_amount BIGINT NOT NULL,     -- Total pot (stake * 2)
    dev_rake BIGINT NOT NULL DEFAULT 0, -- 10% of total pot on win, or 5% admin fee per player on draw
    p1_id INTEGER REFERENCES users(id),
    p2_id INTEGER REFERENCES users(id),
    winner_id INTEGER REFERENCES users(id), -- NULL if draw
    is_draw BOOLEAN NOT NULL DEFAULT FALSE,
    turns_count INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'waiting', -- 'waiting', 'playing', 'finished', 'cancelled'
    state_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_matches_code ON matches (code);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches (created_at DESC);

-- 3. Financial Transaction Ledger (Atomic Balance Audit)
CREATE TABLE IF NOT EXISTS transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    match_id INTEGER REFERENCES matches(id),
    type VARCHAR(32) NOT NULL, -- 'deposit', 'withdraw', 'match_stake', 'match_win', 'match_draw_refund', 'daily_bonus'
    amount BIGINT NOT NULL,    -- Positive for credit, negative for debit
    fee BIGINT NOT NULL DEFAULT 0,
    balance_after BIGINT NOT NULL,
    tx_hash VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);

-- 4. Platform Dev Treasury & Protocol Economics
CREATE TABLE IF NOT EXISTS treasury (
    id SERIAL PRIMARY KEY,
    total_rake_collected BIGINT NOT NULL DEFAULT 0,
    win_rake_collected BIGINT NOT NULL DEFAULT 0,
    draw_fees_collected BIGINT NOT NULL DEFAULT 0,
    total_volume_processed BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Initialize Treasury Singleton Row if empty
INSERT INTO treasury (id, total_rake_collected, win_rake_collected, draw_fees_collected, total_volume_processed)
VALUES (1, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;
