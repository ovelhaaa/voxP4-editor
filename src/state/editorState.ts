import { createContext, useContext } from 'react';
import {
  EntityTarget,
  EntityTargetType,
  ParameterValue,
  Preset,
  Scene,
  SceneMetadata,
  Setlist,
  Subscene,
  ValidationResult,
  VoxP4Library,
} from '../domain/models';
import { generateId, generateLibraryId } from '../domain/ids';
import { validateLibrary } from '../domain/validation';
import { serializeLibrary } from '../domain/serialization';
import { saveDraft } from '../persistence/draftStorage';
import { canonicalDemoLibrary } from '../fixtures/demoLibrary';

export interface SelectionState {
  type: EntityTargetType;
  id: string;
  subsceneId?: string;
  paramName?: string;
}

export interface EditorState {
  library: VoxP4Library;
  past: VoxP4Library[];
  future: VoxP4Library[];
  selection: SelectionState;
  validation: ValidationResult;
  isDirty: boolean;
  lastCheckpointSerialized: string;
}

type Action =
  | { type: 'LOAD_LIBRARY'; library: VoxP4Library; isNewRoot: boolean; markClean?: boolean }
  | { type: 'SET_SELECTION'; selection: SelectionState }
  | { type: 'NAVIGATE_TO_TARGET'; target: EntityTarget }
  | { type: 'UPDATE_LIBRARY_NAME'; name: string }
  | { type: 'ADD_PRESET'; name?: string }
  | { type: 'UPDATE_PRESET'; preset: Preset }
  | { type: 'DUPLICATE_PRESET'; presetId: string }
  | { type: 'DELETE_PRESET'; presetId: string }
  | { type: 'SET_PRESET_PARAMETER'; presetId: string; paramName: string; value: ParameterValue }
  | { type: 'DELETE_PRESET_PARAMETER'; presetId: string; paramName: string }
  | { type: 'ADD_SCENE'; name?: string; basePresetId?: string }
  | { type: 'UPDATE_SCENE'; scene: Scene }
  | { type: 'DUPLICATE_SCENE'; sceneId: string }
  | { type: 'DELETE_SCENE'; sceneId: string }
  | { type: 'SET_SCENE_PARAMETER'; sceneId: string; paramName: string; value: ParameterValue }
  | { type: 'DELETE_SCENE_PARAMETER'; sceneId: string; paramName: string }
  | { type: 'UPDATE_SCENE_METADATA'; sceneId: string; metadata: SceneMetadata }
  | { type: 'ADD_SUBSCENE'; sceneId: string; name?: string }
  | { type: 'UPDATE_SUBSCENE'; sceneId: string; subscene: Subscene }
  | { type: 'DUPLICATE_SUBSCENE'; sceneId: string; subsceneId: string }
  | { type: 'DELETE_SUBSCENE'; sceneId: string; subsceneId: string }
  | { type: 'REORDER_SUBSCENES'; sceneId: string; subscenes: Subscene[] }
  | {
      type: 'SET_SUBSCENE_PARAMETER';
      sceneId: string;
      subsceneId: string;
      paramName: string;
      value: ParameterValue;
    }
  | {
      type: 'DELETE_SUBSCENE_PARAMETER';
      sceneId: string;
      subsceneId: string;
      paramName: string;
    }
  | { type: 'ADD_SETLIST'; name?: string }
  | { type: 'UPDATE_SETLIST'; setlist: Setlist }
  | { type: 'DELETE_SETLIST'; setlistId: string }
  | { type: 'ADD_SETLIST_ENTRY'; setlistId: string; sceneId: string }
  | { type: 'REMOVE_SETLIST_ENTRY'; setlistId: string; entryId: string }
  | { type: 'REORDER_SETLIST_ENTRIES'; setlistId: string; direction: 'up' | 'down'; index: number }
  | { type: 'MARK_CLEAN' }
  | { type: 'UNDO' }
  | { type: 'REDO' };

export function createEmptyLibrary(name = 'New Live Rig'): VoxP4Library {
  const initialPreset: Preset = {
    id: generateId('preset'),
    name: 'Default Clean',
    parameters: {},
  };
  const initialSubscene: Subscene = {
    id: generateId('subscene'),
    name: 'Main Section',
    parameters: {},
  };
  const initialScene: Scene = {
    id: generateId('scene'),
    name: 'Song 1',
    basePresetId: initialPreset.id,
    parameters: {
      TempoBpm: 120,
      HarmonyKey: 'C',
      HarmonyScale: 'Major',
    },
    subscenes: [initialSubscene],
  };
  const initialSetlist: Setlist = {
    id: generateId('setlist'),
    name: 'Live Set',
    entries: [{ id: generateId('entry'), sceneId: initialScene.id }],
  };

  return {
    format: 'voxp4-library',
    formatVersion: 1,
    schemaVersion: 1,
    libraryId: generateLibraryId(name),
    name,
    presets: [initialPreset],
    scenes: [initialScene],
    setlists: [initialSetlist],
  };
}

export function createInitialState(initialLib?: VoxP4Library): EditorState {
  const lib = initialLib ?? canonicalDemoLibrary;
  const serialized = serializeLibrary(lib);
  const initialSelection: SelectionState = lib.scenes[0]
    ? { type: 'scene', id: lib.scenes[0].id }
    : lib.presets[0]
      ? { type: 'preset', id: lib.presets[0].id }
      : { type: 'library', id: lib.libraryId };

  return {
    library: lib,
    past: [],
    future: [],
    selection: initialSelection,
    validation: validateLibrary(lib),
    isDirty: false,
    lastCheckpointSerialized: serialized,
  };
}

function commitLibrary(
  state: EditorState,
  newLibrary: VoxP4Library,
  newSelection?: SelectionState
): EditorState {
  const newSerialized = serializeLibrary(newLibrary);
  const isDirty = newSerialized !== state.lastCheckpointSerialized;
  const validation = validateLibrary(newLibrary);

  // Auto-save draft asynchronously
  saveDraft(newLibrary);

  return {
    ...state,
    library: newLibrary,
    past: [...state.past.slice(-49), state.library],
    future: [],
    selection: newSelection ?? state.selection,
    validation,
    isDirty,
  };
}

export function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'LOAD_LIBRARY': {
      const serialized = serializeLibrary(action.library);
      const validation = validateLibrary(action.library);
      const firstScene = action.library.scenes[0];
      const firstPreset = action.library.presets[0];
      const newSelection: SelectionState = firstScene
        ? { type: 'scene', id: firstScene.id }
        : firstPreset
          ? { type: 'preset', id: firstPreset.id }
          : { type: 'library', id: action.library.libraryId };

      if (action.markClean) {
        saveDraft(action.library);
      }

      return {
        library: action.library,
        past: action.isNewRoot ? [] : [...state.past.slice(-49), state.library],
        future: action.isNewRoot ? [] : state.future,
        selection: newSelection,
        validation,
        isDirty: !action.markClean,
        lastCheckpointSerialized: action.markClean ? serialized : state.lastCheckpointSerialized,
      };
    }

    case 'SET_SELECTION':
      return { ...state, selection: action.selection };

    case 'NAVIGATE_TO_TARGET': {
      const t = action.target;
      return {
        ...state,
        selection: {
          type: t.type,
          id: t.id,
          subsceneId: t.subsceneId,
          paramName: t.paramName,
        },
      };
    }

    case 'MARK_CLEAN': {
      const serialized = serializeLibrary(state.library);
      return {
        ...state,
        isDirty: false,
        lastCheckpointSerialized: serialized,
      };
    }

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, state.past.length - 1);
      const newSerialized = serializeLibrary(previous);
      saveDraft(previous);

      return {
        ...state,
        library: previous,
        past: newPast,
        future: [state.library, ...state.future],
        validation: validateLibrary(previous),
        isDirty: newSerialized !== state.lastCheckpointSerialized,
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      const newSerialized = serializeLibrary(next);
      saveDraft(next);

      return {
        ...state,
        library: next,
        past: [...state.past, state.library],
        future: newFuture,
        validation: validateLibrary(next),
        isDirty: newSerialized !== state.lastCheckpointSerialized,
      };
    }

    case 'UPDATE_LIBRARY_NAME': {
      const updated: VoxP4Library = { ...state.library, name: action.name };
      return commitLibrary(state, updated);
    }

    // --- PRESETS ---
    case 'ADD_PRESET': {
      const newId = generateId('preset');
      const newPreset: Preset = {
        id: newId,
        name: action.name || `Preset ${state.library.presets.length + 1}`,
        parameters: {},
      };
      const updated: VoxP4Library = {
        ...state.library,
        presets: [...state.library.presets, newPreset],
      };
      return commitLibrary(state, updated, { type: 'preset', id: newId });
    }

    case 'UPDATE_PRESET': {
      const updated: VoxP4Library = {
        ...state.library,
        presets: state.library.presets.map((p) =>
          p.id === action.preset.id ? action.preset : p
        ),
      };
      return commitLibrary(state, updated);
    }

    case 'DUPLICATE_PRESET': {
      const original = state.library.presets.find((p) => p.id === action.presetId);
      if (!original) return state;
      const newId = generateId('preset');
      const copy: Preset = {
        id: newId,
        name: `${original.name} (Copy)`,
        parameters: { ...original.parameters },
      };
      const updated: VoxP4Library = {
        ...state.library,
        presets: [...state.library.presets, copy],
      };
      return commitLibrary(state, updated, { type: 'preset', id: newId });
    }

    case 'DELETE_PRESET': {
      const remaining = state.library.presets.filter((p) => p.id !== action.presetId);
      const updated: VoxP4Library = { ...state.library, presets: remaining };
      const nextSelection: SelectionState = remaining[0]
        ? { type: 'preset', id: remaining[0].id }
        : { type: 'library', id: state.library.libraryId };
      return commitLibrary(state, updated, nextSelection);
    }

    case 'SET_PRESET_PARAMETER': {
      const updated: VoxP4Library = {
        ...state.library,
        presets: state.library.presets.map((p) => {
          if (p.id !== action.presetId) return p;
          return {
            ...p,
            parameters: { ...p.parameters, [action.paramName]: action.value },
          };
        }),
      };
      return commitLibrary(state, updated);
    }

    case 'DELETE_PRESET_PARAMETER': {
      const updated: VoxP4Library = {
        ...state.library,
        presets: state.library.presets.map((p) => {
          if (p.id !== action.presetId) return p;
          const params = { ...p.parameters };
          delete params[action.paramName];
          return { ...p, parameters: params };
        }),
      };
      return commitLibrary(state, updated);
    }

    // --- SCENES ---
    case 'ADD_SCENE': {
      const newId = generateId('scene');
      const basePresetId = action.basePresetId || state.library.presets[0]?.id;
      const initialSub: Subscene = {
        id: generateId('subscene'),
        name: 'Main',
        parameters: {},
      };
      const newScene: Scene = {
        id: newId,
        name: action.name || `Scene ${state.library.scenes.length + 1}`,
        basePresetId,
        parameters: {
          TempoBpm: 120,
          HarmonyKey: 'C',
          HarmonyScale: 'Major',
        },
        subscenes: [initialSub],
      };
      const updated: VoxP4Library = {
        ...state.library,
        scenes: [...state.library.scenes, newScene],
      };
      return commitLibrary(state, updated, { type: 'scene', id: newId });
    }

    case 'UPDATE_SCENE': {
      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) =>
          s.id === action.scene.id ? action.scene : s
        ),
      };
      return commitLibrary(state, updated);
    }

    case 'DUPLICATE_SCENE': {
      const original = state.library.scenes.find((s) => s.id === action.sceneId);
      if (!original) return state;
      const newId = generateId('scene');
      const copy: Scene = {
        id: newId,
        name: `${original.name} (Copy)`,
        basePresetId: original.basePresetId,
        metadata: original.metadata ? { ...original.metadata } : undefined,
        parameters: { ...original.parameters },
        subscenes: original.subscenes.map((sub) => ({
          id: generateId('subscene'),
          name: sub.name,
          parameters: { ...sub.parameters },
        })),
      };
      const updated: VoxP4Library = {
        ...state.library,
        scenes: [...state.library.scenes, copy],
      };
      return commitLibrary(state, updated, { type: 'scene', id: newId });
    }

    case 'DELETE_SCENE': {
      const remaining = state.library.scenes.filter((s) => s.id !== action.sceneId);
      const updated: VoxP4Library = { ...state.library, scenes: remaining };
      const nextSelection: SelectionState = remaining[0]
        ? { type: 'scene', id: remaining[0].id }
        : { type: 'library', id: state.library.libraryId };
      return commitLibrary(state, updated, nextSelection);
    }

    case 'SET_SCENE_PARAMETER': {
      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) => {
          if (s.id !== action.sceneId) return s;
          return {
            ...s,
            parameters: { ...s.parameters, [action.paramName]: action.value },
          };
        }),
      };
      return commitLibrary(state, updated);
    }

    case 'DELETE_SCENE_PARAMETER': {
      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) => {
          if (s.id !== action.sceneId) return s;
          const params = { ...s.parameters };
          delete params[action.paramName];
          return { ...s, parameters: params };
        }),
      };
      return commitLibrary(state, updated);
    }

    case 'UPDATE_SCENE_METADATA': {
      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) => {
          if (s.id !== action.sceneId) return s;
          return { ...s, metadata: action.metadata };
        }),
      };
      return commitLibrary(state, updated);
    }

    // --- SUBSCENES ---
    case 'ADD_SUBSCENE': {
      const newSubId = generateId('subscene');
      const newSubscene: Subscene = {
        id: newSubId,
        name: action.name || 'New Section',
        parameters: {},
      };
      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) => {
          if (s.id !== action.sceneId) return s;
          return { ...s, subscenes: [...s.subscenes, newSubscene] };
        }),
      };
      return commitLibrary(state, updated, {
        type: 'subscene',
        id: action.sceneId,
        subsceneId: newSubId,
      });
    }

    case 'UPDATE_SUBSCENE': {
      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) => {
          if (s.id !== action.sceneId) return s;
          return {
            ...s,
            subscenes: s.subscenes.map((sub) =>
              sub.id === action.subscene.id ? action.subscene : sub
            ),
          };
        }),
      };
      return commitLibrary(state, updated);
    }

    case 'DUPLICATE_SUBSCENE': {
      const scene = state.library.scenes.find((s) => s.id === action.sceneId);
      if (!scene) return state;
      const originalSub = scene.subscenes.find((sub) => sub.id === action.subsceneId);
      if (!originalSub) return state;

      const newSubId = generateId('subscene');
      const copy: Subscene = {
        id: newSubId,
        name: `${originalSub.name} (Copy)`,
        parameters: { ...originalSub.parameters },
      };

      const origIdx = scene.subscenes.indexOf(originalSub);
      const newSubscenes = [...scene.subscenes];
      newSubscenes.splice(origIdx + 1, 0, copy);

      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) =>
          s.id === action.sceneId ? { ...s, subscenes: newSubscenes } : s
        ),
      };
      return commitLibrary(state, updated, {
        type: 'subscene',
        id: action.sceneId,
        subsceneId: newSubId,
      });
    }

    case 'DELETE_SUBSCENE': {
      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) => {
          if (s.id !== action.sceneId) return s;
          return {
            ...s,
            subscenes: s.subscenes.filter((sub) => sub.id !== action.subsceneId),
          };
        }),
      };
      return commitLibrary(state, updated, { type: 'scene', id: action.sceneId });
    }

    case 'REORDER_SUBSCENES': {
      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) =>
          s.id === action.sceneId ? { ...s, subscenes: action.subscenes } : s
        ),
      };
      return commitLibrary(state, updated);
    }

    case 'SET_SUBSCENE_PARAMETER': {
      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) => {
          if (s.id !== action.sceneId) return s;
          return {
            ...s,
            subscenes: s.subscenes.map((sub) => {
              if (sub.id !== action.subsceneId) return sub;
              return {
                ...sub,
                parameters: { ...sub.parameters, [action.paramName]: action.value },
              };
            }),
          };
        }),
      };
      return commitLibrary(state, updated);
    }

    case 'DELETE_SUBSCENE_PARAMETER': {
      const updated: VoxP4Library = {
        ...state.library,
        scenes: state.library.scenes.map((s) => {
          if (s.id !== action.sceneId) return s;
          return {
            ...s,
            subscenes: s.subscenes.map((sub) => {
              if (sub.id !== action.subsceneId) return sub;
              const params = { ...sub.parameters };
              delete params[action.paramName];
              return { ...sub, parameters: params };
            }),
          };
        }),
      };
      return commitLibrary(state, updated);
    }

    // --- SETLISTS ---
    case 'ADD_SETLIST': {
      const newId = generateId('setlist');
      const newSetlist: Setlist = {
        id: newId,
        name: action.name || `Setlist ${state.library.setlists.length + 1}`,
        entries: [],
      };
      const updated: VoxP4Library = {
        ...state.library,
        setlists: [...state.library.setlists, newSetlist],
      };
      return commitLibrary(state, updated, { type: 'setlist', id: newId });
    }

    case 'UPDATE_SETLIST': {
      const updated: VoxP4Library = {
        ...state.library,
        setlists: state.library.setlists.map((st) =>
          st.id === action.setlist.id ? action.setlist : st
        ),
      };
      return commitLibrary(state, updated);
    }

    case 'DELETE_SETLIST': {
      const remaining = state.library.setlists.filter((st) => st.id !== action.setlistId);
      const updated: VoxP4Library = { ...state.library, setlists: remaining };
      const nextSelection: SelectionState = remaining[0]
        ? { type: 'setlist', id: remaining[0].id }
        : { type: 'library', id: state.library.libraryId };
      return commitLibrary(state, updated, nextSelection);
    }

    case 'ADD_SETLIST_ENTRY': {
      const newEntryId = generateId('entry');
      const updated: VoxP4Library = {
        ...state.library,
        setlists: state.library.setlists.map((st) => {
          if (st.id !== action.setlistId) return st;
          return {
            ...st,
            entries: [...st.entries, { id: newEntryId, sceneId: action.sceneId }],
          };
        }),
      };
      return commitLibrary(state, updated);
    }

    case 'REMOVE_SETLIST_ENTRY': {
      const updated: VoxP4Library = {
        ...state.library,
        setlists: state.library.setlists.map((st) => {
          if (st.id !== action.setlistId) return st;
          return {
            ...st,
            entries: st.entries.filter((e) => e.id !== action.entryId),
          };
        }),
      };
      return commitLibrary(state, updated);
    }

    case 'REORDER_SETLIST_ENTRIES': {
      const setlist = state.library.setlists.find((st) => st.id === action.setlistId);
      if (!setlist) return state;

      const newEntries = [...setlist.entries];
      const targetIdx = action.direction === 'up' ? action.index - 1 : action.index + 1;
      if (targetIdx < 0 || targetIdx >= newEntries.length) return state;

      const [moved] = newEntries.splice(action.index, 1);
      newEntries.splice(targetIdx, 0, moved);

      const updated: VoxP4Library = {
        ...state.library,
        setlists: state.library.setlists.map((st) =>
          st.id === action.setlistId ? { ...st, entries: newEntries } : st
        ),
      };
      return commitLibrary(state, updated);
    }

    default:
      return state;
  }
}

export interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<Action>;
  createNewLibrary: (name?: string) => void;
  loadDemo: () => void;
  importLibraryCandidate: (candidateJson: string) => { success: boolean; errors: string[] };
  exportLibrary: () => void;
  undo: () => void;
  redo: () => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor must be used within an EditorProvider');
  return ctx;
}
