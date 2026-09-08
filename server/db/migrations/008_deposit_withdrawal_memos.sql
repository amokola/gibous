-- Migration 008: Server-Generated Deposit and Withdrawal Memos & Expiration
-- Formats: dep_<internalUserId>_<randomHex> and wit_<internalUserId>_<randomHex>
-- Internal user ID refers to users.id (database primary key), NOT telegram_id.

-- 1. Update deposit_intents table:
-- Add memo column with unique constraint
ALTER TABLE deposit_intents 
  ADD COLUMN IF NOT EXISTS memo VARCHAR(64) UNIQUE;

-- Add expires_at column with 15-minute default TTL
ALTER TABLE deposit_intents 
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes');

-- Allow boc to be nullable during pre-flight intent creation (before wallet signs)
ALTER TABLE deposit_intents 
  ALTER COLUMN boc DROP NOT NULL;

-- Replace existing strict unique constraint on boc with partial unique index (ignoring NULLs)
ALTER TABLE deposit_intents 
  DROP CONSTRAINT IF EXISTS deposit_intents_boc_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_intents_boc_unique 
  ON deposit_intents (boc) WHERE boc IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deposit_intents_expires_status 
  ON deposit_intents (status, expires_at);

-- 2. Update withdrawals table:
-- Add memo column with unique constraint for auditability and exchange tracking
ALTER TABLE withdrawals 
  ADD COLUMN IF NOT EXISTS memo VARCHAR(64) UNIQUE;
