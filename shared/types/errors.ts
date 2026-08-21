export type ErrorCode =
  | 'AUTH_FAILED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'JOIN_FAILED'
  | 'INVALID_ACTION'
  | 'ACTION_REJECTED'
  | 'NOT_YOUR_TURN'
  | 'INSUFFICIENT_BALANCE'
  | 'RATE_LIMITED'
  | 'INVALID_SCHEMA'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  AUTH_FAILED:          'Authentication failed. Please reopen the app from Telegram.',
  ROOM_NOT_FOUND:       'This duel room no longer exists.',
  ROOM_FULL:            'This duel has already been joined.',
  JOIN_FAILED:          'Unable to join this duel. It may be full or no longer available.',
  INVALID_ACTION:       "That action isn't available right now.",
  ACTION_REJECTED:      'Invalid move. Please try again.',
  NOT_YOUR_TURN:        "It's your opponent's turn.",
  INSUFFICIENT_BALANCE: 'You need more GRAM to enter this duel.',
  RATE_LIMITED:         "You're moving too quickly. Try again in a moment.",
  INVALID_SCHEMA:       'Something went wrong. Please refresh and try again.',
  INTERNAL_ERROR:       'Server error. Please try again shortly.',
  NETWORK_ERROR:        'Connection lost. Check your internet connection.',
};
