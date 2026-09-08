# Gibous — Production Verification and Release Readiness

Date: 2026-08-24

Recommendation: **NOT READY for real-money production launch**.

The application hardening slice is substantially verified locally, including real PostgreSQL 18 behavior, database recovery, backup/restore, WebSocket abuse controls, graceful shutdown hooks, and browser flows. Mainnet configuration now fails closed unless the native TON asset, mainnet network, valid vault address, and HTTPS non-testnet indexer endpoint are explicitly configured. The recommendation remains `NOT READY` because no controlled TON testnet or mainnet transfer was performed, no production supervisor/restart policy is deployed, and sustained capacity/slow-consumer behavior has not been measured.

This record is evidence-based. `VERIFIED` means the named evidence was actually produced in this workspace. It does not mean the gate is sufficient for a mainnet launch by itself.

## 1. Release-gate matrix

| Gate | Status | Evidence | Remaining work |
| --- | --- | --- | --- |
| Build | VERIFIED | Final `npm run build` passed after the release-gate fixture and selector updates; Vite built 1,988 modules successfully. | Repeat in CI with locked dependencies. |
| Typecheck | VERIFIED | Client and server TypeScript checks passed after the shutdown/logging changes. | Repeat in CI. |
| Unit | VERIFIED | Single-worker full Vitest run: 53 files, 242 tests passed. | Keep the single-worker configuration until the default worker-startup issue is isolated. |
| Contract | VERIFIED | Contract suites are included in the passing full run and cover bounded protocol fields and runtime schemas. | Add generated external-consumer contract checks if public HTTP consumers are introduced. |
| Security | PARTIALLY VERIFIED | Security regression suite passed, including auth, authorization, public-credit rejection, settlement-failure, and WebSocket boundary cases. | Run a fresh sealed security scan, dependency audit, secret scan, and staging perimeter review after deployment. |
| Property | VERIFIED | Property tests are included in the passing full run. | Expand financial conservation properties against the SQL adapter. |
| Real PostgreSQL | VERIFIED | Disposable PostgreSQL 18 database: schema, migrations, concurrent stakes, duplicate operation keys, concurrent settlement, rollback, deterministic lock ordering, duplicate deposit confirmation, and direct constraint rejection all passed. | Repeat in CI and against the chosen production PostgreSQL version/configuration. |
| Database recovery | VERIFIED | Separate setup and recovery processes restored waiting, active Connect 4, hidden RPS choice, pending settlement, completed match exclusion, and disconnected-player reconnect. No duplicate payout or negative balance occurred. | Rehearse the actual deployment kill/restart path with production-like process supervision. |
| TON mainnet deposits | UNVERIFIED / BLOCKED | Local environment remains a test configuration with no configured deposit address, indexer endpoint, wallet, or controlled chain transfer. Mainnet startup now fails closed until these values are present. | Verify the full flow on testnet first, then execute a controlled mainnet canary with the exact production vault/indexer and reconciliation procedures. |
| Browser E2E | VERIFIED for current fixture flows | Headed Chromium ran the actual UI and WebSocket boundary; all 5 existing E2E flows passed using the explicit `E2E_TEST_MODE=true` test adapter. | Add complete Snake, Connect 4, and RPS gameplay/payout assertions and run against a real PostgreSQL-backed staging environment. |
| WebSocket abuse/soak | PARTIALLY VERIFIED | Actual service smoke run with 22 sockets verified malformed payload rejection, schema rejection, transport flood limiting, 64 KiB frame enforcement, disallowed origin rejection, and 13.67 ms ping fanout latency. | Measure sustained CPU, memory, queue growth, slow consumers, reconnect storms, and production-scale connection limits. |
| Observability | PARTIALLY VERIFIED | Structured JSON HTTP, WebSocket command, rejection, settlement-start, settlement-commit, and settlement-failure logs were observed with request/room/actor/operation correlation. No secret or credential fields are emitted by these paths. | Validate collection, retention, alerting, and operator runbooks in deployment; add metrics/traces when a collector exists. |
| Supervision | PARTIALLY VERIFIED | Direct graceful-shutdown hook closed HTTP and database resources; invalid production configuration failed closed. | Verify SIGTERM on the target OS/container and provide an actual supervisor with automatic restart and recovery policy. |
| Backup/restore | VERIFIED | `pg_dump` custom-format backup restored into a disposable database with users, transactions, settlements, and matches present. | Configure scheduled backups, retention, encryption, restore drills, and RPO/RTO ownership. |
| Load baseline | PARTIALLY VERIFIED | Low-volume baseline: 20 authenticated sockets plus protocol-abuse checks; 13.67 ms fanout latency. | Establish p95 command latency, database latency, settlement latency, CPU, memory, room count, and recovery time under a declared capacity target. |

## 2. What is production-ready now

- Server-authoritative game transitions and authorization boundaries.
- PostgreSQL financial path primitives: exact nanogram fields, nonnegative constraints, row locks, deterministic lock ordering, durable operation keys, settlement uniqueness, and transactional rollback.
- Durable match snapshots and restart reconciliation for active/pending state.
- Telegram authentication hardening and fail-closed production configuration.
- WebSocket validation, origin policy, authentication deadline, rate limits, payload limits, bounded delivery, and replacement-socket handling.
- Explicit test-only browser funding through `E2E_TEST_MODE`; production startup rejects that flag.
- Basic structured logs, request IDs, readiness checks, and graceful shutdown hooks.

These are implementation guarantees, not a declaration that the deployment or external dependencies are ready.

## 3. Hardened but still unverified

- TON transaction verification has the correct pending-intent boundary, explicit network binding, vault matching, source matching, amount matching, and duplicate-credit protection, but no real chain evidence or finality/reconciliation drill has been exercised.
- PostgreSQL behavior is verified against a local disposable PostgreSQL 18 instance; CI and production-like network/TLS settings remain to be exercised.
- Browser flows pass only with the explicit unsigned/funded E2E adapter and in-memory storage. They do not prove Telegram production authentication, real balances, TON deposits, or real PostgreSQL browser concurrency.
- Structured logs are correlated locally but are not yet exported to an operator system with dashboards and alerts.
- Graceful shutdown is directly verified; signal delivery and automatic process restart are not verified on the target deployment OS.

## 4. Blocked by environment or infrastructure

### TON network

The local `.env` is still configured for testnet and has no `TON_DEPOSIT_ADDRESS` or `TONCENTER_API_URL`. A production process with those values missing, with `TON_NETWORK` other than `mainnet`, with a testnet endpoint, or with an invalid vault address now refuses to start. No balance may be credited from this environment.

### Deployment supervision

The repository does not contain a systemd unit, container manifest, process-manager configuration, or hosted deployment. The application now exposes a graceful shutdown path, but automatic restart, crash recovery, connection draining, and database-pool lifecycle must be verified in the selected platform.

### External observability

No OpenTelemetry SDK/exporter or collector is configured. Structured logs remain the local fallback. Adding an exporter is deferred until the deployment defines a collector, retention, access-control, and redaction policy.

## 5. Financial invariant report

| Invariant | Evidence | Status |
| --- | --- | --- |
| `balance >= 0` | PostgreSQL check constraint, conditional nanogram debit, concurrent same-balance stakes, recovery query, and direct invalid-SQL rejection. | VERIFIED |
| One operation key → one debit | Concurrent distinct stakes produced one success/one insufficient result; repeated successful key produced one ledger row. | VERIFIED |
| One match → one settlement | Concurrent settlement attempts produced one reservation, one payout, and one no-op result. | VERIFIED |
| One verified transfer → one credit | Real PostgreSQL duplicate confirmation produced one balance credit and one deposit ledger row. Actual mainnet chain verification and finality handling remain unverified. | PARTIALLY VERIFIED |
| One payout operation → one credit | Unique settlement reservation and payout operation key were verified under concurrent settlement. | VERIFIED |
| Pot conservation | The tested win calculation persisted payout and fee components consistently with the committed pot. Draw/refund conservation needs an explicit real-PostgreSQL assertion before launch. | PARTIALLY VERIFIED |
| Restart cannot create/destroy value | Separate recovery process preserved settlement/payout counts and produced no negative balances; full value reconciliation across every ledger account is still required. | PARTIALLY VERIFIED |

## 6. Security release review

The implementation was compared with [OWASP ASVS 5.0](https://github.com/OWASP/ASVS/tree/master/5.0), [OWASP API Security Top 10](https://owasp.org/API-Security/), and the [OWASP WebSocket Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html).

- Authentication: signed Telegram HMAC, freshness, replay detection, identity binding, and production token requirements are implemented and regression-tested.
- Authorization: room membership, player role, host cancellation, identity mismatch, and settlement ownership are server-derived and regression-tested.
- Resource exhaustion: JSON/frame limits, pre-auth and gameplay rate limits, bounded outbound buffering, and slow-consumer termination are implemented; sustained load is pending.
- Error disclosure: REST errors are generic and logs use safe operational fields; a deployment secret scan and collector redaction test remain required.
- Financial flows: public credit behavior and name-based grants are removed; production balances use PostgreSQL authority and exact base units.

## 7. Industry guidance used for release decisions

- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html), [MVCC](https://www.postgresql.org/docs/current/mvcc.html), and [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html): Read Committed plus fixed-row locks/conditional updates for current operations; deterministic lock ordering; retry whole transactions if serialization is introduced.
- [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455) and [OWASP WebSocket guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html): frame limits, authentication lifecycle, validation, origins, rate/resource controls, and safe closure.
- [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html): HTTP status/error and readiness semantics.
- [OpenTelemetry concepts](https://opentelemetry.io/docs/concepts/): correlation vocabulary for logs, metrics, and traces; exporter deferred until deployment infrastructure exists.
- [TON Connect transactions](https://docs.ton.org/applications/ton-connect/how-to/send-transaction) and [TON payment processing](https://docs.ton.org/applications/payments/overview): client submission is not proof of payment; only independently verified chain evidence may confirm a deposit.
- [Node.js process signals](https://nodejs.org/api/process.html) and [HTTP server shutdown](https://nodejs.org/api/http.html): graceful signal/shutdown hook implementation.

### Mainnet hardening change record

- Changed: TON Connect now sends the explicit mainnet network ID `-239` and the connected wallet address; production startup requires native TON, `TON_NETWORK=mainnet`, a valid vault address, and an HTTPS non-testnet indexer endpoint.
- Why: the previous client request omitted the network binding and production accepted a non-mainnet TON network value.
- Guidance: TON Connect requires an explicit network and documents mainnet as `-239`; TON payment processing requires independent chain monitoring and verification before off-chain credit.
- Guarantee: an incorrectly wired production chain, vault, endpoint, or wallet-network request fails closed; verifier matching is additionally bound to the persisted network, vault, source wallet, destination, exact nanogram amount, and bounded timestamp.
- Tests: mainnet configuration tests passed 9/9; full security regression passed 11/11; typecheck, production build, and full 53-file/242-test suite passed.
- Risk and rollback: do not roll back to an unbound network request. If the mainnet verifier or endpoint is unhealthy, keep deposits disabled, correct configuration, and reconcile pending intents before re-enabling.

## 8. Reproducible release-gate commands

The disposable PostgreSQL scripts require a database URL pointing to a database whose name contains `release_gate` and `RELEASE_GATE_CONFIRM=YES`:

```text
npx tsx scripts/release-gates/postgres.ts
npx tsx scripts/release-gates/recovery.ts setup
npx tsx scripts/release-gates/recovery.ts recover
npx tsx scripts/release-gates/backup-restore.ts
npx tsx scripts/release-gates/websocket.ts
npx tsx scripts/release-gates/supervision.ts
```

The browser fixture requires `NODE_ENV=development`, `ALLOW_UNSIGNED_AUTH=true`, and `E2E_TEST_MODE=true`. `E2E_TEST_MODE` is rejected by production startup validation and must never be enabled in a real deployment.

## 9. Must be fixed before real money

1. Complete controlled TON testnet verification, then a limited mainnet canary and operational reconciliation policy before enabling meaningful balances.
2. Run the full financial/recovery suite against the target PostgreSQL deployment configuration, including TLS, backups, failure injection, and value reconciliation.
3. Deploy under a real supervisor with tested graceful termination, automatic restart, readiness/liveness probes, and recovery runbooks.
4. Establish operator-visible logs/metrics/alerts and a sensitive-data redaction review.
5. Establish capacity limits and slow-consumer behavior with measured p95/p99 targets.

## 10. Can safely wait until after launch

- OpenTelemetry exporters once a collector and retention policy are selected.
- Durable event replay beyond authoritative snapshots if product requirements do not need it initially.
- Redis/pub-sub or service decomposition until measured multi-instance demand exists.
- Full OpenAPI generation while the current HTTP surface remains small and Zod is the runtime contract.

## 11. Final release recommendation

**NOT READY.**

The core application hardening is credible and several previously assumed guarantees are now demonstrated against real PostgreSQL and real browser/WebSocket boundaries. Real-money operation must remain disabled until the TON testnet-to-mainnet sequence, controlled mainnet canary, deployment supervision, backup/recovery operations, operator observability, and capacity limits are verified in the target environment.
