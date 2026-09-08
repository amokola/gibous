# Hardened Production-Money Database Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Gibous into a bank-grade, high-throughput, real-money PostgreSQL database architecture with authoritative nano-unit accounting, deterministic row locking, strict match & pot invariants, auto-updated timestamps triggers, singleton treasury constraints, and high-throughput partial indexes.

**Architecture:** Single canonical nano-unit representation (`NUMERIC(39,0)` or integer nano-units) as authoritative source of truth, with generated decimal columns for display. Atomic conditional balance updates with verified `rowCount === 1`. Strict database check constraints for 2-player exact pot sizing, distinct players, winner validity, and draw consistency. Immutable transaction ledger created in the exact same transaction as balance mutations.

**Tech Stack:** PostgreSQL 12+, Node.js 20+, TypeScript, Express, `pg`, Vitest, Zod.

---

### Task 1: Hardened Schema DDL (`server/db/schema.sql`)

**Files:**
- Modify: `server/db/schema.sql`

- [ ] **Step 1: Write the updated schema with triggers, identity columns, nano units, generated columns, and invariants**
  - Add `set_updated_at()` trigger function and triggers for `users`, `matches`, `deposit_intents`, `treasury`.
  - Use `GENERATED ALWAYS AS IDENTITY` for primary keys.
  - Implement single canonical nano units with `GENERATED ALWAYS AS (nano_column / 1000000000.0) STORED`.
  - Add `matches_pot_exact`, `matches_distinct_players`, `matches_winner_valid`, `matches_draw_consistency`, `matches_status_valid`.
  - Add singleton treasury constraint `CHECK (id = 1)`.
  - Add partial indexes `idx_matches_waiting`, `idx_matches_active`, `idx_transactions_user_created`.

### Task 2: Incremental Migration Script (`server/db/migrations/003_hardened_production_schema.sql`)

**Files:**
- Create: `server/db/migrations/003_hardened_production_schema.sql`
- Modify: `server/db/migrate.ts`

- [ ] **Step 1: Create migration 003 to upgrade existing databases**
  - Create trigger function and triggers if not existing.
  - Add/update constraints safely with `ALTER TABLE ... DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT`.
  - Create partial indexes.
  - Register migration in `server/db/migrate.ts`.

### Task 3: Database Client & In-Memory Synchronization (`server/db/index.ts`)

**Files:**
- Modify: `server/db/index.ts`

- [ ] **Step 1: Align SQL queries with hardened schema**
  - Use conditional atomic balance updates `UPDATE users SET balance_nano = balance_nano - $1 WHERE telegram_id = $2 AND balance_nano >= $1`.
  - Enforce ascending deterministic row locking `ORDER BY id FOR UPDATE` on duel participants.
  - Settle matches and record immutable ledger rows atomically in single database transactions.
  - Update in-memory fallback to reflect the same single-source nano invariants.

### Task 4: Verification & Test Suite Execution

**Files:**
- Modify: `scripts/release-gates/postgres.ts`
- Test: Full Vitest suite

- [ ] **Step 1: Run build check**
  - Execute `npm run build` to verify TypeScript types and compilation.
- [ ] **Step 2: Run full Vitest suite**
  - Execute `npm test` to verify all unit, integration, contract, and property tests pass.
- [ ] **Step 3: Update postgres release gate script**
  - Update assertions in `scripts/release-gates/postgres.ts` to test exact pot constraints, distinct players, and singleton treasury.
