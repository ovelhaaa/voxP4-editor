import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PreviewEngine } from '../src/audio/PreviewEngine';
import { renderCache } from '../src/audio/renderCache';
import { VocalAudioSource } from '../src/audio/types';
import { resolveAllParameters } from '../src/domain/resolution';

describe('Preview UX V2: Auto Preview debounce & identity', () => {
  let engine: PreviewEngine;
  let mockWorker: {
    postMessage: (msg: any) => void;
    onmessage: ((e: { data: any }) => void) | null;
    onerror: ((e: any) => void) | null;
    messagesSent: any[];
  };

  const createMockSource = (id = 'auto-source', sampleRate = 48000, duration = 12.0): VocalAudioSource => {
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

  const paramsFor = (wet: number) =>
    resolveAllParameters({
      preset: { id: 'p1', name: 'P1', parameters: { ReverbWet: wet } },
      currentLevel: 'preset',
    });

  beforeEach(() => {
    renderCache.clear();
    (globalThis as any).AudioContext = class MockAudioContext {
      sampleRate = 48000;
      currentTime = 0;
      state = 'running';
      destination = {};
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
    (engine as any).auditionRegion = null;
    (engine as any).auditionLengthMode = 'full';
    (engine as any).autoPreviewEnabled = false;
    (engine as any).loudnessMatchEnabled = false;
    (engine as any).pendingAutoFingerprint = null;
    (engine as any).dryMonitoringGain = 1;
    (engine as any).fxMonitoringGain = 1;
    if ((engine as any).autoPreviewTimer) {
      clearTimeout((engine as any).autoPreviewTimer);
      (engine as any).autoPreviewTimer = null;
    }
    (engine as any).listeners.clear();
    (engine as any).clockListeners.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    if ((engine as any).autoPreviewTimer) {
      clearTimeout((engine as any).autoPreviewTimer);
      (engine as any).autoPreviewTimer = null;
    }
  });

  it('coalesces rapid parameter changes into a single debounced render (last state wins)', () => {
    vi.useFakeTimers();
    engine.setAutoPreviewDelayMs(350);
    engine.setAutoPreview(true);
    (engine as any).setActiveSource(createMockSource());

    const ctx = { id: 'preset:p1', type: 'preset' as const, label: 'P1' };
    engine.updateRequestedContext(ctx, paramsFor(0.1));
    engine.updateRequestedContext(ctx, paramsFor(0.2));
    engine.updateRequestedContext(ctx, paramsFor(0.3));
    engine.updateRequestedContext(ctx, paramsFor(0.9));

    // Still inside the debounce window: nothing rendered yet.
    vi.advanceTimersByTime(300);
    expect(mockWorker.messagesSent.length).toBe(0);

    vi.advanceTimersByTime(60);
    expect(mockWorker.messagesSent.length).toBe(1);
    expect(mockWorker.messagesSent[0].type).toBe('RENDER');
    expect(mockWorker.messagesSent[0].parameters['reverb.wet']).toBeCloseTo(0.9, 4);
  });

  it('does not render for purely cosmetic changes (rename / context label)', () => {
    vi.useFakeTimers();
    engine.setAutoPreviewDelayMs(350);
    engine.setAutoPreview(true);
    (engine as any).setActiveSource(createMockSource());

    const params = paramsFor(0.4);
    engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'Warm Vocal' }, params);
    engine.updateRequestedContext(
      { id: 'preset:p1-renamed', type: 'preset', label: 'Warm Vocal Live' },
      params
    );

    vi.advanceTimersByTime(400);
    expect(mockWorker.messagesSent.length).toBe(1);

    // After the render, another purely cosmetic change must not schedule anything.
    vi.advanceTimersByTime(400);
    engine.updateRequestedContext(
      { id: 'preset:p1-renamed-again', type: 'preset', label: 'Even Warmer' },
      params
    );
    vi.advanceTimersByTime(400);
    expect(mockWorker.messagesSent.length).toBe(1);
  });

  it('does not schedule renders while Auto Preview is disabled', () => {
    vi.useFakeTimers();
    engine.setAutoPreviewDelayMs(350);
    engine.setAutoPreview(false);
    (engine as any).setActiveSource(createMockSource());

    const ctx = { id: 'preset:p1', type: 'preset' as const, label: 'P1' };
    engine.updateRequestedContext(ctx, paramsFor(0.2));
    engine.updateRequestedContext(ctx, paramsFor(0.8));

    vi.advanceTimersByTime(1000);
    expect(mockWorker.messagesSent.length).toBe(0);
  });

  it('exposes an Updating state while the debounce is pending', () => {
    vi.useFakeTimers();
    engine.setAutoPreviewDelayMs(350);
    engine.setAutoPreview(true);
    (engine as any).setActiveSource(createMockSource());

    engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'P1' }, paramsFor(0.5));
    expect(engine.getStatus().isAutoPreviewPending).toBe(true);
    expect(engine.getStatus().isUpdating).toBe(true);

    vi.advanceTimersByTime(400);
    expect(engine.getStatus().isAutoPreviewPending).toBe(false);
  });
});
