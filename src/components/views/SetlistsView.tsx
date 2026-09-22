import React, { useState } from 'react';
import { useEditor } from '../../state/editorState';
import { Setlist } from '../../domain/models';
import { resolveSongMusicalAttributes } from '../../domain/musicalResolution';
import {
  ListOrdered,
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Music,
} from 'lucide-react';

export const SetlistsView: React.FC = () => {
  const { state, dispatch } = useEditor();
  const { setlists, scenes, presets } = state.library;
  const selection = state.selection;

  const activeSetlistId =
    selection.type === 'setlist' ? selection.id : setlists[0]?.id;

  const currentSetlist =
    setlists.find((st) => st.id === activeSetlistId) || setlists[0];

  const [selectedSceneToAdd, setSelectedSceneToAdd] = useState<string>(
    scenes[0]?.id || ''
  );

  if (!currentSetlist) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#716E69]">
        <ListOrdered className="w-12 h-12 mb-3 text-[#34343C]" />
        <h2 className="text-base font-bold text-[#F0EDE5] mb-1">No Setlists in Library</h2>
        <p className="text-xs max-w-sm mb-4">
          Organize your songs into live concert performance sets.
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_SETLIST', name: 'Main Show' })}
          className="px-4 py-2 bg-[#F45126] hover:bg-[#FF6030] text-[#090A0E] text-xs font-mono font-bold rounded-[3px] transition cursor-pointer"
        >
          + Add Setlist
        </button>
      </div>
    );
  }

  const handleAddScene = () => {
    if (!selectedSceneToAdd) return;
    dispatch({
      type: 'ADD_SETLIST_ENTRY',
      setlistId: currentSetlist.id,
      sceneId: selectedSceneToAdd,
    });
  };

  const handleReorder = (index: number, direction: 'up' | 'down') => {
    dispatch({
      type: 'REORDER_SETLIST_ENTRIES',
      setlistId: currentSetlist.id,
      index,
      direction,
    });
  };

  const handleSelectSetlist = (setlist: Setlist) => {
    dispatch({
      type: 'SET_SELECTION',
      selection: { type: 'setlist', id: setlist.id },
    });
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#090A0E]">
      {/* Setlists Sidebar */}
      <aside className="w-full md:w-60 bg-[#101116] border-b md:border-b-0 md:border-r border-[#292A30] flex flex-col shrink-0">
        <div className="p-3 border-b border-[#292A30] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ListOrdered className="w-4 h-4 text-[#F45126]" />
            <span className="text-xs font-bold tracking-wider text-[#F0EDE5]">
              SETLISTS
            </span>
            <span className="text-[10px] font-mono bg-[#14151B] text-[#B1ACA3] px-1.5 py-0.2 rounded border border-[#292A30]">
              {setlists.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_SETLIST' })}
            className="p-1 hover:bg-[#1C1D24] text-[#B1ACA3] hover:text-[#FF6030] rounded-[3px] transition cursor-pointer"
            title="Create new Setlist"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Setlists List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {setlists.map((setlist) => {
            const isSelected = setlist.id === currentSetlist.id;
            const songCount = setlist.entries?.length || 0;

            return (
              <div
                key={setlist.id}
                onClick={() => handleSelectSetlist(setlist)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-[4px] text-xs cursor-pointer transition border ${
                  isSelected
                    ? 'bg-[#1C1D24] text-[#F0EDE5] border-[#F45126]/60 font-medium'
                    : 'text-[#B1ACA3] hover:bg-[#14151B] hover:text-[#F0EDE5] border-transparent'
                }`}
              >
                <div className="truncate min-w-0 flex-1">
                  <div className="truncate font-semibold">{setlist.name}</div>
                  <div className="text-[10px] text-[#716E69] font-mono">
                    {songCount} {songCount === 1 ? 'song' : 'songs'}
                  </div>
                </div>

                {setlists.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: 'DELETE_SETLIST', setlistId: setlist.id });
                    }}
                    className="p-1 text-[#716E69] hover:text-[#E65050] rounded opacity-60 hover:opacity-100 transition cursor-pointer"
                    title="Delete Setlist"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Setlist Canvas */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 max-w-4xl">
        {/* Setlist Header */}
        <div className="bg-[#14151B] border border-[#292A30] rounded-[5px] p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={currentSetlist.name}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_SETLIST',
                  setlist: { ...currentSetlist, name: e.target.value },
                })
              }
              placeholder="Setlist Name"
              className="text-xl md:text-2xl font-bold bg-transparent text-[#F0EDE5] border-b border-transparent hover:border-[#34343C] focus:border-[#F45126] focus:outline-none transition py-0.5 w-full"
            />
            <div className="text-[11px] text-[#716E69] font-mono mt-0.5">
              Live Concert Performance Order
            </div>
          </div>

          {setlists.length > 1 && (
            <button
              type="button"
              onClick={() =>
                dispatch({ type: 'DELETE_SETLIST', setlistId: currentSetlist.id })
              }
              className="h-8 px-3 rounded-[3px] bg-[#101116] hover:bg-[#E65050]/20 text-[#E65050] border border-[#292A30] hover:border-[#E65050]/40 text-xs font-mono transition cursor-pointer flex items-center gap-1.5 shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Setlist</span>
            </button>
          )}
        </div>

        {/* Add Song to Set Bar */}
        <div className="bg-[#101116] border border-[#292A30] rounded-[5px] p-4 flex flex-col sm:flex-row items-center gap-3 justify-between">
          <div className="w-full sm:w-auto flex-1">
            <label className="text-[10px] font-mono uppercase tracking-wider text-[#716E69] block mb-1">
              Select Song to Add
            </label>
            <select
              value={selectedSceneToAdd}
              onChange={(e) => setSelectedSceneToAdd(e.target.value)}
              className="w-full bg-[#14151B] border border-[#34343C] rounded-[4px] px-3 py-2 text-xs font-medium text-[#F0EDE5] focus:border-[#F45126] focus:outline-none cursor-pointer"
            >
              {scenes.map((s) => (
                <option key={s.id} value={s.id} className="bg-[#14151B]">
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleAddScene}
            disabled={!selectedSceneToAdd}
            className="w-full sm:w-auto h-9 px-4 bg-[#F45126] hover:bg-[#FF6030] text-[#090A0E] rounded-[3px] text-xs font-mono font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 sm:self-end"
          >
            <Plus className="w-4 h-4" />
            <span>Add Song to Set</span>
          </button>
        </div>

        {/* Setlist Song Rows */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-mono text-[#716E69]">
            <span className="uppercase tracking-wider">
              SHOW SEQUENCE ({currentSetlist.entries?.length || 0} SONGS)
            </span>
          </div>

          {!currentSetlist.entries || currentSetlist.entries.length === 0 ? (
            <div className="bg-[#14151B] border border-[#292A30] rounded-[5px] p-8 text-center text-xs text-[#716E69]">
              This setlist is empty. Add songs above to arrange your performance set.
            </div>
          ) : (
            <div className="space-y-2">
              {currentSetlist.entries.map((entry, idx) => {
                const scene = scenes.find((s) => s.id === entry.sceneId);
                const scenePreset = presets.find((p) => p.id === scene?.basePresetId);
                const musicalAttrs = resolveSongMusicalAttributes(scene, scenePreset);

                return (
                  <div
                    key={entry.id}
                    className="bg-[#14151B] border border-[#292A30] hover:border-[#34343C] rounded-[4px] p-3 flex items-center justify-between transition group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-7 h-7 flex items-center justify-center rounded-[3px] bg-[#101116] text-[#FF6030] border border-[#292A30] text-xs font-mono font-bold shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>

                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F0EDE5] flex items-center gap-2 truncate">
                          <Music className="w-3.5 h-3.5 text-[#20D6C7] shrink-0" />
                          <span className="truncate">
                            {scene ? scene.name : `[Unknown Song: ${entry.sceneId}]`}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#716E69] font-mono flex items-center gap-2 mt-0.5">
                          <span className="text-[#20D6C7]">{musicalAttrs.tempo} BPM</span>
                          <span>·</span>
                          <span className="text-[#20D6C7]">Key {musicalAttrs.key}</span>
                          <span>·</span>
                          <span>{scene?.subscenes?.length || 0} sections</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleReorder(idx, 'up')}
                        className="p-1.5 text-[#716E69] hover:text-[#F0EDE5] disabled:opacity-20 rounded-[3px] hover:bg-[#1C1D24] opacity-70 hover:opacity-100 transition cursor-pointer"
                        title="Move up"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === currentSetlist.entries.length - 1}
                        onClick={() => handleReorder(idx, 'down')}
                        className="p-1.5 text-[#716E69] hover:text-[#F0EDE5] disabled:opacity-20 rounded-[3px] hover:bg-[#1C1D24] opacity-70 hover:opacity-100 transition cursor-pointer"
                        title="Move down"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: 'REMOVE_SETLIST_ENTRY',
                            setlistId: currentSetlist.id,
                            entryId: entry.id,
                          })
                        }
                        className="p-1.5 text-[#716E69] hover:text-[#E65050] rounded-[3px] hover:bg-[#1C1D24] opacity-70 hover:opacity-100 transition cursor-pointer ml-1"
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
      </main>
    </div>
  );
};
