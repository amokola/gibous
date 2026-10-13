# Automatic Gram (GRAM) Withdrawals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic, restart-safe native Gram payouts on TON Mainnet through the existing server, with server-generated fixed fee quotes and accurate withdrawal status for players.

**Architecture:** PostgreSQL stores short-lived quotes and an explicitly eligible durable payout queue. The existing server process validates and confirms quotes, debits balances atomically, and runs one serialized payout worker using a dedicated secret-manager supplied wallet. The client confirms the server's quote and follows persisted status until chain-finalized completion or a definite, once-refunded failure.

**Tech Stack:** TypeScript, PostgreSQL (`pg`), existing WebSocket/Zod protocol, `@ton/core`, `@ton/crypto`, `@ton/ton`, Node crypto, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-13-automatic-withdrawal-payouts-design.md`

## Global Constraints

- Gram (GRAM) is the native coin and TON names the network; use Gram/GRAM in user-facing copy.
- The user submits a gross amount; the recipient receives gross minus the server-quoted fee, and that accepted fee never changes.
- Confirmation immediately debits gross once; only definite failure restores gross with one positive refund ledger entry.
- The payout signer is a dedicated low-balance wallet whose key comes from the deployment secret manager; the worker stays in the existing server process.
- `PAYOUT_WORKER_ENABLED=false` remains the default; payout enablement requires explicit network, RPC, signer, and all payout limits.
- The payout adapter accepts TON Mainnet only (`PAYOUT_NETWORK=mainnet`); it does not deploy or send payouts on testnet.
- Store all Gram amounts as integer base units; one Gram equals 1,000,000,000 base units.
- Chain completion requires finalized evidence for the sender transaction and exact outgoing destination and amount; ambiguous outcomes remain in reconciliation and are never refunded automatically.
- Existing withdrawals default to payout-ineligible; only new quote-confirm withdrawals can enter the worker queue.
- Mainnet enablement is gated on mocked failure-recovery coverage and legacy withdrawal reconciliation.

## Review Focus

- A repeated or mismatched quote/idempotency key must return the original withdrawal or reject the mismatch without a second debit.
- Concurrent confirmations must not overdraw a user's balance or exceed per-user or global daily limits.
- An RPC timeout, lost response, stale worker, crash, or expired signed message must reconcile the original send before any replacement or refund.
- A transfer with a bounced/failed outgoing message must not be marked completed; refund only after its final outcome is established.
- Malformed addresses, expired quotes, disabled worker, missing secrets/limits, and insufficient wallet reserve must fail closed without accepting or broadcasting a payout.

---

### Task 1: Durable withdrawal schema and migration

**Files:**
- Modify: `server/db/schema.sql`
- Create: `server/db/migrations/013_gram_withdrawal_payouts.sql`
- Modify: `server/db/migrate.ts`
- Test: `tests/integration/persistence/withdrawal-migration.test.ts`

**Interfaces:**
- Produces the database fields and constraints consumed by Tasks 2 and 3: persisted withdrawal quotes; quote linkage; withdrawal net amount/network; payout eligibility/source; signed payload/hash/seqno/`valid_until`; worker lease/fencing fields; and reconciliation timestamps.

- [ ] **Step 1: Add migration coverage for legacy exclusion and database uniqueness**

Add a focused persistence migration test following `tests/integration/persistence/deposit-index.test.ts`. Assert the new migration and fresh schema agree on `payout_eligible = false` for legacy rows, quote-to-withdrawal uniqueness, unique `operation_key`, and one-refund-per-withdrawal enforcement. Where a PostgreSQL test database is available, also assert the constraints reject duplicate rows.

- [ ] **Step 2: Add schema and migration**

Create migration `013_gram_withdrawal_payouts.sql`, add the matching fresh-install schema in `schema.sql`, and register `013_gram_withdrawal_payouts` in the ordered migration list. Add a `withdrawal_quotes` table with owner, canonical destination, gross/fee/net base-unit values, network, expiry, and consumed withdrawal link. Extend `withdrawals` with a net amount, network, `payout_eligible` defaulting false, serialized transaction/reconciliation fields, and lease/fence data. Add appropriate status/amount checks and the unique constraints described above. Extend the transaction ledger type check for the dedicated refund entry.

- [ ] **Step 3: Run the targeted migration/withdrawal tests**

Run: `npx vitest run tests/integration/persistence/withdrawal-migration.test.ts tests/unit/economy/withdrawal.test.ts`

Expected: existing withdrawal cases pass; legacy rows are ineligible; duplicate quote linkage and duplicate refunds are rejected by PostgreSQL constraints.

### Task 2: Atomic quote, confirmation, payout, and refund persistence

**Files:**
- Modify: `server/db/index.ts`
- Modify: `server/storage.ts`
- Test: `tests/unit/economy/withdrawal.test.ts`
- Test: `tests/unit/economy/storage-escrow.test.ts` (only if shared balance-lock behavior requires it)

**Interfaces:**
- Add `StorageService.createWithdrawalQuote({ telegramId, walletAddress, grossAmountNano, feeNano, network }): Promise<WithdrawalQuoteResult>`.
- Add `StorageService.confirmWithdrawalQuote({ telegramId, quoteId, operationKey }): Promise<WithdrawalConfirmationResult>`.
- Add `DatabasePool` operations for quote creation/expiry, atomic confirmation, eligible-work claim, persisted signed transaction, lease renewal/release, finalized completion, definite failure/refund, and withdrawal status reads.
- All amount parameters and return values use base-unit integer strings; quote response includes `quoteId`, `grossAmountNano`, `feeNano`, `netAmountNano`, `expiresAt`, and `network`.

- [ ] **Step 1: Add focused tests for quote boundaries and idempotent confirmation**

Test malformed destination, non-positive gross, fee greater than/equal to gross, expired quote, quote ownership mismatch, duplicate confirmation returning one withdrawal/debit, and reusing an operation key with a different quote being rejected.

- [ ] **Step 2: Implement quote persistence and server-authoritative confirmation**

Validate and canonicalize the TON address before storing the quote. Confirmation locks the quote and user balance row in one transaction, serializes global limit accounting, checks balance and configured limits, consumes the quote, creates one `pending` eligible withdrawal, immediately debits gross, and writes one negative ledger row. Never trust client fee or net values.

- [ ] **Step 3: Add concurrency, limit, and refund uniqueness tests**

Test two simultaneous confirmations of the same quote, two withdrawals competing for one balance, concurrent user/global daily-limit checks, and duplicate refund calls. Assert one debit per accepted quote, a non-negative balance, enforced limits, and exactly one positive refund entry.

- [ ] **Step 4: Implement conditional database state transitions**

Implement eligible pending claim with the single-wallet lock and a monotonically increasing fencing token. Add conditional lease renewal and state transitions. Persist the exact signed transaction envelope, hash, seqno, `valid_until`, and message details before broadcast. On retryable failure, keep the request in processing/reconciliation. On finalized success, mark completed without a second debit. On provable failure, atomically mark failed and insert the unique refund ledger entry while crediting gross exactly once.

- [ ] **Step 5: Add restart and finality repository tests**

Test that an expired lease reclaims a withdrawal into reconciliation, an ineligible legacy row is never claimable, a completed transfer requires the final exact message data, and a stale fencing token cannot begin a new send or refund.

- [ ] **Step 6: Run targeted withdrawal tests**

Run: `npx vitest run tests/unit/economy/withdrawal.test.ts`

Expected: atomicity, uniqueness, eligibility, and conditional state-transition assertions pass.

### Task 3: TON payout client and in-process worker

**Files:**
- Create: `server/withdrawalPayout.ts` (typed Mainnet client, secret/config validation, and in-process worker)
- Modify: `.env.example`
- Modify: `package.json`, `package-lock.json` (add `@ton/crypto` as a direct dependency for mnemonic-to-key derivation)
- Test: `tests/unit/server/withdrawal-payout-worker.test.ts`

**Interfaces:**
- `TonWithdrawalPayoutClient.estimateFee({ destination, amountNano, memo }): Promise<bigint>`
- `TonWithdrawalPayoutClient.prepareSignedTransfer({ destination, amountNano, memo, seqno, validUntil }): Promise<SignedPayoutTransaction>`
- `TonWithdrawalPayoutClient.broadcast(signedTransaction): Promise<void>`
- `TonWithdrawalPayoutClient.inspectTransaction({ messageHash, seqno }): Promise<PayoutInspection>`
- `WithdrawalPayoutWorker.start(): Promise<void>`, `stop(): Promise<void>`, and `getHealth(): WithdrawalWorkerHealth`.
- The worker receives `StorageService`, the TON client, validated limits/config, and a status callback; it must not create a second process or service.

- [ ] **Step 1: Add fake-client tests for the worker's critical failure paths**

Test signed payload persistence before broadcast, encrypted-at-rest payload round trip, rejection of missing/wrong encryption key, same-payload retry before `valid_until`, no new payload before old outcome reconciliation after expiry, lost RPC response, crash/restart recovery, no completion on non-final status, exact destination/amount matching, bounced transfer refund, low-wallet reserve, and stale lease fencing.

- [ ] **Step 2: Implement the typed TON wallet adapter**

Use the configured TON network and wallet implementation to estimate the native Gram transfer fee, derive and validate the dedicated wallet address, sign transfers with an explicit `valid_until`, broadcast the serialized transaction, and inspect sender/outgoing-message finality. Validate network/wallet identity at startup. Never include signer material in returned objects or logs.

- [ ] **Step 3: Protect persisted signed payloads and validate payout configuration**

Add `PAYOUT_NETWORK=mainnet`, `PAYOUT_SIGNER_MNEMONIC`, `PAYOUT_MIN_WITHDRAWAL_NANO`, `PAYOUT_MAX_WITHDRAWAL_NANO`, `PAYOUT_USER_DAILY_LIMIT_NANO`, `PAYOUT_GLOBAL_DAILY_LIMIT_NANO`, `PAYOUT_WALLET_RESERVE_NANO`, and `PAYOUT_TRANSACTION_ENCRYPTION_KEY` to `.env.example` with empty/disabled-safe examples. Keep `PAYOUT_WORKER_ENABLED=false`. Use AES-256-GCM with the 32-byte encryption key supplied through the deployment secret manager to encrypt persisted signed payloads. When enabled, fail closed unless `PAYOUT_NETWORK=mainnet` and on missing/invalid secret, invalid limits, RPC configuration, or expected-wallet mismatch.

- [ ] **Step 4: Implement worker lifecycle, serialization, and reconciliation**

Poll the durable queue in the server process. Claim through the database lease/fence, serialize all signer use, check the wallet's net amount plus actual fee plus minimum reserve, prepare and persist one signed payload before broadcasting, retry only that payload through `valid_until`, and reconcile before replacement or refund. Emit status changes through the injected callback. `stop()` must stop new claims and wait for or safely release current work.

- [ ] **Step 5: Run deterministic worker and client tests**

Run: `npx vitest run tests/unit/server/withdrawal-payout-worker.test.ts`

Expected: simulated timeouts, process recovery, expiry, finality, bounce, and secret/config failure cases pass without network access.

### Task 4: Server protocol, startup, status, and shutdown integration

**Files:**
- Modify: `shared/schemas/protocol.ts`
- Modify: `server/storage.ts`
- Modify: `server/server.ts`
- Modify: `src/services/multiplayerService.ts` only if new request/response helpers are needed
- Test: `tests/contract/withdrawal-protocol.test.ts`

**Interfaces:**
- Replace one-step `SUBMIT_WITHDRAWAL` with `REQUEST_WITHDRAWAL_QUOTE` (destination and gross amount), `CONFIRM_WITHDRAWAL` (quote ID), `WITHDRAWAL_QUOTED`, `WITHDRAWAL_PENDING`, and `WITHDRAWAL_UPDATED` messages.
- Accepted confirmation returns pending, never `TRANSACTION_CONFIRMED`.
- Worker status callback publishes `ACCOUNT_UPDATED`/`WITHDRAWAL_UPDATED`; account snapshots and reconnect data include real withdrawal status.

- [ ] **Step 1: Add protocol contract tests**

Assert quote and confirmation schemas reject client-supplied fee/net fields, successful acceptance returns pending, and completed/failed event payloads contain the stored withdrawal status and ID.

- [ ] **Step 2: Implement server quote/confirm handlers**

Wire request validation to `StorageService`, estimate the fee through the TON client, persist the quote, and return its gross/fee/net amounts. On confirmation, return a pending status and account update; do not label the payout completed when only the internal debit succeeded.

- [ ] **Step 3: Wire worker to process lifecycle and fail-closed readiness**

Construct the worker alongside existing services, start it only after database migrations and recovery initialization, keep new confirms unavailable when disabled/unhealthy, expose readiness/health state, and stop/drain the worker during `shutdown()` before closing storage.

- [ ] **Step 4: Correct withdrawal history status mapping**

Update `StorageService.getAccountSnapshot()` and database reads so withdrawal rows join to actual `pending`, `processing`, `completed`, or `failed` state. Preserve deposit pending behavior and do not mark every ledger entry confirmed. On reconnect, return the same persisted status.

- [ ] **Step 5: Run protocol/server contract checks**

Run: `npx vitest run tests/contract/withdrawal-protocol.test.ts` and `npm run typecheck:server`

Expected: wire schemas, pending semantics, startup configuration checks, and TypeScript interfaces pass.

### Task 5: Quote confirmation UI and accurate withdrawal history

**Files:**
- Modify: `src/components/bank/BankScreen.tsx`
- Modify: `src/state/eventRouter.ts`
- Modify: `src/App.tsx`
- Modify: `src/services/multiplayerService.ts` only if needed by Task 4
- Test: `tests/component/bank/BankScreen.test.tsx`

**Interfaces:**
- The bank screen requests a quote, displays gross amount, quoted fee, net payout, expiry, and network, then confirms only the returned quote ID.
- Pending withdrawal status is shown until the persisted server status changes; completed and failed/refunded states are distinct.
- User-facing copy says Gram/GRAM on TON; internal legacy SDK identifiers may retain existing names.

- [ ] **Step 1: Add component tests for the two-step flow and status labels**

Test that quote response renders gross/fee/net; confirmation submits only quote ID; expired/rejected quote can be requoted; acceptance shows pending; and only finalized server status shows completed. Failed status must show refund only after the server reports the refund.

- [ ] **Step 2: Implement client request and event handling**

Replace direct withdrawal submit with quote request and quote confirmation. Keep the entered wallet/amount editable before confirmation, but do not let client values override quote details. Handle server updates after client refresh/reconnect.

- [ ] **Step 3: Update account activity mapping and Gram terminology**

Map withdrawal status correctly in `App.tsx` and the bank transaction list. Do not show withdrawals as confirmed deposits. Use Gram/GRAM wording in the withdrawal flow and withdrawal history.

- [ ] **Step 4: Run component and client type checks**

Run: `npx vitest run tests/component/bank/BankScreen.test.tsx` and `npm run typecheck:client`

Expected: quote/confirmation and status UI tests pass; client types compile.

### Task 6: Mainnet recovery gate and deployment instructions

**Files:**
- Modify: `RELEASE_READINESS.md`
- Modify: `.env.example`
- Test: `tests/unit/economy/withdrawal.test.ts`
- Test: `tests/unit/server/withdrawal-payout-worker.test.ts`
- Test: `tests/component/bank/BankScreen.test.tsx`

**Interfaces:**
- No new product API. This task records required deployment settings, mocked-chain recovery scenarios, manual legacy reconciliation, and the mainnet disable/enable gate.

- [ ] **Step 1: Add regression coverage for the remaining spec release cases**

Ensure deterministic fake-client coverage includes two simultaneous same-quote confirms, competing balance/daily cap requests, duplicate refund, lost RPC response, crash after broadcast, expired signed transaction, recipient bounce, database/RPC unavailable fail-closed behavior, legacy ineligibility, and rejection of a testnet payout configuration. Do not broadcast to mainnet or testnet from automated tests.

- [ ] **Step 2: Document mainnet-only rollout and legacy reconciliation**

Update `RELEASE_READINESS.md` with the disabled default, `PAYOUT_NETWORK=mainnet`, secret-manager-only signer/encryption secrets, exact cap variables, dedicated wallet funding/reserve checks, no-broadcast recovery walkthrough, finality requirement, and explicit instruction to reconcile old completed withdrawals manually before mainnet. Do not enable live payouts in this change.

- [ ] **Step 3: Run the focused withdrawal release gate**

Run: `npx vitest run tests/integration/persistence/withdrawal-migration.test.ts tests/unit/economy/withdrawal.test.ts tests/unit/server/withdrawal-payout-worker.test.ts tests/contract/withdrawal-protocol.test.ts tests/component/bank/BankScreen.test.tsx`.

Expected: focused automated cases pass, including mocked crash/recovery behavior and strict mainnet-only configuration; no real chain transfer is sent.

## Dependency order

Implement Tasks 1 → 2 → 3 → 4 → 5 → 6. Tasks 1–3 define and test the durable finance and signer behavior before exposing it to clients. Task 4 integrates server lifecycle and protocol; Task 5 consumes that stable contract. Task 6 closes the mocked-chain release gate and keeps live mainnet enablement separate from feature implementation.
