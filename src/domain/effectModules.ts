import { ParameterGroup, catalog } from './catalog';
import { ParameterValue } from './models';

export interface EffectModuleDefinition {
  readonly id: string;
  readonly name: string;
  readonly group: ParameterGroup;
  readonly enableParam?: string;
  readonly primaryParams: readonly string[];
  readonly formatSummary: (values: Record<string, ParameterValue>) => string;
}

function getVal<T extends ParameterValue>(
  values: Record<string, ParameterValue>,
  paramName: string
): T {
  if (values[paramName] !== undefined && values[paramName] !== null) {
    return values[paramName] as T;
  }
  return catalog.getDefaultValue(paramName) as T;
}

export const EFFECT_MODULES: readonly EffectModuleDefinition[] = [
  {
    id: 'harmony',
    name: 'HARMONY',
    group: 'harmony',
    enableParam: 'HarmonyEnable',
    primaryParams: ['HarmonyMode', 'HarmonyInterval', 'HarmonyLevel', 'HarmonyVoice1Pan'],
    formatSummary: (vals) => {
      const mode = String(getVal(vals, 'HarmonyMode'));
      const interval = Number(getVal(vals, 'HarmonyInterval'));
      const sign = interval > 0 ? '+' : '';
      return `${mode} ${sign}${interval}st`;
    },
  },
  {
    id: 'dynamics',
    name: 'DYNAMICS',
    group: 'dynamics',
    enableParam: 'CompressorEnable',
    primaryParams: [
      'CompressorThresholdDb',
      'CompressorRatio',
      'CompressorMakeupDb',
      'GateEnable',
    ],
    formatSummary: (vals) => {
      const thresh = Number(getVal(vals, 'CompressorThresholdDb'));
      const ratio = Number(getVal(vals, 'CompressorRatio'));
      const threshUnit = catalog.getParameter('CompressorThresholdDb')?.unit || '';
      return `${thresh}${threshUnit} · ${ratio}:1`;
    },
  },
  {
    id: 'drive',
    name: 'DRIVE',
    group: 'drive',
    enableParam: 'DriveEnable',
    primaryParams: ['DriveMode', 'DriveDrive', 'DriveMix', 'DriveTone'],
    formatSummary: (vals) => {
      const mode = String(getVal(vals, 'DriveMode'));
      const drive = Number(getVal(vals, 'DriveDrive'));
      return `${mode} · ${Math.round(drive * 100)}%`;
    },
  },
  {
    id: 'chorus',
    name: 'CHORUS',
    group: 'chorus',
    enableParam: 'ChorusEnable',
    primaryParams: ['ChorusMode', 'ChorusRateHz', 'ChorusDepthMs', 'ChorusMix'],
    formatSummary: (vals) => {
      const mode = String(getVal(vals, 'ChorusMode'));
      const mix = Number(getVal(vals, 'ChorusMix'));
      return `${mode} · ${Math.round(mix * 100)}%`;
    },
  },
  {
    id: 'delay',
    name: 'DELAY',
    group: 'delay',
    enableParam: 'DelayEnable',
    primaryParams: ['DelayLeftMs', 'DelayRightMs', 'DelayFeedback', 'DelayWet'],
    formatSummary: (vals) => {
      const leftMs = Number(getVal(vals, 'DelayLeftMs'));
      const wet = Number(getVal(vals, 'DelayWet'));
      return `${Math.round(leftMs)}ms · ${Math.round(wet * 100)}%`;
    },
  },
  {
    id: 'reverb',
    name: 'REVERB',
    group: 'reverb',
    enableParam: 'ReverbEnable',
    primaryParams: ['ReverbWet', 'ReverbDecayS', 'ReverbDamping'],
    formatSummary: (vals) => {
      const decay = Number(getVal(vals, 'ReverbDecayS'));
      const wet = Number(getVal(vals, 'ReverbWet'));
      return `${decay.toFixed(1)}s · ${Math.round(wet * 100)}%`;
    },
  },
  {
    id: 'output',
    name: 'OUTPUT',
    group: 'output',
    primaryParams: ['LimiterCeiling', 'OutputSpatialRouting', 'OutputSpatialSource', 'OutputMuteDry'],
    formatSummary: (vals) => {
      const ceil = Number(getVal(vals, 'LimiterCeiling'));
      const routing = String(getVal(vals, 'OutputSpatialRouting'));
      return `${routing} · ${ceil.toFixed(2)}`;
    },
  },
];

/**
 * Returns all parameters for an effect module in contract order,
 * excluding enable parameter (handled by module card header) if requested.
 */
export function getModuleParameters(
  module: EffectModuleDefinition,
  options?: { excludeEnable?: boolean }
) {
  let allInGroup = catalog.getParametersByGroup(module.group);
  if (module.id === 'harmony') {
    // HarmonyKey and HarmonyScale belong to the Song musical header, not the FX rack
    allInGroup = allInGroup.filter((p) => p.name !== 'HarmonyKey' && p.name !== 'HarmonyScale');
  }
  if (options?.excludeEnable && module.enableParam) {
    return allInGroup.filter((p) => p.name !== module.enableParam);
  }
  return allInGroup;
}
