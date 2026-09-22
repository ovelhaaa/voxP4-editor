import { describe, it, expect } from 'vitest';
import { computeRenderCacheKey, RenderCache } from '../src/audio/renderCache';
import { RenderedAudio } from '../src/audio/types';

describe('Render Cache & Deterministic Hash Key', () => {
  it('computes identical cache key regardless of parameter object key insertion order', () => {
    const keyA = computeRenderCacheKey({
      sourceId: 'clean-female',
      startFrame: 0,
      frameCount: 48000,
      dspVersion: '1.0',
      parameters: {
        'reverb.wet': 0.25,
        'delay.feedback': 0.4,
        'delay.wet': 0.3,
      },
    });

    const keyB = computeRenderCacheKey({
      sourceId: 'clean-female',
      startFrame: 0,
      frameCount: 48000,
      dspVersion: '1.0',
      parameters: {
        'delay.wet': 0.3,
        'reverb.wet': 0.25,
        'delay.feedback': 0.4,
      },
    });

    expect(keyA).toBe(keyB);
  });

  it('quantizes floating point parameter values to 4 decimal places to prevent float jitter cache misses', () => {
    const keyA = computeRenderCacheKey({
      sourceId: 'test',
      startFrame: 0,
      frameCount: 1000,
      dspVersion: '1.0',
      parameters: { 'reverb.wet': 0.25000001 },
    });

    const keyB = computeRenderCacheKey({
      sourceId: 'test',
      startFrame: 0,
      frameCount: 1000,
      dspVersion: '1.0',
      parameters: { 'reverb.wet': 0.25000004 },
    });

    expect(keyA).toBe(keyB);
  });

  it('produces different keys when dspVersion, frameCount, or parameters change', () => {
    const baseKey = computeRenderCacheKey({
      sourceId: 'vocal-1',
      startFrame: 0,
      frameCount: 1000,
      dspVersion: '1.0',
      parameters: { 'drive.drive': 0.5 },
    });

    const diffVersion = computeRenderCacheKey({
      sourceId: 'vocal-1',
      startFrame: 0,
      frameCount: 1000,
      dspVersion: '1.1',
      parameters: { 'drive.drive': 0.5 },
    });

    const diffFrames = computeRenderCacheKey({
      sourceId: 'vocal-1',
      startFrame: 0,
      frameCount: 2000,
      dspVersion: '1.0',
      parameters: { 'drive.drive': 0.5 },
    });

    const diffParams = computeRenderCacheKey({
      sourceId: 'vocal-1',
      startFrame: 0,
      frameCount: 1000,
      dspVersion: '1.0',
      parameters: { 'drive.drive': 0.8 },
    });

    expect(baseKey).not.toBe(diffVersion);
    expect(baseKey).not.toBe(diffFrames);
    expect(baseKey).not.toBe(diffParams);
  });

  it('enforces memory-bounded LRU eviction capacity and tracks byteSize', () => {
    // Budget enough for exactly 3 mock entries (~680 bytes each)
    const mockAudio = (id: string, key: string): RenderedAudio => ({
      sourceId: id,
      cacheKey: key,
      fingerprint: key,
      duration: 1.0,
      tailDurationSeconds: 0,
      sampleRate: 48000,
      left: new Float32Array(48),
      right: new Float32Array(48),
      renderTimeMs: 10,
    });

    const singleSize = (48 + 48) * 4 + 256 + 2 * (2 + 2 + 2); // ~646 bytes
    const budgetFor3 = singleSize * 3 + 100;
    const cache = new RenderCache(budgetFor3);

    cache.set('k1', mockAudio('s1', 'k1'));
    cache.set('k2', mockAudio('s2', 'k2'));
    cache.set('k3', mockAudio('s3', 'k3'));

    expect(cache.has('k1')).toBe(true);
    expect(cache.has('k2')).toBe(true);
    expect(cache.has('k3')).toBe(true);
    expect(cache.size).toBe(3);
    expect(cache.byteSize).toBeGreaterThan(0);
    expect(cache.byteSize).toBeLessThanOrEqual(budgetFor3);

    // Access k1 to make it most recently used
    cache.get('k1');

    // Add k4 -> should evict k2 (oldest) because buffer only holds 3
    cache.set('k4', mockAudio('s4', 'k4'));

    expect(cache.has('k2')).toBe(false);
    expect(cache.has('k1')).toBe(true);
    expect(cache.has('k3')).toBe(true);
    expect(cache.has('k4')).toBe(true);
    expect(cache.size).toBe(3);
    expect(cache.byteSize).toBeLessThanOrEqual(budgetFor3);
  });
});
