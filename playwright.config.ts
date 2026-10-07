import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
export default defineConfig({
  testDir: './tests/e2e', timeout: 45000, expect: { timeout: 10000 }, workers: 2, fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] } },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 30000,
    // Exercise the cloud login without requiring real project credentials.
    // Auth requests in login tests are intercepted; workout tests use the dev preview.
    env: { VITE_BASE_PATH: '/', VITE_SUPABASE_URL: 'https://workout-lab-test.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser_test_fixture' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'tablet-landscape', use: { viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: 'tablet-portrait', use: { viewport: { width: 800, height: 1280 }, hasTouch: true } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
})
