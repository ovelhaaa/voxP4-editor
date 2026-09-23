import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PreviewEngine } from '../src/audio/PreviewEngine';
import { VocalAudioSource } from '../src/audio/types';

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
});
