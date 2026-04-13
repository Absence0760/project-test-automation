/**
 * Reporter plugin interface.
 *
 * Implement this to create custom reporters.
 * Built-in reporters (HTML, JSON, JUnit, Console) all use this interface.
 */
export interface Reporter {
  /** Called when the test run starts. */
  onRunStart(data: RunStartData): void | Promise<void>;

  /** Called when a test suite starts. */
  onSuiteStart(suite: SuiteReport): void | Promise<void>;

  /** Called when a single test completes. */
  onTestComplete(result: TestReport): void | Promise<void>;

  /** Called when a test suite completes. */
  onSuiteComplete(suite: SuiteReport): void | Promise<void>;

  /** Called when the entire run completes. Finalize output here. */
  onRunComplete(data: ReportData): void | Promise<void>;
}

export interface RunStartData {
  startedAt: string;
  totalSuites: number;
  totalTests: number;
  workers: number;
  config: Record<string, unknown>;
}

export interface ReportData {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  suites: SuiteReport[];
  summary: RunSummary;
}

export interface RunSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  durationMs: number;
}

export interface SuiteReport {
  name: string;
  filePath: string;
  tests: TestReport[];
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
}

export interface TestReport {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'flaky';
  durationMs: number;
  steps: StepReport[];
  error?: {
    message: string;
    stack?: string;
    screenshot?: string;
  };
  flakiness?: {
    classification: string;
    explanation: string;
    suggestedFix?: string;
  };
  healing?: {
    original: string;
    replacement: string;
    confidence: number;
  }[];
}

export interface StepReport {
  description: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
}
