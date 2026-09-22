import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PreviewEngine,
  RenderSupersededError,
  RenderCancelledError,
} from '../src/audio/PreviewEngine';
import { renderCache } from '../src/audio/renderCache';
import { VocalAudioSource } from '../src/audio/types';
import { resolveAllParameters } from '../src/domain/resolution';

describe('PreviewEngine Hardening & Integration Suite', () => {
  let engine: PreviewEngine;
  let mockWorker: {
    postMessage: (msg: any) => void;
    onmessage: ((e: { data: any }) => void) | null;
    onerror: ((e: any) => void) | null;
    messagesSent: any[];
  };

  const createMockSource = (id = 'mock-source-1', sampleRate = 48000, duration = 10.0): VocalAudioSource => {
    const totalFrames = Math.round(duration * sampleRate);
    return {
      id,
      name: `Source ${id}`,
      type: 'reference',
      duration,
      sampleRate,
      samples: new Float32Array(totalFrames),
    };
  };

  beforeEach(() => {
    renderCache.clear();

    // Mock AudioContext globally for testing
    (globalThis as any).AudioContext = class MockAudioContext {
      sampleRate = 48000;
      currentTime = 0;
      state = 'running';
      createBuffer(channels: number, length: number, sampleRate: number) {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData: (c: number) => data[c],
          copyToChannel: (src: Float32Array, c: number) => data[c].set(src),
        };
      }
      createBufferSource() {
        return {
          buffer: null,
          loop: false,
          connect: () => {},
          disconnect: () => {},
          start: () => {},
          stop: () => {},
          onended: null,
        };
      }
      resume = async () => {};
    };

    mockWorker = {
      messagesSent: [],
      onmessage: null,
      onerror: null,
      postMessage: vi.fn((msg: any) => {
        mockWorker.messagesSent.push(msg);
      }),
    };

    engine = PreviewEngine.getInstance();
    (engine as any).worker = mockWorker;
    (engine as any).audioCtx = new (globalThis as any).AudioContext();
    (engine as any).currentTask = null;
    (engine as any).activeSource = null;
    (engine as any).renderedAudio = null;
    (engine as any).isPlaying = false;
    (engine as any).auditionMode = 'processed';
    (engine as any).activePlaybackBuffer = null;
    (engine as any).activePlaybackFingerprint = null;
    (engine as any).state = 'idle';
    (engine as any).activeContextId = null;
    (engine as any).activeResolvedParams = null;
    (engine as any).listeners.clear();
    (engine as any).clockListeners.clear();
  });

  it('enforces 48000 Hz source invariant and fails clearly on invalid sample rates', async () => {
    const invalidSource = createMockSource('bad-source', 44100);
    (engine as any).setActiveSource(invalidSource);

    const status = engine.getStatus();
    expect(status.state).toBe('error');
    expect(status.errorMessage).toContain('44100 Hz (expected 48000 Hz)');
  });

  it('correctly executes cache miss, stores result, and reuses on subsequent request (cache hit)', async () => {
    const source = createMockSource('clean-1', 48000, 5.0);
    (engine as any).setActiveSource(source);

    // Using canonical parameter identity DelayWet (Rule 3)
    const presetParams = resolveAllParameters({
      preset: { id: 'p1', name: 'Preset 1', parameters: { DelayWet: 0.3 } },
      currentLevel: 'preset',
    });

    // First request: Cache Miss
    const renderPromise = engine.requestRender(
      { id: 'preset:p1', type: 'preset', label: 'Preset: Preset 1' },
      presetParams
    );

    expect(engine.getStatus().isRendering).toBe(true);
    expect(mockWorker.messagesSent.length).toBe(1);

    const renderMsg = mockWorker.messagesSent[0];
    expect(renderMsg.type).toBe('RENDER');
    expect(renderMsg.parameters['delay.wet']).toBeCloseTo(0.3, 4);

    // Simulate Worker responding with success
    const resultFrames = renderMsg.input.length + 4800; // includes 0.1s tail
    (engine as any).handleRenderSuccess({
      taskId: renderMsg.taskId,
      cacheKey: renderMsg.cacheKey,
      contextFingerprint: renderMsg.contextFingerprint,
      left: new Float32Array(resultFrames),
      right: new Float32Array(resultFrames),
      duration: resultFrames / 48000,
      tailDurationSeconds: 4800 / 48000,
      renderTimeMs: 18,
    });

    const rendered = await renderPromise;
    expect(rendered).toBeDefined();
    expect(rendered.tailDurationSeconds).toBeCloseTo(0.1, 3);
    expect(engine.getStatus().state).toBe('rendered');
    expect(renderCache.size).toBe(1);

    // Second request with exact same source and params: Cache Hit!
    const hitAudio = await engine.requestRender(
      { id: 'preset:p1', type: 'preset', label: 'Preset: Preset 1' },
      presetParams
    );

    // Worker was NOT called a second time
    expect(mockWorker.messagesSent.length).toBe(1);
    expect(hitAudio).toBe(rendered);
  });

  it('detects stale preview when parameters or selection changes', async () => {
    const source = createMockSource('source-stale', 48000, 5.0);
    (engine as any).setActiveSource(source);

    const paramsA = resolveAllParameters({
      preset: { id: 'p1', name: 'P1', parameters: { ReverbWet: 0.2 } },
      currentLevel: 'preset',
    });

    const promise = engine.requestRender(
      { id: 'preset:p1', type: 'preset', label: 'P1' },
      paramsA
    );

    const taskMsg = mockWorker.messagesSent[0];
    (engine as any).handleRenderSuccess({
      taskId: taskMsg.taskId,
      cacheKey: taskMsg.cacheKey,
      contextFingerprint: taskMsg.contextFingerprint,
      left: new Float32Array(1000),
      right: new Float32Array(1000),
      duration: 1000 / 48000,
      tailDurationSeconds: 0,
      renderTimeMs: 10,
    });

    await promise;
    expect(engine.getStatus().isPreviewStale).toBe(false);

    // Change parameter on same preset through the public requested-context API
    const paramsModified = resolveAllParameters({
      preset: { id: 'p1', name: 'P1', parameters: { ReverbWet: 0.7 } },
      currentLevel: 'preset',
    });

    engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'P1' }, paramsModified);

    // Now engine detects stale preview
    expect(engine.getStatus().isPreviewStale).toBe(true);
  });

  it('integrates requested context with the render lifecycle for stale detection (public API only)', async () => {
    const source = createMockSource('source-public-stale', 48000, 5.0);
    (engine as any).setActiveSource(source);

    const paramsA = resolveAllParameters({
      preset: { id: 'p1', name: 'P1', parameters: { ReverbWet: 0.2 } },
      currentLevel: 'preset',
    });

    engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'P1' }, paramsA);
    const renderPromise = engine.requestRender(
      { id: 'preset:p1', type: 'preset', label: 'P1' },
      paramsA
    );

    const taskA = mockWorker.messagesSent[0];
    (engine as any).handleRenderSuccess({
      taskId: taskA.taskId,
      cacheKey: taskA.cacheKey,
      contextFingerprint: taskA.contextFingerprint,
      left: new Float32Array(1000),
      right: new Float32Array(1000),
      duration: 1000 / 48000,
      tailDurationSeconds: 0,
      renderTimeMs: 9,
    });
    await renderPromise;
    expect(engine.getStatus().isPreviewStale).toBe(false);

    // DSP parameter changed via editor state -> immediately stale
    const paramsB = resolveAllParameters({
      preset: { id: 'p1', name: 'P1', parameters: { ReverbWet: 0.8 } },
      currentLevel: 'preset',
    });
    engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'P1' }, paramsB);
    expect(engine.getStatus().isPreviewStale).toBe(true);

    // Re-render with new parameters -> not stale again
    const renderPromiseB = engine.requestRender(
      { id: 'preset:p1', type: 'preset', label: 'P1' },
      paramsB
    );
    const taskB = mockWorker.messagesSent[1];
    (engine as any).handleRenderSuccess({
      taskId: taskB.taskId,
      cacheKey: taskB.cacheKey,
      contextFingerprint: taskB.contextFingerprint,
      left: new Float32Array(1000),
      right: new Float32Array(1000),
      duration: 1000 / 48000,
      tailDurationSeconds: 0,
      renderTimeMs: 9,
    });
    await renderPromiseB;
    expect(engine.getStatus().isPreviewStale).toBe(false);
  });

  it('does not mark audio stale when only the context identity/label changes (rename)', async () => {
    const source = createMockSource('source-rename', 48000, 5.0);
    (engine as any).setActiveSource(source);

    const params = resolveAllParameters({
      preset: { id: 'p1', name: 'Warm Vocal', parameters: { ReverbWet: 0.3 } },
      currentLevel: 'preset',
    });

    engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'Warm Vocal' }, params);
    const promise = engine.requestRender(
      { id: 'preset:p1', type: 'preset', label: 'Warm Vocal' },
      params
    );
    const task = mockWorker.messagesSent[0];
    (engine as any).handleRenderSuccess({
      taskId: task.taskId,
      cacheKey: task.cacheKey,
      contextFingerprint: task.contextFingerprint,
      left: new Float32Array(500),
      right: new Float32Array(500),
      duration: 500 / 48000,
      tailDurationSeconds: 0,
      renderTimeMs: 5,
    });
    const rendered = await promise;
    const fingerprintBefore = rendered.fingerprint;

    // Rename only: same DSP params, new id/label
    engine.updateRequestedContext(
      { id: 'preset:p1-renamed', type: 'preset', label: 'Warm Vocal Live' },
      params
    );

    const status = engine.getStatus();
    expect(status.isPreviewStale).toBe(false);
    expect(status.activeContextId).toBe('preset:p1-renamed');
    expect(status.activeContextLabel).toBe('Warm Vocal Live');
    expect(engine.computeCurrentFingerprint()).toBe(fingerprintBefore);
  });

  it('reuses cached audio for different contexts that resolve to identical DSP parameters', async () => {
    const source = createMockSource('source-equivalent', 48000, 5.0);
    (engine as any).setActiveSource(source);

    const paramsA = resolveAllParameters({
      preset: { id: 'pA', name: 'Preset A', parameters: { DelayWet: 0.4 } },
      currentLevel: 'preset',
    });
    const paramsB = resolveAllParameters({
      preset: { id: 'pB', name: 'Preset B', parameters: { DelayWet: 0.4 } },
      currentLevel: 'preset',
    });

    engine.updateRequestedContext({ id: 'preset:pA', type: 'preset', label: 'Preset A' }, paramsA);
    const promiseA = engine.requestRender(
      { id: 'preset:pA', type: 'preset', label: 'Preset A' },
      paramsA
    );
    const taskA = mockWorker.messagesSent[0];
    (engine as any).handleRenderSuccess({
      taskId: taskA.taskId,
      cacheKey: taskA.cacheKey,
      contextFingerprint: taskA.contextFingerprint,
      left: new Float32Array(800),
      right: new Float32Array(800),
      duration: 800 / 48000,
      tailDurationSeconds: 0,
      renderTimeMs: 7,
    });
    const audioA = await promiseA;
    expect(mockWorker.messagesSent.length).toBe(1);

    // Preset B has identical DSP params -> cache hit, UI identity still updates.
    const audioB = await engine.requestRender(
      { id: 'preset:pB', type: 'preset', label: 'Preset B' },
      paramsB
    );

    expect(mockWorker.messagesSent.length).toBe(1); // no new render
    expect(audioB).toBe(audioA); // same cached PCM
    const status = engine.getStatus();
    expect(status.activeContextId).toBe('preset:pB');
    expect(status.activeContextLabel).toBe('Preset B');
    expect(status.isPreviewStale).toBe(false);
    expect(engine.computeCurrentFingerprint()).toBe(audioA.fingerprint);
  });

  it('handles concurrent renders safely: supersedes old task with RenderSupersededError', async () => {
    const source = createMockSource('source-concurrent', 48000, 5.0);
    (engine as any).setActiveSource(source);

    const params1 = resolveAllParameters({
      preset: { id: 'p1', name: 'P1', parameters: { DelayWet: 0.1 } },
      currentLevel: 'preset',
    });
    const params2 = resolveAllParameters({
      preset: { id: 'p2', name: 'P2', parameters: { DelayWet: 0.9 } },
      currentLevel: 'preset',
    });

    const p1 = engine.requestRender({ id: 'preset:p1', label: 'P1' }, params1);
    p1.catch(() => {}); // Catch superseded rejection so it does not trigger unhandled rejection
    expect(mockWorker.messagesSent.length).toBe(1);

    // Second render requested immediately before first finishes
    const p2 = engine.requestRender({ id: 'preset:p2', label: 'P2' }, params2);
    // Sent: RENDER (task1), CANCEL (task1), RENDER (task2)
    expect(mockWorker.messagesSent.length).toBe(3);

    // First promise must reject with RenderSupersededError
    await expect(p1).rejects.toThrow(RenderSupersededError);

    // Complete task 2
    const task2Msg = mockWorker.messagesSent[2];
    (engine as any).handleRenderSuccess({
      taskId: task2Msg.taskId,
      cacheKey: task2Msg.cacheKey,
      contextFingerprint: task2Msg.contextFingerprint,
      left: new Float32Array(2000),
      right: new Float32Array(2000),
      duration: 2000 / 48000,
      tailDurationSeconds: 0,
      renderTimeMs: 15,
    });

    const result2 = await p2;
    expect(result2).toBeDefined();
    expect(engine.getStatus().state).toBe('rendered');
  });

  it('separates high-frequency playhead clock subscriptions from state transitions', () => {
    let stateCallCount = 0;
    let clockCallCount = 0;

    const unsubState = engine.subscribe(() => {
      stateCallCount++;
    });

    const unsubClock = engine.subscribeClock(() => {
      clockCallCount++;
    });

    expect(stateCallCount).toBe(1);
    expect(clockCallCount).toBe(1);

    // Simulate playhead clock tick
    (engine as any).notifyClockListeners(0.25);

    // Clock was called, state listeners were NOT called
    expect(clockCallCount).toBe(2);
    expect(stateCallCount).toBe(1);

    unsubState();
    unsubClock();
  });

  it('clamps transport offset when switching from Processed (with tail) to Dry', () => {
    const source = createMockSource('source-tail', 48000, 3.0); // Dry is 3.0s
    (engine as any).setActiveSource(source);

    // Mock a rendered audio with 4.5s duration (3s + 1.5s tail)
    (engine as any).renderedAudio = {
      sourceId: source.id,
      cacheKey: 'k',
      fingerprint: 'fp',
      duration: 4.5,
      tailDurationSeconds: 1.5,
      sampleRate: 48000,
      left: new Float32Array(4.5 * 48000),
      right: new Float32Array(4.5 * 48000),
      renderTimeMs: 20,
    };

    engine.setAuditionMode('processed');
    expect(engine.getPlaybackDuration()).toBe(4.5);

    // Seek to 4.2s (inside tail)
    engine.seek(4.2);
    expect(engine.getCurrentTime()).toBeCloseTo(4.2, 1);

    // Switch to Dry mode -> offset must be clamped to dry duration (3.0s)
    engine.setAuditionMode('dry');
    expect(engine.getPlaybackDuration()).toBe(3.0);
    expect(engine.getCurrentTime()).toBeLessThanOrEqual(3.0);
  });

  it('resolves multi-level inheritance (Preset -> Scene -> Subscene) for all 71 parameters accurately', () => {
    const preset = {
      id: 'p-base',
      name: 'Base Preset',
      parameters: {
        ReverbWet: 0.25,
        DelayWet: 0.15,
        DriveOverdrive: 0.4,
      },
    };

    const scene = {
      id: 's-song',
      name: 'Song Scene',
      basePresetId: 'p-base',
      parameters: {
        ReverbWet: 0.5, // Override preset
        TempoBpm: 130,
      },
      subscenes: [
        {
          id: 'sub-chorus',
          name: 'Chorus Section',
          parameters: {
            DelayWet: 0.45, // Override base
          },
        },
      ],
    };

    // 1. Preset level
    const pParams = resolveAllParameters({ preset, currentLevel: 'preset' });
    expect(pParams.length).toBe(71);
    const pReverb = pParams.find((r) => r.descriptor.key === 'reverb.wet');
    expect(pReverb?.resolvedValue).toBe(0.25);
    expect(pReverb?.source).toBe('preset');

    // 2. Scene level
    const sParams = resolveAllParameters({ preset, scene, currentLevel: 'scene' });
    const sReverb = sParams.find((r) => r.descriptor.key === 'reverb.wet');
    const sDelay = sParams.find((r) => r.descriptor.key === 'delay.wet');
    expect(sReverb?.resolvedValue).toBe(0.5); // Scene override
    expect(sReverb?.source).toBe('scene');
    expect(sDelay?.resolvedValue).toBe(0.15); // Inherited from preset
    expect(sDelay?.source).toBe('preset');

    // 3. Subscene level
    const subParams = resolveAllParameters({
      preset,
      scene,
      subscene: scene.subscenes[0],
      currentLevel: 'subscene',
    });
    const subDelay = subParams.find((r) => r.descriptor.key === 'delay.wet');
    const subReverb = subParams.find((r) => r.descriptor.key === 'reverb.wet');
    expect(subDelay?.resolvedValue).toBe(0.45); // Subscene override
    expect(subDelay?.source).toBe('subscene');
    expect(subReverb?.resolvedValue).toBe(0.5); // Inherited from scene
    expect(subReverb?.source).toBe('scene');
  });

  it('resets transport and cancels pending tasks on source change', async () => {
    const source1 = createMockSource('source-1', 48000, 5.0);
    (engine as any).setActiveSource(source1);

    const params = resolveAllParameters({
      preset: { id: 'p1', name: 'P1', parameters: {} },
      currentLevel: 'preset',
    });

    const pending = engine.requestRender({ id: 'preset:p1', label: 'P1' }, params);
    pending.catch(() => {});
    expect(engine.getStatus().state).toBe('rendering');

    // Change source to source 2
    const source2 = createMockSource('source-2', 48000, 8.0);
    (engine as any).loadReferenceSample = vi.fn();
    (engine as any).setActiveSource(source2);

    // Pending render from old source was superseded/cancelled
    await expect(pending).rejects.toThrow();
    expect(engine.getStatus().state).toBe('ready');
    expect(engine.getStatus().renderedFingerprint).toBeNull();
  });

  it('keeps a single transient playback AudioBuffer and never stores one on cache entries', async () => {
    const source = createMockSource('source-buffer', 48000, 5.0);
    (engine as any).setActiveSource(source);

    let createCount = 0;
    const ctx = (engine as any).audioCtx;
    const originalCreate = ctx.createBuffer.bind(ctx);
    ctx.createBuffer = (...args: any[]) => {
      createCount++;
      return originalCreate(...args);
    };

    const params = resolveAllParameters({
      preset: { id: 'p1', name: 'P1', parameters: { ReverbWet: 0.3 } },
      currentLevel: 'preset',
    });
    const promise = engine.requestRender({ id: 'preset:p1', label: 'P1' }, params);
    const task = mockWorker.messagesSent[0];
    (engine as any).handleRenderSuccess({
      taskId: task.taskId,
      cacheKey: task.cacheKey,
      contextFingerprint: task.contextFingerprint,
      left: new Float32Array(1200),
      right: new Float32Array(1200),
      duration: 1200 / 48000,
      tailDurationSeconds: 0,
      renderTimeMs: 6,
    });
    const rendered = await promise;

    expect('audioBuffer' in rendered).toBe(false);

    const first = (engine as any).getActiveBuffer();
    const second = (engine as any).getActiveBuffer();
    expect(first).toBe(second);
    expect(createCount).toBe(1);

    expect('audioBuffer' in renderCache.get(rendered.cacheKey)!).toBe(false);
  });
});
