export interface TestSuite {
  name: string;
  filePath: string;
  tests: TestCase[];
  tags: string[];
  /** Setup function run before all tests in the suite. */
  beforeAll?: () => Promise<void>;
  /** Teardown function run after all tests in the suite. */
  afterAll?: () => Promise<void>;
}

export interface TestCase {
  id: string;
  name: string;
  steps: TestStep[];
  tags: string[];
  /** Test IDs this test depends on (must complete first). */
  dependsOn: string[];
  /** Estimated duration from previous runs, used for smart ordering. */
  estimatedDurationMs?: number;
  /** Probability of failure (0-1), used for fail-fast ordering. */
  failureProbability?: number;
}

export interface TestStep {
  /** Human-readable description: "click the submit button" */
  description: string;
  /** The action to perform. */
  action: StepAction;
  /** Optional semantic selector. */
  selector?: string;
  /** Timeout for this step in milliseconds. */
  timeoutMs?: number;
}

export type StepAction =
  | { type: 'click'; selector: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'navigate'; url: string }
  | { type: 'assert'; condition: AssertCondition }
  | { type: 'wait'; condition: WaitCondition }
  | { type: 'semantic'; intent: string };

export interface AssertCondition {
  type: 'visible' | 'hidden' | 'text' | 'value' | 'url' | 'count';
  selector?: string;
  expected?: string | number;
}

export interface WaitCondition {
  type: 'selector' | 'navigation' | 'network' | 'timeout';
  value: string | number;
}

export interface TestResult {
  suiteId: string;
  testId: string;
  status: TestStatus;
  durationMs: number;
  steps: StepResult[];
  error?: TestError;
  /** Flakiness metadata if the test was detected as flaky. */
  flakiness?: FlakinessReport;
}

export type TestStatus = 'passed' | 'failed' | 'skipped' | 'flaky';

export interface StepResult {
  description: string;
  status: TestStatus;
  durationMs: number;
  selectorUsed?: string;
  /** If the selector was healed, this contains the healing details. */
  healed?: {
    original: string;
    replacement: string;
    confidence: number;
  };
}

export interface TestError {
  message: string;
  stack?: string;
  screenshot?: string;
}

export interface FlakinessReport {
  classification:
    | 'race_condition'
    | 'animation_timing'
    | 'network_timing'
    | 'data_dependency'
    | 'environment'
    | 'unknown';
  explanation: string;
  suggestedFix?: string;
}

export interface RunnerOptions {
  /** Maximum parallel workers. 'auto' uses CPU count. */
  workers: number | 'auto';
  /** Stop on first failure. */
  failFast: boolean;
  /** Enable self-healing mode. */
  heal: boolean;
  /** Filter by tags. */
  tags: string[];
  /** Filter by name pattern. */
  grep?: RegExp;
  /** Test timeout in milliseconds. */
  timeoutMs: number;
  /** Retry flaky tests up to N times. */
  retries: number;
}
