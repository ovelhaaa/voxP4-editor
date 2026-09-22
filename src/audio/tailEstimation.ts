/**
 * Parameter-derived tail planning for offline preview rendering.
 *
 * The DSP can produce long tails (reverb up to 20 s decay, delay up to 2000 ms
 * per side with feedback up to +/-0.95). A fixed 4 s cap would truncate real
 * audio, so the maximum tail is derived from the resolved DSP parameters and
 * only bounded by a global safety limit.
 */

export const BLOCK_SIZE = 64;
export const SAMPLE_RATE = 48000;

/** Global safety ceiling for any single render tail. */
export const MAX_ALLOWED_TAIL_SECONDS = 30.0;
/** Every processed render reserves at least this much tail for filter/decay settling. */
export const MIN_TAIL_SECONDS = 0.25;

/**
 * Reverb decay (`reverb.decay_s`) is a T60 value: amplitude ~= 10^(-3t/T60).
 * Reaching -80 dB (1e-4) requires t = (80/60) * T60 ~= 1.333 * T60.
 * A 1.4 factor adds a small margin over that analytic point.
 */
export const REVERB_TAIL_DECAY_FACTOR = 1.4;

/** Delay repeats are considered negligible below this linear gain (-60 dBFS). */
export const DELAY_TAIL_THRESHOLD_LINEAR = 1e-3;
export const DELAY_TAIL_SAFETY_FACTOR = 1.2;

/** Default minimum tail length before silence early-exit may be considered. */
export const MIN_TAIL_CHECK_SECONDS = 0.4;
/** Default consecutive-silence window before declaring a tail finished. */
export const MIN_SILENCE_SECONDS = 0.25;
/** Extra guard after the configured delay time before declaring silence. */
export const DELAY_SILENCE_GUARD_SECONDS = 0.1;

const WET_EPSILON = 1e-4;
const FEEDBACK_EPSILON = 1e-4;

function readNumber(parameters: Record<string, number>, key: string, fallback: number): number {
  const value = parameters[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isEnabled(parameters: Record<string, number>, key: string): boolean {
  return readNumber(parameters, key, 0) > 0.5;
}

/**
 * Estimates the maximum tail duration (seconds) that should be rendered for the
 * given resolved DSP parameters. Pure and deterministic.
 */
export function estimateMaxTailSeconds(parameters: Record<string, number>): number {
  let reverbTail = 0;
  if (isEnabled(parameters, 'reverb.enable')) {
    const wet = readNumber(parameters, 'reverb.wet', 0);
    const decay = readNumber(parameters, 'reverb.decay_s', 0);
    if (wet > WET_EPSILON && decay > 0) {
      reverbTail = decay * REVERB_TAIL_DECAY_FACTOR;
    }
  }

  let delayTail = 0;
  if (isEnabled(parameters, 'delay.enable')) {
    const wet = readNumber(parameters, 'delay.wet', 0);
    const feedback = Math.abs(readNumber(parameters, 'delay.feedback', 0));
    const maxDelaySeconds =
      Math.max(
        readNumber(parameters, 'delay.left_ms', 0),
        readNumber(parameters, 'delay.right_ms', 0)
      ) / 1000;

    if (wet > WET_EPSILON && maxDelaySeconds > 0) {
      let repeats: number;
      if (feedback <= FEEDBACK_EPSILON) {
        repeats = 1;
      } else if (feedback >= 0.999) {
        // Effectively unbounded; the global clamp handles it.
        repeats = MAX_ALLOWED_TAIL_SECONDS / maxDelaySeconds;
      } else {
        repeats = Math.log(DELAY_TAIL_THRESHOLD_LINEAR) / Math.log(feedback);
      }
      delayTail = maxDelaySeconds * (repeats + 1) * DELAY_TAIL_SAFETY_FACTOR;
    }
  }

  const estimated = Math.max(MIN_TAIL_SECONDS, reverbTail, delayTail);
  return Math.min(estimated, MAX_ALLOWED_TAIL_SECONDS);
}

/**
 * Minimum tail length that must elapse before silence early-exit is allowed.
 * This prevents a long configured delay from being declared silent before its
 * first repeats have a chance to appear.
 */
export function estimateMinTailCheckSeconds(parameters: Record<string, number>): number {
  if (isEnabled(parameters, 'delay.enable')) {
    const wet = readNumber(parameters, 'delay.wet', 0);
    const maxDelaySeconds =
      Math.max(
        readNumber(parameters, 'delay.left_ms', 0),
        readNumber(parameters, 'delay.right_ms', 0)
      ) / 1000;

    if (wet > WET_EPSILON && maxDelaySeconds > 0) {
      return Math.max(MIN_TAIL_CHECK_SECONDS, maxDelaySeconds + DELAY_SILENCE_GUARD_SECONDS);
    }
  }

  return MIN_TAIL_CHECK_SECONDS;
}

/**
 * Minimum consecutive-silence window before a tail may be declared finished.
 *
 * When a delay is active, echoes can be spaced a full delay period apart, so
 * the silence window must exceed the configured delay to avoid cutting a
 * pending repeat. For non-delay tails the default window applies.
 */
export function estimateMinSilenceSeconds(parameters: Record<string, number>): number {
  if (isEnabled(parameters, 'delay.enable')) {
    const wet = readNumber(parameters, 'delay.wet', 0);
    const maxDelaySeconds =
      Math.max(
        readNumber(parameters, 'delay.left_ms', 0),
        readNumber(parameters, 'delay.right_ms', 0)
      ) / 1000;

    if (wet > WET_EPSILON && maxDelaySeconds > 0) {
      return Math.max(MIN_SILENCE_SECONDS, maxDelaySeconds + DELAY_SILENCE_GUARD_SECONDS);
    }
  }

  return MIN_SILENCE_SECONDS;
}

export function secondsToBlocks(seconds: number, blockSize = BLOCK_SIZE, sampleRate = SAMPLE_RATE): number {
  return Math.max(1, Math.round((seconds * sampleRate) / blockSize));
}
