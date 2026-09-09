# Deposit System & TON Connect Enhancement Specification

**Date**: 2026-09-09  
**Status**: Proposed / Approved in Principle  
**Target Systems**: `server/tonVerifier.ts`, `server/storage.ts`, `server/server.ts`, `server/db/index.ts`, `src/components/bank/BankScreen.tsx`, `src/services/multiplayerService.ts`, `src/state/eventRouter.ts`

---

## 1. Executive Summary & Goals

The deposit system is being enhanced to:
1. **Fix Critical Live RPC Failure**: Resolve the `405 Method Not Allowed` error caused by `TONCENTER_API_URL` missing `/jsonRPC`.
2. **Strict Separation of In-Flight State vs. Financial Ledger**: Prevent unbroadcasted, cancelled, or failed wallet attempts (e.g. insufficient funds) from polluting the user's permanent transaction history. A pending intent is an ephemeral in-flight state, not a settled financial ledger record.
3. **Dual-Mode Deposit UX**:
   * **1-Tap TON Connect**: Pre-filled transaction dispatch via connected wallet with instant cleanup if rejected.
   * **Manual Transfer (Address + Memo)**: Clean copyable Vault Address and unique Memo for deposits from exchanges (Bybit, OKX, Binance) or Telegram `@wallet` bot without QR code clutter.
4. **Scalable Vault-Inbound Indexer**: Transition `tonVerifier.ts` from querying individual user wallets to querying the single configured **Vault Address**, matching incoming transfers by memo in $O(1)$ and avoiding API rate-limit bottlenecks.
5. **Real-Time In-Flight Feedback**: Provide live status tracking (Signed → Broadcasting → Confirmed) that clears automatically when the balance update is pushed via WebSocket.

---

## 2. Architecture & Detailed Data Flow

### 2.1 Mode 1: 1-Tap TON Connect
1. User enters deposit amount and clicks **"Deposit with Wallet"**.
2. Client sends WebSocket `CREATE_DEPOSIT_INTENT` with `{ amountNano, walletAddress }`.
3. Server generates a cryptographically unique memo `dep_<userId>_<hex>` and inserts a row in `deposit_intents` (`status = 'pending'`, `boc = NULL`, `expires_at = now + 15m`).
4. Client builds the TON Connect payload with a text comment cell containing `intent.memo`.
5. Client calls `tonConnectUI.sendTransaction()`:
   * **If the wallet rejects, cancels, or fails with insufficient funds**:
     * Client catches the error.
     * Client immediately sends `CANCEL_DEPOSIT_INTENT` with `{ intentId }`.
     * Server marks intent `cancelled`.
     * **No transaction or pending item ever appears in user transaction history.**
   * **If the wallet signs**:
     * TON Connect returns the signed BOC string.
     * Client dispatches `SUBMIT_DEPOSIT` with `{ intentId, boc }`.
     * Server sets `deposit_intents.boc = boc`.
     * Client enters **In-Flight Confirmation Stepper** view.

### 2.2 Mode 2: Manual Transfer (Address + Memo, No QR Code)
1. User switches to the **"Manual / Exchange Transfer"** tab.
2. Client requests a pre-flight intent via `CREATE_DEPOSIT_INTENT` (or enters desired amount and clicks "Generate Deposit Info").
3. UI presents:
   * **Deposit Vault Address**: Formatted string with 1-click **Copy** button.
   * **Unique Deposit Memo**: Distinct highlighted string with 1-click **Copy** button and a prominent warning: *"You must include this memo in the comment field of your transfer for instant crediting"*.
   * **Deposit Amount**: Selected amount with 1-click **Copy** button.
   * **Active Countdown Timer**: 15-minute validity window with a live *"Waiting for blockchain transfer..."* status pulse.
4. User initiates transfer from their exchange or wallet app with the comment.

### 2.3 Backend Vault Indexer (`server/tonVerifier.ts`)
1. **Endpoint Normalization**:
   * On startup, ensure `TONCENTER_API_URL` ends with `/jsonRPC`. If set to `https://toncenter.com/api/v2`, automatically normalize to `https://toncenter.com/api/v2/jsonRPC`.
2. **Vault Inbound Querying**:
   * The verifier polls `client.getTransactions(this.vaultAddress, { limit: 30 })` instead of querying user wallets.
   * For every transaction, it inspects `inMessage`:
     * Validates `inMessage.info.dest == vaultAddress`.
     * Extracts text comment: `extractComment(inMessage.body)`.
     * Looks up active deposit intent by memo: `storage.findPendingDepositIntentByMemo(comment)`.
     * If matched, verifies `inMessage.info.value.coins == intent.amount_nano`.
     * If valid, calls `storage.confirmDeposit(intent.id, txHash)`.
3. **Atomic Settlement & Notification**:
   * Atomically in a PostgreSQL transaction:
     * Marks `deposit_intents` as `status = 'confirmed'`, `tx_hash = txHash`.
     * Increments `users.balance_nano` and updates `balance_gram`.
     * Inserts an immutable row into `transactions` table (`type = 'deposit'`).
   * Broadcasts `ACCOUNT_UPDATED` event to the player's WebSocket connection.

---

## 3. Separation of In-Flight State vs. Financial Ledger

### 3.1 Immutable Financial Ledger (`transactions` table)
* The `transactions` table represents real, confirmed accounting records.
* An entry is written **only** when `confirmDeposit()` executes upon verified on-chain confirmation.
* Aborted, expired, or pending intents never touch this table.

### 3.2 Ephemeral In-Flight State (`deposit_intents` table & `activeDeposit`)
* `storage.getAccountSnapshot(telegramId)` is refactored:
  * **Removed**: The query that merged `deposit_intents` into the `transactions` array.
  * **Added**: An optional `activeDeposit` property returned only if the user has an intent that is active (`status = 'pending'`, not expired, and submitted with a `boc` or manually active).
* The Transaction History component on the frontend displays **only** confirmed ledger transactions.

### 3.3 New WebSocket Commands & Handlers
* **`CANCEL_DEPOSIT_INTENT`**:
  * Payload: `{ intentId: string }`.
  * Behavior: Verifies user ownership and transitions `deposit_intents.status` to `cancelled`.

---

## 4. Frontend Specifications ([BankScreen.tsx](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/bank/BankScreen.tsx))

1. **Panel Mode Tabs**:
   * `[ ⚡ 1-Tap TON Connect ]` and `[ 📋 Manual Transfer ]`.
2. **1-Tap TON Connect View**:
   * Amount selector chips (0.5, 1, 2, 5, 10 GRAM).
   * Primary action button: "Deposit with TON Connect".
   * Handled with try/catch: on user cancel or insufficient funds, cancel intent immediately without leaving hanging state.
3. **Manual Transfer View**:
   * Card containing:
     * **Vault Address** (read-only input + Copy button).
     * **Deposit Memo** (read-only input + Copy button + Warning badge: *"Memo required for crediting"*).
     * **Amount** (read-only input + Copy button).
   * Notice: **No QR code** is rendered, ensuring clean, fast-loading, uncluttered UI.
4. **In-Flight Confirmation Stepper**:
   * Renders when `activeDeposit` exists or after `SUBMIT_DEPOSIT` succeeds:
     * `Step 1 [✓]`: Transaction Signed & Broadcasted
     * `Step 2 [⏳]`: Confirming on TON Blockchain (with link to Tonscan)
     * `Step 3 [ ]`: Credited to Game Balance
   * When `ACCOUNT_UPDATED` arrives, Stepper completes with confetti/toast and transitions back to idle.

---

## 5. Testing & Validation Plan

1. **Unit Tests**:
   * Test `tonVerifier` URL normalization (`https://toncenter.com/api/v2` → `https://toncenter.com/api/v2/jsonRPC`).
   * Test vault-inbound transaction matching logic with matching and non-matching memos.
   * Test `storage.getAccountSnapshot()` ensuring `transactions` contains only confirmed transactions.
   * Test `CANCEL_DEPOSIT_INTENT` handler.
2. **Integration & API Verification**:
   * Test Live Toncenter v2 JSON-RPC endpoint response using the configured API key.
   * Verify WebSocket payload routing for `CREATE_DEPOSIT_INTENT`, `CANCEL_DEPOSIT_INTENT`, and `SUBMIT_DEPOSIT`.
3. **End-to-End Build**:
   * Verify TypeScript compilation with `tsc --noEmit`.
   * Verify all 194 unit tests continue to pass.
