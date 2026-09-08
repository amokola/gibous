# Gibous Real-Money PvP Server Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Gibous multiplayer WebSocket game server into an enterprise-grade, financial-grade real-money PvP platform with strict state-machine transactional persistence, per-room command serialization, decoupled idempotent settlement workers, atomic matchmaking, layered rate limiting, and HTTP upgrade handshake security.

**Architecture:** 
1. **Per-Room Command Queue & Lock (`withRoomLock`)**: Serialize all gameplay actions per room code to eliminate cross-socket race conditions.
2. **Calculate → Persist → Commit Pattern**: Split move execution into pure state transition calculation, durable database write/version check, and in-memory commit only upon persistence success.
3. **Decoupled Idempotent Settlement Engine**: Decouple financial settlement from real-time WebSocket packet processing using durable PostgreSQL settlement records (`SETTLEMENT_PROCESSING` / `SETTLED` / `SETTLEMENT_FAILED`) with background worker reconciliation.
4. **Atomic Matchmaking & Stake Validation**: Enforce unified stake validation (`validateStake`), single active queue entry per Telegram ID, and atomic room reservation/join with automatic rollback on opponent join failure.
5. **Session Generations & Disconnect/Reconnect Safety**: Assign generation IDs to WebSocket sessions to prevent disconnect handlers from stomping active reconnects.
6. **HTTP Upgrade Gateway & Handshake Security**: Replace deprecated `verifyClient` with native HTTP `upgrade` handling, fix multi-origin CORS parsing, add EMOTE rate limits, and sanitize public API outputs.

**Tech Stack:** Node.js, TypeScript, Express, `ws`, PostgreSQL (`pg`), Zod, Vitest.

---

## Workstreams & File Mapping

### Component 1: Room Serialization & Atomic Move Transactions
- [Modify] [`server/roomManager.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/roomManager.ts)
- [Modify] [`server/server.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/server.ts)
- [New] [`server/roomCommandQueue.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/roomCommandQueue.ts)
- [Test] [`tests/integration/persistence/match-recovery.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/persistence/match-recovery.test.ts)
- [Test] [`tests/integration/settlement/concurrency-race.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/settlement/concurrency-race.test.ts)

### Component 2: Decoupled Durable Settlement & Ledger Reconciliation
- [Modify] [`server/storage.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/storage.ts)
- [Modify] [`server/db/index.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/db/index.ts)
- [New] [`server/settlementWorker.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/settlementWorker.ts)
- [Test] [`tests/integration/settlement/settlement-idempotency.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/settlement/settlement-idempotency.test.ts)

### Component 3: Matchmaking Queue & Atomic Pairing Invariants
- [Modify] [`server/matchmaking.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/matchmaking.ts)
- [Modify] [`shared/schemas/protocol.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/shared/schemas/protocol.ts)
- [Test] [`tests/unit/server/matchmaking-queue.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/unit/server/matchmaking-queue.test.ts)

### Component 4: WebSocket Upgrade Gateway, Session Generations & Authorization Guards
- [Modify] [`server/server.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/server.ts)
- [Modify] [`server/connectionManager.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/connectionManager.ts)
- [Modify] [`server/sessionManager.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/sessionManager.ts)
- [New] [`server/authGuards.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/authGuards.ts)
- [Test] [`tests/integration/websocket/ws-handshake-auth.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/websocket/ws-handshake-auth.test.ts)
- [Test] [`tests/integration/websocket/ws-rate-limiting.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/websocket/ws-rate-limiting.test.ts)
- [Test] [`tests/integration/websocket/ws-reconnect-forfeit.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/websocket/ws-reconnect-forfeit.test.ts)

---

## Detailed Task Breakdown

### Task 1: Per-Room Command Queue (`withRoomLock`) & Serialization

**Files:**
- Create: [`server/roomCommandQueue.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/roomCommandQueue.ts)
- Test: [`tests/unit/server/room-command-queue.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/unit/server/room-command-queue.test.ts)

- [ ] **Step 1: Write unit test for `RoomCommandQueue`**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `RoomCommandQueue`**
- [ ] **Step 4: Run test to verify pass**

---

### Task 2: Calculate → Persist → Commit State Machine Pattern

**Files:**
- Modify: [`server/roomManager.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/roomManager.ts)
- Modify: [`server/server.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/server.ts)
- Test: [`tests/integration/persistence/match-recovery.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/persistence/match-recovery.test.ts)

- [ ] **Step 1: Write integration test for failed persistence rollback**
- [ ] **Step 2: Implement pure calculation & commit separation in `RoomManager`**
- [ ] **Step 3: Integrate `withRoomLock` and calculate-persist-commit in `server.ts`**
- [ ] **Step 4: Run tests to verify pass**

---

### Task 3: Decoupled Durable Settlement Queue & Worker

**Files:**
- Create: [`server/settlementWorker.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/settlementWorker.ts)
- Modify: [`server/storage.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/storage.ts)
- Modify: [`server/server.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/server.ts)
- Test: [`tests/integration/settlement/settlement-idempotency.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/settlement/settlement-idempotency.test.ts)

- [ ] **Step 1: Write settlement worker unit & idempotency tests**
- [ ] **Step 2: Implement `SettlementWorker`**
- [ ] **Step 3: Hook `SettlementWorker` into `server.ts` and graceful shutdown**
- [ ] **Step 4: Run tests to verify pass**

---

### Task 4: Matchmaking Queue Hardening & Stake Bounds Enforcement

**Files:**
- Modify: [`server/matchmaking.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/matchmaking.ts)
- Modify: [`server/server.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/server.ts)
- Create: [`server/authGuards.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/authGuards.ts)
- Test: [`tests/unit/server/matchmaking-queue.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/unit/server/matchmaking-queue.test.ts)

- [ ] **Step 1: Write test for matchmaking edge cases**
- [ ] **Step 2: Implement centralized `validateStake` and authorization guards**
- [ ] **Step 3: Update `MatchmakingQueue` with global per-account deduplication**
- [ ] **Step 4: Update async matchmaking callback with try/catch rollback**
- [ ] **Step 5: Run tests to verify pass**

---

### Task 5: WebSocket Upgrade Handling, Session Generations & Multi-Socket Policy

**Files:**
- Modify: [`server/server.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/server.ts)
- Modify: [`server/connectionManager.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/connectionManager.ts)
- Modify: [`server/sessionManager.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/sessionManager.ts)
- Test: [`tests/integration/websocket/ws-handshake-auth.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/websocket/ws-handshake-auth.test.ts)
- Test: [`tests/integration/websocket/ws-reconnect-forfeit.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/websocket/ws-reconnect-forfeit.test.ts)

- [ ] **Step 1: Replace `verifyClient` with HTTP `server.on('upgrade')`**
- [ ] **Step 2: Fix Express CORS configuration for comma-separated origins**
- [ ] **Step 3: Add Session Generation IDs to avoid Disconnect / Reconnect Races**
- [ ] **Step 4: Add EMOTE rate limiting & layered limits**
- [ ] **Step 5: Run tests to verify pass**

---

### Task 6: Request ID Validation, API Hardening & Public Data Sanitization

**Files:**
- Modify: [`shared/schemas/protocol.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/shared/schemas/protocol.ts)
- Modify: [`server/server.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/server.ts)
- Modify: [`server/roomManager.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/server/roomManager.ts)
- Test: [`tests/contract/zod-contracts.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/contract/zod-contracts.test.ts)
- Test: [`tests/integration/api/rest-endpoints.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/integration/api/rest-endpoints.test.ts)

- [ ] **Step 1: Tighten `requestId` schema constraint**
- [ ] **Step 2: Update `/api/health` and `/api/ready` semantics**
- [ ] **Step 3: Sanitize `/api/rooms` output**
- [ ] **Step 4: Run full test suite & type checks**

---

## Verification Plan

### Automated Tests
- Full Vitest Suite: `npm run test`
- Settlement Idempotency Tests: `npx vitest run tests/integration/settlement`
- Concurrency & Race Condition Tests: `npx vitest run tests/integration/settlement/concurrency-race.test.ts`
- WebSocket Handshake, Reconnect & Rate Limiting: `npx vitest run tests/integration/websocket`
- TypeScript Compilation: `npm run typecheck`
