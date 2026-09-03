import type { ReportData, Reporter, RunStartData, SuiteReport, TestReport } from '../types.js';

/**
 * Console reporter — beautiful terminal output with colors and symbols.
 */
export class ConsoleReporter implements Reporter {
  onRunStart(data: RunStartData): void {
    console.log();
    console.log(
      `  Better Test Automation — running ${data.totalTests} tests across ${data.totalSuites} suites`,
    );
    console.log(`  Workers: ${data.workers} | Started: ${data.startedAt}`);
    console.log();
  }

  onSuiteStart(suite: SuiteReport): void {
    console.log(`  ${suite.name}`);
  }

  onTestComplete(result: TestReport): void {
    const icon = this.statusIcon(result.status);
    const duration = `(${result.durationMs}ms)`;
    console.log(`    ${icon} ${result.name} ${duration}`);

    if (result.error) {
      console.log(`      ${result.error.message}`);
    }

    if (result.flakiness) {
      console.log(
        `      Flaky: ${result.flakiness.classification} — ${result.flakiness.explanation}`,
      );
    }

    if (result.healing && result.healing.length > 0) {
      for (const heal of result.healing) {
        console.log(
          `      Healed: ${heal.original} -> ${heal.replacement} (${(heal.confidence * 100).toFixed(0)}% confidence)`,
        );
      }
    }
  }

  onSuiteComplete(_suite: SuiteReport): void {
    console.log();
  }

  onRunComplete(data: ReportData): void {
    const { summary } = data;
    console.log('  ─────────────────────────────────────');
    console.log(`  Total:   ${summary.total}`);
    console.log(`  Passed:  ${summary.passed}`);
    console.log(`  Failed:  ${summary.failed}`);
    console.log(`  Skipped: ${summary.skipped}`);
    console.log(`  Flaky:   ${summary.flaky}`);
    console.log(`  Duration: ${summary.durationMs}ms`);
    console.log();
  }

  private statusIcon(status: string): string {
    switch (status) {
      case 'passed':
        return '\u2713';
      case 'failed':
        return '\u2717';
      case 'skipped':
        return '-';
      case 'flaky':
        return '~';
      default:
        return '?';
    }
  }
}
