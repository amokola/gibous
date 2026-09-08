import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Ensure test suite runs purely with in-memory database
delete process.env.DATABASE_URL;
process.env.TELEGRAM_BOT_TOKEN = '123456789:ABCdefGHIjklMNOpqrSTUvwxYZ';
process.env.ALLOW_UNSIGNED_AUTH = 'true';

// Automatically clean up after each React component test
afterEach(() => {
  if (typeof window !== 'undefined') {
    cleanup();
  }
  vi.clearAllMocks();
});

// Polyfill window.matchMedia for jsdom
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
