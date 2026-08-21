import React, { useEffect, useState } from 'react';
import { Globe, Check } from 'lucide-react';
import { Player } from '../../types/game';
import { Avatar } from '../ui/Avatar';
import { GramIcon } from '../ui/GramIcon';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { useTelegram } from '../../hooks/useTelegram';

interface OnlineMatchmakingModalProps {
  p1: Player;
  potAmount: number;
  onMatchFound: () => void;
  onCancel: () => void;
}

const OPPONENT_POOL = [
  { name: 'Cyber Ninja', avatarUrl: '', color: 'blue' as const, rank: 'Diamond' },
  { name: 'Alex Ton', avatarUrl: '', color: 'blue' as const, rank: 'Master' },
  { name: 'Gram Whale', avatarUrl: '', color: 'blue' as const, rank: 'Gold' },
  { name: 'Samurai X', avatarUrl: '', color: 'blue' as const, rank: 'Diamond' },
];

export const OnlineMatchmakingModal: React.FC<OnlineMatchmakingModalProps> = ({
  p1,
  potAmount,
  onMatchFound,
  onCancel,
}) => {
  const [matchState, setMatchState] = useState<'searching' | 'found'>('searching');
  const [opponent, setOpponent] = useState(OPPONENT_POOL[0]);
  const [countdown, setCountdown] = useState(3);
  const sounds = useSoundEffects();
  const { haptic } = useTelegram();

  useEffect(() => {
    // Pick random opponent
    const randomOpponent = OPPONENT_POOL[Math.floor(Math.random() * OPPONENT_POOL.length)];
    setOpponent(randomOpponent);

    // Simulate search latency (1.8s)
    const searchTimer = setTimeout(() => {
      setMatchState('found');
      sounds.playMatchFound();
      haptic.notification('success');
    }, 1800);

    return () => clearTimeout(searchTimer);
  }, [sounds, haptic]);

  useEffect(() => {
    if (matchState === 'found') {
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            onMatchFound();
            return 0;
          }
          sounds.playCountdown(600);
          return prev - 1;
        });
      }, 900);

      return () => clearInterval(interval);
    }
  }, [matchState, onMatchFound, sounds]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="w-full max-w-[380px] bg-[#fbfaf7] bg-dot-grid-dark border-3 border-black rounded-3xl p-6 sketch-shadow-lg flex flex-col items-center relative text-center text-[#1a1a1a]">
        {/* Radar Icon / Match Status */}
        <div className="relative my-3 flex items-center justify-center">
          {matchState === 'searching' ? (
            <div className="relative w-24 h-24 rounded-full bg-white border-3 border-black flex items-center justify-center sketch-shadow-lg">
              {/* Radar sweep lines */}
              <div className="absolute inset-0 rounded-full border-2 border-[#1a365d]/30 animate-ping pointer-events-none" />
              <div className="absolute inset-2 rounded-full border border-dashed border-[#1a365d]/40 animate-spin pointer-events-none" />
              <Globe className="w-10 h-10 text-[#1a365d] animate-pulse" />
            </div>
          ) : (
            <div className="w-24 h-24 rounded-full bg-[#dcfce7] border-3 border-black flex items-center justify-center sketch-shadow-lg animate-bounce-subtle">
              <Check className="w-12 h-12 text-[#166534] stroke-[3]" />
            </div>
          )}
        </div>

        {/* Title */}
        <h3 className="font-sketch text-2xl sm:text-3xl font-bold text-[#1a1a1a] mt-1">
          {matchState === 'searching' ? 'Finding Live Opponent...' : 'Opponent Found!'}
        </h3>
        <p className="text-xs text-[#1a1a1a]/60 mt-0.5 font-sketch">
          {matchState === 'searching'
            ? 'Scanning active players across Telegram...'
            : 'Match confirmed. Starting duel in:'}
        </p>

        {/* Countdown Badge if Found */}
        {matchState === 'found' && (
          <div className="my-2 flex items-center justify-center">
            <span className="font-sketch text-4xl font-black text-[#854d0e] bg-[#fff9c4] border-2 border-black px-4 py-1 rounded-2xl sketch-shadow animate-pulse">
              {countdown}s
            </span>
          </div>
        )}

        {/* VS Matchup Showcase */}
        <div className="w-full bg-white border-2 border-black rounded-2xl p-3 my-3 flex items-center justify-around sketch-shadow-xs">
          {/* Player 1 */}
          <div className="flex flex-col items-center">
            <Avatar
              photoUrl={p1.avatarUrl}
              name={p1.name}
              color="green"
              size="md"
              showCheck={true}
              isActive={true}
            />
            <span className="font-sketch text-sm font-bold text-[#1a1a1a] mt-1 truncate max-w-[80px]">
              {p1.name}
            </span>
          </div>

          <div className="flex flex-col items-center">
            <span className="font-sketch text-sm font-bold text-[#1a1a1a]/60">VS</span>
            <div className="flex items-center gap-1 mt-1">
              <span className="font-sketch text-xs text-[#1a365d] font-bold">
                {potAmount}
              </span>
              <GramIcon size="sm" />
            </div>
          </div>

          {/* Opponent */}
          <div className="flex flex-col items-center">
            {matchState === 'searching' ? (
              <div className="w-11 h-11 rounded-2xl bg-[#f2efe9] border-2 border-dashed border-[#1a1a1a]/40 flex items-center justify-center animate-pulse font-sketch text-xl font-bold text-[#1a1a1a]/50">
                ?
              </div>
            ) : (
              <Avatar
                name={opponent.name}
                color="blue"
                size="md"
                showCheck={true}
                isActive={true}
              />
            )}
            <span className="font-sketch text-sm font-bold text-[#1a1a1a] mt-1 truncate max-w-[80px]">
              {matchState === 'searching' ? 'Searching...' : opponent.name}
            </span>
          </div>
        </div>

        {/* Cancel Button */}
        {matchState === 'searching' && (
          <button
            type="button"
            onClick={onCancel}
            className="mt-1 px-5 py-2 rounded-xl bg-white hover:bg-[#f2efe9] border-2 border-black font-sketch text-xs font-bold text-[#1a1a1a] sketch-shadow-xs active:scale-95 transition-all"
          >
            Cancel Matchmaking
          </button>
        )}
      </div>
    </div>
  );
};
