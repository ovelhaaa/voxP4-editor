import { RenderedAudio } from './types';

export interface RenderCacheKeyOptions {
  readonly sourceId: string;
  readonly startFrame: number;
  readonly frameCount: number;
  readonly dspVersion: string;
  readonly parameters: Record<string, number>;
}

/**
 * Computes a deterministic cache key for a specific render configuration.
 */
export function computeRenderCacheKey(options: RenderCacheKeyOptions): string {
  const { sourceId, startFrame, frameCount, dspVersion, parameters } = options;

  // Sort parameter keys canonically to ensure deterministic serialization
  const sortedKeys = Object.keys(parameters).sort();
  const paramPairs = sortedKeys
    .map((k) => {
      const v = parameters[k];
      const formatted = typeof v === 'number' && Number.isFinite(v) ? (Math.round(v * 10000) / 10000).toString() : String(v);
      return `${k}:${formatted}`;
    })
    .join(',');

  return `${sourceId}|${startFrame}|${frameCount}|${dspVersion}|${paramPairs}`;
}

export class RenderCache {
  private readonly cache = new Map<string, RenderedAudio>();
  private readonly maxEntries: number;

  constructor(maxEntries = 32) {
    this.maxEntries = maxEntries;
  }

  get(key: string): RenderedAudio | undefined {
    const val = this.cache.get(key);
    if (val !== undefined) {
      // Re-insert to mark as most recently used (LRU)
      this.cache.delete(key);
      this.cache.set(key, val);
    }
    return val;
  }

  set(key: string, rendered: RenderedAudio): void {
    // If key already exists, delete first to refresh position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Basic LRU eviction: remove oldest entry (first key in map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, rendered);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

export const renderCache = new RenderCache(32);
