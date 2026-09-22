import { describe, it, expect } from 'vitest';
import { createInitialState, editorReducer, EditorState } from '../src/state/editorState';
import { canonicalDemoLibrary } from '../src/fixtures/demoLibrary';
import { VoxP4Library } from '../src/domain/models';

describe('Undo/Redo History Root Reset Rule', () => {
  it('clears past history when importing or loading a new library root so Ctrl+Z cannot resurrect the previous library', () => {
    let state: EditorState = createInitialState(canonicalDemoLibrary);

    // Make multiple edits
    state = editorReducer(state, { type: 'ADD_PRESET', name: 'Edit 1' });
    state = editorReducer(state, { type: 'ADD_PRESET', name: 'Edit 2' });
    state = editorReducer(state, { type: 'ADD_PRESET', name: 'Edit 3' });

    expect(state.past.length).toBe(3);

    // Now import another library (sets isNewRoot: true)
    const importedLibrary: VoxP4Library = {
      format: 'voxp4-library',
      formatVersion: 1,
      schemaVersion: 1,
      libraryId: 'imported-rig-2026',
      name: 'Imported Brand New Rig',
      presets: [{ id: 'p-new', name: 'New Rig Preset', parameters: {} }],
      scenes: [],
      setlists: [],
    };

    state = editorReducer(state, {
      type: 'LOAD_LIBRARY',
      library: importedLibrary,
      isNewRoot: true,
      markClean: true,
    });

    // Verify history root was reset: past is empty!
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);

    // Trying to UNDO (Ctrl+Z) must have no effect and must NOT resurrect the previous library
    const stateAfterUndo = editorReducer(state, { type: 'UNDO' });
    expect(stateAfterUndo.library.name).toBe('Imported Brand New Rig');
    expect(stateAfterUndo.past).toHaveLength(0);
  });
});
