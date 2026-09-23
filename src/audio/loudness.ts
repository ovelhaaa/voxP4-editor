/**
 * Audition-only loudness matching.
 *
 * This is a monitoring convenience: it computes a playback gain so that Dry and
 * Processed material sit at a comparable loudness. It never mutates DSP
 * parameters, presets, or the rendered PCM. A peak guard prevents the
 * compensation from clipping the audition.
 */

/** Maximum monitoring compensation applied in either direction (±6 dB). */
export const MAX_LOUDNESS_COMPENSATION_DB = 6.0;

/** Linear peaks are kept below this ceiling to avoid clipping the audition. */
export const LOUDNESS_PEAK_CEILING = 0.98;

/** Below this RMS the signal is treated as silence and matching is bypassed. */
export const LOUDNESS_SILENCE_RMS = 1e-4;

export interface MonitoringGains {
  readonly dryGain: number;
  readonly fxGain: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Root-mean-square over the first `frameCount` samples (or all when omitted). */
export function computeRms(samples: Float32Array, frameCount?: number): number {
  const count = Math.min(frameCount ?? samples.length, samples.length);
  if (count <= 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < count; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / count);
}

/** Peak absolute amplitude over the first `frameCount` samples. */
export function computePeak(samples: Float32Array, frameCount?: number): number {
  const count = Math.min(frameCount ?? samples.length, samples.length);
  let peak = 0;
  for (let i = 0; i < count; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

/** Stereo RMS combining both channels (frames measured in samples per channel). */
function computeStereoRms(left: Float32Array, right: Float32Array, frameCount: number): number {
  const count = Math.max(0, Math.min(frameCount, Math.min(left.length, right.length)));
  if (count <= 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < count; i++) {
    sumSquares += left[i] * left[i] + right[i] * right[i];
  }
  return Math.sqrt(sumSquares / (count * 2));
}

function computeStereoPeak(left: Float32Array, right: Float32Array, frameCount: number): number {
  const count = Math.max(0, Math.min(frameCount, Math.min(left.length, right.length)));
  let peak = 0;
  for (let i = 0; i < count; i++) {
    const absL = Math.abs(left[i]);
    const absR = Math.abs(right[i]);
    const abs = absL > absR ? absL : absR;
    if (abs > peak) peak = abs;
  }
  return peak;
}

export interface MonitoringGainOptions {
  readonly drySamples: Float32Array;
  readonly processedLeft: Float32Array;
  readonly processedRight: Float32Array;
  /** Frames of the shared source region used for the comparison. */
  readonly frameCount: number;
  readonly enabled: boolean;
}

/**
 * Computes audition monitoring gains for Dry and Processed playback.
 *
 * - Dry is the reference (unity, peak-guarded).
 * - Processed is matched to Dry's RMS and clamped to ±6 dB.
 * - Both gains are additionally peak-guarded so the audition cannot clip.
 * - Silence (or matching disabled) yields unity gains: always finite and safe.
 */
export function computeMonitoringGains(options: MonitoringGainOptions): MonitoringGains {
  const { drySamples, processedLeft, processedRight, frameCount, enabled } = options;

  const dryPeak = computePeak(drySamples, frameCount);
  const dryGain = dryPeak > 0 ? Math.min(1, LOUDNESS_PEAK_CEILING / dryPeak) : 1;

  if (!enabled) {
    return { dryGain: 1, fxGain: 1 };
  }

  const dryRms = computeRms(drySamples, frameCount);
  const fxRms = computeStereoRms(processedLeft, processedRight, frameCount);
  const fxPeak = computeStereoPeak(processedLeft, processedRight, frameCount);

  let fxGain = 1;
  if (dryRms > LOUDNESS_SILENCE_RMS && fxRms > LOUDNESS_SILENCE_RMS) {
    fxGain = dryRms / fxRms;
  }

  const minGain = 10 ** (-MAX_LOUDNESS_COMPENSATION_DB / 20);
  const maxGain = 10 ** (MAX_LOUDNESS_COMPENSATION_DB / 20);
  fxGain = clamp(fxGain, minGain, maxGain);

  // Peak guard: never let the matched signal exceed the ceiling.
  if (fxPeak > 0) {
    fxGain = Math.min(fxGain, LOUDNESS_PEAK_CEILING / fxPeak);
  }
  fxGain = Math.max(0, fxGain);

  return { dryGain, fxGain };
}
