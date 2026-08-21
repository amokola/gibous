import React, { useState } from 'react';
import { X, Trophy, Swords, Flame, Sparkles, Check, Gamepad2, Shield } from 'lucide-react';
import { GramIcon } from '../ui/GramIcon';
import { Avatar } from '../ui/Avatar';
import { UserProfile } from '../../types/game';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { SketchButton } from '../ui/SketchButton';

interface ProfileModalProps {
  profile: UserProfile;
  onUpdateAvatar: (avatarId: string) => void;
  onClose: () => void;
}

const AVATAR_PRESETS = [
  { id: 'viper', name: 'Green Viper', color: 'green' as const, bg: 'bg-[#9b2c2c]' },
  { id: 'ninja', name: 'Cyber Ronin', color: 'blue' as const, bg: 'bg-[#1a365d]' },
  { id: 'owl', name: 'Blueprint Owl', color: 'blue' as const, bg: 'bg-[#0369a1]' },
  { id: 'lion', name: 'Golden Lion', color: 'green' as const, bg: 'bg-[#ca8a04]' },
  { id: 'dice', name: 'Dice Master', color: 'green' as const, bg: 'bg-[#b91c1c]' },
];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  profile,
  onUpdateAvatar,
  onClose,
}) => {
  const [selectedAvatar, setSelectedAvatar] = useState(profile.avatarId || 'viper');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const sounds = useSoundEffects();

  const handleSelectAvatar = (id: string) => {
    sounds.playClick();
    setSelectedAvatar(id);
  };

  const handleSaveAvatar = () => {
    sounds.playCoin();
    onUpdateAvatar(selectedAvatar);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="w-full max-w-[390px] bg-[#fbfaf7] bg-dot-grid-dark border-2 sm:border-[2.5px] border-black rounded-none p-5 sketch-shadow-lg flex flex-col max-h-[88vh] overflow-y-auto scrollbar-none relative text-[#1a1a1a]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-black">
          <div className="flex items-center gap-2 text-[#1a1a1a]">
            <Shield className="w-6 h-6 text-[#9b2c2c]" />
            <span className="font-sketch text-2xl font-bold tracking-wide">Player Career</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-none bg-white hover:bg-[#f2efe9] border-2 border-black text-[#1a1a1a] sketch-shadow-xs active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Profile Card Hero */}
        <div className="my-3 p-4 rounded-none bg-white border-2 border-black flex items-center gap-3.5 sketch-shadow-xs">
          <Avatar
            photoUrl={profile.avatarUrl}
            name={profile.name}
            color={selectedAvatar === 'ninja' || selectedAvatar === 'owl' ? 'blue' : 'green'}
            size="lg"
            showCheck={true}
            isActive={true}
          />
          <div className="flex flex-col">
            <span className="font-sketch text-xl font-bold text-[#1a1a1a] leading-tight">
              {profile.name}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-sketch text-xs bg-[#fff9c4] text-[#1a1a1a] border border-black px-2 py-0.5 rounded-none font-bold sketch-shadow-xs -rotate-1">
                Lv.{profile.level}
              </span>
              <span className="text-xs font-bold text-[#1a365d] uppercase tracking-wider font-sketch">
                {profile.rank}
              </span>
            </div>
            {/* Level XP Progress Bar */}
            <div className="w-36 h-2 bg-[#f2efe9] rounded-none border border-black overflow-hidden mt-1.5">
              <div
                className="h-full bg-[#9b2c2c] transition-all duration-500"
                style={{ width: `${(profile.xp % 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Career Statistics Grid */}
        <div className="grid grid-cols-2 gap-2.5 my-1">
          {/* Win Rate */}
          <div className="bg-white border-2 border-black rounded-none p-3 flex flex-col items-center text-center sketch-shadow-xs">
            <Trophy className="w-5 h-5 text-[#ca8a04] mb-1" />
            <span className="text-[10px] font-bold text-[#1a1a1a]/60 uppercase font-sketch">Win Rate</span>
            <span className="font-sketch text-2xl font-bold text-[#166534]">
              {profile.winRate}%
            </span>
          </div>

          {/* Win Streak */}
          <div className="bg-white border-2 border-black rounded-none p-3 flex flex-col items-center text-center sketch-shadow-xs">
            <Flame className="w-5 h-5 text-[#c2410c] mb-1" />
            <span className="text-[10px] font-bold text-[#1a1a1a]/60 uppercase font-sketch">Current Streak</span>
            <span className="font-sketch text-2xl font-bold text-[#c2410c]">
              {profile.winStreak} Wins 🔥
            </span>
          </div>

          {/* Total PVP Matches */}
          <div className="bg-white border-2 border-black rounded-none p-3 flex flex-col items-center text-center sketch-shadow-xs">
            <Swords className="w-5 h-5 text-[#1a365d] mb-1" />
            <span className="text-[10px] font-bold text-[#1a1a1a]/60 uppercase font-sketch">Total Matches</span>
            <span className="font-sketch text-2xl font-bold text-[#1a1a1a]">
              {profile.totalMatches}
            </span>
          </div>

          {/* Total GRAM Won */}
          <div className="bg-white border-2 border-black rounded-none p-3 flex flex-col items-center text-center sketch-shadow-xs">
            <Sparkles className="w-5 h-5 text-[#ca8a04] mb-1" />
            <span className="text-[10px] font-bold text-[#1a1a1a]/60 uppercase font-sketch">Total Earned</span>
            <div className="flex items-center gap-1">
              <span className="font-sketch text-2xl font-bold text-[#1a365d]">
                +{profile.totalWon.toLocaleString()}
              </span>
              <GramIcon size="sm" />
            </div>
          </div>
        </div>

        {/* Favorite Game Badge */}
        <div className="my-2 p-2.5 rounded-none bg-white border-2 border-black flex items-center justify-between sketch-shadow-xs">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-[#9b2c2c]" />
            <span className="text-xs font-semibold text-[#1a1a1a]/70 font-sketch">Favorite Arena:</span>
          </div>
          <span className="font-sketch text-sm font-bold text-[#1a1a1a] bg-[#fff9c4] px-2.5 py-0.5 rounded-none border border-black">
            {profile.favoriteGame}
          </span>
        </div>

        {/* Avatar Selector */}
        <div className="my-2 flex flex-col gap-1.5">
          <span className="font-sketch text-sm font-bold text-[#1a1a1a]/80">
            Choose Your Neo-Brutalist Avatar:
          </span>
          <div className="grid grid-cols-5 gap-2">
            {AVATAR_PRESETS.map((preset) => {
              const isSelected = selectedAvatar === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectAvatar(preset.id)}
                  className={`aspect-square rounded-none border-2 border-black flex items-center justify-center font-sketch font-bold text-sm text-white transition-all sketch-btn-press ${
                    preset.bg
                  } ${
                    isSelected
                      ? 'ring-2 ring-[#9b2c2c] scale-105 sketch-shadow-xs'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  {preset.name[0]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Save CTA */}
        <div className="mt-3 pt-2 border-t-2 border-black">
          <SketchButton
            variant="primary"
            size="md"
            fullWidth
            icon={savedSuccess ? <Check className="w-4 h-4 stroke-[3]" /> : undefined}
            onClick={handleSaveAvatar}
          >
            {savedSuccess ? 'Saved Profile!' : 'Save Avatar & Continue'}
          </SketchButton>
        </div>
      </div>
    </div>
  );
};
