import createVoxP4Module from './wasm/voxp4-preview.mjs';
import wasmUrl from './wasm/voxp4-preview.wasm?url';

/**
 * Preview Web Worker
 *
 * NOTE ON WORKER CANCELLATION SEMANTICS:
 * Because WebAssembly execution via Emscripten runs synchronously on the Worker thread,
 * postMessage({ type: 'CANCEL' }) cannot preemptively interrupt an in-progress
 * voxp4_preview_render(...) loop mid-call.
 * Instead, cancellation is checked immediately before WASM execution, during tail block
 * processing, and prior to returning results.
 * Any superseded or cancelled task discards its buffers, frees WASM memory, and sends
 * no state mutation to the main thread.
 */

interface WorkerRenderRequest {
  type: 'RENDER';
  taskId: string;
  cacheKey: string;
  contextFingerprint: string;
  input: Float32Array;
  parameters: Record<string, number>;
}

interface WorkerCancelRequest {
  type: 'CANCEL';
  taskId: string;
}

type WorkerMessage = WorkerRenderRequest | WorkerCancelRequest;

let wasmModulePromise: Promise<any> | null = null;
let activeTaskId: string | null = null;

// Tail calculation constants
const BLOCK_SIZE = 64;
const MAX_TAIL_SECONDS = 4.0;
const SILENCE_THRESHOLD_RMS = 1e-4; // ~-80 dBFS
const MIN_SILENCE_BLOCKS = Math.round((0.25 * 48000) / BLOCK_SIZE); // ~188 blocks (250 ms)
const MIN_TAIL_CHECK_BLOCKS = Math.round((0.4 * 48000) / BLOCK_SIZE); // ~300 blocks (allow delays to arrive)
const MAX_TAIL_BLOCKS = Math.round((MAX_TAIL_SECONDS * 48000) / BLOCK_SIZE); // 3000 blocks

async function getWasmModule(): Promise<any> {
  if (!wasmModulePromise) {
    wasmModulePromise = createVoxP4Module({
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          if (wasmUrl) return wasmUrl;
          const base = (typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL) || './';
          const cleanBase = base.endsWith('/') ? base : `${base}/`;
          return `${cleanBase}wasm/voxp4-preview.wasm`;
        }
        return path;
      },
    }).then((mod: any) => {
      const init = mod.cwrap('voxp4_preview_init', 'boolean', ['number', 'number']);
      const ok = init(48000, 64);
      if (!ok) {
        throw new Error('Failed to initialize VoxP4 DSP preview engine in worker');
      }
      return mod;
    });
  }
  return wasmModulePromise;
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const msg = event.data;

  if (msg.type === 'CANCEL') {
    if (activeTaskId === msg.taskId) {
      activeTaskId = null;
    }
    return;
  }

  if (msg.type === 'RENDER') {
    const { taskId, cacheKey, contextFingerprint, input, parameters } = msg;
    activeTaskId = taskId;

    let inPtr = 0;
    let outLPtr = 0;
    let outRPtr = 0;
    let zeroInPtr = 0;
    let tailLPtr = 0;
    let tailRPtr = 0;
    let mod: any = null;

    try {
      mod = await getWasmModule();

      // Check if task was superseded or cancelled while loading module
      if (activeTaskId !== taskId) {
        return;
      }

      const setParameter = mod.cwrap('voxp4_preview_set_parameter', 'boolean', ['string', 'number']);
      const resetParameters = mod.cwrap('voxp4_preview_reset_parameters', 'boolean', []);
      const resetDsp = mod.cwrap('voxp4_preview_reset', null, []);
      const render = mod.cwrap('voxp4_preview_render', 'boolean', ['number', 'number', 'number', 'number']);

      // 1. Reset parameters to canonical defaults
      const okReset = resetParameters();
      if (!okReset) {
        throw new Error('Failed to reset DSP parameters to defaults');
      }

      // 2. Apply resolved parameter values with strict validation
      for (const [key, value] of Object.entries(parameters)) {
        const ok = setParameter(key, value);
        if (!ok) {
          throw new Error(`DSP rejected parameter: ${key}`);
        }
      }

      // 3. Allocate buffers in WASM linear memory
      const frames = input.length;
      const bytes = frames * 4;
      inPtr = mod._malloc(bytes);
      outLPtr = mod._malloc(bytes);
      outRPtr = mod._malloc(bytes);

      if (!inPtr || !outLPtr || !outRPtr) {
        throw new Error('WASM memory allocation failed for primary input/output buffers');
      }

      // 4. Copy input into WASM memory
      mod.HEAPF32.set(input, inPtr >> 2);

      // 5. Reset internal state (delay/reverb buffers) before render
      resetDsp();

      // 6. Execute primary render loop
      const t0 = performance.now();
      const success = render(inPtr, frames, outLPtr, outRPtr);
      if (!success) {
        throw new Error('DSP primary render failed');
      }

      // Check if task was superseded during primary render
      if (activeTaskId !== taskId) {
        return;
      }

      // Extract primary audio
      const sourceL = new Float32Array(frames);
      const sourceR = new Float32Array(frames);
      sourceL.set(mod.HEAPF32.subarray(outLPtr >> 2, (outLPtr >> 2) + frames));
      sourceR.set(mod.HEAPF32.subarray(outRPtr >> 2, (outRPtr >> 2) + frames));

      // 7. Tail processing (reverb / delay decay)
      const zeroBytes = BLOCK_SIZE * 4;
      zeroInPtr = mod._malloc(zeroBytes);
      tailLPtr = mod._malloc(zeroBytes);
      tailRPtr = mod._malloc(zeroBytes);

      if (!zeroInPtr || !tailLPtr || !tailRPtr) {
        throw new Error('WASM memory allocation failed for tail processing buffers');
      }

      mod.HEAPF32.fill(0, zeroInPtr >> 2, (zeroInPtr >> 2) + BLOCK_SIZE);

      const tailChunksL: Float32Array[] = [];
      const tailChunksR: Float32Array[] = [];
      let consecutiveSilence = 0;

      for (let b = 0; b < MAX_TAIL_BLOCKS; b++) {
        if (activeTaskId !== taskId) {
          return;
        }

        const okBlock = render(zeroInPtr, BLOCK_SIZE, tailLPtr, tailRPtr);
        if (!okBlock) {
          break;
        }

        const bL = new Float32Array(BLOCK_SIZE);
        const bR = new Float32Array(BLOCK_SIZE);
        bL.set(mod.HEAPF32.subarray(tailLPtr >> 2, (tailLPtr >> 2) + BLOCK_SIZE));
        bR.set(mod.HEAPF32.subarray(tailRPtr >> 2, (tailRPtr >> 2) + BLOCK_SIZE));

        // Monitor RMS energy of this block
        let sumSq = 0;
        for (let i = 0; i < BLOCK_SIZE; i++) {
          sumSq += bL[i] * bL[i] + bR[i] * bR[i];
        }
        const rms = Math.sqrt(sumSq / (BLOCK_SIZE * 2));

        tailChunksL.push(bL);
        tailChunksR.push(bR);

        if (rms < SILENCE_THRESHOLD_RMS) {
          consecutiveSilence++;
        } else {
          consecutiveSilence = 0;
        }

        // Early termination once silence persists after minimum check period
        if (b >= MIN_TAIL_CHECK_BLOCKS && consecutiveSilence >= MIN_SILENCE_BLOCKS) {
          break;
        }
      }

      // Check if task was superseded during tail render
      if (activeTaskId !== taskId) {
        return;
      }

      const renderTimeMs = performance.now() - t0;

      // 8. Assemble combined output audio (Source + Tail)
      const trimBlocks = Math.max(0, consecutiveSilence - 4);
      const finalTailBlocks = Math.max(0, tailChunksL.length - trimBlocks);
      const tailFrames = finalTailBlocks * BLOCK_SIZE;
      const tailDurationSeconds = tailFrames / 48000;

      const totalFrames = frames + tailFrames;
      const outL = new Float32Array(totalFrames);
      const outR = new Float32Array(totalFrames);

      outL.set(sourceL, 0);
      outR.set(sourceR, 0);

      for (let i = 0; i < finalTailBlocks; i++) {
        outL.set(tailChunksL[i], frames + i * BLOCK_SIZE);
        outR.set(tailChunksR[i], frames + i * BLOCK_SIZE);
      }

      // 9. Post back result with Transferable buffers
      (self as any).postMessage(
        {
          type: 'RENDER_RESULT',
          taskId,
          cacheKey,
          contextFingerprint,
          left: outL,
          right: outR,
          duration: totalFrames / 48000,
          tailDurationSeconds,
          renderTimeMs,
        },
        [outL.buffer, outR.buffer]
      );
    } catch (err: any) {
      if (activeTaskId === taskId) {
        self.postMessage({
          type: 'RENDER_ERROR',
          taskId,
          cacheKey,
          contextFingerprint,
          error: err?.message || String(err),
        });
      }
    } finally {
      if (mod) {
        if (inPtr) mod._free(inPtr);
        if (outLPtr) mod._free(outLPtr);
        if (outRPtr) mod._free(outRPtr);
        if (zeroInPtr) mod._free(zeroInPtr);
        if (tailLPtr) mod._free(tailLPtr);
        if (tailRPtr) mod._free(tailRPtr);
      }
    }
  }
};
