import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Share2,
  Settings,
  PlusCircle,
  Search,
  Users,
  Copy,
  Check,
  Zap,
  Swords,
  Trash2,
  Volume2,
  VolumeX,
  Radio,
} from 'lucide-react';
import { GameSettings, GameTitle, MatchType, Player } from '../../types/game';
import { GameTypeSelector } from './GameTypeSelector';
import { StakeConfirmModal } from './StakeConfirmModal';
import { GramIcon } from '../ui/GramIcon';
import { Avatar } from '../ui/Avatar';
import { useSoundEffects } from '../../hooks/useSoundEffects';
import { MultiplayerService } from '../../services/multiplayerService';
import { ERROR_MESSAGES, ErrorCode } from '../../../shared';

export interface OpenRoomSummary {
  code: string;
  gameType: GameTitle;
  stakeAmount: number;
  potAmount: number;
  hostName: string;
  hostAvatar?: string;
  hostTgId?: number;
  createdAt: number;
}

interface LobbyScreenProps {
  selectedGame: GameTitle;
  onSelectGame: (game: GameTitle) => void;
  roomCode: string;
  p1: Player;
  p2: Player;
  isReady: boolean;
  matchType: MatchType;
  settings: GameSettings;
  isMuted: boolean;
  onToggleMute: () => void;
  onSetMatchType: (type: MatchType) => void;
  onChangeSettings: (settings: Partial<GameSettings>) => void;
  onStartGame: () => void;
  onShare: () => void;
  onBack: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  selectedGame,
  onSelectGame,
  roomCode: _roomCode,
  p1,
  p2: _p2,
  isReady: _isReady,
  matchType: _matchType,
  settings,
  isMuted,
  onToggleMute,
  onSetMatchType,
  onChangeSettings,
  onStartGame,
  onShare,
  onBack,
}) => {
  const [lobbyView, setLobbyView] = useState<'create' | 'browse'>('create');
  const [createdRoom, setCreatedRoom] = useState<OpenRoomSummary | null>(null);
  const [openRooms, setOpenRooms] = useState<OpenRoomSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [gameFilter, setGameFilter] = useState<'all' | GameTitle>('all');
  const [quickJoinCode, setQuickJoinCode] = useState('');
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  const [customStake, setCustomStake] = useState<number>(settings.winningAmount || 100);
  const [copiedCode, setCopiedCode] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'join';
    room?: OpenRoomSummary;
    stake: number;
    game: GameTitle;
  } | null>(null);

  const sounds = useSoundEffects();

  // Real-time backend room synchronization & auto-start listener
  useEffect(() => {
    const multiplayer = MultiplayerService.getInstance();
    multiplayer.connect();

    const fetchRooms = async () => {
      try {
        const host = typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' ? window.location.hostname : '127.0.0.1';
        let res = await fetch(`http://${host}:3001/api/rooms`).catch(() => null);
        if (!res || !res.ok) {
          res = await fetch('/api/rooms').catch(() => null);
        }
        if (res && res.ok) {
          const json = await res.json();
          if (json.rooms && Array.isArray(json.rooms)) {
            setOpenRooms(json.rooms);
          }
        }
      } catch {
        // Silently fallback
      }
    };

    const handleRoomsList = (data: { rooms?: OpenRoomSummary[] }) => {
      if (data.rooms && Array.isArray(data.rooms)) {
        setOpenRooms(data.rooms);
      }
    };

    const handleGameStart = (data: any) => {
      sounds.playMatchFound();
      const room = data.room || data;
      if (room) {
        onSelectGame(room.gameType || selectedGame);
        if (room.potAmount) {
          onChangeSettings({ winningAmount: room.potAmount / 2 });
        }
        onSetMatchType('online');
        onStartGame();
      }
    };

    const handleError = (payload: { code?: ErrorCode; message?: string }) => {
      const msg = (payload.code && ERROR_MESSAGES[payload.code]) || payload.message || 'Error occurred';
      setJoinError(msg);
      setTimeout(() => setJoinError(null), 4000);
    };

    const unsubRooms = multiplayer.on('ROOMS_LIST' as any, handleRoomsList);
    const unsubStart = multiplayer.on('GAME_START' as any, handleGameStart);
    const unsubError = multiplayer.on('ERROR' as any, handleError);
    multiplayer.send('GET_ROOMS' as any);
    fetchRooms();

    const interval = setInterval(fetchRooms, 2500);

    return () => {
      unsubRooms();
      unsubStart();
      unsubError();
      clearInterval(interval);
    };
  }, [onSelectGame, onChangeSettings, onSetMatchType, onStartGame, selectedGame, sounds]);

  // Keep customStake in sync with settings
  useEffect(() => {
    if (settings.winningAmount && settings.winningAmount !== customStake) {
      setCustomStake(settings.winningAmount);
    }
  }, [settings.winningAmount]);

  const executeCreateRoom = () => {
    sounds.playClick();
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const multiplayer = MultiplayerService.getInstance();

    const roomPayload = {
      roomCode: newCode,
      gameType: selectedGame,
      stake: customStake,
      telegramId: p1.telegramId || 123456789,
      playerName: p1.name,
      avatarUrl: p1.avatarUrl,
    };

    // Broadcast over WebSocket
    multiplayer.send('CREATE_ROOM' as any, roomPayload);

    // Also persist via REST API
    const host = typeof window !== 'undefined' && window.location.hostname && window.location.hostname !== 'localhost' ? window.location.hostname : '127.0.0.1';
    fetch(`http://${host}:3001/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(roomPayload),
    }).catch(() => {
      fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roomPayload),
      }).catch(() => {});
    });

    const newRoom: OpenRoomSummary = {
      code: newCode,
      gameType: selectedGame,
      stakeAmount: customStake,
      potAmount: customStake * 2,
      hostName: p1.name,
      hostAvatar: p1.avatarUrl,
      hostTgId: p1.telegramId,
      createdAt: Date.now(),
    };

    setCreatedRoom(newRoom);
    setOpenRooms(prev => [newRoom, ...prev.filter(r => r.code !== newCode)]);
    onChangeSettings({ winningAmount: customStake });
    setConfirmModal(null);
  };

  const handleCreateRoomAction = () => {
    sounds.playClick();
    setConfirmModal({
      isOpen: true,
      mode: 'create',
      stake: customStake,
      game: selectedGame,
    });
  };

  const handleCancelCreatedRoom = () => {
    sounds.playClick();
    if (createdRoom) {
      const multiplayer = MultiplayerService.getInstance();
      multiplayer.send('CANCEL_ROOM' as any, {
        roomCode: createdRoom.code,
        telegramId: p1.telegramId || 123456789,
      });
      fetch(`/api/rooms/${createdRoom.code}`, { method: 'DELETE' }).catch(() => {});
      setOpenRooms(prev => prev.filter(r => r.code !== createdRoom.code));
      setCreatedRoom(null);
    }
  };

  const executeJoinRoom = (room: OpenRoomSummary) => {
    sounds.playMatchFound();
    onSelectGame(room.gameType);
    onChangeSettings({ winningAmount: room.stakeAmount });
    onSetMatchType('online');

    const multiplayer = MultiplayerService.getInstance();
    multiplayer.send('JOIN_ROOM', {
      roomCode: room.code,
      telegramId: p1.telegramId || 987654321,
      playerName: p1.name,
      avatarUrl: p1.avatarUrl,
    });

    setConfirmModal(null);
    onStartGame();
  };

  const handleJoinSpecificRoom = (room: OpenRoomSummary) => {
    sounds.playClick();
    setConfirmModal({
      isOpen: true,
      mode: 'join',
      room,
      stake: room.stakeAmount,
      game: room.gameType,
    });
  };

  const handleQuickJoinByCode = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = quickJoinCode.trim().toUpperCase();
    if (!cleanCode) return;

    const matched = openRooms.find(r => r.code === cleanCode);
    if (matched) {
      handleJoinSpecificRoom(matched);
    } else {
      setJoinError(`Room "${cleanCode}" not found. You can create it in the Create tab!`);
      setTimeout(() => setJoinError(null), 3000);
    }
  };

  const handleCopy = (code: string) => {
    sounds.playClick();
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Filtered rooms list for search
  const filteredRooms = useMemo(() => {
    return openRooms.filter((room) => {
      const matchesSearch =
        !searchQuery.trim() ||
        room.code.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        room.hostName.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchesGame = gameFilter === 'all' || room.gameType === gameFilter;
      return matchesSearch && matchesGame;
    });
  }, [openRooms, searchQuery, gameFilter]);

  const pot = customStake * 2;
  const winnerNet = Math.floor(pot * 0.9);
  const arenaFee = Math.floor(pot * 0.1);
  const drawRefund = Math.floor(customStake * 0.95);

  return (
    <div className="w-full max-w-[420px] mx-auto min-h-screen flex flex-col justify-between p-3 sm:p-4 select-none animate-fade-in pb-16 bg-[#fbfaf7] text-[#1a1a1a]">
      {/* Top Header Bar */}
      <header className="w-full">
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to home"
            className="p-2 bg-white hover:bg-[#f2efe9] border-2 border-black rounded-none text-[#1a1a1a] transition-colors sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Lobby View Switcher Tabs */}
          <div className="flex items-center bg-[#f2efe9] border-2 border-black p-0.5 rounded-none sketch-shadow-xs">
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setLobbyView('create');
              }}
              className={`px-3 py-1 font-sketch text-xs font-bold rounded-none transition-all flex items-center gap-1 ${
                lobbyView === 'create'
                  ? 'bg-[#9b2c2c] text-white border border-black sketch-shadow-xs'
                  : 'text-[#1a1a1a]/70 hover:text-[#1a1a1a]'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Create Duel
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playClick();
                setLobbyView('browse');
              }}
              className={`px-3 py-1 font-sketch text-xs font-bold rounded-none transition-all flex items-center gap-1 ${
                lobbyView === 'browse'
                  ? 'bg-[#9b2c2c] text-white border border-black sketch-shadow-xs'
                  : 'text-[#1a1a1a]/70 hover:text-[#1a1a1a]'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Live Duels ({openRooms.length})
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label="Audio toggle"
              className="p-2 bg-white hover:bg-[#f2efe9] border-2 border-black rounded-none text-[#1a1a1a] transition-colors sketch-shadow-xs"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-[#9b2c2c]" /> : <Volume2 className="w-4 h-4 text-[#9b2c2c]" />}
            </button>
            <button
              type="button"
              onClick={() => setShowRulesDrawer(prev => !prev)}
              aria-label="Rules"
              className={`p-2 border-2 border-black rounded-none transition-colors sketch-shadow-xs ${
                showRulesDrawer ? 'bg-[#fff9c4] text-[#854d0e]' : 'bg-white hover:bg-[#f2efe9] text-[#1a1a1a]'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Rules & Transparency Drawer */}
        {showRulesDrawer && (
          <div className="w-full bg-white border-2 border-black rounded-none p-3.5 mb-3 sketch-shadow text-xs space-y-2 text-[#1a1a1a] animate-fade-in">
            <div className="flex justify-between items-center font-sketch text-sm font-bold text-[#1a1a1a]">
              <span>Gibous Fair Play & Match Economics</span>
              <span className="text-[#9b2c2c] cursor-pointer font-bold" onClick={() => setShowRulesDrawer(false)}>✕</span>
            </div>
            <div className="text-[#1a1a1a]/80 text-[11px] leading-relaxed font-sketch">
              • <strong>Win Payout (90%)</strong>: Winner receives 90% of the play-credit pot.<br />
              • <strong>Arena Fee (10%)</strong>: Gibous keeps a 10% arena fee on completed matches.<br />
              • <strong>Draw Refund (95%)</strong>: In case of a draw, both players receive 95% of their initial stake.<br />
              • <strong>Pure Strategy</strong>: Fair server-run matches with zero pay-to-win boosts.
            </div>
          </div>
        )}
      </header>

      <main className="w-full">
        {/* PINNED HOSTED ROOM CARD (If user currently has an open room) */}
        {createdRoom && (
          <div className="w-full bg-[#fff9c4] border-2 border-black p-3.5 mb-3 sketch-shadow rounded-none flex flex-col gap-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-600 animate-ping" />
                <span className="font-sketch text-xs font-bold text-[#854d0e] uppercase tracking-wider">
                  Your Open Room • Waiting for Challenger
                </span>
              </div>
              <span className="font-sketch text-xs font-bold text-[#1a365d] bg-white px-2 py-0.5 border border-black">
                {createdRoom.gameType.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center justify-between bg-white border-2 border-black p-2">
              <div>
                <span className="text-[10px] font-sketch text-[#1a1a1a]/60 block font-bold">Room Code</span>
                <span className="font-mono text-lg font-bold text-[#1a1a1a]">{createdRoom.code}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(createdRoom.code)}
                  className="px-2 py-1 bg-[#f2efe9] hover:bg-[#fff9c4] border border-black font-sketch text-xs font-bold flex items-center gap-1"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-green-700" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={onShare}
                  className="px-2 py-1 bg-[#1a365d] text-white hover:bg-[#122844] border border-black font-sketch text-xs font-bold flex items-center gap-1"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </button>
                <button
                  type="button"
                  onClick={handleCancelCreatedRoom}
                  className="p-1 bg-[#fee2e2] hover:bg-[#fca5a5] text-[#9b2c2c] border border-black"
                  title="Cancel Room"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-sketch font-bold text-[#854d0e]">
              <span>Your Stake: {createdRoom.stakeAmount} GRAM</span>
              <span>Matched Pot: {createdRoom.stakeAmount * 2} GRAM</span>
              <span className="text-[#166534]">Win Net: {Math.floor(createdRoom.stakeAmount * 2 * 0.9)} GRAM</span>
            </div>
          </div>
        )}

        {/* ================= VIEW 1: CREATE ROOM FLOW ================= */}
        {lobbyView === 'create' && (
          <div className="flex flex-col gap-3">
            {/* Step 1: Choose Game */}
            <div className="bg-white border-2 border-black p-3 rounded-none sketch-shadow-xs">
              <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 uppercase tracking-wider block mb-2">
                1. Choose Game:
              </span>
              <GameTypeSelector
                selectedGame={selectedGame}
                onSelectGame={(game) => {
                  sounds.playClick();
                  onSelectGame(game);
                }}
              />
            </div>

            {/* Step 2: Choose Stake Amount (Custom Editable + Quick Presets) */}
            <div className="bg-white border-2 border-black p-3 rounded-none sketch-shadow-xs">
              <div className="flex justify-between items-center mb-1">
                <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 uppercase tracking-wider">
                  2. Stake Amount (Play GRAM):
                </span>
                <span className="font-sketch text-xs font-bold text-[#854d0e] bg-[#fff9c4] px-1.5 py-0.2 border border-black">
                  Play-Credit Duel
                </span>
              </div>

              {/* Custom Editable Number Input */}
              <div className="relative mb-2.5">
                <input
                  type="number"
                  min="10"
                  max="10000"
                  value={customStake || ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    const safeVal = isNaN(val) ? 0 : Math.max(0, val);
                    setCustomStake(safeVal);
                    onChangeSettings({ winningAmount: safeVal });
                  }}
                  className="w-full p-2 bg-[#f2efe9] border-2 border-black font-sketch text-lg font-bold text-[#1a1a1a] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#9b2c2c]"
                  placeholder="Enter stake amount (e.g. 250)"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sketch text-xs font-bold text-[#1a1a1a]/60">
                  Play GRAM
                </span>
              </div>

              {/* Quick Preset Chips */}
              <div className="grid grid-cols-5 gap-1.5">
                {[50, 100, 250, 500, 1000].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setCustomStake(amt);
                      onChangeSettings({ winningAmount: amt });
                    }}
                    className={`py-1 rounded-none border-2 border-black font-sketch text-xs font-bold transition-all sketch-btn-press ${
                      customStake === amt
                        ? 'bg-[#fff9c4] text-[#854d0e] sketch-shadow-xs ring-2 ring-[#ca8a04]'
                        : 'bg-[#f2efe9] text-[#1a1a1a] hover:bg-white'
                    }`}
                  >
                    {amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Economic Math Breakdown Card */}
            <div className="bg-[#f2efe9] border-2 border-black p-3 rounded-none sketch-shadow-xs font-sketch text-xs">
              <div className="flex justify-between items-center font-bold text-[#1a1a1a] border-b border-black/20 pb-1.5 mb-1.5">
                <span>Total Match Pot:</span>
                <span className="text-base text-[#1a365d] flex items-center gap-1 font-black">
                  {pot} Play GRAM <GramIcon size="sm" />
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[11px] text-[#1a1a1a]/80">
                <div className="bg-white p-1.5 border border-black/30">
                  <span className="text-[#166534] font-bold block">Winner (90%)</span>
                  <span className="font-bold text-[#1a1a1a]">+{winnerNet} Play GRAM</span>
                </div>
                <div className="bg-white p-1.5 border border-black/30">
                  <span className="text-[#9b2c2c] font-bold block">Arena Fee (10%)</span>
                  <span className="font-bold text-[#1a1a1a]">-{arenaFee} Play GRAM</span>
                </div>
                <div className="bg-white p-1.5 border border-black/30">
                  <span className="text-[#854d0e] font-bold block">Draw (95% ea)</span>
                  <span className="font-bold text-[#1a1a1a]">+{drawRefund} Play GRAM</span>
                </div>
              </div>
            </div>

            {/* CTA: Create Duel Button */}
            <button
              type="button"
              onClick={handleCreateRoomAction}
              className="w-full py-3 bg-[#9b2c2c] hover:bg-[#802222] text-white border-2 border-black font-sketch text-base font-bold sketch-shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-5 h-5 stroke-[2.5]" />
              Create {selectedGame.toUpperCase()} Duel ({customStake} Play GRAM)
            </button>

            {/* Secondary: Pass & Play Local 2P Duel Option */}
            <div className="pt-1 flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  sounds.playClick();
                  onSetMatchType('local');
                  onStartGame();
                }}
                className="font-sketch text-xs font-bold text-[#1a1a1a]/70 hover:text-[#1a1a1a] flex items-center gap-1.5 underline"
              >
                <Users className="w-3.5 h-3.5" />
                Or Play Pass & Play Duel (2 Players on this Device)
              </button>
            </div>
          </div>
        )}

        {/* ================= VIEW 2: LIVE OPEN ROOMS BROWSER & SEARCH ================= */}
        {lobbyView === 'browse' && (
          <div className="flex flex-col gap-3">
            {/* Quick Search & Filter Bar */}
            <div className="bg-white border-2 border-black p-2.5 rounded-none sketch-shadow-xs flex flex-col gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#1a1a1a]/50" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by room code or host player..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[#f2efe9] border-2 border-black font-sketch text-xs text-[#1a1a1a] focus:outline-none focus:bg-white"
                />
              </div>

              {/* Game Type Filter Chips */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5">
                {[
                  { key: 'all', label: 'All Games' },
                  { key: 'snake', label: '🐍 Snakes' },
                  { key: 'connect4', label: '🔵 Connect 4' },
                  { key: 'rps', label: '✂️ RPS' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      sounds.playClick();
                      setGameFilter(tab.key as any);
                    }}
                    className={`px-2.5 py-1 rounded-none border border-black font-sketch text-[11px] font-bold whitespace-nowrap transition-all ${
                      gameFilter === tab.key
                        ? 'bg-[#1a365d] text-white border-black'
                        : 'bg-[#f2efe9] text-[#1a1a1a]/70 hover:text-[#1a1a1a]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Join via Code Form */}
            <form onSubmit={handleQuickJoinByCode} className="flex gap-2">
              <input
                type="text"
                value={quickJoinCode}
                onChange={(e) => setQuickJoinCode(e.target.value)}
                placeholder="Enter 6-char Room Code (e.g. GRAM99)"
                className="flex-1 p-2 bg-white border-2 border-black font-mono text-xs font-bold text-[#1a1a1a] focus:outline-none uppercase"
              />
              <button
                type="submit"
                className="px-4 bg-[#1a365d] hover:bg-[#122844] text-white border-2 border-black font-sketch text-xs font-bold whitespace-nowrap"
              >
                Join Code
              </button>
            </form>

            {joinError && (
              <span className="font-sketch text-xs text-[#9b2c2c] font-bold block px-1 animate-fade-in">
                ⚠️ {joinError}
              </span>
            )}

            {/* List of Active Open Rooms */}
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between px-1">
                <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 uppercase tracking-wider">
                  Open Matches ({filteredRooms.length})
                </span>
                <span className="text-[10px] text-[#166534] font-sketch font-bold">
                  🟢 Live PVP Lobby
                </span>
              </div>

              {filteredRooms.length === 0 ? (
                <div className="p-6 bg-white border-2 border-black rounded-none text-center sketch-shadow-xs">
                  <Swords className="w-8 h-8 mx-auto text-[#1a1a1a]/40 mb-1" />
                  <span className="font-sketch text-sm font-bold text-[#1a1a1a] block">
                    No matching rooms found
                  </span>
                  <p className="font-sketch text-xs text-[#1a1a1a]/60 mt-0.5">
                    Be the first to create a room or adjust your search filter!
                  </p>
                  <button
                    type="button"
                    onClick={() => setLobbyView('create')}
                    className="mt-3 px-4 py-1.5 bg-[#9b2c2c] text-white border-2 border-black font-sketch text-xs font-bold"
                  >
                    + Create Room Now
                  </button>
                </div>
              ) : (
                filteredRooms.map((room) => (
                  <div
                    key={room.code}
                    className="p-3 bg-white border-2 border-black rounded-none flex items-center justify-between sketch-shadow-xs hover:bg-[#fbfaf7] transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={room.hostName} photoUrl={room.hostAvatar} color="green" size="sm" />
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-sketch text-xs font-bold text-[#1a1a1a]">
                            {room.hostName}
                          </span>
                          <span className="text-[9px] font-sketch bg-[#f2efe9] px-1.5 py-0.2 border border-black/40 text-[#1a365d] uppercase font-bold">
                            {room.gameType === 'snake' ? '🐍 Snake' : room.gameType === 'connect4' ? '🔵 Connect4' : '✂️ RPS'}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-[#1a1a1a]/60 mt-0.5">
                          Code: {room.code} • Pot: {room.potAmount}G
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="font-sketch text-xs font-bold text-[#9b2c2c] block">
                          {room.stakeAmount} GRAM
                        </span>
                        <span className="text-[9px] text-[#166534] font-sketch font-bold">
                          Win +{Math.floor(room.potAmount * 0.9)}G
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleJoinSpecificRoom(room)}
                        className="px-3 py-1.5 bg-[#166534] hover:bg-[#124d27] text-white border-2 border-black font-sketch text-xs font-bold sketch-shadow-xs active:scale-95 transition-all flex items-center gap-1"
                      >
                        <Zap className="w-3.5 h-3.5" />
                        Duel
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Stake Confirmation Modal */}
        {confirmModal && (
          <StakeConfirmModal
            isOpen={confirmModal.isOpen}
            mode={confirmModal.mode}
            gameType={confirmModal.game}
            stakeAmount={confirmModal.stake}
            onConfirm={() => {
              if (confirmModal.mode === 'create') {
                executeCreateRoom();
              } else if (confirmModal.room) {
                executeJoinRoom(confirmModal.room);
              }
            }}
            onCancel={() => setConfirmModal(null)}
          />
        )}
      </main>
    </div>
  );
};
