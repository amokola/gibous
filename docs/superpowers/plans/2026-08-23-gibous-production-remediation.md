# Gibous Production Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Gibous safe and coherent as a Telegram Mini App using real on-chain currency, with server-authoritative matches, reliable account state, and a Telegram-safe responsive shell.

**Architecture:** The server owns identity, balances, escrow, settlements, and transaction states. The client submits actions and renders acknowledged snapshots/events only. TON Connect submissions become pending records; balance crediting requires server-side verification and never occurs directly from a client callback.

**Tech Stack:** React 18, TypeScript, Vite, WebSocket (`ws`), Express, Zod, Vitest, React Testing Library, Playwright, TON Connect.

**Spec:** Approved in chat on 2026-08-23; real on-chain currency, current uncommitted work in scope, Telegram Mini App layout priority.

## Global Constraints

- Do not credit balances from client-local state or directly from `sendTransaction()`.
- Do not allow unauthenticated room/economy actions in production.
- All client/server messages must pass shared Zod contracts.
- Telegram system UI and safe-area insets must not overlap the app header.
- Preserve the existing sketch/neo-brutalist visual identity while using a readable body font.
- Keep the current working tree changes; do not reset or overwrite unrelated user work.

---

### Task 1: Baseline and protocol regression tests

**Files:**
- Modify: `tests/contract/zod-contracts.test.ts`
- Create: `tests/integration/websocket/ws-client-contract.test.ts`

- [ ] Add failing tests for server-generated room codes.
- [ ] Add failing tests for actual `DICE_ROLLED`, `DISC_DROPPED`, and `RPS_ROUND_RESOLVED` frames.
- [ ] Add failing tests for invalid stake values.
- [ ] Run the focused tests and capture failures.

### Task 2: Server room, auth, and economy correctness

**Files:**
- Modify: `shared/schemas/protocol.ts`
- Modify: `server/server.ts`
- Modify: `server/roomManager.ts`
- Modify: `server/storage.ts`
- Modify: `server/auth.ts`
- Modify: `server/db/index.ts`
- Modify: `tests/integration/settlement/settlement-idempotency.test.ts`

- [ ] Make room code generation server-owned and collision-safe.
- [ ] Validate positive safe-integer stakes at the shared boundary.
- [ ] Require authenticated sessions for room, queue, sync, and account operations.
- [ ] Add room membership checks for snapshots.
- [ ] Add settlement idempotency and atomic storage interfaces.
- [ ] Include room identity in every gameplay event.
- [ ] Make protocol errors observable rather than silently dropped.

### Task 3: Account and on-chain transaction state

**Files:**
- Modify: `server/storage.ts`
- Modify: `server/server.ts`
- Modify: `src/components/bank/BankScreen.tsx`
- Modify: `src/components/home/HomeScreen.tsx`
- Modify: `src/App.tsx`
- Create/modify: account and transaction shared types/tests as needed.

- [ ] Add authenticated account snapshots.
- [ ] Add pending deposit submission state keyed by wallet address and BoC/trace ID.
- [ ] Prevent local crediting after wallet submission.
- [ ] Require configured network, valid vault address, and asset metadata.
- [ ] Make withdrawal server-owned and pending until payout confirmation.
- [ ] Remove static “verified” and fake ledger claims.

### Task 4: Client state and game event reconciliation

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/hooks/useMultiplayer.ts`
- Modify: `src/services/multiplayerService.ts`
- Modify: `src/components/connect4/Connect4Arena.tsx`
- Modify: `src/components/rps/RPSArena.tsx`
- Modify: `src/components/game/SnakeLadderArena.tsx`
- Modify: `src/components/gameover/GameOverScreen.tsx`
- Modify: game engine tests and component tests.

- [ ] Introduce request/pending/error transitions for create/join/cancel/leave.
- [ ] Use state for role and reset transient events per match.
- [ ] Reconcile authoritative snapshots by room version.
- [ ] Fix RPS acknowledgements and round IDs.
- [ ] Fix Connect 4 winning cell types.
- [ ] Use server timeouts and cancellable animations.
- [ ] Render actual game-over settlement data.

### Task 5: Telegram Mini App shell and visual QA

**Files:**
- Modify: `index.html`
- Modify: `src/index.css`
- Modify: `src/App.tsx`
- Modify: `src/components/home/UserHeaderBar.tsx`
- Modify: `src/components/home/HomeScreen.tsx`
- Modify: `src/components/layout/BottomNav.tsx`
- Modify: `src/hooks/useTelegram.ts`
- Add component tests for header/nav states.

- [ ] Add safe-area CSS variables and Telegram viewport handling.
- [ ] Replace the crowded top area with a compact, non-overlapping header.
- [ ] Use readable body typography and preserve sketch headings.
- [ ] Add bottom safe-area padding and test 360/390px widths.
- [ ] Remove unsupported Telegram API calls when unavailable.
- [ ] Add visual/browser QA for home, lobby, error, vault, and mobile states.

### Task 6: Verification

- [ ] Run focused red/green tests after each task.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run browser QA with the in-app Browser or installed Playwright Chromium.
- [ ] Report remaining external blockers such as missing chain indexer credentials or database migrations.
