# Testing Gaps and Verification — 2026-10-16

## Current verification

| Check | Current result | Limits |
|---|---|---|
| `npm run typecheck` | Passed | Client and server TypeScript checks completed with exit code 0. |
| `npm run build` | Passed | Vite built successfully. It warns that the deferred TON Connect bundle is 550.29 kB, above the 500 kB advisory threshold. |
| `git diff --check` | Passed | No whitespace errors; Git printed existing LF/CRLF conversion warnings for two overlay files. |
| `npm test -- --no-file-parallelism --maxWorkers=1` in sandbox | Could not start | esbuild child process failed with `spawn EPERM`. |
| Same full Vitest command outside the sandbox | Passed: 955 passed, 247 skipped; 109 files (107 passed, 2 skipped) | Duration 233.14 seconds. The skipped tests are the opt-in PostgreSQL suites, verified separately against a disposable database. |
| Focused backup/restore safety regression | Passed: 1 test | Failed before the fix because the script attempted a network connection for a non-release-gate URL; passed after adding the database-name and restore-target guards. |
| PostgreSQL deposit/withdrawal suite | Passed: 47/47, including 41 added cases | Fresh localhost-only disposable database; covered intent ownership, cancellation, mismatch, expiry, and quote/network/fee/balance/limit boundaries. |
| Playwright E2E | Passed: 46/46 across all configured browser files | Added 40 browser scenarios over the original suite, including 15 mobile-first flows. The final run used headed Chromium and a disposable localhost database; headless mode could not launch because the expected Playwright headless-shell binary is missing. |
| Bank deposit/withdrawal component tests | Passed: 29/29, including 15 new scenarios | Wallet, RPC, and service behavior are mocked; this checks client flow and messaging, not TON Mainnet execution. |
| Deposit verifier and payout worker edge cases | Passed: 167/167 across five suites; the latest batch adds 50 deposit and 50 withdrawal scenarios | Covers both deposit lookup paths, malformed/bounced TON rows, timestamp boundaries, payout config, provider finality responses, encryption recovery, worker fencing, timers, and ambiguous sends. Uses mocked TON provider responses and in-memory persistence; it does not exercise a live chain. |
| Payment safety matrix | Passed: 243/243 across the 200-case matrix and existing deposit/withdrawal unit suites | Adds exactly 100 deposit and 100 withdrawal cases. Includes nano precision, same/different evidence retries, concurrent duplicate requests, BOC claims, owner isolation, key collisions, input boundaries, insufficient funds, and daily caps. In-memory persistence; PostgreSQL-specific evidence remains in its separate suite. |
| Critical PostgreSQL money matrix | Passed: 200/200 new scenarios; existing PostgreSQL transaction suite also passed 47/47 | Adds 100 deposit and 100 withdrawal cases against disposable PostgreSQL. Exercises hash/BOC uniqueness races, cancellation races, transaction rollback, exact numeric persistence, multi-quote double-spend, stale payout fencing, and retry-safe refunds. Chain/provider behavior is simulated. |
| Dependency advisories | Not checked live | No package-registry advisory query completed in this review. |
| Deep security scan | Terminal failure | Three workers failed due usage limit; no successful scan manifest. |

## Existing coverage observed

The suite includes unit and integration tests for Telegram auth, WebSocket admission/reconnect, game engine invariants, deposit attribution, withdrawals, payout worker behavior, settlement retry/concurrency, PostgreSQL transactions, UI components, contracts, and property invariants. Existing Playwright flows include create/join, disconnect/reconnect, stake breakdown, and resignation. This is materially stronger than a unit-only suite, but does not prove production provider behavior.

## Required additional coverage

1. **Deployment durability gate:** reject a production financial deployment on a free/expiring database plan or without an approved backup/restore procedure.
2. **Release-gate isolation:** `backup-restore.ts` now validates the exact disposable source database and refuses an existing restore target; retain the regression test.
3. **Accounting journal properties:** every deposit, debit, refund, escrow, win/draw settlement, fee, and withdrawal should balance per operation and currency.
4. **Custody reconciliation:** verify detection and alerting for missing, duplicated, delayed, and mismatched TON transfers, stale pending intents, and payout discrepancies.
5. **Metrics authorization:** unauthenticated requests must not retrieve detailed operational metrics.
6. **TLS configuration:** test intended database TLS mode for internal self-signed and external managed endpoints; fail production config on unreviewed certificate-validation bypass.
7. **Recovery drills:** restore an independent backup, replay pending payout state, recover interrupted migration/settlement, and prove no duplicate credit or payout.
8. **Provider fault tests:** inject timeout after successful broadcast, out-of-order/duplicate indexer events, malformed provider responses, and incomplete finality data.
9. **Load and availability:** measure bounded request/connection behavior and pool/queue exhaustion in an isolated environment; no performance figures were generated here.

## Payment safety guidance applied

- Transaction authorization binds a user's confirmation to the full transaction and enforces allowed state transitions server-side ([OWASP Transaction Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html)).
- Financial retries use stable idempotency keys, reject changed parameters, and preserve integer amounts and atomic state changes ([OWASP Business Logic Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Business_Logic_Security_Cheat_Sheet.html), [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)).
- TON deposits are credited only after chain finality evidence meets TON's payment guidance ([TON payment processing](https://docs.ton.org/applications/payments/overview)).

## Execution status

The full Vitest run completed successfully with 955 passing tests and 247 skips; the skipped tests are the opt-in PostgreSQL suites. Focused Connect 4 and release-gate safety regressions passed 43/43 after the UI and database safety fixes. The PostgreSQL deposit/withdrawal suite passed 47/47, including 41 added cases; the critical PostgreSQL suite passed 200/200. Deposit/withdrawal unit and WebSocket regression tests passed 97/97. All 46 configured browser E2E tests passed, including 40 new browser scenarios, 15 of them mobile-first. The bank component suite passed 29/29, including 15 added deposit/withdrawal scenarios. The combined deposit-verifier and withdrawal-payout worker suites passed 167/167, including the latest 50 deposit and 50 withdrawal cases. The payment safety matrix and existing deposit/withdrawal suites passed 243/243, including 100 new cases for each money movement. Project client/server type checking passed. New PostgreSQL scenarios exposed imprecise large-number nano-to-gram conversion; conversion now uses exact quotient/remainder arithmetic, and migration 014 rebuilds the generated columns. These checks do not verify TON Mainnet execution, deployment configuration, backup restoration, or real provider failure behavior.
