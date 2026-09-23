import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PreviewEngine } from '../src/audio/PreviewEngine';
import { VocalAudioSource } from '../src/audio/types';
import { resolveAllParameters } from '../src/domain/resolution';

const fadeAutomations = (gain: any): number =>
  gain.gain.setValueCurveAtTime.mock.calls.length +
  gain.gain.linearRampToValueAtTime.mock.calls.length;

const lastCurveStart = (gain: any): number | null => {
  const calls = gain.gain.setValueCurveAtTime.mock.calls;
  if (calls.length === 0) return null;
  return calls[calls.length - 1][0][0];
};

describe('Preview UX V2: Crossfade transport', () => {
  let engine: PreviewEngine;
  let sources: any[];
  let gains: any[];
  let ctx: any;

  const createMockSource = (duration = 5.0): VocalAudioSource => ({
    id: 'xfade-source',
    name: 'Source',
    type: 'reference',
    duration,
    sampleRate: 48000,
    samples: new Float32Array(Math.round(duration * 48000)).fill(0.2),
  });

  beforeEach(() => {
    class MockGain {
      gain = {
        value: 0,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        setValueCurveAtTime: vi.fn(),
        cancelScheduledValues: vi.fn(),
      };
      connect = vi.fn();
      disconnect = vi.fn();
    }

    sources = [];
    gains = [];

    ctx = {
      sampleRate: 48000,
      currentTime: 0,
      state: 'running',
      destination: {},
      createBuffer: (channels: number, length: number, sampleRate: number) => {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return {
          numberOfChannels: channels,
          length,
          sampleRate,
          duration: length / sampleRate,
          getChannelData: (c: number) => data[c],
          copyToChannel: (src: Float32Array, c: number) => data[c].set(src),
        };
      },
      createGain: () => {
        const g = new MockGain();
        gains.push(g);
        return g;
      },
      createBufferSource: () => {
        const started: number[] = [];
        const node: any = {
          buffer: null,
          loop: false,
          onended: null,
          started,
          stopped: false,
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: (_when: number, offset: number) => started.push(offset),
          stop: () => {
            node.stopped = true;
          },
        };
        sources.push(node);
        return node;
      },
      resume: async () => {},
    };

    (globalThis as any).AudioContext = class {
      constructor() {
        return ctx;
      }
    };

    engine = PreviewEngine.getInstance();
    (engine as any).worker = { postMessage: vi.fn(), onmessage: null, onerror: null };
    (engine as any).audioCtx = ctx;
    (engine as any).currentTask = null;
    (engine as any).activeSource = null;
    (engine as any).renderedAudio = null;
    (engine as any).isPlaying = false;
    (engine as any).auditionMode = 'processed';
    (engine as any).activePlaybackBuffer = null;
    (engine as any).activePlaybackFingerprint = null;
    (engine as any).currentSourceNode = null;
    (engine as any).currentGainNode = null;
    (engine as any).currentTargetGain = 0;
    (engine as any).pendingAutoFingerprint = null;
    (engine as any).autoPreviewEnabled = false;
    (engine as any).loudnessMatchEnabled = false;
    (engine as any).listeners.clear();
    (engine as any).clockListeners.clear();

    (engine as any).setActiveSource(createMockSource(5.0));
    (engine as any).renderedAudio = {
      sourceId: 'xfade-source',
      cacheKey: 'k',
      fingerprint: 'fp',
      duration: 6.0,
      tailDurationSeconds: 1.0,
      sampleRate: 48000,
      left: new Float32Array(6 * 48000),
      right: new Float32Array(6 * 48000),
      renderTimeMs: 10,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      engine.stop();
    } catch {}
  });

  it('crossfades Dry <-> FX while preserving the audition clock position', () => {
    vi.useFakeTimers();
    engine.play();
    expect(sources.length).toBe(1);
    expect(sources[0].started[0]).toBeCloseTo(0, 5);

    // Advance the audition clock by 2 s.
    ctx.currentTime = 2.0;
    engine.setAuditionMode('dry');

    // A second voice was started at ~the same position (no restart from 0).
    expect(sources.length).toBe(2);
    expect(sources[1].started[0]).toBeCloseTo(2.0, 2);

    // The outgoing voice is faded out (equal-power curve or linear ramp), not hard-cut.
    const oldGain = gains[0];
    const fadeAutomations =
      oldGain.gain.setValueCurveAtTime.mock.calls.length +
      oldGain.gain.linearRampToValueAtTime.mock.calls.length;
    expect(fadeAutomations).toBeGreaterThan(0);

    // After the fade window the old node is released.
    vi.advanceTimersByTime(200);
    expect(sources[0].stopped).toBe(true);
    expect(sources[1].stopped).toBe(false);
  });

  it('keeps the current position when switching back to FX', () => {
    vi.useFakeTimers();
    engine.play();
    ctx.currentTime = 1.25;
    engine.setAuditionMode('dry');
    ctx.currentTime = 3.5;
    engine.setAuditionMode('processed');

    const lastStarted = sources[sources.length - 1].started[0];
    expect(lastStarted).toBeCloseTo(3.5, 2);
    // The FX buffer allows the full processed duration.
    expect(engine.getPlaybackDuration()).toBeCloseTo(6.0, 5);
  });

  it('crossfades to the rebuilt dry buffer when the region changes during Dry playback', () => {
    vi.useFakeTimers();
    engine.setAuditionMode('dry');
    engine.play(); // voice 0 plays dry region [0, 5]
    expect(sources.length).toBe(1);
    expect(engine.getPlaybackDuration()).toBeCloseTo(5.0, 5);

    ctx.currentTime = 2.0;
    engine.setAuditionRegion({ startSeconds: 1, endSeconds: 4 }); // new dry region (3 s)

    // A new voice starts from a coherent offset into the rebuilt region.
    expect(sources.length).toBe(2);
    expect(sources[1].started[0]).toBeCloseTo(2.0, 2);
    expect(engine.getPlaybackDuration()).toBeCloseTo(3.0, 5);

    // The old voice is faded, not hard-cut, and released only after the fade.
    expect(fadeAutomations(gains[0])).toBeGreaterThan(0);
    expect(sources[0].stopped).toBe(false);
    vi.advanceTimersByTime(200);
    expect(sources[0].stopped).toBe(true);
    expect(sources[1].stopped).toBe(false);
  });

  it('crossfades every transition in an FX -> Dry -> FX sequence without premature hard cuts', () => {
    vi.useFakeTimers();
    engine.play(); // voice 0 (FX/processed)
    ctx.currentTime = 1.0;
    engine.setAuditionMode('dry'); // voice 1
    ctx.currentTime = 2.0;
    engine.setAuditionMode('processed'); // voice 2

    expect(sources.length).toBe(3);
    expect(sources[1].started[0]).toBeCloseTo(1.0, 2);
    expect(sources[2].started[0]).toBeCloseTo(2.0, 2);

    // Both transitions used a fade and neither previous voice was hard-cut yet.
    expect(fadeAutomations(gains[0])).toBeGreaterThan(0);
    expect(fadeAutomations(gains[1])).toBeGreaterThan(0);
    expect(sources[0].stopped).toBe(false);
    expect(sources[1].stopped).toBe(false);

    vi.advanceTimersByTime(200);
    expect(sources[0].stopped).toBe(true);
    expect(sources[1].stopped).toBe(true);
    expect(sources[2].stopped).toBe(false);
  });

  it('crossfades consecutive rendered versions A -> B -> C', async () => {
    vi.useFakeTimers();
    const contextOptions = { id: 'preset:p1', type: 'preset' as const, label: 'P1' };
    const paramsFor = (wet: number) =>
      resolveAllParameters({
        preset: { id: 'p1', name: 'P1', parameters: { ReverbWet: wet } },
        currentLevel: 'preset',
      });

    const renderVersion = async (wet: number): Promise<void> => {
      const params = paramsFor(wet);
      engine.updateRequestedContext(contextOptions, params);
      const promise = engine.requestRender(contextOptions, params);
      promise.catch(() => {});
      const task = (engine as any).currentTask;
      (engine as any).handleRenderSuccess({
        taskId: task.taskId,
        cacheKey: task.cacheKey,
        contextFingerprint: task.contextFingerprint,
        left: new Float32Array(6 * 48000),
        right: new Float32Array(6 * 48000),
        duration: 6.0,
        tailDurationSeconds: 0,
        renderTimeMs: 5,
      });
      await promise;
    };

    await renderVersion(0.2); // A
    engine.play(); // voice 0 plays A
    ctx.currentTime = 1.0;
    await renderVersion(0.5); // B replaces A -> voice 1
    ctx.currentTime = 2.0;
    await renderVersion(0.8); // C replaces B -> voice 2

    expect(sources.length).toBe(3);
    expect(sources[1].started[0]).toBeCloseTo(1.0, 2);
    expect(sources[2].started[0]).toBeCloseTo(2.0, 2);

    // A -> B and B -> C each crossfaded; no premature hard cuts.
    expect(fadeAutomations(gains[0])).toBeGreaterThan(0);
    expect(fadeAutomations(gains[1])).toBeGreaterThan(0);
    expect(sources[0].stopped).toBe(false);
    expect(sources[1].stopped).toBe(false);

    vi.advanceTimersByTime(200);
    expect(sources[0].stopped).toBe(true);
    expect(sources[1].stopped).toBe(true);
    expect(sources[2].stopped).toBe(false);
  });

  it('fades out from the tracked nominal gain (loudness match), not AudioParam.value', () => {
    vi.useFakeTimers();

    // Dry is loud (0.2), processed is quiet (0.05) -> +6 dB FX monitoring gain.
    (engine as any).renderedAudio = {
      sourceId: 'xfade-source',
      cacheKey: 'k2',
      fingerprint: 'fp2',
      duration: 6.0,
      tailDurationSeconds: 0,
      sampleRate: 48000,
      left: new Float32Array(6 * 48000).fill(0.05),
      right: new Float32Array(6 * 48000).fill(0.05),
      renderTimeMs: 10,
    };
    engine.setLoudnessMatch(true);
    const fxGain = engine.getStatus().fxMonitoringGain;
    expect(fxGain).toBeGreaterThan(1.5);

    // Start on Dry, then crossfade to FX so voice 1 is created WITH a fade-in
    // automation. Its AudioParam.value therefore stays 0 while it is audibly
    // playing at fxGain.
    engine.setAuditionMode('dry');
    engine.play(); // voice 0 (Dry)
    ctx.currentTime = 0.5;
    engine.setAuditionMode('processed'); // voice 1 (FX, fade-in, targetGain = fxGain)
    expect(gains[1].gain.value).toBe(0);

    // Crossfade back to Dry. The old FX voice must fade out from its nominal
    // targetGain, not from the unusable 0.
    ctx.currentTime = 1.0;
    engine.setAuditionMode('dry');

    const fadeOutStart = lastCurveStart(gains[1]);
    expect(fadeOutStart).not.toBeNull();
    expect(fadeOutStart!).toBeCloseTo(fxGain, 3);
  });
});
