import React from 'react';
import { GameSettings } from '../../types/game';
import { LayoutGrid, Zap } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';
import { useSoundEffects } from '../../hooks/useSoundEffects';

interface GameSettingsCardProps {
  settings: GameSettings;
  onChangeSettings: (newSettings: Partial<GameSettings>) => void;
}

const CHIP_PRESETS = [50, 100, 250, 500, 1000];

export const GameSettingsCard: React.FC<GameSettingsCardProps> = ({
  settings,
  onChangeSettings,
}) => {
  const sounds = useSoundEffects();

  const handleSelectChip = (amount: number) => {
    sounds.playCoin();
    onChangeSettings({ winningAmount: amount });
  };

  const toggleMode = () => {
    sounds.playClick();
    onChangeSettings({
      mode: settings.mode === 'classic' ? 'blitz' : 'classic',
    });
  };

  const totalPot = settings.winningAmount * 2;
  const arenaFee = Math.floor(totalPot * 0.10);
  const netWinnerPayout = totalPot - arenaFee; // 180% of single stake
  const drawRefundPerPlayer = Math.floor(settings.winningAmount * 0.95);

  return (
    <div className="w-full bg-white border-2 border-black rounded-none p-3.5 flex flex-col gap-2.5 select-none sketch-shadow-xs text-[#1a1a1a]">
      <div className="flex items-center justify-between">
        <span className="font-sketch text-xs font-bold text-[#1a1a1a]/60 uppercase tracking-wider">
          Match Stakes & Pot
        </span>
        <span className="font-sketch text-xs font-bold text-[#1a365d]">
          Total Pot: {totalPot} Play GRAM
        </span>
      </div>

      {/* Stake Chips Selector */}
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-5 gap-1.5">
          {CHIP_PRESETS.map((amt) => {
            const isSelected = settings.winningAmount === amt;
            return (
              <button
                key={amt}
                type="button"
                onClick={() => handleSelectChip(amt)}
                className={`py-2 px-1 rounded-none border-2 border-black font-sketch font-bold text-xs flex flex-col items-center justify-center transition-all sketch-btn-press ${
                  isSelected
                    ? 'bg-[#9b2c2c] text-white sketch-shadow-xs scale-105 ring-2 ring-black'
                    : 'bg-[#f2efe9] text-[#1a1a1a] hover:bg-[#e8e0d0]'
                }`}
              >
                <span>{amt}</span>
                <span className="text-[9px] opacity-80">GRAM</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pot Payout & Economic Breakdown Card */}
      <div className="p-2.5 rounded-none bg-[#f2efe9] border border-black flex flex-col gap-1 text-xs">
        <div className="flex items-center justify-between font-semibold">
          <div className="flex items-center gap-1.5 text-[#1a1a1a]/80 font-sketch">
            <Zap className="w-3.5 h-3.5 text-[#ca8a04]" />
            <span>Winner Takes:</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-sketch text-sm font-bold text-[#166534]">
              +{netWinnerPayout} Play GRAM
            </span>
            <GramIcon size="sm" />
            <span className="text-[10px] text-[#1a1a1a]/60 font-sketch font-bold">(-10% Arena Fee)</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#1a1a1a]/70 font-sketch border-t border-black/10 pt-1">
          <span>In case of Draw:</span>
          <span className="font-bold text-[#1a365d]">
            Each player walks with {drawRefundPerPlayer} Play GRAM (95% Refund)
          </span>
        </div>
      </div>

      {/* Game Mode Switcher */}
      <button
        type="button"
        onClick={toggleMode}
        className="w-full flex items-center justify-between py-2 px-2.5 rounded-none bg-[#f2efe9] hover:bg-[#e8e0d0] border border-black transition-all active:scale-[0.99]"
      >
        <div className="flex items-center gap-2 text-[#1a1a1a]">
          <LayoutGrid className="w-4 h-4 text-[#9b2c2c]" />
          <span className="text-xs font-semibold font-sketch">Pacing Mode</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-sketch text-xs font-bold uppercase px-2 py-0.5 rounded-none bg-[#fff9c4] text-[#854d0e] border border-black">
            {settings.mode === 'classic' ? 'Standard ⏱️' : 'Blitz ⚡'}
          </span>
        </div>
      </button>
    </div>
  );
};
