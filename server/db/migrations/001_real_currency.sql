-- Run once against an existing production database before enabling real funds.
-- The CREATE TABLE statements in schema.sql do not alter legacy columns.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE users
  ALTER COLUMN balance_gram TYPE NUMERIC(30,9) USING balance_gram::numeric,
  ALTER COLUMN total_winnings TYPE NUMERIC(30,9) USING total_winnings::numeric,
  ALTER COLUMN total_volume TYPE NUMERIC(30,9) USING total_volume::numeric;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS match_code VARCHAR(32);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS operation_key VARCHAR(160);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'match_id'
  ) THEN
    UPDATE transactions SET match_code = match_id::text WHERE match_code IS NULL AND match_id IS NOT NULL;
  END IF;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'amount' AND is_generated = 'NEVER'
  ) THEN
    ALTER TABLE transactions
      ALTER COLUMN amount TYPE NUMERIC(30,9) USING amount::numeric,
      ALTER COLUMN fee TYPE NUMERIC(30,9) USING fee::numeric,
      ALTER COLUMN balance_after TYPE NUMERIC(30,9) USING balance_after::numeric;
  END IF;
END $$;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_balance_gram_check;
ALTER TABLE users
  ADD CONSTRAINT users_balance_gram_check CHECK (balance_gram >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_operation_key
  ON transactions (operation_key) WHERE operation_key IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'treasury' AND column_name = 'total_rake_collected' AND is_generated = 'NEVER'
  ) THEN
    ALTER TABLE treasury
      ALTER COLUMN total_rake_collected TYPE NUMERIC(30,9) USING total_rake_collected::numeric,
      ALTER COLUMN win_rake_collected TYPE NUMERIC(30,9) USING win_rake_collected::numeric,
      ALTER COLUMN draw_fees_collected TYPE NUMERIC(30,9) USING draw_fees_collected::numeric,
      ALTER COLUMN total_volume_processed TYPE NUMERIC(30,9) USING total_volume_processed::numeric;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS deposit_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL REFERENCES users(telegram_id),
  wallet_address VARCHAR(128) NOT NULL,
  deposit_address VARCHAR(128) NOT NULL,
  amount_nano NUMERIC(30,0) NOT NULL,
  amount_gram NUMERIC(30,9) NOT NULL,
  boc TEXT NOT NULL UNIQUE,
  network VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  tx_hash VARCHAR(128),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_intents_confirmed_tx_hash
  ON deposit_intents (tx_hash) WHERE tx_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS settlements (
  match_id VARCHAR(64) PRIMARY KEY,
  kind VARCHAR(32) NOT NULL,
  calculation JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
