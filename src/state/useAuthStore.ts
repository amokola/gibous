import { create } from 'zustand';
import type { PendingTransaction } from '../../shared';

interface AuthState {
  user: Record<string, any> | null;
  pendingTransaction: PendingTransaction | null;

  // Actions
  setUser: (user: Record<string, any> | null) => void;
  setPendingTransaction: (tx: PendingTransaction | null) => void;
  addTransactionOptimistic: (tx: any) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  pendingTransaction: null,

  setUser: (user) => set({ user }),

  setPendingTransaction: (pendingTransaction) => set({ pendingTransaction }),

  addTransactionOptimistic: (tx) => set((state) => ({
    user: state.user ? {
      ...state.user,
      transactions: [tx, ...(Array.isArray(state.user.transactions) ? state.user.transactions.filter((t: any) => t.id !== tx.id) : [])]
    } : null
  })),

  reset: () => set({ user: null, pendingTransaction: null }),
}));

// Derived selectors — use these in components: useAuthStore(selectBalance)
export const selectBalance = (state: AuthState): number =>
  Number(state.user?.balance_gram || 0);

export const selectTransactions = (state: AuthState): any[] =>
  Array.isArray(state.user?.transactions) ? state.user!.transactions : [];
