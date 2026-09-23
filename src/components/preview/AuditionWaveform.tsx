import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuditionRegion, EffectiveSourceRegion } from '../../audio/types';
import { clampRegion } from '../../audio/auditionRegion';
import { computeWaveformEnvelope, DEFAULT_WAVEFORM_BUCKETS } from '../../audio/waveform';

interface AuditionWaveformProps {
  samples: Float32Array;
  durationSeconds: number;
  region: AuditionRegion | null;
  effectiveRegion: EffectiveSourceRegion | null;
  playheadSeconds: number;
  isPlaying: boolean;
  onSeek: (sourceSeconds: number) => void;
  onRegionChange: (region: AuditionRegion) => void;
}

type DragMode = 'start' | 'end' | 'move' | 'select' | null;

const HANDLE_HIT_PX = 8;
const CLICK_SLOP_PX = 4;

export const AuditionWaveform: React.FC<AuditionWaveformProps> = ({
  samples,
  durationSeconds,
  region,
  effectiveRegion,
  playheadSeconds,
  isPlaying,
  onSeek,
  onRegionChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [width, setWidth] = useState(0);

  // During a drag we only move this local "draft" region; the committed region
  // reaches the engine exactly once, on pointer up. This prevents a crossfade
  // storm while scrubbing the region.
  const [draftRegion, setDraftRegion] = useState<AuditionRegion | null>(null);
  const draftRegionRef = useRef<AuditionRegion | null>(null);

  const duration = durationSeconds > 0 ? durationSeconds : 0;
  const displayRegion = draftRegion ?? region;

  // `samples` can be a subarray/view; identity is stable per decoded source.
  const envelope = useMemo(
    () => computeWaveformEnvelope(samples, DEFAULT_WAVEFORM_BUCKETS),
    [samples]
  );

  // Track container width for responsive, crisp rendering.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth || 0);
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const secondsToX = useCallback(
    (seconds: number) => (duration > 0 ? (seconds / duration) * width : 0),
    [duration, width]
  );

  const xToSeconds = useCallback(
    (x: number) => (width > 0 ? Math.max(0, Math.min(duration, (x / width) * duration)) : 0),
    [duration, width]
  );

  // Redraw the static waveform + region highlight only when its inputs change.
  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas || width <= 0 || duration <= 0) return;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const height = canvas.clientHeight || 64;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const mid = height / 2;
    const amp = height * 0.42;

    // Region shading (draft region while dragging, committed region otherwise)
    if (displayRegion) {
      const x0 = secondsToX(displayRegion.startSeconds);
      const x1 = secondsToX(displayRegion.endSeconds);
      ctx.fillStyle = 'rgba(244, 81, 38, 0.10)';
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height);
      ctx.fillStyle = 'rgba(244, 81, 38, 0.55)';
      ctx.fillRect(x0, 0, 1.5, height);
      ctx.fillRect(x1 - 1.5, 0, 1.5, height);
    }

    // Effective (quick audition) window
    if (effectiveRegion) {
      const ex0 = secondsToX(effectiveRegion.startSeconds);
      const ex1 = secondsToX(
        effectiveRegion.startSeconds + effectiveRegion.durationSeconds
      );
      ctx.fillStyle = 'rgba(32, 214, 199, 0.12)';
      ctx.fillRect(ex0, 0, Math.max(1, ex1 - ex0), height);
    }

    // Waveform envelope
    ctx.fillStyle = '#4A4B55';
    const buckets = envelope.bucketCount;
    for (let i = 0; i < buckets; i++) {
      const x = (i / buckets) * width;
      const min = envelope.min[i];
      const max = envelope.max[i];
      const y0 = mid - max * amp;
      const y1 = mid - min * amp;
      ctx.fillRect(x, y0, Math.max(1, width / buckets), Math.max(1, y1 - y0));
    }

    // Center line
    ctx.fillStyle = 'rgba(113, 110, 105, 0.35)';
    ctx.fillRect(0, mid, width, 1);

    // Handles
    if (displayRegion) {
      ctx.fillStyle = '#F45126';
      const hx0 = secondsToX(displayRegion.startSeconds);
      const hx1 = secondsToX(displayRegion.endSeconds);
      ctx.fillRect(hx0 - 1, 0, 3, height);
      ctx.fillRect(hx1 - 2, 0, 3, height);
    }
  }, [width, duration, displayRegion, effectiveRegion, envelope, secondsToX]);

  // Redraw only the playhead on the overlay canvas (cheap, high frequency).
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || width <= 0 || duration <= 0) return;
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const height = canvas.clientHeight || 64;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const x = secondsToX(playheadSeconds);
    ctx.fillStyle = '#F0EDE5';
    ctx.fillRect(x - 1, 0, 2, height);
    ctx.beginPath();
    ctx.arc(x, 2.5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }, [width, duration, playheadSeconds, secondsToX, isPlaying]);

  // Pointer interaction state
  const dragRef = useRef<{
    mode: DragMode;
    anchorSeconds: number;
    startX: number;
    moved: boolean;
    baseRegion: AuditionRegion;
  } | null>(null);

  const getLocalX = (clientX: number): number => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return clientX - rect.left;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (duration <= 0 || width <= 0) return;
    const x = getLocalX(e.clientX);
    const seconds = xToSeconds(x);
    const activeRegion = region
      ? clampRegion(region, duration)
      : { startSeconds: 0, endSeconds: duration };

    const startX = secondsToX(activeRegion.startSeconds);
    const endX = secondsToX(activeRegion.endSeconds);

    let mode: DragMode;
    if (Math.abs(x - startX) <= HANDLE_HIT_PX) mode = 'start';
    else if (Math.abs(x - endX) <= HANDLE_HIT_PX) mode = 'end';
    else if (x > startX && x < endX) mode = 'move';
    else mode = 'select';

    dragRef.current = {
      mode,
      anchorSeconds: seconds,
      startX: x,
      moved: false,
      baseRegion: activeRegion,
    };

    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };

  const updateDraft = (next: AuditionRegion) => {
    draftRegionRef.current = next;
    setDraftRegion(next);
  };

  const clearDraft = () => {
    draftRegionRef.current = null;
    setDraftRegion(null);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const x = getLocalX(e.clientX);
    if (Math.abs(x - drag.startX) > CLICK_SLOP_PX) drag.moved = true;

    const seconds = xToSeconds(x);

    // Only the local visual region is updated during the drag.
    if (drag.mode === 'start') {
      updateDraft(
        clampRegion(
          {
            startSeconds: Math.min(seconds, drag.baseRegion.endSeconds),
            endSeconds: drag.baseRegion.endSeconds,
          },
          duration
        )
      );
    } else if (drag.mode === 'end') {
      updateDraft(
        clampRegion(
          {
            startSeconds: drag.baseRegion.startSeconds,
            endSeconds: Math.max(seconds, drag.baseRegion.startSeconds),
          },
          duration
        )
      );
    } else if (drag.mode === 'move') {
      const length = drag.baseRegion.endSeconds - drag.baseRegion.startSeconds;
      const delta = seconds - drag.anchorSeconds;
      let start = drag.baseRegion.startSeconds + delta;
      start = Math.max(0, Math.min(duration - length, start));
      updateDraft({ startSeconds: start, endSeconds: start + length });
    } else if (drag.mode === 'select') {
      updateDraft(
        clampRegion({ startSeconds: drag.anchorSeconds, endSeconds: seconds }, duration)
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    (e.target as Element).releasePointerCapture?.(e.pointerId);

    // A plain click repositions the playhead; a drag commits the new region once.
    if (drag.mode === 'select' && !drag.moved) {
      clearDraft();
      onSeek(drag.anchorSeconds);
      return;
    }

    const committed = draftRegionRef.current;
    clearDraft();
    if (committed) {
      onRegionChange(committed);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    dragRef.current = null;
    clearDraft();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-16 bg-[#0C0D12] border border-[#292A30] rounded-[4px] overflow-hidden cursor-crosshair select-none touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      role="slider"
      aria-label="Audition waveform"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 10) / 10}
      aria-valuenow={Math.round(playheadSeconds * 10) / 10}
    >
      <canvas ref={baseCanvasRef} className="absolute inset-0 w-full h-full" />
      <canvas ref={overlayCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
};
