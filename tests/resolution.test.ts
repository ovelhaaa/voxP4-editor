import { describe, it, expect } from 'vitest';
import { resolveParameterState } from '../src/domain/resolution';
import { Preset, Scene, Subscene } from '../src/domain/models';

describe('Parameter Inheritance and State Resolution', () => {
  const preset: Preset = {
    id: 'p1',
    name: 'Test Preset',
    parameters: {
      ReverbWet: 0.2,
      DelayEnable: false,
    },
  };

  const scene: Scene = {
    id: 's1',
    name: 'Test Scene',
    basePresetId: 'p1',
    parameters: {
      TempoBpm: 95,
      // ReverbWet is not defined at scene level -> inherits preset
    },
    subscenes: [],
  };

  const subscene: Subscene = {
    id: 'sub1',
    name: 'Chorus',
    parameters: {
      ReverbWet: 0.35, // Overrides preset ReverbWet
      DelayEnable: true, // Overrides preset DelayEnable
    },
  };

  it('resolves default value when no layer specifies the parameter', () => {
    const res = resolveParameterState({
      name: 'GateThresholdDb',
      preset,
      scene,
      subscene,
      currentLevel: 'subscene',
    });

    expect(res.resolvedValue).toBe(-55); // Default in contract
    expect(res.source).toBe('default');
    expect(res.isOverriddenHere).toBe(false);
  });

  it('resolves preset value when preset defines it and scene/subscene do not', () => {
    const resScene = resolveParameterState({
      name: 'ReverbWet',
      preset,
      scene,
      currentLevel: 'scene',
    });

    expect(resScene.resolvedValue).toBe(0.2);
    expect(resScene.source).toBe('preset');
    expect(resScene.isOverriddenHere).toBe(false);
    expect(resScene.inheritedValue).toBe(0.2);
  });

  it('resolves scene value when scene overrides preset', () => {
    const res = resolveParameterState({
      name: 'TempoBpm',
      preset,
      scene,
      subscene,
      currentLevel: 'subscene',
    });

    expect(res.resolvedValue).toBe(95);
    expect(res.source).toBe('scene');
    expect(res.isOverriddenHere).toBe(false);
    expect(res.inheritedValue).toBe(95);
  });

  it('resolves subscene value when subscene overrides scene and preset', () => {
    const res = resolveParameterState({
      name: 'ReverbWet',
      preset,
      scene,
      subscene,
      currentLevel: 'subscene',
    });

    expect(res.resolvedValue).toBe(0.35);
    expect(res.source).toBe('subscene');
    expect(res.isOverriddenHere).toBe(true);
    expect(res.inheritedValue).toBe(0.2); // what it was before subscene override
    expect(res.presetValue).toBe(0.2);
    expect(res.subsceneValue).toBe(0.35);
  });

  it('reflects override removal immediately', () => {
    // Simulate removing subscene override
    const subsceneWithoutOverride: Subscene = {
      ...subscene,
      parameters: {
        DelayEnable: true,
      },
    };

    const res = resolveParameterState({
      name: 'ReverbWet',
      preset,
      scene,
      subscene: subsceneWithoutOverride,
      currentLevel: 'subscene',
    });

    expect(res.resolvedValue).toBe(0.2);
    expect(res.source).toBe('preset');
    expect(res.isOverriddenHere).toBe(false);
  });
});
