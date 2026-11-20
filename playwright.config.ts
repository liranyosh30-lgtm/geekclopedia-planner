import { defineConfig } from '@playwright/test';

// בדיקות קצה-לקצה מול האפליקציה הבנויה ומול Supabase אמיתי (ברירת מחדל: הסביבה המקומית).
export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './tests/global-setup.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.APP_URL || 'http://127.0.0.1:4173',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    acceptDownloads: true,
  },
});
