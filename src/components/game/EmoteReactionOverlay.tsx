import React, { useState } from 'react';
import { EmoteReaction } from '../../types/game';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { useTelegram } from '../../hooks/useTelegram';
import { Smile } from 'lucide-react';

interface EmoteReactionOverlayProps {
  onSendEmote?: (emote: EmoteReaction) => void;
}

const EMOTE_LIST: EmoteReaction[] = ['🔥', '😱', '😈', '👏', '🎲', '👑'];

export const EmoteReactionOverlay: React.FC<EmoteReactionOverlayProps> = ({ onSendEmote }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [floatingEmotes, setFloatingEmotes] = useState<{ id: number; emote: EmoteReaction; x: number }[]>([]);
  const sounds = useSoundEffects();
  const { haptic } = useTelegram();

  const handleTriggerEmote = (emote: EmoteReaction) => {
    sounds.playEmote();
    haptic.impact('light');

    const newFloating = {
      id: Date.now() + Math.random(),
      emote,
      x: 20 + Math.random() * 60,
    };

    setFloatingEmotes((prev) => [...prev, newFloating]);
    if (onSendEmote) onSendEmote(emote);

    setTimeout(() => {
      setFloatingEmotes((prev) => prev.filter((e) => e.id !== newFloating.id));
    }, 1400);

    setIsOpen(false);
  };

  return (
    <>
      {/* Floating Emote Particles */}
      <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden">
        {floatingEmotes.map((item) => (
          <div
            key={item.id}
            className="absolute bottom-24 text-3xl sm:text-4xl animate-bounce-subtle select-none filter drop-shadow-md"
            style={{
              left: `${item.x}%`,
              animation: 'floatUp 1.4s cubic-bezier(0.1, 0.8, 0.3, 1) forwards',
            }}
          >
            {item.emote}
          </div>
        ))}
      </div>

      {/* Emote Picker Launcher */}
      <div className="relative inline-block select-none">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className={`p-2 rounded-2xl border-2 border-black transition-all sketch-shadow-xs active:scale-95 ${
            isOpen ? 'bg-[#fff9c4] text-[#1a1a1a]' : 'bg-white text-[#1a1a1a] hover:bg-[#fbfaf7]'
          }`}
          aria-label="Send Reaction Emote"
        >
          <Smile className="w-4 h-4 stroke-[2.5]" />
        </button>

        {/* Emote Selector Drawer */}
        {isOpen && (
          <div className="absolute bottom-11 right-0 bg-white border-2 border-black rounded-2xl p-2 sketch-shadow-md flex gap-1.5 animate-fade-in z-50">
            {EMOTE_LIST.map((emote) => (
              <button
                key={emote}
                type="button"
                onClick={() => handleTriggerEmote(emote)}
                className="w-8 h-8 rounded-xl bg-[#f2efe9] hover:bg-[#e8e0d0] border border-black flex items-center justify-center text-lg hover:scale-110 active:scale-95 transition-transform"
              >
                {emote}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
