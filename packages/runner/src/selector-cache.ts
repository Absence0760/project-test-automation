import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Caches selector resolutions between test runs.
 *
 * Maps semantic intent → the CSS selector / strategy that resolved it last time.
 * On next run, the cached selector is tried first before full re-resolution.
 */

export interface CachedResolution {
  /** The strategy that found the element. */
  strategy: string;
  /** A CSS selector that matched the element. */
  cssSelector: string;
  /** When this cache entry was created. */
  timestamp: string;
  /** How many consecutive runs this cache entry has been valid. */
  hitCount: number;
}

export class SelectorCache {
  private cache = new Map<string, CachedResolution>();
  private dirty = false;

  constructor(private filePath: string) {}

  /** Load cache from disk. Safe to call if file doesn't exist. */
  async load(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const data = JSON.parse(raw) as Record<string, CachedResolution>;
      this.cache = new Map(Object.entries(data));
    } catch {
      // File doesn't exist or is invalid — start fresh
      this.cache = new Map();
    }
  }

  /** Save cache to disk if it changed. */
  async save(): Promise<void> {
    if (!this.dirty) return;
    const data: Record<string, CachedResolution> = {};
    for (const [key, value] of this.cache) {
      data[key] = value;
    }
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    this.dirty = false;
  }

  /** Look up a cached resolution for an intent. */
  get(intent: string): CachedResolution | undefined {
    return this.cache.get(intent);
  }

  /** Store a successful resolution. */
  set(intent: string, strategy: string, cssSelector: string): void {
    const existing = this.cache.get(intent);
    this.cache.set(intent, {
      strategy,
      cssSelector,
      timestamp: new Date().toISOString(),
      hitCount: existing && existing.cssSelector === cssSelector ? existing.hitCount + 1 : 1,
    });
    this.dirty = true;
  }

  /** Invalidate a cached resolution (element no longer matches). */
  invalidate(intent: string): void {
    if (this.cache.delete(intent)) {
      this.dirty = true;
    }
  }

  get size(): number {
    return this.cache.size;
  }
}
