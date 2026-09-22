import { describe, it, expect } from 'vitest';
import { catalog } from '../src/domain/catalog';

describe('ParameterCatalog', () => {
  it('loads exact 71 canonical parameters from the frozen contract', () => {
    expect(catalog.parameterCount).toBe(71);
    expect(catalog.getAllParameters().length).toBe(71);
  });

  it('performs exact canonical lookup by semantic name', () => {
    const tempo = catalog.getParameter('TempoBpm');
    expect(tempo).toBeDefined();
    expect(tempo?.type).toBe('float');
    expect(tempo?.min).toBe(30);
    expect(tempo?.max).toBe(300);
    expect(tempo?.unit).toBe('BPM');

    const chorusMode = catalog.getParameter('ChorusMode');
    expect(chorusMode).toBeDefined();
    expect(chorusMode?.type).toBe('enum');
    expect(chorusMode?.values).toEqual(['Chorus', 'Ensemble', 'Dimension', 'Microshift']);

    const reverbWet = catalog.getParameter('ReverbWet');
    expect(reverbWet).toBeDefined();
    expect(reverbWet?.type).toBe('float');
    expect(reverbWet?.min).toBe(0);
    expect(reverbWet?.max).toBe(1);
  });

  it('rejects uncontracted aliases (exact lookup only)', () => {
    // Aliases were removed in accordance with user instructions
    expect(catalog.getParameter('ModulationMode')).toBeUndefined();
    expect(catalog.getParameter('ModulationMix')).toBeUndefined();
    expect(catalog.getParameter('ReverbMix')).toBeUndefined();
    expect(catalog.getParameter('DelayMix')).toBeUndefined();
    expect(catalog.getParameter('reverb.wet')).toBeUndefined();
  });

  it('groups all 71 parameters into the 8 canonical groups', () => {
    const groups = catalog.getGroups();
    expect(groups).toEqual([
      'tempo',
      'harmony',
      'dynamics',
      'delay',
      'reverb',
      'output',
      'chorus',
      'drive',
    ]);

    let totalInGroups = 0;
    for (const g of groups) {
      const params = catalog.getParametersByGroup(g);
      expect(params.length).toBeGreaterThan(0);
      totalInGroups += params.length;
    }
    expect(totalInGroups).toBe(71);
  });

  it('provides typed default values', () => {
    expect(catalog.getDefaultValue('TempoBpm')).toBe(120);
    expect(catalog.getDefaultValue('HarmonyEnable')).toBe(false);
    expect(catalog.getDefaultValue('ChorusMode')).toBe('Chorus');
    expect(catalog.getDefaultValue('DriveMode')).toBe('Warm');
  });

  it('validates values strictly according to type, bounds, and enums', () => {
    // Bool
    expect(catalog.validateValue('HarmonyEnable', true).valid).toBe(true);
    expect(catalog.validateValue('HarmonyEnable', 'true').valid).toBe(false);

    // Bounded float
    expect(catalog.validateValue('TempoBpm', 120).valid).toBe(true);
    expect(catalog.validateValue('TempoBpm', 29.9).valid).toBe(false);
    expect(catalog.validateValue('TempoBpm', 300.1).valid).toBe(false);

    // Enum
    expect(catalog.validateValue('ChorusMode', 'Microshift').valid).toBe(true);
    expect(catalog.validateValue('ChorusMode', 'SuperChorus').valid).toBe(false);
    // Strict: does not accept lowercased alias 'minor' for HarmonyScale
    expect(catalog.validateValue('HarmonyScale', 'Major').valid).toBe(true);
    expect(catalog.validateValue('HarmonyScale', 'NaturalMinor').valid).toBe(true);
    expect(catalog.validateValue('HarmonyScale', 'minor').valid).toBe(false);
  });
});
