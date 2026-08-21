import { GameType, PlayerRole } from './game';

/** Connection state for peer visibility */
export type PeerConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'RECONNECTING';

/** Game phases that determine valid UI/actions */
export type GamePhase =
  | 'WAITING_FOR_OPPONENT'
  | 'COUNTDOWN'
  | 'WAITING_ROLL'
  | 'WAITING_DROP'
  | 'WAITING_CHOICE'
  | 'ANIMATING'
  | 'RESOLVING'
  | 'GAME_OVER';

export type RoomStatus = 'waiting' | 'playing' | 'gameover';

/** First-class match result — replaces winner === null pattern */
export type MatchResult =
  | { type: 'WIN'; winner: PlayerRole }
  | { type: 'DRAW' }
  | { type: 'FORFEIT'; winner: PlayerRole; reason: 'resign' | 'disconnect_timeout' };

export interface PlayerSnapshot {
  id: PlayerRole;
  telegramId: number;
  name: string;
  avatarUrl?: string;
  isReady: boolean;
  isBot?: boolean;
  isConnected: boolean;
}

/** The single source of truth the frontend renders */
export interface RoomSnapshot {
  room: {
    code: string;
    gameType: GameType;
    status: RoomStatus;
    version: number;
  };
  players: {
    p1: PlayerSnapshot | null;
    p2: PlayerSnapshot | null;
  };
  connection: {
    self: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'RECONNECTING';
    opponent: PeerConnectionState;
  };
  game: {
    activePlayer: PlayerRole;
    phase: GamePhase;
    state: Record<string, unknown>;
    result: MatchResult | null;
  };
  financial: {
    stake: number;
    pot: number;
    fee: number;
    potentialPayout: number;
  };
}
