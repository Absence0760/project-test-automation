import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ReportData, Reporter, RunStartData, SuiteReport, TestReport } from '../types.js';

/**
 * JUnit XML reporter — compatible with CI systems (Jenkins, GitHub Actions, GitLab CI).
 */
export class JunitReporter implements Reporter {
  private outputPath: string;

  constructor(options: { outputPath?: string } = {}) {
    this.outputPath = options.outputPath ?? 'test-results/junit.xml';
  }

  onRunStart(_data: RunStartData): void {}
  onSuiteStart(_suite: SuiteReport): void {}
  onTestComplete(_result: TestReport): void {}
  onSuiteComplete(_suite: SuiteReport): void {}

  async onRunComplete(data: ReportData): Promise<void> {
    const xml = this.generateXml(data);
    await mkdir(dirname(this.outputPath), { recursive: true });
    await writeFile(this.outputPath, xml, 'utf-8');
    console.log(`  JUnit report written to ${this.outputPath}`);
  }

  private generateXml(data: ReportData): string {
    const { summary } = data;
    const suites = data.suites.map((suite) => this.renderSuite(suite)).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="${summary.total}" failures="${summary.failed}" time="${(summary.durationMs / 1000).toFixed(3)}">
${suites}
</testsuites>`;
  }

  private renderSuite(suite: SuiteReport): string {
    const tests = suite.tests.map((t) => this.renderTest(t)).join('\n');
    const failures = suite.tests.filter((t) => t.status === 'failed').length;

    return `  <testsuite name="${this.escapeXml(suite.name)}" tests="${suite.tests.length}" failures="${failures}" time="${(suite.durationMs / 1000).toFixed(3)}">
${tests}
  </testsuite>`;
  }

  private renderTest(test: TestReport): string {
    const attrs = `name="${this.escapeXml(test.name)}" time="${(test.durationMs / 1000).toFixed(3)}"`;

    if (test.status === 'failed' && test.error) {
      return `    <testcase ${attrs}>
      <failure message="${this.escapeXml(test.error.message)}">${this.escapeXml(test.error.stack ?? '')}</failure>
    </testcase>`;
    }

    if (test.status === 'skipped') {
      return `    <testcase ${attrs}>
      <skipped/>
    </testcase>`;
    }

    return `    <testcase ${attrs}/>`;
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
