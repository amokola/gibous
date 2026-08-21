import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface RoomCodeCardProps {
  roomCode: string;
  onCopy?: () => void;
}

export const RoomCodeCard: React.FC<RoomCodeCardProps> = ({ roomCode, onCopy }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    if (onCopy) onCopy();
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full bg-white border-2 border-black rounded-none p-3 flex flex-col items-center justify-center relative sketch-shadow-xs text-[#1a1a1a]">
      <span className="font-sketch text-xs font-bold text-[#1a1a1a]/60 tracking-wider uppercase">
        Match Room Code
      </span>
      <div className="flex items-center gap-3 mt-0.5">
        <span className="font-sketch text-2xl font-bold tracking-widest text-[#1a365d]">
          {roomCode}
        </span>
        <button
          onClick={handleCopy}
          aria-label="Copy room code"
          className="p-1.5 rounded-none bg-[#fff9c4] hover:bg-[#fef08a] border-2 border-black text-[#1a1a1a] font-bold sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
        >
          {copied ? (
            <Check className="w-4 h-4 text-[#166534] stroke-[3]" />
          ) : (
            <Copy className="w-4 h-4 text-[#1a1a1a] stroke-[2.5]" />
          )}
        </button>
      </div>
      {copied && (
        <span className="absolute -bottom-2 font-sketch text-xs bg-[#dcfce7] border border-black text-[#166534] font-bold px-2 py-0.5 rounded-none sketch-shadow-xs animate-fade-in">
          Copied to clipboard!
        </span>
      )}
    </div>
  );
};
