import { describe, it, expect } from 'vitest';
import { downmixToMono, computeAudioFileId } from '../src/audio/decodeAudio';
import {
  computePreviewFingerprint,
  computeRenderCacheKey,
  RenderCache,
  estimateRenderedAudioBytes,
} from '../src/audio/renderCache';
import { RenderedAudio } from '../src/audio/types';

describe('Audio Pipeline: Downmixing and File Identity', () => {
  it('correctly passes through 1-channel mono audio', () => {
    const mockAudioBuffer = {
      numberOfChannels: 1,
      length: 4,
      sampleRate: 48000,
      getChannelData: () => new Float32Array([0.1, 0.5, -0.3, 0.8]),
    } as unknown as AudioBuffer;

    const mono = downmixToMono(mockAudioBuffer);
    expect(mono.length).toBe(4);
    expect(mono[0]).toBeCloseTo(0.1, 5);
    expect(mono[1]).toBeCloseTo(0.5, 5);
    expect(mono[2]).toBeCloseTo(-0.3, 5);
    expect(mono[3]).toBeCloseTo(0.8, 5);
  });

  it('correctly downmixes 2-channel stereo audio using (L + R) * 0.5', () => {
    const ch0 = new Float32Array([0.2, 0.6, -0.4, 1.0]);
    const ch1 = new Float32Array([0.6, 0.2, 0.2, -0.2]);

    const mockAudioBuffer = {
      numberOfChannels: 2,
      length: 4,
      sampleRate: 48000,
      getChannelData: (c: number) => (c === 0 ? ch0 : ch1),
    } as unknown as AudioBuffer;

    const mono = downmixToMono(mockAudioBuffer);
    expect(mono.length).toBe(4);
    expect(mono[0]).toBeCloseTo((0.2 + 0.6) * 0.5, 5);
    expect(mono[1]).toBeCloseTo((0.6 + 0.2) * 0.5, 5);
    expect(mono[2]).toBeCloseTo((-0.4 + 0.2) * 0.5, 5);
    expect(mono[3]).toBeCloseTo((1.0 - 0.2) * 0.5, 5);
  });

  it('correctly downmixes multichannel audio (>2 channels) by arithmetic average', () => {
    const ch0 = new Float32Array([1.0]);
    const ch1 = new Float32Array([0.5]);
    const ch2 = new Float32Array([0.3]);
    const ch3 = new Float32Array([0.2]);
    const channels = [ch0, ch1, ch2, ch3];

    const mockAudioBuffer = {
      numberOfChannels: 4,
      length: 1,
      sampleRate: 48000,
      getChannelData: (c: number) => channels[c],
    } as unknown as AudioBuffer;

    const mono = downmixToMono(mockAudioBuffer);
    expect(mono.length).toBe(1);
    // (1.0 + 0.5 + 0.3 + 0.2) / 4 = 2.0 / 4 = 0.5
    expect(mono[0]).toBeCloseTo(0.5, 5);
  });

  it('computes robust user file identity via SHA-256', async () => {
    const dummyBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const file = new File([dummyBytes], 'vocals.wav', { type: 'audio/wav', lastModified: 1000 });

    const id1 = await computeAudioFileId(file);
    const id2 = await computeAudioFileId(file);

    expect(id1).toBe(id2);
    expect(id1.startsWith('user-')).toBe(true);

    // Different content must produce a different ID even with the same filename/size/date
    const differentBytes = new Uint8Array([8, 7, 6, 5, 4, 3, 2, 1]);
    const fileDifferent = new File([differentBytes], 'vocals.wav', { type: 'audio/wav', lastModified: 1000 });
    const idDifferent = await computeAudioFileId(fileDifferent);

    expect(id1).not.toBe(idDifferent);
  });
});

describe('Audio Pipeline: Fingerprint & Memory LRU Cache', () => {
  it('computes identical fingerprint regardless of parameter insertion order', () => {
    const fpA = computePreviewFingerprint({
      sourceId: 'ref-1',
      startFrame: 0,
      frameCount: 48000,
      dspBuildId: 'build-abc',
      parameters: { 'reverb.wet': 0.5, 'delay.wet': 0.2 },
    });

    const fpB = computePreviewFingerprint({
      sourceId: 'ref-1',
      startFrame: 0,
      frameCount: 48000,
      dspBuildId: 'build-abc',
      parameters: { 'delay.wet': 0.2, 'reverb.wet': 0.5 },
    });

    expect(fpA).toBe(fpB);
    expect(computeRenderCacheKey({
      sourceId: 'ref-1',
      startFrame: 0,
      frameCount: 48000,
      dspBuildId: 'build-abc',
      parameters: { 'reverb.wet': 0.5, 'delay.wet': 0.2 },
    })).toBe(fpA);
  });

  it('computes different fingerprint when dspBuildId or parameters change', () => {
    const base = computePreviewFingerprint({
      sourceId: 'ref-1',
      startFrame: 0,
      frameCount: 48000,
      dspBuildId: 'build-1',
      parameters: { 'reverb.wet': 0.5 },
    });

    const diffDsp = computePreviewFingerprint({
      sourceId: 'ref-1',
      startFrame: 0,
      frameCount: 48000,
      dspBuildId: 'build-2',
      parameters: { 'reverb.wet': 0.5 },
    });

    const diffParams = computePreviewFingerprint({
      sourceId: 'ref-1',
      startFrame: 0,
      frameCount: 48000,
      dspBuildId: 'build-1',
      parameters: { 'reverb.wet': 0.6 },
    });

    expect(base).not.toBe(diffDsp);
    expect(base).not.toBe(diffParams);
  });

  it('correctly tracks byteSize and evicts oldest items upon memory overflow', () => {
    const mockRender = (key: string, numFrames: number): RenderedAudio => ({
      sourceId: 's1',
      cacheKey: key,
      fingerprint: key,
      duration: numFrames / 48000,
      tailDurationSeconds: 0,
      sampleRate: 48000,
      left: new Float32Array(numFrames),
      right: new Float32Array(numFrames),
      renderTimeMs: 12,
    });

    // 1000 frames * 4 bytes * 2 channels = 8000 bytes audio + metadata (~270 bytes) = ~8270 bytes
    const item1 = mockRender('k1', 1000);
    const itemSize = estimateRenderedAudioBytes(item1);

    // Set maxBytes to accommodate exactly 2 items
    const maxBytes = itemSize * 2 + 100;
    const cache = new RenderCache(maxBytes);

    cache.set('k1', item1);
    expect(cache.size).toBe(1);
    expect(cache.byteSize).toBe(itemSize);

    const item2 = mockRender('k2', 1000);
    cache.set('k2', item2);
    expect(cache.size).toBe(2);
    expect(cache.byteSize).toBe(itemSize * 2);

    // Adding item3 should evict k1
    const item3 = mockRender('k3', 1000);
    cache.set('k3', item3);
    expect(cache.size).toBe(2);
    expect(cache.has('k1')).toBe(false);
    expect(cache.has('k2')).toBe(true);
    expect(cache.has('k3')).toBe(true);
  });
});
