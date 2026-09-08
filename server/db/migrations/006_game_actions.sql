-- Migration 006: Durable Game Actions Idempotency Table

CREATE TABLE IF NOT EXISTS game_actions (
  match_code VARCHAR(32) NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  player_id BIGINT,
  action_type VARCHAR(64) NOT NULL,
  payload JSONB,
  result JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (match_code, request_id)
);

CREATE INDEX IF NOT EXISTS idx_game_actions_match ON game_actions (match_code, created_at ASC);
