-- Migration 003: Hardened Production Schema, Invariants, Triggers, and Partial Indexes

-- 1. Trigger function for auto-updating timestamps
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_matches_updated_at ON matches;
CREATE TRIGGER trg_matches_updated_at
BEFORE UPDATE ON matches
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_deposit_intents_updated_at ON deposit_intents;
CREATE TRIGGER trg_deposit_intents_updated_at
BEFORE UPDATE ON deposit_intents
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_treasury_updated_at ON treasury;
CREATE TRIGGER trg_treasury_updated_at
BEFORE UPDATE ON treasury
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 2. Matches strict integrity and pot invariants
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_pot_covers_stake;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_pot_exact;
ALTER TABLE matches ADD CONSTRAINT matches_pot_exact CHECK (pot_amount = stake_amount * 2);

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_distinct_players;
ALTER TABLE matches ADD CONSTRAINT matches_distinct_players CHECK (p1_id IS NULL OR p2_id IS NULL OR p1_id <> p2_id);

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_winner_valid;
ALTER TABLE matches ADD CONSTRAINT matches_winner_valid CHECK (winner_id IS NULL OR winner_id = p1_id OR winner_id = p2_id);

ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_draw_consistency;
ALTER TABLE matches ADD CONSTRAINT matches_draw_consistency CHECK (NOT is_draw OR winner_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_matches_waiting ON matches (created_at ASC) WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_matches_active ON matches (updated_at DESC) WHERE status IN ('waiting', 'playing');

-- 3. Transactions ledger invariants & composite index
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_valid;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_valid
  CHECK (type IN ('deposit', 'withdraw', 'match_stake', 'match_win', 'match_draw_refund', 'match_cancelled_refund'));

CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions (user_id, created_at DESC);

-- 4. Treasury singleton & nano columns
ALTER TABLE treasury ADD COLUMN IF NOT EXISTS total_rake_nano NUMERIC(39,0) DEFAULT 0;
ALTER TABLE treasury ADD COLUMN IF NOT EXISTS win_rake_nano NUMERIC(39,0) DEFAULT 0;
ALTER TABLE treasury ADD COLUMN IF NOT EXISTS draw_fees_nano NUMERIC(39,0) DEFAULT 0;
ALTER TABLE treasury ADD COLUMN IF NOT EXISTS total_volume_nano NUMERIC(39,0) DEFAULT 0;

UPDATE treasury SET
  total_rake_nano = ROUND(COALESCE(total_rake_collected, 0) * 1000000000),
  win_rake_nano = ROUND(COALESCE(win_rake_collected, 0) * 1000000000),
  draw_fees_nano = ROUND(COALESCE(draw_fees_collected, 0) * 1000000000),
  total_volume_nano = ROUND(COALESCE(total_volume_processed, 0) * 1000000000)
WHERE total_volume_nano = 0 AND COALESCE(total_volume_processed, 0) > 0;

ALTER TABLE treasury DROP CONSTRAINT IF EXISTS treasury_singleton;
ALTER TABLE treasury ADD CONSTRAINT treasury_singleton CHECK (id = 1);
