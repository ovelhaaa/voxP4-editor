import { Preset, Scene } from './models';
import { resolveParameterState } from './resolution';

export interface ResolvedMusicalAttributes {
  tempo: number;
  key: string;
  scale: string;
  isTempoOverridden: boolean;
  isKeyOverridden: boolean;
  isScaleOverridden: boolean;
}

/**
 * Resolves canonical musical attributes (TempoBpm, HarmonyKey, HarmonyScale)
 * for a Song (Scene) through the inheritance chain:
 * Firmware Default -> Base Sound (Preset) -> Song (Scene)
 */
export function resolveSongMusicalAttributes(
  scene?: Scene,
  preset?: Preset
): ResolvedMusicalAttributes {
  const resolvedTempoState = resolveParameterState({
    name: 'TempoBpm',
    preset,
    scene,
    currentLevel: 'scene',
  });

  const resolvedKeyState = resolveParameterState({
    name: 'HarmonyKey',
    preset,
    scene,
    currentLevel: 'scene',
  });

  const resolvedScaleState = resolveParameterState({
    name: 'HarmonyScale',
    preset,
    scene,
    currentLevel: 'scene',
  });

  return {
    tempo: typeof resolvedTempoState.resolvedValue === 'number'
      ? resolvedTempoState.resolvedValue
      : 120,
    key: String(resolvedKeyState.resolvedValue ?? 'C'),
    scale: String(resolvedScaleState.resolvedValue ?? 'Major'),
    isTempoOverridden: resolvedTempoState.isOverriddenHere,
    isKeyOverridden: resolvedKeyState.isOverriddenHere,
    isScaleOverridden: resolvedScaleState.isOverriddenHere,
  };
}
