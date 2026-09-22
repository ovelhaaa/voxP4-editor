import { describe, it, expect } from 'vitest';
import { createInitialState, editorReducer, EditorState } from '../src/state/editorState';
import { canonicalDemoLibrary } from '../src/fixtures/demoLibrary';
import { validateLibrary } from '../src/domain/validation';
import { VoxP4Library } from '../src/domain/models';

describe('Atomic Import Safety', () => {
  it('guarantees that importing an invalid library leaves existing Library A and state untouched', () => {
    // 1. Establish state with Library A
    const libraryA: VoxP4Library = {
      ...canonicalDemoLibrary,
      libraryId: 'library-a',
      name: 'Library A Original',
    };

    let state: EditorState = createInitialState(libraryA);

    // Make an edit to Library A so dirty and past history exist
    state = editorReducer(state, {
      type: 'ADD_PRESET',
      name: 'Custom User Preset',
    });

    const initialHistoryLength = state.past.length;
    const initialSelection = { ...state.selection };
    const initialLibraryAJson = JSON.stringify(state.library);
    const initialIsDirty = state.isDirty;

    // 2. Prepare candidate Library B with invalid data (e.g. unknown parameter & broken ref)
    const invalidCandidateJson = JSON.stringify({
      format: 'voxp4-library',
      formatVersion: 1,
      schemaVersion: 1,
      libraryId: 'library-b-corrupt',
      name: 'Library B Corrupt',
      presets: [
        {
          id: 'p-bad',
          name: 'Bad Preset',
          parameters: {
            FakeInventedParameterXYZ: 999,
          },
        },
      ],
      scenes: [
        {
          id: 's-bad',
          name: 'Broken Scene',
          basePresetId: 'non-existent-base-preset',
          parameters: {},
          subscenes: [],
        },
      ],
      setlists: [],
    });

    // 3. Simulate import pipeline: parse -> validate -> candidate test
    let parsed: unknown;
    try {
      parsed = JSON.parse(invalidCandidateJson);
    } catch {
      parsed = null;
    }

    const validation = validateLibrary(parsed);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);

    // Because validation failed, atomic import aborts and never dispatches LOAD_LIBRARY
    // Therefore state remains unchanged:
    expect(JSON.stringify(state.library)).toBe(initialLibraryAJson);
    expect(state.library.name).toBe('Library A Original');
    expect(state.past.length).toBe(initialHistoryLength);
    expect(state.selection).toEqual(initialSelection);
    expect(state.isDirty).toBe(initialIsDirty);
  });
});
