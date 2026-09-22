import React, { useReducer, useEffect, useCallback, useState } from 'react';
import {
  EditorContext,
  editorReducer,
  createInitialState,
  EditorContextValue,
} from './editorState';
import { VoxP4Library } from '../domain/models';
import { validateLibrary } from '../domain/validation';
import { serializeLibrary } from '../domain/serialization';
import { generateId, generateLibraryId } from '../domain/ids';
import { loadDraft, clearDraft } from '../persistence/draftStorage';
import { canonicalDemoLibrary } from '../fixtures/demoLibrary';

interface EditorProviderProps {
  children: React.ReactNode;
  initialLibrary?: VoxP4Library;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({
  children,
  initialLibrary,
}) => {
  const [state, dispatch] = useReducer(
    editorReducer,
    initialLibrary ?? canonicalDemoLibrary,
    createInitialState
  );

  const [hasPendingDraft, setHasPendingDraft] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<VoxP4Library | null>(null);

  // Check for saved local draft upon startup
  useEffect(() => {
    async function checkDraft() {
      const draft = await loadDraft();
      if (draft && draft.format === 'voxp4-library') {
        const draftSer = serializeLibrary(draft);
        const currentSer = serializeLibrary(state.library);
        if (draftSer !== currentSer) {
          setPendingDraft(draft);
          setHasPendingDraft(true);
        }
      }
    }
    checkDraft();
  }, []);

  const restoreDraft = useCallback(() => {
    if (pendingDraft) {
      dispatch({
        type: 'LOAD_LIBRARY',
        library: pendingDraft,
        isNewRoot: true,
        markClean: false,
      });
    }
    setHasPendingDraft(false);
    setPendingDraft(null);
  }, [pendingDraft]);

  const discardDraft = useCallback(async () => {
    await clearDraft();
    setHasPendingDraft(false);
    setPendingDraft(null);
  }, []);

  // Global Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if focus is inside an active text input unless modifier
      const target = e.target as HTMLElement | null;
      const isInput =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key === 'z' && !e.shiftKey) {
          if (!isInput) {
            e.preventDefault();
            dispatch({ type: 'UNDO' });
          }
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          if (!isInput) {
            e.preventDefault();
            dispatch({ type: 'REDO' });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const createNewLibrary = useCallback((name = 'New Live Rig') => {
    const initialPresetId = generateId('preset');
    const initialSubsceneId = generateId('subscene');
    const initialSceneId = generateId('scene');
    const initialSetlistId = generateId('setlist');

    const newLib: VoxP4Library = {
      format: 'voxp4-library',
      formatVersion: 1,
      schemaVersion: 1,
      libraryId: generateLibraryId(name),
      name,
      presets: [
        {
          id: initialPresetId,
          name: 'Clean Vocal',
          parameters: {},
        },
      ],
      scenes: [
        {
          id: initialSceneId,
          name: 'Song 1',
          basePresetId: initialPresetId,
          parameters: {
            TempoBpm: 120,
            HarmonyKey: 'C',
            HarmonyScale: 'Major',
          },
          subscenes: [
            {
              id: initialSubsceneId,
              name: 'Verse',
              parameters: {},
            },
          ],
        },
      ],
      setlists: [
        {
          id: initialSetlistId,
          name: 'Main Set',
          entries: [{ id: generateId('entry'), sceneId: initialSceneId }],
        },
      ],
    };

    dispatch({
      type: 'LOAD_LIBRARY',
      library: newLib,
      isNewRoot: true,
      markClean: true,
    });
  }, []);

  const loadDemo = useCallback(() => {
    dispatch({
      type: 'LOAD_LIBRARY',
      library: canonicalDemoLibrary,
      isNewRoot: true,
      markClean: true,
    });
  }, []);

  const importLibraryCandidate = useCallback(
    (candidateJson: string): { success: boolean; errors: string[] } => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(candidateJson);
      } catch (err: unknown) {
        return {
          success: false,
          errors: [`JSON syntax error: ${(err as Error).message}`],
        };
      }

      const val = validateLibrary(parsed);
      if (!val.isValid) {
        const errorMessages = val.errors.map((e) =>
          e.path ? `${e.path}: ${e.message}` : e.message
        );
        return { success: false, errors: errorMessages };
      }

      // Valid: load into editor and establish a new history root
      dispatch({
        type: 'LOAD_LIBRARY',
        library: parsed as VoxP4Library,
        isNewRoot: true,
        markClean: true,
      });

      return { success: true, errors: [] };
    },
    []
  );

  const exportLibrary = useCallback(() => {
    const val = validateLibrary(state.library);
    if (!val.isValid) {
      alert(`Cannot export invalid library:\n\n${val.errors.map((e) => e.message).join('\n')}`);
      return;
    }

    const json = serializeLibrary(state.library);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = state.library.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    a.href = url;
    a.download = `${safeName || 'library'}.voxp4.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    dispatch({ type: 'MARK_CLEAN' });
  }, [state.library]);

  const undo = useCallback(() => dispatch({ type: 'UNDO' }), []);
  const redo = useCallback(() => dispatch({ type: 'REDO' }), []);

  const value: EditorContextValue = {
    state,
    dispatch,
    createNewLibrary,
    loadDemo,
    importLibraryCandidate,
    exportLibrary,
    undo,
    redo,
  };

  return (
    <EditorContext.Provider value={value}>
      {children}
      {hasPendingDraft && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-amber-400 flex items-center gap-2">
              <span>⚠</span> Unsaved Local Project Found
            </h3>
            <p className="text-sm text-slate-300">
              A previously unsaved draft was found in local browser storage (
              <strong className="text-white">{pendingDraft?.name}</strong>).
              Would you like to restore it or discard it?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={discardDraft}
                className="px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition"
              >
                Discard Draft
              </button>
              <button
                type="button"
                onClick={restoreDraft}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded transition"
              >
                Restore Project
              </button>
            </div>
          </div>
        </div>
      )}
    </EditorContext.Provider>
  );
};
