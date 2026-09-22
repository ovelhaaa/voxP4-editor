import { RenderedAudio } from './types';
import compatibilityManifest from './wasm/dsp-compatibility.json';

export const DEFAULT_DSP_BUILD_ID: string =
  (compatibilityManifest as any).wasmSha256 || (compatibilityManifest as any).dspCommit || 'voxp4-v1';

export const DEFAULT_CACHE_MAX_BYTES = 96 * 1024 * 1024; // 96 MB

export interface RenderCacheKeyOptions {
  readonly sourceId: string;
  readonly startFrame: number;
  readonly frameCount: number;
  readonly dspBuildId?: string;
  readonly dspVersion?: string; // backwards compatibility fallback
  readonly parameters: Record<string, number>;
}

/**
 * Deterministically canonicalizes parameter pairs into sorted semantic key-value strings.
 * Quantizes numbers to 4 decimal places to avoid floating-point jitter cache misses.
 */
export function canonicalizeParameters(parameters: Record<string, number>): string {
  const sortedKeys = Object.keys(parameters).sort();
  return sortedKeys
    .map((k) => {
      const v = parameters[k];
      const formatted =
        typeof v === 'number' && Number.isFinite(v)
          ? (Math.round(v * 10000) / 10000).toString()
          : String(v);
      return `${k}:${formatted}`;
    })
    .join(',');
}

/**
 * Computes a deterministic identity/fingerprint string for a specific preview render configuration.
 */
export function computePreviewFingerprint(options: RenderCacheKeyOptions): string {
  const { sourceId, startFrame, frameCount, parameters } = options;
  const dspId = options.dspBuildId || options.dspVersion || DEFAULT_DSP_BUILD_ID;
  const paramPairs = canonicalizeParameters(parameters);
  return `${sourceId}|${startFrame}|${frameCount}|${dspId}|${paramPairs}`;
}

/**
 * Alias for computePreviewFingerprint to maintain compatibility with existing consumers.
 */
export function computeRenderCacheKey(options: RenderCacheKeyOptions): string {
  return computePreviewFingerprint(options);
}

/**
 * Estimates the memory footprint in bytes of a RenderedAudio entry.
 */
export function estimateRenderedAudioBytes(audio: RenderedAudio): number {
  let bytes = 0;
  if (audio.left) bytes += audio.left.byteLength;
  if (audio.right) bytes += audio.right.byteLength;
  bytes += (audio.cacheKey?.length || 0) * 2;
  bytes += (audio.fingerprint?.length || 0) * 2;
  bytes += (audio.sourceId?.length || 0) * 2;
  bytes += 256; // JS object overhead
  return bytes;
}

/**
 * Memory-bounded LRU Render Cache.
 * Evicts oldest entries when total byte size exceeds maxBytes.
 */
export class RenderCache {
  private readonly cache = new Map<string, { audio: RenderedAudio; bytes: number }>();
  private currentBytes = 0;
  private readonly _maxBytes: number;

  constructor(maxBytes = DEFAULT_CACHE_MAX_BYTES) {
    this._maxBytes = maxBytes;
  }

  get maxBytes(): number {
    return this._maxBytes;
  }

  get byteSize(): number {
    return this.currentBytes;
  }

  get size(): number {
    return this.cache.size;
  }

  get(key: string): RenderedAudio | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    // Re-insert to mark as most recently used (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.audio;
  }

  set(key: string, rendered: RenderedAudio): void {
    const entryBytes = estimateRenderedAudioBytes(rendered);

    // If an individual entry is larger than the entire cache capacity, reject caching
    if (entryBytes > this._maxBytes) {
      return;
    }

    // If key already exists, deduct previous bytes
    if (this.cache.has(key)) {
      const prev = this.cache.get(key)!;
      this.currentBytes -= prev.bytes;
      this.cache.delete(key);
    }

    // Evict oldest entries until there is sufficient byte capacity
    while (this.currentBytes + entryBytes > this._maxBytes && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      const oldestEntry = this.cache.get(oldestKey);
      if (oldestEntry) {
        this.currentBytes -= oldestEntry.bytes;
      }
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, { audio: rendered, bytes: entryBytes });
    this.currentBytes += entryBytes;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.currentBytes -= entry.bytes;
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    this.cache.clear();
    this.currentBytes = 0;
  }
}

export const renderCache = new RenderCache(DEFAULT_CACHE_MAX_BYTES);
