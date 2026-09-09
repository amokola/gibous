-- Migration 010: Support decimal stake amounts, pot amounts, and dev_rake for sub-integer stakes (e.g. 0.5 GRAM)

ALTER TABLE matches
  ALTER COLUMN stake_amount TYPE NUMERIC(30,9) USING stake_amount::numeric,
  ALTER COLUMN pot_amount TYPE NUMERIC(30,9) USING pot_amount::numeric,
  ALTER COLUMN dev_rake TYPE NUMERIC(30,9) USING dev_rake::numeric;
