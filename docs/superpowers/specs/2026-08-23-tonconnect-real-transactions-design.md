# Design Specification: TON Connect Real GRAM Transactions

**Date:** 2026-08-23  
**Status:** Approved for Implementation  
**Topic:** TON Connect Integration & Real On-Chain GRAM Transactions on TON Blockchain

---

## 1. Overview & Context

Following the ecosystem transition where the native token on **The Open Network (TON)** returned to its original identity as **Gram (GRAM)**, Gibous is upgrading its gaming vault in [`BankScreen.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/bank/BankScreen.tsx) from simulated play-credits to **real on-chain GRAM transactions** powered by **TON Connect**.

### Key Network & Token Parameters
* **Blockchain:** The Open Network (TON Blockchain)
* **Asset:** Must be explicitly configured at deployment. The current code path is `native_ton` and transfers the chain's native asset in nanograms; the product label `GRAM` must not be treated as proof that a GRAM jetton is being transferred.
* **Connection Protocol:** TON Connect (`@tonconnect/ui-react`)
* **Target UI Surface:** Bank Screen (`BankScreen.tsx`) only

---

## 2. Architecture & SDK Integration

### 2.1 Dependencies
* `@tonconnect/ui-react`: Latest official React SDK for TON Connect.

### 2.2 Application Root Setup
In [`src/main.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/main.tsx), wrap the `<App />` component in `<TonConnectUIProvider>`:
```tsx
<TonConnectUIProvider manifestUrl="/tonconnect-manifest.json">
  <App />
</TonConnectUIProvider>
```

### 2.3 TON Connect Manifest
Create [`public/tonconnect-manifest.json`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/public/tonconnect-manifest.json) meeting the specification:
```json
{
  "url": "https://gibous.arena",
  "name": "Gibous Duel Arena",
  "iconUrl": "https://gibous.arena/icons/gibous-logo-180.png",
  "termsOfUseUrl": "https://gibous.arena/terms",
  "privacyPolicyUrl": "https://gibous.arena/privacy"
}
```

---

## 3. Component Design: BankScreen Real GRAM Flow

### 3.1 TON Wallet Connection Header
Located at the top of [`src/components/bank/BankScreen.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/bank/BankScreen.tsx):
* **State Detection**: Uses `useTonAddress()` and `useTonWallet()` from `@tonconnect/ui-react`.
* **Disconnected State**:
  * Displays a brutalist sketch-styled card: *"Connect TON Wallet to Deposit Real GRAM"*.
  * Clicking "Connect Wallet" triggers `tonConnectUI.openModal()` (or renders the official button), providing instant connection to Telegram Wallet (`@wallet`), Tonkeeper, MyTonWallet, OpenMask, etc.
* **Connected State**:
  * Displays connected status badge (`● Connected`), shortened user-friendly address (e.g. `EQD4...3a9f`), and a disconnect button (`tonConnectUI.disconnect()`).

### 3.2 Real On-Chain Deposit Flow
1. **Amount Selection**:
   * Quick chips: `+0.1 GRAM`, `+0.5 GRAM`, `+1.0 GRAM`, `+5.0 GRAM` or custom decimal input.
2. **Transaction Construction**:
   * Converts user-selected GRAM into nanograms (`toNanoGram(amount)` = `Math.round(amount * 1e9).toString()`).
   * Builds the transaction payload:
     ```ts
     const tx = {
       validUntil: Math.floor(Date.now() / 1000) + 300, // 5 min TTL
       messages: [
         {
           address: SYSTEM_VAULT_ADDRESS,
           amount: toNanoGram(depositAmount),
         }
       ]
     };
     ```
3. **Execution & Feedback**:
   * If wallet is disconnected: prompts user to connect wallet first.
   * If connected: calls `await tonConnectUI.sendTransaction(tx)`.
   * **Success**: Receives a signed BoC from the wallet and records a pending deposit. The server indexer must find the matching transfer before the ledger balance changes.
   * **Rejection / Cancel**: Catches wallet cancellation error gracefully and shows a clean alert without modifying balance.

### 3.3 Real Withdrawal Flow
* The destination address may be prefilled from the connected wallet, but withdrawals remain disabled until a server-side payout worker exists.
* The server validates the requested amount against the ledger balance; the client never debits itself.

### 3.4 Real GRAM Ledger & Arena Fee Transparency
* Ledger displays transactions denominated in real GRAM:
  * `+0.90 GRAM` Snakes & Ladders Duel Win (Net 90% Pot)
  * `-0.10 GRAM` Gibous Arena Fee (10% on 1.00 Pot)
  * `+0.50 GRAM` Real On-Chain Vault Deposit (TON Blockchain)

---

## 4. Verification & Testing Plan
* **Unit/Component Testing**:
  * Verify `@tonconnect/ui-react` provider mounts cleanly without hydration/rendering errors.
  * Verify `toNanoGram` and `fromNanoGram` unit conversion precision.
  * Verify wallet connection, disconnection, and transaction error handling states.
* **UI Verification**:
  * Confirm brutalist sketch styling consistency in `BankScreen`.
  * Verify responsive display on mobile (Telegram Mini App viewport).
