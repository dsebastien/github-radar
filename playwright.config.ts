import { defineConfig, devices } from '@playwright/test'

/**
 * Browser smoke tests against the production build, with api.github.com mocked (see e2e/).
 * They catch what the Bun unit tests cannot: browser-only failures in the real bundle.
 */
export default defineConfig({
    testDir: 'e2e',
    testMatch: '*.e2e.ts',
    forbidOnly: !!process.env['CI'],
    retries: process.env['CI'] ? 1 : 0,
    reporter: process.env['CI'] ? 'github' : 'list',
    use: {
        baseURL: 'http://localhost:4173',
        // The app shell's service worker would sit between the page and the API mocks.
        serviceWorkers: 'block',
        trace: 'retain-on-failure'
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'bun run build && bunx vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: !process.env['CI'],
        timeout: 120_000
    }
})
