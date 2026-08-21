import { z } from 'zod';
import {
  ConnectionStateSchema,
  ClientMessageSchema,
  ServerMessageSchema,
  RoomStatePayloadSchema,
  DiceRolledPayloadSchema,
  DiscDroppedPayloadSchema,
  RPSRoundResolvedPayloadSchema,
  GameOverPayloadSchema,
  ErrorPayloadSchema,
  PongPayloadSchema,
  JoinRoomPayloadSchema,
  RollDicePayloadSchema,
  DropDiscPayloadSchema,
  ChooseRPSPayloadSchema,
  AuthPayloadSchema,
  RoomPlayerStateSchema,
} from '../schemas/protocol';

export type ConnectionState = z.infer<typeof ConnectionStateSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export type ClientMessageType = ClientMessage['type'];
export type ServerMessageType = ServerMessage['type'];

export type RoomStatePayload = z.infer<typeof RoomStatePayloadSchema>;
export type RoomPlayerState = z.infer<typeof RoomPlayerStateSchema>;
export type DiceRolledPayload = z.infer<typeof DiceRolledPayloadSchema>;
export type DiscDroppedPayload = z.infer<typeof DiscDroppedPayloadSchema>;
export type RPSRoundResolvedPayload = z.infer<typeof RPSRoundResolvedPayloadSchema>;
export type GameOverPayload = z.infer<typeof GameOverPayloadSchema>;
export type ErrorPayload = z.infer<typeof ErrorPayloadSchema>;
export type PongPayload = z.infer<typeof PongPayloadSchema>;

export type AuthPayload = z.infer<typeof AuthPayloadSchema>;
export type JoinRoomPayload = z.infer<typeof JoinRoomPayloadSchema>;
export type RollDicePayload = z.infer<typeof RollDicePayloadSchema>;
export type DropDiscPayload = z.infer<typeof DropDiscPayloadSchema>;
export type ChooseRPSPayload = z.infer<typeof ChooseRPSPayloadSchema>;

export interface MessageEnvelope<T = unknown> {
  type: string;
  requestId?: string;
  version?: number;
  payload: T;
}
