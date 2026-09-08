-- Migration 004: Match State Transition Guards and Append-Only Treasury Ledger

-- 1. Match State Machine Transition Guard Trigger
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

-- 2. Append-Only Treasury Ledger
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
