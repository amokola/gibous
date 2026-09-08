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
  AUTH_FAILED:          "We couldn't verify your Telegram account. Please reopen the app from Telegram.",
  ROOM_NOT_FOUND:       'Duel not found.',
  ROOM_FULL:            'This duel is full.',
  JOIN_FAILED:          'Could not join this duel. It may be full or no longer available.',
  INVALID_ACTION:       "That action isn't available right now.",
  ACTION_REJECTED:      'Invalid move. Please try again.',
  NOT_YOUR_TURN:        "It's your opponent's turn.",
  INSUFFICIENT_BALANCE: 'You need more GRAM to enter this duel.',
  RATE_LIMITED:         "You're moving too quickly. Please wait a moment.",
  INVALID_SCHEMA:       'Something went wrong. Please try again.',
  INTERNAL_ERROR:       'Something went wrong. Please try again.',
  NETWORK_ERROR:        'Connection lost. Please check your internet.',
};
