import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { captureTail } from '../src/audio/tailProcessor';
import {
  estimateMaxTailSeconds,
  estimateMinTailCheckSeconds,
  estimateMinSilenceSeconds,
  resolveEffectiveDelayTimes,
  SUBDIVISION_INDEX,
  BLOCK_SIZE,
  SAMPLE_RATE,
} from '../src/audio/tailEstimation';

const ALL_OFF: Record<string, number> = {
  'gate.enable': 0,
  'compressor.enable': 0,
  'drive.enable': 0,
  'chorus.enable': 0,
  'delay.enable': 0,
  'reverb.enable': 0,
  'harmony.enable': 0,
};

describe('Worker tail algorithm + real WASM DSP', () => {
  let mod: any = null;
  let setParam: (key: string, value: number) => boolean;
  let resetParams: () => boolean;
  let resetDsp: () => void;
  let render: (inPtr: number, frames: number, lPtr: number, rPtr: number) => boolean;

  beforeAll(async () => {
    const wasmBinary = fs.readFileSync(
      path.resolve(__dirname, '../src/audio/wasm/voxp4-preview.wasm')
    );
    const mjsPath = path.resolve(__dirname, '../src/audio/wasm/voxp4-preview.mjs');
    const createModule = (await import(mjsPath)).default;
    mod = await createModule({ wasmBinary });
    mod._voxp4_preview_init(SAMPLE_RATE, BLOCK_SIZE);

    setParam = mod.cwrap('voxp4_preview_set_parameter', 'boolean', ['string', 'number']);
    resetParams = mod.cwrap('voxp4_preview_reset_parameters', 'boolean', []);
    resetDsp = mod.cwrap('voxp4_preview_reset', null, []);
    render = mod.cwrap('voxp4_preview_render', 'boolean', ['number', 'number', 'number', 'number']);
  });

  function syntheticInput(frames: number): Float32Array {
    let prngState = 0x12345678;
    const input = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      prngState = (Math.imul(prngState, 1664525) + 1013904223) | 0;
      const noise = (prngState >> 0) / 2147483648.0;
      const t = i / SAMPLE_RATE;
      input[i] =
        0.35 * Math.sin(2.0 * Math.PI * 220.0 * t) +
        0.15 * Math.sin(2.0 * Math.PI * 440.0 * t) +
        0.03 * noise;
    }
    return input;
  }

  function runScenario(
    params: Record<string, number>,
    inputOrFrames: number | Float32Array,
    maxTailOverride?: number
  ) {
    const input = typeof inputOrFrames === 'number' ? syntheticInput(inputOrFrames) : inputOrFrames;
    const inputFrames = input.length;

    resetParams();
    for (const [key, value] of Object.entries(params)) {
      if (!setParam(key, value)) {
        throw new Error(`DSP rejected parameter: ${key}`);
      }
    }
    resetDsp();

    const bytes = inputFrames * 4;
    const inPtr = mod._malloc(bytes);
    const outLPtr = mod._malloc(bytes);
    const outRPtr = mod._malloc(bytes);
    mod.HEAPF32.set(input, inPtr >> 2);

    const primaryOk = render(inPtr, inputFrames, outLPtr, outRPtr);
    const sourceL = new Float32Array(
      mod.HEAPF32.subarray(outLPtr >> 2, (outLPtr >> 2) + inputFrames)
    );
    const sourceR = new Float32Array(
      mod.HEAPF32.subarray(outRPtr >> 2, (outRPtr >> 2) + inputFrames)
    );

    const zeroBytes = BLOCK_SIZE * 4;
    const zeroInPtr = mod._malloc(zeroBytes);
    const tailLPtr = mod._malloc(zeroBytes);
    const tailRPtr = mod._malloc(zeroBytes);
    mod.HEAPF32.fill(0, zeroInPtr >> 2, (zeroInPtr >> 2) + BLOCK_SIZE);

    const maxTailSeconds = maxTailOverride ?? estimateMaxTailSeconds(params);
    const tail = captureTail({
      maxTailSeconds,
      minTailCheckSeconds: estimateMinTailCheckSeconds(params),
      minSilenceSeconds: estimateMinSilenceSeconds(params),
      step: (blockL, blockR, count) => {
        const okBlock = render(zeroInPtr, count, tailLPtr, tailRPtr);
        if (!okBlock) return false;
        blockL.set(mod.HEAPF32.subarray(tailLPtr >> 2, (tailLPtr >> 2) + count));
        blockR.set(mod.HEAPF32.subarray(tailRPtr >> 2, (tailRPtr >> 2) + count));
        return true;
      },
    });

    mod._free(inPtr);
    mod._free(outLPtr);
    mod._free(outRPtr);
    mod._free(zeroInPtr);
    mod._free(tailLPtr);
    mod._free(tailRPtr);

    return { sourceL, sourceR, tail, primaryOk, inputFrames };
  }

  /** Concatenates the primary output and the captured tail for analysis. */
  function assembleFull(source: Float32Array, tail: Float32Array | null): Float32Array {
    const tailFrames = tail ? tail.length : 0;
    const full = new Float32Array(source.length + tailFrames);
    full.set(source, 0);
    if (tail) full.set(tail, source.length);
    return full;
  }

  /** Returns the time (seconds) of the maximum |sample| inside [startSec, endSec). */
  function peakTime(samples: Float32Array, startSec: number, endSec: number): number {
    const start = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
    const end = Math.min(samples.length, Math.ceil(endSec * SAMPLE_RATE));
    let best = -1;
    let bestValue = -1;
    for (let i = start; i < end; i++) {
      const value = Math.abs(samples[i]);
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }
    return best < 0 ? -1 : best / SAMPLE_RATE;
  }

  /** Peak absolute amplitude inside [startSec, endSec). */
  function windowEnergy(samples: Float32Array, startSec: number, endSec: number): number {
    const start = Math.max(0, Math.floor(startSec * SAMPLE_RATE));
    const end = Math.min(samples.length, Math.ceil(endSec * SAMPLE_RATE));
    let sum = 0;
    for (let i = start; i < end; i++) sum += Math.abs(samples[i]);
    return sum;
  }

  it('Dry chain produces a minimal tail', () => {
    const inputFrames = Math.round(0.5 * SAMPLE_RATE);
    const { tail, primaryOk } = runScenario(ALL_OFF, inputFrames);
    expect(primaryOk).toBeTruthy();
    expect(tail).not.toBeNull();
    expect(tail!.tailDurationSeconds).toBeLessThan(0.5);
  });

  it('ReverbWet > 0 with ~2 s decay lengthens the output beyond the input', () => {
    const inputFrames = Math.round(0.5 * SAMPLE_RATE);
    const { tail } = runScenario(
      { ...ALL_OFF, 'reverb.enable': 1, 'reverb.wet': 0.5, 'reverb.decay_s': 2.0 },
      inputFrames
    );
    expect(tail).not.toBeNull();
    expect(tail!.left.length).toBeGreaterThan(0);
    expect(inputFrames + tail!.left.length).toBeGreaterThan(inputFrames);
    expect(tail!.tailDurationSeconds).toBeGreaterThan(1.0);
  });

  it('Long reverb decay produces a real tail longer than 4 seconds', () => {
    const { tail } = runScenario(
      { ...ALL_OFF, 'reverb.enable': 1, 'reverb.wet': 0.6, 'reverb.decay_s': 10.0 },
      Math.round(0.5 * SAMPLE_RATE)
    );
    expect(tail).not.toBeNull();
    expect(tail!.tailDurationSeconds).toBeGreaterThan(4.0);
  });

  it('Long delay preserves repeats spaced a full delay period apart', () => {
    const inputFrames = Math.round(0.2 * SAMPLE_RATE);
    const { tail } = runScenario(
      {
        ...ALL_OFF,
        'delay.enable': 1,
        'delay.left_ms': 2000,
        'delay.right_ms': 2000,
        'delay.feedback': 0.6,
        'delay.wet': 0.6,
      },
      inputFrames,
      6.0
    );

    expect(tail).not.toBeNull();
    // Must survive past the second repeat (~3.8 s into the tail).
    expect(tail!.tailDurationSeconds).toBeGreaterThan(3.5);

    let secondRepeatEnergy = 0;
    const start = Math.round(3.7 * SAMPLE_RATE);
    const end = Math.round(4.1 * SAMPLE_RATE);
    for (let i = start; i < end && i < tail!.left.length; i++) {
      secondRepeatEnergy += Math.abs(tail!.left[i]);
    }
    expect(secondRepeatEnergy).toBeGreaterThan(0);
  });

  it('Delay BPM sync places echoes at subdivision times and ignores manual ms', () => {
    const impulse = new Float32Array(64);
    impulse[0] = 1.0;

    const synced = runScenario(
      {
        ...ALL_OFF,
        'delay.enable': 1,
        'delay.wet': 1.0,
        'delay.dry': 0,
        'delay.feedback': 0,
        'delay.sync_enable': 1,
        'tempo.bpm': 120,
        'delay.left_subdivision': SUBDIVISION_INDEX.Eighth, // 250 ms
        'delay.right_subdivision': SUBDIVISION_INDEX.DottedEighth, // 375 ms
        'delay.left_ms': 100, // deliberately wrong, must be ignored
        'delay.right_ms': 100,
        'output.spatial_routing': 0,
      },
      impulse,
      1.0
    );

    const effective = resolveEffectiveDelayTimes({
      ...ALL_OFF,
      'delay.sync_enable': 1,
      'tempo.bpm': 120,
      'delay.left_subdivision': SUBDIVISION_INDEX.Eighth,
      'delay.right_subdivision': SUBDIVISION_INDEX.DottedEighth,
    });
    expect(effective.leftMs).toBeCloseTo(250, 3);
    expect(effective.rightMs).toBeCloseTo(375, 3);

    const fullL = assembleFull(synced.sourceL, synced.tail ? synced.tail.left : null);
    const fullR = assembleFull(synced.sourceR, synced.tail ? synced.tail.right : null);

    const leftEcho = peakTime(fullL, 0.18, 0.32);
    const rightEcho = peakTime(fullR, 0.3, 0.45);
    expect(leftEcho).toBeGreaterThan(0.225);
    expect(leftEcho).toBeLessThan(0.275);
    expect(rightEcho).toBeGreaterThan(0.35);
    expect(rightEcho).toBeLessThan(0.4);

    // The manual 100 ms times were not used: no significant echo there.
    expect(windowEnergy(fullL, 0.07, 0.13)).toBeLessThan(windowEnergy(fullL, 0.22, 0.28));
    expect(windowEnergy(fullR, 0.07, 0.13)).toBeLessThan(windowEnergy(fullR, 0.34, 0.4));
  });

  it('Delay sync disabled uses the manual left/right times', () => {
    const impulse = new Float32Array(64);
    impulse[0] = 1.0;

    const manual = runScenario(
      {
        ...ALL_OFF,
        'delay.enable': 1,
        'delay.wet': 1.0,
        'delay.feedback': 0,
        'delay.sync_enable': 0,
        'delay.left_ms': 100,
        'delay.right_ms': 150,
        'output.spatial_routing': 0,
      },
      impulse,
      1.0
    );

    const fullL = assembleFull(manual.sourceL, manual.tail ? manual.tail.left : null);
    const fullR = assembleFull(manual.sourceR, manual.tail ? manual.tail.right : null);

    const leftEcho = peakTime(fullL, 0.07, 0.14);
    const rightEcho = peakTime(fullR, 0.12, 0.2);
    expect(leftEcho).toBeGreaterThan(0.075);
    expect(leftEcho).toBeLessThan(0.135);
    expect(rightEcho).toBeGreaterThan(0.125);
    expect(rightEcho).toBeLessThan(0.195);
  });

  it('DelayIntoReverb serial routing produces a longer tail than Parallel', () => {
    // A single late delay echo (feedback 0) re-excites a 2 s reverb tank in the
    // serial routing, while in Parallel that echo never reaches the reverb.
    const common: Record<string, number> = {
      ...ALL_OFF,
      'delay.enable': 1,
      'delay.wet': 0.9,
      'delay.left_ms': 1000,
      'delay.right_ms': 1000,
      'delay.feedback': 0,
      'reverb.enable': 1,
      'reverb.wet': 0.7,
      'reverb.decay_s': 2.0,
    };

    const parallel = runScenario({ ...common, 'output.spatial_routing': 0 }, Math.round(0.4 * SAMPLE_RATE), 10);
    const serial = runScenario({ ...common, 'output.spatial_routing': 1 }, Math.round(0.4 * SAMPLE_RATE), 10);

    expect(parallel.tail).not.toBeNull();
    expect(serial.tail).not.toBeNull();

    // The serial chain re-excites the reverb with the delayed repeat, so its real
    // tail must exceed the parallel (pure max) tail by roughly one delay period.
    expect(serial.tail!.tailDurationSeconds).toBeGreaterThan(
      parallel.tail!.tailDurationSeconds + 0.5
    );

    // Sanity: the estimator also predicts a larger cap for the serial case.
    const serialEstimate = estimateMaxTailSeconds({ ...common, 'output.spatial_routing': 1 });
    expect(serialEstimate).toBeGreaterThan(
      estimateMaxTailSeconds({ ...common, 'output.spatial_routing': 0 })
    );
  });
});
