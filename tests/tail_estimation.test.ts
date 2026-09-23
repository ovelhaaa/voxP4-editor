import { describe, it, expect } from 'vitest';
import {
  estimateMaxTailSeconds,
  estimateMinTailCheckSeconds,
  estimateMinSilenceSeconds,
  resolveEffectiveDelayTimes,
  tempoSubdivisionMs,
  clampTempoBpm,
  tempoSubdivisionRatio,
  SUBDIVISION_INDEX,
  MIN_TAIL_SECONDS,
  MAX_ALLOWED_TAIL_SECONDS,
  MIN_TAIL_CHECK_SECONDS,
  MIN_SILENCE_SECONDS,
  MAX_DELAY_MS,
  MIN_TEMPO_BPM,
  MAX_TEMPO_BPM,
  DEFAULT_TEMPO_BPM,
} from '../src/audio/tailEstimation';

function baseParams(overrides: Record<string, number> = {}): Record<string, number> {
  return {
    'delay.enable': 0,
    'delay.wet': 0,
    'delay.left_ms': 0,
    'delay.right_ms': 0,
    'delay.feedback': 0,
    'delay.sync_enable': 0,
    'delay.left_subdivision': SUBDIVISION_INDEX.Eighth,
    'delay.right_subdivision': SUBDIVISION_INDEX.DottedEighth,
    'tempo.bpm': 120,
    'reverb.enable': 0,
    'reverb.wet': 0,
    'reverb.decay_s': 0,
    'output.spatial_routing': 0, // Parallel by default in these fixtures
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

describe('Delay BPM sync effective times', () => {
  it('uses manual left/right times when sync is off', () => {
    const t = resolveEffectiveDelayTimes(
      baseParams({ 'delay.sync_enable': 0, 'delay.left_ms': 700, 'delay.right_ms': 900 })
    );
    expect(t.leftMs).toBeCloseTo(700, 6);
    expect(t.rightMs).toBeCloseTo(900, 6);
    expect(t.maxMs).toBeCloseTo(900, 6);
  });

  it('converts subdivisions to milliseconds at 120 and 60 BPM', () => {
    expect(tempoSubdivisionMs(120, SUBDIVISION_INDEX.Eighth)).toBeCloseTo(250, 6);
    expect(tempoSubdivisionMs(120, SUBDIVISION_INDEX.DottedEighth)).toBeCloseTo(375, 6);
    expect(tempoSubdivisionMs(60, SUBDIVISION_INDEX.Quarter)).toBeCloseTo(1000, 6);
    expect(tempoSubdivisionMs(120, SUBDIVISION_INDEX.Whole)).toBeCloseTo(2000, 6);
  });

  it('clamps the theoretical musical time to the physical DSP delay limit', () => {
    // 30 BPM + Whole = 8000 ms musically, but the delay line is 2000 ms.
    expect(tempoSubdivisionMs(30, SUBDIVISION_INDEX.Whole)).toBeCloseTo(8000, 6);
    const t = resolveEffectiveDelayTimes(
      baseParams({ 'delay.sync_enable': 1, 'tempo.bpm': 30, 'delay.left_subdivision': SUBDIVISION_INDEX.Whole })
    );
    expect(t.leftMs).toBeCloseTo(MAX_DELAY_MS, 6);
  });

  it('ignores manual times when sync is enabled (sync parameters win)', () => {
    const t = resolveEffectiveDelayTimes(
      baseParams({
        'delay.sync_enable': 1,
        'delay.left_ms': 100,
        'delay.right_ms': 100,
        'tempo.bpm': 60,
        'delay.left_subdivision': SUBDIVISION_INDEX.Half,
        'delay.right_subdivision': SUBDIVISION_INDEX.Half,
      })
    );
    // Half @ 60 BPM = 2000 ms; the 100 ms manual values must not be used.
    expect(t.leftMs).toBeCloseTo(2000, 6);
    expect(t.rightMs).toBeCloseTo(2000, 6);
  });

  it('falls back to a quarter note for invalid subdivision indices (matches DSP default)', () => {
    expect(tempoSubdivisionRatio(-1)).toBeCloseTo(1.0, 6);
    expect(tempoSubdivisionRatio(13)).toBeCloseTo(1.0, 6);
    expect(tempoSubdivisionRatio(255)).toBeCloseTo(1.0, 6);
    expect(tempoSubdivisionRatio(Number.NaN)).toBeCloseTo(1.0, 6);
  });

  it('clamps BPM like the DSP', () => {
    expect(clampTempoBpm(0)).toBe(MIN_TEMPO_BPM);
    expect(clampTempoBpm(1000)).toBe(MAX_TEMPO_BPM);
    expect(clampTempoBpm(Number.NaN)).toBe(DEFAULT_TEMPO_BPM);
    expect(clampTempoBpm(120)).toBe(120);
  });

  it('feeds the effective delay into the silence check and silence window', () => {
    // sync on, Half @ 30 BPM = 2000 ms musical, within the physical limit.
    const params = baseParams({
      'delay.enable': 1,
      'delay.wet': 0.5,
      'delay.sync_enable': 1,
      'tempo.bpm': 30,
      'delay.left_subdivision': SUBDIVISION_INDEX.Half,
      'delay.right_subdivision': SUBDIVISION_INDEX.Half,
    });
    expect(estimateMinTailCheckSeconds(params)).toBeCloseTo(2.1, 1);
    expect(estimateMinSilenceSeconds(params)).toBeCloseTo(2.1, 1);
  });
});

describe('Delay -> Reverb serial routing tail', () => {
  // ~8.0 s delay tail (2 s delay, feedback 0.052) and 14.0 s reverb tail.
  const bothActive = (routing: number) =>
    baseParams({
      'delay.enable': 1,
      'delay.wet': 0.5,
      'delay.left_ms': 2000,
      'delay.right_ms': 2000,
      'delay.feedback': 0.052,
      'reverb.enable': 1,
      'reverb.wet': 0.5,
      'reverb.decay_s': 10,
      'output.spatial_routing': routing,
    });

  it('Parallel uses max(delay, reverb)', () => {
    const tail = estimateMaxTailSeconds(bothActive(0));
    expect(tail).toBeCloseTo(14.0, 1);
  });

  it('DelayIntoReverb uses the serial worst case (delay + reverb)', () => {
    const tail = estimateMaxTailSeconds(bothActive(1));
    expect(tail).toBeCloseTo(22.0, 1);
    expect(tail).toBeLessThanOrEqual(MAX_ALLOWED_TAIL_SECONDS);
  });

  it('does not sum when delay is disabled', () => {
    const params = bothActive(1);
    params['delay.enable'] = 0;
    expect(estimateMaxTailSeconds(params)).toBeCloseTo(14.0, 1);
  });

  it('does not sum when reverb is disabled', () => {
    const params = bothActive(1);
    params['reverb.enable'] = 0;
    expect(estimateMaxTailSeconds(params)).toBeCloseTo(8.0, 1);
  });

  it('does not sum when delay wet is zero', () => {
    const params = bothActive(1);
    params['delay.wet'] = 0;
    expect(estimateMaxTailSeconds(params)).toBeCloseTo(14.0, 1);
  });

  it('does not sum when reverb wet is zero', () => {
    const params = bothActive(1);
    params['reverb.wet'] = 0;
    expect(estimateMaxTailSeconds(params)).toBeCloseTo(8.0, 1);
  });

  it('clamps the serial worst case to the global safety ceiling', () => {
    const params = bothActive(1);
    params['reverb.decay_s'] = 20; // reverb tail 28 s + delay ~8 s -> clamp
    expect(estimateMaxTailSeconds(params)).toBe(MAX_ALLOWED_TAIL_SECONDS);
  });
});
