import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Ensure in-memory DatabasePool is cleanly used across integration tests
delete process.env.DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ';
process.env.ALLOW_UNSIGNED_AUTH = 'true';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Polyfill window.matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Polyfill window.scrollTo
  window.scrollTo = vi.fn() as any;

  // Polyfill navigator.clipboard
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
  });
}

// Mock canvas-confetti
vi.mock('canvas-confetti', () => {
  const confettiMock = vi.fn().mockResolvedValue(undefined);
  return {
    default: confettiMock,
    create: () => confettiMock,
  };
});

// Mock MultiplayerService class using vi.hoisted
const { MockMultiplayerService } = vi.hoisted(() => {
  class MockMultiplayerService {
    static instance = new MockMultiplayerService();
    static getInstance() {
      return MockMultiplayerService.instance;
    }
    connect = vi.fn();
    disconnect = vi.fn();
    send = vi.fn();
    on = vi.fn().mockReturnValue(() => {});
    off = vi.fn();
    getStatus = vi.fn().mockReturnValue('CONNECTED');
    getConnectionState = vi.fn().mockReturnValue('CONNECTED');
    getOpenRooms = vi.fn().mockResolvedValue([]);
  }
  return { MockMultiplayerService };
});

vi.mock('@/services/multiplayerService', () => ({
  MultiplayerService: MockMultiplayerService,
  multiplayerService: MockMultiplayerService.instance,
}));

vi.mock('../../services/multiplayerService', () => ({
  MultiplayerService: MockMultiplayerService,
  multiplayerService: MockMultiplayerService.instance,
}));
