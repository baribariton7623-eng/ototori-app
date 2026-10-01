import { defineConfig, devices } from '@playwright/test';

/**
 * ブラウザでの通しテスト(npm run test:e2e)。
 * サーバーはインメモリ・開発用認証・課金/カレンダーの仮実装で起動し、時計を FAKE_NOW に固定する。
 * ブラウザ側の時計も各テストで同じ時刻に合わせる(e2e/fixtures.ts)。
 */
const PORT = Number(process.env.E2E_PORT ?? 8899);
export const FAKE_NOW = '2026-10-01T00:00:00Z'; // 2026-10-01(木) 09:00 JST

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    viewport: { width: 420, height: 860 },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 420, height: 860 } } }],
  webServer: {
    command: 'node dist/server.js',
    url: `http://localhost:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      APP_BASE_URL: `http://localhost:${PORT}`,
      FAKE_NOW,
      AUTH_MODE: 'dev',
      STORAGE: 'memory',
      CALENDAR: 'fake',
      BILLING: 'fake',
      MAIL: 'console',
      WEB_DIST: 'web/dist',
    },
  },
});
