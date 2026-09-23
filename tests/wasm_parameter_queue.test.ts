import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import parameterContract from '../contracts/voxp4-parameters-v1.json';

/**
 * Regression suite for the WASM preview bridge parameter-queue lifecycle.
 *
 * The original bug: `voxp4_preview_reset_parameters()` only enqueued 71
 * defaults without draining them, then the worker enqueued the 71 resolved
 * values on top. With a ParameterQueue<128> (sentinel -> 127 usable slots),
 * the 57th resolved parameter (`chorus.sync_enable`) was rejected and every
 * subsequent render failed with "Failed to reset DSP parameters to defaults".
 *
 * These tests exercise the real WASM with the FULL canonical parameter set,
 * which the earlier subset-based parity tests never did.
 */
describe('WASM bridge: full parameter queue lifecycle', () => {
  const SAMPLE_RATE = 48000;
  const BLOCK_SIZE = 64;

  let wasmModule: any = null;
  let setParam: (key: string, value: number) => boolean;
  let resetParams: () => boolean;
  let resetDsp: () => void;
  let render: (inPtr: number, frames: number, lPtr: number, rPtr: number) => boolean;

  const parameters = parameterContract.parameters as Array<{
    key: string;
    default: number;
    type: string;
  }>;

  beforeAll(async () => {
    const wasmPath = path.resolve(__dirname, '../src/audio/wasm/voxp4-preview.wasm');
    const wasmBinary = fs.readFileSync(wasmPath);
    const mjsPath = path.resolve(__dirname, '../src/audio/wasm/voxp4-preview.mjs');
    const createModule = (await import(mjsPath)).default;
    wasmModule = await createModule({ wasmBinary });

    setParam = wasmModule.cwrap('voxp4_preview_set_parameter', 'boolean', ['string', 'number']);
    resetParams = wasmModule.cwrap('voxp4_preview_reset_parameters', 'boolean', []);
    resetDsp = wasmModule.cwrap('voxp4_preview_reset', null, []);
    render = wasmModule.cwrap('voxp4_preview_render', 'boolean', [
      'number',
      'number',
      'number',
      'number',
    ]);

    expect(wasmModule._voxp4_preview_init(SAMPLE_RATE, BLOCK_SIZE)).toBeTruthy();
  });

  function applyAllParameters(): { accepted: number; rejected: string[] } {
    let accepted = 0;
    const rejected: string[] = [];
    for (const param of parameters) {
      if (setParam(param.key, param.default)) {
        accepted++;
      } else {
        rejected.push(param.key);
      }
    }
    return { accepted, rejected };
  }

  function renderOneBlock(): boolean {
    const frames = BLOCK_SIZE;
    const bytes = frames * 4;
    const inPtr = wasmModule._malloc(bytes);
    const lPtr = wasmModule._malloc(bytes);
    const rPtr = wasmModule._malloc(bytes);
    try {
      wasmModule.HEAPF32.fill(0, inPtr >> 2, (inPtr >> 2) + frames);
      return render(inPtr, frames, lPtr, rPtr);
    } finally {
      wasmModule._free(inPtr);
      wasmModule._free(lPtr);
      wasmModule._free(rPtr);
    }
  }

  function fullCycle(): void {
    expect(resetParams()).toBeTruthy();
    const { accepted, rejected } = applyAllParameters();
    expect(rejected).toEqual([]);
    expect(accepted).toBe(parameters.length);
    resetDsp();
    expect(renderOneBlock()).toBeTruthy();
  }

  it('accepts all 71 canonical parameters after reset and renders a block', () => {
    expect(parameters.length).toBe(71);
    expect(resetParams()).toBeTruthy();

    const { accepted, rejected } = applyAllParameters();
    expect(rejected).toEqual([]);
    expect(accepted).toBe(71);

    // The exact parameter that used to be rejected as #57.
    expect(setParam('chorus.sync_enable', 1)).toBeTruthy();

    resetDsp();
    expect(renderOneBlock()).toBeTruthy();
  });

  it('survives 5+ consecutive reset -> apply-71 -> render cycles', () => {
    for (let cycle = 0; cycle < 6; cycle++) {
      fullCycle();
    }
  });

  it('recovers a previously saturated parameter queue', () => {
    // Start from a clean state, then deliberately saturate the bounded queue.
    expect(resetParams()).toBeTruthy();
    let accepted = 0;
    let rejectedCount = 0;
    for (let i = 0; i < 200; i++) {
      if (setParam('reverb.wet', 0.5)) accepted++;
      else rejectedCount++;
    }
    expect(accepted).toBe(127); // ParameterQueue<128> keeps one sentinel slot
    expect(rejectedCount).toBeGreaterThan(0);

    // The transactional reset must drain the stale queue and recover.
    expect(resetParams()).toBeTruthy();
    const { rejected } = applyAllParameters();
    expect(rejected).toEqual([]);
    expect(setParam('chorus.sync_enable', 1)).toBeTruthy();

    resetDsp();
    expect(renderOneBlock()).toBeTruthy();
  });

  it('mirrors the worker lifecycle across successive parameter changes', () => {
    const runWorkerStyleRender = (overrides: Record<string, number>) => {
      expect(resetParams()).toBeTruthy();
      const { accepted, rejected } = applyAllParameters();
      expect(rejected).toEqual([]);
      expect(accepted).toBe(71);
      for (const [key, value] of Object.entries(overrides)) {
        expect(setParam(key, value)).toBeTruthy();
      }
      resetDsp();
      expect(renderOneBlock()).toBeTruthy();
    };

    runWorkerStyleRender({ 'reverb.wet': 0.4, 'chorus.sync_enable': 1 });
    runWorkerStyleRender({ 'reverb.wet': 0.8, 'delay.wet': 0.3, 'chorus.sync_enable': 0 });
    runWorkerStyleRender({ 'harmony.enable': 1 });
  });
});
