import { BLOCK_SIZE, SAMPLE_RATE, secondsToBlocks } from './tailEstimation';

/**
 * Threshold below which a block is considered silent (~-80 dBFS).
 */
export const SILENCE_THRESHOLD_RMS = 1e-4;
export const MIN_SILENCE_SECONDS = 0.25;
/** Number of trailing silent blocks retained so a natural fade-out is not clipped. */
export const SILENCE_TRIM_HEADROOM_BLOCKS = 4;

export interface CaptureTailOptions {
  readonly maxTailSeconds: number;
  readonly minTailCheckSeconds: number;
  readonly blockSize?: number;
  readonly sampleRate?: number;
  readonly silenceThresholdRms?: number;
  readonly minSilenceSeconds?: number;
  /** Returns true when the enclosing task was superseded/cancelled. */
  readonly shouldAbort?: () => boolean;
  /**
   * Renders the next zero-input block into the provided buffers.
   * Must return false to stop (e.g. DSP failure).
   */
  readonly step: (left: Float32Array, right: Float32Array, count: number) => boolean;
}

export interface CapturedTail {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly tailDurationSeconds: number;
}

/**
 * Grows geometrically to amortize allocations while avoiding thousands of
 * tiny per-block Float32Array objects during long tails.
 */
class Float32Accumulator {
  private buffer: Float32Array;
  private length = 0;

  constructor(initialFrames = 4096) {
    this.buffer = new Float32Array(initialFrames);
  }

  append(source: Float32Array, count: number): void {
    const needed = this.length + count;
    if (needed > this.buffer.length) {
      let capacity = this.buffer.length;
      while (capacity < needed) capacity *= 2;
      const grown = new Float32Array(capacity);
      grown.set(this.buffer.subarray(0, this.length));
      this.buffer = grown;
    }
    this.buffer.set(source.subarray(0, count), this.length);
    this.length += count;
  }

  get frames(): number {
    return this.length;
  }

  copyInto(destination: Float32Array, frames: number): void {
    destination.set(this.buffer.subarray(0, Math.min(frames, this.length)));
  }
}

/**
 * Renders and captures the DSP decay tail after the primary render.
 *
 * Silence early-exit still applies, but never before `minTailCheckSeconds` has
 * elapsed, so long configured delays are not truncated before their repeats.
 * Returns null if the task is aborted.
 */
export function captureTail(options: CaptureTailOptions): CapturedTail | null {
  const {
    maxTailSeconds,
    minTailCheckSeconds,
    blockSize = BLOCK_SIZE,
    sampleRate = SAMPLE_RATE,
    silenceThresholdRms = SILENCE_THRESHOLD_RMS,
    minSilenceSeconds = MIN_SILENCE_SECONDS,
    shouldAbort,
    step,
  } = options;

  const maxBlocks = secondsToBlocks(maxTailSeconds, blockSize, sampleRate);
  const minTailCheckBlocks = secondsToBlocks(minTailCheckSeconds, blockSize, sampleRate);
  const minSilenceBlocks = Math.max(1, secondsToBlocks(minSilenceSeconds, blockSize, sampleRate));

  const leftStore = new Float32Accumulator(blockSize * 16);
  const rightStore = new Float32Accumulator(blockSize * 16);

  const blockLeft = new Float32Array(blockSize);
  const blockRight = new Float32Array(blockSize);

  let consecutiveSilence = 0;
  let renderedBlocks = 0;

  for (let block = 0; block < maxBlocks; block++) {
    if (shouldAbort && shouldAbort()) {
      return null;
    }

    if (!step(blockLeft, blockRight, blockSize)) {
      break;
    }
    renderedBlocks++;

    let sumSquares = 0;
    for (let i = 0; i < blockSize; i++) {
      sumSquares += blockLeft[i] * blockLeft[i] + blockRight[i] * blockRight[i];
    }
    const rms = Math.sqrt(sumSquares / (blockSize * 2));

    leftStore.append(blockLeft, blockSize);
    rightStore.append(blockRight, blockSize);

    consecutiveSilence = rms < silenceThresholdRms ? consecutiveSilence + 1 : 0;

    if (block >= minTailCheckBlocks && consecutiveSilence >= minSilenceBlocks) {
      break;
    }
  }

  const trimBlocks = Math.max(0, consecutiveSilence - SILENCE_TRIM_HEADROOM_BLOCKS);
  const finalBlocks = Math.max(0, renderedBlocks - trimBlocks);
  const tailFrames = finalBlocks * blockSize;

  const left = new Float32Array(tailFrames);
  const right = new Float32Array(tailFrames);
  leftStore.copyInto(left, tailFrames);
  rightStore.copyInto(right, tailFrames);

  return {
    left,
    right,
    tailDurationSeconds: tailFrames / sampleRate,
  };
}
