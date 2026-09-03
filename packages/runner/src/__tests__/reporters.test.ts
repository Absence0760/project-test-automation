import { describe, it, expect, vi } from 'vitest';
import { createReporters } from '../reporters.js';
import type { ReporterConfig } from '../config.js';

describe('createReporters', () => {
  it('creates a console reporter', () => {
    const reporters = createReporters([{ type: 'console' }]);
    expect(reporters).toHaveLength(1);
    expect(reporters[0]).toBeDefined();
  });

  it('creates a json reporter', () => {
    const reporters = createReporters([{ type: 'json', outputPath: 'out.json' }]);
    expect(reporters).toHaveLength(1);
  });

  it('creates an html reporter', () => {
    const reporters = createReporters([{ type: 'html', outputPath: 'out.html' }]);
    expect(reporters).toHaveLength(1);
  });

  it('creates a junit reporter', () => {
    const reporters = createReporters([{ type: 'junit', outputPath: 'out.xml' }]);
    expect(reporters).toHaveLength(1);
  });

  it('creates multiple reporters at once', () => {
    const configs: ReporterConfig[] = [
      { type: 'console' },
      { type: 'json', outputPath: 'out.json' },
      { type: 'junit', outputPath: 'out.xml' },
    ];
    const reporters = createReporters(configs);
    expect(reporters).toHaveLength(3);
  });

  it('handles flakey type with warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reporters = createReporters([{ type: 'flakey' }]);
    expect(reporters).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not yet implemented'));
    warn.mockRestore();
  });

  it('throws on unknown reporter type', () => {
    expect(() => createReporters([{ type: 'unknown' as 'console' }])).toThrow(
      'Unknown reporter type',
    );
  });

  it('handles empty config array', () => {
    const reporters = createReporters([]);
    expect(reporters).toHaveLength(0);
  });

  it('creates json reporter without explicit outputPath', () => {
    const reporters = createReporters([{ type: 'json' }]);
    expect(reporters).toHaveLength(1);
  });
});
