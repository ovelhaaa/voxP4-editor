import createVoxP4Module from './wasm/voxp4-preview.mjs';
import wasmUrl from './wasm/voxp4-preview.wasm?url';

interface WorkerRenderRequest {
  type: 'RENDER';
  taskId: string;
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
    const { taskId, input, parameters } = msg;
    activeTaskId = taskId;

    try {
      const mod = await getWasmModule();

      // Check if task was cancelled while loading module
      if (activeTaskId !== taskId) {
        return;
      }

      const setParameter = mod.cwrap('voxp4_preview_set_parameter', 'boolean', ['string', 'number']);
      const resetParameters = mod.cwrap('voxp4_preview_reset_parameters', 'boolean', []);
      const resetDsp = mod.cwrap('voxp4_preview_reset', null, []);
      const render = mod.cwrap('voxp4_preview_render', 'boolean', ['number', 'number', 'number', 'number']);

      // 1. Reset parameters to defaults
      resetParameters();

      // 2. Apply resolved parameter values
      for (const [key, value] of Object.entries(parameters)) {
        setParameter(key, value);
      }

      // 3. Allocate buffers in WASM linear memory
      const frames = input.length;
      const bytes = frames * 4;
      const inPtr = mod._malloc(bytes);
      const outLPtr = mod._malloc(bytes);
      const outRPtr = mod._malloc(bytes);

      if (!inPtr || !outLPtr || !outRPtr) {
        if (inPtr) mod._free(inPtr);
        if (outLPtr) mod._free(outLPtr);
        if (outRPtr) mod._free(outRPtr);
        throw new Error('WASM memory allocation failed');
      }

      // 4. Copy input into WASM memory
      mod.HEAPF32.set(input, inPtr >> 2);

      // 5. Reset internal state (filters/reverb history) before render
      resetDsp();

      // 6. Execute render loop
      const t0 = performance.now();
      const success = render(inPtr, frames, outLPtr, outRPtr);
      const renderTimeMs = performance.now() - t0;

      // Check if task was cancelled during render
      if (activeTaskId !== taskId) {
        mod._free(inPtr);
        mod._free(outLPtr);
        mod._free(outRPtr);
        return;
      }

      // 7. Extract output audio
      const outL = new Float32Array(frames);
      const outR = new Float32Array(frames);
      outL.set(mod.HEAPF32.subarray(outLPtr >> 2, (outLPtr >> 2) + frames));
      outR.set(mod.HEAPF32.subarray(outRPtr >> 2, (outRPtr >> 2) + frames));

      // 8. Free WASM memory
      mod._free(inPtr);
      mod._free(outLPtr);
      mod._free(outRPtr);

      // 9. Post back result with Transferable buffers
      (self as any).postMessage(
        {
          type: 'RENDER_RESULT',
          taskId,
          success,
          left: outL,
          right: outR,
          renderTimeMs,
        },
        [outL.buffer, outR.buffer]
      );
    } catch (err: any) {
      if (activeTaskId === taskId) {
        self.postMessage({
          type: 'RENDER_ERROR',
          taskId,
          error: err?.message || String(err),
        });
      }
    }
  }
};
