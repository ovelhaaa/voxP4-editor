import { catalog, ParameterDescriptor } from './catalog';
import { ParameterValue, Preset, Scene, Subscene } from './models';

export type ParameterSource = 'default' | 'preset' | 'scene' | 'subscene';

export interface ResolvedParameterState {
  readonly descriptor: ParameterDescriptor;
  readonly name: string;
  readonly resolvedValue: ParameterValue;
  readonly source: ParameterSource;
  readonly isOverriddenHere: boolean;
  readonly inheritedValue: ParameterValue;
  readonly defaultValue: ParameterValue;
  readonly presetValue?: ParameterValue;
  readonly sceneValue?: ParameterValue;
  readonly subsceneValue?: ParameterValue;
}

export interface ResolveParameterOptions {
  readonly name: string;
  readonly preset?: Preset;
  readonly scene?: Scene;
  readonly subscene?: Subscene;
  readonly currentLevel: 'preset' | 'scene' | 'subscene';
}

/**
 * Resolves the effective value and full inheritance chain for a single parameter.
 * Hierarchy:
 *   Firmware Default
 *         ↓
 *      Preset
 *         ↓
 *       Scene
 *         ↓
 *     Subscene
 *         ↓
 *   Resolved Value
 */
export function resolveParameterState(options: ResolveParameterOptions): ResolvedParameterState {
  const { name, preset, scene, subscene, currentLevel } = options;
  const descriptor = catalog.getParameter(name);
  if (!descriptor) {
    throw new Error(`Cannot resolve unknown parameter '${name}'`);
  }

  const defaultValue = catalog.getDefaultValue(name);

  const presetValue = preset?.parameters[name];
  const sceneValue = scene?.parameters[name];
  const subsceneValue = subscene?.parameters[name];

  let resolvedValue = defaultValue;
  let source: ParameterSource = 'default';

  if (presetValue !== undefined) {
    resolvedValue = presetValue;
    source = 'preset';
  }
  if (sceneValue !== undefined) {
    resolvedValue = sceneValue;
    source = 'scene';
  }
  if (subsceneValue !== undefined) {
    resolvedValue = subsceneValue;
    source = 'subscene';
  }

  // Calculate inheritedValue (what the value would be if current level's override were removed)
  let inheritedValue = defaultValue;
  if (currentLevel === 'preset') {
    inheritedValue = defaultValue;
  } else if (currentLevel === 'scene') {
    inheritedValue = presetValue !== undefined ? presetValue : defaultValue;
  } else if (currentLevel === 'subscene') {
    if (sceneValue !== undefined) {
      inheritedValue = sceneValue;
    } else if (presetValue !== undefined) {
      inheritedValue = presetValue;
    } else {
      inheritedValue = defaultValue;
    }
  }

  const isOverriddenHere =
    currentLevel === 'preset'
      ? presetValue !== undefined
      : currentLevel === 'scene'
        ? sceneValue !== undefined
        : subsceneValue !== undefined;

  return {
    descriptor,
    name,
    resolvedValue,
    source,
    isOverriddenHere,
    inheritedValue,
    defaultValue,
    presetValue,
    sceneValue,
    subsceneValue,
  };
}

/**
 * Resolves all 71 parameters in catalog order for a given hierarchy scope.
 */
export function resolveAllParameters(
  options: Omit<ResolveParameterOptions, 'name'>
): ResolvedParameterState[] {
  return catalog.getAllParameters().map((desc) =>
    resolveParameterState({
      ...options,
      name: desc.name,
    })
  );
}
