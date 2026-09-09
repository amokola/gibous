/**
 * Authentication & Authorization Guards
 * Centralizes economics validation, role assertions, and session checks.
 */

import { WebSocket } from 'ws';
import { MAX_STAKE, MIN_STAKE } from '../shared/constants/economics';
import { PlayerRole } from '../shared/types/game';
import { GameRoom } from './roomManager';
import { sessionManager, AuthenticatedSession } from './sessionManager';

export class AuthGuardError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'AuthGuardError';
  }
}

/**
 * Validates stake input against strict integer bounds and safe range limits.
 */
export function validateStake(stake: unknown): number {
  const num = typeof stake === 'number' ? stake : Number(stake);
  if (!Number.isFinite(num) || num < MIN_STAKE || num > MAX_STAKE) {
    throw new AuthGuardError('INVALID_STAKE', `Stake must be between ${MIN_STAKE} and ${MAX_STAKE} GRAM`);
  }
  const fixed = Number(num.toFixed(9));
  if (Math.abs(num - fixed) > 1e-9) {
    throw new AuthGuardError('INVALID_STAKE', 'Stake precision cannot exceed 9 decimal places');
  }
  return fixed;
}

/**
 * Asserts that a Telegram ID belongs to an active player in the room and returns their role.
 */
export function assertRoomParticipant(room: GameRoom, telegramId: number): PlayerRole {
  if (room.p1 && room.p1.telegramId === telegramId) {
    return 'p1';
  }
  if (room.p2 && room.p2.telegramId === telegramId) {
    return 'p2';
  }
  throw new AuthGuardError('UNAUTHORIZED', 'You are not an active player in this duel');
}

/**
 * Retrieves an active authenticated session for a WebSocket or throws AuthGuardError.
 */
export function requireSession(ws: WebSocket): AuthenticatedSession {
  const session = sessionManager.getSession(ws);
  if (!session) {
    throw new AuthGuardError('UNAUTHORIZED', 'Please log in to continue');
  }
  return session;
}
