import { describe, it, expect } from 'vitest';
import { defineConfig } from '../config.js';

describe('defineConfig', () => {
  it('returns full config with defaults when called empty', () => {
    const config = defineConfig({});

    expect(config.testDir).toBe('tests');
    expect(config.testMatch).toEqual(['**/*.test.ts', '**/*.spec.ts', '**/*.feature']);
    expect(config.browser.name).toBe('chromium');
    expect(config.browser.headless).toBe(true);
    expect(config.browser.useSystemBrowser).toBe(true);
    expect(config.browser.protocol).toBe('auto');
    expect(config.selectors.minConfidence).toBe(0.7);
    expect(config.selectors.autoHeal).toBe(false);
    expect(config.runner.workers).toBe('auto');
    expect(config.runner.failFast).toBe(false);
    expect(config.runner.timeoutMs).toBe(30_000);
    expect(config.runner.retries).toBe(0);
    expect(config.reporters).toEqual([{ type: 'console' }]);
  });

  it('overrides top-level fields', () => {
    const config = defineConfig({
      testDir: 'e2e',
      baseUrl: 'http://localhost:3000',
    });

    expect(config.testDir).toBe('e2e');
    expect(config.baseUrl).toBe('http://localhost:3000');
  });

  it('deep-merges runner options', () => {
    const config = defineConfig({
      runner: { failFast: true, retries: 2 },
    });

    expect(config.runner.failFast).toBe(true);
    expect(config.runner.retries).toBe(2);
    // Defaults are preserved
    expect(config.runner.workers).toBe('auto');
    expect(config.runner.timeoutMs).toBe(30_000);
  });

  it('deep-merges browser options', () => {
    const config = defineConfig({
      browser: { name: 'firefox', headless: false },
    });

    expect(config.browser.name).toBe('firefox');
    expect(config.browser.headless).toBe(false);
    // Defaults preserved
    expect(config.browser.useSystemBrowser).toBe(true);
    expect(config.browser.viewport).toEqual({ width: 1280, height: 720 });
  });

  it('deep-merges selector options', () => {
    const config = defineConfig({
      selectors: { autoHeal: true, minConfidence: 0.9 },
    });

    expect(config.selectors.autoHeal).toBe(true);
    expect(config.selectors.minConfidence).toBe(0.9);
    expect(config.selectors.cachePath).toBe('.bettertest/selector-cache.json');
  });

  it('replaces reporters entirely when provided', () => {
    const config = defineConfig({
      reporters: [
        { type: 'html', outputPath: 'report.html' },
        { type: 'junit', outputPath: 'junit.xml' },
      ],
    });

    expect(config.reporters).toHaveLength(2);
    expect(config.reporters[0]!.type).toBe('html');
    expect(config.reporters[1]!.type).toBe('junit');
  });

  it('keeps default reporters when not provided', () => {
    const config = defineConfig({});
    expect(config.reporters).toEqual([{ type: 'console' }]);
  });

  it('accepts ai configuration', () => {
    const config = defineConfig({
      ai: { provider: 'local', model: 'llama3' },
    });

    expect(config.ai).toBeDefined();
    expect(config.ai!.provider).toBe('local');
    expect(config.ai!.model).toBe('llama3');
  });
});
