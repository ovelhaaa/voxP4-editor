import React from 'react';
import { useEditor } from '../../state/editorState';
import { Scene, Subscene } from '../../domain/models';
import { Copy, Trash2, ArrowLeft, Sliders, Info, X } from 'lucide-react';
import { catalog } from '../../domain/catalog';

interface SubsceneEditorProps {
  scene: Scene;
  subscene: Subscene;
}

export const SubsceneEditor: React.FC<SubsceneEditorProps> = ({ scene, subscene }) => {
  const { dispatch } = useEditor();
  const overrides = Object.entries(subscene.parameters || {});

  const quickRenameSuggestions = ['Intro', 'Verse', 'Verse 2', 'Pre-Chorus', 'Chorus', 'Bridge', 'Solo', 'Outro'];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">
      {/* Back to Scene Breadcrumb */}
      <div>
        <button
          type="button"
          onClick={() =>
            dispatch({
              type: 'SET_SELECTION',
              selection: { type: 'scene', id: scene.id },
            })
          }
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 font-mono transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Scene: {scene.name}</span>
        </button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-semibold">
            <span>SUBSCENE (SECTION)</span>
          </div>
          <input
            type="text"
            value={subscene.name}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_SUBSCENE',
                sceneId: scene.id,
                subscene: { ...subscene, name: e.target.value },
              })
            }
            className="text-2xl font-bold bg-transparent text-white border-b border-transparent hover:border-slate-700 focus:border-amber-500 focus:outline-none transition py-0.5"
            placeholder="Subscene / Section Name"
          />
          <div className="text-xs font-mono text-slate-400">
            ID: <span className="text-slate-300">{subscene.id}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'DUPLICATE_SUBSCENE',
                sceneId: scene.id,
                subsceneId: subscene.id,
              })
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition font-medium"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>
          {scene.subscenes.length > 1 && (
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'DELETE_SUBSCENE',
                  sceneId: scene.id,
                  subsceneId: subscene.id,
                })
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 rounded transition font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Rename Chips */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-slate-400 mr-1">Quick Name:</span>
        {quickRenameSuggestions.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() =>
              dispatch({
                type: 'UPDATE_SUBSCENE',
                sceneId: scene.id,
                subscene: { ...subscene, name },
              })
            }
            className={`px-2 py-0.5 rounded text-xs transition border ${
              subscene.name === name
                ? 'bg-amber-600 text-white border-amber-500 font-medium'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Info Notice */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 text-xs text-slate-300 flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-slate-200">Subscene Overrides</p>
          <p className="text-slate-400">
            A subscene stores only explicit overrides applied on top of the parent Scene and Preset.
            For example, in a Chorus section, you might turn on Harmony or increase Reverb.
            Use the <strong>Inspector panel on the right</strong> to view the full resolution chain and add or modify overrides.
          </p>
        </div>
      </div>

      {/* Active Overrides */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 tracking-wide flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <span>Active Section Overrides ({overrides.length})</span>
          </h3>
          <span className="text-xs text-slate-400">
            {overrides.length === 0
              ? 'Currently inherits all parameters from Scene / Preset'
              : 'These values override the parent Scene and Preset'}
          </span>
        </div>

        {overrides.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-8 text-center text-xs text-slate-400">
            No overrides defined for this section yet.
            To override any effect (e.g. Harmony, Delay, Reverb) for this specific song section, select it in the Inspector on the right and click <strong>+ Override here</strong>.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {overrides.map(([name, val]) => {
              const desc = catalog.getParameter(name);
              return (
                <div
                  key={name}
                  className="bg-slate-900/80 border border-amber-500/30 rounded-lg p-3 flex items-center justify-between shadow-sm"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      {desc?.display || name}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {name} {desc?.unit && `(${desc.unit})`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-amber-400">
                      {typeof val === 'boolean' ? (val ? 'ON' : 'OFF') : String(val)}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'DELETE_SUBSCENE_PARAMETER',
                          sceneId: scene.id,
                          subsceneId: subscene.id,
                          paramName: name,
                        })
                      }
                      className="text-[10px] text-slate-400 hover:text-rose-400 transition flex items-center gap-0.5 justify-end"
                    >
                      <X className="w-3 h-3" />
                      <span>Revert to scene</span>
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
