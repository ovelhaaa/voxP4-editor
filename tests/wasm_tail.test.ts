import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { captureTail } from '../src/audio/tailProcessor';
import {
  estimateMaxTailSeconds,
  estimateMinTailCheckSeconds,
  estimateMinSilenceSeconds,
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
    inputFrames: number,
    maxTailOverride?: number
  ) {
    resetParams();
    for (const [key, value] of Object.entries(params)) {
      if (!setParam(key, value)) {
        throw new Error(`DSP rejected parameter: ${key}`);
      }
    }
    resetDsp();

    const input = syntheticInput(inputFrames);
    const bytes = inputFrames * 4;
    const inPtr = mod._malloc(bytes);
    const outLPtr = mod._malloc(bytes);
    const outRPtr = mod._malloc(bytes);
    mod.HEAPF32.set(input, inPtr >> 2);

    const primaryOk = render(inPtr, inputFrames, outLPtr, outRPtr);
    const sourceL = new Float32Array(
      mod.HEAPF32.subarray(outLPtr >> 2, (outLPtr >> 2) + inputFrames)
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

    return { sourceL, tail, primaryOk };
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
});
