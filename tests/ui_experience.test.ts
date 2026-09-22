import { describe, it, expect } from 'vitest';
import { createInitialState, editorReducer } from '../src/state/editorState';
import { catalog } from '../src/domain/catalog';
import { EFFECT_MODULES, getModuleParameters } from '../src/domain/effectModules';
import { resolveParameterState } from '../src/domain/resolution';
import { resolveSongMusicalAttributes } from '../src/domain/musicalResolution';
import { canonicalDemoLibrary } from '../src/fixtures/demoLibrary';
import { Preset, Scene } from '../src/domain/models';

describe('UI/UX Overhaul Behavior & Musical State Tests', () => {
  it('defaults initial selection to the first Song (Scene) when loading a library', () => {
    const state = createInitialState(canonicalDemoLibrary);
    expect(state.selection.type).toBe('scene');
    expect(state.selection.id).toBe(canonicalDemoLibrary.scenes[0].id);
  });

  it('verifies that all effect modules and primary controls use strictly canonical semantic parameter names', () => {
    for (const module of EFFECT_MODULES) {
      if (module.enableParam) {
        expect(catalog.hasParameter(module.enableParam)).toBe(true);
      }
      for (const paramName of module.primaryParams) {
        expect(catalog.hasParameter(paramName)).toBe(true);
      }
      const allParams = getModuleParameters(module);
      for (const param of allParams) {
        expect(catalog.hasParameter(param.name)).toBe(true);
      }
    }
  });

  it('correctly resolves musical attributes through the inheritance chain (Firmware -> Preset -> Scene)', () => {
    const customPreset: Preset = {
      id: 'preset-jazz',
      name: 'Jazz Ballad',
      parameters: {
        TempoBpm: 90,
        HarmonyKey: 'D',
        HarmonyScale: 'Minor',
      },
    };

    const songWithoutOverride: Scene = {
      id: 'scene-autumn',
      name: 'Autumn Leaves',
      basePresetId: customPreset.id,
      parameters: {},
      subscenes: [],
    };

    // 1. Inherited from Preset
    let resolved = resolveSongMusicalAttributes(songWithoutOverride, customPreset);
    expect(resolved.tempo).toBe(90);
    expect(resolved.key).toBe('D');
    expect(resolved.scale).toBe('Minor');
    expect(resolved.isTempoOverridden).toBe(false);
    expect(resolved.isKeyOverridden).toBe(false);

    // 2. Song Override
    const songWithOverride: Scene = {
      ...songWithoutOverride,
      parameters: {
        TempoBpm: 120,
        HarmonyKey: 'G#',
      },
    };

    resolved = resolveSongMusicalAttributes(songWithOverride, customPreset);
    expect(resolved.tempo).toBe(120);
    expect(resolved.key).toBe('G#');
    expect(resolved.scale).toBe('Minor'); // still inherited
    expect(resolved.isTempoOverridden).toBe(true);
    expect(resolved.isKeyOverridden).toBe(true);

    // 3. Resetting Song Override returns immediately to inherited Sound value
    const songReset: Scene = {
      ...songWithOverride,
      parameters: {
        ...songWithOverride.parameters,
      },
    };
    delete songReset.parameters.TempoBpm;
    delete songReset.parameters.HarmonyKey;

    resolved = resolveSongMusicalAttributes(songReset, customPreset);
    expect(resolved.tempo).toBe(90);
    expect(resolved.key).toBe('D');
    expect(resolved.isTempoOverridden).toBe(false);
    expect(resolved.isKeyOverridden).toBe(false);
  });

  it('enforces contract metadata conformance for TempoBpm', () => {
    const desc = catalog.getParameter('TempoBpm');
    expect(desc).toBeDefined();
    expect(desc?.min).toBe(30);
    expect(desc?.max).toBe(300);
    expect(desc?.step).toBe(0.1);
    expect(desc?.default).toBe(120);
    expect(desc?.unit).toBe('BPM');
  });

  it('formats effect summaries using exact canonical contract defaults when no overrides exist', () => {
    const emptyVals = {};

    const dynamics = EFFECT_MODULES.find((m) => m.id === 'dynamics')!;
    expect(dynamics.formatSummary(emptyVals)).toBe('-18dB · 3:1');

    const drive = EFFECT_MODULES.find((m) => m.id === 'drive')!;
    expect(drive.formatSummary(emptyVals)).toBe('Warm · 40%');

    const chorus = EFFECT_MODULES.find((m) => m.id === 'chorus')!;
    expect(chorus.formatSummary(emptyVals)).toBe('Chorus · 30%');

    const delay = EFFECT_MODULES.find((m) => m.id === 'delay')!;
    expect(delay.formatSummary(emptyVals)).toBe('250ms · 20%');

    const reverb = EFFECT_MODULES.find((m) => m.id === 'reverb')!;
    expect(reverb.formatSummary(emptyVals)).toBe('2.0s · 18%');

    const output = EFFECT_MODULES.find((m) => m.id === 'output')!;
    expect(output.formatSummary(emptyVals)).toBe('DelayIntoReverb · 0.95');
  });

  it('verifies resetting a customization removes the sparse override instead of saving resolved value', () => {
    let state = createInitialState(canonicalDemoLibrary);
    const scene = state.library.scenes[0];
    const subscene = scene.subscenes[0];

    // 1. Customize ReverbWet in the section
    state = editorReducer(state, {
      type: 'SET_SUBSCENE_PARAMETER',
      sceneId: scene.id,
      subsceneId: subscene.id,
      paramName: 'ReverbWet',
      value: 0.85,
    });

    const updatedSub = state.library.scenes[0].subscenes[0];
    expect(updatedSub.parameters?.ReverbWet).toBe(0.85);

    // 2. Reset (remove override)
    state = editorReducer(state, {
      type: 'DELETE_SUBSCENE_PARAMETER',
      sceneId: scene.id,
      subsceneId: subscene.id,
      paramName: 'ReverbWet',
    });

    const resetSub = state.library.scenes[0].subscenes[0];
    // Sparse invariant: ReverbWet must be undefined in parameters, not 0.85 or resolved value
    expect(resetSub.parameters?.ReverbWet).toBeUndefined();

    // But resolved value falls back to scene/preset/default
    const resolved = resolveParameterState({
      name: 'ReverbWet',
      preset: state.library.presets.find((p) => p.id === scene.basePresetId),
      scene: state.library.scenes[0],
      subscene: resetSub,
      currentLevel: 'subscene',
    });
    expect(resolved.isOverriddenHere).toBe(false);
    expect(typeof resolved.resolvedValue).toBe('number');
  });

  it('switching Song or Section correctly shifts resolution context', () => {
    let state = createInitialState();

    // Add a second song with distinct tempo and key
    state = editorReducer(state, {
      type: 'ADD_SCENE',
      name: 'Song 2',
    });

    const scene2 = state.library.scenes[state.library.scenes.length - 1];

    state = editorReducer(state, {
      type: 'SET_SCENE_PARAMETER',
      sceneId: scene2.id,
      paramName: 'TempoBpm',
      value: 145,
    });

    expect(state.library.scenes[0].parameters?.TempoBpm).toBe(54);
    const addedScene = state.library.scenes.find((s) => s.id === scene2.id);
    expect(addedScene?.parameters?.TempoBpm).toBe(145);

    // Selecting Section 1 of Scene 2
    state = editorReducer(state, {
      type: 'SET_SELECTION',
      selection: {
        type: 'subscene',
        id: scene2.id,
        subsceneId: scene2.subscenes[0].id,
      },
    });

    expect(state.selection.type).toBe('subscene');
    expect(state.selection.id).toBe(scene2.id);
    expect(state.selection.subsceneId).toBe(scene2.subscenes[0].id);
  });

  it('ensures FX Rack customized count excludes Tempo, Key, and Scale overrides', () => {
    // Collect all FX parameter names across the 7 modules
    const fxParamNames = new Set<string>();
    for (const m of EFFECT_MODULES) {
      if (m.enableParam) fxParamNames.add(m.enableParam);
      for (const p of getModuleParameters(m)) {
        fxParamNames.add(p.name);
      }
    }

    // Verify non-FX musical parameters are not in the FX rack set
    expect(fxParamNames.has('TempoBpm')).toBe(false);
    expect(fxParamNames.has('HarmonyKey')).toBe(false);
    expect(fxParamNames.has('HarmonyScale')).toBe(false);

    // Check count calculation helper logic
    const mockActiveOverrides = {
      TempoBpm: 120,
      HarmonyKey: 'G',
      HarmonyScale: 'Dorian',
      ReverbWet: 0.45,
      DelayFeedback: 0.6,
    };

    let fxCount = 0;
    for (const key of Object.keys(mockActiveOverrides)) {
      if (fxParamNames.has(key)) fxCount++;
    }

    // Only ReverbWet and DelayFeedback should be counted, not Tempo/Key/Scale
    expect(fxCount).toBe(2);
  });

  it('enforces that validation errors are tracked and block export flag', () => {
    let state = createInitialState();
    // Inject duplicate preset ID to trigger semantic validation error
    const brokenPreset = {
      ...state.library.presets[0],
      id: 'duplicate-id',
    };
    const brokenPreset2 = {
      ...state.library.presets[0],
      id: 'duplicate-id',
      name: 'Second broken',
    };

    const brokenLib = {
      ...state.library,
      presets: [brokenPreset, brokenPreset2],
    };

    state = editorReducer(state, {
      type: 'LOAD_LIBRARY',
      library: brokenLib,
      isNewRoot: true,
    });

    expect(state.validation.isValid).toBe(false);
    expect(state.validation.errors.length).toBeGreaterThan(0);
  });

  it('undo and redo maintain state integrity through musical edits', () => {
    let state = createInitialState();
    const songId = state.library.scenes[0].id;
    const initialTempo = state.library.scenes[0].parameters?.TempoBpm ?? 54;

    state = editorReducer(state, {
      type: 'SET_SCENE_PARAMETER',
      sceneId: songId,
      paramName: 'TempoBpm',
      value: 132,
    });

    expect(state.library.scenes[0].parameters?.TempoBpm).toBe(132);
    expect(state.past.length).toBe(1);

    // Undo
    state = editorReducer(state, { type: 'UNDO' });
    expect(state.library.scenes[0].parameters?.TempoBpm).toBe(initialTempo);
    expect(state.future.length).toBe(1);

    // Redo
    state = editorReducer(state, { type: 'REDO' });
    expect(state.library.scenes[0].parameters?.TempoBpm).toBe(132);
  });
});
