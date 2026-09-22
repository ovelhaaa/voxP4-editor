import { describe, it, expect } from 'vitest';
import { captureTail } from '../src/audio/tailProcessor';
import { BLOCK_SIZE, SAMPLE_RATE } from '../src/audio/tailEstimation';

/** Builds a step function that emits a sequence of per-block amplitudes. */
function makeStep(amplitudes: Array<[number, number]>) {
  let index = 0;
  return (left: Float32Array, right: Float32Array, count: number): boolean => {
    if (index >= amplitudes.length) return false;
    const [l, r] = amplitudes[index++];
    left.fill(l, 0, count);
    right.fill(r, 0, count);
    return true;
  };
}

function loudBlocks(seconds: number, amplitude = 0.5): Array<[number, number]> {
  const blocks = Math.round((seconds * SAMPLE_RATE) / BLOCK_SIZE);
  return Array.from({ length: blocks }, () => [amplitude, amplitude] as [number, number]);
}

describe('Tail capture algorithm', () => {
  it('captures a tail longer than 4 seconds when the signal keeps ringing', () => {
    const result = captureTail({
      maxTailSeconds: 30,
      minTailCheckSeconds: 0.4,
      step: makeStep(loudBlocks(6.0)),
    });

    expect(result).not.toBeNull();
    expect(result!.tailDurationSeconds).toBeGreaterThan(4.0);
    expect(result!.left.length).toBe(result!.right.length);
  });

  it('early-exits on sustained silence after the minimum check window', () => {
    const amplitudes = [...loudBlocks(0.2), ...loudBlocks(5.0, 0)];
    const result = captureTail({
      maxTailSeconds: 30,
      minTailCheckSeconds: 0.4,
      step: makeStep(amplitudes),
    });

    expect(result).not.toBeNull();
    expect(result!.tailDurationSeconds).toBeLessThan(0.60);
    expect(result!.tailDurationSeconds).toBeGreaterThan(0.0);
  });

  it('does not declare silence before a long configured delay has elapsed', () => {
    // Silent until 1.9 s, a single echo block at 1.9 s, then silence.
    // With a 2.1 s check/silence window, the echo must be preserved.
    const silenceBlocks = Math.round((1.9 * SAMPLE_RATE) / BLOCK_SIZE);
    const amplitudes: Array<[number, number]> = [
      ...Array.from({ length: silenceBlocks }, () => [0, 0] as [number, number]),
      [0.5, 0.5],
      ...loudBlocks(5.0, 0),
    ];

    const result = captureTail({
      maxTailSeconds: 30,
      minTailCheckSeconds: 2.1,
      minSilenceSeconds: 2.1,
      step: makeStep(amplitudes),
    });

    expect(result).not.toBeNull();
    // Trailing silence is trimmed, but the late echo at 1.9 s must survive.
    expect(result!.tailDurationSeconds).toBeGreaterThan(1.9);

    const echoIndex = silenceBlocks * BLOCK_SIZE;
    expect(Math.abs(result!.left[echoIndex])).toBeGreaterThan(0);
  });

  it('returns null when the task is aborted', () => {
    const result = captureTail({
      maxTailSeconds: 30,
      minTailCheckSeconds: 0.4,
      shouldAbort: () => true,
      step: makeStep(loudBlocks(1.0)),
    });
    expect(result).toBeNull();
  });
});
