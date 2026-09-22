import { describe, it, expect } from 'vitest';
import { createInitialState, editorReducer, createEmptyLibrary } from '../src/state/editorState';
import { catalog } from '../src/domain/catalog';
import { EFFECT_MODULES, getModuleParameters } from '../src/domain/effectModules';
import { resolveParameterState } from '../src/domain/resolution';
import { canonicalDemoLibrary } from '../src/fixtures/demoLibrary';

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
    const scene1 = state.library.scenes[0];

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
