import React, { useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, Check, History, Copy, ShieldCheck, Zap } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';
import { BankVaultIcon } from '../icons/GameIcons';
import { useSoundEffects } from '../../hooks/useSoundEffects';

interface BankScreenProps {
  balance: number;
  onDeposit: (amount: number) => void;
}

interface BankTransactionItem {
  id: string;
  type: 'win' | 'arena_fee' | 'draw_refund' | 'deposit' | 'withdraw';
  amount: number;
  timestamp: string;
  description: string;
  subtext?: string;
}

const DEFAULT_TRANSACTIONS: BankTransactionItem[] = [
  { id: '1', type: 'win', amount: 180, timestamp: '10m ago', description: 'Snakes & Ladders Duel Win (Net 90% Pot)', subtext: 'Fair Server-Run Match' },
  { id: '2', type: 'arena_fee', amount: -20, timestamp: '10m ago', description: 'Gibous Arena Fee (10% on 200 Pot)', subtext: 'Platform Maintenance' },
  { id: '3', type: 'draw_refund', amount: 95, timestamp: '2h ago', description: 'Four in a Row Draw (95% Stake Refund)', subtext: 'Fair Server-Run Match' },
  { id: '4', type: 'deposit', amount: 500, timestamp: '1d ago', description: 'Play-Credit Deposit / Top-Up', subtext: 'Gibous Vault Credit' },
  { id: '5', type: 'win', amount: 900, timestamp: '2d ago', description: 'Four in a Row High Roller Win (500 Stake)', subtext: 'Fair Server-Run Match' },
];

export const BankScreen: React.FC<BankScreenProps> = ({
  balance,
  onDeposit,
}) => {
  const [activePanel, setActivePanel] = useState<'none' | 'deposit' | 'withdraw'>('none');
  const [depositAmount, setDepositAmount] = useState<number>(250);
  const [withdrawAmount, setWithdrawAmount] = useState<number>(500);
  const [customWallet, setCustomWallet] = useState<string>('EQD48x9_ton_player_wallet');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<{ text: string; type: 'success' | 'info' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [transactions, setTransactions] = useState<BankTransactionItem[]>(DEFAULT_TRANSACTIONS);

  const sounds = useSoundEffects();
  const SYSTEM_DEPOSIT_ADDRESS = 'EQB_GIBOUS_VAULT_DEPOSIT_CONTRACT';

  const handleDepositAction = () => {
    sounds.playCoin();
    setIsProcessing(true);
    setTimeout(() => {
      onDeposit(depositAmount);
      setIsProcessing(false);
      setNotification({ text: `Successfully credited +${depositAmount} Play GRAM to your vault!`, type: 'success' });
      setTransactions(prev => [
        {
          id: `tx-${Date.now()}`,
          type: 'deposit',
          amount: depositAmount,
          timestamp: 'Just now',
          description: `Vault Deposit (+${depositAmount} Play GRAM)`,
          subtext: 'Play Credits Credited',
        },
        ...prev,
      ]);
      setActivePanel('none');
      setTimeout(() => setNotification(null), 3500);
    }, 500);
  };

  const handleWithdrawAction = () => {
    if (balance < withdrawAmount || withdrawAmount <= 0) return;
    sounds.playCoin();
    setIsProcessing(true);
    setTimeout(() => {
      onDeposit(-withdrawAmount);
      setIsProcessing(false);
      setNotification({ text: `Withdrawal of ${withdrawAmount} Play GRAM dispatched to ${customWallet.slice(0, 10)}...!`, type: 'success' });
      setTransactions(prev => [
        {
          id: `tx-${Date.now()}`,
          type: 'withdraw',
          amount: -withdrawAmount,
          timestamp: 'Just now',
          description: `Vault Withdrawal (-${withdrawAmount} Play GRAM)`,
          subtext: 'Dispatched to Wallet',
        },
        ...prev,
      ]);
      setActivePanel('none');
      setTimeout(() => setNotification(null), 3500);
    }, 500);
  };

  const handleCopy = (text: string) => {
    sounds.playClick();
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-[420px] mx-auto h-auto flex flex-col gap-3.5 p-3 sm:p-4 select-none animate-fade-in pb-16 bg-[#fbfaf7] text-[#1a1a1a]">
      {/* Top Gaming Vault Balance Card */}
      <div className="w-full bg-white border-2 border-black p-4 sketch-shadow rounded-none flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#e0f2fe] border-2 border-black flex items-center justify-center">
            <BankVaultIcon size={30} />
          </div>
          <div>
            <span className="font-sketch text-xs text-[#1a1a1a]/60 uppercase font-bold tracking-wider block">
              Play-Credit Balance
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-sketch text-2xl sm:text-3xl font-bold text-[#1a365d]">
                {balance.toLocaleString()}
              </span>
              <span className="font-sketch text-base font-bold text-[#9b2c2c]">Play GRAM</span>
              <GramIcon size="md" />
            </div>
            <span className="font-sketch text-[10px] text-[#166534] font-bold block mt-0.5">
              Gibous Vault • Fair Server-Run Duels
            </span>
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="bg-[#dcfce7] border-2 border-black p-3 rounded-none flex items-center gap-2 font-sketch text-xs font-bold text-[#166534] sketch-shadow-xs animate-fade-in">
          <Check className="w-4 h-4 stroke-[3]" />
          <span>{notification.text}</span>
        </div>
      )}

      {/* SIDE-BY-SIDE HERO CARDS (DEPOSIT & WITHDRAW) */}
      <div className="grid grid-cols-2 gap-3">
        {/* 1. DEPOSIT CARD */}
        <div
          className={`bg-white border-2 border-black p-3.5 sm:p-4 rounded-none sketch-shadow flex flex-col items-center text-center transition-all ${
            activePanel === 'deposit' ? 'ring-2 ring-[#166534] bg-[#f0fdf4]' : ''
          }`}
        >
          {/* Square Mint Green Container with diagonal down-left arrow */}
          <div className="w-12 h-12 bg-[#dcfce7] border-2 border-black flex items-center justify-center mb-2.5">
            <ArrowDownLeft className="w-6 h-6 text-[#166534] stroke-[2.5]" />
          </div>

          <h3 className="font-sketch text-lg sm:text-xl font-black text-[#1a1a1a] tracking-wide">
            DEPOSIT
          </h3>
          <p className="font-sketch text-[11px] text-[#1a1a1a]/70 mb-3 min-h-[28px] flex items-center justify-center">
            Play GRAM to Vault
          </p>

          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setActivePanel(prev => prev === 'deposit' ? 'none' : 'deposit');
            }}
            className={`w-full py-2 bg-white hover:bg-[#f2efe9] text-[#1a1a1a] border-2 border-black font-sketch text-xs sm:text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all ${
              activePanel === 'deposit' ? 'bg-[#fff9c4] text-[#854d0e]' : ''
            }`}
          >
            {activePanel === 'deposit' ? 'Close Deposit' : 'Deposit Credits'}
          </button>
        </div>

        {/* 2. WITHDRAW CARD */}
        <div
          className={`bg-white border-2 border-black p-3.5 sm:p-4 rounded-none sketch-shadow flex flex-col items-center text-center transition-all ${
            activePanel === 'withdraw' ? 'ring-2 ring-[#9b2c2c] bg-[#fff1f2]' : ''
          }`}
        >
          {/* Square Soft Pink Container with diagonal up-right arrow */}
          <div className="w-12 h-12 bg-[#fee2e2] border-2 border-black flex items-center justify-center mb-2.5">
            <ArrowUpRight className="w-6 h-6 text-[#9b2c2c] stroke-[2.5]" />
          </div>

          <h3 className="font-sketch text-lg sm:text-xl font-black text-[#1a1a1a] tracking-wide">
            WITHDRAW
          </h3>
          <p className="font-sketch text-[11px] text-[#1a1a1a]/70 mb-3 min-h-[28px] flex items-center justify-center">
            To Telegram / Wallet
          </p>

          <button
            type="button"
            onClick={() => {
              sounds.playClick();
              setActivePanel(prev => prev === 'withdraw' ? 'none' : 'withdraw');
            }}
            className={`w-full py-2 bg-white hover:bg-[#f2efe9] text-[#1a1a1a] border-2 border-black font-sketch text-xs sm:text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all ${
              activePanel === 'withdraw' ? 'bg-[#fee2e2] text-[#9b2c2c]' : ''
            }`}
          >
            {activePanel === 'withdraw' ? 'Close Withdraw' : 'Withdraw Credits'}
          </button>
        </div>
      </div>

      {/* INTERACTIVE EXPANDED DEPOSIT PANEL */}
      {activePanel === 'deposit' && (
        <div className="w-full bg-white border-2 border-black p-4 rounded-none sketch-shadow flex flex-col gap-3 animate-fade-in">
          <div className="flex items-center justify-between border-b-2 border-black pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[#dcfce7] border border-black flex items-center justify-center font-sketch text-xs font-bold text-[#166534]">
                +
              </div>
              <span className="font-sketch text-base font-bold text-[#1a1a1a]">Deposit Play GRAM</span>
            </div>
            <span className="font-sketch text-xs text-[#166534] bg-[#dcfce7] px-2 py-0.5 border border-black font-bold">
              Instant
            </span>
          </div>

          {/* Custom Deposit Amount Input Field */}
          <div>
            <label className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1">
              Enter Deposit Amount (Play GRAM):
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="10"
                  max="100000"
                  value={depositAmount || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setDepositAmount(isNaN(val) ? 0 : Math.max(0, val));
                  }}
                  className="w-full p-2 bg-[#f2efe9] border-2 border-black font-sketch text-base font-bold text-[#1a1a1a] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#166534]"
                  placeholder="e.g. 500"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-sketch text-xs font-bold text-[#1a1a1a]/60">
                  Play GRAM
                </span>
              </div>
            </div>
          </div>

          {/* Quick Amount Chips */}
          <div>
            <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1.5">
              Quick Select Amount:
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[100, 250, 500, 1000].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    sounds.playClick();
                    setDepositAmount(amt);
                  }}
                  className={`py-2 rounded-none border-2 border-black font-sketch text-xs font-bold transition-all sketch-btn-press ${
                    depositAmount === amt
                      ? 'bg-[#fff9c4] text-[#854d0e] sketch-shadow-xs ring-2 ring-[#ca8a04]'
                      : 'bg-[#f2efe9] text-[#1a1a1a]'
                  }`}
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>

          {/* Dedicated Vault Address */}
          <div>
            <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1">
              Dedicated Vault Address:
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

          {/* Instant Credit CTA */}
          <button
            type="button"
            onClick={handleDepositAction}
            disabled={isProcessing || depositAmount <= 0}
            className="w-full py-2.5 bg-[#166534] hover:bg-[#124d27] text-white border-2 border-black font-sketch text-sm font-bold sketch-shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            {isProcessing ? 'Crediting Vault...' : `Confirm Deposit (+${depositAmount} Play GRAM)`}
          </button>
        </div>
      )}

      {/* INTERACTIVE EXPANDED WITHDRAW PANEL */}
      {activePanel === 'withdraw' && (
        <div className="w-full bg-white border-2 border-black p-4 rounded-none sketch-shadow flex flex-col gap-3 animate-fade-in">
          <div className="flex items-center justify-between border-b-2 border-black pb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[#fee2e2] border border-black flex items-center justify-center font-sketch text-xs font-bold text-[#9b2c2c]">
                -
              </div>
              <span className="font-sketch text-base font-bold text-[#1a1a1a]">Withdraw to Wallet</span>
            </div>
            <span className="font-sketch text-xs text-[#9b2c2c] bg-[#fee2e2] px-2 py-0.5 border border-black font-bold">
              Instant Payout
            </span>
          </div>

          {/* Destination Wallet Input */}
          <div>
            <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1">
              Your Destination Wallet:
            </span>
            <input
              type="text"
              value={customWallet}
              onChange={(e) => setCustomWallet(e.target.value)}
              className="w-full p-2 bg-[#f2efe9] border-2 border-black font-mono text-xs text-[#1a1a1a] focus:outline-none focus:bg-white"
              placeholder="Enter destination wallet address"
            />
          </div>

          {/* Custom Withdraw Amount Input Field */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="font-sketch text-xs font-bold text-[#1a1a1a]/70">
                Enter Withdraw Amount (Play GRAM):
              </label>
              <span className="font-sketch text-[10px] text-[#1a1a1a]/60 font-bold">
                Vault: {balance.toLocaleString()} Play GRAM
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="10"
                  max={balance}
                  value={withdrawAmount || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    setWithdrawAmount(isNaN(val) ? 0 : Math.max(0, val));
                  }}
                  className="w-full p-2 bg-[#f2efe9] border-2 border-black font-sketch text-base font-bold text-[#1a1a1a] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#9b2c2c]"
                  placeholder="e.g. 500"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 font-sketch text-xs font-bold text-[#1a1a1a]/60">
                  Play GRAM
                </span>
              </div>
            </div>
            {withdrawAmount > balance && (
              <span className="text-[10px] text-[#9b2c2c] font-bold font-sketch mt-1 block">
                ⚠️ Amount exceeds available vault balance ({balance} Play GRAM)
              </span>
            )}
          </div>

          {/* Withdraw Percentage Chips */}
          <div>
            <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 block mb-1.5">
              Quick Percentage Select:
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: '25%', amt: Math.floor(balance * 0.25) },
                { label: '50%', amt: Math.floor(balance * 0.50) },
                { label: '75%', amt: Math.floor(balance * 0.75) },
                { label: '100% Max', amt: balance },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    sounds.playClick();
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
            {isProcessing ? 'Processing Payout...' : `Withdraw ${withdrawAmount} Play GRAM`}
          </button>
        </div>
      )}

      {/* TRANSACTION LEDGER & ARENA FEE AUDIT */}
      <div className="flex flex-col gap-2 mt-1">
        <div className="flex items-center justify-between px-1">
          <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5" />
            <span>Vault Ledger & Arena Fee Audit</span>
          </span>
          <span className="font-sketch text-[10px] text-[#854d0e] bg-[#fff9c4] px-1.5 py-0.5 border border-black font-bold">
            10% Arena Fee • 95% Draw
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
                {tx.timestamp} • {tx.subtext || 'Fair Server-Run Match'}
              </span>
            </div>
            <div
              className={`font-sketch text-sm font-bold ${
                tx.amount > 0 ? 'text-[#166534]' : 'text-[#9b2c2c]'
              }`}
            >
              {tx.amount > 0 ? `+${tx.amount}` : tx.amount} Play GRAM
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
