import { describe, it, expect } from 'vitest';
import { serializeLibrary } from '../src/domain/serialization';
import { validateLibrary } from '../src/domain/validation';
import { canonicalDemoLibrary } from '../src/fixtures/demoLibrary';
import { VoxP4Library } from '../src/domain/models';

describe('Deterministic Serialization and Round-Trip', () => {
  it('serializes canonical demo library with 2-space indentation and canonical keys', () => {
    const jsonStr = serializeLibrary(canonicalDemoLibrary);
    expect(jsonStr).toContain('{\n  "format": "voxp4-library",\n  "formatVersion": 1,');
    expect(jsonStr.endsWith('\n')).toBe(true);

    const parsed = JSON.parse(jsonStr);
    expect(parsed.format).toBe('voxp4-library');
    expect(parsed.libraryId).toBe(canonicalDemoLibrary.libraryId);
    expect(parsed.presets.length).toBe(canonicalDemoLibrary.presets.length);
    expect(parsed.scenes.length).toBe(canonicalDemoLibrary.scenes.length);
    expect(parsed.setlists.length).toBe(canonicalDemoLibrary.setlists.length);
  });

  it('preserves exact semantic equality across serialization round-trip', () => {
    const firstJson = serializeLibrary(canonicalDemoLibrary);
    const parsed1 = JSON.parse(firstJson) as VoxP4Library;

    // Validate parsed library
    const valResult = validateLibrary(parsed1);
    expect(valResult.isValid).toBe(true);
    expect(valResult.errors).toHaveLength(0);

    const secondJson = serializeLibrary(parsed1);
    // Deterministic string equality
    expect(secondJson).toBe(firstJson);
  });

  it('preserves sparse parameter semantics (does not emit un-overridden parameters)', () => {
    const customLib: VoxP4Library = {
      format: 'voxp4-library',
      formatVersion: 1,
      schemaVersion: 1,
      libraryId: 'sparse-test',
      name: 'Sparse Rig',
      presets: [
        {
          id: 'p1',
          name: 'P1',
          parameters: {
            ReverbWet: 0.25, // Only 1 parameter overridden
          },
        },
      ],
      scenes: [
        {
          id: 's1',
          name: 'S1',
          basePresetId: 'p1',
          parameters: {
            TempoBpm: 120, // Only 1 parameter overridden at scene level
          },
          subscenes: [
            {
              id: 'sub1',
              name: 'Verse',
              parameters: {}, // Zero overrides in this section
            },
          ],
        },
      ],
      setlists: [],
    };

    const jsonStr = serializeLibrary(customLib);
    const parsed = JSON.parse(jsonStr);

    // Preset only has ReverbWet (not 71 parameters)
    expect(Object.keys(parsed.presets[0].parameters)).toEqual(['ReverbWet']);
    // Scene only has TempoBpm (does not inject ReverbWet into scene)
    expect(Object.keys(parsed.scenes[0].parameters)).toEqual(['TempoBpm']);
    // Subscene has no parameters property or empty object
    expect(parsed.scenes[0].subscenes[0].parameters).toBeUndefined();
  });
});
