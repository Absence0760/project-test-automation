import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ReportData, Reporter, RunStartData, SuiteReport, TestReport } from '../types.js';

/**
 * JSON reporter — outputs structured JSON for CI/CD pipelines and Flakey integration.
 */
export class JsonReporter implements Reporter {
  private outputPath: string;

  constructor(options: { outputPath?: string } = {}) {
    this.outputPath = options.outputPath ?? 'test-results/report.json';
  }

  onRunStart(_data: RunStartData): void {}
  onSuiteStart(_suite: SuiteReport): void {}
  onTestComplete(_result: TestReport): void {}
  onSuiteComplete(_suite: SuiteReport): void {}

  async onRunComplete(data: ReportData): Promise<void> {
    await mkdir(dirname(this.outputPath), { recursive: true });
    await writeFile(this.outputPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`  JSON report written to ${this.outputPath}`);
  }
}
