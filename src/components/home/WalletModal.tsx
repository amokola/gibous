import React, { useState } from 'react';
import { X, ArrowUpRight, ArrowDownLeft, Check, History, Copy } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';
import { BankVaultIcon } from '../icons/GameIcons';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { Transaction } from '../../types/game';

interface WalletModalProps {
  balance: number;
  onDeposit: (amount: number) => void;
  onClose: () => void;
}

const INITIAL_TXS: Transaction[] = [
  { id: 'tx-1', type: 'match_win', amount: 400, time: '10m ago', txHash: 'Match #4812' },
  { id: 'tx-2', type: 'deposit', amount: 500, time: '2h ago', txHash: 'Play-Credit Deposit' },
  { id: 'tx-3', type: 'match_win', amount: 200, time: '1d ago', txHash: 'Match #4690' },
  { id: 'tx-4', type: 'withdraw', amount: -250, time: '2d ago', txHash: 'Vault Withdrawal' },
];

export const WalletModal: React.FC<WalletModalProps> = ({
  balance,
  onDeposit,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');
  const [customAmount, setCustomAmount] = useState<number>(250);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TXS);
  
  const sounds = useSoundEffects();
  const walletAddress = 'EQD...48x9_vault';

  const triggerFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 2500);
  };

  const handleQuickAdd = (amt: number) => {
    sounds.playCoin();
    onDeposit(amt);
    setTransactions(prev => [
      { id: `tx-${Date.now()}`, type: 'deposit', amount: amt, time: 'Just now', txHash: 'Play-Credit Deposit' },
      ...prev,
    ]);
    triggerFeedback(`+${amt} Play GRAM deposited into your balance!`);
  };

  const handleDepositAction = () => {
    if (customAmount <= 0) return;
    sounds.playCoin();
    onDeposit(customAmount);
    setTransactions(prev => [
      { id: `tx-${Date.now()}`, type: 'deposit', amount: customAmount, time: 'Just now', txHash: 'Play-Credit Deposit' },
      ...prev,
    ]);
    triggerFeedback(`+${customAmount} Play GRAM deposited successfully!`);
  };

  const handleWithdrawAction = () => {
    if (balance >= customAmount && customAmount > 0) {
      sounds.playClick();
      onDeposit(-customAmount);
      setTransactions(prev => [
        { id: `tx-${Date.now()}`, type: 'withdraw', amount: -customAmount, time: 'Just now', txHash: 'Play-Credit Withdrawal' },
        ...prev,
      ]);
      triggerFeedback(`-${customAmount} Play GRAM withdrawn from your vault!`);
    } else {
      triggerFeedback(`Insufficient balance to withdraw.`);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopiedAddress(true);
    sounds.playClick();
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="w-full max-w-[390px] bg-[#fbfaf7] bg-dot-grid-dark border-2 sm:border-[2.5px] border-black rounded-none p-5 sketch-shadow-lg flex flex-col max-h-[88vh] overflow-y-auto scrollbar-none text-[#1a1a1a]">
        {/* Header with BankVaultIcon */}
        <div className="flex items-center justify-between pb-2.5 border-b-2 border-black">
          <div className="flex items-center gap-2 text-[#1a1a1a]">
            <BankVaultIcon size={26} />
            <span className="font-sketch text-2xl font-bold tracking-wide">Gibous Vault</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-none bg-white hover:bg-[#f2efe9] border-2 border-black text-[#1a1a1a] sketch-shadow-xs active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert if triggered */}
        {feedbackMsg && (
          <div className="mt-2.5 p-2 rounded-none bg-[#dcfce7] border-2 border-black text-[#166534] font-sketch text-sm font-bold text-center animate-fade-in flex items-center justify-center gap-1.5 sketch-shadow-xs">
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Balance Card */}
        <div className="my-3 p-3.5 rounded-none bg-white border-2 border-black flex flex-col items-center justify-center sketch-shadow-xs">
          <span className="font-sketch text-xs font-bold text-[#1a1a1a]/60 uppercase tracking-wider">
            Play-Credit Balance
          </span>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-sketch text-4xl sm:text-5xl font-bold text-[#1a1a1a]">
              {balance.toLocaleString()}
            </span>
            <span className="font-sketch text-3xl font-bold text-[#9b2c2c]">Play GRAM</span>
            <GramIcon size="md" />
          </div>
        </div>

        {/* Bank Action Tabs */}
        <div className="grid grid-cols-3 gap-1.5 bg-[#f2efe9] p-1 rounded-none border-2 border-black mb-3">
          <button
            type="button"
            onClick={() => setActiveTab('deposit')}
            className={`py-1.5 rounded-none font-sketch text-xs font-bold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'deposit'
                ? 'bg-[#9b2c2c] text-white border border-black sketch-shadow-xs'
                : 'text-[#1a1a1a]/60 hover:text-[#1a1a1a]'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Deposit
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('withdraw')}
            className={`py-1.5 rounded-none font-sketch text-xs font-bold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'withdraw'
                ? 'bg-[#1a365d] text-white border border-black sketch-shadow-xs'
                : 'text-[#1a1a1a]/60 hover:text-[#1a1a1a]'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Withdraw
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`py-1.5 rounded-none font-sketch text-xs font-bold flex items-center justify-center gap-1 transition-all ${
              activeTab === 'history'
                ? 'bg-[#fff9c4] text-[#1a1a1a] border border-black sketch-shadow-xs'
                : 'text-[#1a1a1a]/60 hover:text-[#1a1a1a]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Ledger
          </button>
        </div>

        {/* Tab 1: Deposit View */}
        {activeTab === 'deposit' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="bg-white border-2 border-black p-4 sketch-shadow-xs flex flex-col items-center justify-center text-center rounded-none">
              <div className="w-12 h-12 bg-[#dcfce7] border-2 border-black flex items-center justify-center rounded-none mb-2">
                <ArrowDownLeft className="w-6 h-6 text-[#166534] stroke-[2.5]" />
              </div>
              <h4 className="font-sketch text-2xl font-bold text-[#1a1a1a]">DEPOSIT</h4>
              <span className="font-sketch text-xs text-[#1a1a1a]/60 mb-3">Deposit Play GRAM into Vault</span>
              
              <button
                type="button"
                onClick={() => handleDepositAction()}
                className="w-full py-2 px-4 bg-white hover:bg-[#fbfaf7] border-2 border-black font-sketch text-sm font-bold text-[#1a1a1a] sketch-shadow-xs active:scale-95 transition-all rounded-none"
              >
                Deposit Play GRAM
              </button>
            </div>

            {/* Quick Deposit Presets */}
            <div className="flex flex-col gap-1.5">
              <span className="font-sketch text-xs font-bold text-[#1a1a1a]/80">
                1-Tap Quick Deposit Chips:
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {[100, 250, 500, 1000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleQuickAdd(amt)}
                    className="py-2 px-1 rounded-none bg-white hover:bg-[#fbfaf7] border-2 border-black font-sketch font-bold text-sm text-[#1a1a1a] flex flex-col items-center justify-center transition-all sketch-btn-press sketch-shadow-xs"
                  >
                    <span>+{amt}</span>
                    <span className="text-[10px] text-[#1a365d]">GRAM</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Amount Selector */}
            <div className="p-3 rounded-none bg-white border-2 border-black flex items-center justify-between sketch-shadow-xs">
              <div className="flex flex-col">
                <span className="text-[10px] text-[#1a1a1a]/60 font-bold uppercase font-sketch">Custom Amount</span>
                <span className="font-sketch text-xl font-bold text-[#1a1a1a]">{customAmount} Play GRAM</span>
              </div>
              <div className="flex gap-1">
                {[50, 100, 500].map((inc) => (
                  <button
                    key={inc}
                    onClick={() => setCustomAmount(prev => prev + inc)}
                    className="px-2 py-1 bg-[#f2efe9] hover:bg-[#e8e0d0] border border-black rounded-none font-sketch text-xs text-[#1a1a1a] font-bold"
                  >
                    +{inc}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Withdraw View */}
        {activeTab === 'withdraw' && (
          <div className="flex flex-col gap-3 animate-fade-in">
            <div className="bg-white border-2 border-black p-4 sketch-shadow-xs flex flex-col items-center justify-center text-center rounded-none">
              <div className="w-12 h-12 bg-[#fee2e2] border-2 border-black flex items-center justify-center rounded-none mb-2">
                <ArrowUpRight className="w-6 h-6 text-[#991b1b] stroke-[2.5]" />
              </div>
              <h4 className="font-sketch text-2xl font-bold text-[#1a1a1a]">WITHDRAW</h4>
              <span className="font-sketch text-xs text-[#1a1a1a]/60 mb-3">Withdraw Play GRAM to Wallet</span>
              
              <button
                type="button"
                onClick={handleWithdrawAction}
                className="w-full py-2 px-4 bg-white hover:bg-[#fbfaf7] border-2 border-black font-sketch text-sm font-bold text-[#1a1a1a] sketch-shadow-xs active:scale-95 transition-all rounded-none"
              >
                Withdraw Play GRAM
              </button>
            </div>

            <div className="p-3 rounded-none bg-white border-2 border-black flex flex-col gap-1 sketch-shadow-xs">
              <span className="text-[10px] text-[#1a1a1a]/60 font-bold uppercase font-sketch">Destination Address</span>
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#1a1a1a] font-bold">{walletAddress}</span>
                <button
                  onClick={handleCopy}
                  className="px-2.5 py-1 rounded-none bg-[#fff9c4] border border-black font-sketch text-xs font-bold text-[#1a1a1a] sketch-shadow-xs flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {copiedAddress ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="p-3 rounded-none bg-white border-2 border-black flex items-center justify-between sketch-shadow-xs">
              <div className="flex flex-col">
                <span className="text-[10px] text-[#1a1a1a]/60 font-bold uppercase font-sketch">Withdraw Amount</span>
                <span className="font-sketch text-xl font-bold text-[#1a1a1a]">{customAmount} Play GRAM</span>
              </div>
              <button
                onClick={() => setCustomAmount(balance)}
                className="px-2.5 py-1 bg-[#f2efe9] hover:bg-[#e8e0d0] border border-black rounded-none font-sketch text-xs text-[#9b2c2c] font-bold"
              >
                Max ({balance})
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Transaction Ledger View */}
        {activeTab === 'history' && (
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[220px] pr-1 scrollbar-none animate-fade-in">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="p-2.5 rounded-none border-2 border-black bg-white flex items-center justify-between sketch-shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-none border border-black flex items-center justify-center ${
                      tx.type === 'deposit'
                        ? 'bg-[#dcfce7] text-[#166534]'
                        : tx.type === 'match_win'
                        ? 'bg-[#fff9c4] text-[#854d0e]'
                        : 'bg-[#fee2e2] text-[#991b1b]'
                    }`}
                  >
                    {tx.type === 'deposit' ? (
                      <ArrowDownLeft className="w-4 h-4" />
                    ) : tx.type === 'match_win' ? (
                      <GramIcon size="sm" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex flex-col">
                    <span className="font-sketch text-xs font-bold text-[#1a1a1a] capitalize">
                      {tx.type.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-[#1a1a1a]/60 font-mono">
                      {tx.time} • {tx.txHash}
                    </span>
                  </div>
                </div>

                <div
                  className={`font-sketch text-sm font-bold ${
                    tx.amount > 0 ? 'text-[#166534]' : 'text-[#991b1b]'
                  }`}
                >
                  {tx.amount > 0 ? `+${tx.amount}` : tx.amount} Play GRAM
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
