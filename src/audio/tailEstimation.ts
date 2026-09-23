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

/** Physical maximum delay time; mirrors VOCAL_FX_MAX_DELAY_SECONDS (2.0 s) in voxP4. */
export const MAX_DELAY_MS = 2000;
/** StereoDelay::set_times clamps the delay to at least one sample. */
export const MIN_DELAY_MS = 1000 / SAMPLE_RATE;

/** Tempo clamp; mirrors tempo_clamp_bpm()/TEMPO_BPM_MIN/MAX in voxP4. */
export const MIN_TEMPO_BPM = 30;
export const MAX_TEMPO_BPM = 300;
export const DEFAULT_TEMPO_BPM = 120;

/** Canonical subdivision order; matches the V1 contract and the C++ enum. */
export const TEMPO_SUBDIVISION_NAMES = [
  'Whole',
  'Half',
  'Quarter',
  'Eighth',
  'Sixteenth',
  'ThirtySecond',
  'DottedHalf',
  'DottedQuarter',
  'DottedEighth',
  'DottedSixteenth',
  'TripletQuarter',
  'TripletEighth',
  'TripletSixteenth',
] as const;

/** Ratios relative to a quarter note; mirrors tempo_subdivision_ratio() in voxP4. */
export const TEMPO_SUBDIVISION_RATIOS = [
  4.0,
  2.0,
  1.0,
  0.5,
  0.25,
  0.125,
  3.0,
  1.5,
  0.75,
  0.375,
  2.0 / 3.0,
  1.0 / 3.0,
  1.0 / 6.0,
] as const;

/** Name -> canonical index map for readability in tests and callers. */
export const SUBDIVISION_INDEX: Readonly<Record<string, number>> = TEMPO_SUBDIVISION_NAMES.reduce(
  (acc, name, index) => {
    acc[name] = index;
    return acc;
  },
  {} as Record<string, number>
);

/** Spatial routing values; mirrors SpatialFxRouting in voxP4. */
export const SPATIAL_ROUTING_PARALLEL = 0;
export const SPATIAL_ROUTING_DELAY_INTO_REVERB = 1;

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
 * Clamps BPM exactly like the DSP (tempo_clamp_bpm): non-finite -> default,
 * otherwise bounded to [MIN_TEMPO_BPM, MAX_TEMPO_BPM].
 */
export function clampTempoBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return DEFAULT_TEMPO_BPM;
  if (bpm < MIN_TEMPO_BPM) return MIN_TEMPO_BPM;
  if (bpm > MAX_TEMPO_BPM) return MAX_TEMPO_BPM;
  return bpm;
}

/**
 * Ratio for a subdivision index. Invalid indices fall back to Quarter (1.0),
 * matching the default branch of tempo_subdivision_ratio() in the DSP.
 */
export function tempoSubdivisionRatio(subdivision: number): number {
  if (!Number.isFinite(subdivision)) return 1.0;
  const index = Math.round(subdivision);
  if (index < 0 || index >= TEMPO_SUBDIVISION_RATIOS.length) return 1.0;
  return TEMPO_SUBDIVISION_RATIOS[index];
}

/**
 * Duration in milliseconds of a subdivision at the given BPM.
 * Mirrors tempo_subdivision_ms() in voxP4.
 */
export function tempoSubdivisionMs(bpm: number, subdivision: number): number {
  return (60000 / clampTempoBpm(bpm)) * tempoSubdivisionRatio(subdivision);
}

export interface EffectiveDelayTimes {
  leftMs: number;
  rightMs: number;
  maxMs: number;
}

function clampDelayMs(ms: number): number {
  if (!Number.isFinite(ms)) return MIN_DELAY_MS;
  return Math.min(Math.max(ms, MIN_DELAY_MS), MAX_DELAY_MS);
}

/**
 * Resolves the delay times actually used by the DSP.
 *
 * When `delay.sync_enable` is active the DSP ignores the manual
 * `delay.left_ms` / `delay.right_ms` values and derives the times from
 * `tempo.bpm` and the left/right subdivisions (vocal_fx.cpp update_delay_times).
 * Both paths are clamped to the physical delay-line range exactly like
 * StereoDelay::set_times().
 */
export function resolveEffectiveDelayTimes(parameters: Record<string, number>): EffectiveDelayTimes {
  let leftMs: number;
  let rightMs: number;

  if (isEnabled(parameters, 'delay.sync_enable')) {
    const bpm = readNumber(parameters, 'tempo.bpm', DEFAULT_TEMPO_BPM);
    leftMs = tempoSubdivisionMs(bpm, readNumber(parameters, 'delay.left_subdivision', 0));
    rightMs = tempoSubdivisionMs(bpm, readNumber(parameters, 'delay.right_subdivision', 0));
  } else {
    leftMs = readNumber(parameters, 'delay.left_ms', 0);
    rightMs = readNumber(parameters, 'delay.right_ms', 0);
  }

  const clampedLeft = clampDelayMs(leftMs);
  const clampedRight = clampDelayMs(rightMs);
  return { leftMs: clampedLeft, rightMs: clampedRight, maxMs: Math.max(clampedLeft, clampedRight) };
}

/**
 * True when the spatial routing sends the delay wet signal into the reverb
 * input (SpatialFxRouting::DelayIntoReverb). The DSP send is exactly 1.0 for
 * this routing. Missing routing defaults to the contract default (serial).
 */
export function isDelayIntoReverb(parameters: Record<string, number>): boolean {
  const routing = Math.round(
    readNumber(parameters, 'output.spatial_routing', SPATIAL_ROUTING_DELAY_INTO_REVERB)
  );
  return routing === SPATIAL_ROUTING_DELAY_INTO_REVERB;
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
    // Use the DSP-effective delay times (BPM sync aware, physically clamped).
    const maxDelaySeconds = resolveEffectiveDelayTimes(parameters).maxMs / 1000;

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

  // When routing is serial (DelayIntoReverb), the last audible delay repeat can
  // excite the reverb tank again, so the worst case is the sum of both tails.
  // Only apply this when both effects actually produce a tail.
  const bothActive = delayTail > 0 && reverbTail > 0;
  const serial = bothActive && isDelayIntoReverb(parameters);
  const combined = serial
    ? Math.max(delayTail, reverbTail, delayTail + reverbTail)
    : Math.max(delayTail, reverbTail);

  const estimated = Math.max(MIN_TAIL_SECONDS, combined);
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
    const maxDelaySeconds = resolveEffectiveDelayTimes(parameters).maxMs / 1000;

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
    const maxDelaySeconds = resolveEffectiveDelayTimes(parameters).maxMs / 1000;

    if (wet > WET_EPSILON && maxDelaySeconds > 0) {
      return Math.max(MIN_SILENCE_SECONDS, maxDelaySeconds + DELAY_SILENCE_GUARD_SECONDS);
    }
  }

  return MIN_SILENCE_SECONDS;
}

export function secondsToBlocks(seconds: number, blockSize = BLOCK_SIZE, sampleRate = SAMPLE_RATE): number {
  return Math.max(1, Math.round((seconds * sampleRate) / blockSize));
}
