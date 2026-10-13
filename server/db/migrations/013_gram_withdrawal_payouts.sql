-- Durable mainnet-only native Gram payout quotes and restart-safe work queue.

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS net_amount_nano NUMERIC(39,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS network VARCHAR(16) NOT NULL DEFAULT 'mainnet',
  ADD COLUMN IF NOT EXISTS payout_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quote_id UUID,
  ADD COLUMN IF NOT EXISTS signed_payload_ciphertext BYTEA,
  ADD COLUMN IF NOT EXISTS signed_payload_iv BYTEA,
  ADD COLUMN IF NOT EXISTS signed_payload_tag BYTEA,
  ADD COLUMN IF NOT EXISTS payout_seqno BIGINT,
  ADD COLUMN IF NOT EXISTS payout_valid_until BIGINT,
  ADD COLUMN IF NOT EXISTS payout_message_hash VARCHAR(128),
  ADD COLUMN IF NOT EXISTS payout_lease_owner VARCHAR(128),
  ADD COLUMN IF NOT EXISTS payout_lease_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS payout_fencing_token BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_last_attempt_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS payout_reconciled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS payout_actual_fee_nano NUMERIC(39,0),
  ADD COLUMN IF NOT EXISTS payout_failure_evidence_hash VARCHAR(128);

ALTER TABLE withdrawals
  DROP CONSTRAINT IF EXISTS withdrawals_net_amount_nonnegative,
  ADD CONSTRAINT withdrawals_net_amount_nonnegative CHECK (net_amount_nano >= 0),
  DROP CONSTRAINT IF EXISTS withdrawals_network_mainnet,
  ADD CONSTRAINT withdrawals_network_mainnet CHECK (network = 'mainnet'),
  DROP CONSTRAINT IF EXISTS withdrawals_payout_attempt_count_nonnegative,
  ADD CONSTRAINT withdrawals_payout_attempt_count_nonnegative CHECK (payout_attempt_count >= 0),
  DROP CONSTRAINT IF EXISTS withdrawals_payout_fencing_token_nonnegative,
  ADD CONSTRAINT withdrawals_payout_fencing_token_nonnegative CHECK (payout_fencing_token >= 0);

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

ALTER TABLE withdrawals
  DROP CONSTRAINT IF EXISTS withdrawals_quote_id_fkey,
  ADD CONSTRAINT withdrawals_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES withdrawal_quotes(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_withdrawals_quote_id
  ON withdrawals (quote_id)
  WHERE quote_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_withdrawal_quotes_owner_expiry
  ON withdrawal_quotes (telegram_id, expires_at DESC)
  WHERE status = 'quoted';

CREATE INDEX IF NOT EXISTS idx_withdrawals_payout_queue
  ON withdrawals (created_at ASC)
  WHERE payout_eligible = TRUE AND status IN ('pending', 'processing');

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS withdrawal_id UUID REFERENCES withdrawals(id);

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_type_valid,
  ADD CONSTRAINT transactions_type_valid CHECK (
    type IN ('deposit', 'withdraw', 'withdrawal_refund', 'match_stake', 'match_win', 'match_draw_refund', 'match_cancelled_refund')
  );

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
