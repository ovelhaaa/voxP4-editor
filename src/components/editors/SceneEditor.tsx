import React from 'react';
import { useEditor } from '../../state/editorState';
import { Scene } from '../../domain/models';
import { Music, Copy, Trash2, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react';
import { catalog } from '../../domain/catalog';

interface SceneEditorProps {
  scene: Scene;
}

export const SceneEditor: React.FC<SceneEditorProps> = ({ scene }) => {
  const { state, dispatch } = useEditor();
  const presets = state.library.presets;

  const quickSectionNames = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Outro', 'Solo'];

  const handleBasePresetChange = (basePresetId: string) => {
    dispatch({
      type: 'UPDATE_SCENE',
      scene: { ...scene, basePresetId: basePresetId || undefined },
    });
  };

  const handleMetadataChange = (key: 'artist' | 'notes' | 'tags', val: string) => {
    dispatch({
      type: 'UPDATE_SCENE_METADATA',
      sceneId: scene.id,
      metadata: {
        ...(scene.metadata || {}),
        [key]: val,
      },
    });
  };

  const handleReorderSubscenes = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= scene.subscenes.length) return;

    const list = [...scene.subscenes];
    const [moved] = list.splice(index, 1);
    list.splice(targetIdx, 0, moved);

    dispatch({
      type: 'REORDER_SUBSCENES',
      sceneId: scene.id,
      subscenes: list,
    });
  };

  const handleQuickAddSubscene = (name: string) => {
    dispatch({
      type: 'ADD_SUBSCENE',
      sceneId: scene.id,
      name,
    });
  };

  const tempoVal =
    typeof scene.parameters?.TempoBpm === 'number'
      ? scene.parameters.TempoBpm
      : 120;
  const keyVal = scene.parameters?.HarmonyKey ?? 'C';
  const scaleVal = scene.parameters?.HarmonyScale ?? 'Major';

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-semibold">
            <Music className="w-4 h-4" />
            <span>SCENE CONFIGURATION (SONG)</span>
          </div>
          <input
            type="text"
            value={scene.name}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_SCENE',
                scene: { ...scene, name: e.target.value },
              })
            }
            className="text-2xl font-bold bg-transparent text-white border-b border-transparent hover:border-slate-700 focus:border-emerald-500 focus:outline-none transition py-0.5"
            placeholder="Scene / Song Name"
          />
          <div className="text-xs font-mono text-slate-400">
            ID: <span className="text-slate-300">{scene.id}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'DUPLICATE_SCENE', sceneId: scene.id })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition font-medium"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>
          {state.library.scenes.length > 1 && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'DELETE_SCENE', sceneId: scene.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 rounded transition font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Base Preset & Core Musical Parameters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Base Preset Selector */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4 space-y-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Base Preset (Sound Inheritance)
          </label>
          <select
            value={scene.basePresetId || ''}
            onChange={(e) => handleBasePresetChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-xs font-medium text-slate-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">-- No Base Preset (Use Defaults) --</option>
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400">
            All subscenes in this song inherit effects from this preset unless specifically overridden.
          </p>
        </div>

        {/* Musical Parameters: Tempo, Key, Scale */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-4 space-y-3">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
            Song Musical Attributes
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-slate-400 font-mono block mb-1">
                TEMPO (BPM)
              </label>
              <input
                type="number"
                min={30}
                max={300}
                step={0.1}
                value={tempoVal}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SCENE_PARAMETER',
                    sceneId: scene.id,
                    paramName: 'TempoBpm',
                    value: parseFloat(e.target.value) || 120,
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-mono block mb-1">
                KEY
              </label>
              <select
                value={String(keyVal)}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SCENE_PARAMETER',
                    sceneId: scene.id,
                    paramName: 'HarmonyKey',
                    value: e.target.value,
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
              >
                {catalog.getEnumValues('HarmonyKey')?.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-mono block mb-1">
                SCALE
              </label>
              <select
                value={String(scaleVal)}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SCENE_PARAMETER',
                    sceneId: scene.id,
                    paramName: 'HarmonyScale',
                    value: e.target.value,
                  })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
              >
                {catalog.getEnumValues('HarmonyScale')?.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-slate-400">
            Per V1 contract: Tempo, Key, and Scale are stored as canonical parameters, not metadata.
          </p>
        </div>
      </div>

      {/* Freeform Metadata Section */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4 space-y-3">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Non-DSP Performance Metadata
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Artist</label>
            <input
              type="text"
              value={scene.metadata?.artist || ''}
              onChange={(e) => handleMetadataChange('artist', e.target.value)}
              placeholder="e.g. Queen, Leonard Cohen"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Tags</label>
            <input
              type="text"
              value={scene.metadata?.tags || ''}
              onChange={(e) => handleMetadataChange('tags', e.target.value)}
              placeholder="e.g. ballad, live, acoustic"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[11px] text-slate-400 block mb-1">Notes</label>
            <input
              type="text"
              value={scene.metadata?.notes || ''}
              onChange={(e) => handleMetadataChange('notes', e.target.value)}
              placeholder="e.g. Starts softly with guitar"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Subscenes (Song Sections) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-200 tracking-wide flex items-center gap-2">
              <span>Subscenes / Song Sections ({scene.subscenes?.length || 0})</span>
            </h3>
            <p className="text-xs text-slate-400">
              Ordered song sections for performance switching during live play
            </p>
          </div>

          {/* Quick-name convenience buttons */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-400 mr-1 hidden sm:inline">Add:</span>
            {quickSectionNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleQuickAddSubscene(name)}
                className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded border border-slate-700 transition"
                title={`Add ${name} section`}
              >
                +{name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {(scene.subscenes || []).map((sub, idx) => {
            const overrideCount = Object.keys(sub.parameters || {}).length;
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
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-lg p-3 flex items-center justify-between cursor-pointer transition group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 h-5 flex items-center justify-center rounded bg-slate-800 text-[11px] font-mono text-slate-400">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                      <span>{sub.name}</span>
                      {overrideCount > 0 ? (
                        <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30">
                          {overrideCount} {overrideCount === 1 ? 'override' : 'overrides'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-500 font-mono">
                          fully inherits scene
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">ID: {sub.id}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReorderSubscenes(idx, 'up');
                    }}
                    className="p-1 text-slate-400 hover:text-white disabled:opacity-20 rounded hover:bg-slate-800"
                    title="Move section up"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === scene.subscenes.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReorderSubscenes(idx, 'down');
                    }}
                    className="p-1 text-slate-400 hover:text-white disabled:opacity-20 rounded hover:bg-slate-800"
                    title="Move section down"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
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
                    className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800"
                    title="Duplicate section"
                  >
                    <Copy className="w-3.5 h-3.5" />
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
                      className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800"
                      title="Delete section"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-500 ml-1" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
