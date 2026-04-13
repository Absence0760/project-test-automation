import type { BetterTestConfig } from './config.js';
import type { RunnerOptions, TestResult, TestSuite } from './types.js';
import { cpus } from 'node:os';

/**
 * The main test runner.
 *
 * Orchestrates test discovery, builds the execution graph,
 * runs tests with optimal parallelism, and collects results.
 */
export class TestRunner {
  private config: BetterTestConfig;
  private options: RunnerOptions;

  constructor(config: BetterTestConfig) {
    this.config = config;
    this.options = {
      workers: config.runner.workers ?? 'auto',
      failFast: config.runner.failFast ?? false,
      heal: config.runner.heal ?? false,
      tags: config.runner.tags ?? [],
      timeoutMs: config.runner.timeoutMs ?? 30_000,
      retries: config.runner.retries ?? 0,
    };
  }

  /**
   * Discover test files matching the configured patterns.
   */
  async discover(): Promise<TestSuite[]> {
    // TODO: Implement test discovery
    // 1. Glob for test files matching testMatch patterns
    // 2. Parse each file to extract test suites
    // 3. Handle .feature files via the BDD engine
    // 4. Build dependency graph from test metadata
    console.log(`Discovering tests in ${this.config.testDir}...`);
    return [];
  }

  /**
   * Run all discovered test suites.
   */
  async run(suites?: TestSuite[]): Promise<TestResult[]> {
    const discovered = suites ?? (await this.discover());
    const workerCount = this.resolveWorkerCount();

    console.log(
      `Running ${discovered.length} suites with ${workerCount} workers`,
    );

    // TODO: Implement execution
    // 1. Build execution graph from suites + dependencies
    // 2. Sort by failure probability (fail-fast heuristics)
    // 3. Run ready nodes in parallel up to workerCount
    // 4. Collect results, trigger self-healing on selector failures
    // 5. Retry flaky tests up to this.options.retries times
    // 6. Report results via configured reporters

    return [];
  }

  private resolveWorkerCount(): number {
    if (this.options.workers === 'auto') {
      return Math.max(1, cpus().length - 1);
    }
    return this.options.workers;
  }
}
