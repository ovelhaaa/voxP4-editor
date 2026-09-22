import React, { useEffect, useState, useRef } from 'react';
import {
  Play,
  Pause,
  Square,
  Repeat,
  Upload,
  Check,
  AlertCircle,
  Loader2,
  Volume2,
  ChevronDown,
  Sparkles,
  Minimize2,
  Maximize2,
  Clock,
} from 'lucide-react';
import { useEditor } from '../../state/editorState';
import { previewEngine } from '../../audio/PreviewEngine';
import {
  PreviewEngineStatus,
  ReferenceSample,
} from '../../audio/types';
import {
  getDefaultReferenceSamples,
  getReferenceSamples,
} from '../../audio/referenceSamples';
import { resolveAllParameters } from '../../domain/resolution';

export const VocalPreviewPanel: React.FC = () => {
  const { state } = useEditor();
  const { selection, library } = state;

  const [status, setStatus] = useState<PreviewEngineStatus>(previewEngine.getStatus());
  const [currentTime, setCurrentTime] = useState<number>(previewEngine.getCurrentTime());
  const [referenceSamples, setReferenceSamples] = useState<readonly ReferenceSample[]>(
    getDefaultReferenceSamples()
  );
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Subscribe to low-frequency state transitions
  useEffect(() => {
    const unsubscribe = previewEngine.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    return () => unsubscribe();
  }, []);

  // Subscribe to high-frequency transport clock updates (50ms)
  useEffect(() => {
    const unsubscribe = previewEngine.subscribeClock((time) => {
      setCurrentTime(time);
    });
    return () => unsubscribe();
  }, []);

  // Load reference sample list
  useEffect(() => {
    getReferenceSamples().then((samples) => {
      if (samples && samples.length > 0) {
        setReferenceSamples(samples);
      }
    });
  }, []);

  // Close source dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsSourceMenuOpen(false);
      }
    };
    if (isSourceMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSourceMenuOpen]);

  // Initial load of default reference sample if no source selected yet
  useEffect(() => {
    if (!status.activeSource && referenceSamples.length > 0) {
      const defaultSample = referenceSamples[0];
      previewEngine.loadReferenceSample(defaultSample);
    }
  }, [referenceSamples, status.activeSource]);

  // Determine current active entity & label for preview
  const getActiveContext = () => {
    if (selection.type === 'preset') {
      const preset = library.presets.find((p) => p.id === selection.id) || library.presets[0];
      if (preset) {
        return {
          id: `preset:${preset.id}`,
          type: 'preset' as const,
          label: `Preset: ${preset.name}`,
          params: resolveAllParameters({ preset, currentLevel: 'preset' }),
        };
      }
    } else if (selection.type === 'scene') {
      const scene = library.scenes.find((s) => s.id === selection.id) || library.scenes[0];
      if (scene) {
        const basePreset = library.presets.find((p) => p.id === scene.basePresetId);
        return {
          id: `scene:${scene.id}`,
          type: 'scene' as const,
          label: `Song: ${scene.name}`,
          params: resolveAllParameters({ preset: basePreset, scene, currentLevel: 'scene' }),
        };
      }
    } else if (selection.type === 'subscene') {
      const scene = library.scenes.find((s) => s.id === selection.id);
      const subscene = scene?.subscenes.find((sub) => sub.id === selection.subsceneId);
      if (scene && subscene) {
        const basePreset = library.presets.find((p) => p.id === scene.basePresetId);
        return {
          id: `subscene:${scene.id}/${subscene.id}`,
          type: 'subscene' as const,
          label: `Section: ${scene.name} > ${subscene.name}`,
          params: resolveAllParameters({
            preset: basePreset,
            scene,
            subscene,
            currentLevel: 'subscene',
          }),
        };
      }
    }

    // Default fallback to first preset
    const fallbackPreset = library.presets[0];
    if (fallbackPreset) {
      return {
        id: `preset:${fallbackPreset.id}`,
        type: 'preset' as const,
        label: `Preset: ${fallbackPreset.name}`,
        params: resolveAllParameters({ preset: fallbackPreset, currentLevel: 'preset' }),
      };
    }

    return null;
  };

  const handleRenderAndPlay = async () => {
    const ctx = getActiveContext();
    if (!ctx) return;

    if (status.state === 'playing') {
      previewEngine.pause();
      return;
    }

    // Dry playback can start immediately regardless of DSP fingerprint
    if (status.auditionMode === 'dry') {
      previewEngine.play();
      return;
    }

    // For Processed mode: check if current render is available and not stale
    const isReady =
      (status.state === 'rendered' || status.state === 'paused') &&
      !status.isPreviewStale &&
      status.activeContextId === ctx.id;

    if (isReady) {
      previewEngine.play();
      return;
    }

    // Trigger render then play
    try {
      await previewEngine.requestRender(
        { id: ctx.id, type: ctx.type, label: ctx.label },
        ctx.params
      );
      previewEngine.play();
    } catch (err: any) {
      if (err.name !== 'RenderSupersededError' && err.name !== 'RenderCancelledError') {
        console.error('Render preview failed:', err);
      }
    }
  };

  const handleRenderOnly = async () => {
    const ctx = getActiveContext();
    if (!ctx) return;
    try {
      await previewEngine.requestRender(
        { id: ctx.id, type: ctx.type, label: ctx.label },
        ctx.params
      );
    } catch (err: any) {
      if (err.name !== 'RenderSupersededError' && err.name !== 'RenderCancelledError') {
        console.error('Render preview failed:', err);
      }
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      previewEngine.loadUserAudioFile(file);
      setIsSourceMenuOpen(false);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetSeconds = parseFloat(e.target.value);
    previewEngine.seek(targetSeconds);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${tenths}`;
  };

  const activeCtx = getActiveContext();
  const currentDuration = status.duration || 1;
  const currentProgress = Math.min(currentTime / currentDuration, 1.0);

  return (
    <div className="bg-[#101116] border-t border-[#292A30] shadow-2xl transition-all z-20 flex flex-col select-none">
      {/* Collapsed Bar */}
      {isCollapsed ? (
        <div className="h-9 px-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5 text-[#F45126]" />
            <span className="font-bold text-[11px] text-[#F0EDE5] tracking-wider">
              VOCAL PREVIEW
            </span>
            <span className="text-[10px] text-[#716E69] font-mono">
              ({status.activeSource?.name || 'No Source'})
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRenderAndPlay}
              className="px-2.5 py-1 bg-[#F45126] hover:bg-[#FF6030] text-[#090A0E] text-[10px] font-mono font-bold rounded flex items-center gap-1 transition cursor-pointer"
            >
              {status.state === 'playing' ? (
                <>
                  <Pause className="w-3 h-3 fill-current" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 fill-current" />
                  <span>Audition</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="p-1 text-[#B1ACA3] hover:text-[#F0EDE5] transition cursor-pointer"
              title="Expand Preview Bar"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Full Preview Bar */
        <div className="p-3 md:px-5 space-y-2.5">
          {/* Top row: Source selector, context tag, status badges, collapse */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-[#F45126]" />
                <span className="text-xs font-bold tracking-wider text-[#F0EDE5]">
                  VOCAL PREVIEW
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#1C1D24] text-[#20D6C7] border border-[#292A30]">
                  WASM DSP
                </span>
              </div>

              {/* Source Selector Dropdown */}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setIsSourceMenuOpen(!isSourceMenuOpen)}
                  className="h-7 px-2.5 rounded bg-[#14151B] hover:bg-[#1C1D24] border border-[#34343C] text-xs font-mono text-[#F0EDE5] flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span className="text-[#B1ACA3] text-[10px]">Source:</span>
                  <span className="font-semibold truncate max-w-[130px] md:max-w-[180px]">
                    {status.activeSource?.name || 'Select Audio...'}
                  </span>
                  <ChevronDown className="w-3 h-3 text-[#716E69]" />
                </button>

                {isSourceMenuOpen && (
                  <div className="absolute left-0 bottom-full mb-1 w-72 bg-[#14151B] border border-[#34343C] rounded shadow-2xl py-1 z-50 text-xs">
                    <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-[#716E69] font-mono border-b border-[#292A30]">
                      Reference Audio Library
                    </div>
                    {referenceSamples.map((sample) => {
                      const isSelected = status.activeSource?.id === sample.id;
                      return (
                        <button
                          key={sample.id}
                          type="button"
                          onClick={() => {
                            previewEngine.loadReferenceSample(sample);
                            setIsSourceMenuOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-[#1C1D24] transition cursor-pointer ${
                            isSelected ? 'text-[#F45126] font-semibold' : 'text-[#F0EDE5]'
                          }`}
                        >
                          <div className="truncate min-w-0 pr-2">
                            <div className="truncate">{sample.name}</div>
                            <div className="text-[10px] text-[#716E69] truncate">
                              {sample.category} · {sample.durationSeconds}s
                            </div>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#F45126] shrink-0" />}
                        </button>
                      );
                    })}

                    <div className="my-1 border-t border-[#292A30]" />

                    {/* Custom File Upload */}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[#1C1D24] text-[#20D6C7] transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Upload Vocal File (.wav, .mp3)...</span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                )}
              </div>

              {/* Active Context Label */}
              {activeCtx && (
                <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-[#716E69] font-mono">
                  <span>Routing:</span>
                  <span className="text-[#B1ACA3] px-1.5 py-0.5 rounded bg-[#14151B] border border-[#292A30]">
                    {activeCtx.label}
                  </span>
                </div>
              )}
            </div>

            {/* Status Indicator & Collapse button */}
            <div className="flex items-center gap-2">
              {status.state === 'rendering' ? (
                <div className="flex items-center gap-1.5 text-xs text-[#F45126] font-mono px-2 py-0.5 rounded bg-[#F45126]/10 border border-[#F45126]/30">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Rendering WASM...</span>
                </div>
              ) : status.state === 'error' ? (
                <div
                  className="flex items-center gap-1.5 text-xs text-[#E65050] font-mono px-2 py-0.5 rounded bg-[#E65050]/10 border border-[#E65050]/30"
                  title={status.errorMessage || 'Rendering error'}
                >
                  <AlertCircle className="w-3 h-3" />
                  <span>DSP Error</span>
                </div>
              ) : status.isPreviewStale ? (
                <div
                  className="flex items-center gap-1.5 text-[10px] text-[#F5A623] font-mono px-2 py-0.5 rounded bg-[#F5A623]/10 border border-[#F5A623]/30"
                  title="Parameters modified since last render"
                >
                  <Clock className="w-3 h-3" />
                  <span>Render Stale</span>
                </div>
              ) : status.lastRenderTimeMs !== null ? (
                <div className="flex items-center gap-1.5 text-[10px] text-[#20D6C7] font-mono px-2 py-0.5 rounded bg-[#20D6C7]/10 border border-[#20D6C7]/30">
                  <Sparkles className="w-3 h-3" />
                  <span>
                    Rendered ({Math.round(status.lastRenderTimeMs)}ms
                    {status.tailDurationSeconds > 0 && ` + ${status.tailDurationSeconds.toFixed(1)}s tail`})
                  </span>
                </div>
              ) : (
                <div className="text-[10px] text-[#716E69] font-mono">Ready to render</div>
              )}

              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="p-1 text-[#716E69] hover:text-[#F0EDE5] transition cursor-pointer"
                title="Collapse Preview Bar"
              >
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Bottom row: Transport controls, Audition mode switch, Scrub bar, Render button */}
          <div className="flex flex-col md:flex-row items-center gap-3">
            {/* Transport controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Play / Pause button */}
              <button
                type="button"
                onClick={handleRenderAndPlay}
                disabled={status.state === 'loading'}
                className="h-8 px-4 bg-[#F45126] hover:bg-[#FF6030] disabled:opacity-40 text-[#090A0E] text-xs font-mono font-bold rounded flex items-center gap-1.5 transition cursor-pointer shadow-md"
                title={status.state === 'playing' ? 'Pause' : 'Play / Render Preview'}
              >
                {status.state === 'playing' ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Audition</span>
                  </>
                )}
              </button>

              {/* Stop button */}
              <button
                type="button"
                onClick={() => previewEngine.stop()}
                disabled={status.state !== 'playing' && status.state !== 'paused'}
                className="h-8 w-8 rounded bg-[#14151B] hover:bg-[#1C1D24] disabled:opacity-30 border border-[#292A30] text-[#B1ACA3] hover:text-[#F0EDE5] flex items-center justify-center transition cursor-pointer"
                title="Stop"
              >
                <Square className="w-3.5 h-3.5" />
              </button>

              {/* Loop toggle */}
              <button
                type="button"
                onClick={() => previewEngine.setLoop(!status.isLooping)}
                className={`h-8 w-8 rounded border text-xs flex items-center justify-center transition cursor-pointer ${
                  status.isLooping
                    ? 'bg-[#F45126]/20 border-[#F45126] text-[#F45126]'
                    : 'bg-[#14151B] hover:bg-[#1C1D24] border-[#292A30] text-[#716E69] hover:text-[#B1ACA3]'
                }`}
                title="Toggle Loop Playback"
              >
                <Repeat className="w-3.5 h-3.5" />
              </button>

              {/* Audition Mode A/B Switch: Processed vs Dry */}
              <div className="flex rounded bg-[#14151B] p-0.5 border border-[#292A30] text-[11px] font-mono ml-1">
                <button
                  type="button"
                  onClick={() => previewEngine.setAuditionMode('processed')}
                  className={`px-2.5 py-1 rounded transition cursor-pointer ${
                    status.auditionMode === 'processed'
                      ? 'bg-[#F45126] text-[#090A0E] font-bold shadow'
                      : 'text-[#B1ACA3] hover:text-[#F0EDE5]'
                  }`}
                  title="Audition VoxP4 DSP Processed Vocal"
                >
                  Processed
                </button>
                <button
                  type="button"
                  onClick={() => previewEngine.setAuditionMode('dry')}
                  className={`px-2.5 py-1 rounded transition cursor-pointer ${
                    status.auditionMode === 'dry'
                      ? 'bg-[#34343C] text-[#F0EDE5] font-bold'
                      : 'text-[#716E69] hover:text-[#B1ACA3]'
                  }`}
                  title="Audition Raw Dry Vocal"
                >
                  Dry
                </button>
              </div>
            </div>

            {/* Scrub / Progress Bar */}
            <div className="flex-1 w-full flex items-center gap-3">
              <span className="text-[10px] font-mono text-[#716E69] w-12 text-right">
                {formatTime(currentTime)}
              </span>

              <div className="relative flex-1 flex items-center">
                {/* Range Slider for Scrubbing */}
                <input
                  type="range"
                  min={0}
                  max={currentDuration}
                  step={0.01}
                  value={currentTime}
                  onChange={handleScrub}
                  disabled={!status.activeSource}
                  className="w-full h-1.5 bg-[#1C1D24] rounded-lg appearance-none cursor-pointer accent-[#F45126] focus:outline-none"
                  style={{
                    background: `linear-gradient(to right, #F45126 ${currentProgress * 100}%, #1C1D24 ${currentProgress * 100}%)`,
                  }}
                />
              </div>

              <span className="text-[10px] font-mono text-[#716E69] w-12">
                {formatTime(currentDuration)}
              </span>
            </div>

            {/* Re-render button */}
            <button
              type="button"
              onClick={handleRenderOnly}
              disabled={status.state === 'rendering' || !status.activeSource}
              className="h-8 px-3 rounded bg-[#14151B] hover:bg-[#1C1D24] disabled:opacity-40 border border-[#292A30] text-[#B1ACA3] hover:text-[#20D6C7] text-xs font-mono transition cursor-pointer shrink-0 flex items-center gap-1.5"
              title="Re-render DSP with current parameter state"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Render</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
