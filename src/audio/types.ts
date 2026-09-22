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
  readonly sampleRate: number; // Always 48000 Hz once decoded
  readonly samples: Float32Array; // Mono audio at 48000 Hz
  readonly rawBuffer?: AudioBuffer;
}

export interface RenderedAudio {
  readonly sourceId: string;
  readonly cacheKey: string;
  readonly duration: number;
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
  readonly activeContextLabel: string;
  readonly isLooping: boolean;
  readonly currentTime: number;
  readonly duration: number;
  readonly previewRegionSeconds: number;
  readonly isRendering: boolean;
  readonly errorMessage: string | null;
  readonly lastRenderTimeMs: number | null;
}
