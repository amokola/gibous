import React, { useState, useEffect } from 'react';
import { useTonAddress, useTonWallet, useTonConnectUI } from '@tonconnect/ui-react';
import { beginCell } from '@ton/core';
import { ArrowUpRight, ArrowDownLeft, Check, History, Copy, ShieldCheck, Zap, Wallet, Unlink } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';
import { BankVaultIcon } from '../icons/GameIcons';
import { toNanoGram, formatGram } from '../../utils/tonUnits';
import { getTonConnectNetworkId, type TonNetwork } from '../../../shared/constants/ton';
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
  }) => void;
  onSubmitWithdrawal?: (payload: {
    walletAddress: string;
    amountNano: string;
  }) => void;
  initialTransactions?: BankTransactionItem[];
}

export interface BankTransactionItem {
  id: string;
  type: 'win' | 'arena_fee' | 'draw_refund' | 'deposit' | 'withdraw';
  amount: number;
  timestamp: string;
  description: string;
  subtext?: string;
  txHash?: string;
}

const EMPTY_TRANSACTIONS: BankTransactionItem[] = [];

export const BankScreen: React.FC<BankScreenProps> = ({
  balance,
  onSubmitDeposit,
  onSubmitWithdrawal,
  initialTransactions = EMPTY_TRANSACTIONS,
}) => {
  const [activePanel, setActivePanel] = useState<'none' | 'deposit' | 'withdraw'>('none');
  const [depositAmount, setDepositAmount] = useState<number>(0.5);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(1.0);
  const [customWallet, setCustomWallet] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [transactions, setTransactions] = useState<BankTransactionItem[]>(initialTransactions);

  // TON Connect UI Hooks
  const userFriendlyAddress = useTonAddress();
  const rawWallet = useTonWallet();
  const [tonConnectUI] = useTonConnectUI();

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

    try {
      const nanoGramAmount = toNanoGram(depositAmount);

      // 1. Request server-generated pre-flight deposit intent with unique memo
      let intent: { intentId: string; memo: string; depositAddress: string; amountNano: string; expiresAt: string };
      try {
        intent = await multiplayerService.requestDepositIntent(nanoGramAmount, userFriendlyAddress);
      } catch (err: any) {
        setIsProcessing(false);
        setNotification({ text: err?.message || 'Failed to request deposit intent.', type: 'error' });
        return;
      }

      if (!intent?.memo) {
        setIsProcessing(false);
        setNotification({ text: 'Server failed to provide a valid deposit memo.', type: 'error' });
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
        setIsProcessing(false);
        setNotification({ text: 'Failed to encode deposit memo payload.', type: 'error' });
        return;
      }

      const targetDepositAddress = intent.depositAddress || SYSTEM_DEPOSIT_ADDRESS;
      const transactionPayload = {
        validUntil: Math.floor(Date.now() / 1000) + 360, // 6 min TTL
        network: TON_NETWORK_ID,
        from: userFriendlyAddress,
        messages: [
          {
            address: targetDepositAddress,
            amount: nanoGramAmount,
            ...(payloadBase64 ? { payload: payloadBase64 } : {}),
          },
        ],
      };

      // 3. Dispatch transaction through user's connected wallet
      const result = await tonConnectUI.sendTransaction(transactionPayload);

      if (!result?.boc) {
        throw new Error('Deposit was not signed. Please try again.');
      }

      // 4. Submit signed BOC with intentId to backend
      onSubmitDeposit?.({
        intentId: intent.intentId,
        walletAddress: userFriendlyAddress,
        depositAddress: targetDepositAddress,
        amountNano: nanoGramAmount,
        boc: result.boc,
        network: TON_NETWORK,
      });
      setIsProcessing(false);
      setNotification({
        text: `Deposit submitted! We're confirming ${depositAmount} GRAM on TON.`,
        type: 'info',
      });

      setTransactions((prev) => [
        {
          id: `tx-${Date.now()}`,
          type: 'deposit',
          amount: depositAmount,
          timestamp: 'Just now',
          description: `Deposit (+${depositAmount} GRAM)`,
          subtext: 'Confirming on TON...',
          txHash: `${result.boc.slice(0, 16)}...`,
        },
        ...prev,
      ]);

      setActivePanel('none');
      setTimeout(() => setNotification(null), 4000);
    } catch (err: any) {
      setIsProcessing(false);
      const errorMsg = err?.message || '';
      if (errorMsg.toLowerCase().includes('reject') || errorMsg.toLowerCase().includes('cancel') || errorMsg.toLowerCase().includes('closed')) {
        setNotification({ text: 'Deposit cancelled.', type: 'info' });
      } else {
        setNotification({ text: errorMsg || 'Deposit failed. Please try again.', type: 'error' });
      }
      setTimeout(() => setNotification(null), 3500);
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
      setNotification({ text: 'Connect your wallet or enter a recipient TON address.', type: 'info' });
      return;
    }

    setIsProcessing(true);
    try {
      const nanoGramAmount = toNanoGram(withdrawAmount);
      onSubmitWithdrawal?.({
        walletAddress: targetAddress,
        amountNano: nanoGramAmount,
      });

      const shortAddr = targetAddress.length > 10 ? `${targetAddress.slice(0, 4)}...${targetAddress.slice(-4)}` : targetAddress;
      setNotification({
        text: `Withdrawal of ${withdrawAmount} GRAM submitted to ${shortAddr}!`,
        type: 'success',
      });
      setWithdrawAmount(0);
      setActivePanel('none');
    } catch {
      setNotification({ text: 'Failed to submit withdrawal. Please try again.', type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatShortAddress = (addr: string) => {
    if (!addr) return '';
    if (addr.length <= 14) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

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

      {/* 2. Top Gaming Vault Balance Card */}
      <div className="w-full bg-white border-2 border-black p-4 sketch-shadow rounded-none flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#e0f2fe] border-2 border-black flex items-center justify-center">
            <BankVaultIcon size={30} />
          </div>
          <div>
            <span className="font-sketch text-xs text-[#1a1a1a]/60 uppercase font-bold tracking-wider block">
              Vault Balance
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

      {/* Notification Toast */}
      {notification && (
        <div
          className={`border-2 border-black p-3 rounded-none flex items-center gap-2 font-sketch text-xs font-bold sketch-shadow-xs animate-fade-in ${
            notification.type === 'error'
              ? 'bg-[#fee2e2] text-[#9b2c2c]'
              : notification.type === 'info'
              ? 'bg-[#e0f2fe] text-[#0088cc]'
              : 'bg-[#dcfce7] text-[#166534]'
          }`}
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{notification.text}</span>
        </div>
      )}

      {/* 3. SIDE-BY-SIDE HERO CARDS (DEPOSIT & WITHDRAW) */}
      <div className="grid grid-cols-2 gap-3">
        {/* 1. DEPOSIT CARD */}
        <div
          className={`bg-white border-2 border-black p-3.5 sm:p-4 rounded-none sketch-shadow flex flex-col items-center text-center transition-all ${
            activePanel === 'deposit' ? 'ring-2 ring-[#166534] bg-[#f0fdf4]' : ''
          }`}
        >
          <div className="w-12 h-12 bg-[#dcfce7] border-2 border-black flex items-center justify-center mb-2.5">
            <ArrowDownLeft className="w-6 h-6 text-[#166534] stroke-[2.5]" />
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
            <ArrowUpRight className="w-6 h-6 text-[#9b2c2c] stroke-[2.5]" />
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
              TON Connect
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
            <label className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1">
              Deposit Amount:
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
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

          {/* Dedicated Vault Address */}
          <div>
            <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1">
              Deposit Address:
            </span>
            <div className="flex items-center justify-between p-2 bg-[#f2efe9] border-2 border-black">
              <span className="font-mono text-xs text-[#1a1a1a] font-bold truncate max-w-[200px]">
                {SYSTEM_DEPOSIT_ADDRESS}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(SYSTEM_DEPOSIT_ADDRESS)}
                className="px-2 py-1 bg-white hover:bg-[#fff9c4] border border-black font-sketch text-xs font-bold flex items-center gap-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* On-Chain Transaction CTA */}
          <button
            type="button"
            onClick={handleDepositAction}
            disabled={isProcessing || depositAmount <= 0}
            className="w-full py-2.5 bg-[#166534] hover:bg-[#124d27] text-white border-2 border-black font-sketch text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
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
            <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1">
              Recipient TON Address:
            </span>
            <input
              type="text"
              value={customWallet}
              onChange={(e) => setCustomWallet(e.target.value)}
              className="w-full p-2 bg-[#f2efe9] border-2 border-black font-mono text-xs text-[#1a1a1a] focus:outline-none focus:bg-white"
              placeholder={userFriendlyAddress || 'Connect wallet or enter address'}
            />
          </div>

          {/* Custom Withdraw Amount Input Field */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-sketch text-xs font-bold text-[#1a1a1a]/70">
                Withdraw Amount:
              </label>
              <span className="font-sketch text-[10px] text-[#1a1a1a]/60 font-bold">
                Available: {formatGram(balance)} GRAM
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
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

          <button
            type="button"
            onClick={handleWithdrawAction}
            disabled={isProcessing || withdrawAmount <= 0 || withdrawAmount > balance}
            className="w-full py-2.5 bg-[#1a365d] hover:bg-[#122844] text-white border-2 border-black font-sketch text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-4 h-4" />
            {isProcessing ? 'Processing withdrawal...' : `Withdraw ${withdrawAmount} GRAM`}
          </button>
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
