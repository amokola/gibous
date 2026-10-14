import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Share2,
  Settings,
  PlusCircle,
  Search,
  Copy,
  Check,
  LogIn,
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
  GAME_CONFIGS,
} from '../../../shared';
import { GameBadge } from '../ui/GameBadge';

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
  const [gameFilter, setGameFilter] = useState<GameTitle>(selectedGame);
  const [minStakeFilter, setMinStakeFilter] = useState('');
  const [maxStakeFilter, setMaxStakeFilter] = useState('');
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

  // Start the room browser on the game already selected in the create flow.
  useEffect(() => {
    setGameFilter(selectedGame);
  }, [selectedGame]);

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
      setJoinError(`No open room found with code ${cleanCode}. Check the code and try again.`);
      setTimeout(() => setJoinError(null), 3000);
    }
  };

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const minStake = minStakeFilter === '' ? undefined : Number(minStakeFilter);
  const maxStake = maxStakeFilter === '' ? undefined : Number(maxStakeFilter);
  const invalidMinStake =
    minStake !== undefined &&
    (!Number.isFinite(minStake) || minStake < MIN_STAKE || minStake > MAX_STAKE);
  const invalidMaxStake =
    maxStake !== undefined &&
    (!Number.isFinite(maxStake) || maxStake < MIN_STAKE || maxStake > MAX_STAKE);
  const invalidStakeRange =
    minStake !== undefined &&
    maxStake !== undefined &&
    minStake > maxStake;
  const invalidStakeFilter = invalidMinStake || invalidMaxStake || invalidStakeRange;

  // Filtered rooms list for search
  const filteredRooms = useMemo(() => {
    return openRooms.filter((room) => {
      const matchesSearch =
        !searchQuery.trim() ||
        room.hostName.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchesGame = room.gameType === gameFilter;
      const matchesStake =
        (minStake === undefined || room.stakeAmount >= minStake) &&
        (maxStake === undefined || room.stakeAmount <= maxStake);
      return matchesSearch && matchesGame && matchesStake;
    });
  }, [openRooms, searchQuery, gameFilter, minStake, maxStake]);

  const hasRoomsForGame = openRooms.some((room) => room.gameType === gameFilter);

  const breakdown = useMemo(() => calculatePotBreakdown(customStake), [customStake]);
  const pot = breakdown.totalPot;
  const winnerNet = breakdown.winnerPayout;
  const arenaFee = breakdown.arenaFee;
  const drawRefund = breakdown.drawRefundPerPlayer;

  return (
    <div className="w-full max-w-[420px] mx-auto h-full min-h-0 flex flex-col p-3 sm:p-4 select-none animate-fade-in pb-4 bg-game-paper-soft text-game-ink-black">
      {/* Top Header Bar */}
      <header className="w-full">
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to home"
            className="p-2 bg-game-surface hover:bg-game-paper border-2 border-game-ink-black rounded-none text-game-ink-black transition-colors sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* Lobby View Switcher Tabs */}
          <div role="group" aria-label="Lobby views" className="flex items-center bg-game-paper border-2 border-game-ink-black p-0.5 rounded-none shadow-sketch-xs">
            <button
              type="button"
              aria-pressed={lobbyView === 'create'}
              onClick={() => {
                setLobbyView('create');
              }}
              className={`min-h-11 px-3 py-1 font-body text-sm font-bold rounded-none transition-all flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-blue focus-visible:ring-offset-2 ${
                lobbyView === 'create'
                  ? 'bg-game-ink-red text-game-surface border border-game-ink-black shadow-sketch-xs'
                  : 'text-game-ink-black/70 hover:bg-game-surface hover:text-game-ink-black'
              }`}
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Create Duel
            </button>
            <button
              type="button"
              aria-pressed={lobbyView === 'browse'}
              onClick={() => {
                setLobbyView('browse');
              }}
              className={`min-h-11 px-3 py-1 font-body text-sm font-bold rounded-none transition-all flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-blue focus-visible:ring-offset-2 ${
                lobbyView === 'browse'
                  ? 'bg-game-ink-red text-game-surface border border-game-ink-black shadow-sketch-xs'
                  : 'text-game-ink-black/70 hover:bg-game-surface hover:text-game-ink-black'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              Open Rooms
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowRulesDrawer(prev => !prev)}
              aria-label="Rules"
              className={`p-2 border-2 border-game-ink-black rounded-none transition-colors sketch-shadow-xs ${
                showRulesDrawer ? 'bg-game-note-yellow text-game-warning-text' : 'bg-game-surface hover:bg-game-paper text-game-ink-black'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Rules & Transparency Drawer */}
        {showRulesDrawer && (
          <div className="w-full bg-game-surface border-2 border-game-ink-black rounded-none p-3.5 mb-3 sketch-shadow text-xs space-y-2 text-game-ink-black animate-fade-in">
            <div className="flex justify-between items-center font-sketch text-sm font-bold text-game-ink-black">
              <span>Gibous Fair Play & Match Economics</span>
              <span className="text-game-ink-red cursor-pointer font-bold" onClick={() => setShowRulesDrawer(false)}>✕</span>
            </div>
            <div className="text-game-ink-black/80 text-[11px] leading-relaxed font-sketch">
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
          <div className="w-full bg-game-note-yellow border-2 border-game-ink-black p-3.5 mb-3 sketch-shadow rounded-none flex flex-col gap-2 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-game-success-text animate-ping" />
                <span className="font-sketch text-xs font-bold text-game-warning-text uppercase tracking-wider">
                  Waiting for opponent...
                </span>
              </div>
              <div className="flex items-center gap-1.5 bg-game-surface px-2 py-0.5 border border-game-ink-black">
                <GameBadge game={createdRoom.gameType} size="xs" />
                <span className="font-sketch text-xs font-bold text-game-ink-blue">
                  {GAME_CONFIGS[createdRoom.gameType]?.displayName || createdRoom.gameType.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between bg-game-surface border-2 border-game-ink-black p-2">
              <div>
                <span className="text-[10px] font-sketch text-game-ink-black/60 block font-bold">Room Code</span>
                <span className="font-mono text-lg font-bold text-game-ink-black">{createdRoom.code}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(createdRoom.code)}
                  className="px-2 py-1 bg-game-paper hover:bg-game-note-yellow border border-game-ink-black font-sketch text-xs font-bold flex items-center gap-1"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-game-success-text" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCode ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={onShare}
                  className="px-2 py-1 bg-game-ink-blue text-game-surface hover:brightness-90 border border-game-ink-black font-sketch text-xs font-bold flex items-center gap-1"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </button>
                <button
                  type="button"
                  onClick={handleCancelCreatedRoom}
                  className="p-1 bg-game-danger-bg hover:brightness-90 text-game-ink-red border border-game-ink-black"
                  title="Cancel Room"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-sketch font-bold text-game-warning-text">
              <span>Your Stake: {createdRoom.stakeAmount} GRAM</span>
              <span>Matched Pot: {createdRoom.stakeAmount * 2} GRAM</span>
              <span className="text-game-success-text">Win Net: {Math.floor(createdRoom.stakeAmount * 2 * 0.9)} GRAM</span>
            </div>
          </div>
        )}

        {/* ================= VIEW 1: CREATE ROOM FLOW ================= */}
        {lobbyView === 'create' && (
          <div className="flex flex-col gap-3">
            {/* Step 1: Choose Game */}
            <div className="bg-game-surface border-2 border-game-ink-black p-3 rounded-none sketch-shadow-xs">
              <span className="font-sketch text-xs font-bold text-game-ink-black/70 uppercase tracking-wider block mb-2">
                1. Choose Game:
              </span>
              <GameTypeSelector
                selectedGame={selectedGame}
                onSelectGame={(game) => {
                  onSelectGame(game);
                }}
              />

              {/* Featured Game Preview Banner */}
              <div className="flex items-center gap-3 p-2 bg-game-paper border-2 border-game-ink-black rounded-none sketch-shadow-xs">
                <div className="w-12 h-12 rounded-none bg-game-surface border border-game-ink-black flex items-center justify-center p-0.5 shrink-0">
                  <GameBadge game={selectedGame} size="md" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-sketch text-sm font-bold text-game-ink-black truncate">
                    {GAME_CONFIGS[selectedGame]?.displayName || selectedGame}
                  </span>
                  <span className="font-sketch text-[11px] text-game-ink-black/70 truncate">
                    {GAME_CONFIGS[selectedGame]?.description}
                  </span>
                </div>
              </div>
            </div>

            {/* Step 2: Choose Stake Amount (Custom Editable + Quick Presets) */}
            <div className="bg-game-surface border-2 border-game-ink-black p-3 rounded-none sketch-shadow-xs">
              <div className="flex items-center mb-1">
                <span className="font-sketch text-xs font-bold text-game-ink-black/70 uppercase tracking-wider">
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
                  className="w-10 shrink-0 bg-game-paper hover:bg-game-paper-soft disabled:opacity-40 disabled:cursor-not-allowed border-2 border-game-ink-black font-sketch text-xl font-bold leading-none"
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
                  className="w-full p-2 bg-game-paper border-2 border-game-ink-black font-sketch text-lg font-bold text-game-ink-black focus:outline-none focus:bg-game-surface focus:ring-2 focus:ring-game-ink-red"
                  placeholder="Enter stake amount (e.g. 0.5)"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-sketch text-xs font-bold text-game-ink-black/60">
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
                  className="w-10 shrink-0 bg-game-paper hover:bg-game-paper-soft disabled:opacity-40 disabled:cursor-not-allowed border-2 border-game-ink-black font-sketch text-xl font-bold leading-none"
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
                    className={`py-1 rounded-none border-2 border-game-ink-black font-sketch text-xs font-bold transition-all sketch-btn-press ${
                      customStake === amt
                        ? 'bg-game-note-yellow text-game-warning-text sketch-shadow-xs ring-2 ring-game-note-yellow-border'
                        : 'bg-game-paper text-game-ink-black hover:bg-game-surface'
                    }`}
                  >
                    {amt}
                  </button>
                ))}
              </div>
            </div>

            {/* Economics Breakdown */}
            <div className="bg-game-paper border-2 border-game-ink-black p-3">
              <div className="flex items-center justify-between text-xs font-sketch font-bold text-game-ink-black/80 mb-2">
                <span>Total Match Pot:</span>
                <span className="text-base text-game-ink-blue flex items-center gap-1 font-black">
                  {pot} GRAM <GramIcon size="sm" />
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 text-[11px] text-game-ink-black/80">
                <div className="bg-game-surface p-1.5 border border-game-ink-black/30">
                  <span className="text-game-success-text font-bold block">Winner (90%)</span>
                  <span className="font-bold text-game-ink-black">+{winnerNet} GRAM</span>
                </div>
                <div className="bg-game-surface p-1.5 border border-game-ink-black/30">
                  <span className="text-game-ink-red font-bold block">Arena Fee (10%)</span>
                  <span className="font-bold text-game-ink-black">-{arenaFee} GRAM</span>
                </div>
                <div className="bg-game-surface p-1.5 border border-game-ink-black/30">
                  <span className="text-game-warning-text font-bold block">Draw (95% ea)</span>
                  <span className="font-bold text-game-ink-black">+{drawRefund} GRAM</span>
                </div>
              </div>
            </div>

            {/* CTA: Create Duel Button */}
            <button
              type="button"
              onClick={handleCreateRoomAction}
              className="w-full py-3 bg-game-ink-red hover:brightness-90 text-game-surface border-2 border-game-ink-black font-sketch text-base font-bold sketch-shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <PlusCircle className="w-5 h-5 stroke-[2.5]" />
              Create {selectedGame.toUpperCase()} Duel ({customStake} GRAM)
            </button>

          </div>
        )}

        {/* ================= VIEW 2: LIVE OPEN ROOMS BROWSER & SEARCH ================= */}
        {lobbyView === 'browse' && (
          <div className="flex flex-col gap-3">
            <section aria-label="Filter open rooms" className="bg-game-surface border-2 border-game-ink-black p-3 sketch-shadow-xs flex flex-col gap-3">
              <div>
                <p id="room-game-filter-label" className="font-sketch text-sm font-bold text-game-ink-black mb-2">Choose a game</p>
                <div role="group" aria-labelledby="room-game-filter-label" className="grid grid-cols-3 gap-2">
                  {([
                    { key: 'snake', label: 'Snakes', accessibleLabel: 'Snakes and Ladders' },
                    { key: 'connect4', label: 'Connect 4', accessibleLabel: 'Connect 4' },
                    { key: 'rps', label: 'RPS', accessibleLabel: 'Rock Paper Scissors' },
                  ] as const).map((game) => (
                    <button
                      key={game.key}
                      type="button"
                      aria-label={`${game.accessibleLabel} rooms`}
                      aria-pressed={gameFilter === game.key}
                      onClick={() => {
                        setGameFilter(game.key);
                        onSelectGame(game.key);
                      }}
                      className={`min-h-16 px-2 py-2 border-2 border-game-ink-black rounded-xl font-sketch text-sm font-bold flex flex-col items-center justify-center gap-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-blue focus-visible:ring-offset-2 ${
                        gameFilter === game.key
                          ? game.key === 'snake'
                            ? 'bg-game-ink-red text-game-surface shadow-sketch-xs'
                            : game.key === 'connect4'
                              ? 'bg-game-ink-blue text-game-surface shadow-sketch-xs'
                              : 'bg-game-note-yellow text-game-ink-black shadow-sketch-xs'
                          : 'bg-game-paper text-game-ink-black hover:bg-game-paper-soft'
                      }`}
                    >
                      <GameBadge game={game.key} size="sm" alt="" />
                      <span>{game.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="room-min-stake-filter" className="font-sketch text-sm font-bold text-game-ink-black">Min GRAM</label>
                  <input
                    id="room-min-stake-filter"
                    type="number"
                    min={MIN_STAKE}
                    max={MAX_STAKE}
                    step="any"
                    inputMode="decimal"
                    value={minStakeFilter}
                    onChange={(event) => setMinStakeFilter(event.target.value)}
                    aria-invalid={invalidMinStake || invalidStakeRange}
                    aria-describedby="room-stake-filter-help"
                    placeholder="No min"
                    className="min-h-11 w-full min-w-0 px-2 bg-game-paper border-2 border-game-ink-black font-sketch text-sm text-game-ink-black placeholder:text-game-ink-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-red focus-visible:ring-offset-2"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="room-max-stake-filter" className="font-sketch text-sm font-bold text-game-ink-black">Max GRAM</label>
                  <input
                    id="room-max-stake-filter"
                    type="number"
                    min={MIN_STAKE}
                    max={MAX_STAKE}
                    step="any"
                    inputMode="decimal"
                    value={maxStakeFilter}
                    onChange={(event) => setMaxStakeFilter(event.target.value)}
                    aria-invalid={invalidMaxStake || invalidStakeRange}
                    aria-describedby="room-stake-filter-help"
                    placeholder="No max"
                    className="min-h-11 w-full min-w-0 px-2 bg-game-paper border-2 border-game-ink-black font-sketch text-sm text-game-ink-black placeholder:text-game-ink-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-red focus-visible:ring-offset-2"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1 flex flex-col gap-1">
                  <label htmlFor="room-host-search" className="font-sketch text-sm font-bold text-game-ink-black">Find a host</label>
                  <div className="relative">
                    <Search aria-hidden="true" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-game-ink-black/60" />
                    <input
                      id="room-host-search"
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search player name"
                      className="min-h-11 w-full pl-9 pr-3 bg-game-paper border-2 border-game-ink-black font-sketch text-sm text-game-ink-black placeholder:text-game-ink-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-red focus-visible:ring-offset-2"
                    />
                  </div>
                </div>
              </div>
              <p id="room-stake-filter-help" aria-live="polite" className={`font-sketch text-xs ${invalidStakeFilter ? 'text-game-danger-text' : 'text-game-ink-black/70'}`}>
                {invalidMinStake || invalidMaxStake
                  ? `Enter an amount from ${MIN_STAKE} to ${MAX_STAKE} GRAM.`
                  : invalidStakeRange
                    ? 'Minimum must be less than or equal to maximum.'
                    : 'Leave either field blank to skip that limit.'}
              </p>
            </section>

            <form onSubmit={handleQuickJoinByCode} aria-label="Join with a room code" className="bg-game-note-blue border-2 border-game-ink-blue p-3 flex flex-col gap-2 sketch-shadow-xs">
              <label htmlFor="quick-join-code" className="font-sketch text-sm font-bold text-game-ink-black">Have a room code?</label>
              <div className="flex gap-2">
                <input
                  id="quick-join-code"
                  type="text"
                  value={quickJoinCode}
                  autoComplete="off"
                  maxLength={12}
                  placeholder="Enter code"
                  aria-invalid={Boolean(joinError)}
                  aria-describedby={joinError ? 'quick-join-error' : undefined}
                  onChange={(event) => {
                    setQuickJoinCode(event.target.value);
                    if (joinError) setJoinError(null);
                  }}
                  className="min-h-11 min-w-0 flex-1 px-3 bg-game-surface border-2 border-game-ink-black font-sketch text-sm font-bold uppercase text-game-ink-black placeholder:text-game-ink-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-red focus-visible:ring-offset-2"
                />
                <button
                  type="submit"
                  className="min-h-11 px-4 bg-game-ink-red hover:brightness-90 text-game-surface border-2 border-game-ink-black font-sketch text-sm font-bold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-blue focus-visible:ring-offset-2"
                >
                  Join by code
                </button>
              </div>
              {joinError && (
                <p id="quick-join-error" role="alert" className="font-body text-sm font-bold text-game-danger-text">
                  {joinError}
                </p>
              )}
            </form>

            <section aria-labelledby="open-rooms-heading" className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h2 id="open-rooms-heading" className="font-sketch text-lg font-bold text-game-ink-black">
                  {GAME_CONFIGS[gameFilter]?.displayName || 'Open rooms'}
                </h2>
                <p aria-live="polite" aria-atomic="true" className="font-body text-sm font-bold text-game-ink-black">
                  {filteredRooms.length} {filteredRooms.length === 1 ? 'room' : 'rooms'}
                </p>
              </div>

              {filteredRooms.length === 0 ? (
                <div className="p-5 bg-game-surface border-2 border-game-ink-black text-center shadow-sketch-xs">
                  <Swords aria-hidden="true" className="w-8 h-8 mx-auto text-game-ink-black/50 mb-1" />
                  <h3 className="font-sketch text-base font-bold text-game-ink-black">
                    {openRooms.length === 0
                      ? 'No open rooms yet'
                      : !hasRoomsForGame
                        ? `No ${GAME_CONFIGS[gameFilter]?.shortName || 'game'} rooms right now`
                        : 'No rooms match these filters'}
                  </h3>
                  <p className="font-body text-sm text-game-ink-black/70 mt-1">
                    {openRooms.length === 0
                      ? 'Create a room and invite someone to play.'
                      : !hasRoomsForGame
                        ? 'Pick another game above or create the first room.'
                        : 'Try another stake amount or host name.'}
                  </p>
                  {openRooms.length === 0 || !hasRoomsForGame ? (
                    <button
                      type="button"
                      onClick={() => setLobbyView('create')}
                      className="mt-3 min-h-11 px-4 bg-game-ink-red text-game-surface border-2 border-game-ink-black font-sketch text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-blue focus-visible:ring-offset-2"
                    >
                      Create {GAME_CONFIGS[gameFilter]?.shortName || 'a'} duel
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setMinStakeFilter('');
                        setMaxStakeFilter('');
                      }}
                      className="mt-3 min-h-11 px-4 bg-game-note-yellow text-game-ink-black border-2 border-game-ink-black font-sketch text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-blue focus-visible:ring-offset-2"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {filteredRooms.map((room) => (
                    <li key={room.code}>
                      <article className="p-3 bg-game-surface border-2 border-game-ink-black flex items-center justify-between gap-3 shadow-sketch-xs hover:bg-game-paper-soft transition-colors">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={room.hostName} photoUrl={room.hostAvatar} color="green" size="sm" />
                          <div className="flex min-w-0 flex-col">
                            <h3 className="font-body text-sm font-bold text-game-ink-black truncate">
                              {room.hostName}
                            </h3>
                            <p className="font-body text-xs text-game-ink-black/70 mt-0.5">
                              Room code: <span className="font-mono font-bold select-text">{room.code}</span>
                            </p>
                            <p className="font-body text-xs text-game-success-text font-bold mt-0.5">
                              Potential win +{calculatePotBreakdown(room.stakeAmount).winnerPayout} GRAM
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <p className="font-body text-sm font-bold text-game-ink-red text-right">
                            {room.stakeAmount} GRAM
                          </p>
                          <button
                            type="button"
                            onClick={() => handleJoinSpecificRoom(room)}
                            aria-label={`Join ${room.hostName}'s room, ${room.stakeAmount} GRAM stake`}
                            className="min-h-11 px-3 bg-game-success-text hover:brightness-90 text-game-surface border-2 border-game-ink-black font-body text-sm font-bold shadow-sketch-xs active:translate-x-px active:translate-y-px active:shadow-none transition-all flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-game-ink-blue focus-visible:ring-offset-2"
                          >
                            <LogIn aria-hidden="true" className="w-4 h-4" />
                            Join
                          </button>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </section>
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
