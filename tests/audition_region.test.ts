import { describe, it, expect, beforeEach } from 'vitest';
import { PreviewEngine } from '../src/audio/PreviewEngine';
import { renderCache } from '../src/audio/renderCache';
import { VocalAudioSource } from '../src/audio/types';
import { resolveAllParameters } from '../src/domain/resolution';
import {
  QUICK_AUDITION_SECONDS,
  clampRegion,
  defaultAuditionRegion,
  resolveSourceRegion,
} from '../src/audio/auditionRegion';

describe('Preview UX V2: Audition Region & Quick Audition', () => {
  describe('pure region resolution', () => {
    it('defaults to the first 20 s and clamps to the source duration', () => {
      expect(defaultAuditionRegion(12)).toEqual({ startSeconds: 0, endSeconds: 12 });
      expect(defaultAuditionRegion(45)).toEqual({ startSeconds: 0, endSeconds: 20 });
      expect(defaultAuditionRegion(0)).toEqual({ startSeconds: 0, endSeconds: 0 });
    });

    it('clamps, orders and enforces a minimum window', () => {
      const clamped = clampRegion({ startSeconds: 5, endSeconds: 3 }, 10);
      expect(clamped.startSeconds).toBeLessThan(clamped.endSeconds);
      expect(clamped.startSeconds).toBeGreaterThanOrEqual(0);
      expect(clamped.endSeconds).toBeLessThanOrEqual(10);

      const tiny = clampRegion({ startSeconds: 1, endSeconds: 1.1 }, 10);
      expect(tiny.endSeconds - tiny.startSeconds).toBeGreaterThanOrEqual(1.0 - 1e-9);
    });

    it('caps the explicit selection at the practical maximum', () => {
      const wide = clampRegion({ startSeconds: 0, endSeconds: 60 }, 120);
      expect(wide.endSeconds - wide.startSeconds).toBeCloseTo(20, 6);
    });

    it('applies Quick Audition lengths to the source, never exceeding the selection', () => {
      const region = { startSeconds: 2, endSeconds: 18 };
      const short = resolveSourceRegion({
        region,
        mode: 'short',
        sampleRate: 48000,
        totalFrames: 18 * 48000,
      });
      expect(short.startFrame).toBe(2 * 48000);
      expect(short.durationSeconds).toBeCloseTo(QUICK_AUDITION_SECONDS.short, 4);

      const medium = resolveSourceRegion({
        region,
        mode: 'medium',
        sampleRate: 48000,
        totalFrames: 18 * 48000,
      });
      expect(medium.durationSeconds).toBeCloseTo(QUICK_AUDITION_SECONDS.medium, 4);

      const full = resolveSourceRegion({
        region,
        mode: 'full',
        sampleRate: 48000,
        totalFrames: 18 * 48000,
      });
      expect(full.durationSeconds).toBeCloseTo(16, 4);
    });

    it('never selects frames beyond the source', () => {
      const resolved = resolveSourceRegion({
        region: { startSeconds: 5, endSeconds: 30 },
        mode: 'full',
        sampleRate: 48000,
        totalFrames: 10 * 48000,
      });
      expect(resolved.startFrame + resolved.frameCount).toBeLessThanOrEqual(10 * 48000);
    });
  });

  describe('engine integration', () => {
    let engine: PreviewEngine;
    let mockWorker: { postMessage: (msg: any) => void; messagesSent: any[]; onmessage: any; onerror: any };

    const createMockSource = (id = 'region-source', duration = 12.0): VocalAudioSource => ({
      id,
      name: `Source ${id}`,
      type: 'reference',
      duration,
      sampleRate: 48000,
      samples: new Float32Array(Math.round(duration * 48000)).fill(0.1),
    });

    const params = resolveAllParameters({
      preset: { id: 'p1', name: 'P1', parameters: { ReverbWet: 0.3 } },
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
          return { buffer: null, loop: false, connect: () => {}, disconnect: () => {}, start: () => {}, stop: () => {}, onended: null };
        }
        resume = async () => {};
      };

      mockWorker = {
        messagesSent: [],
        onmessage: null,
        onerror: null,
        postMessage: (msg: any) => mockWorker.messagesSent.push(msg),
      };

      engine = PreviewEngine.getInstance();
      (engine as any).worker = mockWorker;
      (engine as any).audioCtx = new (globalThis as any).AudioContext();
      (engine as any).currentTask = null;
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
      (engine as any).pendingAutoFingerprint = null;
      if ((engine as any).autoPreviewTimer) {
        clearTimeout((engine as any).autoPreviewTimer);
        (engine as any).autoPreviewTimer = null;
      }
      (engine as any).activeSource = null;
      (engine as any).setActiveSource(createMockSource());
    });

    it('includes the source region in the render fingerprint', () => {
      engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'P1' }, params);
      engine.setAuditionRegion({ startSeconds: 0, endSeconds: 12 });
      const fpA = engine.computeCurrentFingerprint();

      engine.setAuditionRegion({ startSeconds: 3, endSeconds: 8 });
      const fpB = engine.computeCurrentFingerprint();

      expect(fpA).not.toBeNull();
      expect(fpB).not.toBeNull();
      expect(fpA).not.toBe(fpB);
    });

    it('processes only the selected source region while preserving the DSP tail', async () => {
      engine.setAuditionRegion({ startSeconds: 2, endSeconds: 4 }); // 2 s source
      engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'P1' }, params);

      const promise = engine.requestRender({ id: 'preset:p1', type: 'preset', label: 'P1' }, params);
      const renderMsg = mockWorker.messagesSent[0];
      expect(renderMsg.input.length).toBe(2 * 48000);

      const tailFrames = Math.round(0.5 * 48000);
      (engine as any).handleRenderSuccess({
        taskId: renderMsg.taskId,
        cacheKey: renderMsg.cacheKey,
        contextFingerprint: renderMsg.contextFingerprint,
        left: new Float32Array(renderMsg.input.length + tailFrames),
        right: new Float32Array(renderMsg.input.length + tailFrames),
        duration: (renderMsg.input.length + tailFrames) / 48000,
        tailDurationSeconds: tailFrames / 48000,
        renderTimeMs: 12,
      });

      const rendered = await promise;
      expect(rendered).toBeDefined();
      // rendered = selected source region (2 s) + tail (0.5 s)
      expect(rendered!.duration).toBeCloseTo(2.5, 4);
      expect(rendered!.tailDurationSeconds).toBeCloseTo(0.5, 4);
    });

    it('never reuses PCM across different source regions (cache identity)', async () => {
      engine.setAuditionRegion({ startSeconds: 0, endSeconds: 4 });
      engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'P1' }, params);
      const first = engine.requestRender({ id: 'preset:p1', type: 'preset', label: 'P1' }, params);
      const msg1 = mockWorker.messagesSent[0];
      (engine as any).handleRenderSuccess({
        taskId: msg1.taskId,
        cacheKey: msg1.cacheKey,
        contextFingerprint: msg1.contextFingerprint,
        left: new Float32Array(msg1.input.length),
        right: new Float32Array(msg1.input.length),
        duration: msg1.input.length / 48000,
        tailDurationSeconds: 0,
        renderTimeMs: 5,
      });
      await first;
      expect(mockWorker.messagesSent.length).toBe(1);

      // Same parameters, different region -> a new render must be requested.
      engine.setAuditionRegion({ startSeconds: 5, endSeconds: 9 });
      const second = engine.requestRender({ id: 'preset:p1', type: 'preset', label: 'P1' }, params);
      expect(mockWorker.messagesSent.length).toBe(2);
      const msg2 = mockWorker.messagesSent[1];
      (engine as any).handleRenderSuccess({
        taskId: msg2.taskId,
        cacheKey: msg2.cacheKey,
        contextFingerprint: msg2.contextFingerprint,
        left: new Float32Array(msg2.input.length),
        right: new Float32Array(msg2.input.length),
        duration: msg2.input.length / 48000,
        tailDurationSeconds: 0,
        renderTimeMs: 5,
      });
      await second;
    });

    it('caps the rendered source with Quick Audition while keeping the tail intact', async () => {
      engine.setAuditionLengthMode('short');
      const region = engine.getEffectiveRegion();
      expect(region?.durationSeconds).toBeCloseTo(QUICK_AUDITION_SECONDS.short, 4);

      engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'P1' }, params);
      const promise = engine.requestRender({ id: 'preset:p1', type: 'preset', label: 'P1' }, params);
      const renderMsg = mockWorker.messagesSent[0];
      expect(renderMsg.input.length).toBe(QUICK_AUDITION_SECONDS.short * 48000);

      const tailFrames = Math.round(2.0 * 48000);
      (engine as any).handleRenderSuccess({
        taskId: renderMsg.taskId,
        cacheKey: renderMsg.cacheKey,
        contextFingerprint: renderMsg.contextFingerprint,
        left: new Float32Array(renderMsg.input.length + tailFrames),
        right: new Float32Array(renderMsg.input.length + tailFrames),
        duration: (renderMsg.input.length + tailFrames) / 48000,
        tailDurationSeconds: tailFrames / 48000,
        renderTimeMs: 8,
      });

      const rendered = await promise;
      expect(rendered!.duration).toBeCloseTo(QUICK_AUDITION_SECONDS.short + 2.0, 4);
    });

    it('does not trigger a DSP render when toggling Dry/FX', async () => {
      engine.updateRequestedContext({ id: 'preset:p1', type: 'preset', label: 'P1' }, params);
      const promise = engine.requestRender({ id: 'preset:p1', type: 'preset', label: 'P1' }, params);
      const msg = mockWorker.messagesSent[0];
      (engine as any).handleRenderSuccess({
        taskId: msg.taskId,
        cacheKey: msg.cacheKey,
        contextFingerprint: msg.contextFingerprint,
        left: new Float32Array(msg.input.length),
        right: new Float32Array(msg.input.length),
        duration: msg.input.length / 48000,
        tailDurationSeconds: 0,
        renderTimeMs: 5,
      });
      await promise;
      const rendersBefore = mockWorker.messagesSent.length;

      engine.setAuditionMode('dry');
      expect(mockWorker.messagesSent.length).toBe(rendersBefore);
      engine.setAuditionMode('processed');
      expect(mockWorker.messagesSent.length).toBe(rendersBefore);
    });
  });
});
