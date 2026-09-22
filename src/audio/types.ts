export type PreviewPlaybackState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'rendering'
  | 'rendered'
  | 'playing'
  | 'paused'
  | 'error';

export type AuditionMode = 'processed' | 'dry';

export type ContextType = 'preset' | 'scene' | 'subscene';

export interface ReferenceSample {
  readonly id: string;
  readonly filename: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly durationSeconds: number;
  readonly recommendedFor: string;
  readonly license: string;
  readonly provenance: string;
}

export interface VocalAudioSource {
  readonly id: string;
  readonly name: string;
  readonly type: 'reference' | 'user';
  readonly duration: number;
  readonly sampleRate: number; // Strictly 48000 Hz once decoded
  readonly samples: Float32Array; // Mono audio at 48000 Hz
}

export interface PreviewFingerprint {
  readonly sourceId: string;
  readonly startFrame: number;
  readonly frameCount: number;
  readonly dspBuildId: string;
  readonly parametersHash: string;
}

export interface RenderedAudio {
  readonly sourceId: string;
  readonly cacheKey: string;
  readonly fingerprint: string;
  readonly duration: number;
  readonly tailDurationSeconds: number;
  readonly sampleRate: number;
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly renderTimeMs: number;
  audioBuffer?: AudioBuffer;
}

export interface PreviewEngineStatus {
  readonly state: PreviewPlaybackState;
  readonly auditionMode: AuditionMode;
  readonly activeSource: VocalAudioSource | null;
  readonly activeContextId: string | null;
  readonly activeContextType: ContextType | null;
  readonly activeContextLabel: string;
  readonly isLooping: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly previewRegionSeconds: number;
  readonly tailDurationSeconds: number;
  readonly isRendering: boolean;
  readonly errorMessage: string | null;
  readonly lastRenderTimeMs: number | null;
  readonly renderedFingerprint: string | null;
  readonly requestedFingerprint: string | null;
  readonly isPreviewStale: boolean;
}
