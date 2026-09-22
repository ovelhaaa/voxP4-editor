import { describe, it, expect } from 'vitest';
import {
  estimateMaxTailSeconds,
  estimateMinTailCheckSeconds,
  estimateMinSilenceSeconds,
  MIN_TAIL_SECONDS,
  MAX_ALLOWED_TAIL_SECONDS,
  MIN_TAIL_CHECK_SECONDS,
  MIN_SILENCE_SECONDS,
} from '../src/audio/tailEstimation';

function baseParams(overrides: Record<string, number> = {}): Record<string, number> {
  return {
    'delay.enable': 0,
    'delay.wet': 0,
    'delay.left_ms': 0,
    'delay.right_ms': 0,
    'delay.feedback': 0,
    'reverb.enable': 0,
    'reverb.wet': 0,
    'reverb.decay_s': 0,
    ...overrides,
  };
}

describe('Parameter-derived tail estimation', () => {
  it('returns only the minimum tail when all time-based effects are disabled', () => {
    expect(estimateMaxTailSeconds(baseParams())).toBeCloseTo(MIN_TAIL_SECONDS, 5);
    expect(estimateMinTailCheckSeconds(baseParams())).toBeCloseTo(MIN_TAIL_CHECK_SECONDS, 5);
  });

  it('ignores reverb decay when reverb is disabled or fully dry', () => {
    expect(
      estimateMaxTailSeconds(baseParams({ 'reverb.enable': 1, 'reverb.wet': 0, 'reverb.decay_s': 20 }))
    ).toBeCloseTo(MIN_TAIL_SECONDS, 5);
    expect(
      estimateMaxTailSeconds(baseParams({ 'reverb.enable': 0, 'reverb.wet': 1, 'reverb.decay_s': 20 }))
    ).toBeCloseTo(MIN_TAIL_SECONDS, 5);
  });

  it('scales reverb tail with decay and allows tails well beyond 4 seconds', () => {
    const twoSeconds = estimateMaxTailSeconds(
      baseParams({ 'reverb.enable': 1, 'reverb.wet': 0.5, 'reverb.decay_s': 2.0 })
    );
    expect(twoSeconds).toBeGreaterThan(2.0);
    expect(twoSeconds).toBeLessThan(3.5);

    const tenSeconds = estimateMaxTailSeconds(
      baseParams({ 'reverb.enable': 1, 'reverb.wet': 0.5, 'reverb.decay_s': 10.0 })
    );
    expect(tenSeconds).toBeGreaterThan(4.0);
    expect(tenSeconds).toBeCloseTo(14.0, 1);
  });

  it('clamps very long reverb decay to the global safety ceiling', () => {
    const tail = estimateMaxTailSeconds(
      baseParams({ 'reverb.enable': 1, 'reverb.wet': 1.0, 'reverb.decay_s': 20.0 })
    );
    expect(tail).toBeLessThanOrEqual(MAX_ALLOWED_TAIL_SECONDS);
    expect(tail).toBeGreaterThan(20.0);
  });

  it('treats negative feedback by magnitude and grows with delay time', () => {
    const positive = estimateMaxTailSeconds(
      baseParams({ 'delay.enable': 1, 'delay.wet': 0.5, 'delay.left_ms': 2000, 'delay.feedback': 0.6 })
    );
    const negative = estimateMaxTailSeconds(
      baseParams({ 'delay.enable': 1, 'delay.wet': 0.5, 'delay.left_ms': 2000, 'delay.feedback': -0.6 })
    );
    expect(positive).toBeCloseTo(negative, 5);
    expect(positive).toBeGreaterThan(4.0);
  });

  it('returns a single-delay tail when feedback is zero', () => {
    const tail = estimateMaxTailSeconds(
      baseParams({ 'delay.enable': 1, 'delay.wet': 0.5, 'delay.left_ms': 2000, 'delay.feedback': 0 })
    );
    expect(tail).toBeGreaterThanOrEqual(2.0);
    expect(tail).toBeLessThan(MAX_ALLOWED_TAIL_SECONDS);
  });

  it('clamps near-unity feedback to the global safety ceiling', () => {
    const tail = estimateMaxTailSeconds(
      baseParams({ 'delay.enable': 1, 'delay.wet': 0.5, 'delay.left_ms': 2000, 'delay.feedback': 0.95 })
    );
    expect(tail).toBe(MAX_ALLOWED_TAIL_SECONDS);
  });

  it('extends the silence-check window past the configured delay time', () => {
    const check = estimateMinTailCheckSeconds(
      baseParams({ 'delay.enable': 1, 'delay.wet': 0.5, 'delay.left_ms': 1000, 'delay.right_ms': 2000 })
    );
    expect(check).toBeGreaterThan(2.0);
    expect(check).toBeCloseTo(2.1, 1);
  });

  it('extends the silence window across delay repeat gaps', () => {
    const silence = estimateMinSilenceSeconds(
      baseParams({ 'delay.enable': 1, 'delay.wet': 0.5, 'delay.left_ms': 2000 })
    );
    expect(silence).toBeGreaterThan(2.0);

    const noDelay = estimateMinSilenceSeconds(baseParams());
    expect(noDelay).toBe(MIN_SILENCE_SECONDS);
  });
});
