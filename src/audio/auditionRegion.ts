import { AuditionLengthMode, AuditionRegion, EffectiveSourceRegion } from './types';

/** Longest region the editor will audition from a single source by default. */
export const DEFAULT_MAX_REGION_SECONDS = 20.0;

/** A manually selected region is never shorter than this (when the source allows). */
export const MIN_AUDITION_REGION_SECONDS = 1.0;

/** Practical ceiling for an explicit audition selection. */
export const MAX_AUDITION_REGION_SECONDS = 20.0;

/** Quick Audition source windows. These never truncate the DSP tail. */
export const QUICK_AUDITION_SECONDS: Readonly<Record<Exclude<AuditionLengthMode, 'full'>, number>> = {
  short: 3.0,
  medium: 8.0,
};

/**
 * Default audition region when the user has not selected one explicitly.
 * Matches the historical preview behaviour: start at 0, cap at 20 s.
 */
export function defaultAuditionRegion(durationSeconds: number): AuditionRegion {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  return {
    startSeconds: 0,
    endSeconds: Math.min(duration, DEFAULT_MAX_REGION_SECONDS),
  };
}

/**
 * Clamps a region into the valid source range. Zero-length or inverted regions
 * collapse to a safe minimum window when the source is long enough.
 */
export function clampRegion(region: AuditionRegion, durationSeconds: number): AuditionRegion {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  if (duration <= 0) return { startSeconds: 0, endSeconds: 0 };

  const maxLength = Math.min(MAX_AUDITION_REGION_SECONDS, duration);

  let start = Number.isFinite(region.startSeconds) ? region.startSeconds : 0;
  let end = Number.isFinite(region.endSeconds) ? region.endSeconds : 0;

  if (end < start) {
    const swapped = start;
    start = end;
    end = swapped;
  }

  start = Math.max(0, Math.min(start, duration));
  end = Math.max(0, Math.min(end, duration));

  // Enforce a minimum audition window without ever exceeding the source.
  const minLength = Math.min(MIN_AUDITION_REGION_SECONDS, duration);
  if (end - start < minLength) {
    end = Math.min(duration, start + minLength);
    start = Math.max(0, Math.min(start, end - minLength));
  }

  // Enforce the practical maximum selection length.
  if (end - start > maxLength) {
    end = start + maxLength;
  }

  return { startSeconds: start, endSeconds: end };
}

export interface ResolveSourceRegionOptions {
  readonly region: AuditionRegion | null;
  readonly mode: AuditionLengthMode;
  readonly sampleRate: number;
  readonly totalFrames: number;
}

/**
 * Resolves the user's region + Quick Audition mode into the concrete source
 * frame window handed to the DSP. The DSP tail is added afterwards by the
 * worker, so this function only bounds the *input*.
 */
export function resolveSourceRegion(options: ResolveSourceRegionOptions): EffectiveSourceRegion {
  const { mode, sampleRate, totalFrames } = options;
  const safeRate = sampleRate > 0 ? sampleRate : 48000;
  const total = Math.max(0, Math.floor(totalFrames));
  const durationSeconds = total / safeRate;

  const base = options.region
    ? clampRegion(options.region, durationSeconds)
    : defaultAuditionRegion(durationSeconds);

  let regionLength = base.endSeconds - base.startSeconds;
  if (mode !== 'full') {
    regionLength = Math.min(regionLength, QUICK_AUDITION_SECONDS[mode]);
  }

  const startFrame = Math.max(
    0,
    Math.min(total, Math.round(base.startSeconds * safeRate))
  );
  let frameCount = Math.max(1, Math.round(regionLength * safeRate));
  frameCount = Math.min(frameCount, Math.max(0, total - startFrame));

  return {
    startFrame,
    frameCount,
    startSeconds: startFrame / safeRate,
    durationSeconds: frameCount / safeRate,
  };
}
