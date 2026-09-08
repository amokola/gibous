-- Migration 004: Withdrawals table, status lifecycle, and partial indexes

CREATE TABLE IF NOT EXISTS withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
    wallet_address VARCHAR(128) NOT NULL,
    amount_nano NUMERIC(39,0) NOT NULL,
    amount_gram NUMERIC(30,9) NOT NULL,
    fee_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'completed',
    tx_hash VARCHAR(128),
    operation_key VARCHAR(160) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT withdrawals_amount_nano_positive CHECK (amount_nano > 0),
    CONSTRAINT withdrawals_status_valid CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created ON withdrawals (telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals (status, created_at);

DROP TRIGGER IF EXISTS trg_withdrawals_updated_at ON withdrawals;
CREATE TRIGGER trg_withdrawals_updated_at
BEFORE UPDATE ON withdrawals
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
