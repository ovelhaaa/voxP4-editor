import createVoxP4Module from './wasm/voxp4-preview.mjs';
import wasmUrl from './wasm/voxp4-preview.wasm?url';
import {
  estimateMaxTailSeconds,
  estimateMinTailCheckSeconds,
  estimateMinSilenceSeconds,
  BLOCK_SIZE,
} from './tailEstimation';
import { captureTail } from './tailProcessor';

/**
 * Preview Web Worker
 *
 * CANCELLATION IS LOGICAL, NOT PREEMPTIVE.
 *
 * The Worker renders synchronously inside WASM (`voxp4_preview_render`) and inside
 * the `captureTail()` block loop. While that synchronous JS/WASM work is running,
 * the Worker cannot service new messages: `postMessage({ type: 'CANCEL' })` is only
 * observed when control returns to the Worker event loop (i.e. between the
 * cooperative check points below). It does NOT interrupt a `render()` call or a
 * block mid-execution, and it does NOT abort the currently executing WASM.
 *
 * The main thread remains authoritative:
 *   - a newer request supersedes the pending task and rejects its Promise;
 *   - the superseded task's result is ignored even if it finishes later;
 *   - the Worker may keep burning CPU on the stale render until the synchronous
 *     section returns.
 *
 * Cancellation is checked cooperatively: immediately before WASM execution,
 * between tail blocks via `captureTail({ shouldAbort })`, and before posting
 * results. A discarded task frees its WASM memory and posts no state mutation.
 *
 * This is an accepted limitation of the synchronous render model; chunked/yielding
 * rendering is intentionally out of scope.
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
      const parameterEntries = Object.entries(parameters);
      for (let index = 0; index < parameterEntries.length; index++) {
        const [key, value] = parameterEntries[index];
        const ok = setParameter(key, value);
        if (!ok) {
          throw new Error(
            `DSP rejected parameter ${index + 1}/${parameterEntries.length}: ${key}`
          );
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

      const maxTailSeconds = estimateMaxTailSeconds(parameters);
      const minTailCheckSeconds = estimateMinTailCheckSeconds(parameters);
      const minSilenceSeconds = estimateMinSilenceSeconds(parameters);

      const capturedTail = captureTail({
        maxTailSeconds,
        minTailCheckSeconds,
        minSilenceSeconds,
        shouldAbort: () => activeTaskId !== taskId,
        step: (blockL, blockR, count) => {
          const okBlock = render(zeroInPtr, count, tailLPtr, tailRPtr);
          if (!okBlock) return false;
          blockL.set(mod.HEAPF32.subarray(tailLPtr >> 2, (tailLPtr >> 2) + count));
          blockR.set(mod.HEAPF32.subarray(tailRPtr >> 2, (tailRPtr >> 2) + count));
          return true;
        },
      });

      // Aborted while rendering the tail: discard without posting.
      if (capturedTail === null) {
        return;
      }

      const renderTimeMs = performance.now() - t0;

      // 8. Assemble combined output audio (Source + Tail)
      const tailFrames = capturedTail.left.length;
      const tailDurationSeconds = capturedTail.tailDurationSeconds;

      const totalFrames = frames + tailFrames;
      const outL = new Float32Array(totalFrames);
      const outR = new Float32Array(totalFrames);

      outL.set(sourceL, 0);
      outR.set(sourceR, 0);
      outL.set(capturedTail.left, frames);
      outR.set(capturedTail.right, frames);

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
