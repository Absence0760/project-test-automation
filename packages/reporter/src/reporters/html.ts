import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ReportData, Reporter, RunStartData, SuiteReport, TestReport } from '../types.js';

/**
 * HTML reporter — generates a self-contained HTML report file.
 */
export class HtmlReporter implements Reporter {
  private outputPath: string;

  constructor(options: { outputPath?: string } = {}) {
    this.outputPath = options.outputPath ?? 'test-results/report.html';
  }

  onRunStart(_data: RunStartData): void {}
  onSuiteStart(_suite: SuiteReport): void {}
  onTestComplete(_result: TestReport): void {}
  onSuiteComplete(_suite: SuiteReport): void {}

  async onRunComplete(data: ReportData): Promise<void> {
    const html = this.generateHtml(data);
    await mkdir(dirname(this.outputPath), { recursive: true });
    await writeFile(this.outputPath, html, 'utf-8');
    console.log(`  HTML report written to ${this.outputPath}`);
  }

  private generateHtml(data: ReportData): string {
    // TODO: Replace with a proper template engine or Svelte SSR
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Better Test Automation Report</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #e0e0e0; padding: 2rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .stat { background: #1a1a1a; padding: 1rem; border-radius: 8px; text-align: center; }
    .stat .value { font-size: 2rem; font-weight: bold; }
    .stat.passed .value { color: #4ade80; }
    .stat.failed .value { color: #f87171; }
    .stat.flaky .value { color: #fbbf24; }
    .suite { margin-bottom: 1.5rem; }
    .suite h2 { font-size: 1.1rem; margin-bottom: 0.5rem; }
    .test { padding: 0.5rem 1rem; border-left: 3px solid #333; margin-bottom: 0.25rem; }
    .test.passed { border-color: #4ade80; }
    .test.failed { border-color: #f87171; }
    .test.flaky { border-color: #fbbf24; }
  </style>
</head>
<body>
  <h1>Better Test Automation Report</h1>
  <p>${data.startedAt} — ${data.summary.durationMs}ms</p>
  <div class="summary">
    <div class="stat passed"><div class="value">${data.summary.passed}</div><div>Passed</div></div>
    <div class="stat failed"><div class="value">${data.summary.failed}</div><div>Failed</div></div>
    <div class="stat flaky"><div class="value">${data.summary.flaky}</div><div>Flaky</div></div>
    <div class="stat"><div class="value">${data.summary.skipped}</div><div>Skipped</div></div>
  </div>
  ${data.suites.map((s) => this.renderSuite(s)).join('\n')}
  <script>const data = ${JSON.stringify(data)};</script>
</body>
</html>`;
  }

  private renderSuite(suite: SuiteReport): string {
    return `<div class="suite">
  <h2>${this.escapeHtml(suite.name)}</h2>
  ${suite.tests.map((t) => `<div class="test ${t.status}">${this.escapeHtml(t.name)} — ${t.durationMs}ms</div>`).join('\n  ')}
</div>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
