import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Share2,
  Settings,
  PlusCircle,
  Search,
  Copy,
  Check,
  Zap,
  Swords,
  Trash2,
  Radio,
} from 'lucide-react';
import { GameTitle, Player } from '../../types/game';
import { GameTypeSelector } from './GameTypeSelector';
import { StakeConfirmModal } from './StakeConfirmModal';
import { GramIcon } from '../ui/GramIcon';
import { Avatar } from '../ui/Avatar';
import { MultiplayerService } from '../../services/multiplayerService';
import {
  ERROR_MESSAGES,
  ErrorCode,
  MIN_STAKE,
  MAX_STAKE,
  STAKE_INCREMENT,
  DEFAULT_STAKE_PRESETS,
  calculatePotBreakdown,
} from '../../../shared';

export interface OpenRoomSummary {
  code: string;
  gameType: GameTitle;
  stakeAmount: number;
  potAmount: number;
  hostName: string;
  hostAvatar?: string;
  createdAt: number;
}

interface LobbyScreenProps {
  selectedGame: GameTitle;
  onSelectGame: (game: GameTitle) => void;
  p1?: Player;
  initialStake?: number;
  onCreateDuel?: (game: GameTitle, stake: number) => void;
  onJoinDuel?: (roomCode: string) => void;
  onShare?: () => void;
  onBack: () => void;
  // Optional props for testing backward compatibility
  roomCode?: string;
  p2?: Player;
  isReady?: boolean;
  settings?: { winningAmount?: number; boardSize?: number };
  onChangeSettings?: (settings: any) => void;
  onStartGame?: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  selectedGame,
  onSelectGame,
  p1,
  initialStake = 0.5,
  onCreateDuel,
  onJoinDuel,
  onShare,
  onBack,
  settings,
  onChangeSettings,
  onStartGame,
}) => {
  const [lobbyView, setLobbyView] = useState<'create' | 'browse'>('create');
  const [createdRoom, setCreatedRoom] = useState<OpenRoomSummary | null>(null);
  const [openRooms, setOpenRooms] = useState<OpenRoomSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [gameFilter, setGameFilter] = useState<'all' | GameTitle>('all');
  const [quickJoinCode, setQuickJoinCode] = useState('');
  const [showRulesDrawer, setShowRulesDrawer] = useState(false);
  const [customStake, setCustomStake] = useState<number>(initialStake || settings?.winningAmount || 0.5);
  const [copiedCode, setCopiedCode] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    mode: 'create' | 'join';
    room?: OpenRoomSummary;
    stake: number;
    game: GameTitle;
    isSubmitting?: boolean;
  } | null>(null);

  // Real-time backend room synchronization
  useEffect(() => {
    const multiplayer = MultiplayerService.getInstance();
    multiplayer.connect();

    const handleRoomsList = (data: { rooms?: OpenRoomSummary[] }) => {
      if (data.rooms && Array.isArray(data.rooms)) {
        setOpenRooms(data.rooms);
      }
    };

    const handleError = (payload: { code?: ErrorCode; message?: string }) => {
      const msg = (payload.code && ERROR_MESSAGES[payload.code]) || payload.message || 'Error occurred';
      setJoinError(msg);
      setTimeout(() => setJoinError(null), 4000);
    };

    const unsubRooms = multiplayer.on('ROOMS_LIST' as any, handleRoomsList);
    const unsubError = multiplayer.on('ERROR' as any, handleError);
    multiplayer.send('GET_ROOMS' as any);

    return () => {
      unsubRooms();
      unsubError();
    };
  }, [selectedGame]);

  // Keep customStake in sync with settings
  useEffect(() => {
    if (settings?.winningAmount && settings.winningAmount !== customStake) {
      setCustomStake(settings.winningAmount);
    }
  }, [settings?.winningAmount]);

  const executeCreateRoom = () => {
    setConfirmModal(null);
    if (onCreateDuel) {
      onCreateDuel(selectedGame, customStake);
    } else if (onStartGame) {
      onStartGame();
    }
  };

  const handleCreateRoomAction = () => {
    setConfirmModal({
      isOpen: true,
      mode: 'create',
      stake: customStake,
      game: selectedGame,
    });
  };

  const handleCancelCreatedRoom = () => {
    if (createdRoom) {
      const multiplayer = MultiplayerService.getInstance();
      multiplayer.send('CANCEL_ROOM' as any, {
        roomCode: createdRoom.code,
      });
      setOpenRooms(prev => prev.filter(r => r.code !== createdRoom.code));
      setCreatedRoom(null);
    }
  };

  const executeJoinRoom = (room: OpenRoomSummary) => {
    onSelectGame(room.gameType);
    onChangeSettings?.({ winningAmount: room.stakeAmount });
    setConfirmModal(null);

    if (onJoinDuel) {
      onJoinDuel(room.code);
    } else {
      const multiplayer = MultiplayerService.getInstance();
      multiplayer.send('JOIN_ROOM', {
        roomCode: room.code,
        playerName: p1?.name || 'Player 2',
        avatarUrl: p1?.avatarUrl,
      });
    }
  };

  const handleJoinSpecificRoom = (room: OpenRoomSummary) => {
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

  const breakdown = useMemo(() => calculatePotBreakdown(customStake), [customStake]);
  const pot = breakdown.totalPot;
  const winnerNet = breakdown.winnerPayout;
  const arenaFee = breakdown.arenaFee;
  const drawRefund = breakdown.drawRefundPerPlayer;

  return (
    <div className="w-full max-w-[420px] mx-auto h-full min-h-0 flex flex-col p-3 sm:p-4 select-none animate-fade-in pb-4 bg-[#fbfaf7] text-[#1a1a1a]">
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
                setLobbyView('browse');
              }}
              className={`px-3 py-1 font-sketch text-xs font-bold rounded-none transition-all flex items-center gap-1 cursor-pointer ${
                lobbyView === 'browse'
                  ? 'bg-[#9b2c2c] text-white border border-black sketch-shadow-xs'
                  : 'text-[#1a1a1a]/70 hover:text-[#1a1a1a]'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Open Rooms ({openRooms.length})
            </button>
          </div>

          <div className="flex items-center gap-1.5">
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
              • <strong>Win Payout (90%)</strong>: Winner receives 90% of the pot.<br />
              • <strong>Arena Fee (10%)</strong>: 10% arena fee applies to matches.<br />
              • <strong>Draw Refund (95%)</strong>: In a draw, both players receive 95% of their stake.<br />
              • <strong>Pure Strategy</strong>: Fair matches with zero pay-to-win boosts.
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
                  Waiting for opponent...
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
                  onSelectGame(game);
                }}
              />
            </div>

            {/* Step 2: Choose Stake Amount (Custom Editable + Quick Presets) */}
            <div className="bg-white border-2 border-black p-3 rounded-none sketch-shadow-xs">
              <div className="flex items-center mb-1">
                <span className="font-sketch text-xs font-bold text-[#1a1a1a]/70 uppercase tracking-wider">
                  2. Stake Amount
                </span>
              </div>

              {/* Custom Editable Number Input */}
              <div className="flex items-stretch gap-1.5 mb-2.5">
                <button
                  type="button"
                  aria-label="Decrease stake"
                  disabled={customStake <= MIN_STAKE}
                  onClick={() => {
                    const nextStake = Math.max(MIN_STAKE, Number((customStake - STAKE_INCREMENT).toFixed(2)));
                    setCustomStake(nextStake);
                    onChangeSettings?.({ winningAmount: nextStake });
                  }}
                  className="w-10 shrink-0 bg-[#f2efe9] hover:bg-[#e8e0d0] disabled:opacity-40 disabled:cursor-not-allowed border-2 border-black font-sketch text-xl font-bold leading-none"
                >
                  −
                </button>
                <div className="relative flex-1">
                <input
                  type="number"
                  min={MIN_STAKE}
                  max={MAX_STAKE}
                  step={STAKE_INCREMENT}
                  value={customStake || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    const safeVal = isNaN(val) ? 0 : Math.min(MAX_STAKE, Math.max(0, Number(val.toFixed(2))));
                    setCustomStake(safeVal);
                    onChangeSettings?.({ winningAmount: safeVal });
                  }}
                  className="w-full p-2 bg-[#f2efe9] border-2 border-black font-sketch text-lg font-bold text-[#1a1a1a] focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#9b2c2c]"
                  placeholder="Enter stake amount (e.g. 0.5)"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sketch text-xs font-bold text-[#1a1a1a]/60">
                  GRAM
                </span>
                </div>
                <button
                  type="button"
                  aria-label="Increase stake"
                  disabled={customStake >= MAX_STAKE}
                  onClick={() => {
                    const nextStake = Math.min(MAX_STAKE, Number((customStake + STAKE_INCREMENT).toFixed(2)));
                    setCustomStake(nextStake);
                    onChangeSettings?.({ winningAmount: nextStake });
                  }}
                  className="w-10 shrink-0 bg-[#f2efe9] hover:bg-[#e8e0d0] disabled:opacity-40 disabled:cursor-not-allowed border-2 border-black font-sketch text-xl font-bold leading-none"
                >
                  +
                </button>
              </div>

              {/* Quick Preset Chips */}
              <div className="grid grid-cols-5 gap-1.5">
                {DEFAULT_STAKE_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => {
                      setCustomStake(amt);
                      onChangeSettings?.({ winningAmount: amt });
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

            {/* Economics Breakdown */}
            <div className="bg-[#f2efe9] border-2 border-black p-3">
              <div className="flex items-center justify-between text-xs font-sketch font-bold text-[#1a1a1a]/80 mb-2">
                <span>Total Match Pot:</span>
                <span className="text-base text-[#1a365d] flex items-center gap-1 font-black">
                  {pot} GRAM <GramIcon size="sm" />
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[11px] text-[#1a1a1a]/80">
                <div className="bg-white p-1.5 border border-black/30">
                  <span className="text-[#166534] font-bold block">Winner (90%)</span>
                  <span className="font-bold text-[#1a1a1a]">+{winnerNet} GRAM</span>
                </div>
                <div className="bg-white p-1.5 border border-black/30">
                  <span className="text-[#9b2c2c] font-bold block">Arena Fee (10%)</span>
                  <span className="font-bold text-[#1a1a1a]">-{arenaFee} GRAM</span>
                </div>
                <div className="bg-white p-1.5 border border-black/30">
                  <span className="text-[#854d0e] font-bold block">Draw (95% ea)</span>
                  <span className="font-bold text-[#1a1a1a]">+{drawRefund} GRAM</span>
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
              Create {selectedGame.toUpperCase()} Duel ({customStake} GRAM)
            </button>

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
                  placeholder="Search by code or player..."
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
                placeholder="Enter room code"
                className="flex-1 p-2 bg-white border-2 border-black font-mono text-xs font-bold text-[#1a1a1a] focus:outline-none uppercase"
              />
              <button
                type="submit"
                className="px-4 bg-[#1a365d] hover:bg-[#122844] text-white border-2 border-black font-sketch text-xs font-bold whitespace-nowrap cursor-pointer"
              >
                Join Room
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
                  🟢 Live
                </span>
              </div>

              {filteredRooms.length === 0 ? (
                <div className="p-6 bg-white border-2 border-black rounded-none text-center sketch-shadow-xs">
                  <Swords className="w-8 h-8 mx-auto text-[#1a1a1a]/40 mb-1" />
                  <span className="font-sketch text-sm font-bold text-[#1a1a1a] block">
                    No rooms found
                  </span>
                  <p className="font-sketch text-xs text-[#1a1a1a]/60 mt-0.5">
                    Create a room to start playing.
                  </p>
                  <button
                    type="button"
                    onClick={() => setLobbyView('create')}
                    className="mt-3 px-4 py-1.5 bg-[#9b2c2c] text-white border-2 border-black font-sketch text-xs font-bold cursor-pointer"
                  >
                    + Create Room
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
            isSubmitting={confirmModal.isSubmitting}
            onConfirm={() => {
              if (confirmModal.isSubmitting) return;
              setConfirmModal((prev) => prev ? { ...prev, isSubmitting: true } : null);
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
