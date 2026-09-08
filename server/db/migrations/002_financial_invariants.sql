-- Durable operation identity and balance invariants for retry-safe financial commands.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_balance_gram_check;
ALTER TABLE users
  ADD CONSTRAINT users_balance_gram_check CHECK (balance_gram >= 0);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS balance_nano NUMERIC(39,0);
UPDATE users
   SET balance_nano = ROUND(balance_gram * 1000000000)
 WHERE balance_nano IS NULL;
ALTER TABLE users
  ALTER COLUMN balance_nano SET DEFAULT 0,
  ALTER COLUMN balance_nano SET NOT NULL;
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_balance_nano_check;
ALTER TABLE users
  ADD CONSTRAINT users_balance_nano_check CHECK (balance_nano >= 0);
ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_balance_units_consistent;
ALTER TABLE users
  ADD CONSTRAINT users_balance_units_consistent CHECK (balance_nano = ROUND(balance_gram * 1000000000));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS amount_nano NUMERIC(39,0),
  ADD COLUMN IF NOT EXISTS fee_nano NUMERIC(39,0),
  ADD COLUMN IF NOT EXISTS balance_after_nano NUMERIC(39,0);

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE matches
  DROP CONSTRAINT IF EXISTS matches_game_type_valid;
ALTER TABLE matches
  ADD CONSTRAINT matches_game_type_valid CHECK (game_type IN ('snake', 'connect4', 'rps'));

ALTER TABLE matches
  DROP CONSTRAINT IF EXISTS matches_stake_positive;
ALTER TABLE matches
  ADD CONSTRAINT matches_stake_positive CHECK (stake_amount > 0);

ALTER TABLE matches
  DROP CONSTRAINT IF EXISTS matches_pot_covers_stake;
ALTER TABLE matches
  ADD CONSTRAINT matches_pot_covers_stake CHECK (pot_amount >= stake_amount);

ALTER TABLE matches
  DROP CONSTRAINT IF EXISTS matches_status_valid;
ALTER TABLE matches
  ADD CONSTRAINT matches_status_valid CHECK (status IN ('waiting', 'playing', 'gameover', 'finished', 'cancelled'));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS operation_key VARCHAR(160);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_operation_key
  ON transactions (operation_key)
  WHERE operation_key IS NOT NULL;

ALTER TABLE deposit_intents
  DROP CONSTRAINT IF EXISTS deposit_intents_amount_nano_positive;
ALTER TABLE deposit_intents
  ADD CONSTRAINT deposit_intents_amount_nano_positive CHECK (amount_nano > 0);

ALTER TABLE settlements
  DROP CONSTRAINT IF EXISTS settlements_kind_valid;
ALTER TABLE settlements
  ADD CONSTRAINT settlements_kind_valid CHECK (kind IN ('win', 'draw', 'cancel_refund'));
