# TON Connect & Real GRAM Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate `@tonconnect/ui-react` into Gibous to support real on-chain **GRAM** deposits and wallet connectivity on the **TON Blockchain** inside [`BankScreen.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/bank/BankScreen.tsx).

**Architecture:** Wrap the React app in `<TonConnectUIProvider>` with a compliant `tonconnect-manifest.json`. Provide a high-precision `toNanoGram` / `fromNanoGram` unit converter. In [`BankScreen.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/bank/BankScreen.tsx), embed a custom sketch-styled TON Connect wallet widget, dispatch real on-chain transactions (`sendTransaction`) sending native GRAM to the vault address, and bind destination addresses on withdrawal.

**Tech Stack:** React 18, TypeScript, Vite, `@tonconnect/ui-react`, Tailwind CSS, Lucide React, Vitest.

---

### Task 1: Add `@tonconnect/ui-react` & Manifest
**Files:**
- Create: [`public/tonconnect-manifest.json`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/public/tonconnect-manifest.json)
- Modify: [`package.json`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/package.json)

- [ ] **Step 1: Install `@tonconnect/ui-react`**
- [ ] **Step 2: Create `public/tonconnect-manifest.json`**
- [ ] **Step 3: Commit**

---

### Task 2: Unit Conversion Utilities for TON/GRAM
**Files:**
- Create: [`src/utils/tonUnits.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/utils/tonUnits.ts)
- Test: [`tests/unit/economy/tonUnits.test.ts`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/unit/economy/tonUnits.test.ts)

- [ ] **Step 1: Write the failing unit tests for `toNanoGram` and `fromNanoGram`**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement `src/utils/tonUnits.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

---

### Task 3: Root Provider Integration
**Files:**
- Modify: [`src/main.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/main.tsx)

- [ ] **Step 1: Wrap App with `TonConnectUIProvider`**
- [ ] **Step 2: Verify application builds and renders**
- [ ] **Step 3: Commit**

---

### Task 4: BankScreen Real GRAM & TON Connect Flow
**Files:**
- Modify: [`src/components/bank/BankScreen.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/src/components/bank/BankScreen.tsx)
- Test: [`tests/component/bank/BankScreen.test.tsx`](file:///c:/Users/Sten.DESKTOP-JT1I9N4/OneDrive/Desktop/gibous/tests/component/bank/BankScreen.test.tsx)

- [ ] **Step 1: Write component tests for BankScreen with mocked TON Connect hook**
- [ ] **Step 2: Implement TON Connect connection card in `BankScreen.tsx`**
- [ ] **Step 3: Implement real on-chain `sendTransaction` deposit flow with error handling**
- [ ] **Step 4: Implement destination wallet address auto-fill for withdrawals**
- [ ] **Step 5: Update ledger transactions to real GRAM**
- [ ] **Step 6: Run tests and verify all pass**
- [ ] **Step 7: Commit**

---

### Task 5: Final Validation & Build Check
- [ ] **Step 1: Run `npm run typecheck`**
- [ ] **Step 2: Run `npm test`**
- [ ] **Step 3: Run `npm run build`**
