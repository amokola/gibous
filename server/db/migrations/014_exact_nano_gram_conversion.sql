-- Preserve every nano-unit when converting large numeric values to decimal GRAM.
-- PostgreSQL numeric division can round a large quotient before a later ROUND(..., 9).
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

ALTER TABLE transactions DROP COLUMN IF EXISTS amount;
ALTER TABLE transactions DROP COLUMN IF EXISTS fee;
ALTER TABLE transactions DROP COLUMN IF EXISTS balance_after;
ALTER TABLE transactions
  ADD COLUMN amount NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(amount_nano)) STORED,
  ADD COLUMN fee NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(fee_nano)) STORED,
  ADD COLUMN balance_after NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(balance_after_nano)) STORED;

ALTER TABLE deposit_intents DROP COLUMN IF EXISTS amount_gram;
ALTER TABLE deposit_intents
  ADD COLUMN amount_gram NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(amount_nano)) STORED;

ALTER TABLE treasury DROP COLUMN IF EXISTS total_rake_collected;
ALTER TABLE treasury DROP COLUMN IF EXISTS win_rake_collected;
ALTER TABLE treasury DROP COLUMN IF EXISTS draw_fees_collected;
ALTER TABLE treasury DROP COLUMN IF EXISTS total_volume_processed;
ALTER TABLE treasury
  ADD COLUMN total_rake_collected NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(total_rake_nano)) STORED,
  ADD COLUMN win_rake_collected NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(win_rake_nano)) STORED,
  ADD COLUMN draw_fees_collected NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(draw_fees_nano)) STORED,
  ADD COLUMN total_volume_processed NUMERIC(30,9) GENERATED ALWAYS AS (nano_to_gram(total_volume_nano)) STORED;
