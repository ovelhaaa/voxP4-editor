import { describe, it, expect } from 'vitest';
import { computeWaveformEnvelope } from '../src/audio/waveform';

describe('Preview UX V2: Waveform envelope', () => {
  it('produces the requested number of min/max buckets', () => {
    const samples = new Float32Array(1000).map((_, i) => Math.sin(i / 10));
    const envelope = computeWaveformEnvelope(samples, 64);
    expect(envelope.bucketCount).toBe(64);
    expect(envelope.min.length).toBe(64);
    expect(envelope.max.length).toBe(64);
  });

  it('captures true min/max within each bucket', () => {
    const samples = new Float32Array([0.1, 0.9, -0.5, -0.8, 0.2, 0.3, -0.1, 0.4]);
    const envelope = computeWaveformEnvelope(samples, 2);
    // Bucket 0 covers the first 4 samples; bucket 1 the last 4.
    expect(envelope.max[0]).toBeCloseTo(0.9, 6);
    expect(envelope.min[0]).toBeCloseTo(-0.8, 6);
    expect(envelope.max[1]).toBeCloseTo(0.4, 6);
    expect(envelope.min[1]).toBeCloseTo(-0.1, 6);
  });

  it('handles empty input without throwing', () => {
    const envelope = computeWaveformEnvelope(new Float32Array(0), 16);
    expect(envelope.bucketCount).toBe(16);
    expect(envelope.min.length).toBe(16);
    expect(envelope.max.length).toBe(16);
  });

  it('handles more buckets than samples safely', () => {
    const envelope = computeWaveformEnvelope(new Float32Array([0.5, -0.5]), 8);
    expect(envelope.bucketCount).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(Number.isFinite(envelope.min[i])).toBe(true);
      expect(Number.isFinite(envelope.max[i])).toBe(true);
      expect(envelope.min[i]).toBeLessThanOrEqual(envelope.max[i]);
    }
  });
});
