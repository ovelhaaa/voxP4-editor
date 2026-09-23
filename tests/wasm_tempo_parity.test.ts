import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  tempoSubdivisionMs,
  tempoSubdivisionRatio,
  TEMPO_SUBDIVISION_NAMES,
} from '../src/audio/tailEstimation';

describe('Tempo subdivision JS/C++ parity (real WASM)', () => {
  let wasmSubdivisionMs: (bpm: number, subdivision: number) => number;

  beforeAll(async () => {
    const wasmBinary = fs.readFileSync(
      path.resolve(__dirname, '../src/audio/wasm/voxp4-preview.wasm')
    );
    const mjsPath = path.resolve(__dirname, '../src/audio/wasm/voxp4-preview.mjs');
    const createModule = (await import(mjsPath)).default;
    const mod = await createModule({ wasmBinary });
    mod._voxp4_preview_init(48000, 64);
    wasmSubdivisionMs = mod.cwrap('voxp4_preview_tempo_subdivision_ms', 'number', ['number', 'number']);
  });

  for (const bpm of [60, 120]) {
    it(`matches the C++ DSP for all 13 subdivisions at ${bpm} BPM`, () => {
      for (let index = 0; index < TEMPO_SUBDIVISION_NAMES.length; index++) {
        const expected = wasmSubdivisionMs(bpm, index);
        const actual = tempoSubdivisionMs(bpm, index);
        expect(actual, `${TEMPO_SUBDIVISION_NAMES[index]} @ ${bpm} BPM`).toBeCloseTo(expected, 4);
      }
    });
  }

  it('tempo helper: invalid enum fallback matches the C++ tempo_subdivision_ratio default branch', () => {
    // The raw helper falls back to Quarter for out-of-range enum values. The
    // real parameter path instead clamps the index first (covered in
    // tail_estimation.test.ts via clampSubdivisionIndex).
    for (const index of [-1, 13, 200]) {
      const expected = wasmSubdivisionMs(120, index);
      const actual = tempoSubdivisionMs(120, index);
      expect(actual, `invalid subdivision ${index}`).toBeCloseTo(expected, 4);
      expect(tempoSubdivisionRatio(index)).toBeCloseTo(1.0, 6);
    }
  });

  it('matches the DSP BPM clamp for out-of-range tempos', () => {
    for (const bpm of [0, 10, 29.9, 300.1, 999, 1000]) {
      const expected = wasmSubdivisionMs(bpm, 3);
      const actual = tempoSubdivisionMs(bpm, 3);
      expect(actual, `BPM ${bpm}`).toBeCloseTo(expected, 4);
    }
  });
});
