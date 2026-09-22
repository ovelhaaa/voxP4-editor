import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import compatibilityManifest from '../src/audio/wasm/dsp-compatibility.json';
import parameterContract from '../contracts/voxp4-parameters-v1.json';
import { catalog } from '../src/domain/catalog';

describe('DSP Compatibility & Contract Parity', () => {
  it('manifest specifies contract version 1 and P4Production profile', () => {
    expect(compatibilityManifest.contractVersion).toBe(1);
    expect(compatibilityManifest.profile).toBe('P4Production');
    expect(compatibilityManifest.sampleRate).toBe(48000);
    expect(compatibilityManifest.blockSize).toBe(64);
    expect(compatibilityManifest.parameterCount).toBe(71);
    expect(compatibilityManifest.wasmSha256).toBeDefined();
    expect(compatibilityManifest.wasmSha256.length).toBe(64);
    expect(compatibilityManifest.contractSha256).toBeDefined();
    expect(compatibilityManifest.contractSha256.length).toBe(64);
  });

  it('parameter catalog loads all 71 parameters matching contracts/voxp4-parameters-v1.json exactly', () => {
    const contractParams = parameterContract.parameters;
    const allParams = catalog.getAllParameters();

    expect(allParams.length).toBe(71);
    expect(contractParams.length).toBe(71);

    for (const cp of contractParams) {
      const desc = catalog.getParameter(cp.name);
      expect(desc, `Missing parameter name: ${cp.name}`).toBeDefined();
      expect(desc?.key).toBe(cp.key);
      expect(desc?.type).toBe(cp.type);
      expect(desc?.default).toBe(cp.default);

      if (cp.min !== undefined) {
        expect(desc?.min).toBeCloseTo(cp.min, 4);
      }
      if (cp.max !== undefined) {
        expect(desc?.max).toBeCloseTo(cp.max, 4);
      }
      if (cp.step !== undefined) {
        expect(desc?.step).toBeCloseTo(cp.step, 4);
      }
    }
  });

  it('strictly contains zero wire IDs in public contracts and manifest', () => {
    const manifestString = JSON.stringify(compatibilityManifest);
    expect(manifestString.includes('wireId')).toBe(false);
    expect(manifestString.includes('wire_id')).toBe(false);

    const contractString = JSON.stringify(parameterContract);
    expect(contractString.includes('wireId')).toBe(false);
    expect(contractString.includes('wire_id')).toBe(false);
  });

  it('proves manifest.wasmSha256 matches the committed WASM binary byte-for-byte', () => {
    const wasmPath = path.resolve(__dirname, '../src/audio/wasm/voxp4-preview.wasm');
    const actual = crypto.createHash('sha256').update(fs.readFileSync(wasmPath)).digest('hex');
    expect(actual).toBe(compatibilityManifest.wasmSha256);
  });

  it('proves manifest.contractSha256 matches the committed parameter contract', () => {
    const contractPath = path.resolve(__dirname, '../contracts/voxp4-parameters-v1.json');
    const actual = crypto.createHash('sha256').update(fs.readFileSync(contractPath)).digest('hex');
    expect(actual).toBe(compatibilityManifest.contractSha256);
  });

  it('records a real DSP commit provenance rather than a placeholder', () => {
    expect(compatibilityManifest.dspCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(compatibilityManifest.dspCommit).not.toBe('unknown');
  });
});
