import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTonAddress, useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import { beginCell } from '@ton/core';
import { History, Wallet, Unlink, Loader2, X } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';
import { Toast } from '../ui/Toast';
import { BankVaultIcon, WalletDepositIcon, WalletWithdrawIcon } from '../icons/GameIcons';
import { toNanoGram, formatGram } from '../../utils/tonUnits';
import { getTonConnectNetworkId, type TonNetwork } from '../../../shared';
import { multiplayerService } from '../../services/multiplayerService';

interface BankScreenProps {
  balance: number;
  /** @deprecated Kept for old callers; balance is no longer mutated locally. */
  onDeposit?: (amount: number) => void;
  onSubmitDeposit?: (payload: {
    intentId?: string;
    walletAddress: string;
    depositAddress: string;
    amountNano: string;
    boc: string;
    network: 'mainnet' | 'testnet';
  }) => Promise<void> | void;
  onRequestWithdrawalQuote?: (payload: {
    walletAddress: string;
    amountNano: string;
  }) => Promise<any>;
  onConfirmWithdrawal?: (quoteId: string) => Promise<any>;
  initialTransactions?: BankTransactionItem[];
  activeDeposit?: {
    id: string;
    amountGram: number;
    amountNano: string;
    status: string;
    createdAt: string;
    expiresAt?: string;
    boc?: string | null;
    memo?: string;
    depositAddress?: string;
  } | null;
}

export interface BankTransactionItem {
  id: string;
  type: 'win' | 'arena_fee' | 'draw_refund' | 'deposit' | 'withdraw' | 'withdrawal_refund';
  amount: number;
  timestamp: string;
  description: string;
  subtext?: string;
  txHash?: string;
  depositIntentId?: string;
  status?: 'pending' | 'processing' | 'completed' | 'failed' | 'confirmed';
}

interface WithdrawalProgress {
  id: string;
  amount: number;
  walletAddress?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

const EMPTY_TRANSACTIONS: BankTransactionItem[] = [];

function formatNanoGram(value: string): string {
  const nano = BigInt(value);
  const whole = nano / 1_000_000_000n;
  const fraction = (nano % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function friendlyBankError(error: unknown, fallback: string, action: 'deposit' | 'withdrawal' = 'deposit'): string {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();

  if (/userreject|usercancel|user declined|cancel|closed/.test(normalized)) return 'Request cancelled.';
  if (/withdrawal.*limit|outside configured limit/.test(normalized)) {
    return 'That amount is outside the withdrawal limits. Please enter a different amount.';
  }
  if (/insufficient|balance/.test(normalized)) {
    return action === 'withdrawal'
      ? 'We could not process this withdrawal. Check your available balance and try again.'
      : 'Your wallet does not have enough TON to complete this transaction.';
  }
  if (/mainnet|network/.test(normalized)) return 'The network is temporarily unavailable. Please try again later.';
  if (/quote.*(required|invalid|expired)|withdrawal.*(limit|amount|address)/.test(normalized)) {
    return 'We could not process those withdrawal details. Please review them and try again.';
  }
  if (/timeout|timed out/.test(normalized)) return 'We could not confirm your request yet. Check your transaction history before trying again.';
  return fallback;
}

export const BankScreen: React.FC<BankScreenProps> = ({
  balance,
  onSubmitDeposit,
  onRequestWithdrawalQuote,
  onConfirmWithdrawal,
  initialTransactions = EMPTY_TRANSACTIONS,
  activeDeposit,
}) => {
  const [activePanel, setActivePanel] = useState<'none' | 'deposit' | 'withdraw'>('none');
  const [depositAmount, setDepositAmount] = useState<number>(0.5);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(1.0);
  const [withdrawalQuote, setWithdrawalQuote] = useState<any>(null);
  const [customWallet, setCustomWallet] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [depositStatusMinimized, setDepositStatusMinimized] = useState(false);
  const [withdrawalProgress, setWithdrawalProgress] = useState<WithdrawalProgress | null>(null);
  const [withdrawalStatusMinimized, setWithdrawalStatusMinimized] = useState(false);
  const [transactions, setTransactions] = useState<BankTransactionItem[]>(initialTransactions);
  const [localInFlight, setLocalInFlight] = useState<{
    intentId: string;
    amount: number;
    boc: string;
    status: 'confirming' | 'credited' | 'expired';
    expiresAt: string;
  } | null>(null);

  // TON Connect UI Hooks
  const userFriendlyAddress = useTonAddress();
  const rawWallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();
  const appViewport = typeof document === 'undefined' ? null : document.querySelector('.app-viewport');

  const SYSTEM_DEPOSIT_ADDRESS =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SYSTEM_DEPOSIT_ADDRESS) ||
    '';
  const TON_ASSET_MODE =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TON_ASSET_MODE) ||
    'native_ton';
  const TON_NETWORK = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TON_NETWORK) as TonNetwork | undefined;
  const TON_NETWORK_ID = getTonConnectNetworkId(TON_NETWORK);

  useEffect(() => {
    setTransactions(initialTransactions);
  }, [initialTransactions]);

  // Automatically sync customWallet with connected TON address
  useEffect(() => {
    if (userFriendlyAddress) {
      setCustomWallet(userFriendlyAddress);
    }
  }, [userFriendlyAddress]);

  useEffect(() => {
    if (localInFlight || activeDeposit?.status !== 'pending' || !activeDeposit.expiresAt) return;
    setLocalInFlight({
      intentId: activeDeposit.id,
      amount: activeDeposit.amountGram,
      boc: activeDeposit.boc || '',
      expiresAt: activeDeposit.expiresAt,
      status: new Date(activeDeposit.expiresAt).getTime() <= Date.now() ? 'expired' : 'confirming',
    });
  }, [activeDeposit?.id, activeDeposit?.status, activeDeposit?.expiresAt, localInFlight]);

  // A deposit is credited only when the server ledger reports this intent.
  useEffect(() => {
    if (!localInFlight || localInFlight.status === 'credited') return;
    const confirmed = initialTransactions.some((transaction) =>
      transaction.type === 'deposit' &&
      transaction.status === 'confirmed' &&
      transaction.depositIntentId === localInFlight.intentId
    );
    if (confirmed) {
      setLocalInFlight((prev) => (prev ? { ...prev, status: 'credited' } : null));
    }
  }, [initialTransactions, localInFlight]);

  useEffect(() => {
    if (!localInFlight || localInFlight.status !== 'confirming') return;
    const expiresAt = new Date(localInFlight.expiresAt).getTime();
    if (!Number.isFinite(expiresAt)) return;
    const timer = setTimeout(() => {
      setLocalInFlight((prev) => prev?.status === 'confirming' ? { ...prev, status: 'expired' } : prev);
    }, Math.max(0, expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [localInFlight?.intentId, localInFlight?.status, localInFlight?.expiresAt]);

  useEffect(() => {
    if (localInFlight?.status !== 'credited') return;
    const timer = setTimeout(() => setLocalInFlight(null), 5000);
    return () => clearTimeout(timer);
  }, [localInFlight?.status]);

  useEffect(() => {
    if (localInFlight?.intentId) setDepositStatusMinimized(false);
  }, [localInFlight?.intentId]);

  useEffect(() => {
    if (!withdrawalProgress) return;
    const updated = transactions.find((transaction) => transaction.id === withdrawalProgress.id && transaction.type === 'withdraw');
    if (!updated?.status) return;
    const status = updated.status === 'confirmed' ? 'completed' : updated.status;
    if (status !== withdrawalProgress.status) {
      setWithdrawalProgress((previous) => previous?.id === withdrawalProgress.id ? { ...previous, status } : previous);
    }
  }, [transactions, withdrawalProgress?.id, withdrawalProgress?.status]);

  useEffect(() => {
    if (withdrawalProgress?.status !== 'completed' && withdrawalProgress?.status !== 'failed') return;
    const id = withdrawalProgress.id;
    const timer = setTimeout(() => setWithdrawalProgress((previous) => previous?.id === id ? null : previous), 5000);
    return () => clearTimeout(timer);
  }, [withdrawalProgress?.id, withdrawalProgress?.status]);

  useEffect(() => {
    if (withdrawalProgress?.id) setWithdrawalStatusMinimized(false);
  }, [withdrawalProgress?.id]);

  const handleConnectWallet = () => {
    if (tonConnectUI?.openModal) {
      tonConnectUI.openModal();
    }
  };

  const handleDisconnectWallet = async () => {
    if (tonConnectUI?.disconnect) {
      await tonConnectUI.disconnect();
    }
  };

  const handleDepositAction = async () => {
    if (depositAmount <= 0) return;

    // Check if wallet is connected
    if (!userFriendlyAddress) {
      setNotification({ text: 'Connect your TON wallet to deposit.', type: 'info' });
      handleConnectWallet();
      return;
    }

    if (TON_ASSET_MODE !== 'native_ton' || !TON_NETWORK || !TON_NETWORK_ID) {
      setNotification({ text: 'Deposits are temporarily unavailable.', type: 'error' });
      return;
    }

    if (!SYSTEM_DEPOSIT_ADDRESS || SYSTEM_DEPOSIT_ADDRESS.includes('GIBOUS_VAULT')) {
      setNotification({ text: 'Deposits are temporarily unavailable.', type: 'error' });
      return;
    }

    setIsProcessing(true);
    let intent: { intentId: string; memo: string; depositAddress: string; amountNano: string; expiresAt: string } | null = null;
    let walletSigned = false;

    try {
      const nanoGramAmount = toNanoGram(depositAmount);

      // 1. Request server-generated pre-flight deposit intent with unique memo
      try {
        intent = await multiplayerService.requestDepositIntent(nanoGramAmount, userFriendlyAddress);
      } catch (err: any) {
        setIsProcessing(false);
        setNotification({ text: friendlyBankError(err, 'Could not start your deposit. Please try again.'), type: 'error' });
        return;
      }

      if (!intent?.memo) {
        if (intent?.intentId) void multiplayerService.cancelDepositIntent(intent.intentId);
        setIsProcessing(false);
        setNotification({ text: 'Could not prepare your deposit. Please try again.', type: 'error' });
        return;
      }

      // 2. Construct TON Connect transaction payload with exact server-generated memo
      let payloadBase64: string | undefined;
      try {
        const commentCell = beginCell()
          .storeUint(0, 32)
          .storeStringTail(intent.memo)
          .endCell();
        payloadBase64 = commentCell.toBoc().toString('base64');
      } catch {
        if (intent?.intentId) void multiplayerService.cancelDepositIntent(intent.intentId);
        setIsProcessing(false);
        setNotification({ text: 'Could not prepare your deposit for signing. Please try again.', type: 'error' });
        return;
      }

      const targetDepositAddress = intent.depositAddress || SYSTEM_DEPOSIT_ADDRESS;
      const transactionPayload = {
        validUntil: Math.floor(Date.now() / 1000) + 360, // 6 min TTL
        network: TON_NETWORK_ID,
        messages: [
          {
            address: targetDepositAddress,
            amount: nanoGramAmount,
            ...(payloadBase64 ? { payload: payloadBase64 } : {}),
          },
        ],
      };

      // 3. Dispatch transaction through user's connected wallet
      let result: any;
      try {
        result = await tonConnectUI.sendTransaction(transactionPayload);
      } catch (walletErr: any) {
        // Cancel intent on server immediately to prevent phantom pending records
        if (intent?.intentId) {
          void multiplayerService.cancelDepositIntent(intent.intentId);
        }
        throw walletErr;
      }

      if (!result?.boc) {
        if (intent?.intentId) {
          void multiplayerService.cancelDepositIntent(intent.intentId);
        }
        throw new Error('Deposit was not signed. Please try again.');
      }
      walletSigned = true;

      // 4. Submit signed BOC with intentId to backend
      if (!onSubmitDeposit) throw new Error('Deposit submission is unavailable.');
      await onSubmitDeposit({
        intentId: intent.intentId,
        walletAddress: userFriendlyAddress,
        depositAddress: targetDepositAddress,
        amountNano: nanoGramAmount,
        boc: result.boc,
        network: TON_NETWORK,
      });

      setIsProcessing(false);
      setActivePanel('none');

      // 5. Track live in-flight confirmation stepper
      setLocalInFlight({
        intentId: intent.intentId,
        amount: depositAmount,
        boc: result.boc,
        expiresAt: intent.expiresAt,
        status: 'confirming',
      });

      setNotification({
        text: `Transaction signed! Confirming ${depositAmount} GRAM on TON...`,
        type: 'info',
      });
    } catch (err: any) {
      setIsProcessing(false);
      const errorMsg = err?.message || '';
      const errorName = err?.name?.toLowerCase() || '';
      if (
        errorName.includes('userreject') ||
        errorName.includes('usercancel') ||
        errorMsg.toLowerCase().includes('reject') ||
        errorMsg.toLowerCase().includes('cancel') ||
        errorMsg.toLowerCase().includes('closed') ||
        errorMsg.toLowerCase().includes('user declined')
      ) {
        setNotification({ text: 'Deposit cancelled.', type: 'info' });
      } else if (errorMsg.toLowerCase().includes('insufficient') || errorMsg.toLowerCase().includes('balance')) {
        setNotification({ text: 'Insufficient TON balance in wallet.', type: 'error' });
      } else {
        setNotification({
          text: walletSigned
            ? 'Your deposit was sent, but we have not confirmed it yet. Check your transaction history before trying again.'
            : friendlyBankError(err, 'Your deposit could not be completed. Please try again.'),
          type: 'error',
        });
      }
    }
  };

  const handleWithdrawAction = async () => {
    if (withdrawAmount <= 0) {
      setNotification({ text: 'Enter a valid withdrawal amount.', type: 'error' });
      return;
    }
    if (withdrawAmount > balance) {
      setNotification({ text: 'Withdrawal amount exceeds your available balance.', type: 'error' });
      return;
    }

    const targetAddress = (customWallet || userFriendlyAddress || '').trim();
    if (!targetAddress) {
      setNotification({ text: 'Connect your wallet or enter the address that should receive your GRAM.', type: 'info' });
      return;
    }

    setIsProcessing(true);
    try {
      const nanoGramAmount = toNanoGram(withdrawAmount);
      if (!onRequestWithdrawalQuote) throw new Error('Withdrawals are not available right now.');
      const quote = await onRequestWithdrawalQuote({
        walletAddress: targetAddress,
        amountNano: nanoGramAmount,
      });
      setWithdrawalQuote(quote);
      setNotification({ text: 'Check the withdrawal amount and network fee before confirming.', type: 'info' });
    } catch (error) {
      setNotification({ text: friendlyBankError(error, 'Could not prepare your withdrawal. Please try again.', 'withdrawal'), type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmWithdrawal = async () => {
    if (!withdrawalQuote || !onConfirmWithdrawal) return;
    if (new Date(withdrawalQuote.expiresAt).getTime() <= Date.now()) {
      setWithdrawalQuote(null);
      setNotification({ text: 'This fee estimate expired. Request a new estimate to continue.', type: 'error' });
      return;
    }
    setIsProcessing(true);
    try {
      const accepted = await onConfirmWithdrawal(withdrawalQuote.quoteId);
      setWithdrawalProgress({
        id: String(accepted.id),
        amount: Number(accepted.amountGram ?? withdrawAmount),
        walletAddress: accepted.walletAddress || withdrawalQuote.walletAddress,
        status: accepted.status === 'processing' ? 'processing' : 'pending',
      });
      setWithdrawalStatusMinimized(false);
      setNotification({ text: 'Your withdrawal is being processed. You can follow its status in Transaction History.', type: 'info' });
      setWithdrawalQuote(null);
      setWithdrawAmount(0);
      setActivePanel('none');
    } catch (error) {
      setNotification({ text: friendlyBankError(error, 'Your withdrawal could not be confirmed. Please try again.', 'withdrawal'), type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const formatShortAddress = (addr: string) => {
    if (!addr) return '';
    if (addr.length <= 14) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const existingWithdrawal = transactions.find((transaction) =>
    transaction.type === 'withdraw' && (transaction.status === 'pending' || transaction.status === 'processing')
  );
  const visibleWithdrawalProgress = withdrawalProgress ?? (existingWithdrawal
    ? {
        id: existingWithdrawal.id,
        amount: Math.abs(existingWithdrawal.amount),
        status: existingWithdrawal.status === 'processing' ? 'processing' as const : 'pending' as const,
      }
    : null);
  const depositStatusVisible = Boolean(localInFlight || (activeDeposit && activeDeposit.status === 'pending'));

  return (
    <div className="w-full max-w-[420px] mx-auto h-auto flex flex-col gap-3.5 p-3 sm:p-4 select-none animate-fade-in pb-16 bg-[#fbfaf7] text-[#1a1a1a]">
      {/* 1. TON CONNECT WALLET BAR */}
      <div className="w-full bg-white border-2 border-black p-3 sketch-shadow rounded-none flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-[#e0f2fe] border-2 border-black flex items-center justify-center">
            <Wallet className="w-5 h-5 text-[#0088cc]" />
          </div>
          <div className="flex flex-col">
            {userFriendlyAddress ? (
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="font-mono text-xs font-bold text-[#166534]">
                  {formatShortAddress(userFriendlyAddress)}
                </span>
                <span className="font-sketch text-[10px] text-[#1a1a1a]/60 font-bold">
                  ({rawWallet?.device?.appName || (rawWallet as any)?.name || 'Wallet Connected'})
                </span>
              </div>
            ) : (
              <span className="font-sketch text-xs font-bold text-[#9b2c2c]">
                No Wallet Connected
              </span>
            )}
          </div>
        </div>

        {userFriendlyAddress ? (
          <button
            type="button"
            onClick={handleDisconnectWallet}
            title="Disconnect TON Wallet"
            className="px-2 py-1 bg-[#fee2e2] hover:bg-[#fecaca] text-[#9b2c2c] border border-black font-sketch text-xs font-bold flex items-center gap-1 active:scale-95 transition-all"
          >
            <Unlink className="w-3.5 h-3.5" />
            <span>Disconnect</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleConnectWallet}
            className="px-2.5 py-1.5 bg-[#0088cc] hover:bg-[#0077b5] text-white border-2 border-black font-sketch text-xs font-bold flex items-center gap-1.5 sketch-shadow-xs active:scale-95 transition-all"
          >
            <span>Connect TON</span>
          </button>
        )}
      </div>

      {/* 2. Top Gaming Balance Card */}
      <div className="w-full bg-white border-2 border-black p-4 sketch-shadow rounded-none flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#e0f2fe] border-2 border-black flex items-center justify-center">
            <BankVaultIcon size={30} />
          </div>
          <div>
            <span className="font-sketch text-xs text-[#1a1a1a]/60 uppercase font-bold tracking-wider block">
              Balance
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-sketch text-2xl sm:text-3xl font-bold text-[#1a365d]">
                {formatGram(balance)}
              </span>
              <span className="font-sketch text-base font-bold text-[#9b2c2c]">GRAM</span>
              <GramIcon size="md" />
            </div>
          </div>
        </div>
      </div>

      {/* Transient bank notifications */}
      {notification && (
        <div className="absolute top-3 left-3 right-3 z-50 pointer-events-auto">
          <Toast
            type={notification.type}
            message={notification.text}
            duration={3500}
            onClose={() => setNotification(null)}
          />
        </div>
      )}

      {/* Floating, non-blocking deposit status */}
      {(localInFlight || (activeDeposit && activeDeposit.status === 'pending')) && appViewport && createPortal((
        <div className="absolute bottom-20 left-3 right-3 z-40 flex justify-end pointer-events-none">
          {depositStatusMinimized ? (
            <button
              type="button"
              onClick={() => setDepositStatusMinimized(false)}
              className="pointer-events-auto max-w-full border-2 border-black bg-white px-3 py-2 font-sketch text-xs font-bold sketch-shadow-xs animate-fade-in"
              aria-label="Show deposit status"
            >
              {localInFlight?.status === 'credited'
                ? 'Deposit credited'
                : localInFlight?.status === 'expired'
                ? 'Deposit needs attention'
                : 'Deposit confirming…'}
            </button>
          ) : (
            <div
              className={`pointer-events-auto w-full max-h-[55vh] overflow-y-auto ${localInFlight?.status === 'expired' ? 'bg-[#fff1f2] border-[#9b2c2c]' : 'bg-[#f0fdf4] border-[#166534]'} border-2 p-3.5 sketch-shadow rounded-none flex flex-col gap-2.5 animate-fade-in`}
              role="status"
              aria-live="polite"
            >
              <div className={`flex items-center justify-between border-b ${localInFlight?.status === 'expired' ? 'border-[#9b2c2c]/30' : 'border-[#166534]/30'} pb-2`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${localInFlight?.status === 'expired' ? 'bg-[#9b2c2c]' : localInFlight?.status === 'credited' ? 'bg-[#166534]' : 'bg-green-500 animate-pulse'}`} />
                  <span className={`font-sketch text-xs font-bold uppercase tracking-wider ${localInFlight?.status === 'expired' ? 'text-[#9b2c2c]' : 'text-[#166534]'}`}>
                    {localInFlight?.status === 'credited' ? 'Deposit Credited' : localInFlight?.status === 'expired' ? 'Deposit Expired' : 'Deposit In Progress'}
                  </span>
                </div>
                <span className={`font-sketch text-xs font-bold ${localInFlight?.status === 'expired' ? 'text-[#9b2c2c]' : 'text-[#166534]'}`}>
                  +{formatGram(localInFlight?.amount ?? activeDeposit?.amountGram ?? 0)} GRAM
                </span>
                <button
                  type="button"
                  onClick={() => setDepositStatusMinimized(true)}
                  className="ml-1 p-1 hover:bg-black/10"
                  aria-label="Minimize deposit status"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2 text-xs font-sketch font-bold">
                {/* Step 1: Signed */}
                <div className="flex items-center gap-2 text-[#166534]">
                  <span className="w-4 h-4 rounded-full bg-[#166534] text-white flex items-center justify-center text-[10px]">✓</span>
                  <span>1. Transaction signed in wallet</span>
                </div>

                {/* Step 2: Confirming */}
                <div className={`flex items-center gap-2 ${localInFlight?.status === 'expired' ? 'text-[#9b2c2c]' : 'text-[#166534]'}`}>
                  {localInFlight?.status === 'credited' ? (
                    <span className="w-4 h-4 rounded-full bg-[#166534] text-white flex items-center justify-center text-[10px]">✓</span>
                  ) : localInFlight?.status === 'expired' ? (
                    <span className="w-4 h-4 rounded-full bg-[#9b2c2c] text-white flex items-center justify-center text-[10px]">!</span>
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-[#166534]" />
                  )}
                  <span>
                    {localInFlight?.status === 'credited' ? '2. Confirmed on TON blockchain' : localInFlight?.status === 'expired' ? '2. Confirmation window expired' : '2. Confirming on TON blockchain...'}
                  </span>
                </div>

                {/* Step 3: Credited */}
                <div className={`flex items-center gap-2 ${localInFlight?.status === 'credited' ? 'text-[#166534]' : localInFlight?.status === 'expired' ? 'text-[#9b2c2c]' : 'text-[#1a1a1a]/40'}`}>
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${localInFlight?.status === 'credited' ? 'bg-[#166534] text-white' : localInFlight?.status === 'expired' ? 'bg-[#9b2c2c] text-white' : 'border border-black/30'}`}>
                    {localInFlight?.status === 'credited' ? '✓' : localInFlight?.status === 'expired' ? '!' : '3'}
                  </span>
                  <span>
                    {localInFlight?.status === 'credited' ? '3. Balance credited!' : localInFlight?.status === 'expired' ? '3. No funds were credited' : '3. Crediting balance'}
                  </span>
                </div>
              </div>
              {localInFlight?.status === 'expired' && (
                <p className="border-t border-[#9b2c2c]/30 pt-2 font-sketch text-[11px] text-[#9b2c2c]">
                  This request expired before your balance was credited. Check your transaction history before starting another deposit.
                </p>
              )}
            </div>
          )}
        </div>
      ), appViewport)}

      {visibleWithdrawalProgress && appViewport && createPortal((
        <div className={`absolute ${depositStatusVisible ? 'bottom-60' : 'bottom-20'} left-3 right-3 z-40 flex justify-end pointer-events-none`}>
          {withdrawalStatusMinimized ? (
            <button
              type="button"
              onClick={() => setWithdrawalStatusMinimized(false)}
              className="pointer-events-auto max-w-full border-2 border-black bg-white px-3 py-2 font-sketch text-xs font-bold sketch-shadow-xs animate-fade-in"
              aria-label="Show withdrawal status"
            >
              {visibleWithdrawalProgress.status === 'completed'
                ? 'Withdrawal complete'
                : visibleWithdrawalProgress.status === 'failed'
                ? 'Withdrawal not completed'
                : 'Withdrawal in progress…'}
            </button>
          ) : (
            <div
              className={`pointer-events-auto w-full max-h-[35vh] overflow-y-auto ${visibleWithdrawalProgress.status === 'completed' ? 'bg-[#f0fdf4] border-[#166534]' : visibleWithdrawalProgress.status === 'failed' ? 'bg-[#fff1f2] border-[#9b2c2c]' : 'bg-[#eff6ff] border-[#1a365d]'} border-2 p-3.5 sketch-shadow rounded-none flex flex-col gap-2 animate-fade-in`}
              role="status"
              aria-live="polite"
            >
              <div className={`flex items-center justify-between border-b ${visibleWithdrawalProgress.status === 'failed' ? 'border-[#9b2c2c]/30' : 'border-[#1a365d]/30'} pb-2`}>
                <div className="flex items-center gap-2">
                  {visibleWithdrawalProgress.status === 'pending' || visibleWithdrawalProgress.status === 'processing' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[#1a365d]" />
                  ) : (
                    <span className={`w-2.5 h-2.5 rounded-full ${visibleWithdrawalProgress.status === 'completed' ? 'bg-[#166534]' : 'bg-[#9b2c2c]'}`} />
                  )}
                  <span className={`font-sketch text-xs font-bold uppercase tracking-wider ${visibleWithdrawalProgress.status === 'failed' ? 'text-[#9b2c2c]' : visibleWithdrawalProgress.status === 'completed' ? 'text-[#166534]' : 'text-[#1a365d]'}`}>
                    {visibleWithdrawalProgress.status === 'completed' ? 'Withdrawal complete' : visibleWithdrawalProgress.status === 'failed' ? 'Withdrawal not completed' : 'Withdrawal in progress'}
                  </span>
                </div>
                <span className="font-sketch text-xs font-bold text-[#1a365d]">
                  {formatGram(visibleWithdrawalProgress.amount)} GRAM
                </span>
                <button
                  type="button"
                  onClick={() => setWithdrawalStatusMinimized(true)}
                  className="ml-1 p-1 hover:bg-black/10"
                  aria-label="Minimize withdrawal status"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="font-sketch text-xs font-bold text-[#1a1a1a]/80">
                {visibleWithdrawalProgress.status === 'completed'
                  ? 'Your GRAM has been sent to your wallet.'
                  : visibleWithdrawalProgress.status === 'failed'
                  ? 'Your GRAM was returned to your balance.'
                  : 'We’re processing your withdrawal. You can keep using the app; this status will update automatically.'}
              </p>
              {visibleWithdrawalProgress.walletAddress && (
                <p className="break-all font-mono text-[10px] text-[#1a1a1a]/60">
                  To {formatShortAddress(visibleWithdrawalProgress.walletAddress)}
                </p>
              )}
            </div>
          )}
        </div>
      ), appViewport)}

      {/* 3. SIDE-BY-SIDE HERO CARDS (DEPOSIT & WITHDRAW) */}
      <div className="grid grid-cols-2 gap-3">
        {/* 1. DEPOSIT CARD */}
        <div
          className={`bg-white border-2 border-black p-3.5 sm:p-4 rounded-none sketch-shadow flex flex-col items-center text-center transition-all ${
            activePanel === 'deposit' ? 'ring-2 ring-[#166534] bg-[#f0fdf4]' : ''
          }`}
        >
          <div className="w-12 h-12 bg-[#dcfce7] border-2 border-black flex items-center justify-center mb-2.5">
            <WalletDepositIcon size={28} className="w-7 h-7 text-[#166534]" />
          </div>

          <h3 className="font-sketch text-lg sm:text-xl font-black text-[#1a1a1a] tracking-wide">
            DEPOSIT
          </h3>
          <p className="font-sketch text-[11px] text-[#1a1a1a]/70 mb-3 min-h-[28px] flex items-center justify-center gap-1">
            ON TON <GramIcon size="sm" />
          </p>

          <button
            type="button"
            onClick={() => {
              setActivePanel((prev) => (prev === 'deposit' ? 'none' : 'deposit'));
            }}
            className={`w-full py-2 bg-white hover:bg-[#f2efe9] text-[#1a1a1a] border-2 border-black font-sketch text-xs sm:text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all ${
              activePanel === 'deposit' ? 'bg-[#fff9c4] text-[#854d0e]' : ''
            }`}
          >
            {activePanel === 'deposit' ? 'Close' : 'Deposit'}
          </button>
        </div>

        {/* 2. WITHDRAW CARD */}
        <div
          className={`bg-white border-2 border-black p-3.5 sm:p-4 rounded-none sketch-shadow flex flex-col items-center text-center transition-all ${
            activePanel === 'withdraw' ? 'ring-2 ring-[#9b2c2c] bg-[#fff1f2]' : ''
          }`}
        >
          <div className="w-12 h-12 bg-[#fee2e2] border-2 border-black flex items-center justify-center mb-2.5">
            <WalletWithdrawIcon size={28} className="w-7 h-7 text-[#9b2c2c]" />
          </div>

          <h3 className="font-sketch text-lg sm:text-xl font-black text-[#1a1a1a] tracking-wide">
            WITHDRAW
          </h3>
          <p className="font-sketch text-[11px] text-[#1a1a1a]/70 mb-3 min-h-[28px] flex items-center justify-center gap-1">
            ON TON <GramIcon size="sm" />
          </p>

          <button
            type="button"
            onClick={() => {
              setActivePanel((prev) => (prev === 'withdraw' ? 'none' : 'withdraw'));
            }}
            className={`w-full py-2 bg-white hover:bg-[#f2efe9] text-[#1a1a1a] border-2 border-black font-sketch text-xs sm:text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all ${
              activePanel === 'withdraw' ? 'bg-[#fee2e2] text-[#9b2c2c]' : ''
            }`}
          >
            {activePanel === 'withdraw' ? 'Close' : 'Withdraw'}
          </button>
        </div>
      </div>

      {/* 4. INTERACTIVE EXPANDED DEPOSIT PANEL */}
      {activePanel === 'deposit' && (
        <div className="w-full bg-white border-2 border-black p-4 rounded-none sketch-shadow flex flex-col gap-3 animate-fade-in">
          <div className="flex items-center justify-between border-b-2 border-black pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[#dcfce7] border border-black flex items-center justify-center font-sketch text-xs font-bold text-[#166534]">
                +
              </div>
              <span className="font-sketch text-base font-bold text-[#1a1a1a]">
                Deposit GRAM
              </span>
            </div>
            <span className="font-sketch text-xs text-[#166534] bg-[#dcfce7] px-2 py-0.5 border border-black font-bold">
              Deposit
            </span>
          </div>

          {/* Wallet State Alert if disconnected */}
          {!userFriendlyAddress && (
            <div className="p-2.5 bg-[#fff9c4] border border-black font-sketch text-xs text-[#854d0e] flex items-center justify-between">
              <span>⚠️ Connect your TON wallet to deposit.</span>
              <button
                type="button"
                onClick={handleConnectWallet}
                className="px-2 py-1 bg-[#0088cc] text-white border border-black font-bold ml-2 shrink-0"
              >
                Connect
              </button>
            </div>
          )}

          {/* Custom Deposit Amount Input Field */}
          <div>
            <label htmlFor="deposit-amount" className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1">
              Deposit Amount:
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="deposit-amount"
                  type="number"
                  step="0.1"
                  min="0.01"
                  max="10000"
                  value={depositAmount || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setDepositAmount(isNaN(val) ? 0 : Math.max(0, val));
                  }}
                  className="w-full p-2 bg-[#f2efe9] border-2 border-black font-sketch text-base font-bold text-[#1a1a1a] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#166534]"
                  placeholder="e.g. 0.5"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-sketch text-xs font-bold text-[#1a1a1a]/60">
                  GRAM
                </span>
              </div>
            </div>
          </div>

          {/* Quick Amount Chips */}
          <div>
            <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1.5">
              Quick Select:
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[0.1, 0.5, 1.0, 5.0].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setDepositAmount(amt);
                  }}
                  className={`py-2 rounded-none border-2 border-black font-sketch text-xs font-bold transition-all sketch-btn-press ${
                    depositAmount === amt
                      ? 'bg-[#fff9c4] text-[#854d0e] sketch-shadow-xs ring-2 ring-[#ca8a04]'
                      : 'bg-[#f2efe9] text-[#1a1a1a]'
                  }`}
                >
                  +{amt}G
                </button>
              ))}
            </div>
          </div>

          {/* On-Chain Transaction CTA */}
          <button
            type="button"
            onClick={handleDepositAction}
            disabled={isProcessing || depositAmount <= 0}
            className="w-full py-2.5 bg-[#166534] hover:bg-[#124d27] text-white border-2 border-black font-sketch text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Wallet aria-hidden="true" className="w-4 h-4" />
            {isProcessing
              ? 'Confirming in wallet...'
              : `Deposit ${depositAmount} GRAM`}
          </button>
        </div>
      )}

      {/* 5. INTERACTIVE EXPANDED WITHDRAW PANEL */}
      {activePanel === 'withdraw' && (
        <div className="w-full bg-white border-2 border-black p-4 rounded-none sketch-shadow flex flex-col gap-3 animate-fade-in">
          <div className="flex items-center justify-between border-b-2 border-black pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[#fee2e2] border border-black flex items-center justify-center font-sketch text-xs font-bold text-[#9b2c2c]">
                -
              </div>
              <span className="font-sketch text-base font-bold text-[#1a1a1a]">
                Withdraw GRAM
              </span>
            </div>
            <span className="font-sketch text-xs text-[#9b2c2c] bg-[#fee2e2] px-2 py-0.5 border border-black font-bold">
              Withdraw
            </span>
          </div>

          {/* Destination Wallet Input */}
          <div>
            <label htmlFor="withdraw-recipient" className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1">
              Wallet address to receive GRAM:
            </label>
            <input
              id="withdraw-recipient"
              type="text"
              value={customWallet}
              onChange={(e) => setCustomWallet(e.target.value)}
              className="w-full p-2 bg-[#f2efe9] border-2 border-black font-mono text-xs text-[#1a1a1a] focus:outline-none focus:bg-white"
              placeholder={userFriendlyAddress || 'Connect wallet or paste receiving address'}
            />
          </div>

          {/* Custom Withdraw Amount Input Field */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="withdraw-amount" className="font-sketch text-xs font-bold text-[#1a1a1a]/70">
                Withdraw Amount:
              </label>
              <span className="font-sketch text-[10px] text-[#1a1a1a]/60 font-bold">
                Available: {formatGram(balance)} GRAM
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  id="withdraw-amount"
                  type="number"
                  step="0.1"
                  min="0.01"
                  max={balance}
                  value={withdrawAmount || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setWithdrawAmount(isNaN(val) ? 0 : Math.max(0, val));
                  }}
                  className="w-full p-2 bg-[#f2efe9] border-2 border-black font-sketch text-base font-bold text-[#1a1a1a] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#9b2c2c]"
                  placeholder="e.g. 1.0"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-sketch text-xs font-bold text-[#1a1a1a]/60">
                  GRAM
                </span>
              </div>
            </div>
            {withdrawAmount > balance && (
              <span className="text-[10px] text-[#9b2c2c] font-bold font-sketch mt-1 block">
                ⚠️ Exceeds available balance ({formatGram(balance)} GRAM)
              </span>
            )}
          </div>

          {/* Withdraw Percentage Chips */}
          <div>
            <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1.5">
              Quick Select:
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '25%', amt: Number((balance * 0.25).toFixed(2)) },
                { label: '50%', amt: Number((balance * 0.50).toFixed(2)) },
                { label: '75%', amt: Number((balance * 0.75).toFixed(2)) },
                { label: '100% Max', amt: Number(balance.toFixed(2)) },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setWithdrawAmount(item.amt);
                  }}
                  className={`py-1.5 rounded-none border-2 border-black font-sketch text-xs font-bold transition-all sketch-btn-press ${
                    withdrawAmount === item.amt
                      ? 'bg-[#fee2e2] text-[#9b2c2c] sketch-shadow-xs ring-2 ring-[#9b2c2c]'
                      : 'bg-[#f2efe9] text-[#1a1a1a]'
                  }`}
                >
                  {item.label}
                  <span className="block text-[9px] text-[#1a1a1a]/60">{item.amt}G</span>
                </button>
              ))}
            </div>
          </div>

          {withdrawalQuote ? (
            <div className="p-3 bg-[#f2efe9] border-2 border-black space-y-2 font-sketch text-xs">
              <div className="font-bold uppercase">Review your withdrawal</div>
              <div className="flex justify-between"><span>Withdrawal amount</span><b>{formatNanoGram(withdrawalQuote.grossAmountNano)} GRAM</b></div>
              <div className="flex justify-between"><span>Network fee</span><b>{formatNanoGram(withdrawalQuote.feeNano)} GRAM</b></div>
              <div className="flex justify-between"><span>You'll receive</span><b>{formatNanoGram(withdrawalQuote.netAmountNano)} GRAM</b></div>
              <div className="break-all text-[10px] text-[#1a1a1a]/60">Sending to {withdrawalQuote.walletAddress}</div>
              <div className="text-[10px] text-[#1a1a1a]/60">Fee estimate expires at {new Date(withdrawalQuote.expiresAt).toLocaleTimeString()}</div>
              <button type="button" onClick={handleConfirmWithdrawal} disabled={isProcessing} className="w-full py-2.5 bg-[#1a365d] text-white border-2 border-black font-bold">
                {isProcessing ? 'Confirming…' : 'Confirm withdrawal'}
              </button>
              <button type="button" onClick={() => setWithdrawalQuote(null)} disabled={isProcessing} className="w-full py-1 border border-black">Edit details</button>
            </div>
          ) : (
            <button type="button" onClick={handleWithdrawAction} disabled={isProcessing || withdrawAmount <= 0 || withdrawAmount > balance} className="w-full py-2.5 bg-[#1a365d] hover:bg-[#122844] text-white border-2 border-black font-sketch text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              {isProcessing ? 'Checking network fee…' : 'Review withdrawal'}
            </button>
          )}
        </div>
      )}

      {/* 6. TRANSACTION HISTORY */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex items-center justify-between px-1">
          <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            <span>Transaction History</span>
          </span>
        </div>

        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="p-3 bg-white border-2 border-black rounded-none flex items-center justify-between sketch-shadow-xs"
          >
            <div className="flex flex-col">
              <span className="font-sketch text-xs font-bold text-[#1a1a1a]">
                {tx.description}
              </span>
              <span className="text-[10px] text-[#1a1a1a]/60 mt-0.5">
                {tx.timestamp} • {tx.subtext || 'Completed'}
              </span>
            </div>
            <div
              className={`font-sketch text-sm font-bold ${
                tx.amount > 0 ? 'text-[#166534]' : 'text-[#9b2c2c]'
              }`}
            >
              {tx.amount > 0 ? `+${formatGram(tx.amount)}` : formatGram(tx.amount)} GRAM
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
