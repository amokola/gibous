# StorageService Architectural Remediation & Authority Unification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish `DatabasePool` as the single authoritative engine for all financial mutations, eliminating service-level read-modify-write patterns, fixing cancellation refund multi-player locks, making settlement input derivation authoritative from locked match records, securing BOC ownership checks, and moving leaderboard operations to SQL.

---

### Task 1: Database Engine Enhancements (`server/db/index.ts`)

**Files:**
- Modify: `server/db/index.ts`
- Create: `server/db/migrations/005_leaderboard_and_cancellation.sql`
- Modify: `server/db/migrate.ts`

- [ ] **Step 1: Implement `cancelMatchAndRefund(matchCode)` and fix `refundStake` key to `${matchCode}:cancel-refund:${telegramId}`**
- [ ] **Step 2: Update `settleWinMatch` and `settleDrawMatch` to derive match parameters and execute in both persistent and in-memory modes**
- [ ] **Step 3: Implement `getLeaderboard(limit)` in `DatabasePool` using direct SQL query**

### Task 2: Service Layer Refactoring (`server/storage.ts`)

**Files:**
- Modify: `server/storage.ts`

- [ ] **Step 1: Remove manual balance updates, persistUser clobbering, and manual ledger calls from `StorageService`**
- [ ] **Step 2: Update `recordPendingDeposit` to check BOC ownership before returning existing intent**
- [ ] **Step 3: Sort `getAccountSnapshot` transactions chronologically**
- [ ] **Step 4: Update `UserEntity` interface to include `balance_nano: string`**
- [ ] **Step 5: Rename `settlementLocks` to `localSettlementDeduplication`**

### Task 3: Room Manager & Integration Alignment (`server/roomManager.ts`)

**Files:**
- Modify: `server/roomManager.ts`

- [ ] **Step 1: Update room cancellation and settlement calls to invoke new StorageService/DatabasePool methods**

### Task 4: Verification & Test Suite Execution

**Files:**
- Modify: `tests/unit/economy/storage-escrow.test.ts`
- Modify: `tests/integration/settlement/concurrency-adversarial.test.ts`

- [ ] **Step 1: Add test for 2-player cancellation refund invariant**
- [ ] **Step 2: Run `npm run build` and `npm test`**
