# Match Lifecycle Atomic Orchestration & Multi-Instance Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate application-memory financial authority, make match creation and joining fully atomic database transactions with row locks, introduce durable `game_actions` idempotency, and unify forfeit settlements.

---

### Task 1: Database Migration & Schema Enhancement (`006_game_actions.sql`)

**Files:**
- Create: `server/db/migrations/006_game_actions.sql`
- Modify: `server/db/migrate.ts`

- [ ] **Step 1: Create `game_actions` table migration for durable action idempotency**
- [ ] **Step 2: Register migration in `migrate.ts`**

### Task 2: DatabasePool Atomic Operations (`server/db/index.ts`)

**Files:**
- Modify: `server/db/index.ts`

- [ ] **Step 1: Implement `createMatchWithEscrow(params)` (atomic debit + match persistence)**
- [ ] **Step 2: Implement `joinMatchWithEscrow(params)` (atomic slot check + debit + match transition to playing)**
- [ ] **Step 3: Implement `startRematchWithEscrow(params)` (atomic 2-player debit for rematch)**
- [ ] **Step 4: Implement `recordGameAction` & `getGameAction`**

### Task 3: StorageService & RoomManager Alignment (`server/storage.ts`, `server/roomManager.ts`)

**Files:**
- Modify: `server/storage.ts`
- Modify: `server/roomManager.ts`

- [ ] **Step 1: Update `StorageService` to expose atomic match creation and joining methods**
- [ ] **Step 2: Refactor `createRoom` and `joinRoom` in `RoomManager` to use atomic database operations**
- [ ] **Step 3: Unify forfeit/resignation settlement into `settleForfeit(code, forfeiterRole, reason)`**
- [ ] **Step 4: Use `crypto.randomBytes` for room codes**

### Task 4: Verification & Concurrency Tests

**Files:**
- Modify: `tests/integration/settlement/concurrency-adversarial.test.ts`

- [ ] **Step 1: Add multi-instance concurrent join race test**
- [ ] **Step 2: Run `npm run build` and `npm test`**
