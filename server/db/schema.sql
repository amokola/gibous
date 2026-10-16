-- ==============================================================================
-- Gibous | Real-Time Telegram Duel Arena - PostgreSQL Production Database Schema
-- Optimized for High-Throughput Telegram PVP Gaming
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION nano_to_gram(amount_nano NUMERIC)
RETURNS NUMERIC
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT div(amount_nano, 1000000000::numeric)
       + mod(amount_nano, 1000000000::numeric) / 1000000000::numeric;
$$;

-- 0. Universal Auto-Updating Timestamp Trigger Function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

-- 1. Users & Accounts Table (Authoritative Nano-Units with Generated Decimal Display)
CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    username VARCHAR(64),
    first_name VARCHAR(128) NOT NULL,
    last_name VARCHAR(128),
    photo_url TEXT,
    balance_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
    balance_gram NUMERIC(30,9) NOT NULL DEFAULT 0,
    total_winnings NUMERIC(30,9) NOT NULL DEFAULT 0,
    total_volume NUMERIC(30,9) NOT NULL DEFAULT 0,
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
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_balance_nano_check CHECK (balance_nano >= 0),
    CONSTRAINT users_balance_gram_check CHECK (balance_gram >= 0),
    CONSTRAINT users_balance_units_consistent CHECK (balance_nano = ROUND(balance_gram * 1000000000))
);

-- Indexes for Leaderboards (telegram_id already has a unique index from UNIQUE constraint)
CREATE INDEX IF NOT EXISTS idx_users_winnings ON users (total_winnings DESC);
CREATE INDEX IF NOT EXISTS idx_users_wins ON users (wins DESC);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 2. Matches & Duels Table (Strict Pot Invariant & Player Distinctness)
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(16) UNIQUE NOT NULL,
    game_type VARCHAR(32) NOT NULL,
    stake_amount NUMERIC(30,9) NOT NULL,
    pot_amount NUMERIC(30,9) NOT NULL,
    dev_rake NUMERIC(30,9) NOT NULL DEFAULT 0, -- 10% arena fee on win pot, 5% fee per player on draw
    p1_id BIGINT REFERENCES users(id),
    p2_id BIGINT REFERENCES users(id),
    p1_telegram_id BIGINT,
    p2_telegram_id BIGINT,
    version INTEGER NOT NULL DEFAULT 1,
    winner_id BIGINT REFERENCES users(id), -- NULL if draw
    is_draw BOOLEAN NOT NULL DEFAULT FALSE,
    turns_count INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'waiting',
    state_payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT matches_game_type_valid CHECK (game_type IN ('snake', 'connect4', 'rps')),
    CONSTRAINT matches_stake_positive CHECK (stake_amount > 0),
    CONSTRAINT matches_pot_exact CHECK (pot_amount = stake_amount * 2),
    CONSTRAINT matches_distinct_players CHECK (p1_id IS NULL OR p2_id IS NULL OR p1_id <> p2_id),
    CONSTRAINT matches_winner_valid CHECK (winner_id IS NULL OR winner_id = p1_id OR winner_id = p2_id),
    CONSTRAINT matches_draw_consistency CHECK (NOT is_draw OR winner_id IS NULL),
    CONSTRAINT matches_status_valid CHECK (status IN ('waiting', 'playing', 'gameover', 'finished', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_matches_code ON matches (code);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches (status);
CREATE INDEX IF NOT EXISTS idx_matches_created_at ON matches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_waiting ON matches (created_at ASC) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_matches_active ON matches (updated_at DESC) WHERE status IN ('waiting', 'playing');

-- Match state machine guard trigger
CREATE OR REPLACE FUNCTION check_match_state_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.status = 'finished' AND NEW.status <> 'finished' THEN
        RAISE EXCEPTION 'Illegal match transition: finished matches cannot change status';
    END IF;
    IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
        RAISE EXCEPTION 'Illegal match transition: cancelled matches cannot change status';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_state_guard ON matches;
CREATE TRIGGER trg_matches_state_guard
BEFORE UPDATE ON matches
FOR EACH ROW
EXECUTE FUNCTION check_match_state_transition();

DROP TRIGGER IF EXISTS trg_matches_updated_at ON matches;
CREATE TRIGGER trg_matches_updated_at
BEFORE UPDATE ON matches
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 3. Financial Transaction Ledger (Immutable Single-Representation Audit)
CREATE TABLE IF NOT EXISTS transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    match_code VARCHAR(32),
    operation_key VARCHAR(160),
    type VARCHAR(32) NOT NULL,
    amount_nano NUMERIC(39,0) NOT NULL,
    fee_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
    balance_after_nano NUMERIC(39,0) NOT NULL,
    amount NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(amount_nano)) STORED,
    fee NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(fee_nano)) STORED,
    balance_after NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(balance_after_nano)) STORED,
    tx_hash VARCHAR(128),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT transactions_type_valid CHECK (type IN ('deposit', 'withdraw', 'withdrawal_refund', 'match_stake', 'match_win', 'match_draw_refund', 'match_cancelled_refund'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_operation_key ON transactions (operation_key) WHERE operation_key IS NOT NULL;

-- 4. Pending on-chain deposit intents. A wallet signature is not a credit.
CREATE TABLE IF NOT EXISTS deposit_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
    wallet_address VARCHAR(128) NOT NULL,
    deposit_address VARCHAR(128) NOT NULL,
    amount_nano NUMERIC(30,0) NOT NULL,
    amount_gram NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(amount_nano)) STORED,
    memo VARCHAR(64) UNIQUE,
    boc TEXT UNIQUE,
    network VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    tx_hash VARCHAR(128),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT deposit_intents_amount_nano_positive CHECK (amount_nano > 0),
    CONSTRAINT deposit_intents_status_valid CHECK (status IN ('pending', 'confirmed', 'failed', 'expired', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_deposit_intents_status ON deposit_intents (status, created_at);
CREATE INDEX IF NOT EXISTS idx_deposit_intents_user_created ON deposit_intents (telegram_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_intents_confirmed_tx_hash
    ON deposit_intents (tx_hash) WHERE tx_hash IS NOT NULL;

DROP TRIGGER IF EXISTS trg_deposit_intents_updated_at ON deposit_intents;
CREATE TRIGGER trg_deposit_intents_updated_at
BEFORE UPDATE ON deposit_intents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 5. Idempotent match settlement records.
CREATE TABLE IF NOT EXISTS settlements (
    match_id VARCHAR(64) PRIMARY KEY,
    kind VARCHAR(32) NOT NULL,
    calculation JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT settlements_kind_valid CHECK (kind IN ('win', 'draw', 'cancel_refund'))
);

-- 6. Append-Only Treasury Ledger (Double-Entry Financial Audit Trail)
CREATE TABLE IF NOT EXISTS treasury_ledger (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    match_code VARCHAR(32),
    operation_key VARCHAR(160) UNIQUE,
    type VARCHAR(32) NOT NULL CHECK (type IN ('win_rake', 'draw_fee', 'manual_adjustment')),
    rake_nano NUMERIC(39,0) NOT NULL,
    volume_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_treasury_ledger_created ON treasury_ledger (created_at DESC);

-- 7. Platform Dev Treasury & Protocol Economics (Strict Singleton Key Table)
CREATE TABLE IF NOT EXISTS treasury (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    total_rake_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
    win_rake_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
    draw_fees_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
    total_volume_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
    total_rake_collected NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(total_rake_nano)) STORED,
    win_rake_collected NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(win_rake_nano)) STORED,
    draw_fees_collected NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(draw_fees_nano)) STORED,
    total_volume_processed NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(total_volume_nano)) STORED,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT treasury_singleton CHECK (id = 1)
);

DROP TRIGGER IF EXISTS trg_treasury_updated_at ON treasury;
CREATE TRIGGER trg_treasury_updated_at
BEFORE UPDATE ON treasury
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 8. Durable Game Actions Idempotency Table
CREATE TABLE IF NOT EXISTS game_actions (
    match_code VARCHAR(32) NOT NULL,
    request_id VARCHAR(64) NOT NULL,
    player_id BIGINT,
    action_type VARCHAR(64) NOT NULL,
    payload JSONB,
    result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (match_code, request_id)
);

CREATE INDEX IF NOT EXISTS idx_game_actions_match ON game_actions (match_code, created_at ASC);



-- Initialize Treasury Singleton Row if empty
INSERT INTO treasury (id, total_rake_nano, win_rake_nano, draw_fees_nano, total_volume_nano)
VALUES (1, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

-- 8. User withdrawals ledger and lifecycle
CREATE TABLE IF NOT EXISTS withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
    wallet_address VARCHAR(128) NOT NULL,
    amount_nano NUMERIC(39,0) NOT NULL,
    amount_gram NUMERIC(30,9) NOT NULL,
    fee_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
    net_amount_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
    network VARCHAR(16) NOT NULL DEFAULT 'mainnet',
    payout_eligible BOOLEAN NOT NULL DEFAULT FALSE,
    quote_id UUID,
    signed_payload_ciphertext BYTEA,
    signed_payload_iv BYTEA,
    signed_payload_tag BYTEA,
    payout_seqno BIGINT,
    payout_valid_until BIGINT,
    payout_message_hash VARCHAR(128),
    payout_lease_owner VARCHAR(128),
    payout_lease_expires_at TIMESTAMP WITH TIME ZONE,
    payout_fencing_token BIGINT NOT NULL DEFAULT 0,
    payout_attempt_count INTEGER NOT NULL DEFAULT 0,
    payout_last_attempt_at TIMESTAMP WITH TIME ZONE,
    payout_reconciled_at TIMESTAMP WITH TIME ZONE,
    payout_actual_fee_nano NUMERIC(39,0),
      payout_failure_evidence_hash VARCHAR(128),
    status VARCHAR(16) NOT NULL DEFAULT 'completed',
    tx_hash VARCHAR(128),
    operation_key VARCHAR(160) UNIQUE,
    memo VARCHAR(64) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT withdrawals_amount_nano_positive CHECK (amount_nano > 0),
    CONSTRAINT withdrawals_net_amount_nonnegative CHECK (net_amount_nano >= 0),
    CONSTRAINT withdrawals_network_mainnet CHECK (network = 'mainnet'),
    CONSTRAINT withdrawals_payout_attempt_count_nonnegative CHECK (payout_attempt_count >= 0),
    CONSTRAINT withdrawals_payout_fencing_token_nonnegative CHECK (payout_fencing_token >= 0),
    CONSTRAINT withdrawals_status_valid CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created ON withdrawals (telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals (status, created_at);

DROP TRIGGER IF EXISTS trg_withdrawals_updated_at ON withdrawals;
CREATE TRIGGER trg_withdrawals_updated_at
BEFORE UPDATE ON withdrawals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- Mainnet-only native Gram withdrawal quotes. Existing withdrawal rows remain ineligible by default.
CREATE TABLE IF NOT EXISTS withdrawal_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
    wallet_address VARCHAR(128) NOT NULL,
    gross_amount_nano NUMERIC(39,0) NOT NULL,
    fee_nano NUMERIC(39,0) NOT NULL,
    net_amount_nano NUMERIC(39,0) NOT NULL,
    network VARCHAR(16) NOT NULL DEFAULT 'mainnet',
    status VARCHAR(16) NOT NULL DEFAULT 'quoted',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    consumed_withdrawal_id UUID UNIQUE REFERENCES withdrawals(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT withdrawal_quotes_amounts_valid CHECK (
      gross_amount_nano > 0 AND fee_nano >= 0 AND net_amount_nano > 0
      AND gross_amount_nano = fee_nano + net_amount_nano
    ),
    CONSTRAINT withdrawal_quotes_network_mainnet CHECK (network = 'mainnet'),
    CONSTRAINT withdrawal_quotes_status_valid CHECK (status IN ('quoted', 'consumed', 'expired')),
    CONSTRAINT withdrawal_quotes_consumed_link_valid CHECK (
      (status = 'consumed') = (consumed_withdrawal_id IS NOT NULL)
    )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'withdrawals_quote_id_fkey'
      AND conrelid = 'withdrawals'::regclass
  ) THEN
    ALTER TABLE withdrawals
      ADD CONSTRAINT withdrawals_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES withdrawal_quotes(id);
  END IF;
END $$;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS withdrawal_id UUID REFERENCES withdrawals(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_quote_id
  ON withdrawals (quote_id)
  WHERE quote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawal_quotes_owner_expiry
  ON withdrawal_quotes (telegram_id, expires_at DESC)
  WHERE status = 'quoted';

CREATE INDEX IF NOT EXISTS idx_withdrawals_payout_queue
  ON withdrawals (created_at ASC)
  WHERE payout_eligible = TRUE AND status IN ('pending', 'processing');

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_withdrawal_refund
  ON transactions (withdrawal_id)
  WHERE type = 'withdrawal_refund' AND withdrawal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawal_quotes_expiry
  ON withdrawal_quotes (expires_at)
  WHERE status = 'quoted';

CREATE TABLE IF NOT EXISTS payout_wallet_locks (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    lease_owner VARCHAR(128),
    lease_expires_at TIMESTAMP WITH TIME ZONE,
    fencing_token BIGINT NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO payout_wallet_locks (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

