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
      tags: { type: 'string', short: 't' },
      failFast: { type: 'boolean', default: false },
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
    -t, --tags <tags>     Comma-separated tag filter (e.g., @smoke,@auth)
    --failFast            Stop on first failure
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

  if (values.tags) {
    const tags = (values.tags as string).split(',').map((t) => t.trim());
    userConfig.runner = { ...userConfig.runner, tags };
  }

  if (values.failFast) {
    userConfig.runner = { ...userConfig.runner, failFast: true };
  }

  const config = defineConfig(userConfig);

  // Run
  const runner = new TestRunner(config);
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
