import crypto from 'crypto';
import { NormalizedDuelState } from '../../src/types/game';
import { RoomStatePayload, PlayerRole } from '../../shared';

export const TEST_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ';

/**
 * Generate a cryptographically valid Telegram WebApp initData string
 */
export function generateValidInitData(
  user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
  },
  botToken: string = TEST_BOT_TOKEN,
  authDate: number = Math.floor(Date.now() / 1000)
): string {
  const userJson = JSON.stringify(user);
  const params = new Map<string, string>();
  params.set('auth_date', authDate.toString());
  params.set('query_id', 'AAG9xyz123');
  params.set('user', userJson);

  // Sort keys alphabetically
  const dataCheckArr: string[] = [];
  const sortedKeys = Array.from(params.keys()).sort();
  for (const key of sortedKeys) {
    dataCheckArr.push(`${key}=${params.get(key)}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const urlParams = new URLSearchParams();
  urlParams.set('auth_date', authDate.toString());
  urlParams.set('query_id', 'AAG9xyz123');
  urlParams.set('user', userJson);
  urlParams.set('hash', hash);

  return urlParams.toString();
}

/**
 * Mock Duel State builder for React component testing
 */
export function createMockDuelState(overrides: Partial<NormalizedDuelState> = {}): NormalizedDuelState {
  const defaultRoom: RoomStatePayload = {
    code: 'TEST99',
    gameType: 'snake',
    status: 'playing',
    stakeAmount: 100,
    potAmount: 200,
    p1: {
      id: 'p1',
      telegramId: 11111,
      name: 'Alice (P1)',
      avatarUrl: '',
      isReady: true,
      isConnected: true,
    },
    p2: {
      id: 'p2',
      telegramId: 22222,
      name: 'Bob (P2)',
      avatarUrl: '',
      isReady: true,
      isConnected: true,
    },
    activePlayer: 'p1',
    turnPhase: 'WAITING_ROLL',
    winner: null,
    version: 1,
    gameState: {
      p1Position: 1,
      p2Position: 1,
      lastRoll: null,
      lastAction: null,
    },
  };

  return {
    room: {
      code: defaultRoom.code,
      gameType: defaultRoom.gameType,
      status: defaultRoom.status,
      version: defaultRoom.version,
    },
    players: {
      p1: defaultRoom.p1,
      p2: defaultRoom.p2,
    },
    myRole: 'p1',
    activePlayer: 'p1',
    turnPhase: defaultRoom.turnPhase,
    potAmount: defaultRoom.potAmount,
    stakeAmount: defaultRoom.stakeAmount,
    winner: defaultRoom.winner,
    gameState: defaultRoom.gameState,
    lastDiceEvent: null,
    lastDropEvent: null,
    lastRPSEvent: null,
    lastGameOverEvent: null,
    ...overrides,
  };
}
