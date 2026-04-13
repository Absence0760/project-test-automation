import type { RunnerOptions } from './types.js';

export interface BetterTestConfig {
  /** Root directory for test files. */
  testDir: string;

  /** File patterns to match test files. */
  testMatch: string[];

  /** Base URL for the application under test. */
  baseUrl?: string;

  /** Runner options. */
  runner: Partial<RunnerOptions>;

  /** Reporter configuration. */
  reporters: ReporterConfig[];

  /** Browser configuration. */
  browser: BrowserConfig;

  /** Semantic selector configuration. */
  selectors: SelectorConfig;

  /** AI configuration. */
  ai?: AiConfig;
}

export interface ReporterConfig {
  type: 'html' | 'json' | 'junit' | 'console' | 'flakey';
  outputPath?: string;
  options?: Record<string, unknown>;
}

export interface BrowserConfig {
  /** Browser to use. */
  name: 'chromium' | 'firefox' | 'webkit';
  /** Use system browser instead of bundled. */
  useSystemBrowser: boolean;
  /** Protocol preference. */
  protocol: 'bidi' | 'cdp' | 'auto';
  /** Launch options. */
  headless: boolean;
  /** Viewport size. */
  viewport: { width: number; height: number };
}

export interface SelectorConfig {
  /** Minimum confidence threshold for semantic resolution. */
  minConfidence: number;
  /** Enable automatic self-healing. */
  autoHeal: boolean;
  /** Path to the selector cache file. */
  cachePath: string;
}

export interface AiConfig {
  /** AI provider. */
  provider: 'local' | 'cloud';
  /** Model name for local provider (e.g., 'llama3'). */
  model?: string;
  /** Ollama endpoint for local provider. */
  endpoint?: string;
  /** API key for cloud provider. */
  apiKey?: string;
}

const defaults: BetterTestConfig = {
  testDir: 'tests',
  testMatch: ['**/*.test.ts', '**/*.spec.ts', '**/*.feature'],
  runner: {
    workers: 'auto',
    failFast: false,
    heal: false,
    tags: [],
    timeoutMs: 30_000,
    retries: 0,
  },
  reporters: [{ type: 'console' }],
  browser: {
    name: 'chromium',
    useSystemBrowser: true,
    protocol: 'auto',
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
  selectors: {
    minConfidence: 0.7,
    autoHeal: false,
    cachePath: '.bettertest/selector-cache.json',
  },
};

/**
 * Define a Better Test Automation configuration with sensible defaults.
 *
 * ```ts
 * // bettertest.config.ts
 * import { defineConfig } from '@bettertest/runner';
 *
 * export default defineConfig({
 *   testDir: 'e2e',
 *   baseUrl: 'http://localhost:3000',
 *   browser: { name: 'chromium', headless: true },
 * });
 * ```
 */
export function defineConfig(config: Partial<BetterTestConfig>): BetterTestConfig {
  return {
    ...defaults,
    ...config,
    runner: { ...defaults.runner, ...config.runner },
    browser: { ...defaults.browser, ...config.browser },
    selectors: { ...defaults.selectors, ...config.selectors },
    reporters: config.reporters ?? defaults.reporters,
  };
}
