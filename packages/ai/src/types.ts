/**
 * Common interface for AI providers (local and cloud).
 */
export interface AiProvider {
  /** Suggest next steps based on current test context. */
  suggestSteps(context: StepSuggestionContext): Promise<StepSuggestion[]>;

  /** Generate a complete test from a natural language description. */
  generateTest(request: TestGenerationRequest): Promise<GeneratedTest>;

  /** Explain why a test is flaky based on execution history. */
  explainFlakiness(history: FlakinessContext): Promise<string>;

  /** Suggest a fix for a broken selector. */
  suggestSelectorFix(context: SelectorFixContext): Promise<string>;
}

export interface StepSuggestionContext {
  /** The feature file content so far. */
  featureContent: string;
  /** The current scenario being written. */
  currentScenario: string;
  /** DOM snapshot of the current page state. */
  domSnapshot?: string;
  /** Previously defined step patterns. */
  existingSteps: string[];
}

export interface StepSuggestion {
  /** The suggested step text. */
  text: string;
  /** Confidence score (0-1). */
  confidence: number;
  /** Explanation of why this step was suggested. */
  reasoning: string;
}

export interface TestGenerationRequest {
  /** Natural language description of the test flow. */
  description: string;
  /** The app's URL or component being tested. */
  target: string;
  /** DOM snapshot for context. */
  domSnapshot?: string;
  /** Existing test patterns to match style. */
  existingTests?: string[];
}

export interface GeneratedTest {
  /** The generated test code. */
  code: string;
  /** Gherkin feature file if BDD mode. */
  feature?: string;
  /** Confidence score. */
  confidence: number;
  /** Warnings or notes. */
  notes: string[];
}

export interface FlakinessContext {
  testName: string;
  /** History of pass/fail results. */
  results: Array<{ passed: boolean; durationMs: number; timestamp: string }>;
  /** Network conditions during each run. */
  networkLogs?: string[];
  /** Step-level timing data. */
  stepTimings?: Array<{ step: string; durationMs: number }[]>;
}

export interface SelectorFixContext {
  /** The original semantic intent. */
  intent: string;
  /** The selector that broke. */
  brokenSelector: string;
  /** DOM before (last passing). */
  domBefore: string;
  /** DOM after (current failing). */
  domAfter: string;
}
