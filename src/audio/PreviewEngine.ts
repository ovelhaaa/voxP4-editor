import {
  AuditionMode,
  PreviewEngineStatus,
  PreviewPlaybackState,
  ReferenceSample,
  RenderedAudio,
  VocalAudioSource,
} from './types';
import { decodeAudioBuffer } from './decodeAudio';
import { computeRenderCacheKey, renderCache } from './renderCache';
import { loadReferenceAudioSource } from './referenceSamples';
import { ResolvedParameterState } from '../domain/resolution';

export class PreviewEngine {
  private static instance: PreviewEngine | null = null;

  private audioCtx: AudioContext | null = null;
  private worker: Worker | null = null;

  private state: PreviewPlaybackState = 'idle';
  private auditionMode: AuditionMode = 'processed';
  private activeSource: VocalAudioSource | null = null;
  private activeContextLabel = 'No Sound Selected';
  private isLooping = false;
  private previewRegionSeconds = 20.0;
  private lastRenderTimeMs: number | null = null;
  private errorMessage: string | null = null;

  private renderedAudio: RenderedAudio | null = null;
  private dryBuffer: AudioBuffer | null = null;

  // Playback nodes
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private playbackStartTime = 0;
  private playbackOffset = 0;
  private isPlaying = false;
  private timeUpdateInterval: number | null = null;

  // Task tracking
  private currentTaskId: string | null = null;
  private pendingRenderPromise: {
    resolve: (audio: RenderedAudio) => void;
    reject: (err: Error) => void;
  } | null = null;

  // Listeners
  private readonly listeners = new Set<(status: PreviewEngineStatus) => void>();

  private constructor() {
    this.initWorker();
  }

  static getInstance(): PreviewEngine {
    if (!PreviewEngine.instance) {
      PreviewEngine.instance = new PreviewEngine();
    }
    return PreviewEngine.instance;
  }

  private initWorker(): void {
    try {
      this.worker = new Worker(new URL('./preview.worker.ts', import.meta.url), {
        type: 'module',
      });

      this.worker.onmessage = (event) => {
        const data = event.data;
        if (data.type === 'RENDER_RESULT' && data.taskId === this.currentTaskId) {
          this.handleRenderSuccess(data);
        } else if (data.type === 'RENDER_ERROR' && data.taskId === this.currentTaskId) {
          this.handleRenderError(data.error);
        }
      };

      this.worker.onerror = (err) => {
        console.error('Preview worker error:', err);
        this.handleRenderError(err.message || 'Worker thread error');
      };
    } catch (err) {
      console.error('Failed to create preview worker:', err);
      this.state = 'error';
      this.errorMessage = 'Web Worker initialization failed';
      this.notifyListeners();
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: 48000 });
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(console.error);
    }
    return this.audioCtx;
  }

  // ---------------------------------------------------------------------------
  // Audio Source Selection & Loading
  // ---------------------------------------------------------------------------

  async loadReferenceSample(sample: ReferenceSample): Promise<void> {
    this.stop();
    this.state = 'loading';
    this.errorMessage = null;
    this.notifyListeners();

    try {
      const ctx = this.getAudioContext();
      const source = await loadReferenceAudioSource(sample, ctx);
      this.setActiveSource(source);
    } catch (err: any) {
      console.error('Failed to load reference sample:', err);
      this.state = 'error';
      this.errorMessage = `Error loading sample: ${err.message || err}`;
      this.notifyListeners();
    }
  }

  async loadUserAudioFile(file: File): Promise<void> {
    this.stop();
    this.state = 'loading';
    this.errorMessage = null;
    this.notifyListeners();

    try {
      const ctx = this.getAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await decodeAudioBuffer(arrayBuffer, ctx);

      const source: VocalAudioSource = {
        id: `user-${file.name}-${file.size}-${file.lastModified}`,
        name: file.name,
        type: 'user',
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        samples: decoded.samples,
        rawBuffer: decoded.originalBuffer,
      };

      this.setActiveSource(source);
    } catch (err: any) {
      console.error('Failed to decode uploaded audio file:', err);
      this.state = 'error';
      this.errorMessage = `Could not decode audio: ${err.message || err}`;
      this.notifyListeners();
    }
  }

  private setActiveSource(source: VocalAudioSource): void {
    this.activeSource = source;
    this.renderedAudio = null;
    this.dryBuffer = null;
    this.playbackOffset = 0;
    this.state = 'ready';

    // Prepare dry audio buffer for preview region
    this.prepareDryBuffer();
    this.notifyListeners();
  }

  private prepareDryBuffer(): void {
    if (!this.activeSource) return;
    const ctx = this.getAudioContext();
    const frames = Math.min(
      this.activeSource.samples.length,
      Math.round(this.previewRegionSeconds * this.activeSource.sampleRate)
    );

    const buf = ctx.createBuffer(2, frames, this.activeSource.sampleRate);
    const monoSlice = new Float32Array(this.activeSource.samples.subarray(0, frames));
    buf.copyToChannel(monoSlice, 0);
    buf.copyToChannel(monoSlice, 1);
    this.dryBuffer = buf;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  /**
   * Triggers preview render for the given resolved parameter state.
   */
  async requestRender(
    contextLabel: string,
    resolvedParams: readonly ResolvedParameterState[]
  ): Promise<RenderedAudio | null> {
    this.activeContextLabel = contextLabel;

    if (!this.activeSource) {
      this.notifyListeners();
      return null;
    }

    const numericParams = this.mapResolvedParameters(resolvedParams);
    const sampleRate = this.activeSource.sampleRate;
    const frameCount = Math.min(
      this.activeSource.samples.length,
      Math.round(this.previewRegionSeconds * sampleRate)
    );

    const cacheKey = computeRenderCacheKey({
      sourceId: this.activeSource.id,
      startFrame: 0,
      frameCount,
      dspVersion: '1.0',
      parameters: numericParams,
    });

    // Check in-memory cache first
    const cached = renderCache.get(cacheKey);
    if (cached) {
      this.renderedAudio = cached;
      this.lastRenderTimeMs = cached.renderTimeMs;
      this.state = this.isPlaying ? 'playing' : 'rendered';
      this.notifyListeners();

      // If playing in processed mode, seamlessly update buffer
      if (this.isPlaying && this.auditionMode === 'processed') {
        this.restartActiveNode();
      }
      return cached;
    }

    // Cancel any previous task running in worker
    if (this.currentTaskId && this.worker) {
      this.worker.postMessage({ type: 'CANCEL', taskId: this.currentTaskId });
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.currentTaskId = taskId;
    this.state = 'rendering';
    this.notifyListeners();

    const inputSlice = this.activeSource.samples.slice(0, frameCount);

    return new Promise<RenderedAudio>((resolve, reject) => {
      this.pendingRenderPromise = { resolve, reject };

      if (!this.worker) {
        this.handleRenderError('Worker not available');
        return;
      }

      this.worker.postMessage({
        type: 'RENDER',
        taskId,
        input: inputSlice,
        parameters: numericParams,
      });
    });
  }

  private handleRenderSuccess(data: any): void {
    const { taskId, left, right, renderTimeMs } = data;
    if (taskId !== this.currentTaskId || !this.activeSource) return;

    const ctx = this.getAudioContext();
    const frames = left.length;
    const buf = ctx.createBuffer(2, frames, this.activeSource.sampleRate);
    buf.copyToChannel(left, 0);
    buf.copyToChannel(right, 1);

    const numericParams = {};
    const cacheKey = computeRenderCacheKey({
      sourceId: this.activeSource.id,
      startFrame: 0,
      frameCount: frames,
      dspVersion: '1.0',
      parameters: numericParams,
    });

    const rendered: RenderedAudio = {
      sourceId: this.activeSource.id,
      cacheKey,
      duration: frames / this.activeSource.sampleRate,
      sampleRate: this.activeSource.sampleRate,
      left,
      right,
      renderTimeMs,
      audioBuffer: buf,
    };

    renderCache.set(cacheKey, rendered);
    this.renderedAudio = rendered;
    this.lastRenderTimeMs = renderTimeMs;
    this.state = this.isPlaying ? 'playing' : 'rendered';
    this.errorMessage = null;

    if (this.pendingRenderPromise) {
      this.pendingRenderPromise.resolve(rendered);
      this.pendingRenderPromise = null;
    }

    this.notifyListeners();

    // If currently playing in processed mode, seamlessly update node
    if (this.isPlaying && this.auditionMode === 'processed') {
      this.restartActiveNode();
    }
  }

  private handleRenderError(errorMsg: string): void {
    this.state = 'error';
    this.errorMessage = errorMsg;
    if (this.pendingRenderPromise) {
      this.pendingRenderPromise.reject(new Error(errorMsg));
      this.pendingRenderPromise = null;
    }
    this.notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Transport & Playback
  // ---------------------------------------------------------------------------

  play(): void {
    const buffer = this.getActiveBuffer();
    if (!buffer) return;

    const ctx = this.getAudioContext();
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
      } catch {}
      this.currentSourceNode.disconnect();
    }

    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = this.isLooping;
    node.connect(ctx.destination);

    // If offset is at or past end, wrap to beginning
    if (this.playbackOffset >= buffer.duration) {
      this.playbackOffset = 0;
    }

    node.start(0, this.playbackOffset);
    this.playbackStartTime = ctx.currentTime - this.playbackOffset;
    this.currentSourceNode = node;
    this.isPlaying = true;
    this.state = 'playing';

    node.onended = () => {
      if (!this.isLooping && this.isPlaying) {
        this.stop();
      }
    };

    this.startTimeTracker();
    this.notifyListeners();
  }

  pause(): void {
    if (!this.isPlaying) return;
    const ctx = this.getAudioContext();
    this.playbackOffset = ctx.currentTime - this.playbackStartTime;

    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
      } catch {}
      this.currentSourceNode.disconnect();
      this.currentSourceNode = null;
    }

    this.isPlaying = false;
    this.state = 'paused';
    this.stopTimeTracker();
    this.notifyListeners();
  }

  stop(): void {
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
      } catch {}
      this.currentSourceNode.disconnect();
      this.currentSourceNode = null;
    }

    this.isPlaying = false;
    this.playbackOffset = 0;
    this.state = this.renderedAudio ? 'rendered' : this.activeSource ? 'ready' : 'idle';
    this.stopTimeTracker();
    this.notifyListeners();
  }

  seek(seconds: number): void {
    const duration = this.getPreviewDuration();
    this.playbackOffset = Math.max(0, Math.min(seconds, duration));

    if (this.isPlaying) {
      this.restartActiveNode();
    } else {
      this.notifyListeners();
    }
  }

  setAuditionMode(mode: AuditionMode): void {
    if (this.auditionMode === mode) return;
    this.auditionMode = mode;

    if (this.isPlaying) {
      this.restartActiveNode();
    } else {
      this.notifyListeners();
    }
  }

  setLoop(loop: boolean): void {
    this.isLooping = loop;
    if (this.currentSourceNode) {
      this.currentSourceNode.loop = loop;
    }
    this.notifyListeners();
  }

  private restartActiveNode(): void {
    const buffer = this.getActiveBuffer();
    if (!buffer) return;

    const ctx = this.getAudioContext();
    const currentOffset = this.getCurrentTime();

    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
      } catch {}
      this.currentSourceNode.disconnect();
    }

    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = this.isLooping;
    node.connect(ctx.destination);

    const safeOffset = Math.min(currentOffset, buffer.duration);
    node.start(0, safeOffset);
    this.playbackStartTime = ctx.currentTime - safeOffset;
    this.currentSourceNode = node;

    node.onended = () => {
      if (!this.isLooping && this.isPlaying) {
        this.stop();
      }
    };
  }

  private getActiveBuffer(): AudioBuffer | null {
    if (this.auditionMode === 'dry') {
      return this.dryBuffer;
    }
    return this.renderedAudio?.audioBuffer ?? this.dryBuffer;
  }

  getCurrentTime(): number {
    if (!this.isPlaying || !this.audioCtx) {
      return this.playbackOffset;
    }
    const elapsed = this.audioCtx.currentTime - this.playbackStartTime;
    const dur = this.getPreviewDuration();
    if (dur <= 0) return 0;
    return this.isLooping ? elapsed % dur : Math.min(elapsed, dur);
  }

  getPreviewDuration(): number {
    if (!this.activeSource) return 0;
    return Math.min(this.previewRegionSeconds, this.activeSource.duration);
  }

  private startTimeTracker(): void {
    this.stopTimeTracker();
    this.timeUpdateInterval = window.setInterval(() => {
      this.notifyListeners();
    }, 50);
  }

  private stopTimeTracker(): void {
    if (this.timeUpdateInterval !== null) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Parameter Conversion Helper
  // ---------------------------------------------------------------------------

  private mapResolvedParameters(
    resolved: readonly ResolvedParameterState[]
  ): Record<string, number> {
    const result: Record<string, number> = {};

    for (const r of resolved) {
      const desc = r.descriptor;
      const val = r.resolvedValue;

      if (desc.type === 'bool') {
        result[desc.key] = val ? 1.0 : 0.0;
      } else if (desc.type === 'enum') {
        const idx = desc.values ? desc.values.indexOf(String(val)) : -1;
        result[desc.key] = idx >= 0 ? idx : desc.default;
      } else {
        result[desc.key] = typeof val === 'number' && Number.isFinite(val) ? val : desc.default;
      }
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Status & Subscription
  // ---------------------------------------------------------------------------

  getStatus(): PreviewEngineStatus {
    return {
      state: this.state,
      auditionMode: this.auditionMode,
      activeSource: this.activeSource,
      activeContextLabel: this.activeContextLabel,
      isLooping: this.isLooping,
      currentTime: this.getCurrentTime(),
      duration: this.getPreviewDuration(),
      previewRegionSeconds: this.previewRegionSeconds,
      isRendering: this.state === 'rendering',
      errorMessage: this.errorMessage,
      lastRenderTimeMs: this.lastRenderTimeMs,
    };
  }

  subscribe(listener: (status: PreviewEngineStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch (err) {
        console.error('Error in PreviewEngine listener:', err);
      }
    }
  }
}

export const previewEngine = PreviewEngine.getInstance();
