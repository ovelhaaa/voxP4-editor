/**
 * Audio decoding and normalization pipeline for VoxP4 Web Editor preview.
 *
 * Pipeline:
 *   ArrayBuffer / File
 *        ↓
 *   WebAudio decodeAudioData()
 *        ↓
 *   AudioBuffer
 *        ↓
 *   Controlled downmix to mono (0.5 * L + 0.5 * R)
 *        ↓
 *   High-quality resampling to 48,000 Hz
 *        ↓
 *   Float32Array ready for VoxP4 DSP WebAssembly
 */

export interface DecodedVocalAudio {
  readonly sampleRate: number;
  readonly duration: number;
  readonly samples: Float32Array;
  readonly originalBuffer?: AudioBuffer;
}

export async function decodeAudioBuffer(
  arrayBuffer: ArrayBuffer,
  audioContext: AudioContext
): Promise<DecodedVocalAudio> {
  // WebAudio decodeAudioData consumes the buffer; slice to preserve original if needed
  const copy = arrayBuffer.slice(0);
  const audioBuffer = await audioContext.decodeAudioData(copy);

  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const inRate = audioBuffer.sampleRate;
  const targetRate = 48000;

  // 1. Downmix to mono
  const mono = new Float32Array(length);
  if (numChannels === 1) {
    mono.set(audioBuffer.getChannelData(0));
  } else {
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      mono[i] = (ch0[i] + ch1[i]) * 0.5;
    }
  }

  // 2. Resample to 48000 Hz if necessary
  if (inRate === targetRate) {
    return {
      sampleRate: targetRate,
      duration: length / targetRate,
      samples: mono,
      originalBuffer: audioBuffer,
    };
  }

  const ratio = inRate / targetRate;
  const outLength = Math.round(length / ratio);
  const resampled = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    if (idx + 1 < length) {
      resampled[i] = mono[idx] * (1.0 - frac) + mono[idx + 1] * frac;
    } else {
      resampled[i] = mono[idx] ?? 0.0;
    }
  }

  return {
    sampleRate: targetRate,
    duration: outLength / targetRate,
    samples: resampled,
    originalBuffer: audioBuffer,
  };
}
