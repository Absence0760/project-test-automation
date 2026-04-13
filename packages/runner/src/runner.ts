import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import { GherkinParser, getGlobalRegistry } from '@bettertest/bdd';
import type { Feature, Scenario, Step } from '@bettertest/bdd';
import type { StepRegistry } from '@bettertest/bdd';
import type {
  Reporter,
  ReportData,
  RunStartData,
  SuiteReport,
  TestReport,
  RunSummary,
} from '@bettertest/reporter';
import type { BetterTestConfig } from './config.js';
import type {
  RunnerOptions,
  TestResult,
  TestSuite,
  TestCase,
  TestStep,
  StepResult,
  TestError,
  TestStatus,
} from './types.js';
import { DryRunContext } from './context.js';
import { BrowserContext } from './browser.js';
import { launchBrowser, type LaunchResult } from './launcher.js';
import { createReporters, notifyAll } from './reporters.js';
import { SelectorCache } from './selector-cache.js';

/**
 * The main test runner.
 *
 * Orchestrates test discovery, step matching, execution, and reporting.
 */
export class TestRunner {
  private config: BetterTestConfig;
  private options: RunnerOptions;
  private parser = new GherkinParser();
  private importedStepFiles = new Set<string>();
  private verbose: boolean;

  private dryRun: boolean;

  constructor(config: BetterTestConfig, runtimeOpts?: { verbose?: boolean; dryRun?: boolean }) {
    this.verbose = runtimeOpts?.verbose ?? false;
    this.dryRun = runtimeOpts?.dryRun ?? false;
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
   * Discover test files, parse features, load step definitions.
   */
  async discover(): Promise<TestSuite[]> {
    const testDir = resolve(process.cwd(), this.config.testDir);

    // 1. Find .feature files
    const featureFiles = await this.globFiles(testDir, '**/*.feature');
    if (featureFiles.length === 0) {
      console.log(`  No .feature files found in ${testDir}`);
      return [];
    }

    // 2. Find and import step definition files (triggers Given/When/Then registration)
    const stepFiles = await this.globFiles(testDir, '**/*.steps.{ts,js,mts,mjs}');
    for (const stepFile of stepFiles) {
      await this.importStepFile(stepFile);
    }

    // 3. Parse feature files into TestSuites
    const suites: TestSuite[] = [];
    for (const filePath of featureFiles) {
      const source = await readFile(filePath, 'utf-8');
      const feature = this.parser.parse(source, filePath);
      suites.push(this.featureToSuite(feature));
    }

    // 4. Apply tag filtering
    return this.filterByTags(suites);
  }

  /**
   * Run all discovered test suites.
   */
  async run(suites?: TestSuite[]): Promise<TestResult[]> {
    const discovered = suites ?? (await this.discover());
    const totalTests = discovered.reduce((n, s) => n + s.tests.length, 0);

    if (totalTests === 0) {
      console.log('  No tests to run.');
      return [];
    }

    // Set up reporters
    const reporters = createReporters(this.config.reporters);

    const runStartedAt = new Date().toISOString();
    const runStart = performance.now();

    await notifyAll(reporters, 'onRunStart', {
      startedAt: runStartedAt,
      totalSuites: discovered.length,
      totalTests,
      workers: this.resolveWorkerCount(),
      config: { testDir: this.config.testDir, baseUrl: this.config.baseUrl },
    } satisfies RunStartData);

    // Execute
    const registry = getGlobalRegistry();
    let launch: LaunchResult | null = null;
    let ctx: DryRunContext | BrowserContext;

    let selectorCache: SelectorCache | undefined;

    if (this.dryRun) {
      ctx = new DryRunContext(this.config.baseUrl, this.verbose);
    } else {
      launch = await launchBrowser(this.config.browser);
      selectorCache = new SelectorCache(resolve(process.cwd(), this.config.selectors.cachePath));
      await selectorCache.load();
      ctx = new BrowserContext(launch.page, this.config.baseUrl, this.verbose, selectorCache);
    }

    const allResults: TestResult[] = [];
    const suiteReports: SuiteReport[] = [];
    let aborted = false;

    try {
    for (const suite of discovered) {
      if (aborted) break;

      const suiteReport: SuiteReport = {
        name: suite.name,
        filePath: suite.filePath,
        tests: [],
        status: 'passed',
        durationMs: 0,
      };

      await notifyAll(reporters, 'onSuiteStart', suiteReport);
      const suiteStart = performance.now();

      for (const testCase of suite.tests) {
        if (aborted) break;

        ctx.reset();
        let result = await this.executeTest(testCase, suite.name, registry, ctx);

        // Retry logic: if test failed and retries are configured, re-run
        if (result.status === 'failed' && this.options.retries > 0) {
          for (let retry = 1; retry <= this.options.retries; retry++) {
            ctx.reset();
            const retryResult = await this.executeTest(testCase, suite.name, registry, ctx);
            if (retryResult.status === 'passed') {
              // Passed on retry — mark as flaky
              result = {
                ...retryResult,
                status: 'flaky',
                flakiness: {
                  classification: 'unknown',
                  explanation: `Passed on retry ${retry} of ${this.options.retries} (failed on first attempt)`,
                },
              };
              break;
            }
            result = retryResult;
          }
        }

        allResults.push(result);

        const testReport: TestReport = {
          id: result.testId,
          name: testCase.name,
          status: result.status,
          durationMs: result.durationMs,
          steps: result.steps.map((s) => ({
            description: s.description,
            status: s.status as 'passed' | 'failed' | 'skipped',
            durationMs: s.durationMs,
          })),
          ...(result.error && {
            error: {
              message: result.error.message,
              ...(result.error.stack && { stack: result.error.stack }),
            },
          }),
        };

        suiteReport.tests.push(testReport);
        await notifyAll(reporters, 'onTestComplete', testReport);

        if (result.status === 'failed' && this.options.failFast) {
          aborted = true;
        }
      }

      suiteReport.durationMs = performance.now() - suiteStart;
      suiteReport.status = suiteReport.tests.some((t) => t.status === 'failed')
        ? 'failed'
        : 'passed';

      suiteReports.push(suiteReport);
      await notifyAll(reporters, 'onSuiteComplete', suiteReport);
    }

    // Summary
    const runDuration = performance.now() - runStart;
    const summary: RunSummary = {
      total: allResults.length,
      passed: allResults.filter((r) => r.status === 'passed').length,
      failed: allResults.filter((r) => r.status === 'failed').length,
      skipped: allResults.filter((r) => r.status === 'skipped').length,
      flaky: allResults.filter((r) => r.status === 'flaky').length,
      durationMs: runDuration,
    };

    const reportData: ReportData = {
      startedAt: runStartedAt,
      completedAt: new Date().toISOString(),
      durationMs: runDuration,
      suites: suiteReports,
      summary,
    };

    await notifyAll(reporters, 'onRunComplete', reportData);

    return allResults;

    } finally {
      if (selectorCache) {
        await selectorCache.save();
      }
      if (launch) {
        await launch.close();
      }
    }
  }

  // ─── Private: Test Execution ────────────────────────────────

  private async executeTest(
    testCase: TestCase,
    suiteName: string,
    registry: StepRegistry,
    ctx: DryRunContext | BrowserContext,
  ): Promise<TestResult> {
    const stepResults: StepResult[] = [];
    let testStatus: TestStatus = 'passed';
    let testError: TestError | undefined;
    const testStart = performance.now();

    for (const step of testCase.steps) {
      const stepStart = performance.now();

      // Strip keyword prefix ("Given ", "When ", etc.) to get raw text for matching
      const rawText = step.description.replace(/^(Given|When|Then|And|But)\s+/, '');
      const match = registry.find(rawText);

      if (!match) {
        stepResults.push({
          description: step.description,
          status: 'failed',
          durationMs: performance.now() - stepStart,
        });
        testStatus = 'failed';
        testError = {
          message: `Step not defined: "${rawText}"`,
          stack: `No step definition matches "${rawText}".\nRegister it with: Given('${rawText}', async (ctx) => { ... })`,
        };
        break;
      }

      try {
        const timeoutMs = step.timeoutMs ?? this.options.timeoutMs;
        let timer: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Step timed out after ${timeoutMs}ms`)),
            timeoutMs,
          );
        });

        try {
          await Promise.race([
            match.definition.handler(ctx, ...match.args),
            timeoutPromise,
          ]);
        } finally {
          clearTimeout(timer!);
        }

        stepResults.push({
          description: step.description,
          status: 'passed',
          durationMs: performance.now() - stepStart,
        });
      } catch (error) {
        stepResults.push({
          description: step.description,
          status: 'failed',
          durationMs: performance.now() - stepStart,
        });
        testStatus = 'failed';
        // Screenshot on failure (browser mode only)
        let screenshot: string | undefined;
        if (ctx instanceof BrowserContext) {
          screenshot = await ctx.screenshot(testCase.id);
        }
        testError = {
          message: error instanceof Error ? error.message : String(error),
          ...(error instanceof Error && error.stack && { stack: error.stack }),
          ...(screenshot && { screenshot }),
        };
        break;
      }
    }

    // Mark remaining steps as skipped
    for (let i = stepResults.length; i < testCase.steps.length; i++) {
      stepResults.push({
        description: testCase.steps[i]!.description,
        status: 'skipped',
        durationMs: 0,
      });
    }

    return {
      suiteId: suiteName,
      testId: testCase.id,
      status: testStatus,
      durationMs: performance.now() - testStart,
      steps: stepResults,
      ...(testError && { error: testError }),
    };
  }

  // ─── Private: Discovery Helpers ─────────────────────────────

  private featureToSuite(feature: Feature): TestSuite {
    const tests: TestCase[] = [];
    for (const scenario of feature.scenarios) {
      if (scenario.examples && scenario.examples.length > 0) {
        // Scenario Outline — expand into one TestCase per Examples row
        tests.push(...this.expandScenarioOutline(scenario, feature));
      } else {
        tests.push(this.scenarioToTestCase(scenario, feature));
      }
    }
    return {
      name: feature.name,
      filePath: feature.filePath,
      tags: feature.tags,
      tests,
    };
  }

  /**
   * Expand a Scenario Outline with Examples into concrete TestCases.
   * Each row in the Examples table produces one TestCase, with <placeholders>
   * in step text replaced by the row's values.
   */
  private expandScenarioOutline(scenario: Scenario, feature: Feature): TestCase[] {
    const cases: TestCase[] = [];

    for (const table of scenario.examples!) {
      for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
        const row = table.rows[rowIdx]!;
        const substitutions = new Map<string, string>();
        for (let colIdx = 0; colIdx < table.headers.length; colIdx++) {
          substitutions.set(table.headers[colIdx]!, row[colIdx]!);
        }

        // Build a concrete scenario with placeholders replaced
        const backgroundSteps: Step[] = feature.background?.steps ?? [];
        const expandedSteps = [...backgroundSteps, ...scenario.steps].map((step) => ({
          ...step,
          text: this.substitutePlaceholders(step.text, substitutions),
        }));

        const rowLabel = row.join(', ');
        cases.push({
          id: `${feature.filePath}::${scenario.name} [${rowLabel}]`,
          name: `${scenario.name} (${rowLabel})`,
          tags: scenario.tags,
          dependsOn: [],
          steps: expandedSteps.map((step) => this.stepToTestStep(step)),
        });
      }
    }

    return cases;
  }

  private substitutePlaceholders(text: string, subs: Map<string, string>): string {
    return text.replace(/<(\w+)>/g, (_match, key: string) => subs.get(key) ?? `<${key}>`);
  }

  private scenarioToTestCase(scenario: Scenario, feature: Feature): TestCase {
    // Prepend background steps if present
    const backgroundSteps: Step[] = feature.background?.steps ?? [];
    const allSteps = [...backgroundSteps, ...scenario.steps];

    return {
      id: `${feature.filePath}::${scenario.name}`,
      name: scenario.name,
      tags: scenario.tags,
      dependsOn: [],
      steps: allSteps.map((step) => this.stepToTestStep(step)),
    };
  }

  private stepToTestStep(step: Step): TestStep {
    return {
      description: `${step.keyword} ${step.text}`,
      action: { type: 'semantic', intent: step.text },
      timeoutMs: this.options.timeoutMs,
    };
  }

  private filterByTags(suites: TestSuite[]): TestSuite[] {
    if (this.options.tags.length === 0) return suites;

    const tagSet = new Set(this.options.tags);

    return suites
      .map((suite) => ({
        ...suite,
        tests: suite.tests.filter((test) => {
          const allTags = [...suite.tags, ...test.tags];
          return allTags.some((tag) => tagSet.has(tag));
        }),
      }))
      .filter((suite) => suite.tests.length > 0);
  }

  private async globFiles(dir: string, pattern: string): Promise<string[]> {
    // Convert simple glob pattern to regex
    const regexStr = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*\//g, '(.*/)?') // **/ matches zero or more directories
      .replace(/\*/g, '[^/]*')
      .replace(/\{([^}]+)\}/g, (_m, g: string) => `(${g.replace(/,/g, '|')})`);
    const regex = new RegExp(`^${regexStr}$`);

    const entries = await readdir(dir, { recursive: true });
    return entries
      .filter((entry) => regex.test(entry))
      .map((entry) => resolve(dir, entry));
  }

  private async importStepFile(filePath: string): Promise<void> {
    if (this.importedStepFiles.has(filePath)) return;
    this.importedStepFiles.add(filePath);

    try {
      await import(pathToFileURL(filePath).href);
    } catch (err) {
      console.error(`  [warn] Failed to import step file: ${filePath}`);
      console.error(`         ${err instanceof Error ? err.message : err}`);
    }
  }

  private resolveWorkerCount(): number {
    if (this.options.workers === 'auto') {
      return Math.max(1, cpus().length - 1);
    }
    return this.options.workers;
  }
}
