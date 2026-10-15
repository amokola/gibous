import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/postgres.setup.ts'],
    include: ['tests/postgres/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
