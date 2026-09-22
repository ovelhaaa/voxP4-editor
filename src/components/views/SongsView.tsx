import React, { useState } from 'react';
import { useEditor } from '../../state/editorState';
import { Scene } from '../../domain/models';
import { catalog } from '../../domain/catalog';
import { FxRack } from '../rack/FxRack';
import {
  Plus,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Music,
  Sliders,
  Sparkles,
} from 'lucide-react';

interface SongsViewProps {
  onOpenAdvanced: () => void;
}

export const SongsView: React.FC<SongsViewProps> = ({ onOpenAdvanced }) => {
  const { state, dispatch } = useEditor();
  const { scenes, presets } = state.library;
  const selection = state.selection;

  // Active scene
  const activeSceneId =
    selection.type === 'scene' || selection.type === 'subscene'
      ? selection.id
      : scenes[0]?.id;

  const currentScene = scenes.find((s) => s.id === activeSceneId) || scenes[0];

  // Active section (subscene) or null if editing song-level base parameters
  const activeSubsceneId =
    selection.type === 'subscene' && selection.id === currentScene?.id
      ? selection.subsceneId
      : undefined;

  const currentSubscene = currentScene?.subscenes.find(
    (sub) => sub.id === activeSubsceneId
  );

  const [activeSongMenu, setActiveSongMenu] = useState<string | null>(null);

  const quickSections = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Solo', 'Outro'];

  if (!currentScene) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#716E69]">
        <Music className="w-12 h-12 mb-3 text-[#34343C]" />
        <h2 className="text-base font-bold text-[#F0EDE5] mb-1">No Songs in Library</h2>
        <p className="text-xs max-w-sm mb-4">
          Create your first song to configure sounds, tempo, key, and section arrangements.
        </p>
        <button
          type="button"
          onClick={() => dispatch({ type: 'ADD_SCENE', name: 'My First Song' })}
          className="px-4 py-2 bg-[#F45126] hover:bg-[#FF6030] text-[#090A0E] text-xs font-mono font-bold rounded-[3px] transition cursor-pointer"
        >
          + Add Song
        </button>
      </div>
    );
  }

  const basePreset = presets.find((p) => p.id === currentScene.basePresetId);

  // Musical attributes
  const tempoVal =
    typeof currentScene.parameters?.TempoBpm === 'number'
      ? currentScene.parameters.TempoBpm
      : 120;
  const keyVal = String(currentScene.parameters?.HarmonyKey ?? 'C');
  const scaleVal = String(currentScene.parameters?.HarmonyScale ?? 'Major');

  const handleSelectSong = (scene: Scene) => {
    dispatch({
      type: 'SET_SELECTION',
      selection: { type: 'scene', id: scene.id },
    });
  };

  const handleSelectSection = (subsceneId?: string) => {
    if (subsceneId) {
      dispatch({
        type: 'SET_SELECTION',
        selection: {
          type: 'subscene',
          id: currentScene.id,
          subsceneId,
        },
      });
    } else {
      dispatch({
        type: 'SET_SELECTION',
        selection: { type: 'scene', id: currentScene.id },
      });
    }
  };

  const handleAddSection = (name: string) => {
    dispatch({
      type: 'ADD_SUBSCENE',
      sceneId: currentScene.id,
      name,
    });
  };

  const handleMoveSection = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentScene.subscenes.length) return;

    const list = [...currentScene.subscenes];
    const [moved] = list.splice(index, 1);
    list.splice(targetIdx, 0, moved);

    dispatch({
      type: 'REORDER_SUBSCENES',
      sceneId: currentScene.id,
      subscenes: list,
    });
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#090A0E]">
      {/* Songs Sidebar (Compact on desktop) */}
      <aside className="w-full md:w-60 bg-[#101116] border-b md:border-b-0 md:border-r border-[#292A30] flex flex-col shrink-0">
        {/* Songs Header */}
        <div className="p-3 border-b border-[#292A30] flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Music className="w-4 h-4 text-[#20D6C7]" />
            <span className="text-xs font-bold tracking-wider text-[#F0EDE5]">
              SONGS
            </span>
            <span className="text-[10px] font-mono bg-[#14151B] text-[#B1ACA3] px-1.5 py-0.2 rounded border border-[#292A30]">
              {scenes.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_SCENE' })}
            className="p-1 hover:bg-[#1C1D24] text-[#B1ACA3] hover:text-[#FF6030] rounded-[3px] transition cursor-pointer"
            title="Create new Song"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Songs List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {scenes.map((scene) => {
            const isSelected = scene.id === currentScene.id;
            const scenePreset = presets.find((p) => p.id === scene.basePresetId);

            return (
              <div
                key={scene.id}
                onClick={() => handleSelectSong(scene)}
                className={`group flex items-center justify-between px-3 py-2 rounded-[4px] text-xs cursor-pointer transition border ${
                  isSelected
                    ? 'bg-[#1C1D24] text-[#F0EDE5] border-[#F45126]/60 font-medium'
                    : 'text-[#B1ACA3] hover:bg-[#14151B] hover:text-[#F0EDE5] border-transparent'
                }`}
              >
                <div className="truncate min-w-0 flex-1">
                  <div className="truncate font-semibold">{scene.name}</div>
                  <div className="text-[10px] text-[#716E69] font-mono flex items-center gap-1.5 truncate">
                    <span>{scenePreset?.name || 'Default Sound'}</span>
                    <span>·</span>
                    <span>{scene.subscenes?.length || 0} sec</span>
                  </div>
                </div>

                {/* Song actions menu (...) */}
                <div className="relative shrink-0 ml-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSongMenu(activeSongMenu === scene.id ? null : scene.id);
                    }}
                    className="p-1 text-[#716E69] hover:text-[#F0EDE5] rounded opacity-0 group-hover:opacity-100 transition"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {activeSongMenu === scene.id && (
                    <div
                      className="absolute right-0 mt-1 w-36 bg-[#14151B] border border-[#34343C] rounded-[4px] shadow-xl py-1 z-30"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          dispatch({ type: 'DUPLICATE_SCENE', sceneId: scene.id });
                          setActiveSongMenu(null);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-[#F0EDE5] hover:bg-[#1C1D24] flex items-center gap-2"
                      >
                        <Copy className="w-3.5 h-3.5 text-[#B1ACA3]" />
                        <span>Duplicate</span>
                      </button>
                      {scenes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            dispatch({ type: 'DELETE_SCENE', sceneId: scene.id });
                            setActiveSongMenu(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-[#E65050] hover:bg-[#1C1D24] flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* Main Song Canvas */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        {/* Song Header & Musical Controls */}
        <div className="bg-[#14151B] border border-[#292A30] rounded-[5px] p-4 md:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#292A30] pb-4">
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={currentScene.name}
                onChange={(e) =>
                  dispatch({
                    type: 'UPDATE_SCENE',
                    scene: { ...currentScene, name: e.target.value },
                  })
                }
                placeholder="Song Title"
                className="text-xl md:text-2xl font-bold bg-transparent text-[#F0EDE5] border-b border-transparent hover:border-[#34343C] focus:border-[#F45126] focus:outline-none transition py-0.5 w-full"
              />
              <div className="text-[11px] text-[#716E69] font-mono mt-0.5">
                Song Configuration
              </div>
            </div>

            {/* Sound (Base Preset) Selector */}
            <div className="flex items-center gap-2 bg-[#101116] border border-[#292A30] px-3 py-1.5 rounded-[4px] shrink-0">
              <Sliders className="w-4 h-4 text-[#F45126]" />
              <div className="text-xs">
                <span className="text-[#716E69] mr-1.5">Sound:</span>
                <select
                  value={currentScene.basePresetId || ''}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_SCENE',
                      scene: {
                        ...currentScene,
                        basePresetId: e.target.value || undefined,
                      },
                    })
                  }
                  className="bg-transparent text-[#F0EDE5] font-semibold text-xs focus:outline-none cursor-pointer"
                >
                  <option value="" className="bg-[#14151B]">
                    -- Default Sound --
                  </option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#14151B]">
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Musical Parameters: Tempo, Key, Scale */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Tempo BPM */}
            <div className="bg-[#101116] border border-[#292A30] rounded-[4px] p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-[#716E69] uppercase tracking-wider block">
                  Tempo
                </span>
                <div className="text-sm font-mono font-bold text-[#20D6C7]">
                  {tempoVal} <span className="text-[10px] text-[#716E69]">BPM</span>
                </div>
              </div>
              <input
                type="number"
                min={30}
                max={300}
                step={0.5}
                value={tempoVal}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SCENE_PARAMETER',
                    sceneId: currentScene.id,
                    paramName: 'TempoBpm',
                    value: parseFloat(e.target.value) || 120,
                  })
                }
                className="w-20 bg-[#14151B] border border-[#34343C] rounded-[3px] px-2 py-1 text-xs text-right text-[#F0EDE5] font-mono focus:border-[#20D6C7] focus:outline-none"
              />
            </div>

            {/* Key */}
            <div className="bg-[#101116] border border-[#292A30] rounded-[4px] p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-[#716E69] uppercase tracking-wider block">
                  Key
                </span>
                <div className="text-sm font-mono font-bold text-[#20D6C7]">
                  {keyVal}
                </div>
              </div>
              <select
                value={keyVal}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SCENE_PARAMETER',
                    sceneId: currentScene.id,
                    paramName: 'HarmonyKey',
                    value: e.target.value,
                  })
                }
                className="bg-[#14151B] border border-[#34343C] rounded-[3px] px-2 py-1 text-xs text-[#F0EDE5] font-mono focus:border-[#20D6C7] focus:outline-none cursor-pointer"
              >
                {catalog.getEnumValues('HarmonyKey')?.map((k) => (
                  <option key={k} value={k} className="bg-[#14151B]">
                    {k}
                  </option>
                ))}
              </select>
            </div>

            {/* Scale */}
            <div className="bg-[#101116] border border-[#292A30] rounded-[4px] p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono text-[#716E69] uppercase tracking-wider block">
                  Scale
                </span>
                <div className="text-sm font-mono font-bold text-[#20D6C7]">
                  {scaleVal}
                </div>
              </div>
              <select
                value={scaleVal}
                onChange={(e) =>
                  dispatch({
                    type: 'SET_SCENE_PARAMETER',
                    sceneId: currentScene.id,
                    paramName: 'HarmonyScale',
                    value: e.target.value,
                  })
                }
                className="bg-[#14151B] border border-[#34343C] rounded-[3px] px-2 py-1 text-xs text-[#F0EDE5] font-mono focus:border-[#20D6C7] focus:outline-none cursor-pointer"
              >
                {catalog.getEnumValues('HarmonyScale')?.map((s) => (
                  <option key={s} value={s} className="bg-[#14151B]">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section Strip: Horizontal song arrangement strip */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-wider text-[#F0EDE5]">
                SONG SECTIONS
              </span>
              <span className="text-[#716E69] text-[11px]">
                {currentSubscene
                  ? `Editing: ${currentSubscene.name}`
                  : 'Editing: Entire Song (Base)'}
              </span>
            </div>

            {/* Quick Add buttons */}
            <div className="hidden sm:flex items-center gap-1">
              <span className="text-[11px] text-[#716E69] mr-1">+ Add:</span>
              {quickSections.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  onClick={() => handleAddSection(sec)}
                  className="px-2 py-0.5 text-[10px] font-mono bg-[#14151B] hover:bg-[#1C1D24] text-[#B1ACA3] hover:text-[#F0EDE5] rounded-[3px] border border-[#292A30] transition cursor-pointer"
                >
                  {sec}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            {/* Base Song Tab */}
            <button
              type="button"
              onClick={() => handleSelectSection(undefined)}
              className={`px-3 py-2 rounded-[4px] text-xs font-mono font-medium transition shrink-0 cursor-pointer border flex items-center gap-1.5 ${
                !currentSubscene
                  ? 'bg-[#1C1D24] text-[#FF6030] border-[#F45126]'
                  : 'bg-[#14151B] text-[#B1ACA3] hover:text-[#F0EDE5] border-[#292A30]'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Song Default</span>
            </button>

            {/* Section Tabs */}
            {currentScene.subscenes.map((sub, idx) => {
              const isSubActive = currentSubscene?.id === sub.id;
              const overrideCount = Object.keys(sub.parameters || {}).length;

              return (
                <div key={sub.id} className="relative group shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSelectSection(sub.id)}
                    className={`px-3 py-2 rounded-[4px] text-xs font-mono font-medium transition cursor-pointer border flex items-center gap-2 ${
                      isSubActive
                        ? 'bg-[#1C1D24] text-[#F0EDE5] border-[#F45126]'
                        : 'bg-[#14151B] text-[#B1ACA3] hover:text-[#F0EDE5] border-[#292A30]'
                    }`}
                  >
                    <span>{sub.name}</span>
                    {overrideCount > 0 ? (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-[#F45126]/20 text-[#FF6030] border border-[#F45126]/30">
                        {overrideCount}
                      </span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#414147]" />
                    )}
                  </button>

                  {/* Section Context Actions */}
                  {isSubActive && (
                    <div className="absolute right-0 top-full mt-1 bg-[#14151B] border border-[#34343C] rounded-[4px] shadow-xl p-1 flex items-center gap-1 z-20">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveSection(idx, 'left')}
                        className="p-1 text-[#B1ACA3] hover:text-[#F0EDE5] disabled:opacity-20 rounded"
                        title="Move left"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === currentScene.subscenes.length - 1}
                        onClick={() => handleMoveSection(idx, 'right')}
                        className="p-1 text-[#B1ACA3] hover:text-[#F0EDE5] disabled:opacity-20 rounded"
                        title="Move right"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            type: 'DUPLICATE_SUBSCENE',
                            sceneId: currentScene.id,
                            subsceneId: sub.id,
                          })
                        }
                        className="p-1 text-[#B1ACA3] hover:text-[#F0EDE5] rounded"
                        title="Duplicate section"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {currentScene.subscenes.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: 'DELETE_SUBSCENE',
                              sceneId: currentScene.id,
                              subsceneId: sub.id,
                            })
                          }
                          className="p-1 text-[#E65050] hover:text-[#FF6030] rounded"
                          title="Delete section"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Quick Add Custom Section */}
            <button
              type="button"
              onClick={() => handleAddSection('Bridge')}
              className="px-2.5 py-2 rounded-[4px] text-xs font-mono bg-[#101116] hover:bg-[#14151B] text-[#716E69] hover:text-[#F0EDE5] border border-dashed border-[#292A30] transition shrink-0 cursor-pointer flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Section</span>
            </button>
          </div>
        </div>

        {/* Unified FX Rack */}
        <FxRack
          preset={basePreset}
          scene={currentScene}
          subscene={currentSubscene}
          currentLevel={currentSubscene ? 'subscene' : 'scene'}
          onOpenAdvanced={onOpenAdvanced}
        />
      </main>
    </div>
  );
};
