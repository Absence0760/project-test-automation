import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsoleReporter } from '../reporters/console.js';
import { JsonReporter } from '../reporters/json.js';
import { JunitReporter } from '../reporters/junit.js';
import { HtmlReporter } from '../reporters/html.js';
import type { ReportData, RunStartData, SuiteReport, TestReport } from '../types.js';
import * as fs from 'node:fs/promises';

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

const mockRunStart: RunStartData = {
  startedAt: '2026-04-13T12:00:00Z',
  totalSuites: 2,
  totalTests: 5,
  workers: 4,
  config: {},
};

const mockTestReport: TestReport = {
  id: 'test-1',
  name: 'Login test',
  status: 'passed',
  durationMs: 1200,
  steps: [
    { description: 'navigate to /login', status: 'passed', durationMs: 200 },
    { description: 'fill email', status: 'passed', durationMs: 50 },
  ],
};

const mockSuiteReport: SuiteReport = {
  name: 'Auth Suite',
  filePath: 'tests/auth.feature',
  tests: [mockTestReport],
  status: 'passed',
  durationMs: 1500,
};

const mockReportData: ReportData = {
  startedAt: '2026-04-13T12:00:00Z',
  completedAt: '2026-04-13T12:00:05Z',
  durationMs: 5000,
  suites: [mockSuiteReport],
  summary: {
    total: 5,
    passed: 4,
    failed: 1,
    skipped: 0,
    flaky: 0,
    durationMs: 5000,
  },
};

describe('ConsoleReporter', () => {
  let reporter: ConsoleReporter;

  beforeEach(() => {
    reporter = new ConsoleReporter();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('implements all Reporter methods', () => {
    expect(typeof reporter.onRunStart).toBe('function');
    expect(typeof reporter.onSuiteStart).toBe('function');
    expect(typeof reporter.onTestComplete).toBe('function');
    expect(typeof reporter.onSuiteComplete).toBe('function');
    expect(typeof reporter.onRunComplete).toBe('function');
  });

  it('logs run start info', () => {
    reporter.onRunStart(mockRunStart);
    expect(console.log).toHaveBeenCalled();
  });

  it('logs test results with status icons', () => {
    reporter.onTestComplete(mockTestReport);
    expect(console.log).toHaveBeenCalled();
  });

  it('logs summary on run complete', () => {
    reporter.onRunComplete(mockReportData);
    expect(console.log).toHaveBeenCalled();
  });
});

describe('JsonReporter', () => {
  beforeEach(() => {
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.mkdir).mockClear();
  });

  it('writes JSON file on run complete', async () => {
    const reporter = new JsonReporter({ outputPath: 'out/report.json' });
    await reporter.onRunComplete(mockReportData);

    expect(fs.mkdir).toHaveBeenCalledWith('out', { recursive: true });
    expect(fs.writeFile).toHaveBeenCalledWith('out/report.json', expect.any(String), 'utf-8');

    const writtenJson = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
    const parsed = JSON.parse(writtenJson);
    expect(parsed.summary.total).toBe(5);
  });
});

describe('JunitReporter', () => {
  beforeEach(() => {
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.mkdir).mockClear();
  });

  it('writes JUnit XML on run complete', async () => {
    const reporter = new JunitReporter({ outputPath: 'out/junit.xml' });
    await reporter.onRunComplete(mockReportData);

    expect(fs.writeFile).toHaveBeenCalled();
    const xml = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
    expect(xml).toContain('<?xml');
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('tests="5"');
    expect(xml).toContain('failures="1"');
  });
});

describe('HtmlReporter', () => {
  beforeEach(() => {
    vi.mocked(fs.writeFile).mockClear();
    vi.mocked(fs.mkdir).mockClear();
  });

  it('writes HTML file on run complete', async () => {
    const reporter = new HtmlReporter({ outputPath: 'out/report.html' });
    await reporter.onRunComplete(mockReportData);

    expect(fs.writeFile).toHaveBeenCalled();
    const html = vi.mocked(fs.writeFile).mock.calls[0]![1] as string;
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Better Test Automation Report');
    expect(html).toContain('Auth Suite');
  });
});
