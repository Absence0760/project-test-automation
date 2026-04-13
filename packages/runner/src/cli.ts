#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { TestRunner } from './runner.js';
import { defineConfig, type BetterTestConfig } from './config.js';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', short: 'c' },
      testDir: { type: 'string' },
      'base-url': { type: 'string' },
      tags: { type: 'string', short: 't' },
      failFast: { type: 'boolean', default: false },
      retries: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      headed: { type: 'boolean', default: false },
      headless: { type: 'boolean', default: false },
      slow: { type: 'string' },
      'keep-open': { type: 'boolean', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
      help: { type: 'boolean', short: 'h' },
    },
    strict: false,
  });

  if (values.help) {
    console.log(`
  Better Test Automation — test runner

  Usage: bettertest-run [options]

  Options:
    -c, --config <path>   Config file (default: bettertest.config.ts)
    --testDir <path>      Override test directory
    --base-url <url>      Override base URL (e.g., http://localhost:3000)
    -t, --tags <tags>     Comma-separated tag filter (e.g., @smoke,@auth)
    --failFast            Stop on first failure
    --retries <n>         Retry failed tests up to N times (flaky detection)
    --slow <ms>           Pause between steps (e.g., --slow 1000 for 1s)
    --keep-open           Keep browser open after tests finish
    --dry-run             Run without a browser (log actions only)
    --headed              Run with a visible browser window
    --headless            Run browser in headless mode (default)
    -v, --verbose         Show each action the context performs
    -h, --help            Show this help
`);
    return;
  }

  // Load config
  let userConfig: Partial<BetterTestConfig> = {};
  const configPath = findConfig(values.config as string | undefined);

  if (configPath) {
    try {
      const mod = await import(pathToFileURL(configPath).href);
      userConfig = mod.default ?? mod;
    } catch (err) {
      console.error(`Failed to load config: ${configPath}`);
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 2;
      return;
    }
  }

  // Apply CLI overrides
  if (values.testDir) {
    userConfig.testDir = values.testDir as string;
  }

  if (values['base-url']) {
    userConfig.baseUrl = values['base-url'] as string;
  }

  if (values.tags) {
    const tags = (values.tags as string).split(',').map((t) => t.trim());
    userConfig.runner = { ...userConfig.runner, tags };
  }

  if (values.failFast) {
    userConfig.runner = { ...userConfig.runner, failFast: true };
  }

  if (values.retries) {
    userConfig.runner = { ...userConfig.runner, retries: Number(values.retries) };
  }

  // headed = visible browser, headless = invisible browser
  if (values.headed) {
    userConfig.browser = { ...userConfig.browser, headless: false } as BetterTestConfig['browser'];
  }
  if (values.headless) {
    userConfig.browser = { ...userConfig.browser, headless: true } as BetterTestConfig['browser'];
  }

  const config = defineConfig(userConfig);

  // Run
  const runner = new TestRunner(config, {
    verbose: !!values.verbose,
    dryRun: !!values['dry-run'],
    slowMs: values.slow ? Number(values.slow) : 0,
    keepOpen: !!values['keep-open'],
  });
  const results = await runner.run();

  const failures = results.filter((r) => r.status === 'failed').length;
  process.exitCode = failures > 0 ? 1 : 0;
}

function findConfig(explicit?: string): string | null {
  if (explicit) {
    const resolved = resolve(process.cwd(), explicit);
    if (existsSync(resolved)) return resolved;
    console.error(`Config not found: ${explicit}`);
    process.exitCode = 2;
    return null;
  }

  const candidates = [
    'bettertest.config.ts',
    'bettertest.config.js',
    'bettertest.config.mjs',
  ];

  for (const name of candidates) {
    const path = resolve(process.cwd(), name);
    if (existsSync(path)) return path;
  }

  return null; // Use defaults
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 2;
});
