import type { StepContext } from '@bettertest/bdd';

/**
 * Dry-run implementation of StepContext.
 *
 * Logs all actions to console instead of interacting with a real browser.
 * Assertions always pass in dry-run mode. This proves the full pipeline
 * (discover → parse → match → execute → report) works before browser
 * integration is added in Phase 2.
 */
export class DryRunContext implements StepContext {
  private store = new Map<string, unknown>();
  private actionLog: string[] = [];
  private baseUrl: string;

  constructor(baseUrl?: string, verbose = false) {
    this.baseUrl = baseUrl ?? '';
    this.verbose = verbose;
  }

  async navigate(url: string): Promise<void> {
    const resolved = url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    this.log('navigate', resolved);
  }

  async click(selector: string): Promise<void> {
    this.log('click', selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    this.log('fill', `${selector} = "${value}"`);
  }

  async assertVisible(selector: string): Promise<void> {
    this.log('assertVisible', selector);
  }

  async assertText(selector: string, expected: string): Promise<void> {
    this.log('assertText', `${selector} contains "${expected}"`);
  }

  set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  get<T = unknown>(key: string): T {
    return this.store.get(key) as T;
  }

  /** Reset state between scenarios. */
  reset(): void {
    this.store.clear();
    this.actionLog = [];
  }

  /** Get the action log for this scenario (useful for debugging/reporting). */
  getLog(): string[] {
    return [...this.actionLog];
  }

  private verbose: boolean;

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  private log(action: string, detail: string): void {
    const entry = `[${action}] ${detail}`;
    this.actionLog.push(entry);
    if (this.verbose) {
      console.log(`        ${entry}`);
    }
  }
}
