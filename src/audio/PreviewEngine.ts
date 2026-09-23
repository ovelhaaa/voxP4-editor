import {
  AuditionLengthMode,
  AuditionMode,
  AuditionRegion,
  ContextType,
  EffectiveSourceRegion,
  PreviewEngineStatus,
  PreviewPlaybackState,
  ReferenceSample,
  RenderedAudio,
  VocalAudioSource,
} from './types';
import { decodeAudioBuffer, computeAudioFileId } from './decodeAudio';
import {
  computePreviewFingerprint,
  computeRenderCacheKey,
  renderCache,
  DEFAULT_DSP_BUILD_ID,
} from './renderCache';
import { loadReferenceAudioSource } from './referenceSamples';
import { ResolvedParameterState } from '../domain/resolution';
import { mapResolvedParameters } from './parameterMapping';
import { clampRegion, defaultAuditionRegion, resolveSourceRegion } from './auditionRegion';
import { computeMonitoringGains } from './loudness';
import compatibilityManifest from './wasm/dsp-compatibility.json';

/** Equal-power-ish linear crossfade used when a new render/voice takes over. */
export const DEFAULT_CROSSFADE_SECONDS = 0.05;
/** Auto Preview debounce window (ms). */
export const DEFAULT_AUTO_PREVIEW_DELAY_MS = 350;

export class RenderSupersededError extends Error {
  constructor(message = 'Preview render was superseded by a newer render request') {
    super(message);
    this.name = 'RenderSupersededError';
  }
}

export class RenderCancelledError extends Error {
  constructor(message = 'Preview render was cancelled') {
    super(message);
    this.name = 'RenderCancelledError';
  }
}

interface PreviewRenderTask {
  readonly taskId: string;
  readonly cacheKey: string;
  readonly contextFingerprint: string;
  readonly contextId: string | null;
  readonly contextType: ContextType | null;
  readonly contextLabel: string;
  readonly sourceId: string;
  readonly frameCount: number;
  readonly startFrame: number;
  readonly parameters: Record<string, number>;
  readonly resolve: (audio: RenderedAudio) => void;
  readonly reject: (err: Error) => void;
}

export interface ContextOptions {
  id?: string | null;
  type?: ContextType | null;
  label: string;
}

export class PreviewEngine {
  private static instance: PreviewEngine | null = null;

  private audioCtx: AudioContext | null = null;
  private worker: Worker | null = null;

  private state: PreviewPlaybackState = 'idle';
  private auditionMode: AuditionMode = 'processed';
  private activeSource: VocalAudioSource | null = null;
  private activeContextId: string | null = null;
  private activeContextType: ContextType | null = null;
  private activeContextLabel = 'No Sound Selected';
  private activeResolvedParams: readonly ResolvedParameterState[] | null = null;
  private isLooping = false;
  private lastRenderTimeMs: number | null = null;
  private errorMessage: string | null = null;
  private dspIncompatible = false;

  // Audition UX V2 state
  private auditionRegion: AuditionRegion | null = null;
  private auditionLengthMode: AuditionLengthMode = 'full';
  private autoPreviewEnabled = false;
  private autoPreviewDelayMs = DEFAULT_AUTO_PREVIEW_DELAY_MS;
  private pendingAutoFingerprint: string | null = null;
  private autoPreviewTimer: ReturnType<typeof setTimeout> | null = null;
  private loudnessMatchEnabled = false;
  private dryMonitoringGain = 1;
  private fxMonitoringGain = 1;
  private crossfadeSeconds = DEFAULT_CROSSFADE_SECONDS;
  private voiceGeneration = 0;

  private renderedAudio: RenderedAudio | null = null;
  private dryBuffer: AudioBuffer | null = null;

  // Transient playback buffer for the currently active render only.
  // PCM stays in the render cache as Float32Array; this AudioBuffer is
  // recreated on demand and never persisted per cache entry.
  private activePlaybackBuffer: AudioBuffer | null = null;
  private activePlaybackFingerprint: string | null = null;

  // Playback nodes
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private currentGainNode: GainNode | null = null;
  private playbackStartTime = 0;
  private playbackOffset = 0;
  private isPlaying = false;
  private timeUpdateInterval: number | null = null;

  // Task tracking
  private currentTask: PreviewRenderTask | null = null;

  // Subscriptions
  private readonly listeners = new Set<(status: PreviewEngineStatus) => void>();
  private readonly clockListeners = new Set<(currentTime: number) => void>();

  private constructor() {
    this.validateDspManifest();
    this.initWorker();
  }

  static getInstance(): PreviewEngine {
    if (!PreviewEngine.instance) {
      PreviewEngine.instance = new PreviewEngine();
    }
    return PreviewEngine.instance;
  }

  // ---------------------------------------------------------------------------
  // Runtime Manifest Validation
  // ---------------------------------------------------------------------------

  private validateDspManifest(): void {
    const m = compatibilityManifest as any;
    const isEngineOk = m.engine === 'voxP4';
    const isProfileOk = m.profile === 'P4Production';
    const isRateOk = m.sampleRate === 48000;
    const isBlockOk = m.blockSize === 64;
    const isContractOk = m.contractVersion === 1;
    const isParamCountOk = m.parameterCount === 71;
    const isWasmShaOk = typeof m.wasmSha256 === 'string' && m.wasmSha256.length === 64;

    if (!isEngineOk || !isProfileOk || !isRateOk || !isBlockOk || !isContractOk || !isParamCountOk || !isWasmShaOk) {
      console.error('DSP compatibility manifest validation failed:', m);
      this.dspIncompatible = true;
      this.state = 'error';
      this.errorMessage = 'Preview unavailable: DSP build is incompatible with this editor';
    }
  }

  private initWorker(): void {
    if (this.dspIncompatible) return;
    if (typeof Worker === 'undefined') return;

    try {
      this.worker = new Worker(new URL('./preview.worker.ts', import.meta.url), {
        type: 'module',
      });

      this.worker.onmessage = (event) => {
        const data = event.data;
        if (data.type === 'RENDER_RESULT') {
          this.handleRenderSuccess(data);
        } else if (data.type === 'RENDER_ERROR') {
          this.handleRenderError(data.taskId, data.error);
        }
      };

      this.worker.onerror = (err) => {
        console.error('Preview worker error:', err);
        if (this.currentTask) {
          const task = this.currentTask;
          this.currentTask = null;
          task.reject(new Error(err.message || 'Worker thread error'));
        }
        this.state = 'error';
        this.errorMessage = 'Web Worker execution failed';
        this.notifyListeners();
      };
    } catch (err: any) {
      console.error('Failed to create preview worker:', err);
      this.state = 'error';
      this.errorMessage = 'Web Worker initialization failed';
      this.notifyListeners();
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass =
        (typeof window !== 'undefined' && ((window as any).AudioContext || (window as any).webkitAudioContext)) ||
        (globalThis as any).AudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: 48000 });
    }
    return this.audioCtx!;
  }

  private ensureAudioContextResumed(): void {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch((err) => {
        console.warn('AudioContext resume failed:', err);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Audio Source Selection & Loading
  // ---------------------------------------------------------------------------

  async loadReferenceSample(sample: ReferenceSample): Promise<void> {
    this.stop();
    this.abortCurrentTask(new RenderCancelledError('Source changed to reference sample'));

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
    this.abortCurrentTask(new RenderCancelledError('Source changed to uploaded user file'));

    this.state = 'loading';
    this.errorMessage = null;
    this.notifyListeners();

    try {
      const ctx = this.getAudioContext();
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await decodeAudioBuffer(arrayBuffer, ctx);
      const uniqueId = await computeAudioFileId(file, arrayBuffer);

      const source: VocalAudioSource = {
        id: uniqueId,
        name: file.name,
        type: 'user',
        duration: decoded.duration,
        sampleRate: decoded.sampleRate,
        samples: decoded.samples,
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
    this.abortCurrentTask(new RenderCancelledError('Source changed'));

    // Strict invariant: verify 48000 Hz sample rate
    if (source.sampleRate !== 48000) {
      this.state = 'error';
      this.errorMessage = `Invalid audio sample rate: ${source.sampleRate} Hz (expected 48000 Hz)`;
      this.notifyListeners();
      return;
    }

    this.activeSource = source;
    this.renderedAudio = null;
    this.dryBuffer = null;
    this.activePlaybackBuffer = null;
    this.activePlaybackFingerprint = null;
    this.playbackOffset = 0;
    this.state = 'ready';

    this.auditionRegion = defaultAuditionRegion(source.duration);
    this.cancelAutoPreviewTimer();
    this.pendingAutoFingerprint = null;

    this.prepareDryBuffer();
    this.recomputeMonitoringGains();
    this.maybeScheduleAutoPreview();
    this.notifyListeners();
  }

  /**
   * Installs a newly rendered/active audio entry. The transient playback
   * buffer is invalidated only when the audio fingerprint actually changes,
   * so cached PCM for an identical configuration is not re-wrapped needlessly.
   */
  private setRenderedAudio(audio: RenderedAudio): void {
    if (this.renderedAudio?.fingerprint !== audio.fingerprint) {
      this.activePlaybackBuffer = null;
      this.activePlaybackFingerprint = null;
    }
    this.renderedAudio = audio;
    this.recomputeMonitoringGains();
  }

  private prepareDryBuffer(): void {
    const region = this.getEffectiveRegion();
    if (!this.activeSource || !region) return;
    const ctx = this.getAudioContext();
    const frames = region.frameCount;
    if (frames <= 0) {
      this.dryBuffer = null;
      return;
    }

    const buf = ctx.createBuffer(2, frames, this.activeSource.sampleRate);
    // Channel data is copied by copyToChannel; no intermediate clone is required.
    const monoSlice = this.activeSource.samples.subarray(
      region.startFrame,
      region.startFrame + frames
    ) as Float32Array<ArrayBuffer>;
    buf.copyToChannel(monoSlice, 0);
    buf.copyToChannel(monoSlice, 1);
    this.dryBuffer = buf;
  }

  // ---------------------------------------------------------------------------
  // Audition Region, Quick Audition & Loudness (UX V2)
  // ---------------------------------------------------------------------------

  /**
   * Resolves the current region + Quick Audition mode to concrete source frames.
   * Pure and side-effect free.
   */
  getEffectiveRegion(): EffectiveSourceRegion | null {
    if (!this.activeSource) return null;
    return resolveSourceRegion({
      region: this.auditionRegion,
      mode: this.auditionLengthMode,
      sampleRate: this.activeSource.sampleRate,
      totalFrames: this.activeSource.samples.length,
    });
  }

  getAuditionRegion(): AuditionRegion | null {
    return this.auditionRegion;
  }

  setAuditionRegion(region: AuditionRegion): void {
    const duration = this.activeSource?.duration ?? 0;
    this.auditionRegion = clampRegion(region, duration);
    this.prepareDryBuffer();
    this.recomputeMonitoringGains();
    this.maybeScheduleAutoPreview();
    this.notifyListeners();
  }

  getAuditionLengthMode(): AuditionLengthMode {
    return this.auditionLengthMode;
  }

  setAuditionLengthMode(mode: AuditionLengthMode): void {
    if (this.auditionLengthMode === mode) return;
    this.auditionLengthMode = mode;
    this.prepareDryBuffer();
    this.recomputeMonitoringGains();
    this.maybeScheduleAutoPreview();

    if (this.isPlaying) {
      if (this.auditionMode === 'dry') {
        this.restartActiveNode(true);
      } else {
        this.notifyListeners();
      }
    } else {
      this.notifyListeners();
    }
  }

  isLoudnessMatchEnabled(): boolean {
    return this.loudnessMatchEnabled;
  }

  setLoudnessMatch(enabled: boolean): void {
    if (this.loudnessMatchEnabled === enabled) return;
    this.loudnessMatchEnabled = enabled;
    this.recomputeMonitoringGains();

    if (this.isPlaying) {
      this.restartActiveNode(true);
    } else {
      this.notifyListeners();
    }
  }

  private recomputeMonitoringGains(): void {
    const region = this.getEffectiveRegion();
    if (!this.activeSource || !region || region.frameCount <= 0) {
      this.dryMonitoringGain = 1;
      this.fxMonitoringGain = 1;
      return;
    }

    const drySamples = this.activeSource.samples.subarray(
      region.startFrame,
      region.startFrame + region.frameCount
    );

    const rendered = this.renderedAudio;
    const gains = computeMonitoringGains({
      drySamples,
      processedLeft: rendered?.left ?? drySamples,
      processedRight: rendered?.right ?? drySamples,
      frameCount: region.frameCount,
      enabled: this.loudnessMatchEnabled && Boolean(rendered),
    });

    this.dryMonitoringGain = gains.dryGain;
    this.fxMonitoringGain = gains.fxGain;
  }

  getMonitoringGain(): number {
    return this.auditionMode === 'dry' ? this.dryMonitoringGain : this.fxMonitoringGain;
  }

  // ---------------------------------------------------------------------------
  // Auto Preview
  // ---------------------------------------------------------------------------

  isAutoPreviewEnabled(): boolean {
    return this.autoPreviewEnabled;
  }

  setAutoPreview(enabled: boolean): void {
    if (this.autoPreviewEnabled === enabled) return;
    this.autoPreviewEnabled = enabled;
    if (!enabled) {
      this.cancelAutoPreviewTimer();
      this.pendingAutoFingerprint = null;
      this.notifyListeners();
      return;
    }
    this.maybeScheduleAutoPreview();
    this.notifyListeners();
  }

  setAutoPreviewDelayMs(delayMs: number): void {
    this.autoPreviewDelayMs = Math.max(0, delayMs);
  }

  /**
   * Schedules a debounced render when the requested DSP fingerprint differs
   * from the last rendered/pending one. Purely cosmetic changes (label, id,
   * waveform zoom) never reach this method because they do not alter the
   * fingerprint.
   */
  private maybeScheduleAutoPreview(): void {
    if (!this.autoPreviewEnabled) return;
    if (!this.activeSource || !this.activeResolvedParams) return;

    const fingerprint = this.computeCurrentFingerprint();
    if (!fingerprint) return;

    if (this.renderedAudio?.fingerprint === fingerprint) {
      this.cancelAutoPreviewTimer();
      this.pendingAutoFingerprint = null;
      return;
    }

    // A render for exactly this fingerprint is already in flight (or queued).
    if (this.currentTask?.contextFingerprint === fingerprint) {
      this.cancelAutoPreviewTimer();
      this.pendingAutoFingerprint = null;
      return;
    }

    if (this.pendingAutoFingerprint === fingerprint && this.autoPreviewTimer !== null) {
      return;
    }

    this.cancelAutoPreviewTimer();
    this.pendingAutoFingerprint = fingerprint;
    this.autoPreviewTimer = setTimeout(() => {
      this.autoPreviewTimer = null;
      this.runAutoPreview();
    }, this.autoPreviewDelayMs);

    this.notifyListeners();
  }

  private runAutoPreview(): void {
    const fingerprint = this.pendingAutoFingerprint;
    this.pendingAutoFingerprint = null;
    if (!fingerprint) return;
    if (!this.activeSource || !this.activeResolvedParams) return;

    if (this.computeCurrentFingerprint() !== fingerprint) {
      this.maybeScheduleAutoPreview();
      return;
    }

    this.requestRender(
      {
        id: this.activeContextId,
        type: this.activeContextType,
        label: this.activeContextLabel,
      },
      this.activeResolvedParams
    ).catch((err: any) => {
      if (err?.name !== 'RenderSupersededError' && err?.name !== 'RenderCancelledError') {
        console.error('Auto Preview render failed:', err);
      }
    }).finally(() => {
      this.notifyListeners();
    });
  }

  private cancelAutoPreviewTimer(): void {
    if (this.autoPreviewTimer !== null) {
      clearTimeout(this.autoPreviewTimer);
      this.autoPreviewTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering & Concurrency
  // ---------------------------------------------------------------------------

  private abortCurrentTask(error: Error): void {
    if (this.currentTask) {
      const task = this.currentTask;
      this.currentTask = null;
      if (this.worker) {
        this.worker.postMessage({ type: 'CANCEL', taskId: task.taskId });
      }
      task.reject(error);
    }
  }

  /**
   * Updates the "requested preview state" without triggering any render.
   *
   * This is the canonical way for UI/editor state to push the currently desired
   * context and DSP parameter values into the engine. Stale state is derived
   * implicitly by `getStatus()` comparing the requested fingerprint against the
   * last rendered fingerprint.
   *
   * Renaming a context or switching to a different entity that resolves to the
   * same DSP parameters does NOT change the audio fingerprint.
   */
  updateRequestedContext(
    context: { id: string | null; type: ContextType | null; label: string },
    resolvedParams: readonly ResolvedParameterState[]
  ): void {
    this.activeContextId = context.id ?? null;
    this.activeContextType = context.type ?? null;
    this.activeContextLabel = context.label;
    this.activeResolvedParams = resolvedParams;
    this.maybeScheduleAutoPreview();
    this.notifyListeners();
  }

  /**
   * Clears the requested preview context (e.g. nothing is auditionable).
   * Does not stop playback or trigger a render.
   */
  clearRequestedContext(): void {
    this.activeContextId = null;
    this.activeContextType = null;
    this.activeContextLabel = 'No Sound Selected';
    this.activeResolvedParams = null;
    this.cancelAutoPreviewTimer();
    this.pendingAutoFingerprint = null;
    this.notifyListeners();
  }

  /**
   * Triggers preview render for the given context and resolved parameter state.
   */
  async requestRender(
    contextOrLabel: string | ContextOptions,
    resolvedParams: readonly ResolvedParameterState[]
  ): Promise<RenderedAudio | null> {
    if (this.dspIncompatible) {
      throw new Error(this.errorMessage || 'DSP build is incompatible');
    }

    let contextId: string | null = null;
    let contextType: ContextType | null = null;
    let contextLabel: string;

    if (typeof contextOrLabel === 'string') {
      contextLabel = contextOrLabel;
    } else {
      contextId = contextOrLabel.id || null;
      contextType = contextOrLabel.type || null;
      contextLabel = contextOrLabel.label;
    }

    this.activeContextId = contextId;
    this.activeContextType = contextType;
    this.activeContextLabel = contextLabel;
    this.activeResolvedParams = resolvedParams;

    if (!this.activeSource) {
      this.notifyListeners();
      return null;
    }

    // Strict invariant check: active source sample rate must be 48000 Hz
    if (this.activeSource.sampleRate !== 48000) {
      const err = new Error(`Audio source sample rate is ${this.activeSource.sampleRate} Hz (expected 48000 Hz)`);
      this.state = 'error';
      this.errorMessage = err.message;
      this.notifyListeners();
      throw err;
    }

    // An explicit render supersedes any queued Auto Preview.
    this.cancelAutoPreviewTimer();
    this.pendingAutoFingerprint = null;

    const region = this.getEffectiveRegion();
    if (!region || region.frameCount <= 0) {
      this.notifyListeners();
      return null;
    }

    const numericParams = mapResolvedParameters(resolvedParams);
    const { startFrame, frameCount } = region;

    const cacheKey = computeRenderCacheKey({
      sourceId: this.activeSource.id,
      startFrame,
      frameCount,
      dspBuildId: DEFAULT_DSP_BUILD_ID,
      parameters: numericParams,
    });

    const contextFingerprint = computePreviewFingerprint({
      sourceId: this.activeSource.id,
      startFrame,
      frameCount,
      dspBuildId: DEFAULT_DSP_BUILD_ID,
      parameters: numericParams,
    });

    // 1. Check in-memory LRU cache first
    const cached = renderCache.get(cacheKey);
    if (cached) {
      this.setRenderedAudio(cached);
      this.lastRenderTimeMs = cached.renderTimeMs;
      this.state = this.isPlaying ? 'playing' : 'rendered';
      this.errorMessage = null;
      this.notifyListeners();

      if (this.isPlaying && this.auditionMode === 'processed') {
        this.restartActiveNode(true);
      }
      return cached;
    }

    // 2. Abort any previous pending render task with RenderSupersededError
    this.abortCurrentTask(new RenderSupersededError());

    // 3. Initiate new render task
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.state = 'rendering';
    this.notifyListeners();

    // Create an independent copy to transfer to worker safely without detaching activeSource.samples
    const inputSlice = new Float32Array(
      this.activeSource.samples.subarray(startFrame, startFrame + frameCount)
    );

    return new Promise<RenderedAudio>((resolve, reject) => {
      const task: PreviewRenderTask = {
        taskId,
        cacheKey,
        contextFingerprint,
        contextId,
        contextType,
        contextLabel,
        sourceId: this.activeSource!.id,
        frameCount,
        startFrame,
        parameters: numericParams,
        resolve,
        reject,
      };

      this.currentTask = task;

      if (!this.worker) {
        this.currentTask = null;
        this.state = 'error';
        this.errorMessage = 'Worker not available';
        this.notifyListeners();
        reject(new Error('Preview worker is not available'));
        return;
      }

      this.worker.postMessage(
        {
          type: 'RENDER',
          taskId,
          cacheKey,
          contextFingerprint,
          input: inputSlice,
          parameters: numericParams,
        },
        [inputSlice.buffer]
      );
    });
  }

  private handleRenderSuccess(data: any): void {
    const { taskId, cacheKey, contextFingerprint, left, right, duration, tailDurationSeconds, renderTimeMs } = data;

    // Discard result if task was superseded or source changed
    if (!this.currentTask || this.currentTask.taskId !== taskId || !this.activeSource) {
      return;
    }

    const task = this.currentTask;
    this.currentTask = null;

    // Store in cache using the original immutable cacheKey and fingerprint
    const finalCacheKey = task.cacheKey || cacheKey;
    const finalFingerprint = task.contextFingerprint || contextFingerprint;

    const rendered: RenderedAudio = {
      sourceId: this.activeSource.id,
      cacheKey: finalCacheKey,
      fingerprint: finalFingerprint,
      duration: duration || left.length / this.activeSource.sampleRate,
      tailDurationSeconds: tailDurationSeconds || 0,
      sampleRate: this.activeSource.sampleRate,
      left,
      right,
      renderTimeMs,
    };

    renderCache.set(finalCacheKey, rendered);
    this.setRenderedAudio(rendered);
    this.lastRenderTimeMs = renderTimeMs;
    this.state = this.isPlaying ? 'playing' : 'rendered';
    this.errorMessage = null;
    this.pendingAutoFingerprint = null;

    task.resolve(rendered);
    this.notifyListeners();

    if (this.isPlaying && this.auditionMode === 'processed') {
      this.restartActiveNode(true);
    }
  }

  private handleRenderError(taskId: string, errorMsg: string): void {
    if (!this.currentTask || this.currentTask.taskId !== taskId) {
      return;
    }

    const task = this.currentTask;
    this.currentTask = null;

    this.state = 'error';
    this.errorMessage = errorMsg;
    task.reject(new Error(errorMsg));
    this.notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Transport & Playback
  // ---------------------------------------------------------------------------

  /**
   * Builds an equal-power fade curve. For a crossfade the outgoing voice uses
   * `cos`, the incoming voice uses `sin`, so sin^2 + cos^2 stays constant and
   * power does not dip for uncorrelated material.
   */
  private static buildFadeCurve(amplitude: number, fadeIn: boolean, steps = 33): Float32Array {
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i++) {
      const t = steps === 1 ? 1 : i / (steps - 1);
      const shape = fadeIn ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
      curve[i] = amplitude * shape;
    }
    return curve;
  }

  /**
   * Schedules a short equal-power fade using `setValueCurveAtTime` when
   * available, falling back to a linear ramp. Never throws.
   */
  private applyFade(
    gain: GainNode,
    from: number,
    to: number,
    now: number,
    fadeSeconds: number
  ): boolean {
    const param: any = gain.gain;
    try {
      if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
    } catch {}

    const start = Math.max(0, from);
    const end = Math.max(0, to);
    const amplitude = Math.max(start, end);
    const fadeIn = end >= start;

    try {
      if (typeof param.setValueCurveAtTime === 'function' && amplitude > 0) {
        param.setValueCurveAtTime(
          PreviewEngine.buildFadeCurve(amplitude, fadeIn),
          now,
          fadeSeconds
        );
        return true;
      }
    } catch {
      // Fall through to a linear ramp.
    }

    try {
      if (typeof param.linearRampToValueAtTime === 'function') {
        if (typeof param.setValueAtTime === 'function') param.setValueAtTime(start, now);
        param.linearRampToValueAtTime(end, now + fadeSeconds);
        return true;
      }
    } catch {
      // Fall through to a hard set.
    }

    try {
      param.value = end;
    } catch {}
    return false;
  }

  /**
   * Creates a playback voice. When the AudioContext supports GainNodes the
   * voice fades in over `fadeSeconds` (equal-power curve) so a new render can
   * replace the old one without clicks. Environments without createGain
   * (tests/headless) fall back to a direct connection.
   */
  private createVoice(
    buffer: AudioBuffer,
    offset: number,
    targetGain: number,
    fadeSeconds: number
  ): { node: AudioBufferSourceNode; gain: GainNode | null } {
    const ctx = this.getAudioContext();
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.loop = this.isLooping;

    const anyCtx = ctx as any;
    const createdGain: GainNode | null =
      typeof anyCtx.createGain === 'function' ? anyCtx.createGain() : null;
    const gain = createdGain;

    if (gain) {
      gain.gain.value = fadeSeconds > 0 ? 0 : targetGain;
      node.connect(gain);
      gain.connect(ctx.destination);

      if (fadeSeconds > 0) {
        this.applyFade(gain, 0, targetGain, ctx.currentTime, fadeSeconds);
      }
    } else {
      node.connect(ctx.destination);
    }

    const generation = ++this.voiceGeneration;
    node.onended = () => {
      if (!this.isLooping && this.isPlaying && this.voiceGeneration === generation) {
        this.stop();
      }
    };

    node.start(0, offset);
    return { node, gain };
  }

  private canCrossfade(): boolean {
    const ctx = this.getAudioContext() as any;
    return typeof ctx.createGain === 'function';
  }

  private disconnectVoice(node: AudioBufferSourceNode | null, gain: GainNode | null): void {
    if (node) {
      try {
        node.stop();
      } catch {}
      try {
        node.disconnect();
      } catch {}
    }
    if (gain) {
      try {
        gain.disconnect();
      } catch {}
    }
  }

  play(): void {
    this.ensureAudioContextResumed();
    const buffer = this.getActiveBuffer();
    if (!buffer) return;

    const ctx = this.getAudioContext();
    this.disconnectVoice(this.currentSourceNode, this.currentGainNode);
    this.currentSourceNode = null;
    this.currentGainNode = null;

    // Clamp offset to valid duration
    if (this.playbackOffset >= buffer.duration) {
      this.playbackOffset = 0;
    }

    const voice = this.createVoice(buffer, this.playbackOffset, this.getMonitoringGain(), 0);
    this.playbackStartTime = ctx.currentTime - this.playbackOffset;
    this.currentSourceNode = voice.node;
    this.currentGainNode = voice.gain;
    this.isPlaying = true;
    this.state = 'playing';

    this.startTimeTracker();
    this.notifyListeners();
  }

  pause(): void {
    if (!this.isPlaying) return;
    const ctx = this.getAudioContext();
    this.playbackOffset = Math.max(0, ctx.currentTime - this.playbackStartTime);

    this.disconnectVoice(this.currentSourceNode, this.currentGainNode);
    this.currentSourceNode = null;
    this.currentGainNode = null;

    this.isPlaying = false;
    this.state = 'paused';
    this.stopTimeTracker();
    this.notifyListeners();
  }

  stop(): void {
    this.disconnectVoice(this.currentSourceNode, this.currentGainNode);
    this.currentSourceNode = null;
    this.currentGainNode = null;

    this.isPlaying = false;
    this.playbackOffset = 0;
    this.state = this.renderedAudio ? 'rendered' : this.activeSource ? 'ready' : 'idle';
    this.stopTimeTracker();
    this.notifyListeners();
    this.notifyClockListeners(0);
  }

  seek(seconds: number): void {
    this.ensureAudioContextResumed();
    const duration = this.getPlaybackDuration();
    this.playbackOffset = Math.max(0, Math.min(seconds, duration));

    if (this.isPlaying) {
      this.restartActiveNode(true);
    } else {
      this.notifyClockListeners(this.playbackOffset);
      this.notifyListeners();
    }
  }

  setAuditionMode(mode: AuditionMode): void {
    if (this.auditionMode === mode) return;
    this.auditionMode = mode;

    // Clamping: when switching Processed -> Dry, ensure offset doesn't exceed dry duration
    const dryDuration = this.getDryDuration();
    if (mode === 'dry' && this.playbackOffset > dryDuration) {
      this.playbackOffset = Math.max(0, dryDuration - 0.05);
    }

    if (this.isPlaying) {
      // Dry/FX comparison must keep the same audition clock and never click.
      this.restartActiveNode(true);
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

  /** Crossfades (or hard-swaps) the active voice to the current buffer. */
  private restartActiveNode(crossfade = false): void {
    const buffer = this.getActiveBuffer();
    if (!buffer) return;

    const ctx = this.getAudioContext();
    const currentOffset = Math.min(Math.max(0, this.getCurrentTime()), buffer.duration);
    const fadeSeconds = crossfade && this.canCrossfade() ? this.crossfadeSeconds : 0;

    const oldNode = this.currentSourceNode;
    const oldGain = this.currentGainNode;

    const voice = this.createVoice(buffer, currentOffset, this.getMonitoringGain(), fadeSeconds);
    this.playbackStartTime = ctx.currentTime - currentOffset;
    this.currentSourceNode = voice.node;
    this.currentGainNode = voice.gain;

    if (!oldNode) return;

    if (fadeSeconds > 0 && oldGain) {
      const now = ctx.currentTime;
      this.applyFade(oldGain, oldGain.gain.value, 0, now, fadeSeconds);
      const nodeToStop = oldNode;
      const gainToStop = oldGain;
      setTimeout(() => {
        try {
          nodeToStop.stop();
        } catch {}
        try {
          nodeToStop.disconnect();
        } catch {}
        try {
          gainToStop.disconnect();
        } catch {}
      }, fadeSeconds * 1000 + 30);
      return;
    }

    this.disconnectVoice(oldNode, oldGain);
  }

  private getActiveBuffer(): AudioBuffer | null {
    if (this.auditionMode === 'dry') {
      return this.dryBuffer;
    }

    const rendered = this.renderedAudio;
    if (rendered) {
      if (this.activePlaybackBuffer && this.activePlaybackFingerprint === rendered.fingerprint) {
        return this.activePlaybackBuffer;
      }

      const ctx = this.getAudioContext();
      const frames = rendered.left.length;
      const buf = ctx.createBuffer(2, frames, rendered.sampleRate);
      // `left`/`right` are already Float32Array; copy directly without a temporary clone.
      // The DOM lib narrows copyToChannel to Float32Array<ArrayBuffer>, which our
      // PCM views always satisfy at runtime.
      buf.copyToChannel(rendered.left as Float32Array<ArrayBuffer>, 0);
      buf.copyToChannel(rendered.right as Float32Array<ArrayBuffer>, 1);
      this.activePlaybackBuffer = buf;
      this.activePlaybackFingerprint = rendered.fingerprint;
      return buf;
    }

    return this.dryBuffer;
  }

  getCurrentTime(): number {
    if (!this.isPlaying || !this.audioCtx) {
      return this.playbackOffset;
    }
    const elapsed = this.audioCtx.currentTime - this.playbackStartTime;
    const dur = this.getPlaybackDuration();
    if (dur <= 0) return 0;
    return this.isLooping ? elapsed % dur : Math.min(elapsed, dur);
  }

  getDryDuration(): number {
    const region = this.getEffectiveRegion();
    if (!region) return 0;
    return region.durationSeconds;
  }

  getPlaybackDuration(): number {
    if (!this.activeSource) return 0;
    if (this.auditionMode === 'processed' && this.renderedAudio) {
      return this.renderedAudio.duration;
    }
    return this.getDryDuration();
  }

  // ---------------------------------------------------------------------------
  // Clock Tracker & Subscriptions
  // ---------------------------------------------------------------------------

  private startTimeTracker(): void {
    this.stopTimeTracker();
    this.timeUpdateInterval = window.setInterval(() => {
      const curTime = this.getCurrentTime();
      this.notifyClockListeners(curTime);
    }, 50);
  }

  private stopTimeTracker(): void {
    if (this.timeUpdateInterval !== null) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }

  public computeCurrentFingerprint(): string | null {
    if (!this.activeSource || !this.activeResolvedParams) {
      return null;
    }
    const region = this.getEffectiveRegion();
    if (!region || region.frameCount <= 0) {
      return null;
    }
    const numericParams = mapResolvedParameters(this.activeResolvedParams);

    return computePreviewFingerprint({
      sourceId: this.activeSource.id,
      startFrame: region.startFrame,
      frameCount: region.frameCount,
      dspBuildId: DEFAULT_DSP_BUILD_ID,
      parameters: numericParams,
    });
  }

  isRenderCurrent(fingerprint: string | null): boolean {
    if (!this.renderedAudio || !fingerprint) return false;
    return this.renderedAudio.fingerprint === fingerprint;
  }

  // ---------------------------------------------------------------------------
  // Status & Subscription Channels
  // ---------------------------------------------------------------------------

  getStatus(): PreviewEngineStatus {
    const currentFingerprint = this.computeCurrentFingerprint();
    const renderedFp = this.renderedAudio?.fingerprint || null;
    const isStale = Boolean(renderedFp && currentFingerprint && renderedFp !== currentFingerprint);
    const effectiveRegion = this.getEffectiveRegion();
    const isAutoPreviewPending = this.pendingAutoFingerprint !== null;

    return {
      state: this.state,
      auditionMode: this.auditionMode,
      activeSource: this.activeSource,
      activeContextId: this.activeContextId,
      activeContextType: this.activeContextType,
      activeContextLabel: this.activeContextLabel,
      isLooping: this.isLooping,
      currentTime: this.getCurrentTime(),
      duration: this.getPlaybackDuration(),
      previewRegionSeconds: effectiveRegion?.durationSeconds ?? 0,
      tailDurationSeconds: this.renderedAudio?.tailDurationSeconds || 0,
      isRendering: this.state === 'rendering',
      errorMessage: this.errorMessage,
      lastRenderTimeMs: this.lastRenderTimeMs,
      renderedFingerprint: renderedFp,
      requestedFingerprint: currentFingerprint,
      isPreviewStale: isStale,
      auditionLengthMode: this.auditionLengthMode,
      auditionRegion: this.auditionRegion,
      effectiveRegion,
      autoPreview: this.autoPreviewEnabled,
      loudnessMatch: this.loudnessMatchEnabled,
      dryMonitoringGain: this.dryMonitoringGain,
      fxMonitoringGain: this.fxMonitoringGain,
      isAutoPreviewPending,
      isUpdating: this.state === 'rendering' || isAutoPreviewPending,
    };
  }

  /**
   * Subscribes to low-frequency state transitions.
   * Does NOT fire on every 50ms playhead tick, preventing needless UI re-renders.
   */
  subscribe(listener: (status: PreviewEngineStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Subscribes to high-frequency playhead clock updates (50ms).
   * Used exclusively by transport scrubbers and timers.
   */
  subscribeClock(listener: (currentTime: number) => void): () => void {
    this.clockListeners.add(listener);
    listener(this.getCurrentTime());
    return () => {
      this.clockListeners.delete(listener);
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

  private notifyClockListeners(time: number): void {
    for (const listener of this.clockListeners) {
      try {
        listener(time);
      } catch (err) {
        console.error('Error in PreviewEngine clock listener:', err);
      }
    }
  }
}

export const previewEngine = PreviewEngine.getInstance();
