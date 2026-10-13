# Automatic Gram (GRAM) Withdrawal Payouts on TON

**Status:** Draft for user review
**Date:** 2026-10-13

## Purpose

Allow a player to withdraw their internal Gram-denominated balance to a wallet on the TON network, with the existing game server automatically sending the on-chain payout. Keep the system in one deployable service and make accepted payouts recoverable after process restarts or uncertain network responses.

The payout signer is a dedicated, low-balance wallet. Its signing key is supplied to the deployment through its secret manager and is never committed, exposed to the client, or written to logs. The payout worker runs inside the existing server process; this design does not add a microservice.

## Decisions and scope

- **Terminology:** Gram (GRAM) is the native coin; TON names the network. Use “Gram” or “GRAM” in user-facing copy. Preserve established SDK, protocol, and database identifiers where changing them would create compatibility work; document their meaning clearly. The [official TON documentation](https://docs.ton.org/start-here) identifies Gram (GRAM) as TON's primary cryptocurrency.
- A withdrawal is paid on-chain automatically after the player confirms a server-generated quote.
- The player enters a **gross amount**. The server deducts the quoted network fee from that amount; the recipient receives `gross amount - quoted fee`.
- The quote is fixed when accepted. Any difference between the quoted and actual network fee is borne by the service.
- On confirmation, the service debits the gross amount immediately and records one negative ledger entry in the same database transaction. Do not also create a separate balance hold or apply a second debit when the payout is completed. A definite payout failure restores the gross amount exactly once with a positive refund ledger entry.
- A timeout or uncertain broadcast is not a failure. The payout remains in reconciliation and is never refunded until the server proves it was not paid.
- Historical withdrawals already marked `completed` are not replayed. Reconcile them outside the worker before enabling automatic payouts.
- Automatic payouts stay disabled by default and fail closed unless the signer, network, RPC endpoint, database, and required payout limits are configured.
- This payout implementation targets TON Mainnet only. If automatic payouts are enabled, reject any configuration other than `PAYOUT_NETWORK=mainnet`; testnet deposits elsewhere in the app are outside this payout path.
- This design covers native Gram transfers on TON. Jettons and other tokens are out of scope.

## Architecture

The existing server owns three responsibilities:

1. **Quote and request API:** validates the destination and amount, estimates the transaction fee, and persists a short-lived quote. On confirmation, it atomically checks the quote, balance, limits, and idempotency key; creates the withdrawal; immediately debits the gross amount; and writes the corresponding negative ledger entry.
2. **PostgreSQL payout queue:** stores each payout's state and durable transaction/reconciliation data. Only new withdrawals created through the quote-confirm flow are eligible for the worker. Existing completed records are never backfilled into this queue.
3. **In-process payout worker:** claims eligible withdrawals, serializes sends from the single payout wallet, broadcasts the transfer, and reconciles its chain status. A database lock/lease prevents multiple server instances from sending the same withdrawal concurrently. The worker stops accepting new work during graceful shutdown and leaves unfinished records recoverable.

Use a TON wallet implementation with network-bound wallet identity configured for Mainnet only. Refuse to start when the configured network, wallet identity, or RPC endpoint is inconsistent. TON wallet sequence numbers provide replay protection, and signed external messages have a `valid_until` expiry. Retry the same signed message only until that expiry; after expiry, reconcile wallet state and chain evidence before preparing any replacement. See [TON wallet replay protection and expiry](https://docs.ton.org/contracts/standard/wallets/how-it-works).

## User and server flow

### Quote

1. The client requests a quote with the destination address and gross withdrawal amount.
2. The server canonicalizes and validates the TON address, checks minimum/maximum policy, estimates the fee for the intended transfer, and calculates the net amount. Reject the quote if the estimated fee is greater than or equal to the gross amount.
3. Persist a quote ID, owner, canonical destination, gross amount, fee, net amount, network, creation time, and expiry. A quote does not reserve or debit funds.
4. Return the quote ID and all three amounts to the client. The interface shows the fee and exact net payout before the player confirms.

### Confirm and debit

1. The client confirms the quote ID. It does not submit its own fee or net amount as authoritative values.
2. In one database transaction, the server verifies quote ownership and expiry, locks the user's balance/limit accounting scope, checks available balance and configured limits, marks the quote consumed, creates one pending withdrawal, debits the gross amount, and inserts one negative withdrawal ledger entry. A service-wide limit must also be serialized through a shared database lock or equivalent atomic counter.
3. Repeated confirmation of the same quote returns the same withdrawal result and never creates a second debit or payout. A stale quote must be requoted.
4. The server responds with a pending withdrawal ID and status. The UI must not display “success” or “completed” at this point.

### Broadcast and settle

1. The worker claims an eligible pending withdrawal under a database lease and obtains the payout wallet's current sequence number while holding a single-wallet send lock with lease renewal and a monotonically increasing fencing token. A worker that loses the lease/fence must not initiate another broadcast. Manual recovery must use the same wallet coordinator/lock.
2. It prepares a transfer of the quoted net amount to the persisted destination. Any requested memo is included in the prepared transfer and persisted with the request.
3. Before broadcasting, persist the exact signed transaction, its transaction hash, wallet sequence number, `valid_until`, destination, amount, relevant message details, and attempt metadata. Protect the signed payload at rest and restrict access to it; remove or redact it after final settlement.
4. Broadcast the transaction and record the returned transaction hash when available. A lost RPC response or server restart moves the record into reconciliation; retry the same signed transaction only while its `valid_until` remains valid. After expiry, reconcile the old transaction and wallet sequence number before signing a replacement. Never let a timeout alone trigger a second transfer or refund.
5. Mark the withdrawal `completed` only after finalized chain evidence (including masterchain finality) verifies the payout wallet transaction, successful compute/action outcomes, the expected outgoing message, the exact destination and net amount, and the final outcome of that message. A broadcast acknowledgment or non-final confirmation alone is not completion.
6. On a provable, definite failure, transition once to `failed`, add one positive refund ledger entry, and restore the immediately debited gross amount. Enforce this as a database invariant/idempotent transition. Do not refund on timeouts, RPC errors, or incomplete chain history.

The service should follow TON's wallet transaction interaction and confirmation semantics rather than treating an RPC send response as final: [TON wallet interaction](https://docs.ton.org/blockchain-basics/standard/wallets/interact). The payout is complete only after the associated transaction/message is finalized; see [TON payment processing](https://docs.ton.org/applications/payments/overview).

## State and persistence

Add a persisted quote state (for example `quoted`, `consumed`, `expired`) and retain withdrawal states that distinguish queued, broadcasting/reconciliation, completed, and failed. Add a payout-eligibility/source marker with a migration default of ineligible for existing withdrawals; only withdrawals created by the new quote-confirm path may be marked eligible. The worker query must require this marker, so historical records cannot enter the queue after status changes or restarts. The exact enum names should follow the existing schema, but transitions must be explicit and conditional. At minimum, the worker must be able to distinguish:

- **pending:** debited and eligible to be claimed;
- **processing:** claimed or broadcast state is not yet conclusive;
- **completed:** finalized on chain;
- **failed:** definite failure, with refund recorded exactly once.

Persist quote expiry, gross amount, fee and net amount in integer smallest-unit amounts (one Gram equals 1,000,000,000 base units), destination, network, idempotency/quote linkage, worker lease/fencing token, signer sequence number, signed transaction hash, `valid_until`, retry/reconciliation timestamps, and enough protected transaction data to safely recover an ambiguous send. Define the withdrawal's stored amount as the gross amount; derive net amount as gross less the fixed quoted fee. Avoid floating point for Gram amounts. Add a dedicated refund ledger type or an equivalent unambiguous positive entry linked uniquely to the withdrawal.

Enforce idempotency in the database as well as in application logic. Add unique constraints for the quote-to-withdrawal relationship, the withdrawal `operation_key`/idempotency key, and at most one refund per withdrawal. Make quote consumption and withdrawal creation atomic. Serialize balance and daily-limit checks across concurrent requests so neither a user's balance nor configured limits can be exceeded; enforce a non-negative materialized balance with a database constraint where the schema stores one.

The account/transaction-history APIs must read actual withdrawal status from the database. They must not report all withdrawal rows as confirmed or represent a pending withdrawal as a completed deposit.

## Fee and payout limits

- Estimate the fee server-side before confirmation using the configured TON RPC client and the planned transfer shape.
- Store the estimate as an immutable quote amount. The player is charged that exact fee on acceptance even if actual gas differs.
- The service wallet funds both the recipient transfer and the actual network fee. Record the actual chain fee when available for accounting and operations; whether actual cost is above or below the quote, it does not change the user's gross debit or net payout after acceptance. The service absorbs an overrun and retains any savings.
- Enforce configured per-withdrawal minimum and maximum, per-user daily maximum, and a service-wide daily maximum before debiting funds. Values are deployment policy and must be set before enabling payouts.
- Enforce sufficient balance for the gross amount and a positive net payout.
- Before broadcast, ensure the dedicated wallet can fund the recipient's net amount, the actual network fee, and its configured minimum operating reserve; otherwise keep the payout pending and fail closed.
- Serialize all payouts from the dedicated wallet so two workers cannot race its sequence number.

## Configuration and operations

Keep `PAYOUT_WORKER_ENABLED=false` as the default. When enabled, require a deployment-secret-manager supplied signer key plus explicit network/RPC configuration and all payout caps. Validate that the configured signer resolves to the expected payout wallet at startup. Never log the key or seed phrase. Emit structured logs and metrics for quote, debit, broadcast, confirmation, refund, reconciliation age, and wallet balance, without logging secrets or unnecessary personal data.

Expose the worker's health/readiness state so the server can report that withdrawals are unavailable when configuration or chain access is unhealthy. Do not accept new withdrawal confirmations while the worker is disabled or the server cannot safely process the durable queue. Existing debited, pending withdrawals remain visible and recoverable when the worker is temporarily unavailable.

Before enabling mainnet payouts, reconcile legacy completed withdrawals, fund the dedicated wallet, set limits, verify the signer/network pairing, and pass the mocked-chain recovery release gate below. This implementation does not deploy the payout worker to testnet or send testnet transfers. No historical row is automatically paid by this worker.

## Client behavior

Update the withdrawal screen to request and display the server quote, then require a separate confirmation. Show gross amount, quoted fee, and net payout. After confirmation, show a pending state with a withdrawal reference; refresh from server-persisted status until it is completed or failed. On failure, clearly show the refund state only after the server has recorded the refund. The transaction list should distinguish pending, completed, and failed withdrawals.

## Failure handling and recovery

- **Quote expired or already consumed:** reject or return the existing result; never use a client-supplied fee to continue.
- **Insufficient balance or limit exceeded:** reject within the confirmation transaction without debit.
- **Definite pre-broadcast construction failure:** mark failed and refund once if the gross amount had been debited.
- **Broadcast timeout or lost response:** keep processing and reconcile against wallet sequence number and chain history; do not refund or create a new logical payout.
- **Worker crash/restart:** reclaim expired leases only after checking ownership/fencing state, then reconcile persisted transactions before attempting any new transfer.
- **RPC/database unavailable:** fail closed for new confirmations; preserve queued records and retry reconciliation when dependencies recover.
- **Duplicate client command, worker wake-up, or server instance:** quote consumption, withdrawal linkage, leases, and refund uniqueness prevent duplicate debits, transfers, or refunds.

If chain evidence cannot establish whether an accepted payout occurred, keep it in reconciliation for operational review. Automatic refunds in that ambiguous state are prohibited.

## Mainnet release gate

Automated tests must exercise these cases with a deterministic fake TON client before mainnet enablement; they must not send real transfers:

| Scenario | Required result |
| --- | --- |
| Two simultaneous confirmations of one quote | One withdrawal and one debit |
| Two withdrawals competing for the same balance | Balance never becomes negative |
| Duplicate refund attempt | Exactly one refund |
| RPC accepts a transaction but the response is lost | Reconciliation; no second payout |
| Worker crashes immediately after broadcast | Original transaction is recovered and reconciled |
| Signed transaction expires | No replacement until the original outcome is reconciled |
| Recipient transfer bounces or fails | Final outcome is established before settlement or refund |
| Daily limits are approached concurrently | Limits remain enforced |
| Database or RPC becomes unavailable | New confirmations fail closed |
| Legacy completed withdrawals exist | None enters the automatic payout queue |

These cases must pass before changing `PAYOUT_WORKER_ENABLED` for mainnet. Perform an operational recovery walkthrough using persisted fixtures and a no-broadcast/dry-run mode before enabling live sends. Do not use mainnet funds to exercise failure scenarios.

## Out of scope

- A separate payout microservice or external signer service.
- Automatic replay of pre-existing completed withdrawals.
- User-paid fee adjustment after acceptance, variable post-acceptance charges, or fee rebates.
- Jetton withdrawals, admin approval queues, and payout rails outside native Gram on TON.
- Mainnet enablement without explicit deployment configuration and legacy reconciliation.

## Acceptance criteria for implementation

- A user can obtain and confirm a fee quote; the server, not the client, controls the destination, fee, net payout, quote expiry, and gross debit.
- Concurrent or repeated confirmations create at most one withdrawal and one debit.
- A confirmed payout sends exactly the quoted net amount and charges exactly the quoted fee.
- A successful payout is shown completed only after finalized chain evidence verifies the exact transfer.
- Restart and uncertain-broadcast recovery cannot result in a second payout or premature refund.
- A definite failure restores the gross debit exactly once with an auditable ledger entry.
- Limits and disabled/misconfigured worker behavior fail closed.
- Historical withdrawals default to ineligible in the schema and cannot be enqueued or replayed.
- Pending, completed, and failed states are represented correctly in account and transaction history.
