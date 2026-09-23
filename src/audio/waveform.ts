/**
 * Waveform envelope pre-computation.
 *
 * Drawing a full-resolution sample buffer on every animation frame is
 * wasteful. Instead we reduce the dry source to a small min/max bucket
 * envelope once per source (and bucket count). The renderer then draws at
 * most `bucketCount * 2` line segments, independent of sample length.
 */

export interface WaveformEnvelope {
  readonly bucketCount: number;
  readonly min: Float32Array;
  readonly max: Float32Array;
}

/** Reasonable on-screen bucket target for a typical editor gutter. */
export const DEFAULT_WAVEFORM_BUCKETS = 1024;

/**
 * Reduces a mono sample buffer to min/max buckets. Returns an empty envelope
 * for empty input (never throws).
 */
export function computeWaveformEnvelope(
  samples: Float32Array,
  bucketCount: number = DEFAULT_WAVEFORM_BUCKETS
): WaveformEnvelope {
  const buckets = Math.max(1, Math.floor(bucketCount));
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);

  const length = samples.length;
  if (length === 0) {
    return { bucketCount: buckets, min, max };
  }

  const samplesPerBucket = length / buckets;

  let cursor = 0;
  for (let b = 0; b < buckets; b++) {
    const start = Math.min(length - 1, Math.floor(b * samplesPerBucket));
    const endExclusive = Math.max(start + 1, Math.min(length, Math.floor((b + 1) * samplesPerBucket)));

    let lo = samples[start];
    let hi = samples[start];
    for (let i = start + 1; i < endExclusive; i++) {
      const v = samples[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[b] = lo;
    max[b] = hi;
    cursor = endExclusive;
  }

  // Guard: a single trailing sample can be missed by the floor math above.
  if (cursor < length) {
    const last = buckets - 1;
    if (samples[cursor] < min[last]) min[last] = samples[cursor];
    if (samples[cursor] > max[last]) max[last] = samples[cursor];
  }

  return { bucketCount: buckets, min, max };
}
