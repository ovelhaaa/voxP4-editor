import { describe, it, expect } from 'vitest';
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
});
