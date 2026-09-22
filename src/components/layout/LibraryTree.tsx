import React from 'react';
import { useEditor } from '../../state/editorState';
import {
  Mic,
  Music,
  ListOrdered,
  Plus,
  Copy,
  Trash2,
  ChevronRight,
} from 'lucide-react';

export const LibraryTree: React.FC = () => {
  const { state, dispatch } = useEditor();
  const { presets, scenes, setlists } = state.library;
  const currentSelection = state.selection;

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col select-none shrink-0 overflow-y-auto">
      {/* 1. PRESETS */}
      <div className="p-3 border-b border-slate-800/80">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 tracking-wider mb-2">
          <div className="flex items-center gap-1.5 text-blue-400">
            <Mic className="w-3.5 h-3.5" />
            <span>PRESETS</span>
            <span className="text-[10px] bg-blue-950/60 text-blue-300 px-1.5 py-0.2 rounded font-mono">
              {presets.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_PRESET' })}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
            title="Create new Preset"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-0.5">
          {presets.map((preset) => {
            const isSelected =
              currentSelection.type === 'preset' && currentSelection.id === preset.id;
            const paramCount = Object.keys(preset.parameters || {}).length;

            return (
              <div
                key={preset.id}
                onClick={() =>
                  dispatch({
                    type: 'SET_SELECTION',
                    selection: { type: 'preset', id: preset.id },
                  })
                }
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition ${
                  isSelected
                    ? 'bg-blue-950/70 text-blue-200 border border-blue-800/80 font-medium'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="truncate">{preset.name}</span>
                  {paramCount > 0 && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      ({paramCount})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'DUPLICATE_PRESET', presetId: preset.id });
                    }}
                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 rounded"
                    title="Duplicate Preset"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {presets.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'DELETE_PRESET', presetId: preset.id });
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded"
                      title="Delete Preset"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. SCENES (Songs) & SUBSCENES (Sections) */}
      <div className="p-3 border-b border-slate-800/80 flex-1">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 tracking-wider mb-2">
          <div className="flex items-center gap-1.5 text-emerald-400">
            <Music className="w-3.5 h-3.5" />
            <span>SCENES (SONGS)</span>
            <span className="text-[10px] bg-emerald-950/60 text-emerald-300 px-1.5 py-0.2 rounded font-mono">
              {scenes.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_SCENE' })}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
            title="Create new Scene (Song)"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-2">
          {scenes.map((scene) => {
            const isSceneSelected =
              currentSelection.type === 'scene' && currentSelection.id === scene.id;
            const basePreset = presets.find((p) => p.id === scene.basePresetId);

            return (
              <div key={scene.id} className="space-y-0.5">
                {/* Scene Row */}
                <div
                  onClick={() =>
                    dispatch({
                      type: 'SET_SELECTION',
                      selection: { type: 'scene', id: scene.id },
                    })
                  }
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition ${
                    isSceneSelected
                      ? 'bg-emerald-950/70 text-emerald-200 border border-emerald-800/80 font-medium'
                      : 'text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="truncate">
                    <div className="truncate font-semibold">{scene.name}</div>
                    {basePreset && (
                      <div className="text-[10px] text-slate-400 truncate flex items-center gap-1 font-mono">
                        <span>preset:</span>
                        <span className="text-slate-300">{basePreset.name}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({
                          type: 'ADD_SUBSCENE',
                          sceneId: scene.id,
                          name: 'Section',
                        });
                      }}
                      className="p-1 text-slate-400 hover:text-emerald-400 hover:bg-slate-700/60 rounded"
                      title="Add Subscene Section"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'DUPLICATE_SCENE', sceneId: scene.id });
                      }}
                      className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 rounded"
                      title="Duplicate Scene"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    {scenes.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch({ type: 'DELETE_SCENE', sceneId: scene.id });
                        }}
                        className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded"
                        title="Delete Scene"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Subscenes Nested List */}
                <div className="pl-3 border-l border-slate-800/60 ml-2 space-y-0.5">
                  {(scene.subscenes || []).map((sub) => {
                    const isSubSelected =
                      currentSelection.type === 'subscene' &&
                      currentSelection.id === scene.id &&
                      currentSelection.subsceneId === sub.id;
                    const subParamCount = Object.keys(sub.parameters || {}).length;

                    return (
                      <div
                        key={sub.id}
                        onClick={() =>
                          dispatch({
                            type: 'SET_SELECTION',
                            selection: {
                              type: 'subscene',
                              id: scene.id,
                              subsceneId: sub.id,
                            },
                          })
                        }
                        className={`group flex items-center justify-between px-2 py-1 rounded text-[11px] cursor-pointer transition ${
                          isSubSelected
                            ? 'bg-amber-950/70 text-amber-200 border border-amber-800/80 font-medium'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <ChevronRight className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate">{sub.name}</span>
                          {subParamCount > 0 && (
                            <span className="text-[9px] bg-amber-900/40 text-amber-300 px-1 rounded font-mono">
                              {subParamCount} overrides
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              dispatch({
                                type: 'DUPLICATE_SUBSCENE',
                                sceneId: scene.id,
                                subsceneId: sub.id,
                              });
                            }}
                            className="p-0.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 rounded"
                            title="Duplicate Subscene"
                          >
                            <Copy className="w-2.5 h-2.5" />
                          </button>
                          {scene.subscenes.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatch({
                                  type: 'DELETE_SUBSCENE',
                                  sceneId: scene.id,
                                  subsceneId: sub.id,
                                });
                              }}
                              className="p-0.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded"
                              title="Delete Subscene"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. SETLISTS */}
      <div className="p-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-400 tracking-wider mb-2">
          <div className="flex items-center gap-1.5 text-purple-400">
            <ListOrdered className="w-3.5 h-3.5" />
            <span>SETLISTS</span>
            <span className="text-[10px] bg-purple-950/60 text-purple-300 px-1.5 py-0.2 rounded font-mono">
              {setlists.length}
            </span>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_SETLIST' })}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition"
            title="Create new Setlist"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-0.5">
          {setlists.map((setlist) => {
            const isSelected =
              currentSelection.type === 'setlist' && currentSelection.id === setlist.id;
            const entryCount = setlist.entries?.length || 0;

            return (
              <div
                key={setlist.id}
                onClick={() =>
                  dispatch({
                    type: 'SET_SELECTION',
                    selection: { type: 'setlist', id: setlist.id },
                  })
                }
                className={`group flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition ${
                  isSelected
                    ? 'bg-purple-950/70 text-purple-200 border border-purple-800/80 font-medium'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="truncate">{setlist.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    ({entryCount} songs)
                  </span>
                </div>

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
                  {setlists.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: 'DELETE_SETLIST', setlistId: setlist.id });
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-700/60 rounded"
                      title="Delete Setlist"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
