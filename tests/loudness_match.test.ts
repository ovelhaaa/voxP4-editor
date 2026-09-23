import { describe, it, expect } from 'vitest';
import {
  MAX_LOUDNESS_COMPENSATION_DB,
  computeMonitoringGains,
  computePeak,
  computeRms,
} from '../src/audio/loudness';

const dbToLinear = (db: number) => 10 ** (db / 20);

function makeTone(rms: number, frames: number, phase = 0.7): Float32Array {
  // A sine with the requested RMS.
  const amplitude = rms * Math.SQRT2;
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) out[i] = amplitude * Math.sin(i * phase);
  return out;
}

describe('Preview UX V2: Audition Loudness Matching', () => {
  const frames = 48000;

  it('computeRms / computePeak behave on finite signals', () => {
    const signal = new Float32Array([0, 0.5, -0.5, 1.0]);
    expect(computePeak(signal)).toBeCloseTo(1.0, 6);
    expect(computeRms(signal)).toBeCloseTo(Math.sqrt((0 + 0.25 + 0.25 + 1) / 4), 6);
  });

  it('produces ~0 dB compensation when Dry and FX have equal loudness', () => {
    const dry = makeTone(0.2, frames);
    const gains = computeMonitoringGains({
      drySamples: dry,
      processedLeft: dry,
      processedRight: dry,
      frameCount: frames,
      enabled: true,
    });
    expect(20 * Math.log10(gains.fxGain)).toBeCloseTo(0, 2);
    expect(gains.dryGain).toBe(1);
  });

  it('applies a bounded positive gain when the processed signal is quieter', () => {
    const dry = makeTone(0.2, frames);
    const quiet = makeTone(0.05, frames);
    const gains = computeMonitoringGains({
      drySamples: dry,
      processedLeft: quiet,
      processedRight: quiet,
      frameCount: frames,
      enabled: true,
    });
    expect(gains.fxGain).toBeGreaterThan(1);
    expect(gains.fxGain).toBeLessThanOrEqual(dbToLinear(MAX_LOUDNESS_COMPENSATION_DB) + 1e-9);
  });

  it('applies a bounded negative gain when the processed signal is louder', () => {
    const dry = makeTone(0.05, frames);
    const loud = makeTone(0.4, frames);
    const gains = computeMonitoringGains({
      drySamples: dry,
      processedLeft: loud,
      processedRight: loud,
      frameCount: frames,
      enabled: true,
    });
    expect(gains.fxGain).toBeLessThan(1);
    expect(gains.fxGain).toBeGreaterThanOrEqual(
      dbToLinear(-MAX_LOUDNESS_COMPENSATION_DB) - 1e-9
    );
  });

  it('returns a safe finite unity result for silence', () => {
    const silence = new Float32Array(frames);
    const gains = computeMonitoringGains({
      drySamples: silence,
      processedLeft: silence,
      processedRight: silence,
      frameCount: frames,
      enabled: true,
    });
    expect(Number.isFinite(gains.dryGain)).toBe(true);
    expect(Number.isFinite(gains.fxGain)).toBe(true);
    expect(gains.dryGain).toBe(1);
    expect(gains.fxGain).toBe(1);
  });

  it('peak-guards a matched gain that would push the signal into clipping', () => {
    const dry = makeTone(0.2, frames);
    // Sparse full-scale transients: low RMS, high peak. RMS matching alone
    // would ask for a large boost, but the peak guard must cap it.
    const processed = new Float32Array(frames);
    for (let i = 0; i < frames; i += 64) processed[i] = 0.97;

    const gains = computeMonitoringGains({
      drySamples: dry,
      processedLeft: processed,
      processedRight: processed,
      frameCount: frames,
      enabled: true,
    });

    expect(gains.fxGain).toBeGreaterThan(1);
    expect(gains.fxGain * computePeak(processed)).toBeLessThanOrEqual(0.98 + 1e-6);
  });

  it('bypasses compensation when loudness matching is disabled', () => {
    const dry = makeTone(0.2, frames);
    const quiet = makeTone(0.01, frames);
    const gains = computeMonitoringGains({
      drySamples: dry,
      processedLeft: quiet,
      processedRight: quiet,
      frameCount: frames,
      enabled: false,
    });
    expect(gains).toEqual({ dryGain: 1, fxGain: 1 });
  });
});
