# Gibous Production Architecture

Status: implementation and architecture handoff

Date: 2026-08-24

This document describes the verified working-tree architecture after the first production-hardening slices. It distinguishes current guarantees from target-state recommendations. The existing `projectcontext.md` report was used as context, but source code and executable tests are authoritative.

The current release decision and executable gate evidence are maintained in [RELEASE_READINESS.md](RELEASE_READINESS.md). That record is the authority for launch readiness; this document is the architecture and migration reference.

## 1. System overview

Gibous is a Telegram Mini App for real-time player-versus-player Snake & Ladders, Connect 4, and RPS matches with GRAM-denominated stakes and TON deposit verification.

The deployable shape is a modular monolith:

```text
React/Vite client
       |
       | HTTP: health, readiness, leaderboard, brag-card flows
       | WebSocket: authentication, rooms, gameplay, deposits
       v
Express + ws transport
       v
Telegram authentication / session authorization / Zod validation
       v
Room and application services
       v
Pure server game engines + financial settlement services
       v
PostgreSQL in production
       |
       +-- TON indexer / Toncenter for independently verified deposits
       +-- Telegram Bot API for prepared brag-card messages
```

The client is an intent-and-rendering boundary. It does not decide dice outcomes, winners, balances, escrow, or payouts.

## 2. Tech stack

| Area | Current implementation |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand |
| Backend | Node.js/TypeScript, Express, `ws` |
| Contracts | Shared TypeScript types inferred from Zod runtime schemas |
| Persistence | PostgreSQL via `pg`; in-memory adapter only for tests |
| Financial integration | TON Connect client flow; server-side TON transaction lookup and verification |
| Media integration | Sharp rendering and Telegram Bot API prepared-message flow |
| Tests | Vitest, React Testing Library, Supertest, fast-check, Playwright configuration |
| Deployment evidence | Local scripts and production configuration guards; hosted infrastructure is not present in the repository |

## 3. Current architecture

### Backend

`server/server.ts` owns process composition, HTTP routes, WebSocket transport, production configuration checks, and message dispatch. `RoomManager` owns process-local room objects and delegates persistence and financial operations to `StorageService`. `StorageService` owns application-facing persistence calls; `DatabasePool` owns PostgreSQL SQL and the explicitly limited test adapter.

`server/engines/` contains infrastructure-independent game engines implementing `IServerGameEngine`. They expose state, deterministic persistence/restore boundaries, action handling, and reset behavior.

### Frontend

`src/services/multiplayerService.ts` owns the client WebSocket lifecycle and heartbeat. `src/state/eventRouter.ts` translates server events into Zustand stores. `useRoomStore` and `useGameStore` reject stale or duplicate versioned events; UI components render store state and submit commands.

### Current state classification

| State | Authority | Persistence | Classification |
| --- | --- | --- | --- |
| Telegram identity | Verified server-side Telegram init data | `users` profile | Authoritative server/database |
| Authenticated socket | `SessionManager` and `ConnectionManager` | None | Ephemeral |
| Active room object | `RoomManager` | `matches.state_payload` snapshots | Runtime authoritative, restart-reconstructable |
| Game engine state | Server engine instance | `matches.state_payload.engine` | Runtime authoritative, restart-reconstructable |
| Recent command result | `GameRoom.actionCache` | `matches.state_payload.actionCache` | Durable bounded idempotency window |
| Balance and ledger | PostgreSQL `users`, `transactions` | PostgreSQL | Authoritative in production |
| Settlement status | `settlements` plus match snapshot | PostgreSQL | Authoritative in production |
| TON transfer evidence | TON chain/indexer, then `deposit_intents` | PostgreSQL | Chain evidence plus database workflow state |
| Open-room directory | Derived from `RoomManager` | Rebuilt from matches | Reconstructable |
| WebSocket connection registry | `ConnectionManager` | None | Ephemeral, single-instance |
| Matchmaking queue | `MatchmakingQueue` | None | Ephemeral, single-instance |

## 4. Current data flow

### Authenticated match flow

1. The browser opens `/ws`.
2. The server enforces the configured origin policy, payload limit, pre-auth rate limit, and authentication deadline.
3. `AUTH` is validated by the shared Zod schema. Signed Telegram init data is HMAC-verified, freshness-checked, replay-checked within the process, and bound to the claimed Telegram ID.
4. The session and connection registries are populated.
5. `CREATE_ROOM` or `JOIN_ROOM` is authorized against the session identity and validated stake.
6. The financial service debits escrow using an operation key and PostgreSQL row locking in production.
7. Room state is persisted before the room event is broadcast.
8. Gameplay commands are serialized per socket, authorized against room membership and role, applied by the server engine, persisted, and then broadcast with a monotonic room version.
9. Game-over settlement is committed before `GAME_OVER` is emitted. A failure emits `SETTLEMENT_PENDING` and leaves a recoverable failed/pending record.

### Deposit flow

1. The client obtains a TON Connect transaction payload.
2. The server records a pending deposit intent; a wallet signature is not a balance credit.
3. The TON verifier finds a matching wallet-to-vault transfer with the expected amount, destination, and time window.
4. PostgreSQL locks the intent, rejects duplicate transaction hashes, credits the balance in one transaction, writes the idempotent ledger entry, and marks the intent confirmed.

## 5. Source-of-truth map

| Concept | Authoritative representation | Mirrors and derived views |
| --- | --- | --- |
| Player identity | Verified Telegram user and `users.telegram_id` | WebSocket session, client auth store |
| Available funds | PostgreSQL `users.balance_nano` in production | `balance_gram` compatibility/display field and client account snapshot |
| Financial history | PostgreSQL `transactions` with unique `operation_key` | Account transaction list and brag statistics |
| Escrow participation | Stake transaction operation keys plus match status/pot | Room snapshot and UI |
| Settlement | PostgreSQL `settlements.match_id` and match settlement status | `GAME_OVER`/`SETTLEMENT_PENDING` events |
| Match state | `RoomManager` at runtime; `matches.state_payload` for recovery | Client room/game stores |
| Game rules | Server engine | Client renderers only |
| Event order | Server `room.version` | Client `roomVersion` and game version |
| Deposit truth | Verified TON transfer plus confirmed intent | Pending/confirmed UI transaction |

## 6. What is genuinely good and preserved

- Server-authoritative game execution is the correct security boundary for PvP.
- Shared Zod schemas reduce HTTP/WebSocket contract drift.
- PostgreSQL transactions, row locks, unique operation keys, and settlement records are the correct primitives for financial invariants.
- The three engines are small, testable modules and now expose explicit persistence and replay boundaries.
- TON deposits are not credited merely because a client submits a BoC; the indexer verification boundary is preserved.
- WebSocket heartbeats, origin checks, payload limits, authentication deadlines, rate limits, slow-consumer handling, and replacement-socket protection are appropriate for this single-instance architecture.
- A modular monolith is proportionate to the current product and avoids unnecessary distributed infrastructure.

## 7. Report reconciliation: `projectcontext.md`

| Report claim | Classification | Source-backed finding |
| --- | --- | --- |
| Historical match persistence is complete | Partially confirmed / outdated | A `matches` table existed, but runtime recovery and lifecycle persistence were incomplete. Current code now persists snapshots and has startup recovery; live PostgreSQL recovery remains unverified. |
| Double-entry accounting exists | Incorrect | The implementation has a transaction ledger and treasury rows, but not a double-entry journal with balanced debit/credit accounts. The report must not call this double-entry accounting. |
| Settlement is idempotent | Partially confirmed, now hardened | PostgreSQL settlement reservations and unique operation keys protect production retries. The previous in-memory flow could race; a per-match single-flight guard and regression test now cover the test adapter. |
| Authentication is strict | Partially confirmed, now hardened | Signed Telegram auth, freshness, replay detection, identity binding, production token requirements, and an explicit unsigned test adapter now exist. Replay state is process-local and must become durable or session-bound before horizontal scale. |
| Escrow is atomic | Partially confirmed, now hardened | Production stake debit is a locked conditional transaction. Room persistence and settlement publication are now ordered around committed financial state. Real database fault-injection testing is still required. |
| Production readiness is established | Incorrect / overstated | The repository has useful production guards and tests, but no evidence of hosted deployment, real PostgreSQL migration execution, TON mainnet verification, supervision, backups, alerting, or load testing. |
| Typecheck and production build pass | Confirmed | `npm run typecheck` and `npm run build` pass after the hardening changes. |
| Full Vitest is clean | Confirmed for the reproducible single-worker path | `npx vitest run --no-file-parallelism --maxWorkers=1` passes 53 files and 242 tests. The baseline's default worker-startup issue remains an environment/configuration follow-up. |
| Lobby polling is required | Outdated | WebSocket room-list events are the active synchronization path; redundant client polling was removed. |
| VIP/name funding behavior exists | Outdated after remediation | Name-based grants were removed and non-test account initialization is zero-funded. |

## 8. Prototype-quality, dangerous, incorrect, and unnecessary areas

### Prototype-quality or formerly prototype-quality

- The in-memory database adapter is suitable for deterministic unit/integration fixtures but does not prove PostgreSQL isolation, constraints, or rollback behavior.
- Runtime room and matchmaking maps are single-process state and require a deliberate multi-instance design before scale-out.
- Observability currently has structured request logs and IDs, but not a full OpenTelemetry SDK/export pipeline.
- The client retains some compatibility-oriented component props and broad `any` room-summary types.

### Dangerous findings addressed in this slice

- Public administrative credit route: removed.
- Name-based balance grant: removed.
- Unsigned production authentication: rejected by configuration and runtime.
- Stale, forged, mismatched, and replayed Telegram init data: rejected.
- Client-visible paid result before settlement: replaced by committed `GAME_OVER` or `SETTLEMENT_PENDING`.
- Missing WebSocket origin, payload, authentication deadline, pre-auth rate, and slow-consumer controls: added.
- Public room directory exposing Telegram IDs: removed.

### Technically incorrect claims or designs remaining

- The system is not double-entry accounting.
- A process-local replay map is not a distributed replay defense.
- In-memory test results do not prove PostgreSQL concurrency behavior.
- A single HTTP `health` response is not dependency readiness; `/api/ready` now checks the database, but deployment probes and dependency policy still need operational validation.

### Unnecessarily complicated additions to avoid

Redis, Kafka, Kubernetes, service decomposition, CQRS, event sourcing, and a service mesh are not justified by the current single-instance requirement. They should be introduced only after a measured multi-instance requirement, not as a synonym for production quality.

## 9. Target architecture

```text
HTTP / WebSocket transport
        |
        v
Authentication -> authorization -> schema validation
        |
        v
Application commands { actor, commandId, operation, roomId, payload, correlationId }
        |
        v
Domain services and pure game engines
        |
        v
PostgreSQL transaction / operation record / state snapshot
        |
        v
Committed domain result and event
        |
        v
Transport event with requestId, event version, and snapshot/replay semantics
```

### Ownership

- Transport owns framing, protocol parsing, connection lifecycle, and mapping errors to stable external codes.
- Authentication owns Telegram verification and session creation.
- Authorization owns actor-to-room/player-role decisions.
- Application services own command orchestration and idempotency lookup.
- Domain engines own deterministic state transitions and domain events.
- Persistence owns balances, ledger entries, operation records, settlement state, and recoverable match snapshots.
- External adapters own TON indexer and Telegram Bot API calls; neither can directly mutate a balance outside a verified application transaction.

### Failure and recovery

- A database transaction failure returns a stable command failure and never publishes a paid result.
- A serialization/deadlock failure is retried at the application transaction boundary with bounded backoff; unrecoverable failure remains pending for reconciliation.
- Process restart reloads waiting/playing rooms and pending settlement rooms from `matches`.
- A stale client receives a snapshot through `SYNC_ROOM`; event versions prevent older state from overwriting newer state.
- External TON/Telegram failures remain explicit pending/failed workflow states and are retryable by the worker.

## 10. Backend architecture

Current modules and responsibilities:

| Module | Responsibility | Boundary rule |
| --- | --- | --- |
| `server.ts` | HTTP/WS transport and composition | No direct balance mutation or engine rules |
| `auth.ts` | Telegram init-data verification | No room or financial side effects |
| `sessionManager.ts` | Per-socket authenticated session | Ephemeral only |
| `connectionManager.ts` | Socket registry, limits, delivery | No domain state |
| `roomManager.ts` | Room lifecycle, authorization-adjacent membership, engine invocation, persistence sequencing | Does not know React or TON |
| `engines/*` | Pure game state transitions | No transport, database, or Telegram imports |
| `storage.ts` | Application persistence and financial use cases | No WebSocket framing |
| `db/index.ts` | PostgreSQL transactions and test adapter | No HTTP or UI concerns |
| `tonVerifier.ts` | Chain observation and match verification | Cannot credit outside storage confirmation |

The next architectural extraction is an application-command module behind `server.ts`; it should be incremental and keep the current public wire protocol stable.

## 11. Frontend architecture

The client is organized as transport service -> event router -> Zustand stores -> React views. It should remain a projection of server authority.

Client guarantees now include:

- no client-generated player identity is used for authorization;
- open rooms arrive through WebSocket events;
- duplicate and stale versioned patches are ignored;
- settlement-pending is rendered as unreconciled, not as paid;
- reconnect uses an authoritative room snapshot.

Remaining frontend debt includes broad compatibility props, duplicated presentation types, and E2E tests that require a configured browser/server environment.

## 12. Domain architecture and engines

Each engine implements:

```text
validated player action + current state
        -> deterministic transition
        -> new state + domain result
```

Snake & Ladders injects random and clock sources for replay tests. Connect 4 clones board payloads so transport consumers cannot mutate engine state. RPS persists hidden choices needed to resume a committed round. Restore methods reject invalid board positions, players, choices, scores, and winners.

The engine contract deliberately excludes React, HTTP, WebSockets, PostgreSQL, Telegram, and TON.

## 13. Financial architecture

### State model

- Available balance: `users.balance_nano` in production.
- Compatibility/display balance: `users.balance_gram`.
- Escrow: stake debit ledger entries plus a persisted match with expected pot.
- Pending deposit: `deposit_intents.status = pending`.
- Confirmed deposit: verified transfer, confirmed intent, balance credit, and one deposit ledger operation.
- Settlement: `settlements.match_id`, calculation, metadata, and match `settlementStatus`.
- Payout/refund/fee: explicit transaction types, operation keys, and treasury updates.

### Invariants

1. Production balance cannot become negative: PostgreSQL check constraint plus locked conditional update.
2. A stake operation key can debit once per player and match.
3. A deposit intent and transfer hash can credit once.
4. A settlement reservation is unique per match.
5. A payout/refund operation has a unique operation key.
6. `GAME_OVER` is emitted only after the financial operation commits.
7. Failed settlement is recoverable and represented as pending/failed, never as paid.

PostgreSQL uses `Read Committed` with row locks and atomic updates for the current single-operation invariants. Settlement locks users in deterministic `id` order. `Serializable` is reserved for an invariant that cannot be expressed with these locked updates and constraints; it is not added speculatively.

The `balance_nano` migration is backward-compatible at the application edge but must be run and verified against a real production-like PostgreSQL database before real funds are enabled.

## 14. Database architecture

`server/db/migrate.ts` applies `schema.sql` and recorded SQL migrations transactionally through `schema_migrations`. The schema includes users, matches, transactions, deposit intents, settlements, and treasury.

Production database rules:

- parameterized SQL only;
- pooled connections with connection and idle timeouts;
- TLS certificate verification enabled unless explicitly and consciously overridden;
- financial changes in explicit transactions;
- row locks for multi-row user invariants;
- unique constraints for operation identity;
- constraints for nonnegative balances, positive deposits, game types, statuses, and pot/stake relationships;
- no process-local memory as production financial authority.

The test adapter is intentionally not a SQL simulator of PostgreSQL. Its role is deterministic unit behavior; integration acceptance for isolation, migration, and rollback must use PostgreSQL.

## 15. WebSocket architecture

The WebSocket boundary enforces:

- RFC 6455-compliant `ws` transport;
- configured origin allowlist;
- 64 KiB maximum frame payload;
- authentication deadline;
- pre-auth and authenticated transport rate limits;
- gameplay action rate limits;
- schema validation before dispatch;
- per-socket command serialization;
- one active connection per Telegram identity with replacement-safe close handling;
- heartbeat/stale connection cleanup;
- bounded outbound buffer and slow-consumer termination;
- membership and role checks before room commands;
- monotonic room versions and authoritative snapshots.

The current protocol uses request IDs and room versions. It does not yet have a separate globally durable event ID or replay log. Those are required only if reconnect replay beyond snapshots becomes a product requirement.

## 16. HTTP/API architecture

HTTP follows RFC 9110 semantics for health, readiness, data retrieval, error status, and bounded JSON payloads. Mutating match operations use the authenticated WebSocket command path. The old unauthenticated room/user development routes are test-adapter-only; production and development reject them.

Public endpoints are intentionally limited to read-only room/leaderboard data and signed brag-card image access. Brag preparation requires signed Telegram init data. External error bodies use stable, non-sensitive messages; internal exceptions are logged with correlation context.

OpenAPI is not introduced yet because the primary mutating contract is WebSocket and the shared Zod schemas already provide runtime validation. If HTTP surface area expands, generate an OpenAPI contract from the same schemas rather than maintaining a second hand-written contract.

## 17. Authentication and authorization

Authentication is Telegram Web App HMAC-SHA256 verification using the configured bot token. The verifier requires a valid user, valid `auth_date`, bounded freshness, timing-safe hash comparison, and process-local replay rejection. Production startup rejects missing/unsafe Telegram configuration and unsigned authentication.

Authorization is session-bound:

- the claimed Telegram ID must equal the verified Telegram ID;
- room identity in payloads cannot override the session;
- only room members can sync, leave, emote, or act;
- the server derives `p1`/`p2` from room membership;
- only the host can cancel a waiting room;
- financial commands use server-derived identities and operation keys.

Before multi-instance scale, replay protection must move to a durable challenge/session store or be replaced by a signed server-issued session token with rotation and revocation.

## 18. Error architecture

External errors use stable codes such as `AUTH_FAILED`, `UNAUTHORIZED`, `ACTION_REJECTED`, `STATE_PERSISTENCE_FAILED`, `SETTLEMENT_PENDING`, and `RATE_LIMIT_EXCEEDED`. Messages avoid stack traces, SQL details, credentials, private keys, wallet secrets, and sensitive account data.

Every HTTP request receives a bounded `X-Request-ID`; WebSocket commands receive a request ID if the client omits one. Structured logs include event, level, timestamp, request ID, and safe operational fields.

## 19. Observability

Current instrumentation provides structured HTTP completion logs and correlation IDs. Important domain paths should next emit:

- command accepted/rejected counters;
- settlement success/failure/pending counters;
- database transaction latency and serialization/deadlock retries;
- active sockets, stale sockets, rate-limit rejections, and slow-consumer terminations;
- deposit-intent age and reconciliation outcomes;
- room recovery and invalid-snapshot counters.

OpenTelemetry concepts are the target vocabulary for traces, metrics, and logs. An SDK/exporter is intentionally deferred until the deployment supplies a collector/export destination and retention policy.

## 20. Testing architecture

| Test layer | Purpose | Current evidence |
| --- | --- | --- |
| Unit | Auth, engines, economics, money conversion, session/connection behavior | Present |
| Contract | Shared Zod request/response validation and bounds | Present |
| Property | Game/economics invariants | Present |
| Security regression | Prior vulnerability guarantees | Present and expanded |
| Integration | REST, WebSocket lifecycle, settlement, concurrency, recovery | Present and expanded |
| Component | React rendering and interaction | Present; single-worker execution is the stable path |
| E2E | Browser/server multi-session workflows | Configured; requires environment and browser execution |
| PostgreSQL integration | Real isolation, migration, rollback, constraints | Verified against disposable PostgreSQL 18; target deployment rehearsal remains required |
| TON integration | Explicit network-bound native TON transfer matching, duplicate protection, and reorg/error behavior | Mainnet configuration hardened; controlled testnet/mainnet chain evidence and finality/reconciliation remain required |

Critical invariants have explicit tests for negative balances, duplicate stakes, duplicate settlements, duplicate deposits, unauthorized room control, stale/duplicate actions, reconnect state, invalid protocol messages, and slow consumers. Fault-injection tests against real PostgreSQL remain a release gate.

Latest local verification: single-worker Vitest passed 53 test files and 242 tests; `npm run typecheck` passed for client and server; `npm run build` passed; `git diff --check` is clean. Live PostgreSQL, browser E2E, backup/restore, and WebSocket gates passed locally; TON chain evidence, deployment supervision, and external observability export remain unavailable in this workspace.

## 21. Security standards matrix

| Requirement | Current implementation | Status | Gap | Target / proposed change | Tests | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| ASVS authentication must verify the real credential | Telegram HMAC with configured token; unsigned path only explicit test adapter | Hardened | Replay map is process-local | Durable session/challenge at scale | auth signature, stale, forged, replay tests | Focused auth suite; production config review |
| ASVS authorization and API object access | Session identity and room membership/role checks | Hardened | Application commands are still dispatched in `server.ts` | Extract centralized authorization policy | security regression and WS membership tests | Review all mutating cases |
| ASVS input validation/resource limits | Zod schemas, 64 KiB JSON/frame, bounded names/request IDs, rate limits | Hardened | Some legacy optional fields remain broad | Strict schemas and generated contract checks | contract bounds and WS malformed tests | Shared schema is wire authority |
| ASVS secrets/error handling | No secret logging; generic external errors; production env gate | Improved | Full secret scanning/rotation policy is deployment work | Secret manager, redaction policy, CI scan | config/security tests | Deployment checklist |
| OWASP API Top 10 BOLA | Room operations derive player role from session | Hardened | Read endpoints need production gateway policy | Central policy and endpoint inventory | unauthorized room action tests | Route inventory review |
| OWASP API resource consumption | JSON/frame limits, transport/action limits, bounded outbound buffer | Hardened | Distributed limits not needed for single instance | Add gateway limits before scale-out | rate/backpressure tests | Load test in deployment |

## 22. Financial/database standards matrix

| Requirement | Current implementation | Status | Gap | Target / proposed change | Tests | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL Read Committed protects atomic conditional debit | Locked user row, operation lookup, conditional balance update | Implemented for production path | Real PostgreSQL execution not available | Add containerized PG integration | concurrent stake tests | Run with `DATABASE_URL` |
| PostgreSQL MVCC/row locking protects multi-user settlement | Settlement transaction locks users in deterministic ID order | Implemented for production path | Need deadlock/serialization fault injection | Add bounded retry wrapper if Serializable is introduced | concurrent settlement and rollback tests | SQL log and invariant checks |
| Financial operation idempotency | Unique operation keys and settlement primary key | Hardened | Application command result records are bounded snapshots | Durable command table if replay window must be unlimited | duplicate stake/deposit/settlement tests | Query unique constraints |
| Exact base units | `balance_nano` plus compatibility `balance_gram`; nanogram transaction columns | Implemented in schema/code path | Migration/live data verification pending | Make nano columns the only writable financial fields | money conversion and PG migration tests | Run migration against production-like DB |
| Crash recovery | Match snapshot, pending settlement status, startup reconciliation | Implemented | External payout worker/reconciliation dashboard absent | Add operator reconciliation job and alerts | restart/recovery tests | Kill/restart process with PG |
| Double-entry accounting | Single-sided user ledger and treasury aggregate | Not implemented | No balanced account journal | Decide whether regulatory/accounting requirements require journal redesign | ledger property tests | Accounting review before claiming double-entry |

## 23. Real-time, API, configuration, and TON standards matrix

| Subsystem / requirement | Current implementation | Status | Gap | Target / proposed change | Tests | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| RFC 6455 lifecycle | `ws`, close/error handlers, auth timeout, heartbeat | Hardened | Browser/proxy behavior needs deployment test | Verify proxy idle timeouts and close codes | handshake/reconnect tests | Staging browser test |
| OWASP WebSocket auth/message/resource controls | Origin, auth deadline, schema validation, rate/backpressure | Hardened | No distributed connection quota | Add edge quota at scale | WS security suite | Staging load test |
| RFC 9110 HTTP semantics | Health/readiness, status codes, bounded JSON, generic errors | Improved | No versioning strategy because API is small | Version only when public surface expands | REST tests | Route inventory |
| JSON Schema/OpenAPI contract clarity | Zod is runtime contract; no OpenAPI | Appropriate for current surface | HTTP/WS docs could be generated | Generate OpenAPI only if HTTP consumers need it | contract suite | Compare generated contracts |
| Twelve-Factor config/logs | Environment-backed config, structured logs, production fail-closed checks | Improved | Supervisor, secret manager, and deployment manifest absent | Add deployment-specific config/runbook | config/readiness tests | Deployment rehearsal |
| TON Connect transaction boundary | Client binds the request to TON network `-239` for mainnet; server verifies source, destination, amount, network, and duplicate transfer before credit | Hardened boundary | Reorg/finality semantics, indexer pagination, and jetton support not implemented | Native TON only until asset-specific verifier exists; add reconciliation and finality evidence | deposit intent/duplicate tests | Controlled testnet, then mainnet canary |

## 24. Migration roadmap

### P0 — financial correctness and security

- Objective: eliminate unauthorized monetary mutation and make production financial truth durable.
- Current problem: prototype/demo paths and decimal compatibility fields previously allowed unsafe assumptions.
- Reference: OWASP ASVS 5.0, OWASP API Security Top 10, PostgreSQL transaction/MVCC docs, Stripe idempotent requests, TON payment verification.
- Target design: authenticated commands, integer nano authority, operation records, constraints, atomic settlement, pending recovery.
- Files affected: `server/auth.ts`, `server/server.ts`, `server/storage.ts`, `server/db/index.ts`, `server/db/schema.sql`, `server/db/migrations/*`, `server/money.ts`.
- Migration strategy: apply additive schema migration, verify balances, enable production only after reconciliation, then remove compatibility writes.
- Tests: auth replay, admin-route rejection, concurrent stake, duplicate deposit/settlement, rollback.
- Risks: migration mismatch or legacy decimal rounding.
- Rollback: stop financial writes, restore database backup, disable production mode; retain compatibility columns until reconciliation is signed off.
- Success criteria: no public credit path, no negative balances, one financial effect per operation, committed result gating.

### P1 — boundaries and contracts

- Objective: move transport dispatch toward application commands and centralize policy.
- Current problem: `server.ts` still contains substantial orchestration.
- Reference: ASVS, OWASP API Top 10, RFC 9110, Zod/OpenAPI guidance.
- Target design: `transport -> command context -> policy -> use case -> domain -> persistence`.
- Files affected: `server/server.ts`, new `server/application/*`, `shared/schemas/protocol.ts`.
- Migration strategy: extract one command family at a time without wire changes.
- Tests: contract, authorization matrix, stable error-code tests.
- Risks: behavior drift and duplicate broadcasts.
- Rollback: retain old dispatch behind a feature flag during extraction.
- Success criteria: handlers contain framing and mapping only.

### P2 — reliability and observability

- Objective: make failures diagnosable and supervised.
- Current problem: structured request logs exist, but metrics/traces and deployment probes are incomplete.
- Reference: OpenTelemetry concepts and Twelve-Factor logs.
- Target design: trace/correlation across transport, command, DB, settlement, and event broadcast; liveness/readiness probes; supervisor restart policy.
- Files affected: `server/observability.ts`, `server/server.ts`, deployment manifests/runbook.
- Migration strategy: add metrics first, then traces when collector is available.
- Tests: log redaction, readiness failure, fatal-process behavior.
- Risks: sensitive-field leakage or noisy telemetry.
- Rollback: disable exporter while retaining local structured logs.
- Success criteria: every critical command can be correlated end to end.

### P3 — persistence and concurrency

- Objective: prove recovery and isolation against real PostgreSQL.
- Current problem: current workspace uses the in-memory adapter for tests.
- Reference: PostgreSQL isolation/MVCC/locking docs.
- Target design: PostgreSQL integration environment, bounded transaction retry policy, deadlock and serialization telemetry.
- Files affected: migrations, integration harness, `server/db/index.ts`.
- Migration strategy: run schema and migration checks in CI with disposable PostgreSQL.
- Tests: simultaneous stakes, settlement/refund races, rollback, process restart, migration consistency.
- Risks: environment flakiness and test cost.
- Rollback: keep deterministic unit adapter for fast tests; gate only release tests on PG.
- Success criteria: invariants pass under concurrent real transactions.

### P4 — real-time architecture

- Objective: make reconnect, ordering, and slow-client behavior explicit.
- Current problem: versions and snapshots exist, but no durable event replay log.
- Reference: RFC 6455 and OWASP WebSocket Security Cheat Sheet.
- Target design: snapshots as baseline, event IDs/replay only if product requirements demand it, bounded queues and edge limits.
- Files affected: `server/connectionManager.ts`, `server/server.ts`, `src/services/multiplayerService.ts`, `src/state/*`.
- Migration strategy: preserve snapshot sync and add replay as a measured feature.
- Tests: stale events, duplicate commands, auth timeout, origin, replacement socket, slow consumer.
- Risks: event ordering regressions.
- Rollback: use snapshot-only sync.
- Success criteria: reconnect converges without duplicate state mutation.

### P5 — scalability

- Objective: define the threshold for multi-instance deployment.
- Current problem: room, matchmaking, and socket registries are process-local.
- Reference: distributed-systems implications of the above standards; no technology mandate.
- Target design: first scale vertically/single instance; add Redis/pub-sub only with measured multi-instance demand.
- Files affected: deployment and a future adapter boundary around rooms/events.
- Migration strategy: introduce interfaces before infrastructure.
- Tests: two-instance routing and failover only when scope is approved.
- Risks: premature distributed consistency complexity.
- Rollback: single-instance supervisor.
- Success criteria: explicit capacity/SLO threshold and documented migration boundary.

### P6 — maintainability and testability

- Objective: keep domain and contracts easy to change safely.
- Current problem: transport orchestration and compatibility props remain broad.
- Reference: pure domain-engine pattern, shared runtime schemas, OpenTelemetry correlation concepts.
- Target design: command modules, deterministic fixtures, generated contract checks, database test utilities.
- Files affected: application modules, shared schemas, tests, client stores.
- Migration strategy: one bounded context/command family per change.
- Tests: deterministic replay, property, contract, component, and E2E suites.
- Risks: refactor scope creep.
- Rollback: retain public interfaces and small commits per extraction.
- Success criteria: each significant change has a focused invariant test and change record.

### P7 — cleanup

- Objective: remove dead routes, compatibility hacks, and obsolete claims.
- Current problem: dirty worktree contains historical deletions and legacy interfaces; report claims can become stale.
- Reference: Twelve-Factor development/production parity and internal change-record policy.
- Target design: only supported routes, one protocol contract, current architecture documentation.
- Files affected: client compatibility props, docs, dead code identified by coverage/reference analysis.
- Migration strategy: delete only after reference search and focused verification.
- Tests: typecheck, build, component, route inventory.
- Risks: hidden consumers.
- Rollback: recover from version control; do not delete user-owned unrelated worktree changes.
- Success criteria: no unreachable production route or undocumented prototype behavior.

## 25. First ten implementation tasks and status

1. Freeze the working-tree baseline and regression fixtures — complete in the audit ledger.
2. Remove or secure admin credit and demo funding — complete.
3. Enforce fail-closed production auth/configuration — complete, with durable replay still a scale-out task.
4. Define exact money units, ledger, escrow, and operation IDs — schema/code slice complete; live migration pending.
5. Add atomic, idempotent PostgreSQL financial transactions — code complete; real PostgreSQL verification pending.
6. Persist matches, settlement state, and recovery information — complete for current modular monolith.
7. Refactor transport handlers into application commands — next P1 extraction.
8. Harden WebSocket lifecycle, limits, ordering, and resynchronization — current single-instance slice complete.
9. Make game engines deterministic, replayable, and infrastructure-independent — complete for current engines.
10. Add observability, deployment checks, contracts, concurrency tests, and CI-quality verification — request IDs/readiness/contracts/tests complete; collector, CI, and live integration remain.

## 26. Tests to run before further refactoring

- `npm run typecheck`
- `npm run build`
- `npm run test:contract`
- `npm run test:security`
- focused financial, persistence, engine, and WebSocket suites
- `npm run test:component -- --no-file-parallelism --maxWorkers=1`
- full `npm test -- --no-file-parallelism --maxWorkers=1`
- PostgreSQL migration/rollback/concurrency suite with a disposable real database
- controlled TON testnet deposit and duplicate notification test
- browser E2E with a running backend and explicit test credentials

## 27. Required change-record policy

Every significant implementation change must record:

- what changed;
- why it changed;
- what guarantee the old code failed to provide;
- which authoritative reference was consulted;
- which principle was applied;
- which invariant/security property is now guaranteed;
- which tests prove it;
- what could regress;
- how to roll it back.

The implementation ledger at `.superpowers/sdd/2026-08-24-gibous-production-remediation/progress.md` records the current slices. Future production changes should append a durable record to the repository’s engineering change log.

## 28. Industry references

- [OWASP ASVS 5.0](https://github.com/OWASP/ASVS/tree/master/5.0)
- [OWASP API Security Top 10](https://owasp.org/API-Security/)
- [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [PostgreSQL concurrency control / MVCC](https://www.postgresql.org/docs/current/mvcc.html)
- [OpenTelemetry concepts](https://opentelemetry.io/docs/concepts/)
- [Twelve-Factor config](https://12factor.net/config)
- [Twelve-Factor logs](https://12factor.net/logs)
- [RFC 6455 WebSocket protocol](https://www.rfc-editor.org/rfc/rfc6455)
- [RFC 9110 HTTP semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [JSON Schema](https://json-schema.org/)
- [OpenAPI](https://spec.openapis.org/oas/latest.html)
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [TON Connect transactions](https://docs.ton.org/applications/ton-connect/how-to/send-transaction)
- [TON payment verification](https://docs.ton.org/applications/payments/overview)
