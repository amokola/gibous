-- Migration 012: Upgrade users.id and referencing foreign keys to BIGINT
-- Follows official PostgreSQL documentation for altering identity primary keys with referencing foreign keys

-- 1. Drop referencing foreign key constraints temporarily
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_p1_id_fkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_p2_id_fkey;
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_winner_id_fkey;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_user_id_fkey;

-- 2. Alter parent identity column type to BIGINT (PostgreSQL auto-updates the underlying identity sequence)
ALTER TABLE users ALTER COLUMN id SET DATA TYPE BIGINT;

-- 3. Alter child foreign key column types to BIGINT
ALTER TABLE matches ALTER COLUMN p1_id TYPE BIGINT;
ALTER TABLE matches ALTER COLUMN p2_id TYPE BIGINT;
ALTER TABLE matches ALTER COLUMN winner_id TYPE BIGINT;
ALTER TABLE transactions ALTER COLUMN user_id TYPE BIGINT;

-- 4. Re-establish foreign key constraints
ALTER TABLE matches ADD CONSTRAINT matches_p1_id_fkey FOREIGN KEY (p1_id) REFERENCES users(id);
ALTER TABLE matches ADD CONSTRAINT matches_p2_id_fkey FOREIGN KEY (p2_id) REFERENCES users(id);
ALTER TABLE matches ADD CONSTRAINT matches_winner_id_fkey FOREIGN KEY (winner_id) REFERENCES users(id);
ALTER TABLE transactions ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
