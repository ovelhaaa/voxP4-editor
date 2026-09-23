import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EditorProvider } from '../src/state/EditorProvider';
import { VocalPreviewPanel } from '../src/components/preview/VocalPreviewPanel';

describe('Preview UX V2: panel surface', () => {
  beforeEach(() => {
    cleanup();
    // jsdom has no WebAudio; keep the engine quiet.
    (globalThis as any).AudioContext = undefined;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('surfaces the musical controls and removes DSP debug jargon from the primary view', () => {
    render(
      <EditorProvider>
        <VocalPreviewPanel />
      </EditorProvider>
    );

    expect(screen.getByText('PREVIEW')).toBeTruthy();
    expect(screen.getByText('Auto Preview')).toBeTruthy();
    expect(screen.getByText('Match Loudness')).toBeTruthy();
    expect(screen.getByText('Dry')).toBeTruthy();
    expect(screen.getByText('FX')).toBeTruthy();
    expect(screen.getByText('Short')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('Full Region')).toBeTruthy();

    // Technical/internal terms must not be on the primary surface.
    expect(screen.queryByText('WASM DSP')).toBeNull();
    expect(screen.queryByText('Render Stale')).toBeNull();
    expect(screen.queryByText('Rendering WASM...')).toBeNull();
    expect(screen.queryByText('P4Production')).toBeNull();
    expect(screen.queryByText(/fingerprint/i)).toBeNull();
  });
});
