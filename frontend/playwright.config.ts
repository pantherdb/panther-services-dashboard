import { defineConfig, devices } from '@playwright/test'

// The real thing: the backend with the sample day loaded, and the frontend's dev server proxying
// /api to it. Ports apart from `npm run dev` (4320) and `services-dashboard serve` (8020), so a
// test run doesn't collide with a working session.
const WEB_PORT = 4330
const API_PORT = 8030
const baseURL = `http://localhost:${WEB_PORT}`

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `uv run --directory ../backend services-dashboard serve --sample --port ${API_PORT}`,
      url: `http://localhost:${API_PORT}/api/v1/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: baseURL,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
