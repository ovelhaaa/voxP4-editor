import React from 'react';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { AuditionWaveform } from '../src/components/preview/AuditionWaveform';
import { AuditionRegion } from '../src/audio/types';

const WIDTH = 600;
const DURATION = 12;

describe('Preview UX V2: waveform draft vs committed region', () => {
  const originalClientWidth = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth'
  );
  const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeAll(() => {
    // jsdom has no 2D canvas; return null so the component skips drawing.
    HTMLCanvasElement.prototype.getContext = (() => null) as any;
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return WIDTH;
      },
    });
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        left: 0,
        top: 0,
        right: WIDTH,
        bottom: 64,
        width: WIDTH,
        height: 64,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect;
    };
  });

  afterAll(() => {
    if (originalClientWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalClientWidth);
    } else {
      delete (HTMLElement.prototype as any).clientWidth;
    }
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  beforeEach(() => {
    cleanup();
  });

  const renderWaveform = (region: AuditionRegion) => {
    const onSeek = vi.fn();
    const onRegionChange = vi.fn();
    const utils = render(
      <AuditionWaveform
        samples={new Float32Array(1200)}
        durationSeconds={DURATION}
        region={region}
        effectiveRegion={null}
        playheadSeconds={0}
        isPlaying={false}
        onSeek={onSeek}
        onRegionChange={onRegionChange}
      />
    );
    const container = utils.container.querySelector('div') as HTMLElement;

    // jsdom has no complete PointerEvent; dispatch a MouseEvent with the
    // pointer name so React's onPointer* handlers still receive clientX.
    const pointer = (type: string, clientX: number) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY: 0,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      fireEvent(container, event);
    };

    return { onSeek, onRegionChange, container, pointer };
  };

  it('does not commit the engine region while dragging, only once on pointer up', () => {
    const { onSeek, onRegionChange, pointer } = renderWaveform({
      startSeconds: 2,
      endSeconds: 8,
    });

    // Start a brand new selection outside the current region.
    pointer('pointerdown', 450);
    for (const clientX of [460, 470, 480, 490, 500]) {
      pointer('pointermove', clientX);
    }

    // Zero engine commits during the drag.
    expect(onRegionChange).not.toHaveBeenCalled();
    expect(onSeek).not.toHaveBeenCalled();

    pointer('pointerup', 500);

    // Exactly one commit on pointer up.
    expect(onRegionChange).toHaveBeenCalledTimes(1);
    const committed = onRegionChange.mock.calls[0][0] as AuditionRegion;
    expect(committed.startSeconds).toBeGreaterThan(8.5);
    expect(committed.endSeconds).toBeGreaterThanOrEqual(committed.startSeconds + 1);
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('treats a plain click outside the region as a seek, not a region commit', () => {
    const { onSeek, onRegionChange, pointer } = renderWaveform({
      startSeconds: 2,
      endSeconds: 8,
    });

    pointer('pointerdown', 450);
    pointer('pointerup', 450);

    expect(onSeek).toHaveBeenCalledTimes(1);
    expect(onSeek.mock.calls[0][0]).toBeCloseTo(9.0, 1);
    expect(onRegionChange).not.toHaveBeenCalled();
  });

  it('commits once when dragging an existing region', () => {
    const { onRegionChange, pointer } = renderWaveform({
      startSeconds: 2,
      endSeconds: 8,
    });

    // Press inside the region (x for 5 s) and drag to the right.
    pointer('pointerdown', 250);
    for (const clientX of [260, 270, 280, 290]) {
      pointer('pointermove', clientX);
    }
    expect(onRegionChange).not.toHaveBeenCalled();

    pointer('pointerup', 290);
    expect(onRegionChange).toHaveBeenCalledTimes(1);

    const committed = onRegionChange.mock.calls[0][0] as AuditionRegion;
    // Length preserved, moved right by ~0.8 s.
    expect(committed.endSeconds - committed.startSeconds).toBeCloseTo(6, 1);
    expect(committed.startSeconds).toBeGreaterThan(2);
  });
});
