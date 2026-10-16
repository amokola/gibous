# Repository Audit Findings — 2026-10-16

## Scope and method

Reviewed the current working tree, package/configuration inventory, active UI diffs, server startup and public API routes, Telegram authentication/webhook paths, WebSocket authentication and room entry, TON deposit matching, withdrawal quote/worker/payout paths, PostgreSQL transaction helpers, balance/settlement schema, migrations, architecture documentation, tests/configuration, and Render Blueprint. Expanded browser tests exercised 40 scenarios against a localhost-only disposable PostgreSQL database and found four low-severity UI defects, which were fixed.

The active tree already contained edits to application components, tests, and several untracked documentation/artifact directories. Those were preserved. Browser-driven changes in this follow-up are limited to the four UI fixes documented below; the release-gate safety guard and its regression test are also retained. Deployment settings were not changed.

## Summary

| ID | Severity | Category | Confidence | Status |
|---|---|---|---|---|
| REL-001 | High | Reliability / Database Safety | Confirmed | Fixed |
| ARCH-001 | High | Reliability / Database | High confidence | Open |
| FIN-001 | Medium | Financial Integrity / Architecture | High confidence | Open |
| SEC-001 | Medium | Security / Configuration | Potential | Open |
| SEC-002 | Low | Security / Information Disclosure | Confirmed | Open |
| UI-001 | Low | User Interface / Data Mapping | Confirmed | Fixed |
| UI-002 | Low | User Interface / Game Feedback | Confirmed | Fixed |
| UI-003 | Low | User Interface / Error Feedback | Confirmed | Fixed |
| UI-004 | Low | User Interface / Game State | Confirmed | Fixed |
| UI-005 | Low | User Interface / Deposit Lifecycle | Confirmed | Fixed |
| DEP-001 | Low | Reliability / Deposit Lifecycle | Confirmed | Fixed |
| DEP-002 | Low | Reliability / Deposit Lifecycle | Confirmed | Fixed |
| DEP-003 | Low | Financial Integrity / Deposit Confirmation | Confirmed | Fixed |
| DEP-004 | Low | Reliability / Deposit Verification | Confirmed | Fixed |
| DEP-005 | Medium | Financial Integrity / Deposit Accounting | Confirmed | Fixed |
| DEP-006 | Low | Financial Integrity / Idempotency | Confirmed | Fixed |
| PAY-002 | Low | Financial Integrity / Input Validation | Confirmed | Fixed |
| PAY-001 | Medium | Financial Integrity / Payout Finality | Confirmed | Fixed |

The only confirmed high-impact defect was in a manually invoked release-gate script, not the application runtime; it was fixed during this review. Open issues below are supported by repository configuration or code, with external outcomes labeled as conditional where appropriate.

### REL-001 — Backup/restore gate could drop a fixed-name database on an unvalidated cluster

**Severity:** High

**Category:** Reliability / Database Safety

**Confidence:** Confirmed

**Affected component:** Manual release-gate backup and restore verification.

**Location:** `scripts/release-gates/backup-restore.ts`; regression test: `tests/unit/scripts/backup-restore-safety.test.ts`.

**Evidence:** Before the fix, the script required `RELEASE_GATE_CONFIRM=YES` and `DATABASE_URL`, then connected to the URL's server, ran `DROP DATABASE IF EXISTS \"gibous_release_gate_restore_20260824\"`, and only afterward attempted `pg_dump` from a hard-coded source database. It did not validate the configured database name. A safe reproduction used a synthetic `DATABASE_URL` pointing to `127.0.0.1:1/not_disposable`; the new regression test failed because the script attempted a connection (`ECONNREFUSED`) instead of rejecting the target. No database was reachable or changed. The test passed after the fix.

**Problem:** An operator who supplied the explicit gate confirmation but accidentally pointed `DATABASE_URL` at a production cluster could cause the script to drop an existing database with the fixed restore name before the source dump failed.

**Root cause:** The gate trusted a boolean confirmation variable and did not assert that the connection string targeted its exact disposable source database before issuing destructive SQL.

**Failure scenario:** `RELEASE_GATE_CONFIRM=YES` is set, `DATABASE_URL` points at a reachable production cluster, and a database named `gibous_release_gate_restore_20260824` exists there. The first database mutation deletes that database.

**Impact:** Irrecoverable deletion of the matching database unless an independent backup exists. The destructive path was not run against any live database.

**Reproduction steps:** Before the fix, run the script with the confirmation flag and a non-release-gate database URL; it reached the database connection path instead of refusing the target. The regression test uses an unreachable synthetic endpoint, so it cannot perform a mutation.

**Expected behavior:** Reject a database URL that is not exactly the known disposable release-gate source before any connection or DDL; never overwrite a pre-existing restore target.

**Actual behavior before fix:** The script connected to the URL's server and dropped its fixed-name restore database without validating the target URL database.

**Recommended fix:** Require the decoded database name to equal the exact release-gate source database, then query `pg_database` and abort if the fixed restore target already exists. The script now implements both guards.

**Regression test:** `tests/unit/scripts/backup-restore-safety.test.ts` asserts that an arbitrary database name is rejected before a network connection. It failed before the guard and passes after it.

**Status:** Fixed in this working tree; no live database was touched.

### ARCH-001 — Financial database is configured on an expiring, unbacked free plan

**Severity:** High

**Category:** Reliability / Database

**Confidence:** High Confidence

**Affected component:** Render web service and PostgreSQL database provisioning.

**Location:** `render.yaml:5`, `render.yaml:80`.

**Evidence:** The Blueprint sets `plan: free` for both the web service and database. Render's current documentation says free Postgres databases expire 30 days after creation, become inaccessible after expiry, and are deleted after a further 14-day grace period; free Postgres also does not support managed backups or point-in-time recovery. Render advises against free instances for production. Sources: [Render free instances](https://render.com/docs/free), [Render Postgres backups](https://render.com/docs/postgresql-backups).

**Problem:** The application stores user balances, deposits, withdrawal state, match escrow, and settlement records in PostgreSQL. The checked-in deployment definition provisions the database tier with a bounded lifetime and no provider-managed recovery.

**Root cause:** Cost-tier selection is encoded directly in the deployment Blueprint without a production durability guard or a backup/export lifecycle.

**Failure scenario:** If this Blueprint provisions the production database and the service owner does not upgrade or export it before its expiry/grace period, the financial database becomes inaccessible and may be deleted. Service restarts or maintenance can also cause downtime; no hosted database recovery evidence was available.

**Impact:** Users may lose access to balances and transaction histories, withdrawals and deposits may be unavailable, and deletion can make financial reconstruction require external chain records and manual repair. Actual deployment state and whether this Blueprint was applied were not checked.

**Reproduction steps:** Inspect `render.yaml` and the cited Render free-tier documentation. No live service was changed or queried.

**Expected behavior:** Production financial persistence uses a paid durable tier with configured backups/PITR, tested restoration, and operational alerts before expiry or resource exhaustion.

**Actual behavior:** The repository's production Blueprint selects the free tier and defines no backup procedure.

**Recommended fix:** Before handling real user balances, select a supported production database plan, enable available backup/PITR features, schedule independent exports, and rehearse restoration. Keep free deployments for disposable previews only.

**Regression test:** Add a release/deployment check that rejects a production Blueprint using a free database or missing the approved backup/restore policy; separately run and record a restore drill.

**Related findings:** FIN-001.

### FIN-001 — No balanced journal or custody-to-liability reconciliation is implemented

**Severity:** Medium

**Category:** Financial Integrity / Architecture

**Confidence:** High Confidence

**Affected component:** Deposit, withdrawal, escrow, settlement, and platform accounting.

**Location:** `server/db/schema.sql` financial tables; `server/db/index.ts` settlement and transaction methods; [PROJECT_ARCHITECTURE.md:124-133](../../PROJECT_ARCHITECTURE.md) and [PROJECT_ARCHITECTURE.md:396-400](../../PROJECT_ARCHITECTURE.md).

**Evidence:** The `transactions` table stores per-user deltas and resulting balances. The separate treasury tables track fees/volume. There are no debit/credit account postings that balance each operation. The architecture review explicitly classifies double-entry as not implemented and notes that an external payout reconciliation dashboard/job is absent. Deposit verification checks individual transfers, and payout processing checks the signer wallet's balance, but no code was found that periodically compares total on-chain custody with user liabilities and pending obligations.

**Problem:** Per-user balance rows and a transaction history do not alone demonstrate that the platform's total liabilities are backed by custody or that all cross-account value movements balance. There is no independent reconciliation process to detect missing credits, duplicated postings, or reserve shortfalls.

**Root cause:** Accounting is split among user balance deltas, match settlement records, and aggregate treasury counters rather than a canonical journal and reconciler.

**Failure scenario:** If a provider event or local database write is omitted, duplicated, or incorrectly associated, an individual intent may appear internally consistent while the total user-liability balance diverges from the on-chain wallet. The current repository provides no scheduled comparison and alert path to identify that discrepancy.

**Impact:** A discrepancy may remain undetected until a withdrawal fails or a manual review occurs; repair may require matching historical transactions and can be irreversible if evidence is unavailable. No actual discrepancy was observed, and no live balances were inspected.

**Reproduction steps:** Inspect schema tables and search for a reconciliation job comparing TON account balances/transactions with user liabilities; the only existing reconciliation paths concern interrupted game settlements and individual payout outcomes.

**Expected behavior:** Each financial event has auditable, balanced postings (or a documented alternative accounting model), and a recurring reconciliation compares external custody/provider records with internal deposits, payouts, fees, and liabilities, alerting on differences.

**Actual behavior:** User deltas and aggregate treasury totals exist; a balanced journal and custody-to-liability reconciliation are not present in the inspected repository.

**Recommended fix:** Define the accounting model with an accountant, introduce a journal with idempotent operation references and balanced postings, and implement a read-only TON/provider reconciliation job with durable discrepancy records and alerts before enabling automatic payouts.

**Regression test:** Property tests must assert balanced entries for every deposit, withdrawal, refund, escrow, and settlement. Integration tests should inject missing/duplicate provider records and prove the reconciler detects the exact discrepancy without rewriting history.

**Financial detail:** Amounts use integer nano-units; the expected value invariant is total debits equal total credits per operation and currency, with explicit treasury fee postings. Deposit, withdrawal, escrow, settlement, and refund statuses are separate. Funds could be temporarily misreported or become difficult to reconcile; no loss was reproduced. Recovery would require external chain records and manual repair until a journal/reconciler exists.

**Related findings:** ARCH-001.

### SEC-001 — Production PostgreSQL TLS does not authenticate the peer certificate

**Severity:** Medium

**Category:** Security / Configuration

**Confidence:** Potential

**Affected component:** PostgreSQL connection pool in production.

**Location:** `render.yaml:18`; `server/db/index.ts:186-191`.

**Evidence:** Render sets `PGSSL_REJECT_UNAUTHORIZED` to `false`, and the production pool sets TLS `rejectUnauthorized` from that variable. Node therefore encrypts the connection but accepts an untrusted/self-signed server certificate. Render's documentation distinguishes internal self-signed TLS (where certificate verification is not supported) from external connections with managed certificates. Sources: [Render Postgres connection docs](https://render.com/docs/postgresql-creating-connecting), [node-postgres SSL configuration](https://node-postgres.com/features/ssl).

**Problem:** Encryption alone does not prove the application connected to the intended database. A party able to intercept or redirect traffic within the relevant network path could present a different certificate and attempt to capture database credentials/data.

**Root cause:** The implementation treats certificate verification as a boolean workaround, while the Render internal database endpoint uses a self-signed TLS certificate.

**Failure scenario:** Under a network-positioned attack or compromised network/name-resolution path, the application accepts an attacker-controlled TLS certificate and may send database credentials and financial records to an impersonating endpoint. The internal Render networking model reduces exposure but does not provide certificate identity validation.

**Impact:** Potential database credential disclosure, unauthorized database access, or data interception/modification. Exploitation was not attempted; no evidence of a live interception exists.

**Reproduction steps:** Read the production Render environment setting and the `pg.Pool` SSL options. No live connection was probed.

**Expected behavior:** Production database connections authenticate the expected server identity or use a documented trusted private-network trust model with appropriate network isolation and secret rotation.

**Actual behavior:** TLS is enabled but certificate authentication is explicitly disabled for the configured Render service.

**Recommended fix:** Confirm whether the Blueprint uses Render's internal or external database URL. For internal self-signed connections, document that peer verification is unavailable and rely on private networking plus strict access controls; for external managed TLS, enable hostname/CA validation. Avoid globally setting `rejectUnauthorized: false` without constraining the endpoint and documenting the trust boundary. Validate connectivity before rollout.

**Regression test:** Add configuration tests that assert the intended TLS mode for internal and external database URLs and fail if production silently uses an unreviewed trust setting.

**Related findings:** ARCH-001.

### SEC-002 — Public metrics endpoint exposes runtime and operational telemetry

**Severity:** Low

**Category:** Security / Information Disclosure

**Confidence:** Confirmed

**Affected component:** HTTP metrics API.

**Location:** `server/server.ts:231-233`; `server/observability.ts:182-240`.

**Evidence:** `GET /api/metrics` directly returns `metrics.getSnapshot()` without authentication or an IP allowlist. The snapshot includes counters, gauges, latency histograms, process/host CPU, memory usage, uptime, and event-loop lag.

**Problem:** Any internet client able to reach the app can read service activity and host-capacity telemetry. This gives an unauthenticated caller operational information useful for reconnaissance and exposes infrastructure usage to the public.

**Root cause:** The metrics snapshot is mounted as a normal public application route rather than behind an operator-only boundary.

**Failure scenario:** An unauthenticated client polls the endpoint to infer service load, deployment restarts, resource pressure, or which operations are active, then uses that information to time targeted traffic. No direct secret or personal identifier was found in the snapshot structure.

**Impact:** Limited information disclosure and an additional public endpoint that computes a CPU/memory snapshot and sorts histogram samples. No exploitation or service degradation was reproduced.

### UI-001 — Open-room cards did not map the server's host identity

**Severity:** Low

**Category:** User Interface / Data Mapping

**Confidence:** Confirmed

**Affected component:** Lobby open-room cards and host-name search.

**Location:** `src/components/lobby/LobbyScreen.tsx`; regression coverage: `tests/e2e/scenario-coverage.spec.ts`.

**Evidence:** The server publishes room snapshots with the host nested at `room.p1.name`, while `LobbyScreen` rendered and filtered `room.hostName`. Browser output showed a blank host heading and the join button label `Join undefined's room`; host-name search could not match the host.

**Fix:** Normalize incoming room snapshots to use `p1.name` and `p1.avatarUrl` when top-level `hostName`/`hostAvatar` are absent, with a safe display fallback. The expanded browser scenario verifies the actual host name on the matching room card and that the search returns it.

**Status:** Fixed in this working tree.

### DEP-002 — Signed deposit intent could be cancelled before verification

**Severity:** Low

**Category:** Reliability / Deposit Lifecycle

**Confidence:** Confirmed

**Affected component:** Persistent deposit-intent cancellation.

**Location:** `server/storage.ts`, `server/db/index.ts`; regression coverage: `tests/postgres/deposit-withdrawal-transactions.test.ts`.

**Evidence:** Cancellation changed any pending intent to cancelled, including one with a signed BOC. The verifier only loads pending intents, so cancelling after BOC submission could remove a transfer from automatic verification and leave it uncredited.

**Fix:** Cancellation now uses an atomic conditional update requiring `status = 'pending'` and `boc IS NULL`. A signed intent stays pending and can still be confirmed. Regression coverage verifies it remains in the verifier queue and credits after confirmation.

**Status:** Fixed in this working tree.

### DEP-003 — Deposit confirmation did not require a submitted BOC

**Severity:** Low

**Category:** Financial Integrity / Deposit Confirmation

**Confidence:** Confirmed

**Affected component:** Database deposit credit operation.

**Location:** `server/db/index.ts`; regression coverage: `tests/postgres/deposit-withdrawal-transactions.test.ts`.

**Evidence:** The confirmation method could credit any pending intent if called without a prior BOC submission. The current verifier calls it after matching an on-chain transfer, but the database method did not enforce that precondition itself.

**Fix:** Confirmation now requires a non-empty transaction hash and a BOC-bound intent before crediting. Added PostgreSQL scenarios verifying an unsigned draft and an empty hash leave the balance and ledger unchanged.

**Status:** Fixed in this working tree.

### DEP-004 — Malformed deposit timestamps bypassed the matching time window

**Severity:** Low

**Category:** Reliability / Deposit Verification

**Confidence:** Confirmed

**Affected component:** TON deposit transaction matching.

**Location:** `server/tonVerifier.ts`; regression coverage: `tests/unit/server/ton-verifier-expanded-scenarios.test.ts`.

**Evidence:** A missing or nonnumeric `transaction.now` produced `NaN` during the time-window comparisons. Both comparisons evaluated false, so an otherwise matching row could pass without a valid timestamp. A malformed row could also throw and prevent scanning later valid rows. Added vault and sender lookup scenarios reproduce both cases.

**Fix:** Matching now requires a finite numeric timestamp, rejects bounced inbound transfers, and skips malformed transactions/messages/hashes so later candidates are still checked.

**Status:** Fixed in this working tree.

### PAY-001 — Malformed masterchain sequence numbers counted as payout finality

**Severity:** Medium

**Category:** Financial Integrity / Payout Finality

**Confidence:** Confirmed

**Affected component:** TON Center finality response parsing for withdrawal payouts.

**Location:** `server/withdrawalPayout.ts`; regression coverage: `tests/unit/server/withdrawal-payout-scenarios.test.ts`.

**Evidence:** The prior check converted `mc_block_seqno` to a number and rejected only values `<= 0`. A malformed string became `NaN`; since `NaN <= 0` is false, a matching account row could be treated as masterchain-finalized without a valid sequence number. The expanded finality response cases verify malformed, fractional, boolean, and valid values.

**Fix:** Finality now requires a positive safe integer number or a digit-only positive integer string. Invalid provider evidence fails closed.

**Status:** Fixed in this working tree.

### DEP-001 — PostgreSQL deposit-intent owner could not cancel their intent

**Severity:** Low

**Category:** Reliability / Deposit Lifecycle

**Confidence:** Confirmed

**Affected component:** Deposit-intent cancellation in persistent storage.

**Location:** `server/storage.ts`; regression coverage: `tests/postgres/deposit-withdrawal-transactions.test.ts`.

**Evidence:** PostgreSQL returns the `telegram_id` bigint as a string. The cancellation service compared it strictly to the numeric ID from the authenticated session, so an owner was rejected as unauthorized and the pending intent remained open. The PostgreSQL regression reproduced the failure before the fix.

**Fix:** Compare the normalized numeric ID, matching the ownership check used by deposit submission. Added tests for owner cancellation, cross-account rejection, and refusing to bind a BOC after cancellation.

**Status:** Fixed in this working tree.

### UI-005 — Invalid deposit-intent response left a draft open

**Severity:** Low

**Category:** User Interface / Deposit Lifecycle

**Confidence:** Confirmed

**Affected component:** Deposit initiation in the bank screen.

**Location:** `src/components/bank/BankScreen.tsx`; regression coverage: `tests/component/bank/BankScreen.test.tsx`.

**Evidence:** When the server returned a created intent without the required memo, the client stopped before opening the wallet but did not cancel the server-created draft. The draft could remain open until its normal expiry even though the user could not proceed.

**Fix:** Cancel the draft intent when the response omits a memo or memo payload encoding fails. Added a regression test verifying cancellation and that no wallet transaction is sent.

**Status:** Fixed in this working tree.

### UI-002 — Full Connect 4 columns displayed a zero-based column number

**Severity:** Low

**Category:** User Interface / Game Feedback

**Confidence:** Confirmed

**Affected component:** Connect 4 full-column rejection.

**Location:** `server/engines/Connect4Engine.ts`; regression coverage: `tests/e2e/scenario-coverage.spec.ts`.

**Evidence:** Filling the first column and attempting another drop produced the visible message `Column 0 is full`, although the board labels columns from 1 through 7.

**Fix:** Convert the internal zero-based index to a one-based number in the message. The browser scenario fills the first column, confirms the board stays unchanged, and expects `Column 1 is full`.

**Status:** Fixed in this working tree.

### UI-003 — Failed lobby joins generated duplicate, conflicting alerts

**Severity:** Low

**Category:** User Interface / Error Feedback

**Confidence:** Confirmed

**Affected component:** Lobby WebSocket error handling.

**Location:** `src/components/lobby/LobbyScreen.tsx`; regression coverage: `tests/e2e/scenario-coverage.spec.ts`.

**Evidence:** A low-balance join emitted a global toast with the specific `Insufficient balance` reason and a second lobby alert with the generic `Could not join this duel. It may be full or no longer available.` text. This gave the user two conflicting explanations for one rejected request.

**Fix:** Remove the lobby's duplicate global `ERROR` subscription. The shared error toast remains the single server-error notification; client-side invalid room-code feedback remains inline. The browser scenario verifies one specific insufficient-balance alert and no generic duplicate.

**Status:** Fixed in this working tree.

### UI-004 — Rock Paper Scissors round counter lagged after a tie

**Severity:** Low

**Category:** User Interface / Game State

**Confidence:** Confirmed

**Affected component:** Rock Paper Scissors round result state.

**Location:** `src/state/useGameStore.ts`; regression coverage: `tests/e2e/scenario-coverage.spec.ts`.

**Evidence:** The server's `RPS_ROUND_RESOLVED` payload includes both the completed `round` and `nextRound`. The client stored the completed round as the current round after a tie, so the choices unlocked for round two while the header still displayed round one. A phone-sized browser run reproduced this state.

**Fix:** Set the current round from `nextRound` when provided, retaining `round` as a fallback. The mobile browser scenario verifies that a tie advances the header to round two without changing either score.

**Status:** Fixed in this working tree.

### DEP-005 — Large nano values rounded during nano-to-gram conversion

**Severity:** Medium

**Category:** Financial Integrity / Deposit Accounting

**Confidence:** Confirmed

**Affected component:** Deposit credits, balance updates, transaction display columns, treasury display columns, and withdrawal refunds.

**Location:** `server/db/index.ts`, `server/db/schema.sql`, `server/db/migrations/014_exact_nano_gram_conversion.sql`; regression coverage: `tests/unit/economy/payment-safety-matrix.test.ts` and `tests/postgres/payment-critical-scenarios.test.ts`.

**Evidence:** In-memory deposit confirmation previously derived the next nano balance from floating-point `balance_gram`. PostgreSQL also used `ROUND(balance_nano / 1000000000.0, 9)`; a live disposable PostgreSQL reproduction converted `999999999999999999` nano to `1000000000.000000000` grams, violating the balance-unit invariant. Exact BigInt arithmetic and a PostgreSQL `nano_to_gram` quotient/remainder function now preserve every nano-unit. Migration 014 rebuilds stored generated display columns so existing databases receive the corrected conversion. Monetary input strings are capped at 30 digits to match the current numeric storage precision. The new persistent tests verify exact credits and ledger balances up to the supported boundary.

**Status:** Fixed in this working tree.

### DEP-006 — Repeated deposit confirmation accepted different transaction evidence

**Severity:** Low

**Category:** Financial Integrity / Idempotency

**Confidence:** Confirmed

**Affected component:** Deposit confirmation retries.

**Location:** `server/db/index.ts`; regression coverage: `tests/unit/economy/payment-safety-matrix.test.ts` and `tests/postgres/deposit-withdrawal-transactions.test.ts`.

**Evidence:** Once an intent was confirmed, an idempotent retry returned success without checking that its transaction hash matched the originally stored hash. It did not add a second credit, but incorrectly treated changed evidence as the same operation. Retries now succeed only for the original normalized hash; a different hash is rejected. Twenty regression cases verify same-evidence replay and changed-evidence rejection.

**Status:** Fixed in this working tree.

### PAY-002 — Withdrawal quote accepted noncanonical amount strings

**Severity:** Low

**Category:** Financial Integrity / Input Validation

**Confidence:** Confirmed

**Affected component:** Withdrawal quote amount and fee validation.

**Location:** `server/storage.ts`; regression coverage: `tests/unit/economy/payment-safety-matrix.test.ts`.

**Evidence:** `BigInt` accepts representations such as leading whitespace and an explicit plus sign. The quote path previously parsed these despite the money protocol requiring unsigned decimal nano strings of bounded length. It now requires one to 30 decimal digits for gross amount and fee before parsing; the 30-digit bound matches the generated gram columns' precision. Tests cover signs, whitespace, fractions, empty and oversized values, unsupported network, fee violations, balance limits, and daily caps.

**Status:** Fixed in this working tree.

### Payment safety scenario expansion

Added 100 deposit and 100 withdrawal cases in `tests/unit/economy/payment-safety-matrix.test.ts`, plus 100 deposit and 100 withdrawal PostgreSQL cases in `tests/postgres/payment-critical-scenarios.test.ts`. Persistent scenarios cover transaction-hash uniqueness races, submission/cancellation races, cross-account BOC claims, rollback on ledger conflicts, exact persisted amounts, independent quote double-spend races, payout fencing, and idempotent failure refunds. These checks use disposable PostgreSQL and mocked chain evidence; they do not establish live TON provider behavior.

**Reproduction steps:** Send an unauthenticated `GET /api/metrics` request to the route in `server/server.ts`; runtime request was not made in this audit.

**Expected behavior:** Detailed metrics are available only to an authorized monitoring network or operator credential; a public health endpoint exposes only minimal readiness state.

**Actual behavior:** The route returns the full in-memory metrics snapshot to every caller.

**Recommended fix:** Put metrics on a private listener or protect this route with an operator authentication/IP restriction. If public monitoring is intentional, return only a deliberately minimal aggregate.

**Regression test:** An integration test should verify unauthenticated access is denied and an authorized monitoring request succeeds.

## Previously addressed findings

The existing 2026-10-15 report documents fixes for unauthenticated Telegram webhooks, unsafe deposit attribution, repeated WebSocket identity changes, Render CORS/startup mismatch, PostgreSQL-to-memory fallback, and profile persistence. Current source contains the described controls. These historical issues are not counted as open findings here.

## Coverage limits

The requested Codex Security Deep Scan terminated on a usage-limit error after three unsuccessful workers, before it returned a successful discovery manifest. This audit therefore has no completed multi-pass scanner output. The active security tool set no longer exposed scan-context retrieval, so saved candidates or findings could not be reconciled. See the exact error in the executive summary. Production systems, external providers, credential rotation, live PostgreSQL data, mainnet finality, and actual backup configuration remain unverified.
