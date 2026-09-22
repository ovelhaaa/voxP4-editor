import React, { useState } from 'react';
import { useEditor } from '../../state/editorState';
import { Scene } from '../../domain/models';
import { catalog } from '../../domain/catalog';
import { resolveSongMusicalAttributes } from '../../domain/musicalResolution';
import { resolveAllParameters } from '../../domain/resolution';
import { AuditionButton } from '../preview/AuditionButton';
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
  ChevronDown,
  ChevronUp,
  RotateCcw,
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
  const [showMetadataDetails, setShowMetadataDetails] = useState(false);

  const quickSections = ['Intro', 'Verse', 'Chorus', 'Bridge', 'Solo', 'Outro'];

  // Catalog descriptors for musical parameters
  const tempoDesc = catalog.getParameter('TempoBpm');
  const keyDesc = catalog.getParameter('HarmonyKey');
  const scaleDesc = catalog.getParameter('HarmonyScale');

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

  // Canonical resolution of musical attributes through the inheritance chain
  const musicalAttrs = resolveSongMusicalAttributes(currentScene, basePreset);

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

  const handleMetadataChange = (key: 'artist' | 'notes' | 'tags', value: string) => {
    dispatch({
      type: 'UPDATE_SCENE_METADATA',
      sceneId: currentScene.id,
      metadata: {
        ...(currentScene.metadata || {}),
        [key]: value,
      },
    });
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-[#090A0E]">
      {/* Songs Sidebar */}
      <aside className="w-full md:w-60 bg-[#101116] border-b md:border-b-0 md:border-r border-[#292A30] flex flex-col shrink-0">
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

                {/* Audition button and touch friendly Song actions menu */}
                <div className="flex items-center gap-0.5 shrink-0 ml-1">
                  <AuditionButton
                    contextId={`scene:${scene.id}`}
                    contextType="scene"
                    label={`Song: ${scene.name}`}
                    resolvedParams={() =>
                      resolveAllParameters({ preset: scenePreset, scene, currentLevel: 'scene' })
                    }
                  />

                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveSongMenu(activeSongMenu === scene.id ? null : scene.id);
                      }}
                      className="p-1 text-[#716E69] hover:text-[#F0EDE5] rounded opacity-60 hover:opacity-100 transition cursor-pointer"
                      title="Song options"
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
                        className="w-full text-left px-3 py-1.5 text-xs text-[#F0EDE5] hover:bg-[#1C1D24] flex items-center gap-2 cursor-pointer"
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

      {/* Main Song Canvas */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        {/* Song Header & Musical Controls */}
        <div className="bg-[#14151B] border border-[#292A30] rounded-[5px] p-4 md:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-[#292A30] pb-3.5">
            <div className="flex-1 min-w-0 space-y-1">
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

              {/* Restored Artist Input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={currentScene.metadata?.artist || ''}
                  onChange={(e) => handleMetadataChange('artist', e.target.value)}
                  placeholder="Artist (optional)"
                  className="bg-transparent text-xs text-[#B1ACA3] placeholder-[#4A4947] border-b border-transparent hover:border-[#34343C] focus:border-[#20D6C7] focus:outline-none transition py-0.5 w-48 sm:w-64"
                />

                {/* Toggle for Tags and Notes */}
                <button
                  type="button"
                  onClick={() => setShowMetadataDetails(!showMetadataDetails)}
                  className="text-[11px] text-[#716E69] hover:text-[#B1ACA3] flex items-center gap-0.5 ml-2 cursor-pointer select-none"
                >
                  <span>Details</span>
                  {showMetadataDetails ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Collapsible Details: Tags & Notes */}
              {showMetadataDetails && (
                <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#101116] p-3 rounded-[4px] border border-[#292A30] mt-2">
                  <div>
                    <label className="text-[10px] font-mono text-[#716E69] block mb-1">
                      Tags (comma separated)
                    </label>
                    <input
                      type="text"
                      value={currentScene.metadata?.tags || ''}
                      onChange={(e) => handleMetadataChange('tags', e.target.value)}
                      placeholder="e.g. acoustic, ballad, live"
                      className="w-full bg-[#14151B] border border-[#34343C] rounded-[3px] px-2 py-1 text-xs text-[#F0EDE5] focus:border-[#20D6C7] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-[#716E69] block mb-1">
                      Performance Notes
                    </label>
                    <input
                      type="text"
                      value={currentScene.metadata?.notes || ''}
                      onChange={(e) => handleMetadataChange('notes', e.target.value)}
                      placeholder="e.g. Acoustic guitar intro"
                      className="w-full bg-[#14151B] border border-[#34343C] rounded-[3px] px-2 py-1 text-xs text-[#F0EDE5] focus:border-[#20D6C7] focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Sound (Base Preset) Selector & Song Audition */}
            <div className="flex items-center gap-2 shrink-0 self-start">
              <div className="flex items-center gap-2 bg-[#101116] border border-[#292A30] px-3 py-1.5 rounded-[4px]">
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

              <AuditionButton
                contextId={`scene:${currentScene.id}`}
                contextType="scene"
                label={`Song: ${currentScene.name}`}
                resolvedParams={() =>
                  resolveAllParameters({ preset: basePreset, scene: currentScene, currentLevel: 'scene' })
                }
                className="h-8 px-2.5 bg-[#101116] hover:bg-[#1C1D24] text-[#B1ACA3] hover:text-[#20D6C7] border border-[#292A30] text-xs font-mono"
                title="Audition current song"
              />
            </div>
          </div>

          {/* Musical Parameters: Tempo, Key, Scale (Catalog-driven ranges and canonical resolution) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Tempo BPM */}
            <div className="bg-[#101116] border border-[#292A30] rounded-[4px] p-2.5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[#716E69] uppercase tracking-wider block">
                    Tempo
                  </span>
                  {musicalAttrs.isTempoOverridden && (
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'DELETE_SCENE_PARAMETER',
                          sceneId: currentScene.id,
                          paramName: 'TempoBpm',
                        })
                      }
                      className="text-[9px] font-mono text-[#B1ACA3] hover:text-[#F45126] flex items-center gap-0.5 cursor-pointer"
                      title="Reset to inherited sound/default tempo"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
                <div className="text-sm font-mono font-bold text-[#20D6C7]">
                  {musicalAttrs.tempo}{' '}
                  <span className="text-[10px] text-[#716E69]">
                    {tempoDesc?.unit || 'BPM'}
                  </span>
                </div>
              </div>
              <input
                type="number"
                min={tempoDesc?.min ?? 30}
                max={tempoDesc?.max ?? 300}
                step={tempoDesc?.step ?? 0.1}
                value={musicalAttrs.tempo}
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
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[#716E69] uppercase tracking-wider block">
                    Key
                  </span>
                  {musicalAttrs.isKeyOverridden && (
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'DELETE_SCENE_PARAMETER',
                          sceneId: currentScene.id,
                          paramName: 'HarmonyKey',
                        })
                      }
                      className="text-[9px] font-mono text-[#B1ACA3] hover:text-[#F45126] flex items-center gap-0.5 cursor-pointer"
                      title="Reset to inherited key"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
                <div className="text-sm font-mono font-bold text-[#20D6C7]">
                  {musicalAttrs.key}
                </div>
              </div>
              <select
                value={musicalAttrs.key}
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
                {keyDesc?.values?.map((k) => (
                  <option key={k} value={k} className="bg-[#14151B]">
                    {k}
                  </option>
                ))}
              </select>
            </div>

            {/* Scale */}
            <div className="bg-[#101116] border border-[#292A30] rounded-[4px] p-2.5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-mono text-[#716E69] uppercase tracking-wider block">
                    Scale
                  </span>
                  {musicalAttrs.isScaleOverridden && (
                    <button
                      type="button"
                      onClick={() =>
                        dispatch({
                          type: 'DELETE_SCENE_PARAMETER',
                          sceneId: currentScene.id,
                          paramName: 'HarmonyScale',
                        })
                      }
                      className="text-[9px] font-mono text-[#B1ACA3] hover:text-[#F45126] flex items-center gap-0.5 cursor-pointer"
                      title="Reset to inherited scale"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
                <div className="text-sm font-mono font-bold text-[#20D6C7]">
                  {musicalAttrs.scale}
                </div>
              </div>
              <select
                value={musicalAttrs.scale}
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
                {scaleDesc?.values?.map((s) => (
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold tracking-wider text-[#F0EDE5]">
                SECTIONS
              </span>
              {currentSubscene ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[#716E69] text-[11px]">Editing:</span>
                  <input
                    type="text"
                    value={currentSubscene.name}
                    onChange={(e) =>
                      dispatch({
                        type: 'UPDATE_SUBSCENE',
                        sceneId: currentScene.id,
                        subscene: { ...currentSubscene, name: e.target.value },
                      })
                    }
                    className="bg-[#14151B] border border-[#34343C] focus:border-[#F45126] rounded-[3px] px-2 py-0.5 text-xs text-[#F0EDE5] font-semibold focus:outline-none"
                    title="Click to rename section"
                  />
                </div>
              ) : (
                <span className="text-[#716E69] text-[11px]">
                  Editing: Entire Song (Default)
                </span>
              )}
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
                        className="p-1 text-[#B1ACA3] hover:text-[#F0EDE5] disabled:opacity-20 rounded cursor-pointer"
                        title="Move left"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === currentScene.subscenes.length - 1}
                        onClick={() => handleMoveSection(idx, 'right')}
                        className="p-1 text-[#B1ACA3] hover:text-[#F0EDE5] disabled:opacity-20 rounded cursor-pointer"
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
                        className="p-1 text-[#B1ACA3] hover:text-[#F0EDE5] rounded cursor-pointer"
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
                          className="p-1 text-[#E65050] hover:text-[#FF6030] rounded cursor-pointer"
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

            {/* Add Section Button (Creates "New Section" instead of hardcoded "Bridge") */}
            <button
              type="button"
              onClick={() => handleAddSection('New Section')}
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
