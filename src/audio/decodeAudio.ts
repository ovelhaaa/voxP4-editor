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
 *   Controlled downmix to mono:
 *     - 1 ch: direct copy
 *     - 2 ch: (L + R) * 0.5
 *     - >2 ch: arithmetic mean across all channels
 *        ↓
 *   Browser-native high-quality resampling to 48,000 Hz (OfflineAudioContext)
 *        ↓
 *   Float32Array ready for VoxP4 DSP WebAssembly
 */

export interface DecodedVocalAudio {
  readonly sampleRate: number; // Strictly 48000 Hz
  readonly duration: number;
  readonly samples: Float32Array; // Mono Float32Array at 48000 Hz
}

/**
 * Downmixes an AudioBuffer of any channel count to a mono Float32Array.
 */
export function downmixToMono(audioBuffer: AudioBuffer): Float32Array {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);

  if (numChannels === 1) {
    mono.set(audioBuffer.getChannelData(0));
  } else if (numChannels === 2) {
    const ch0 = audioBuffer.getChannelData(0);
    const ch1 = audioBuffer.getChannelData(1);
    for (let i = 0; i < length; i++) {
      mono[i] = (ch0[i] + ch1[i]) * 0.5;
    }
  } else if (numChannels > 2) {
    const weight = 1.0 / numChannels;
    for (let c = 0; c < numChannels; c++) {
      const ch = audioBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        mono[i] += ch[i] * weight;
      }
    }
  }

  return mono;
}

/**
 * Decodes an audio ArrayBuffer into a guaranteed 48000 Hz mono Float32Array.
 * Uses OfflineAudioContext for browser-grade sinc/polyphase resampling when needed.
 */
export async function decodeAudioBuffer(
  arrayBuffer: ArrayBuffer,
  audioContext: AudioContext
): Promise<DecodedVocalAudio> {
  const copy = arrayBuffer.slice(0);
  const audioBuffer = await audioContext.decodeAudioData(copy);

  const length = audioBuffer.length;
  const inRate = audioBuffer.sampleRate;
  const targetRate = 48000;

  // 1. Controlled downmix to mono
  const mono = downmixToMono(audioBuffer);

  // 2. If already at 48000 Hz, return immediately without resampling
  if (inRate === targetRate) {
    return {
      sampleRate: targetRate,
      duration: length / targetRate,
      samples: mono,
    };
  }

  // 3. High quality browser resampling via OfflineAudioContext
  const targetLength = Math.max(1, Math.round(audioBuffer.duration * targetRate));

  const OfflineCtxClass =
    (typeof window !== 'undefined' && ((window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext)) ||
    (typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null);

  if (OfflineCtxClass) {
    try {
      const offlineCtx = new OfflineCtxClass(1, targetLength, targetRate);
      const monoBuffer = offlineCtx.createBuffer(1, length, inRate);
      monoBuffer.copyToChannel(mono, 0);

      const srcNode = offlineCtx.createBufferSource();
      srcNode.buffer = monoBuffer;
      srcNode.connect(offlineCtx.destination);
      srcNode.start(0);

      const renderedBuffer = await offlineCtx.startRendering();
      const resampledChannel = renderedBuffer.getChannelData(0);
      return {
        sampleRate: targetRate,
        duration: renderedBuffer.duration,
        samples: new Float32Array(resampledChannel),
      };
    } catch (err) {
      console.warn('OfflineAudioContext resampling failed, using fallback interpolation:', err);
    }
  }

  // 4. Deterministic interpolation fallback for headless/test environments
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
  };
}

/**
 * Computes a unique, collision-free identifier for user-uploaded audio files
 * using SHA-256 over the raw ArrayBuffer.
 */
export async function computeAudioFileId(file: File, arrayBuffer?: ArrayBuffer): Promise<string> {
  try {
    let buf: ArrayBuffer | undefined = arrayBuffer;
    if (!buf) {
      if (typeof file.arrayBuffer === 'function') {
        buf = await file.arrayBuffer();
      } else if (typeof FileReader !== 'undefined') {
        buf = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
      } else if (typeof Response !== 'undefined') {
        buf = await new Response(file).arrayBuffer();
      }
    }

    const subtle =
      (typeof crypto !== 'undefined' && (crypto.subtle || (crypto as any).webkitSubtle)) ||
      (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle);

    if (buf && subtle && subtle.digest) {
      const digest = await subtle.digest('SHA-256', buf);
      const hashArray = Array.from(new Uint8Array(digest));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      return `user-${hashHex.slice(0, 16)}`;
    }
  } catch (err) {
    console.warn('Could not compute subtle crypto hash for audio file:', err);
  }
  return `user-${file.name}-${file.size}-${file.lastModified}`;
}
