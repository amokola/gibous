import { z } from 'zod';

// Base Enums & Primitives
export const GameTypeSchema = z.enum(['snake', 'connect4', 'rps']);
export const PlayerRoleSchema = z.enum(['p1', 'p2']);
export const MatchWinnerSchema = z.enum(['p1', 'p2', 'draw']).nullable();
export const ConnectionStateSchema = z.enum(['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'RECONNECTING']);

export const RPSChoiceSchema = z.enum(['rock', 'paper', 'scissors']);

// Client Message Schemas
export const AuthPayloadSchema = z.object({
  telegramId: z.number(),
  initData: z.string().optional(),
  playerName: z.string(),
  avatarUrl: z.string().optional(),
});

export const JoinRoomPayloadSchema = z.object({
  roomCode: z.string(),
  telegramId: z.number().optional(),
  playerName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

export const LeaveRoomPayloadSchema = z.object({
  roomCode: z.string(),
});

export const SyncRoomPayloadSchema = z.object({
  roomCode: z.string(),
});

export const RollDicePayloadSchema = z.object({
  roomCode: z.string(),
});

export const DropDiscPayloadSchema = z.object({
  roomCode: z.string(),
  column: z.number().min(0).max(6),
});

export const ChooseRPSPayloadSchema = z.object({
  roomCode: z.string(),
  choice: RPSChoiceSchema,
});

export const RematchRequestPayloadSchema = z.object({
  roomCode: z.string(),
});

export const RematchAcceptPayloadSchema = z.object({
  roomCode: z.string(),
});

export const EmotePayloadSchema = z.object({
  roomCode: z.string(),
  emoji: z.string(),
});

export const PingPayloadSchema = z.object({
  timestamp: z.number(),
});

export const CreateRoomPayloadSchema = z.object({
  roomCode: z.string(),
  gameType: GameTypeSchema.optional(),
  stake: z.number().optional(),
  telegramId: z.number().optional(),
  playerName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

export const CancelRoomPayloadSchema = z.object({
  roomCode: z.string(),
  telegramId: z.number().optional(),
});

export const JoinQueuePayloadSchema = z.object({
  gameType: GameTypeSchema.optional(),
  stake: z.number().optional(),
  telegramId: z.number().optional(),
  playerName: z.string().optional(),
  avatarUrl: z.string().optional(),
});

// Client Message Union Schema
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('AUTH'), requestId: z.string().optional(), payload: AuthPayloadSchema }),
  z.object({ type: z.literal('JOIN_ROOM'), requestId: z.string().optional(), payload: JoinRoomPayloadSchema }),
  z.object({ type: z.literal('LEAVE_ROOM'), requestId: z.string().optional(), payload: LeaveRoomPayloadSchema }),
  z.object({ type: z.literal('SYNC_ROOM'), requestId: z.string().optional(), payload: SyncRoomPayloadSchema }),
  z.object({ type: z.literal('ROLL_DICE'), requestId: z.string().optional(), payload: RollDicePayloadSchema }),
  z.object({ type: z.literal('DROP_DISC'), requestId: z.string().optional(), payload: DropDiscPayloadSchema }),
  z.object({ type: z.literal('CHOOSE_RPS'), requestId: z.string().optional(), payload: ChooseRPSPayloadSchema }),
  z.object({ type: z.literal('REMATCH_REQUEST'), requestId: z.string().optional(), payload: RematchRequestPayloadSchema }),
  z.object({ type: z.literal('REMATCH_ACCEPT'), requestId: z.string().optional(), payload: RematchAcceptPayloadSchema }),
  z.object({ type: z.literal('EMOTE'), requestId: z.string().optional(), payload: EmotePayloadSchema }),
  z.object({ type: z.literal('PING'), requestId: z.string().optional(), payload: PingPayloadSchema }),
  z.object({ type: z.literal('GET_ROOMS'), requestId: z.string().optional(), payload: z.record(z.string(), z.unknown()).optional() }),
  z.object({ type: z.literal('CREATE_ROOM'), requestId: z.string().optional(), payload: CreateRoomPayloadSchema }),
  z.object({ type: z.literal('CANCEL_ROOM'), requestId: z.string().optional(), payload: CancelRoomPayloadSchema }),
  z.object({ type: z.literal('JOIN_QUEUE'), requestId: z.string().optional(), payload: JoinQueuePayloadSchema }),
  z.object({ type: z.literal('CANCEL_QUEUE'), requestId: z.string().optional(), payload: z.record(z.string(), z.unknown()).optional() }),
]);

// Server Message Schemas
export const RoomPlayerStateSchema = z.object({
  id: PlayerRoleSchema,
  telegramId: z.number().optional(),
  name: z.string(),
  avatarUrl: z.string().optional(),
  isReady: z.boolean(),
  isBot: z.boolean().optional(),
  isConnected: z.boolean().optional(),
});

export const RoomStatePayloadSchema = z.object({
  code: z.string(),
  gameType: GameTypeSchema,
  status: z.enum(['waiting', 'playing', 'gameover']),
  stakeAmount: z.number(),
  potAmount: z.number(),
  p1: RoomPlayerStateSchema.nullable(),
  p2: RoomPlayerStateSchema.nullable(),
  activePlayer: PlayerRoleSchema,
  turnPhase: z.string(),
  winner: MatchWinnerSchema,
  version: z.number(),
  gameState: z.record(z.string(), z.unknown()),
});

export const DiceRolledPayloadSchema = z.object({
  roomCode: z.string(),
  player: PlayerRoleSchema,
  value: z.number().min(1).max(6),
  from: z.number(),
  to: z.number(),
  snakeOrLadder: z.object({
    type: z.enum(['snake', 'ladder']),
    from: z.number(),
    to: z.number(),
  }).optional(),
  nextPlayer: PlayerRoleSchema,
  isWinner: z.boolean(),
  version: z.number(),
});

export const DiscDroppedPayloadSchema = z.object({
  roomCode: z.string(),
  player: PlayerRoleSchema,
  row: z.number().min(0).max(5),
  col: z.number().min(0).max(6),
  board: z.array(z.array(PlayerRoleSchema.nullable())),
  nextPlayer: PlayerRoleSchema,
  winner: MatchWinnerSchema,
  winningCells: z.array(z.object({ row: z.number(), col: z.number() })).optional(),
  version: z.number(),
});

export const RPSRoundResolvedPayloadSchema = z.object({
  roomCode: z.string(),
  round: z.number(),
  p1Choice: RPSChoiceSchema,
  p2Choice: RPSChoiceSchema,
  roundWinner: z.enum(['p1', 'p2', 'draw']),
  p1Score: z.number(),
  p2Score: z.number(),
  matchWinner: MatchWinnerSchema,
  version: z.number(),
});

export const GameOverPayloadSchema = z.object({
  roomCode: z.string(),
  winner: MatchWinnerSchema,
  potAmount: z.number(),
  winnerPayout: z.number(),
  loserPayout: z.number(),
  arenaFee: z.number(),
  xpEarned: z.number(),
  version: z.number(),
  isForfeit: z.boolean().optional(),
});

export const ErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
});

export const PongPayloadSchema = z.object({
  timestamp: z.number(),
  clientTimestamp: z.number(),
});

// Server Message Union Schema
export const ServerMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('AUTH_OK'), requestId: z.string().optional(), payload: z.object({ telegramId: z.number(), user: z.record(z.string(), z.unknown()) }) }),
  z.object({ type: z.literal('ROOM_STATE'), requestId: z.string().optional(), payload: RoomStatePayloadSchema }),
  z.object({ type: z.literal('GAME_START'), requestId: z.string().optional(), payload: RoomStatePayloadSchema }),
  z.object({ type: z.literal('DICE_ROLLED'), requestId: z.string().optional(), payload: DiceRolledPayloadSchema }),
  z.object({ type: z.literal('DISC_DROPPED'), requestId: z.string().optional(), payload: DiscDroppedPayloadSchema }),
  z.object({ type: z.literal('RPS_ROUND_RESOLVED'), requestId: z.string().optional(), payload: RPSRoundResolvedPayloadSchema }),
  z.object({ type: z.literal('GAME_OVER'), requestId: z.string().optional(), payload: GameOverPayloadSchema }),
  z.object({ type: z.literal('PLAYER_JOINED'), requestId: z.string().optional(), payload: z.object({ player: RoomPlayerStateSchema, version: z.number() }) }),
  z.object({ type: z.literal('PLAYER_DISCONNECTED'), requestId: z.string().optional(), payload: z.object({ player: PlayerRoleSchema, version: z.number(), timeoutMs: z.number().optional() }) }),
  z.object({ type: z.literal('PLAYER_RECONNECTED'), requestId: z.string().optional(), payload: z.object({ player: PlayerRoleSchema, version: z.number() }) }),
  z.object({ type: z.literal('EMOTE'), requestId: z.string().optional(), payload: z.object({ player: PlayerRoleSchema, emoji: z.string() }) }),
  z.object({ type: z.literal('ERROR'), requestId: z.string().optional(), payload: ErrorPayloadSchema }),
  z.object({ type: z.literal('PONG'), requestId: z.string().optional(), payload: PongPayloadSchema }),
  z.object({ type: z.literal('ROOMS_LIST'), requestId: z.string().optional(), rooms: z.array(z.record(z.string(), z.unknown())).optional(), payload: z.record(z.string(), z.unknown()).optional() }),
  z.object({ type: z.literal('ROOM_CREATED'), requestId: z.string().optional(), room: z.record(z.string(), z.unknown()).optional(), payload: z.record(z.string(), z.unknown()).optional() }),
  z.object({ type: z.literal('ROOM_CANCELLED'), requestId: z.string().optional(), roomCode: z.string().optional(), payload: z.record(z.string(), z.unknown()).optional() }),
  z.object({ type: z.literal('QUEUE_JOINED'), requestId: z.string().optional(), status: z.string().optional(), payload: z.record(z.string(), z.unknown()).optional() }),
  z.object({ type: z.literal('QUEUE_CANCELLED'), requestId: z.string().optional(), payload: z.record(z.string(), z.unknown()).optional() }),
]);
