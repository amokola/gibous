-- Migration 007: Composite index on deposit_intents (telegram_id, created_at DESC)
-- Optimizes loadDepositIntentsForUser queries filtering by player and ordering by chronological recency.

CREATE INDEX IF NOT EXISTS idx_deposit_intents_user_created
    ON deposit_intents (telegram_id, created_at DESC);
