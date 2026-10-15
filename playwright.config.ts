import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 30000,
  fullyParallel: false, // Run flows cleanly
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run server',
      port: 3001,
      reuseExistingServer: false,
      timeout: 10000,
      env: {
        DATABASE_URL: process.env.E2E_DATABASE_URL || process.env.TEST_DATABASE_URL || '',
        NODE_ENV: 'development',
        ALLOW_UNSIGNED_AUTH: 'true',
        PAYOUT_WORKER_ENABLED: 'false',
      },
    },
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: false,
      timeout: 10000,
    },
  ],
});
