import React, { useState } from 'react';
import { useEditor } from '../../state/editorState';
import { Setlist } from '../../domain/models';
import { ListOrdered, Plus, ArrowUp, ArrowDown, Trash2, Music } from 'lucide-react';

interface SetlistEditorProps {
  setlist: Setlist;
}

export const SetlistEditor: React.FC<SetlistEditorProps> = ({ setlist }) => {
  const { state, dispatch } = useEditor();
  const scenes = state.library.scenes;

  const [selectedSceneToAdd, setSelectedSceneToAdd] = useState<string>(
    scenes[0]?.id || ''
  );

  const handleAddScene = () => {
    if (!selectedSceneToAdd) return;
    dispatch({
      type: 'ADD_SETLIST_ENTRY',
      setlistId: setlist.id,
      sceneId: selectedSceneToAdd,
    });
  };

  const handleReorder = (index: number, direction: 'up' | 'down') => {
    dispatch({
      type: 'REORDER_SETLIST_ENTRIES',
      setlistId: setlist.id,
      index,
      direction,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-purple-400 text-xs font-mono font-semibold">
            <ListOrdered className="w-4 h-4" />
            <span>SETLIST CONFIGURATION (LIVE SHOW)</span>
          </div>
          <input
            type="text"
            value={setlist.name}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_SETLIST',
                setlist: { ...setlist, name: e.target.value },
              })
            }
            className="text-2xl font-bold bg-transparent text-white border-b border-transparent hover:border-slate-700 focus:border-purple-500 focus:outline-none transition py-0.5"
            placeholder="Setlist Name"
          />
          <div className="text-xs font-mono text-slate-400">
            ID: <span className="text-slate-300">{setlist.id}</span>
          </div>
        </div>

        <div>
          {state.library.setlists.length > 1 && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'DELETE_SETLIST', setlistId: setlist.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 rounded transition font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Setlist</span>
            </button>
          )}
        </div>
      </div>

      {/* Add Scene to Setlist Bar */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row items-center gap-3 justify-between">
        <div className="w-full sm:w-auto flex-1">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-1">
            Add Song (Scene) to Setlist
          </label>
          <select
            value={selectedSceneToAdd}
            onChange={(e) => setSelectedSceneToAdd(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-medium text-slate-200 focus:border-purple-500 focus:outline-none"
          >
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleAddScene}
          disabled={!selectedSceneToAdd}
          className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-semibold transition disabled:opacity-50 mt-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Song to Set</span>
        </button>
      </div>

      {/* Entries List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 tracking-wide flex items-center gap-2">
            <span>Show Order ({setlist.entries?.length || 0} Songs)</span>
          </h3>
          <span className="text-xs text-slate-400">
            Note: Songs can be added multiple times (e.g. encore, reprise) with unique entry IDs.
          </span>
        </div>

        {(!setlist.entries || setlist.entries.length === 0) ? (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-8 text-center text-xs text-slate-400">
            This setlist is currently empty. Select a scene above and click &quot;Add Song to Set&quot; to build the show sequence.
          </div>
        ) : (
          <div className="space-y-2">
            {setlist.entries.map((entry, idx) => {
              const scene = scenes.find((s) => s.id === entry.sceneId);
              return (
                <div
                  key={entry.id}
                  className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-lg p-3 flex items-center justify-between transition group"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 flex items-center justify-center rounded-full bg-purple-950/60 text-purple-300 border border-purple-800/60 text-xs font-mono font-bold">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                        <Music className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{scene ? scene.name : `[Unknown Scene: ${entry.sceneId}]`}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
                        <span>scene: {entry.sceneId}</span>
                        <span>•</span>
                        <span>entry: {entry.id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleReorder(idx, 'up')}
                      className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20 rounded hover:bg-slate-800"
                      title="Move up in setlist"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === setlist.entries.length - 1}
                      onClick={() => handleReorder(idx, 'down')}
                      className="p-1.5 text-slate-400 hover:text-white disabled:opacity-20 rounded hover:bg-slate-800"
                      title="Move down in setlist"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'REMOVE_SETLIST_ENTRY',
                          setlistId: setlist.id,
                          entryId: entry.id,
                        })
                      }
                      className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 ml-1"
                      title="Remove from setlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
