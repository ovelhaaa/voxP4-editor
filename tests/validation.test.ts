import { describe, it, expect } from 'vitest';
import { validateLibrary } from '../src/domain/validation';
import { canonicalDemoLibrary } from '../src/fixtures/demoLibrary';
import { VoxP4Library } from '../src/domain/models';

describe('Validation (Level 1 Schema + Level 2 Semantic)', () => {
  it('validates canonical demo library as 100% valid', () => {
    const res = validateLibrary(canonicalDemoLibrary);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('rejects invalid format envelope properties', () => {
    const invalidEnvelope = {
      ...canonicalDemoLibrary,
      format: 'unknown-format',
    };
    const res = validateLibrary(invalidEnvelope);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.path === '/format')).toBe(true);
  });

  it('detects duplicate Preset IDs', () => {
    const duplicatePresetLib: VoxP4Library = {
      ...canonicalDemoLibrary,
      presets: [
        { id: 'p-dup', name: 'Preset 1', parameters: {} },
        { id: 'p-dup', name: 'Preset 2', parameters: {} },
      ],
      scenes: [],
      setlists: [],
    };
    const res = validateLibrary(duplicatePresetLib);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes("Duplicate Preset ID 'p-dup'"))).toBe(true);
  });

  it('detects broken basePresetId reference', () => {
    const brokenRefLib: VoxP4Library = {
      ...canonicalDemoLibrary,
      scenes: [
        {
          id: 's-1',
          name: 'Scene 1',
          basePresetId: 'non-existent-preset-xyz',
          parameters: {},
          subscenes: [],
        },
      ],
    };
    const res = validateLibrary(brokenRefLib);
    expect(res.isValid).toBe(false);
    expect(
      res.errors.some((e) =>
        e.message.includes("references unknown Preset 'non-existent-preset-xyz'")
      )
    ).toBe(true);
  });

  it('detects duplicate Subscene IDs within the same Scene', () => {
    const dupSubsceneLib: VoxP4Library = {
      ...canonicalDemoLibrary,
      scenes: [
        {
          id: 's-1',
          name: 'Scene 1',
          basePresetId: canonicalDemoLibrary.presets[0].id,
          parameters: {},
          subscenes: [
            { id: 'sub-1', name: 'Verse', parameters: {} },
            { id: 'sub-1', name: 'Chorus', parameters: {} },
          ],
        },
      ],
    };
    const res = validateLibrary(dupSubsceneLib);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes("Duplicate Subscene ID 'sub-1'"))).toBe(
      true
    );
  });

  it('detects broken sceneId reference in setlist entry', () => {
    const brokenEntryLib: VoxP4Library = {
      ...canonicalDemoLibrary,
      setlists: [
        {
          id: 'set-1',
          name: 'Set 1',
          entries: [{ id: 'e-1', sceneId: 'unknown-scene-99' }],
        },
      ],
    };
    const res = validateLibrary(brokenEntryLib);
    expect(res.isValid).toBe(false);
    expect(
      res.errors.some((e) =>
        e.message.includes("references unknown Scene 'unknown-scene-99'")
      )
    ).toBe(true);
  });

  it('detects unknown parameter names (strict canonical contract)', () => {
    const unknownParamLib: VoxP4Library = {
      ...canonicalDemoLibrary,
      presets: [
        {
          id: 'p-1',
          name: 'P1',
          parameters: {
            NonExistentVocalParam: 42,
          },
        },
      ],
    };
    const res = validateLibrary(unknownParamLib);
    expect(res.isValid).toBe(false);
    expect(
      res.errors.some((e) =>
        e.message.includes("Unknown parameter 'NonExistentVocalParam'")
      )
    ).toBe(true);
  });

  it('detects out-of-range numeric parameter bounds', () => {
    const outOfBoundsLib: VoxP4Library = {
      ...canonicalDemoLibrary,
      scenes: [
        {
          id: 's-1',
          name: 'S1',
          basePresetId: canonicalDemoLibrary.presets[0].id,
          parameters: {
            TempoBpm: 999, // Max is 300
          },
          subscenes: [],
        },
      ],
    };
    const res = validateLibrary(outOfBoundsLib);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('out of bounds'))).toBe(true);
  });

  it('detects invalid enum strings', () => {
    const invalidEnumLib: VoxP4Library = {
      ...canonicalDemoLibrary,
      presets: [
        {
          id: 'p-1',
          name: 'P1',
          parameters: {
            ChorusMode: 'InvalidChorusModeXYZ',
          },
        },
      ],
    };
    const res = validateLibrary(invalidEnumLib);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes("Invalid enum value 'InvalidChorusModeXYZ'"))).toBe(
      true
    );
  });

  it('flags non-fatal issues as warnings (does not block validation)', () => {
    const warningLib: VoxP4Library = {
      format: 'voxp4-library',
      formatVersion: 1,
      schemaVersion: 1,
      libraryId: 'warn-lib',
      name: 'Warning Rig',
      presets: [{ id: 'p1', name: 'Preset 1', parameters: {} }],
      scenes: [
        {
          id: 's1',
          name: 'Scene 1',
          basePresetId: 'p1',
          parameters: {},
          subscenes: [], // empty subscenes -> warning
        },
      ],
      setlists: [
        {
          id: 'st1',
          name: 'Setlist 1',
          entries: [], // empty entries -> warning
        },
      ],
    };
    const res = validateLibrary(warningLib);
    expect(res.isValid).toBe(true); // 0 errors
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings.some((w) => w.message.includes('contains no subscenes'))).toBe(true);
    expect(res.warnings.some((w) => w.message.includes('has no entries'))).toBe(true);
  });
});
