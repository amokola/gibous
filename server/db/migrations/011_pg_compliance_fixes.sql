-- Migration 011: PostgreSQL Best Practices & Financial Invariant Compliance
-- 1. Drop redundant non-unique index on users(telegram_id) since telegram_id UNIQUE constraint already creates a unique index.
-- 2. Update generated column expressions to enforce exact 9-decimal ROUND() on division to prevent arbitrary-precision drift.
-- 3. Normalize any historical withdrawal ledger rows to negative amount_nano.

-- 1. Drop redundant index
DROP INDEX IF EXISTS idx_users_telegram_id;

-- 2. Ensure historical withdrawal rows are negative
UPDATE transactions SET amount_nano = -ABS(amount_nano) WHERE type = 'withdraw' AND amount_nano > 0;

-- 3. Re-create generated columns with ROUND(..., 9) on transactions table
ALTER TABLE transactions DROP COLUMN IF EXISTS amount;
ALTER TABLE transactions ADD COLUMN amount NUMERIC(30,9) GENERATED ALWAYS AS (ROUND(amount_nano / 1000000000.0, 9)) STORED;

ALTER TABLE transactions DROP COLUMN IF EXISTS fee;
ALTER TABLE transactions ADD COLUMN fee NUMERIC(30,9) GENERATED ALWAYS AS (ROUND(fee_nano / 1000000000.0, 9)) STORED;

ALTER TABLE transactions DROP COLUMN IF EXISTS balance_after;
ALTER TABLE transactions ADD COLUMN balance_after NUMERIC(30,9) GENERATED ALWAYS AS (ROUND(balance_after_nano / 1000000000.0, 9)) STORED;

-- 4. Re-create generated column with ROUND(..., 9) on deposit_intents table
ALTER TABLE deposit_intents DROP COLUMN IF EXISTS amount_gram;
ALTER TABLE deposit_intents ADD COLUMN amount_gram NUMERIC(30,9) GENERATED ALWAYS AS (ROUND(amount_nano / 1000000000.0, 9)) STORED;

-- 5. Re-create generated columns with ROUND(..., 9) on treasury table
ALTER TABLE treasury DROP COLUMN IF EXISTS total_rake_collected;
ALTER TABLE treasury ADD COLUMN total_rake_collected NUMERIC(30,9) GENERATED ALWAYS AS (ROUND(total_rake_nano / 1000000000.0, 9)) STORED;

ALTER TABLE treasury DROP COLUMN IF EXISTS win_rake_collected;
ALTER TABLE treasury ADD COLUMN win_rake_collected NUMERIC(30,9) GENERATED ALWAYS AS (ROUND(win_rake_nano / 1000000000.0, 9)) STORED;

ALTER TABLE treasury DROP COLUMN IF EXISTS draw_fees_collected;
ALTER TABLE treasury ADD COLUMN draw_fees_collected NUMERIC(30,9) GENERATED ALWAYS AS (ROUND(draw_fees_nano / 1000000000.0, 9)) STORED;

ALTER TABLE treasury DROP COLUMN IF EXISTS total_volume_processed;
ALTER TABLE treasury ADD COLUMN total_volume_processed NUMERIC(30,9) GENERATED ALWAYS AS (ROUND(total_volume_nano / 1000000000.0, 9)) STORED;
