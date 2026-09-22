import { ReferenceSample, VocalAudioSource } from './types';
import { decodeAudioBuffer } from './decodeAudio';

export const DEFAULT_REFERENCE_SAMPLE_ID = 'female-clean';

export interface ReferenceManifestData {
  readonly version: number;
  readonly sampleRate: number;
  readonly samples: ReferenceSample[];
}

const FALLBACK_REFERENCE_SAMPLES: ReferenceSample[] = [
  {
    id: 'female-clean',
    filename: 'vocal-female-clean.wav',
    name: 'Female Clean',
    category: 'Female Melodic',
    description: 'Female clean melodic phrase, dry studio recording (12s)',
    durationSeconds: 12.0,
    recommendedFor: 'Harmony, Reverb, Chorus, Pitch Shift',
    license: 'Creative Commons / Public Domain VoxP4 Golden Fixture',
    provenance: 'Studio lead vocal recording, 48 kHz mono PCM 16 (-1 dBFS peak normalized)',
  },
  {
    id: 'male-clean',
    filename: 'vocal-male-clean.wav',
    name: 'Male Clean',
    category: 'Male Melodic/Spoken',
    description: 'Male clean vocal speech with natural fundamental F0 ~130 Hz (4.1s)',
    durationSeconds: 4.12,
    recommendedFor: 'Tracking in male register, Drive, Delay, Dynamics',
    license: 'CMU ARCTIC (Free software / Permissive)',
    provenance: 'Carnegie Mellon University ARCTIC speech synthesis database (Speaker BDL)',
  },
  {
    id: 'low-register',
    filename: 'vocal-low-register.wav',
    name: 'Low Register Baritone',
    category: 'Male Deep Register',
    description: 'Deep male baritone fundamental F0 ~95-110 Hz (3.6s)',
    durationSeconds: 3.64,
    recommendedFor: 'YIN low fundamental detection, PSOLA long-period handling',
    license: 'CMU ARCTIC (Free software / Permissive)',
    provenance: 'Carnegie Mellon University ARCTIC database (Speaker JMK, Canadian English baritone)',
  },
  {
    id: 'high-register',
    filename: 'vocal-high-register.wav',
    name: 'High Register Female',
    category: 'Female High Register',
    description: 'Female higher pitch vocal fundamental F0 ~220-250 Hz (3.4s)',
    durationSeconds: 3.35,
    recommendedFor: 'Pitch tracking at high register, formant preservation',
    license: 'CMU ARCTIC (Free software / Permissive)',
    provenance: 'Carnegie Mellon University ARCTIC database (Speaker SLT, US English female)',
  },
  {
    id: 'articulation',
    filename: 'vocal-articulation.wav',
    name: 'Articulation Test',
    category: 'Phonetic / Articulation',
    description: 'Consonant-rich phrase with plosives and fricatives (3.9s)',
    durationSeconds: 3.87,
    recommendedFor: 'Onset detection, plosive bridge, unvoiced articulation handling',
    license: 'CMU ARCTIC (Free software / Permissive)',
    provenance: 'Carnegie Mellon University ARCTIC sentence a0016 (Speaker BDL)',
  },
  {
    id: 'sustained',
    filename: 'vocal-sustained.wav',
    name: 'Sustained Singing',
    category: 'Sustained Vowel',
    description: 'Sustained singing note with steady pitch and gentle natural vibrato (6.8s)',
    durationSeconds: 6.8,
    recommendedFor: 'LPC formant filter evaluation, chorus, microshift, harmony stability',
    license: 'Creative Commons / Public Domain VoxP4 Golden Fixture',
    provenance: 'Studio lead vocal steady singing excerpt, 48 kHz mono PCM 16 (-1 dBFS peak normalized)',
  },
];

let cachedManifest: ReferenceSample[] | null = null;

export function resolvePublicAsset(relativePath: string): string {
  const base = import.meta.env?.BASE_URL || './';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  return `${cleanBase}${cleanPath}`;
}

export async function getReferenceSamples(): Promise<readonly ReferenceSample[]> {
  if (cachedManifest) {
    return cachedManifest;
  }

  try {
    const res = await fetch(resolvePublicAsset('audio/reference/manifest.json'));
    if (!res.ok) {
      cachedManifest = FALLBACK_REFERENCE_SAMPLES;
      return cachedManifest;
    }
    const data: ReferenceManifestData = await res.json();
    cachedManifest = data.samples;
    return cachedManifest;
  } catch (err) {
    cachedManifest = FALLBACK_REFERENCE_SAMPLES;
    return cachedManifest;
  }
}

export function getDefaultReferenceSamples(): readonly ReferenceSample[] {
  return FALLBACK_REFERENCE_SAMPLES;
}

export async function loadReferenceAudioSource(
  sample: ReferenceSample,
  audioContext: AudioContext
): Promise<VocalAudioSource> {
  const url = resolvePublicAsset(`audio/reference/${sample.filename}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download reference audio '${sample.filename}': HTTP ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const decoded = await decodeAudioBuffer(arrayBuffer, audioContext);

  return {
    id: sample.id,
    name: sample.name,
    type: 'reference',
    duration: decoded.duration,
    sampleRate: decoded.sampleRate,
    samples: decoded.samples,
    rawBuffer: decoded.originalBuffer,
  };
}
