import React, { useState } from 'react';
import { useEditor } from '../../state/editorState';
import { Preset } from '../../domain/models';
import { FxRack } from '../rack/FxRack';
import { EFFECT_MODULES } from '../../domain/effectModules';
import { resolveParameterState, resolveAllParameters } from '../../domain/resolution';
import { AuditionButton } from '../preview/AuditionButton';
import { Sliders, Plus, Copy, Trash2, MoreVertical } from 'lucide-react';

interface SoundsViewProps {
  onOpenAdvanced: () => void;
}

export const SoundsView: React.FC<SoundsViewProps> = ({ onOpenAdvanced }) => {
  const { state, dispatch } = useEditor();
  const { presets } = state.library;
  const selection = state.selection;

  const activePresetId =
    selection.type === 'preset' ? selection.id : presets[0]?.id;

  const currentPreset =
    presets.find((p) => p.id === activePresetId) || presets[0];

  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  if (!currentPreset) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#716E69]">
        <Sliders className="w-12 h-12 mb-3 text-[#34343C]" />
        <h2 className="text-base font-bold text-[#F0EDE5] mb-1">No Sounds in Library</h2>
        <p className="text-xs max-w-sm mb-4">
          Sounds define default effect textures and sonic presets that songs inherit.
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_PRESET', name: 'Clean Vocal' })}
          className="px-4 py-2 bg-[#F45126] hover:bg-[#FF6030] text-[#090A0E] text-xs font-mono font-bold rounded-[3px] transition cursor-pointer"
        >
          + Add Sound
        </button>
      </div>
    );
  }

  const handleSelectPreset = (preset: Preset) => {
    dispatch({
      type: 'SET_SELECTION',
      selection: { type: 'preset', id: preset.id },
    });
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#090A0E]">
      {/* Sounds Sidebar */}
      <aside className="w-full md:w-64 bg-[#101116] border-b md:border-b-0 md:border-r border-[#292A30] flex flex-col shrink-0">
        <div className="p-3 border-b border-[#292A30] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-[#F45126]" />
            <span className="text-xs font-bold tracking-wider text-[#F0EDE5]">
              SOUNDS
            </span>
            <span className="text-[10px] font-mono bg-[#14151B] text-[#B1ACA3] px-1.5 py-0.2 rounded border border-[#292A30]">
              {presets.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_PRESET' })}
            className="p-1 hover:bg-[#1C1D24] text-[#B1ACA3] hover:text-[#FF6030] rounded-[3px] transition cursor-pointer"
            title="Create new Sound (Preset)"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Sounds List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {presets.map((preset) => {
            const isSelected = preset.id === currentPreset.id;
            const paramCount = Object.keys(preset.parameters || {}).length;

            // Find resolved active effects in preset through canonical resolution:
            // Firmware Default -> Preset
            const activeFx = EFFECT_MODULES.filter((m) => {
              if (!m.enableParam) return false;
              const res = resolveParameterState({
                name: m.enableParam,
                preset,
                currentLevel: 'preset',
              });
              return Boolean(res.resolvedValue);
            }).map((m) => m.name);

            return (
              <div
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-[4px] text-xs cursor-pointer transition border ${
                  isSelected
                    ? 'bg-[#1C1D24] text-[#F0EDE5] border-[#F45126]/60 font-medium'
                    : 'text-[#B1ACA3] hover:bg-[#14151B] hover:text-[#F0EDE5] border-transparent'
                }`}
              >
                <div className="truncate min-w-0 flex-1">
                  <div className="truncate font-semibold">{preset.name}</div>
                  <div className="text-[10px] text-[#716E69] font-mono flex items-center gap-1.5 truncate mt-0.5">
                    {activeFx.length > 0 ? (
                      <span className="text-[#20D6C7] truncate">
                        {activeFx.join(' · ')}
                      </span>
                    ) : (
                      <span>Default FX</span>
                    )}
                    {paramCount > 0 && <span>({paramCount} params)</span>}
                  </div>
                </div>

                {/* Audition button and overflow menu */}
                <div className="flex items-center gap-0.5 shrink-0 ml-1">
                  <AuditionButton
                    label={`Preset: ${preset.name}`}
                    resolvedParams={() => resolveAllParameters({ preset, currentLevel: 'preset' })}
                  />

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === preset.id ? null : preset.id);
                      }}
                      className="p-1 text-[#716E69] hover:text-[#F0EDE5] rounded opacity-60 hover:opacity-100 transition cursor-pointer"
                      title="Sound options"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>

                  {activeMenuId === preset.id && (
                    <div
                      className="absolute right-0 mt-1 w-36 bg-[#14151B] border border-[#34343C] rounded-[4px] shadow-xl py-1 z-30"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          dispatch({ type: 'DUPLICATE_PRESET', presetId: preset.id });
                          setActiveMenuId(null);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-[#F0EDE5] hover:bg-[#1C1D24] flex items-center gap-2 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-[#B1ACA3]" />
                        <span>Duplicate</span>
                      </button>
                      {presets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            dispatch({ type: 'DELETE_PRESET', presetId: preset.id });
                            setActiveMenuId(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-[#E65050] hover:bg-[#1C1D24] flex items-center gap-2 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Sound Canvas */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {/* Sound Header */}
        <div className="bg-[#14151B] border border-[#292A30] rounded-[5px] p-4 md:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={currentPreset.name}
              onChange={(e) =>
                dispatch({
                  type: 'UPDATE_PRESET',
                  preset: { ...currentPreset, name: e.target.value },
                })
              }
              placeholder="Sound Name"
              className="text-xl md:text-2xl font-bold bg-transparent text-[#F0EDE5] border-b border-transparent hover:border-[#34343C] focus:border-[#F45126] focus:outline-none transition py-0.5 w-full"
            />
            <div className="text-[11px] text-[#716E69] font-mono mt-0.5">
              Base Sound Preset Definition
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AuditionButton
              label={`Preset: ${currentPreset.name}`}
              resolvedParams={() => resolveAllParameters({ preset: currentPreset, currentLevel: 'preset' })}
              className="h-8 px-2.5 bg-[#101116] hover:bg-[#1C1D24] text-[#B1ACA3] hover:text-[#F45126] border border-[#292A30] text-xs font-mono"
              title="Audition current preset"
            />
            <button
              type="button"
              onClick={() => dispatch({ type: 'DUPLICATE_PRESET', presetId: currentPreset.id })}
              className="h-8 px-3 rounded-[3px] bg-[#101116] hover:bg-[#1C1D24] text-[#B1ACA3] hover:text-[#F0EDE5] border border-[#292A30] text-xs font-mono transition cursor-pointer flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Duplicate</span>
            </button>
            {presets.length > 1 && (
              <button
                type="button"
                onClick={() => dispatch({ type: 'DELETE_PRESET', presetId: currentPreset.id })}
                className="h-8 px-3 rounded-[3px] bg-[#101116] hover:bg-[#E65050]/20 text-[#E65050] border border-[#292A30] hover:border-[#E65050]/40 text-xs font-mono transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Reusable FX Rack in Preset Context */}
        <FxRack
          preset={currentPreset}
          currentLevel="preset"
          onOpenAdvanced={onOpenAdvanced}
        />
      </main>
    </div>
  );
};
