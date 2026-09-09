# TON Connect Deposit Enhancement Specification (TON Connect Only)

**Date**: 2026-09-09  
**Status**: Revised (TON Connect Only)  
**Target Systems**: `server/tonVerifier.ts`, `server/storage.ts`, `server/server.ts`, `server/db/index.ts`, `src/components/bank/BankScreen.tsx`, `src/services/multiplayerService.ts`, `src/state/eventRouter.ts`

---

## 1. Executive Summary & Goals

Streamline the deposit experience strictly around **TON Connect**, eliminating manual transfer clutter while solving the core reliability, accounting, and RPC issues:

1. **Fix Critical Live RPC Failure**: Resolve the `405 Method Not Allowed` error by normalizing `TONCENTER_API_URL` to include `/jsonRPC`.
2. **Strict Separation of In-Flight State vs. Financial Ledger**: Prevent unbroadcasted, cancelled, or failed wallet attempts (e.g., insufficient funds) from creating phantom records in the user's permanent transaction history. Pending is an ephemeral in-flight status, not a settled financial transaction.
3. **Streamlined 1-Tap TON Connect UX**: Fast, intuitive amount chips + 1-tap deposit with instant cleanup if cancelled or rejected by the wallet.
4. **Efficient Vault-Inbound Indexer**: Query the configured **Vault Address** directly to match incoming transfers by memo in $O(1)$ without user-wallet rate limits.
5. **Live In-Flight Stepper & Real-Time Feedback**: Render a progress tracker (Signed → Confirming on TON → Confirmed) that clears automatically when the balance update arrives via WebSocket.

---

## 2. Architecture & Flow

### 2.1 1-Tap TON Connect Flow
1. User enters or selects deposit amount (0.5, 1, 2, 5, 10 GRAM) and clicks **"Deposit with TON Connect"**.
2. If wallet is not connected, the TON Connect modal opens first.
3. Once connected, client sends WebSocket `CREATE_DEPOSIT_INTENT` with `{ amountNano, walletAddress }`.
4. Server generates a cryptographically unique memo (`dep_<userId>_<randomHex>`) and reserves an intent in `deposit_intents` (`status = 'pending'`, `boc = NULL`, `expires_at = now + 15m`).
5. Client encodes the memo into a 32-bit prefix `0` text comment cell and invokes `tonConnectUI.sendTransaction()`.
6. **Wallet Outcome**:
   * **If wallet rejects, user cancels, or wallet reports insufficient funds**:
     * Client catches error in `catch` block.
     * Client immediately dispatches `CANCEL_DEPOSIT_INTENT` to the backend.
     * Server marks intent `cancelled`.
     * **No record is ever created in the user's transaction history**.
   * **If wallet signs successfully**:
     * TON Connect returns the signed BOC string.
     * Client dispatches `SUBMIT_DEPOSIT` with `{ intentId, boc }`.
     * Server attaches the `boc` to `deposit_intents`.
     * UI transitions into the **In-Flight Confirmation Stepper**.

### 2.2 Backend Vault Indexer (`server/tonVerifier.ts`)
1. **Endpoint Normalization**:
   * Automatically ensure `endpoint` ends with `/jsonRPC`. If configured as `https://toncenter.com/api/v2`, it is normalized to `https://toncenter.com/api/v2/jsonRPC`, resolving the 405 error.
2. **Vault Inbound Querying**:
   * Poller queries incoming transactions on the **vault address** (`client.getTransactions(this.vaultAddress, { limit: 30 })`) once per cycle.
   * Inspects `inMessage`:
     * Matches `extractComment(inMessage.body)` against active deposit intents.
     * Verifies `inMessage.info.value.coins == intent.amount_nano`.
     * Calls `storage.confirmDeposit(intent.id, txHash)`.
3. **Atomic Settlement**:
   * Updates `deposit_intents` to `confirmed`.
   * Increments `users.balance_nano` and updates `balance_gram`.
   * Inserts an immutable row into `transactions` (`type = 'deposit'`).
   * Broadcasts `ACCOUNT_UPDATED` to the player via WebSocket.

---

## 3. Financial Ledger Integrity

1. **`transactions` Table**:
   * Strictly contains confirmed, settled financial transactions.
   * Unsigned, rejected, or pending intents never touch this table.
2. **`deposit_intents` Table**:
   * Tracks temporary lifecycle: `pending` → `confirmed` | `cancelled` | `expired`.
3. **`getAccountSnapshot()`**:
   * No longer merges unverified `deposit_intents` into `user.transactions`.
   * Only returns verified `transactions`.
   * Returns `activeDeposit` only when a deposit has a signed `boc` and is actively awaiting blockchain confirmation.
4. **`CANCEL_DEPOSIT_INTENT` Command**:
   * WebSocket command allows the frontend to immediately discard draft intents upon wallet cancellation.

---

## 4. Frontend UI / UX ([BankScreen.tsx](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/bank/BankScreen.tsx))

1. **Clean Deposit Panel**:
   * Wallet connection badge / button.
   * Quick-select amount buttons (0.5, 1, 2, 5, 10 GRAM) + custom input.
   * Single clear CTA: **"Deposit with Wallet"**.
2. **Live In-Flight Stepper**:
   * Appears during confirmation:
     * `[✓] Transaction Signed`
     * `[⏳] Confirming on TON Blockchain...` (with link to Tonscan explorer)
     * `[✓] Credited to Game Balance`
   * Automatically dismisses with success haptics/toast when `ACCOUNT_UPDATED` arrives.
3. **Error Handling**:
   * Clear error message if wallet cancels or has insufficient funds, without leaving any residual pending transaction.
