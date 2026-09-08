# Gibous Telegram Duel Arena — Comprehensive Architecture Deep-Dive & Codebase Specification

> **Document Version:** 1.0.0  
> **Target System:** Gibous (`gibous`) — Real-Time Telegram Duel Arena  
> **Source Repository:** `c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous`  
> **Audience:** Senior Software Architects, Full-Stack Engineers, Security & Blockchain Engineers, Onboarding Developers  
> **Output Artifact:** `projectcontext.md`

---

## 1. Executive Summary

### 1.1 What the Application Is & What Problem It Solves
**Gibous** (formerly referenced internally as *4real*) is a high-performance, real-time Player-versus-Player (PvP) duel arena designed to run inside the **Telegram Mini Apps (TMA)** ecosystem. It allows Telegram users to challenge friends or matchmake with opponents, stake **Play GRAM / on-chain TON currency** into an escrow smart pot, compete in server-authoritative skill and strategy games, climb a global leaderboard, and share cryptographically signed dynamic victory and daily performance cards ("Brag Cards") back into Telegram chats.

The system currently hosts **three distinct PvP duel disciplines**:
1. **Snakes & Ladders (`snake`)**: A 10×10 Boustrophedon board race (tiles 1–100) featuring 6 canonical snakes, 6 canonical ladders, an overshoot bounce-back rule from tile 100, and a 3D isometric dice tumbler.
2. **Four in a Row (`connect4`)**: A tactical 7-column × 6-row vertical grid game with physics-inspired gravity disc drops and automatic multi-directional win evaluation (horizontal, vertical, diagonal).
3. **Rock Paper Scissors (`rps`)**: A fast simultaneous-commit best-of-five (first to 3 gems) psychological duel with synchronized 3-2-1 clash reveals.

### 1.2 Architectural Classification
The project is structured as a **Hybrid Server-Authoritative Real-Time Client/Server Monorepository**:
* **Backend Runtime:** Node.js (ESM) running an HTTP Express server paired with a high-throughput `ws` WebSocket server. The backend is the **exclusive authority** for game rule evaluation, dice roll generation, hidden choice commitments, participant identity binding, financial escrow debits, match settlement payouts, and treasury rake accounting.
* **Frontend Runtime:** A single-page application (SPA) built with React 18, TypeScript, Vite, Tailwind CSS, and Zustand. The client is strictly **presentational and intent-driven**; it renders acknowledged server state snapshots and dispatches action intents.
* **Shared Contract Boundary:** A dedicated `shared/` package compiling TypeScript types, game constants, economics formulas, and bidirectional runtime **Zod schemas** that validate all HTTP payloads and WebSocket wire frames.
* **Blockchain & Telegram Integration:** Integration with Telegram's WebApp SDK (HMAC-SHA256 `initData` validation, Safe Area insets, prepared inline message sharing) and the **TON Blockchain** (via `@ton/core`, `@ton/ton`, and `@tonconnect/ui-react` for native TON transactions verified by a background indexer polling service).

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                TELEGRAM MINI APP CLIENT                                  │
│                                                                                          │
│   React 18 + Zustand + Vite + Tailwind CSS + Telegram WebApp SDK + TON Connect UI        │
│   [ HomeScreen | LobbyScreen | WaitingRoomScreen | VSIntro | DuelShell | GameOverScreen ] │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                    HTTP REST API    │    WebSocket (/ws)
                  (Health/Brag/Data) │ (Auth/Game Moves/Sync)
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                GIBOUS BACKEND SERVER                                     │
│                                                                                          │
│   Express 4.21 + ws 8.18 + Node.js Crypto + Sharp (SVG->JPEG) + TonClient Indexer        │
│   ├── TelegramAuth (HMAC-SHA256 initData Verification)                                   │
│   ├── SessionManager & ConnectionManager (Dual Sliding-Window Rate Limiters)             │
│   ├── RoomManager & MatchmakingQueue (Lifecycle, Versioning, Forfeit Timers)             │
│   ├── Authoritative Engines (SnakeLadderEngine | Connect4Engine | RPSEngine)             │
│   ├── StorageService & EconomyEngine (Escrow, 90/10 Win Pots, 95% Draw Refunds)          │
│   └── DepositVerificationService (Background Poller for TON On-Chain Deposits)           │
└────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                                PERSISTENCE & BLOCKCHAIN                                  │
│                                                                                          │
│   ├── PostgreSQL / Supabase Pool (`pg`) with High-Speed In-Memory Dev/Test Fallback      │
│   │   ├── users, matches, transactions, deposit_intents, settlements, treasury           │
│   └── TON Blockchain RPC (Toncenter API v2 / Testnet / Mainnet)                          │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete Tech Stack & Dependency Breakdown

### 2.1 Backend Dependencies (`package.json`, `server/`)

| Package / Module | Version | Purpose in Codebase | Where Actually Used |
| :--- | :--- | :--- | :--- |
| **`express`** | `^4.21.2` | Primary HTTP web framework for REST API endpoints and static serving | `server/server.ts` |
| **`ws`** | `^8.18.0` | High-performance WebSocket server handling all real-time multiplayer actions | `server/server.ts`, `server/connectionManager.ts` |
| **`@ton/core`** | `^0.62.1` | Primitive data types, Address parsing, Cell handling, and Coins for TON | `server/tonVerifier.ts` |
| **`@ton/ton`** | `^15.4.0` | Client SDK (`TonClient`) for querying transactions from Toncenter indexer | `server/tonVerifier.ts` |
| **`pg`** | `^8.23.0` | PostgreSQL client connection pooling (`Pool`, parameterized SQL queries) | `server/db/index.ts`, `server/db/migrate.ts` |
| **`sharp`** | `^0.35.3` | Native image processing library converting dynamic SVG boast cards to JPEGs | `server/bragCardRenderer.ts` |
| **`zod`** | `^4.4.3` | Runtime schema validation for protocol contracts, client/server payloads | `shared/schemas/protocol.ts`, `server/server.ts` |
| **`dotenv`** | `^17.4.2` | Environment variable loader from `.env` | `server/server.ts`, `server/db/migrate.ts` |
| **`cors`** | `^2.8.5` | Cross-Origin Resource Sharing middleware for Express API routes | `server/server.ts` |
| **`node:crypto`** | Built-in | HMAC-SHA256 signature calculation, token signing, `randomUUID` | `server/auth.ts`, `server/bragShareToken.ts` |

### 2.2 Frontend Dependencies (`src/`)

| Package / Module | Version | Purpose in Codebase | Where Actually Used |
| :--- | :--- | :--- | :--- |
| **`react` & `react-dom`** | `^18.3.1` | Component UI rendering, Suspense, lazy loading, and hooks | Throughout `src/` |
| **`zustand`** | `^5.0.15` | Centralized reactive client state management (Auth, Room, Game, UI, Connection) | `src/state/` |
| **`@tonconnect/ui-react`** | `^3.0.2` | Official Telegram/TON Connect UI wallet provider, modal, and transaction hooks | `src/main.tsx`, `src/components/bank/BankScreen.tsx` |
| **`lucide-react`** | `^1.16.0` | Vector UI icon set | Throughout `src/components/` |
| **`canvas-confetti`** | `^1.9.4` | Particle celebration effects on duel victory | `src/components/gameover/GameOverScreen.tsx` |
| **`tailwindcss`** | `^3.4.17` | Utility-first styling framework implementing neo-brutalist / sketch aesthetics | `tailwind.config.js`, `src/index.css` |

### 2.3 Tooling, Testing & Infrastructure

| Package / Tool | Version | Purpose |
| :--- | :--- | :--- |
| **`tsx`** | `^4.23.12` | Zero-config TypeScript execution engine for running backend scripts |
| **`vite`** | `^6.1.0` | Lightning-fast frontend build tool and development server with proxy |
| **`vitest`** | `^4.1.11` | Primary unit, integration, security, contract, and property test runner |
| **`@playwright/test`** | `^1.62.1` | End-to-end browser automation suite testing multi-session gameplay |
| **`fast-check`** | `^4.9.0` | Property-based fuzzing library verifying financial and game invariant laws |
| **`supertest`** | `^7.2.2` | HTTP integration test harness for Express REST endpoints |

---

## 3. Directory & Conceptual Architecture

```
gibous/
├── server/                           # Backend Engine & Services (Node.js ESM)
│   ├── db/                           # Persistence layer
│   │   ├── index.ts                  # DatabasePool: PostgreSQL pool + in-memory mock
│   │   ├── migrate.ts                # Migration execution runner script
│   │   ├── schema.sql                # Production DDL schema
│   │   └── migrations/
│   │       └── 001_real_currency.sql # Production numeric precision & settlements migration
│   ├── engines/                      # Server-Authoritative Game Rule Engines
│   │   ├── IServerGameEngine.ts      # Common interface for game engine instances
│   │   ├── SnakeLadderEngine.ts      # Authoritative 10x10 Snake & Ladder engine
│   │   ├── Connect4Engine.ts         # Authoritative 7x6 Connect 4 gravity engine
│   │   └── RPSEngine.ts              # Authoritative Rock Paper Scissors engine
│   ├── auth.ts                       # Telegram HMAC-SHA256 initData cryptographic validator
│   ├── bragCardRenderer.ts           # Sharp SVG -> JPEG visual card rendering engine
│   ├── bragShareToken.ts             # Signed URL token generation and validation for brag cards
│   ├── bragStats.ts                  # 7-day PnL, win rate, and streak calculation helpers
│   ├── connectionManager.ts          # Connection tracking, sliding-window rate limiters, stale reaper
│   ├── economy.ts                    # Pure financial calculation engine (90/10 win, 95% draw refund)
│   ├── matchmaking.ts                # FIFO duel matchmaking queue by game type & stake
│   ├── roomManager.ts                # Room lifecycle, state versioning, reconnect/forfeit timers
│   ├── sessionManager.ts             # Authenticated WebSocket session store
│   ├── storage.ts                    # High-level business storage layer (Users, Deposits, Settlements)
│   ├── telegramBrag.ts               # Telegram Bot API client for savePreparedInlineMessage
│   ├── tonVerifier.ts                # Background TON indexer poller for on-chain deposit validation
│   └── server.ts                     # Main backend server entry point (Express + WebSocketServer)
│
├── shared/                           # Zero-Dependency Shared Contract Boundary
│   ├── constants/
│   │   ├── board.ts                  # Canonical snake/ladder coordinates & lookup maps
│   │   └── economics.ts              # Fee constants (ARENA_FEE=10%, DRAW_REFUND=95%), pot formulas
│   ├── schemas/
│   │   └── protocol.ts               # Zod validation schemas for all client/server messages
│   ├── types/
│   │   ├── errors.ts                 # Standardized ErrorCode enums and friendly user copy
│   │   ├── game.ts                   # Universal primitives: GameType, PlayerRole, MatchWinner, RPSChoice
│   │   ├── gameConfig.ts             # Metadata descriptor configurations for game types
│   │   ├── protocol.ts               # Inferred TypeScript types from Zod protocol schemas
│   │   └── snapshot.ts               # Authoritative snapshot models for UI reconciliation
│   └── index.ts                      # Barrel export for shared package
│
├── src/                              # Frontend Application (React 18 + Zustand + Tailwind)
│   ├── components/                   # UI Components
│   │   ├── bank/                     # Vault, TON Connect wallet connect, deposit/withdraw UI
│   │   ├── connect4/                 # Connect 4 board, discs, drop slots, winning line animations
│   │   ├── duel/                     # Match shell, header, reaction decks, forfeit modal, VS intro
│   │   ├── game/                     # Snake & Ladder board, 3D dice tumbler, pawns, overlays
│   │   │   └── dice/                 # 3D isometric dice faces, pips, and geometry constants
│   │   ├── gameover/                 # Post-match receipt, confetti celebration, match analytics
│   │   ├── home/                     # Hero banner, user header, arena game cards, hub navigation
│   │   ├── icons/                    # Custom SVG vector icons (GibousMoon, Gram, Snakes, Ladders, etc.)
│   │   ├── layout/                   # Bottom navigation bar (Hub, Arena, Standings, Profile, Vault)
│   │   ├── leaderboard/              # All-time podium and global ranks view
│   │   ├── lobby/                    # Create duel, stake selector, live open rooms browser
│   │   ├── profile/                  # Boast cards, Telegram image share triggers, trophy cabinet
│   │   ├── rps/                      # RPS clash stage, choice commit cards, countdown animations
│   │   └── ui/                       # Avatar, ConnectionBanner, GramIcon, SketchButton, Toast
│   ├── config/                       # Client configuration (Brand copy, palette, board math)
│   ├── hooks/                        # Custom React hooks (`useTelegram`, `useToast`)
│   ├── services/                     # Singleton client transport services (`multiplayerService`, brag)
│   ├── state/                        # Zustand stores (`useAuthStore`, `useRoomStore`, `useGameStore`, etc.)
│   │   └── eventRouter.ts            # WebSocket message dispatcher to Zustand stores
│   ├── utils/                        # Utility functions (`tonUnits` nanogram conversions, safe area)
│   ├── App.tsx                       # Root view orchestrator and screen router
│   ├── main.tsx                      # Application DOM bootstrap with TonConnectUIProvider
│   └── index.css                     # Tailwind setup, custom fonts, sketch-brutalist styling
│
├── tests/                            # Comprehensive Test Suite (Vitest + Playwright)
│   ├── component/                    # React Testing Library unit tests for UI screens
│   ├── contract/                     # Zod protocol schema contract validation tests
│   ├── e2e/                          # Playwright end-to-end multi-client browser tests
│   ├── integration/                  # WebSocket lifecycle, REST API, settlement race tests
│   ├── property/                     # fast-check property-based invariant test suites
│   ├── security/                     # Security regression matrix (VULN-01 through VULN-08)
│   ├── setup/                        # Test helpers, mock WebSocket factories, DOM setup
│   └── unit/                         # Unit tests for game engines, storage, auth, brag renderer
│
├── public/                           # Static assets, tonconnect-manifest.json, logos
├── vite.config.ts                    # Vite client build configuration & reverse proxy routes
├── tsconfig.json                     # Client TypeScript compiler configuration
├── server/tsconfig.server.json       # Server TypeScript compiler configuration
└── package.json                      # Project metadata, scripts, and dependencies
```

---

## 4. Backend Deep Dive

### 4.1 Server Initialization Flow (`server/server.ts`)
The server initializes through a deterministic sequential lifecycle:

```
[1. Process Handlers] -> Register uncaughtException & unhandledRejection
[2. Environment & Config] -> Load dotenv; configure PORT (3001), CORS_ORIGIN
[3. Service Instantiation] -> RoomManager, StorageService, DepositVerificationService, TelegramAuth, MatchmakingQueue
[4. Matchmaking Hook] -> Register auto-room creation & pairing callback
[5. Express Middleware] -> cors(), express.json()
[6. Express HTTP Routes] -> Mount /api/health, /api/rooms, /api/leaderboard, /api/telegram/brag/*, etc.
[7. HTTP & WS Server] -> createServer(app) & new WebSocketServer({ server, path: '/ws' })
[8. Background Workers] -> depositVerificationService.start() (if not in test mode)
[9. Production Gate] -> Verify DATABASE_URL, TON_* env vars; refuse unsafe startup
[10. Listener Start] -> server.listen(PORT)
```

1. **Safety Assertions on Production Startup (`server/server.ts:790-802`):**
   When `NODE_ENV === 'production'`, the server verifies critical variables:
   ```typescript
   const missingProductionConfig = [
     ['DATABASE_URL', process.env.DATABASE_URL],
     ['TON_ASSET_MODE=native_ton', process.env.TON_ASSET_MODE === 'native_ton' ? 'configured' : ''],
     ['TON_NETWORK', process.env.TON_NETWORK],
     ['TON_DEPOSIT_ADDRESS', process.env.TON_DEPOSIT_ADDRESS],
     ['TONCENTER_API_URL', process.env.TONCENTER_API_URL],
   ].filter(([, value]) => !value).map(([name]) => name);
   if (process.env.ALLOW_UNSIGNED_AUTH === 'true') missingProductionConfig.push('ALLOW_UNSIGNED_AUTH=false');
   if (missingProductionConfig.length > 0) {
     throw new Error(`Refusing to start production server with missing/unsafe configuration: ${missingProductionConfig.join(', ')}`);
   }
   ```

2. **Connection Management & Rate Limiting (`server/connectionManager.ts`):**
   * Employs a **dual-tier sliding window rate limiter**:
     * **Transport Layer:** Maximum 30 messages/second per client socket (`MAX_TRANSPORT_MSGS_PER_SEC`). Exceeding returns `RATE_LIMIT_EXCEEDED`.
     * **Gameplay Action Layer:** Maximum 5 move actions/second per client socket (`MAX_GAME_ACTIONS_PER_SEC`). Exceeding returns `ACTION_RATE_LIMITED`.
   * **Stale Connection Reaper:** Sweeps connections every 15 seconds. Terminating sockets inactive for >60 seconds (`STALE_CONNECTION_TIMEOUT_MS`).
   * **Identity Collision Resolution:** When a Telegram ID opens a new socket connection, any existing active socket for that ID is sent close code `4001` ("Replaced by new connection") to prevent split-brain state.

3. **Session Authentication & Identity Binding (`server/sessionManager.ts`, `server/auth.ts`):**
   * Telegram `initData` is validated using standard HMAC-SHA256:
     * Secret key = `HMAC_SHA256("WebAppData", botToken)`.
     * Verified signature = `HMAC_SHA256(dataCheckString, secretKey)`.
   * Once validated, the WebSocket is registered in `SessionManager` with `{ telegramId, name, avatarUrl, isAuthenticated: true }`.
   * **Security Rule:** Subsequent client messages (`CREATE_ROOM`, `JOIN_ROOM`, `SUBMIT_DEPOSIT`, gameplay moves) are strictly checked against `sessionManager.getSession(ws)`. Any attempt to spoof another Telegram ID in the payload is rejected with `UNAUTHORIZED`.

4. **Room Lifecycle & Versioning (`server/roomManager.ts`):**
   * Every room contains a monotonically increasing `version: number`.
   * Whenever room state changes (player joins, rolls dice, drops disc, resolves clash, forfeits, or rematches), `version` is incremented.
   * **Action Idempotency Cache:** Rooms retain an `actionCache: Map<string, GameActionResult>` keyed by `requestId` (capped at 50 entries). Repeated client frames with the same `requestId` return the cached execution result without executing duplicate settlements.
   * **Disconnect & Forfeit Mechanism:**
     * If a player disconnects during an active duel (`status === 'playing'`), `roomManager.handleDisconnect(tgId)` starts a 45-second forfeit timer (`DISCONNECT_FORFEIT_TIMEOUT_MS = 45000`) and broadcasts `PLAYER_DISCONNECTED { timeoutMs: 45000 }`.
     * If the player reconnects within 45s, the timer is cleared and `PLAYER_RECONNECTED` is broadcast.
     * If the timer expires, `handleForfeitTimeout()` is triggered: the match ends with `winner = opponentRole`, the opponent receives 90% of the pot via `storage.finalizeWinMatch()`, and `GAME_OVER { isForfeit: true }` is broadcast.

5. **Authoritative Game Engines (`server/engines/`):**
   All engines implement `IServerGameEngine` (`getState()`, `getActivePlayer()`, `isGameOver()`, `getWinner()`, `handleAction()`, `reset()`):
   * **`ServerSnakeLadderEngine`:**
     * Tracks `p1Position` and `p2Position` (starting at 1).
     * Server generates random dice value `Math.floor(Math.random() * 6) + 1`.
     * Calculates bounce-back if `position + roll > 100` (`newPos = 100 - (newPos - 100)`).
     * Checks `LADDERS_MAP` and `SNAKES_MAP`. First to land on 100 wins.
   * **`ServerConnect4Engine`:**
     * Maintains a 6×7 matrix `board: (PlayerRole | null)[][]`.
     * Computes lowest empty row (gravity drop).
     * Checks 4-in-a-row in horizontal, vertical, and two diagonal directions.
     * Evaluates draw if top row is full.
   * **`ServerRPSEngine`:**
     * Maintains secret internal map `secretChoices: { p1: null, p2: null }`.
     * When player 1 chooses, returns `RPS_CHOICE_COMMITTED` (hiding choice from player 2).
     * When both choose, evaluates round winner, updates `p1Score` / `p2Score`, and returns `RPS_ROUND_RESOLVED` containing both revealed choices. First to reach `maxPoints` (default 3) wins match.

---

## 5. HTTP / REST API Communication

The Express backend provides REST endpoints primarily for telemetry, public queries, Telegram bot integrations, and brag image rendering.

### 5.1 Endpoint Inventory Table

| Method | Endpoint | Frontend Caller / Consumer | Backend Handler (`server/server.ts`) | Auth Requirement | Request Payload | Response Payload | Description & Traced Operation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`GET`** | `/api/health` | Monitoring / Health checks | `app.get('/api/health')` | None | None | `{ status: 'ok', timestamp: number }` | Liveness check |
| **`GET`** | `/api/rooms` | `LobbyScreen.tsx` polling | `app.get('/api/rooms')` | None | None | `{ rooms: OpenRoomSummary[] }` | Queries active rooms in `'waiting'` status from `RoomManager` |
| **`GET`** | `/api/leaderboard` | `LeaderboardScreen.tsx` | `app.get('/api/leaderboard')` | None | None | `{ period: 'alltime', players: RankedPlayer[] }` | Queries top users from database sorted by `wins DESC, total_winnings DESC` |
| **`POST`** | `/api/rooms` | Integration test suite (`supertest`) | `app.post('/api/rooms')` | Blocked in Prod (`NODE_ENV === 'production'`) | `{ roomCode?, gameType, stake, telegramId, playerName, avatarUrl }` | `{ success: boolean, room: { code, status } }` | Creates room via HTTP. In production returns 401 requiring WebSocket session |
| **`GET`** | `/api/user/:telegramId` | Dev tools / Tests | `app.get('/api/user/:telegramId')` | Blocked in Prod | URL parameter `telegramId` | `{ user: UserEntity }` | Retrieves user account entity |
| **`POST`** | `/api/telegram/brag/prepare` | `telegramBragService.ts: requestPreparedBragShare()` | `app.post('/api/telegram/brag/prepare')` | HMAC Telegram `initData` | `{ initData: string }` | `{ success: true, preparedMessageId: string, expirationDate, imageUrl }` | Verifies initData, generates signed brag token, calls Telegram API `savePreparedInlineMessage` |
| **`GET`** | `/api/telegram/brag/image/:token.jpg` | Telegram chat client / OpenGraph preview | `app.get('/api/telegram/brag/image/:token.jpg')` | HMAC Signed URL Token | URL param `token` | Binary `image/jpeg` buffer | Validates token signature & expiry, fetches 7-day stats, renders SVG, converts to JPEG via Sharp |
| **`POST`** | `/api/admin/credit` | Admin / Testing tools | `app.post('/api/admin/credit')` | None (Dev only) | `{ telegramId, amount, description }` | `{ success: true, user, snapshot }` | Credits user balance and notifies active sockets via `ACCOUNT_UPDATED` |

---

## 6. WebSocket / Real-Time Communication

The WebSocket interface at `/ws` is the primary interactive conduit between client and server.

### 6.1 WebSocket Message Flow Table

| Direction | Message Type (`type`) | Sender | Receiver | Payload Structure | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **C → S** | `PING` | Client (`MultiplayerService`) | Server | `{ timestamp: number }` | Heartbeat probe (every 15s) |
| **S → C** | `PONG` | Server | Client | `{ timestamp: number, clientTimestamp: number }` | Heartbeat acknowledgement |
| **C → S** | `AUTH` | Client (`eventRouter.ts`) | Server | `{ telegramId: number, playerName: string, avatarUrl?, initData? }` | Authenticates socket connection |
| **S → C** | `AUTH_OK` | Server | Client | `{ telegramId: number, user: UserEntity }` | Confirms authentication & sends initial profile |
| **C → S** | `CREATE_ROOM` | Client (`LobbyScreen`) | Server | `{ roomCode?, gameType, stake, telegramId?, playerName?, avatarUrl? }` | Requests creation of a new duel room |
| **S → C** | `ROOM_CREATED` | Server | Creator Client | `RoomStatePayload` | Confirms room creation with initial snapshot |
| **C → S** | `JOIN_ROOM` | Client (`LobbyScreen`) | Server | `{ roomCode: string, telegramId?, playerName?, avatarUrl? }` | Joins an existing open room as Player 2 |
| **S → C** | `GAME_START` | Server | P1 & P2 Clients | `RoomStatePayload` | Notifies both players that match has started |
| **C → S** | `SYNC_ROOM` | Client (Reconnect handler) | Server | `{ roomCode: string }` | Requests full authoritative state snapshot |
| **S → C** | `ROOM_STATE` | Server | Client | `RoomStatePayload` | Authoritative snapshot of room & game engine state |
| **C → S** | `CANCEL_ROOM` | Client (`WaitingRoomScreen`) | Server | `{ roomCode: string }` | Cancels waiting room and refunds host escrow |
| **S → C** | `ROOM_CANCELLED` | Server | Client | `{ roomCode: string }` | Confirms room was cancelled & removed |
| **C → S** | `LEAVE_ROOM` | Client (`DuelShell`) | Server | `{ roomCode: string }` | Surrenders active match (forfeits stake to opponent) |
| **C → S** | `ROLL_DICE` | Client (`SnakeLadderArena`) | Server | `{ roomCode: string }` | Requests server dice roll in Snakes & Ladders |
| **S → C** | `DICE_ROLLED` | Server | P1 & P2 Clients | `DiceRolledPayload` (value, from, to, snakeOrLadder, nextPlayer, version) | Authoritative dice roll outcome |
| **C → S** | `DROP_DISC` | Client (`Connect4Arena`) | Server | `{ roomCode: string, column: number }` | Drops disc into specified column |
| **S → C** | `DISC_DROPPED` | Server | P1 & P2 Clients | `DiscDroppedPayload` (row, col, board, nextPlayer, winningCells, version) | Authoritative disc placement outcome |
| **C → S** | `CHOOSE_RPS` | Client (`RPSArena`) | Server | `{ roomCode: string, choice: 'rock' \| 'paper' \| 'scissors' }` | Submits secret RPS weapon choice |
| **S → C** | `RPS_CHOICE_COMMITTED`| Server | P1 & P2 Clients | `{ roomCode: string, player: PlayerRole, round: number, version: number }` | Confirms a player locked in their move |
| **S → C** | `RPS_ROUND_RESOLVED` | Server | P1 & P2 Clients | `RPSRoundResolvedPayload` (p1Choice, p2Choice, roundWinner, p1Score, p2Score) | Reveals clash result after both chose |
| **S → C** | `GAME_OVER` | Server | P1 & P2 Clients | `GameOverPayload` (winner, potAmount, winnerPayout, loserPayout, arenaFee, xp, isForfeit) | Finalizes match and distributes pot |
| **C → S** | `REMATCH_REQUEST` | Client (`GameOverScreen`) | Server | `{ roomCode: string }` | Votes for a rematch |
| **C → S** | `EMOTE` | Client (`DuelShell`) | Server | `{ roomCode: string, emoji: string }` | Sends floating reaction emoji |
| **S → C** | `EMOTE` | Server | Opponent Client | `{ player: PlayerRole, emoji: string }` | Renders opponent's reaction emoji |
| **C → S** | `SUBMIT_DEPOSIT` | Client (`BankScreen`) | Server | `{ walletAddress, depositAddress, amountNano, boc, network }` | Submits signed TON Connect transaction BoC |
| **S → C** | `TRANSACTION_PENDING`| Server | Client | `PendingTransaction` | Confirms deposit intent logged as pending |
| **S → C** | `ACCOUNT_UPDATED` | Server | Client | `{ user: UserEntity }` | Pushes updated balance & transaction history |
| **S → C** | `PLAYER_DISCONNECTED`| Server | Opponent Client | `{ player: PlayerRole, version: number, timeoutMs?: number }` | Alerts opponent of peer disconnect |
| **S → C** | `PLAYER_RECONNECTED` | Server | Opponent Client | `{ player: PlayerRole, version: number }` | Alerts opponent that peer returned |
| **S → C** | `ERROR` | Server | Client | `{ code: string, message: string, requestId?: string }` | Protocol / validation / authorization error |

---

## 7. Frontend Architecture & State Management

### 7.1 Client Bootstrap & Event Pipeline (`src/main.tsx`, `src/App.tsx`, `src/state/eventRouter.ts`)

```
Browser Loads TMA Index
         │
         ├── 1. `initEventRouter()` (Binds WebSocket callbacks to Zustand stores)
         ├── 2. `TonConnectUIProvider` mounts with `manifestUrl`
         └── 3. `ReactDOM.createRoot().render(<App />)`
                    │
                    ├── `useTelegram()` hooks into `window.Telegram.WebApp`
                    ├── `subscribeTelegramSafeArea()` injects CSS safe-area variables
                    ├── `multiplayerService.connect()` establishes WebSocket connection
                    ├── Once `CONNECTED`: triggers `authenticate(tgUser)` and `fetchRooms()`
                    └── Server replies with `AUTH_OK` -> stores user balance & profile in `useAuthStore`
```

### 7.2 Zustand Store Architecture
The frontend state is partitioned into five specialized Zustand stores (`src/state/`):

```
                                  ┌───────────────────────┐
                                  │   MultiplayerService  │
                                  │   (WebSocket Client)  │
                                  └──────────┬────────────┘
                                             │ (Typed Events)
                                             ▼
                                  ┌───────────────────────┐
                                  │      eventRouter      │
                                  └──────────┬────────────┘
         ┌───────────────────┬───────────────┼───────────────┬───────────────────┐
         ▼                   ▼               ▼               ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────┐ ┌─────────────────┐ ┌─────────────────┐
│  useAuthStore   │ │useConnectionStore││useUIStore│ │  useRoomStore   │ │  useGameStore   │
│                 │ │                 │ │         │ │                 │ │                 │
│ • user profile  │ │• connState      │ │• screen │ │ • currentRoom   │ │ • gameState     │
│ • balance_gram  │ │• opponentStatus │ │• game   │ │ • openRooms     │ │ • activePlayer  │
│ • transactions  │ │• error toasts   │ │• emotes │ │ • myRole        │ │ • turnPhase     │
│ • pendingDeposits││• forfeitTimer   │ │         │ │ • roomVersion   │ │ • lastEvents    │
└─────────────────┘ └─────────────────┘ └─────────┘ └─────────────────┘ └─────────────────┘
```

1. **`useAuthStore` (`src/state/useAuthStore.ts`):**
   * Manages authenticated user entity (`balance_gram`, `wins`, `level`, `xp`, `transactions`).
   * Provides atomic selector `selectBalance = (s) => Number(s.user?.balance_gram || 0)`.
   * Supports optimistic transaction insertion on `SUBMIT_DEPOSIT`.
2. **`useConnectionStore` (`src/state/useConnectionStore.ts`):**
   * Manages connection status (`DISCONNECTED`, `CONNECTING`, `CONNECTED`, `RECONNECTING`).
   * Tracks opponent disconnect countdown timer (`opponentDisconnected`, `disconnectTimeoutMs`).
   * Holds transient error notifications.
3. **`useRoomStore` (`src/state/useRoomStore.ts`):**
   * Holds `currentRoom: RoomStatePayload | null`, `roomVersion: number`, and `openRooms: []`.
   * Automatically resolves client role (`myRole: 'p1' | 'p2' | null`) by matching `sessionStorage` or Telegram ID against room participants.
   * **Version Protection:** Updates are applied only if incoming `version >= roomVersion`.
4. **`useGameStore` (`src/state/useGameStore.ts`):**
   * Stores game-specific engine state (`gameState`), `activePlayer`, `turnPhase`, `winner`.
   * Buffers recent events (`lastDiceEvent`, `lastDropEvent`, `lastRPSEvent`, `lastGameOverEvent`) to drive UI animations and sequencing.
5. **`useUIStore` (`src/state/useUIStore.ts`):**
   * Controls top-level screen routing (`currentScreen: 'home' | 'lobby' | 'waiting' | 'vs-intro' | 'game' | 'gameover'`).
   * Tracks `selectedGame` and floating reaction emoji queue.

---

## 8. Data Models & Schema Mappings

### 8.1 Data Model Transformation Matrix

```
[Database / PostgreSQL Entity]
         │ (Normalized DB Schema: NUMERIC(30,9), BIGINT, JSONB)
         ▼
[Storage Service UserEntity / RoomManager GameRoom]
         │ (Server Domain Objects: bigint -> number, BigInt nano -> string)
         ▼
[Zod Shared Contract Schemas: RoomStatePayload / ServerMessage]
         │ (Validated over WebSocket Wire Protocol)
         ▼
[Frontend Zustand Stores & NormalizedDuelState]
         │ (Client UI Projection Models)
         ▼
[React Arena Presentation Components]
```

### 8.2 Discrepancy & Consistency Analysis
1. **Financial Balance Storage:**
   * In PostgreSQL (`schema.sql`), `balance_gram` is defined as `NUMERIC(30,9)`.
   * In on-chain TON transactions (`tonVerifier.ts`), values are computed in nanograms (`BigInt(amount_nano)`).
   * In client Zustand state, `balance_gram` is formatted as a JavaScript floating point number (`Number(user.balance_gram)`).
   * *Risk:* Precision loss when performing stake math on large balances if not truncated properly. The backend strictly enforces `Number.isSafeInteger(stake)` between `MIN_STAKE` (10) and `MAX_STAKE` (10,000).
2. **Room Code Normalization:**
   * Server generates uppercase 6-character alphanumeric codes (`/^[A-Z0-9_-]{2,32}$/`).
   * Client enforces `.trim().toUpperCase()` on manual code input before sending `JOIN_ROOM`.

---

## 9. End-to-End Operational Data Flows

### 9.1 Flow 1: Application Startup & Authentication
```
1. Client boots in Telegram WebApp context -> window.Telegram.WebApp.ready()
2. Client WebSocket connects to ws://127.0.0.1:3001/ws
3. Client dispatches: AUTH { telegramId: 12345, initData: "query_id=...&hash=..." }
4. Server verifies HMAC-SHA256 signature against TELEGRAM_BOT_TOKEN
5. Server calls storage.getOrCreateUser(verifiedUser)
6. Server stores session in SessionManager & ConnectionManager
7. Server responds with: AUTH_OK { telegramId, user: { balance_gram: 5500, ... } }
8. Frontend eventRouter updates useAuthStore -> HomeScreen displays 5,500 GRAM balance
```

### 9.2 Flow 2: Duel Creation & Escrow Staking
```
1. User selects "Snakes & Ladders" with a 100 GRAM stake on LobbyScreen
2. User clicks "Confirm & Create"
3. Client sends: CREATE_ROOM { gameType: 'snake', stake: 100 }
4. Server checks authenticated session; verifies stake is integer between 10 and 10,000
5. Server reserves unique 6-character room code (e.g. "SNAK99")
6. Server executes atomic escrow debit: storage.debitStake(p1TgId, 100, "SNAK99")
   -> In PostgreSQL: UPDATE users SET balance_gram = balance_gram - 100 WHERE telegram_id = $1 AND balance_gram >= 100
   -> Inserts transaction record with type 'match_stake', amount: -100
7. Server instantiates ServerSnakeLadderEngine() and stores room in RoomManager
8. Server sends ROOM_CREATED payload to host; broadcasts ROOMS_LIST to all connected lobby clients
9. Host client transitions to WaitingRoomScreen
```

### 9.3 Flow 3: Duel Joining & Real-Time Match Execution
```
1. Challenger sees "SNAK99" in Open Rooms browser and clicks "Duel"
2. Client sends: JOIN_ROOM { roomCode: 'SNAK99' }
3. Server verifies session and atomic escrow debit: storage.debitStake(p2TgId, 100, "SNAK99")
4. Server marks room status = 'playing', potAmount = 200, version = 2
5. Server broadcasts GAME_START payload to both P1 and P2
6. Both clients receive GAME_START -> App.tsx transitions to VSIntroOverlay (3s countdown) -> DuelShell
7. Player 1 clicks "ROLL DICE" -> sends ROLL_DICE { roomCode: 'SNAK99' }
8. Server verifies action rate limit & checks room.engine.getActivePlayer() === 'p1'
9. ServerSnakeLadderEngine rolls random integer (e.g. 4), updates p1Position: 1 -> 5, switches turn to p2
10. Server broadcasts DICE_ROLLED { player: 'p1', value: 4, from: 1, to: 5, nextPlayer: 'p2', version: 3 }
11. Client receives DICE_ROLLED -> triggers 3D dice roll animation (750ms) -> step-by-step pawn hop (440ms) -> landing bounce
```

### 9.4 Flow 4: Match Victory & Financial Settlement
```
1. Player 1 lands on tile 100
2. ServerSnakeLadderEngine flags isGameOver = true, winner = 'p1'
3. Server executes storage.finalizeWinMatch("SNAK99", "snake", 100, p1TgId, p2TgId):
   -> Calculates Pot Breakdown: Total Pot = 200 GRAM
   -> Winner Payout (90%) = 180 GRAM
   -> Arena Fee (10%) = 20 GRAM
   -> PostgreSQL atomic transaction:
      * UPDATE users SET balance_gram = balance_gram + 180, wins = wins + 1, xp = xp + 150 WHERE telegram_id = p1TgId
      * UPDATE users SET losses = losses + 1, xp = xp + 30 WHERE telegram_id = p2TgId
      * INSERT INTO settlements (match_id, kind, calculation) VALUES ("SNAK99", "win", ...)
      * UPDATE treasury SET total_rake_collected = total_rake_collected + 20 WHERE id = 1
4. Server broadcasts GAME_OVER { winner: 'p1', potAmount: 200, winnerPayout: 180, arenaFee: 20, xpEarned: 150 }
5. Server pushes ACCOUNT_UPDATED to both players
6. Clients display 3.2s animation delay in active arena -> transition to GameOverScreen with confetti and prize receipt
```

### 9.5 Flow 5: On-Chain TON Deposit Verification Pipeline
```
1. User connects wallet via @tonconnect/ui-react in BankScreen
2. User enters 0.5 GRAM (500,000,000 nanograms) and confirms deposit
3. TonConnect UI prompts wallet signature; user signs native TON transfer to TON_DEPOSIT_ADDRESS
4. Wallet returns signed BoC (Bag of Cells)
5. Client sends over WebSocket: SUBMIT_DEPOSIT { walletAddress, depositAddress, amountNano: "500000000", boc, network: 'testnet' }
6. Server storage.recordPendingDeposit() logs deposit_intents row with status = 'pending'
7. Server responds: TRANSACTION_PENDING -> Client lists transaction as "Pending • awaiting server verification" (NO instant local balance credit)
8. Background DepositVerificationService (polling every 15s) queries Toncenter API getTransactions(walletAddress)
9. Indexer finds on-chain transaction matching expected amount & destination vault within time window
10. Server executes db.confirmDeposit(intentId, txHash):
    -> UPDATE deposit_intents SET status = 'confirmed', tx_hash = $1 WHERE id = intentId
    -> UPDATE users SET balance_gram = balance_gram + 0.5 WHERE telegram_id = intent.telegram_id
11. Server pushes ACCOUNT_UPDATED over WebSocket -> User's balance updates with zero manual refresh
```

---

## 10. Database Architecture & Persistence

### 10.1 Schema Definition (`server/db/schema.sql`)
The PostgreSQL database schema consists of six core tables:

1. **`users`**: Telegram user accounts, balances, PvP stats, streaks, levels, and XP.
2. **`matches`**: Historical duel matches, game types, stakes, pot amounts, participant IDs, and outcomes.
3. **`transactions`**: Double-entry ledger recording balance deltas (`match_stake`, `match_win`, `match_draw_refund`, `deposit`, `withdraw`).
4. **`deposit_intents`**: On-chain deposit verification tracking table keyed by unique `boc` and confirmed `tx_hash`.
5. **`settlements`**: Idempotent match settlement records ensuring matches can never be paid out twice.
6. **`treasury`**: Singleton platform accounting table tracking developer rake collected and total duel volume processed.

```
┌─────────────────────────────────┐           ┌─────────────────────────────────┐
│              users              │           │             matches             │
├─────────────────────────────────┤           ├─────────────────────────────────┤
│ id (PK): SERIAL                 │1         *│ id (PK): SERIAL                 │
│ telegram_id: BIGINT (UNIQUE)    ├───────────┤ code: VARCHAR(16) (UNIQUE)      │
│ username: VARCHAR(64)           │           │ game_type: VARCHAR(32)          │
│ first_name: VARCHAR(128)        │           │ stake_amount: BIGINT            │
│ balance_gram: NUMERIC(30,9)     │           │ pot_amount: BIGINT              │
│ total_winnings: NUMERIC(30,9)   │           │ dev_rake: BIGINT                │
│ total_volume: NUMERIC(30,9)     │           │ p1_id, p2_id, winner_id (FK)    │
│ wins, losses, draws: INTEGER    │           │ status: VARCHAR(32)             │
│ current_streak, best_streak     │           │ created_at, finished_at         │
│ level, xp, favorite_game        │           └─────────────────────────────────┘
└────────────────┬────────────────┘
                 │
                 │ 1
                 │
                 │ *
┌────────────────┴────────────────┐           ┌─────────────────────────────────┐
│          transactions           │           │         deposit_intents         │
├─────────────────────────────────┤           ├─────────────────────────────────┤
│ id (PK): SERIAL                 │           │ id (PK): UUID                   │
│ user_id (FK): INTEGER           │           │ telegram_id (FK): BIGINT        │
│ match_code: VARCHAR(32)         │           │ wallet_address: VARCHAR(128)    │
│ type: VARCHAR(32)               │           │ deposit_address: VARCHAR(128)   │
│ amount: NUMERIC(30,9)           │           │ amount_nano: NUMERIC(30,0)      │
│ fee: NUMERIC(30,9)              │           │ amount_gram: NUMERIC(30,9)      │
│ balance_after: NUMERIC(30,9)    │           │ boc: TEXT (UNIQUE)              │
│ tx_hash: VARCHAR(128)           │           │ status: VARCHAR(16) ('pending') │
│ created_at: TIMESTAMP           │           │ tx_hash: VARCHAR(128) (UNIQUE)  │
└─────────────────────────────────┘           └─────────────────────────────────┘
```

---

## 11. Media Processing & Dynamic Card Generation Pipeline

Gibous features a server-side media generation pipeline (`server/bragCardRenderer.ts`) that converts real gameplay ledger records into branded JPEG graphics:

```
1. User clicks "Share Daily Brag Card" on ProfileScreen
2. Frontend calls POST /api/telegram/brag/prepare with Telegram initData
3. Server validates user signature & calls storage.getDailyBragStats(telegramId, now)
4. Server computes 7-day daily PnL history, win rate, and streak metrics
5. Server creates signed HMAC token: createBragShareToken(telegramId, now)
   -> Payload: base64url({ telegramId, dateKey, expiresAt }) + '.' + HMAC_SHA256
6. Server constructs image URL: https://<PUBLIC_APP_URL>/api/telegram/brag/image/<token>.jpg
7. Server invokes Telegram Bot API: POST https://api.telegram.org/bot<TOKEN>/savePreparedInlineMessage
   -> Attaches inline button: "⚔️ Challenge me on Gibous" -> https://t.me/gibous_bot/app
8. When Telegram requests the image URL:
   -> Server validates token signature & expiration timestamp
   -> Builds SVG string (1080x1350) with dynamic 7-day PnL line chart, net profit, ROI, and streak
   -> Sharp rasterizes SVG -> JPEG (quality 90, 4:4:4 chroma subsampling) in ~400ms
```

---

## 12. Security Analysis

### 12.1 Security Controls Implemented
* **Cryptographic TMA Identity Verification (`server/auth.ts`):** Validates the Telegram HMAC-SHA256 signature using the bot token as root secret.
* **Session Ownership Binding:** Every WebSocket frame is mapped to the internal `AuthenticatedSession`. Players cannot act on rooms they are not part of, nor can they spoof opponent actions.
* **Anti-Inflation Escrow Debiting:** Stakes are debited into escrow at room creation and room joining *before* any gameplay engine starts. A room cannot be created or joined if balance is insufficient.
* **Settlement Idempotency:** The database `settlements` table uses `match_id` as primary key with `ON CONFLICT DO NOTHING`. Payouts can never be applied twice even under high-frequency retry loops.
* **TON Deposit Verification Boundary:** Client-supplied BoCs are treated purely as transaction intents; balances are credited only after the backend indexer verifies the on-chain transaction hash on the TON network.
* **Dual-Tier Transport & Action Rate Limiting:** Prevents socket flooding and fast-click automation attacks.

### 12.2 Security Risks & Landmines
* **Insecure Development Fallback (`server/storage.ts:56-72`):**
  A hardcoded username check grants arbitrary users with names containing `"sten"`, `"say what"`, or `"saywhat"` an automatic balance reset to 5,500 GRAM if `NODE_ENV === 'development'`.
  *Impact:* If `NODE_ENV` is ever misconfigured in production or unset, any user can rename their Telegram account to obtain unlimited free credits.
* **Unsigned Auth Fallback (`server/auth.ts:77-85`):**
  If `ALLOW_UNSIGNED_AUTH === 'true'`, unauthenticated mock Telegram users are permitted.
  *Mitigation:* The production start gate in `server/server.ts:798` strictly throws an exception if `ALLOW_UNSIGNED_AUTH === 'true'` in production.

---

## 13. Comprehensive Codebase File Map

| File Path | Layer | Responsibility | Major Dependencies | Communicates With |
| :--- | :--- | :--- | :--- | :--- |
| **`server/server.ts`** | Backend Entry | Express & WebSocket server bootstrap, route registration, wire message dispatch | `express`, `ws`, `zod`, `RoomManager`, `StorageService` | Frontend clients, background services |
| **`server/auth.ts`** | Backend Auth | HMAC-SHA256 Telegram Mini App `initData` signature validation | `node:crypto` | `server/server.ts` |
| **`server/connectionManager.ts`**| Backend Transport | Socket connection registry, rate limiters, stale connection sweeper | `ws`, `crypto` | `server/server.ts`, `server/roomManager.ts` |
| **`server/sessionManager.ts`** | Backend State | In-memory authenticated WebSocket session store | `ws` | `server/server.ts` |
| **`server/roomManager.ts`** | Backend Logic | Room lifecycle, state versioning, forfeit timers, rematch logic | `IServerGameEngine`, `StorageService`, `ConnectionManager` | `server/server.ts`, Game Engines |
| **`server/storage.ts`** | Backend Data | High-level ledger operations, balance credits/debits, settlements | `DatabasePool`, `EconomyEngine`, `bragStats` | `server/server.ts`, `server/roomManager.ts` |
| **`server/economy.ts`** | Backend Math | Pot division (90/10 win, 95% draw refund) & XP calculation formulas | `shared/constants/economics` | `server/storage.ts` |
| **`server/matchmaking.ts`** | Backend Logic | FIFO matchmaking queue matching game type & stake | `ws` | `server/server.ts` |
| **`server/tonVerifier.ts`** | Backend Blockchain | Polls Toncenter API to verify native TON deposit transactions | `@ton/core`, `@ton/ton`, `StorageService` | `server/storage.ts`, Toncenter API |
| **`server/bragCardRenderer.ts`**| Backend Media | Generates 1080x1350 branded JPEG boast cards from SVG templates | `sharp`, `bragStats` | `server/server.ts` |
| **`server/bragShareToken.ts`** | Backend Security | Signed HMAC URL token generation/verification for boast images | `node:crypto`, `bragStats` | `server/server.ts` |
| **`server/bragStats.ts`** | Backend Analytics | Aggregates 7-day daily match history into PnL, win rate, and streak stats | None | `server/storage.ts`, `server/bragCardRenderer.ts` |
| **`server/engines/SnakeLadderEngine.ts`** | Game Engine | Authoritative Snakes & Ladders game rule engine | `shared/constants/board` | `server/roomManager.ts` |
| **`server/engines/Connect4Engine.ts`** | Game Engine | Authoritative Connect 4 grid & gravity win engine | `shared/types` | `server/roomManager.ts` |
| **`server/engines/RPSEngine.ts`** | Game Engine | Authoritative Rock Paper Scissors simultaneous clash engine | `shared/types` | `server/roomManager.ts` |
| **`server/db/index.ts`** | Database Layer | PostgreSQL client pool manager with in-memory test fallback | `pg` | `server/storage.ts` |
| **`server/db/schema.sql`** | Database DDL | PostgreSQL production table definitions, constraints, indexes | None | PostgreSQL |
| **`shared/schemas/protocol.ts`** | Shared Contract | Zod schemas validating client/server WebSocket and REST payloads | `zod` | Server & Client |
| **`shared/constants/board.ts`** | Shared Data | Canonical coordinates for snakes and ladders | None | Server Engines, Client Board |
| **`shared/constants/economics.ts`**| Shared Data | Fee percentages (10% fee, 95% draw refund) and pot math helpers | None | Server Economy, Client UI |
| **`src/main.tsx`** | Frontend Bootstrap | Application root mount with TonConnect UI provider & event router init | `react`, `react-dom`, `@tonconnect/ui-react` | Browser DOM |
| **`src/App.tsx`** | Frontend Router | Top-level screen coordinator, toast manager, connection banner | `useTelegram`, Zustand stores | Screen components |
| **`src/services/multiplayerService.ts`** | Client Transport | WebSocket client with reconnect backoff, ping/pong, and message dispatch | `ws` (browser WebSocket) | `src/state/eventRouter.ts` |
| **`src/state/eventRouter.ts`** | Client Dispatcher | Routes inbound WebSocket messages directly into Zustand stores | `multiplayerService`, Zustand stores | Zustand stores |
| **`src/state/useAuthStore.ts`** | Client State | Stores user account profile, balance, transactions, and deposit status | `zustand` | React screens |
| **`src/state/useRoomStore.ts`** | Client State | Stores current duel room state, myRole, room version, open rooms | `zustand` | React screens |
| **`src/state/useGameStore.ts`** | Client State | Stores game engine state and buffers animation event payloads | `zustand` | Arena screens |
| **`src/state/useConnectionStore.ts`**| Client State | Stores connection status, opponent disconnect countdown, errors | `zustand` | React screens |
| **`src/state/useUIStore.ts`** | Client State | Stores active screen, selected game, floating reaction emotes | `zustand` | React screens |
| **`src/hooks/useTelegram.ts`** | Client Hook | Telegram WebApp SDK wrapper (initData, user, safe areas, sharing) | `Telegram.WebApp` | React components |
| **`src/components/home/HomeScreen.tsx`** | UI Screen | Hub view with user balance header, hero banner, game cards, tabs | React components | `src/App.tsx` |
| **`src/components/lobby/LobbyScreen.tsx`** | UI Screen | Duel creation, stake selector, and live open rooms browser | React components | `src/App.tsx` |
| **`src/components/lobby/WaitingRoomScreen.tsx`** | UI Screen | Host waiting room with invite link generation and cancel CTA | React components | `src/App.tsx` |
| **`src/components/duel/DuelShell.tsx`** | UI Container | Duel arena shell with opponent status, header, reactions, forfeit modal | React components | Arena components |
| **`src/components/game/SnakeLadderArena.tsx`** | UI Arena | 10x10 Snake & Ladder board, 3D dice tumbler, animated pawns | React components | `src/components/duel/DuelShell.tsx` |
| **`src/components/connect4/Connect4Arena.tsx`** | UI Arena | 7x6 Connect 4 interactive grid and winning line display | React components | `src/components/duel/DuelShell.tsx` |
| **`src/components/rps/RPSArena.tsx`** | UI Arena | Rock Paper Scissors weapon selection and clash animation stage | React components | `src/components/duel/DuelShell.tsx` |
| **`src/components/gameover/GameOverScreen.tsx`**| UI Screen | Match victory celebration, prize receipt, and rematch trigger | `canvas-confetti` | `src/App.tsx` |
| **`src/components/bank/BankScreen.tsx`** | UI Screen | TON Connect wallet connection, deposit input, transaction history | `@tonconnect/ui-react` | `src/components/home/HomeScreen.tsx` |
| **`src/components/leaderboard/LeaderboardScreen.tsx`** | UI Screen | Global ranks podium and top player standings table | REST `/api/leaderboard` | `src/components/home/HomeScreen.tsx` |
| **`src/components/profile/ProfileScreen.tsx`** | UI Screen | Player profile, stats breakdown, and brag card share buttons | `src/hooks/useTelegram` | `src/components/home/HomeScreen.tsx` |

---

## 14. Architectural Problems & Technical Debt Inventory

### Critical Severity

#### 1. Syntax / JSX Tag Nesting Corruption in `LobbyScreen.tsx`
* **Location:** `src/components/lobby/LobbyScreen.tsx` (lines 305–326 and lines 478–510)
* **Problem:** Duplicated `<header>` and `<main>` tags alongside an unclosed `<span>` before inner `<div>` tags cause JSX transformation errors during component testing in Vitest (`tests/component/lobby/LobbyScreen.test.tsx`).
* **Impact:** Prevents component test runner from compiling `LobbyScreen.test.tsx`.
* **Current Behavior:** Component test fails with esbuild syntax errors.
* **Remediation:** Remove duplicated JSX header/main blocks and correctly balance opening/closing JSX tags.

#### 2. VIP Hardcoded Developer Backdoor in Storage Service
* **Location:** `server/storage.ts:56-72`
* **Problem:** The method `getOrCreateUser` checks if the username or first name contains `"sten"`, `"say what"`, or `"saywhat"`. If matched and `NODE_ENV === 'development'`, it forces the account balance to 5,500 GRAM.
* **Impact:** High security vulnerability if environment variable `NODE_ENV` is ever unset or defaults to non-production on a public staging/production environment.
* **Remediation:** Eliminate all hardcoded username checks. Rely solely on explicit database migrations and authenticated admin API endpoints.

---

### High Severity

#### 3. Single-Node In-Memory State in Multi-Process / Scaled Deployment
* **Location:** `server/roomManager.ts`, `server/connectionManager.ts`, `server/matchmaking.ts`
* **Problem:** Active rooms, matchmaking queues, and active WebSocket connections are stored in Node.js heap memory (`Map<string, GameRoom>`, `Map<number, PlayerConnection>`).
* **Impact:** The backend cannot be scaled horizontally across multiple instances (e.g. via PM2 clustering, Docker containers, Kubernetes, or serverless instances) without losing room state and disconnecting paired players.
* **Remediation:** Introduce a Redis pub/sub layer or socket.io Redis adapter for distributed connection state, room events, and distributed locks.

#### 4. Fallback In-Memory Storage Discrepancy with PostgreSQL
* **Location:** `server/db/index.ts`
* **Problem:** When `DATABASE_URL` is omitted, the `DatabasePool` implements an ad-hoc in-memory SQL simulator that only matches a small subset of queries (`select * from users where telegram_id = $1`). Complex queries fall back to empty arrays without throwing errors.
* **Impact:** Integration tests running against the in-memory store do not exercise real SQL constraints, transactions, or foreign keys.
* **Remediation:** Use an embedded SQLite or testcontainers PostgreSQL instance for local development and test runs.

---

### Medium Severity

#### 5. Ephemeral Matchmaking Queue Without Latency Relaxation
* **Location:** `server/matchmaking.ts`
* **Problem:** `MatchmakingQueue.enqueue()` searches only for an exact match on `gameType` and `stake`. There is no bracket relaxation, timeout bot filling, or matchmaking latency expansion.
* **Impact:** If player liquidity is low, players will sit in queue indefinitely.
* **Remediation:** Add matchmaking expansion timers (e.g. match within ±20% stake bracket after 10 seconds).

#### 6. Polling-Based Open Rooms List in `LobbyScreen.tsx`
* **Location:** `src/components/lobby/LobbyScreen.tsx:119`
* **Problem:** `LobbyScreen` sets a `setInterval` polling `GET /api/rooms` every 2,500ms in addition to listening for WebSocket `ROOMS_LIST` broadcasts.
* **Impact:** Generates redundant HTTP load on the server.
* **Remediation:** Remove HTTP polling and rely exclusively on WebSocket push notifications.

---

### Low Severity

#### 7. Deprecated Props in Screen Components
* **Location:** `src/components/bank/BankScreen.tsx:10`, `src/components/lobby/LobbyScreen.tsx:43-50`
* **Problem:** Legacy props such as `onDeposit(amount)` and pass-and-play settings props remain in component TypeScript interfaces marked as `@deprecated`.
* **Impact:** Clutters component prop signatures.
* **Remediation:** Clean up legacy prop interfaces across screen components.

---

## 15. Source of Truth Matrix

| State Concept | Authoritative Source of Truth | Mirror / Derived Copies | Persistence | Synchronization Mechanism |
| :--- | :--- | :--- | :--- | :--- |
| **User Identity & Auth** | Server `TelegramAuth` (HMAC verify) | `sessionManager`, client `useAuthStore` | Database `users` table | Sent via `AUTH_OK` on WebSocket connect |
| **User Balance (GRAM)** | Server Database `users.balance_gram` | Client `useAuthStore` (via `selectBalance`) | PostgreSQL / Disk | Server debits/credits -> pushed via `ACCOUNT_UPDATED` |
| **Room Lifecycle & Status**| Server `RoomManager` (`GameRoom.status`) | Client `useRoomStore.currentRoom.status` | In-memory (`matches` table on finish) | Pushed via `ROOM_CREATED`, `GAME_START`, `GAME_OVER` |
| **State Versioning** | Server `GameRoom.version` (Integer) | Client `useRoomStore.roomVersion` | Memory / JSONB | Incremented on every server action; client rejects older |
| **Game Rule & Board State**| Server `IServerGameEngine` | Client `useGameStore.gameState` | Memory | Pushed via `DICE_ROLLED`, `DISC_DROPPED`, `RPS_ROUND_RESOLVED` |
| **Match Escrow Pot** | Server `GameRoom.potAmount` | Client `duelState.potAmount` | Memory / `matches` table | Pushed via `ROOM_STATE` and `GAME_START` |
| **On-Chain Deposit Status**| Blockchain -> `DepositVerificationService` | `deposit_intents` table, client `useAuthStore`| PostgreSQL `deposit_intents` | Server background indexer confirms -> `ACCOUNT_UPDATED` |
| **7-Day PnL / Boast Stats**| Database `transactions` table ledger | Server `bragStats.ts`, Sharp Brag Card | PostgreSQL `transactions` table | Queried on demand by `/api/telegram/brag/prepare` |

---

## 16. Architecture Quality Scorecard

| Architectural Dimension | Score (1–10) | Evaluation Justification |
| :--- | :---: | :--- |
| **Separation of Concerns** | **9 / 10** | Clean boundaries between server engines, transport managers, shared Zod contracts, and presentational React components. |
| **Backend Design** | **8.5 / 10** | Server-authoritative architecture with strict participant validation, sliding-window rate limiters, and atomic escrow transactions. |
| **Frontend Design** | **8 / 10** | High-taste custom sketch vector design system, responsive TMA safe-area handling, and surgical Zustand store subscriptions. |
| **API & Contract Design** | **9 / 10** | Bidirectional runtime validation via shared Zod schemas preventing drift between client and server. |
| **WebSocket Architecture** | **8.5 / 10** | Robust connection lifecycle with exponential backoff, ping/pong liveness detection, selective queueing, and room versioning. |
| **State Management** | **8.5 / 10** | Zustand stores cleanly decouple network event dispatching (`eventRouter`) from UI rendering. |
| **Security & Auth** | **8 / 10** | HMAC-SHA256 TMA auth, deposit verification boundaries, and strict participant checks. Minor penalty for dev backdoor check. |
| **Error Handling** | **8 / 10** | Standardized error codes and user-friendly copy. Graceful handling of disconnects with 45s forfeit countdowns. |
| **Maintainability** | **8 / 10** | Modular directory layout and comprehensive test suite (Vitest unit, integration, contract, property, security). |
| **Scalability** | **5.5 / 10** | In-memory room and socket registries currently prevent horizontal multi-server scaling without Redis/cluster adapter. |
| **Overall Quality Rating** | **8.2 / 10** | **Production-grade single-instance PvP platform with robust financial and authoritative game guarantees.** |

---

## 17. The Senior Engineer's Mental Model & Onboarding Guide

> **"If I am a new senior engineer joining this project today, what exactly do I need to understand about this codebase before I can safely modify the backend or frontend?"**

### 1. The Core Mental Model
* **The Client is a Dumb Terminal:** Never calculate game outcomes, dice rolls, winning lines, or financial rewards on the client. The frontend exists solely to collect player intent (`ROLL_DICE`, `DROP_DISC`, `CHOOSE_RPS`) and render server-acknowledged events (`DICE_ROLLED`, `DISC_DROPPED`, `RPS_ROUND_RESOLVED`, `GAME_OVER`).
* **The Server is the Absolute Authority:** Every move passes through `RoomManager.executeAction()`, which verifies socket session ownership, participant roles, and rate limits before passing the move to the authoritative engine (`SnakeLadderEngine`, `Connect4Engine`, `RPSEngine`).
* **Financial Operations are Escrowed Before Play:** When a room is created or joined, stakes are immediately debited from `balance_gram` into match escrow via `storage.debitStake()`. If a match is cancelled while waiting, the stake is refunded. If a player surrenders or disconnects past 45 seconds, the opponent receives the 90% net pot.
* **Shared Contracts Rule the Wire:** Any change to a WebSocket message or payload structure must be made in `shared/schemas/protocol.ts`. Running `npm test` validates both TypeScript types and Zod runtime schema contracts.

### 2. Which Files Matter Most
* **Entry Points:** `server/server.ts` (Backend), `src/main.tsx` & `src/App.tsx` (Frontend).
* **Game Rules:** `server/engines/` (`SnakeLadderEngine.ts`, `Connect4Engine.ts`, `RPSEngine.ts`).
* **Game Constants:** `shared/constants/board.ts` (Snakes & Ladders coordinates), `shared/constants/economics.ts` (10% fee, 95% draw refund).
* **Financial Ledger & Storage:** `server/storage.ts` and `server/db/index.ts`.
* **Client State & Socket Routing:** `src/state/eventRouter.ts` and `src/services/multiplayerService.ts`.

### 3. What Must NOT Be Changed Casually
* **Pot Breakdown Formulas (`shared/constants/economics.ts`, `server/economy.ts`):** Fast-check property tests (`tests/property/economy-invariants.test.ts`) assert mathematical pot conservation (`winnerPayout + arenaFee === 2 * stake`). Modifying percentages without updating tests will fail the test suite.
* **Room Code Generation (`server/roomManager.ts`):** Must remain server-generated to prevent collision races.
* **TON Deposit Verification Boundary (`server/tonVerifier.ts`, `src/components/bank/BankScreen.tsx`):** Do not add client-side balance crediting upon `sendTransaction()`. Balance must only increase when the backend indexer verifies the transaction.
* **Rate Limits (`server/connectionManager.ts`):** Modifying sliding window limits without adjusting integration tests will cause `tests/integration/websocket/ws-rate-limiting.test.ts` to fail.

### 4. Architectural Landmines to Watch Out For
* **`LobbyScreen.tsx` Syntax Glitch:** Be aware that `src/components/lobby/LobbyScreen.tsx` has duplicate tags around lines 305–326 that should be cleaned up.
* **Developer VIP Backdoor:** Do not deploy to production with `NODE_ENV=development` or with `ALLOW_UNSIGNED_AUTH=true`.
* **In-Memory vs Postgres Discrepancies:** Always test database-related changes against a real PostgreSQL instance using `DATABASE_URL`.
