import React from 'react';
import { useEditor } from '../../state/editorState';
import { Preset } from '../../domain/models';
import { Mic, Copy, Trash2, Sliders, Info } from 'lucide-react';
import { catalog } from '../../domain/catalog';

interface PresetEditorProps {
  preset: Preset;
}

export const PresetEditor: React.FC<PresetEditorProps> = ({ preset }) => {
  const { state, dispatch } = useEditor();
  const overrides = Object.entries(preset.parameters || {});

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-blue-400 text-xs font-mono font-semibold">
            <Mic className="w-4 h-4" />
            <span>PRESET CONFIGURATION</span>
          </div>
          <input
            type="text"
            value={preset.name}
            onChange={(e) =>
              dispatch({
                type: 'UPDATE_PRESET',
                preset: { ...preset, name: e.target.value },
              })
            }
            className="text-2xl font-bold bg-transparent text-white border-b border-transparent hover:border-slate-700 focus:border-blue-500 focus:outline-none transition py-0.5"
            placeholder="Preset Name"
          />
          <div className="text-xs font-mono text-slate-400">
            ID: <span className="text-slate-300">{preset.id}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => dispatch({ type: 'DUPLICATE_PRESET', presetId: preset.id })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded transition font-medium"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>
          {state.library.presets.length > 1 && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'DELETE_PRESET', presetId: preset.id })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-900/50 rounded transition font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Preset Info Callout */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 text-xs text-slate-300 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-slate-200">Preset Layer (Sound Definition)</p>
          <p className="text-slate-400">
            Presets define the default sonic texture (Compressor, Reverb, Chorus, EQ, Gate).
            Scenes inherit from this preset and override parameters when necessary.
            Parameters configured here override the Firmware Default.
          </p>
        </div>
      </div>

      {/* Overridden Parameters Summary */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 tracking-wide flex items-center gap-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>Preset Parameters ({overrides.length})</span>
          </h3>
          <span className="text-xs text-slate-400">
            Use the Inspector on the right to edit or add parameters
          </span>
        </div>

        {overrides.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-lg p-8 text-center text-xs text-slate-400">
            No custom parameter overrides yet in this preset. All 71 parameters currently use Firmware Defaults.
            Select parameters in the Inspector panel on the right to customize this sound.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {overrides.map(([name, val]) => {
              const desc = catalog.getParameter(name);
              return (
                <div
                  key={name}
                  className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 flex items-center justify-between"
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
                    <div className="text-xs font-mono font-bold text-blue-400">
                      {typeof val === 'boolean' ? (val ? 'ON' : 'OFF') : String(val)}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'DELETE_PRESET_PARAMETER',
                          presetId: preset.id,
                          paramName: name,
                        })
                      }
                      className="text-[10px] text-slate-400 hover:text-rose-400 transition"
                    >
                      Revert to default
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
