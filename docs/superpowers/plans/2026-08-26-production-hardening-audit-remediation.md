# Production Hardening & Financial Integrity Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement immediate, production-grade fixes for all 10 vulnerabilities and integrity gaps identified in the Senior Audit across PostgreSQL, DatabasePool, TON verification, and settlement pipelines.

**Architecture:** Isolate user balances from generic profile writes; enforce database-authoritative match settlements with row locking; parse and verify TON deposit memos; eliminate singleton treasury lock contention with an append-only `treasury_ledger`; protect dynamic SQL queries with strict allowlisting; configure connection pool timeouts.

**Tech Stack:** PostgreSQL 12+, TypeScript, Node.js 20+, `pg`, `@ton/core`, `@ton/ton`, Vitest.

---

### Task 1: Database Schema & Migration 004

**Files:**
- Modify: `server/db/schema.sql`
- Create: `server/db/migrations/004_settlement_foreign_keys_and_guards.sql`
- Modify: `server/db/migrate.ts`

- [ ] **Step 1: Update `schema.sql` with foreign keys, treasury ledger, and state guards**
- [ ] **Step 2: Create `004_settlement_foreign_keys_and_guards.sql`**
- [ ] **Step 3: Register migration in `migrate.ts`**

### Task 2: Database Client Hardening (`server/db/index.ts`)

**Files:**
- Modify: `server/db/index.ts`

- [ ] **Step 1: Omit `balance_nano` from `persistUser` update clause**
- [ ] **Step 2: Update `settleWinMatch` and `settleDrawMatch` to lock and validate authoritative `matches` rows**
- [ ] **Step 3: Add column allowlist to `updatePersistentDepositIntent`**
- [ ] **Step 4: Configure PostgreSQL pool timeouts (`statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`)**
- [ ] **Step 5: Align in-memory fallback behavior**

### Task 3: TON Deposit Verifier Memo Parsing (`server/tonVerifier.ts`)

**Files:**
- Modify: `server/tonVerifier.ts`

- [ ] **Step 1: Parse message body cell for transfer comment/memo and verify `memo === intent.id`**

### Task 4: Adversarial Concurrency Test Suite & Release Verification

**Files:**
- Create: `tests/integration/settlement/concurrency-adversarial.test.ts`
- Modify: `scripts/release-gates/postgres.ts`

- [ ] **Step 1: Write adversarial concurrency test suite**
- [ ] **Step 2: Run `npm run build` and `npm test`**
