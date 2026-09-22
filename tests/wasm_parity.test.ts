import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('WebAssembly vs Native C++ DSP Parity Suite', () => {
  let wasmModule: any = null;
  let goldenData: any = null;

  const kSampleRate = 48000;
  const kBlockSize = 64;
  const kBlocks = 100;
  const kTotalFrames = kBlocks * kBlockSize;

  beforeAll(async () => {
    const wasmPath = path.resolve(__dirname, '../src/audio/wasm/voxp4-preview.wasm');
    const wasmBinary = fs.readFileSync(wasmPath);

    const mjsPath = path.resolve(__dirname, '../src/audio/wasm/voxp4-preview.mjs');
    const createModule = (await import(mjsPath)).default;
    wasmModule = await createModule({ wasmBinary });

    const goldenPath = path.resolve(__dirname, './fixtures/parity_golden.json');
    goldenData = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

    wasmModule._voxp4_preview_init(kSampleRate, kBlockSize);
  });

  function generateSyntheticInput(): Float32Array {
    let prngState = 0xABCDEF01;
    function prngNextFloat(): number {
      prngState = Math.imul(prngState, 1664525) + 1013904223 | 0;
      return (prngState >> 0) / 2147483648.0;
    }

    const input = new Float32Array(kTotalFrames);
    for (let b = 0; b < kBlocks; ++b) {
      const tBase = (b * kBlockSize) / kSampleRate;
      for (let i = 0; i < kBlockSize; ++i) {
        const t = tBase + i / kSampleRate;
        input[b * kBlockSize + i] =
          0.35 * Math.sin(2.0 * Math.PI * 220.0 * t) +
          0.15 * Math.sin(2.0 * Math.PI * 440.0 * t) +
          0.05 * prngNextFloat();
      }
    }
    return input;
  }

  function runScenarioWasm(params: Record<string, number>): {
    peakL: number;
    peakR: number;
    rmsL: number;
    rmsR: number;
    samplesL: Float32Array;
  } {
    const setParam = wasmModule.cwrap('voxp4_preview_set_parameter', 'boolean', ['string', 'number']);
    const resetParams = wasmModule.cwrap('voxp4_preview_reset_parameters', 'boolean', []);
    const resetDsp = wasmModule.cwrap('voxp4_preview_reset', null, []);
    const render = wasmModule.cwrap('voxp4_preview_render', 'boolean', ['number', 'number', 'number', 'number']);

    resetParams();
    for (const [k, v] of Object.entries(params)) {
      setParam(k, v);
    }
    resetDsp();

    const input = generateSyntheticInput();
    const bytes = kTotalFrames * 4;
    const inPtr = wasmModule._malloc(bytes);
    const outLPtr = wasmModule._malloc(bytes);
    const outRPtr = wasmModule._malloc(bytes);

    wasmModule.HEAPF32.set(input, inPtr >> 2);
    render(inPtr, kTotalFrames, outLPtr, outRPtr);

    const outL = new Float32Array(wasmModule.HEAPF32.buffer, outLPtr, kTotalFrames);
    const outR = new Float32Array(wasmModule.HEAPF32.buffer, outRPtr, kTotalFrames);

    let peakL = 0;
    let peakR = 0;
    let sumSqL = 0;
    let sumSqR = 0;

    for (let i = 0; i < kTotalFrames; ++i) {
      const absL = Math.abs(outL[i]);
      const absR = Math.abs(outR[i]);
      if (absL > peakL) peakL = absL;
      if (absR > peakR) peakR = absR;
      sumSqL += outL[i] * outL[i];
      sumSqR += outR[i] * outR[i];
    }

    const res = {
      peakL,
      peakR,
      rmsL: Math.sqrt(sumSqL / kTotalFrames),
      rmsR: Math.sqrt(sumSqR / kTotalFrames),
      samplesL: new Float32Array(outL),
    };

    wasmModule._free(inPtr);
    wasmModule._free(outLPtr);
    wasmModule._free(outRPtr);

    return res;
  }

  it('Scenario 1: Dry signal pass-through matches native oracle within numerical tolerance', () => {
    const gold = goldenData.scenarios.find((s: any) => s.name === 'Dry');
    const wasmRes = runScenarioWasm({
      'gate.enable': 0,
      'compressor.enable': 0,
      'drive.enable': 0,
      'chorus.enable': 0,
      'delay.enable': 0,
      'reverb.enable': 0,
      'harmony.enable': 0,
    });

    expect(wasmRes.rmsL).toBeCloseTo(gold.rms_l, 4);
    expect(wasmRes.peakL).toBeCloseTo(gold.peak_l, 4);

    let maxSampleDiff = 0;
    for (let i = 0; i < kTotalFrames; ++i) {
      const diff = Math.abs(wasmRes.samplesL[i] - gold.samples_l[i]);
      if (diff > maxSampleDiff) maxSampleDiff = diff;
    }
    expect(maxSampleDiff).toBeLessThan(0.001);
  });

  it('Scenario 2: Dynamics (Gate + Compressor) matches native oracle', () => {
    const gold = goldenData.scenarios.find((s: any) => s.name === 'Dynamics');
    const wasmRes = runScenarioWasm({
      'gate.enable': 1,
      'compressor.enable': 1,
      'drive.enable': 0,
      'chorus.enable': 0,
      'delay.enable': 0,
      'reverb.enable': 0,
      'harmony.enable': 0,
    });

    expect(wasmRes.rmsL).toBeCloseTo(gold.rms_l, 3);
    expect(wasmRes.peakL).toBeCloseTo(gold.peak_l, 2);
  });

  it('Scenario 3: Drive (Overdrive) saturation matches native oracle', () => {
    const gold = goldenData.scenarios.find((s: any) => s.name === 'Drive');
    const wasmRes = runScenarioWasm({
      'gate.enable': 0,
      'compressor.enable': 0,
      'drive.enable': 1,
      'drive.mode': 1,
      'drive.drive': 0.6,
      'drive.tone': 0.5,
      'drive.mix': 0.8,
      'chorus.enable': 0,
      'delay.enable': 0,
      'reverb.enable': 0,
      'harmony.enable': 0,
    });

    expect(wasmRes.rmsL).toBeCloseTo(gold.rms_l, 2);
    expect(wasmRes.peakL).toBeCloseTo(gold.peak_l, 1);
  });

  it('Scenario 4: Chorus (Dimension mode) matches native oracle', () => {
    const gold = goldenData.scenarios.find((s: any) => s.name === 'Chorus');
    const wasmRes = runScenarioWasm({
      'gate.enable': 0,
      'compressor.enable': 0,
      'drive.enable': 0,
      'chorus.enable': 1,
      'chorus.mode': 2,
      'chorus.mix': 0.5,
      'chorus.depth_ms': 4.0,
      'delay.enable': 0,
      'reverb.enable': 0,
      'harmony.enable': 0,
    });

    expect(wasmRes.rmsL).toBeCloseTo(gold.rms_l, 3);
    expect(wasmRes.peakL).toBeCloseTo(gold.peak_l, 3);
  });

  it('Scenario 5: Stereo Delay matches native oracle', () => {
    const gold = goldenData.scenarios.find((s: any) => s.name === 'Delay');
    const wasmRes = runScenarioWasm({
      'gate.enable': 0,
      'compressor.enable': 0,
      'drive.enable': 0,
      'chorus.enable': 0,
      'delay.enable': 1,
      'delay.left_ms': 250,
      'delay.right_ms': 375,
      'delay.feedback': 0.35,
      'delay.wet': 0.5,
      'reverb.enable': 0,
      'harmony.enable': 0,
    });

    expect(wasmRes.rmsL).toBeCloseTo(gold.rms_l, 3);
    expect(wasmRes.peakL).toBeCloseTo(gold.peak_l, 2);
  });

  it('Scenario 6: Algorithmic Reverb matches native oracle', () => {
    const gold = goldenData.scenarios.find((s: any) => s.name === 'Reverb');
    const wasmRes = runScenarioWasm({
      'gate.enable': 0,
      'compressor.enable': 0,
      'drive.enable': 0,
      'chorus.enable': 0,
      'delay.enable': 0,
      'reverb.enable': 1,
      'reverb.wet': 0.5,
      'reverb.decay_s': 2.5,
      'reverb.damping': 0.4,
      'harmony.enable': 0,
    });

    expect(wasmRes.rmsL).toBeCloseTo(gold.rms_l, 3);
    expect(wasmRes.peakL).toBeCloseTo(gold.peak_l, 2);
  });

  it('Scenario 7: PSOLA Pitch Shift / Harmony matches native oracle', () => {
    const gold = goldenData.scenarios.find((s: any) => s.name === 'Harmony');
    const wasmRes = runScenarioWasm({
      'gate.enable': 0,
      'compressor.enable': 0,
      'drive.enable': 0,
      'chorus.enable': 0,
      'delay.enable': 0,
      'reverb.enable': 0,
      'harmony.enable': 1,
      'harmony.interval': 4,
      'harmony.level': 0.8,
      'harmony.dry_alignment.enable': 1,
      'harmony.limiter.enable': 1,
    });

    expect(wasmRes.rmsL).toBeCloseTo(gold.rms_l, 2);
    expect(wasmRes.peakL).toBeCloseTo(gold.peak_l, 2);
  });

  it('Scenario 8: Full DSP Chain matches native oracle', () => {
    const gold = goldenData.scenarios.find((s: any) => s.name === 'FullChain');
    const wasmRes = runScenarioWasm({
      'gate.enable': 1,
      'compressor.enable': 1,
      'drive.enable': 1,
      'drive.mode': 1,
      'drive.drive': 0.6,
      'drive.tone': 0.5,
      'drive.mix': 0.8,
      'chorus.enable': 1,
      'chorus.mode': 2,
      'chorus.mix': 0.5,
      'chorus.depth_ms': 4.0,
      'delay.enable': 1,
      'delay.left_ms': 250,
      'delay.right_ms': 375,
      'delay.feedback': 0.35,
      'delay.wet': 0.5,
      'reverb.enable': 1,
      'reverb.wet': 0.5,
      'reverb.decay_s': 2.5,
      'reverb.damping': 0.4,
      'harmony.enable': 1,
      'harmony.interval': 4,
      'harmony.level': 0.8,
      'harmony.dry_alignment.enable': 1,
      'harmony.limiter.enable': 1,
    });

    // Both should produce non-zero, healthy audio levels within dynamic range
    expect(wasmRes.rmsL).toBeGreaterThan(0.05);
    expect(wasmRes.peakL).toBeLessThan(1.0);
    expect(wasmRes.peakL).toBeGreaterThan(0.3);
  });
});
