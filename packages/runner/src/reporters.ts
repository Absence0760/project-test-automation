import type { Reporter } from '@bettertest/reporter';
import { ConsoleReporter, HtmlReporter, JsonReporter, JunitReporter } from '@bettertest/reporter';
import type { ReporterConfig } from './config.js';

/**
 * Instantiate Reporter instances from config.
 */
export function createReporters(configs: ReporterConfig[]): Reporter[] {
  return configs.map((config) => {
    switch (config.type) {
      case 'console':
        return new ConsoleReporter();
      case 'json':
        return new JsonReporter(config.outputPath ? { outputPath: config.outputPath } : {});
      case 'html':
        return new HtmlReporter(config.outputPath ? { outputPath: config.outputPath } : {});
      case 'junit':
        return new JunitReporter(config.outputPath ? { outputPath: config.outputPath } : {});
      case 'flakey':
        console.warn('  [warn] Flakey reporter not yet implemented, skipping');
        return new ConsoleReporter(); // fallback
      default:
        throw new Error(`Unknown reporter type: ${config.type}`);
    }
  });
}

/**
 * Call a lifecycle method on all reporters, catching per-reporter errors.
 */
export async function notifyAll<K extends keyof Reporter>(
  reporters: Reporter[],
  method: K,
  data: Parameters<Reporter[K]>[0],
): Promise<void> {
  await Promise.all(
    reporters.map(async (reporter) => {
      try {
        await (reporter[method] as (data: unknown) => void | Promise<void>)(data);
      } catch (err) {
        console.error(`  [warn] Reporter error in ${method}: ${err}`);
      }
    }),
  );
}
