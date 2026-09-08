import React, { useState } from 'react';
import { Copy, Check, Share2, ArrowLeft, Loader2 } from 'lucide-react';
import { GameType } from '../../../shared';
import { GramIcon } from '../ui/GramIcon';
import { BRAND } from '../../config/brand';

interface WaitingRoomScreenProps {
  roomCode: string;
  gameType: GameType;
  stake: number;
  hostName: string;
  hostAvatar?: string;
  onCancel: () => void;
}

export const WaitingRoomScreen: React.FC<WaitingRoomScreenProps> = ({
  roomCode,
  gameType,
  stake,
  hostName,
  hostAvatar,
  onCancel,
}) => {
  const [copied, setCopied] = useState(false);
  const pot = stake * 2;

  const gameTitles: Record<GameType, { title: string; emoji: string; subtitle: string }> = {
    snake: { title: 'SNAKES & LADDERS', emoji: '🎲', subtitle: '100-Tile Race Duel' },
    connect4: { title: 'FOUR IN A ROW', emoji: '🔴', subtitle: '7x6 Tactical Grid Duel' },
    rps: { title: 'ROCK PAPER SCISSORS', emoji: '✂️', subtitle: 'First to 3 Gems Showdown' },
  };

  const currentMeta = gameTitles[gameType] || gameTitles.snake;

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareTelegram = () => {
    const text = encodeURIComponent(
      `⚔️ Duel me in ${currentMeta.title} on Gibous!\n🎲 Room: ${roomCode}\n💎 Stake: ${stake} GRAM`
    );
    const botUrl = `https://t.me/share/url?url=${encodeURIComponent(`${BRAND.links.botAppUrl}?startapp=${roomCode}`)}&text=${text}`;
    const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : undefined;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(botUrl);
    } else if (typeof window !== 'undefined') {
      window.open(botUrl, '_blank');
    }
  };

  return (
    <div className="flex flex-col items-center h-full min-h-0 overflow-y-auto bg-[#f2efe9] text-[#1a1a1a] p-3.5 max-w-sm mx-auto animate-fade-in font-body select-none scrollbar-none">
      {/* Top Bar */}
      <div className="w-full flex items-center justify-start pt-1">
        <button
          onClick={onCancel}
          className="flex items-center gap-1 px-3 py-1.5 rounded-none bg-white hover:bg-[#fff9c4] border-2 border-black sketch-shadow-xs sketch-btn-press font-sketch text-sm font-bold text-[#1a1a1a] transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> CANCEL DUEL
        </button>
      </div>

      {/* Main Waiting Card (Sharp Sketch Notebook Paper) */}
      <div className="w-full bg-[#fbfaf7] border-2 sm:border-[2.5px] border-black rounded-none p-5 text-center sketch-shadow-lg my-4">
        {/* Game Title Header */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-none bg-[#fff9c4] border-2 border-black sketch-shadow-xs font-sketch text-xs font-bold text-[#1a1a1a] tracking-wider uppercase mb-4">
          <span>{currentMeta.emoji}</span>
          <span>{currentMeta.title}</span>
        </div>

        {/* VS Matchup Presentation */}
        <div className="flex items-center justify-center gap-4 my-2">
          {/* Host (You) */}
          <div className="flex flex-col items-center">
            <div className="relative">
              {hostAvatar ? (
                <img
                  src={hostAvatar}
                  alt={hostName}
                  className="w-14 h-14 rounded-none object-cover border-2 border-black sketch-shadow-xs"
                />
              ) : (
                <div className="w-14 h-14 rounded-none bg-[#dcfce7] border-2 border-black flex items-center justify-center font-sketch font-bold text-xl text-[#166534] sketch-shadow-xs">
                  {hostName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="absolute -bottom-2 -right-1 px-1.5 py-0.5 rounded-none bg-[#166534] text-[9px] font-sketch font-bold text-white uppercase border border-black">
                HOST
              </span>
            </div>
            <span className="font-body font-bold text-xs mt-2.5 truncate max-w-[80px]">{hostName}</span>
            <span className="text-[11px] font-sketch text-neutral-600 flex items-center gap-0.5">
              {stake} <GramIcon className="w-3 h-3 inline" />
            </span>
          </div>

          {/* VS Divider */}
          <div className="flex flex-col items-center px-1">
            <span className="font-sketch font-black text-3xl text-[#9b2c2c] italic">VS</span>
          </div>

          {/* Opponent Radar Pulse */}
          <div className="flex flex-col items-center">
            <div className="relative w-14 h-14 rounded-none bg-white border-2 border-dashed border-black flex items-center justify-center sketch-shadow-xs overflow-hidden">
              <span className="absolute inset-0 bg-[#fff9c4]/60 animate-pulse" />
              <Loader2 className="w-6 h-6 text-[#1a1a1a] animate-spin relative z-10" />
            </div>
            <span className="font-sketch font-bold text-xs mt-2.5 text-neutral-700 animate-pulse">WAITING...</span>
            <span className="text-[10px] text-neutral-500 font-body">Opponent</span>
          </div>
        </div>

        {/* Stake & Pot Sticky Note */}
        <div className="sticky-note rounded-none border-2 border-black p-2.5 my-3 flex items-center justify-between font-sketch">
          <span className="text-xs text-neutral-700 font-bold tracking-wide">TOTAL DUEL POT:</span>
          <span className="font-black text-base flex items-center gap-1 text-[#1a1a1a]">
            {pot} <GramIcon className="w-4 h-4 inline" />
          </span>
        </div>

        {/* Ruled Room Code Ticket */}
        <div className="bg-white border-2 border-dashed border-black rounded-none p-3 my-3 sketch-shadow-xs">
          <div className="text-[10px] font-sketch font-bold text-neutral-500 uppercase tracking-widest mb-1">
            DUEL ROOM CODE
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="font-mono font-black text-2xl tracking-widest text-[#1a1a1a]">
              {roomCode}
            </span>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-none bg-[#fff9c4] hover:bg-[#fde047] border border-black sketch-shadow-xs sketch-btn-press transition cursor-pointer"
              title="Copy room code"
            >
              {copied ? <Check className="w-4 h-4 text-[#166534]" /> : <Copy className="w-4 h-4 text-[#1a1a1a]" />}
            </button>
          </div>
          {copied && (
            <span className="text-[10px] font-sketch text-[#166534] font-bold block mt-1">
              ✓ Copied!
            </span>
          )}
        </div>

        {/* Share Button */}
        <button
          onClick={handleShareTelegram}
          className="w-full py-3 bg-[#9b2c2c] hover:bg-[#b91c1c] text-white border-2 border-black rounded-none font-sketch font-bold text-lg tracking-wider sketch-shadow sketch-btn-press flex items-center justify-center gap-2 transition mt-1 cursor-pointer"
        >
          <Share2 className="w-5 h-5" />
          <span>INVITE OPPONENT</span>
        </button>
      </div>

      {/* Footer Helper Note */}
      <div className="text-center py-1">
        <p className="font-body text-xs text-neutral-600">
          Match starts when your opponent joins.
        </p>
      </div>
    </div>
  );
};
