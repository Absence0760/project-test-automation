/**
 * Example Better Test Automation configuration file.
 *
 * Place this at the root of your project as `bettertest.config.ts`.
 */
import { defineConfig } from '@bettertest/runner';

export default defineConfig({
  testDir: 'e2e',
  testMatch: ['**/*.test.ts', '**/*.spec.ts', '**/*.feature'],
  baseUrl: 'http://localhost:3000',

  runner: {
    workers: 'auto',
    failFast: false,
    heal: true,
    timeoutMs: 30_000,
    retries: 1,
    tags: [],
  },

  browser: {
    name: 'chromium',
    useSystemBrowser: true,
    protocol: 'auto',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },

  selectors: {
    minConfidence: 0.7,
    autoHeal: true,
    cachePath: '.bettertest/selector-cache.json',
  },

  reporters: [
    { type: 'console' },
    { type: 'html', outputPath: 'test-results/report.html' },
    { type: 'json', outputPath: 'test-results/report.json' },
    { type: 'junit', outputPath: 'test-results/junit.xml' },
  ],

  ai: {
    provider: 'local',
    model: 'llama3',
    endpoint: 'http://localhost:11434',
  },
});
