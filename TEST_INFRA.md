# Gibous E2E Test Infrastructure & Architecture

## Overview
The Gibous E2E test suite provides opaque-box verification of the multiplayer Duel Arena. All tests communicate strictly as external players/clients over real WebSocket connections (`ws://127.0.0.1:<port>/ws`) without coupling to internal engine private state or mocking socket communication.

## Architecture

```
                                  ┌───────────────────────────────┐
                                  │      E2E Client Harness       │
                                  │       (E2EClient API)         │
                                  └───────────────┬───────────────┘
                                                  │ WebSocket (JSON RPC)
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ Node.js Server Runtime (HTTP + WebSocket upgrade on ephemeral port)             │
│                                                                                 │
│  ├── Connection & Session Manager (AUTH, Heartbeats, Session Tracking)          │
│  ├── Room Manager & Mutex Queue (Concurrency Serialization, Turn Timers)        │
│  ├── Authoritative Game Engines (Connect 4, Snake & Ladder, Rock Paper Scissors)│
│  └── Escrow Ledger Storage (Atomic Balance Updates, Rake Calculation, Payouts)  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Test Harness Components (`tests/e2e/e2e-harness.ts`)
- **`ensureE2EServer()`**: Dynamically starts the HTTP/WebSocket server on an ephemeral port (port 0) if not already listening, ensuring zero port conflicts in CI/CD.
- **`E2EClient`**: Full-duplex WebSocket client wrapper providing:
  - `connect(origin?)`: Handshakes with origin validation.
  - `auth(telegramId, playerName)`: Authenticates client, seeds initial test funds in the in-memory database pool, and asserts `AUTH_OK`.
  - `sendAndAwait(message, expectedType, timeoutMs)`: Sends JSON RPC request with a unique `requestId` and awaits correlated response.
  - `waitForType(type, timeoutMs)` / `waitForNext(filter, timeoutMs)`: Awaits server push events without race conditions or stale event pollution.
  - `close()` / `terminate()`: Clean closure and abrupt socket drop emulation.
- **`setupE2EUser(telegramId, name, initialBalance)`**: Seeds in-memory database balances for escrow verification.
- **`generateRoomCode(prefix)`**: Generates unique, non-colliding room codes per test.

---

## Directory Layout
```
tests/e2e/
├── e2e-harness.ts                  # Test server bootstrap, client wrapper & DB helpers
├── tier1-feature-coverage.test.ts  # Tier 1: Core feature coverage (21 tests)
├── tier2-boundary-corner.test.ts   # Tier 2: Boundary, limit & error cases (17 tests)
├── tier3-cross-feature.test.ts     # Tier 3: Pairwise cross-feature interactions (6 tests)
└── tier4-real-world-workloads.test.ts # Tier 4: Real-world match play-through journeys (4 tests)
```

---

## 4-Tier Test Design & Coverage Matrix

### Tier 1: Feature Coverage (`tier1-feature-coverage.test.ts`)
| Feature | Test ID | Description | Result |
|---------|---------|-------------|--------|
| Connect 4 | 1.1 | Room creation, join, and 6x7 empty board initialization with P1 active | PASS |
| Connect 4 | 1.2 | Alternating disc drops with broadcast verification to both clients | PASS |
| Connect 4 | 1.3 | Gravity stacking of multiple discs in same column | PASS |
| Connect 4 | 1.4 | Horizontal victory detection and `GAME_OVER` payout broadcast | PASS |
| Connect 4 | 1.5 | Vertical victory detection and payout settlement | PASS |
| Connect 4 | 1.6 | Room state synchronization via `SYNC_ROOM` | PASS |
| Snake & Ladder | 2.1 | Starting position verification at tile 1 for both players | PASS |
| Snake & Ladder | 2.2 | Dice rolling with valid roll (1-6) and position advance | PASS |
| Snake & Ladder | 2.3 | Active player turn alternation after rolls | PASS |
| Snake & Ladder | 2.4 | Board state synchronization via `SYNC_ROOM` after dice roll | PASS |
| Snake & Ladder | 2.5 | Multi-turn sequence execution without desynchronization | PASS |
| Rock Paper Scissors | 3.1 | Room creation and Best-of-3 format initialization at 0-0 | PASS |
| Rock Paper Scissors | 3.2 | Choice secrecy preservation until both players commit | PASS |
| Rock Paper Scissors | 3.3 | Resolution of Paper beating Rock with score increment | PASS |
| Rock Paper Scissors | 3.4 | Tie round resolution with unchanged scores | PASS |
| Rock Paper Scissors | 3.5 | Match victory conclusion upon reaching point threshold | PASS |
| Disconnect/Reconnect | 4.1 | Socket drop broadcasts `PLAYER_DISCONNECTED` with 45s timer | PASS |
| Disconnect/Reconnect | 4.2 | Reconnecting client discovers active room in `AUTH_OK` | PASS |
| Disconnect/Reconnect | 4.3 | Reconnected client recovers room state and broadcasts `PLAYER_RECONNECTED` | PASS |
| Disconnect/Reconnect | 4.4 | Voluntary forfeit via `LEAVE_ROOM` awards victory to opponent | PASS |
| Disconnect/Reconnect | 4.5 | Host cancellation of waiting room refunds escrow | PASS |

### Tier 2: Boundary & Corner Cases (`tier2-boundary-corner.test.ts`)
| Category | Test ID | Description | Result |
|----------|---------|-------------|--------|
| Connect 4 | 2.1 | Minimum boundary column index (0) accepted | PASS |
| Connect 4 | 2.2 | Maximum boundary column index (6) accepted | PASS |
| Connect 4 | 2.3 | Out-of-bounds column indices (-1 and 7) rejected | PASS |
| Connect 4 | 2.4 | Column overflow limit (7th drop into full column) rejected | PASS |
| Connect 4 | 2.5 | Out-of-turn drop attempt rejected | PASS |
| Connect 4 | 2.6 | Post-game drop attempt rejected | PASS |
| Snake & Ladder | 2.7 | Advance from tile 1 starting boundary | PASS |
| Snake & Ladder | 2.8 | Out-of-turn dice roll attempt rejected | PASS |
| Snake & Ladder | 2.9 | Post-game dice roll attempt rejected | PASS |
| Rock Paper Scissors | 2.10 | Invalid weapon choice string rejected | PASS |
| Rock Paper Scissors | 2.11 | Post-game choice submission rejected | PASS |
| Rock Paper Scissors | 2.12 | Unauthenticated action attempt rejected with UNAUTHORIZED | PASS |
| Economics/Room | 2.13 | Stakes below MIN_STAKE (0.5 GRAM) rejected | PASS |
| Economics/Room | 2.14 | Stakes above MAX_STAKE (10,000 GRAM) rejected | PASS |
| Economics/Room | 2.15 | Joining non-existent room code rejected with `JOIN_FAILED` | PASS |
| Economics/Room | 2.16 | Joining an already full room rejected with `ROOM_FULL` | PASS |
| Economics/Room | 2.17 | Non-host attempt to cancel waiting room rejected with `CANCEL_FAILED` | PASS |

### Tier 3: Cross-Feature Combinations (`tier3-cross-feature.test.ts`)
| Feature Pair | Test ID | Description | Result |
|--------------|---------|-------------|--------|
| Disconnect + Turns | 3.1 | Mid-turn disconnect, reconnection, and seamless move continuation | PASS |
| Victory + Rematch | 3.2 | Normal match victory followed by mutual rematch agreement (`-R2`) | PASS |
| Forfeit + Rematch | 3.3 | Match forfeit followed by mutual rematch agreement | PASS |
| Staking + Ledger | 3.4 | 500 GRAM stake duel with exact escrow rake (10%) and payout balance audit | PASS |
| Chat + Turn Timers | 3.5 | Real-time emoji exchange during gameplay without turn timer disruption | PASS |
| Network + Stability | 3.6 | Double socket disconnect resolved symmetrically without server crash | PASS |

### Tier 4: Real-World Workloads (`tier4-real-world-workloads.test.ts`)
| Workload | Test ID | Description | Result |
|----------|---------|-------------|--------|
| Full Connect 4 Match | 4.1 | Room creation, lobby discovery, join, full turn-by-turn play, horizontal win, rematch | PASS |
| Full RPS Best-of-3 Duel | 4.2 | Multi-round duel with ties, comeback rounds, and decisive 3-point victory | PASS |
| Disconnect Recovery Flow | 4.3 | Real-world socket drop mid-match, countdown warning, reconnect, and match completion | PASS |
| Voluntary Forfeit Flow | 4.4 | High-stakes duel (500 GRAM) voluntary surrender, instant settlement & payout credit | PASS |

---

## Execution Command
```bash
npx vitest run tests/e2e
```

**Results:**
- **Test Files**: 4 passed (4 total)
- **Tests**: 54 passed (54 total)
- **Failures**: 0
- **Duration**: ~12 seconds
