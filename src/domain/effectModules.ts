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

export const EFFECT_MODULES: readonly EffectModuleDefinition[] = [
  {
    id: 'harmony',
    name: 'HARMONY',
    group: 'harmony',
    enableParam: 'HarmonyEnable',
    primaryParams: ['HarmonyMode', 'HarmonyInterval', 'HarmonyLevel', 'HarmonyVoice1Pan'],
    formatSummary: (vals) => {
      const mode = String(vals.HarmonyMode || 'Fixed');
      const interval = typeof vals.HarmonyInterval === 'number' ? vals.HarmonyInterval : 0;
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
      const thresh = typeof vals.CompressorThresholdDb === 'number' ? vals.CompressorThresholdDb : -20;
      const ratio = typeof vals.CompressorRatio === 'number' ? vals.CompressorRatio : 4;
      return `${thresh}dB · ${ratio}:1`;
    },
  },
  {
    id: 'drive',
    name: 'DRIVE',
    group: 'drive',
    enableParam: 'DriveEnable',
    primaryParams: ['DriveMode', 'DriveDrive', 'DriveMix', 'DriveTone'],
    formatSummary: (vals) => {
      const mode = String(vals.DriveMode || 'Tape');
      const drive = typeof vals.DriveDrive === 'number' ? vals.DriveDrive : 0.5;
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
      const mode = String(vals.ChorusMode || 'Chorus');
      const mix = typeof vals.ChorusMix === 'number' ? vals.ChorusMix : 0.5;
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
      const time = typeof vals.DelayLeftMs === 'number' ? vals.DelayLeftMs : 350;
      const wet = typeof vals.DelayWet === 'number' ? vals.DelayWet : 0.2;
      return `${Math.round(time)}ms · ${Math.round(wet * 100)}%`;
    },
  },
  {
    id: 'reverb',
    name: 'REVERB',
    group: 'reverb',
    enableParam: 'ReverbEnable',
    primaryParams: ['ReverbWet', 'ReverbDecayS', 'ReverbDamping'],
    formatSummary: (vals) => {
      const decay = typeof vals.ReverbDecayS === 'number' ? vals.ReverbDecayS : 2.5;
      const wet = typeof vals.ReverbWet === 'number' ? vals.ReverbWet : 0.2;
      return `${decay.toFixed(1)}s · ${Math.round(wet * 100)}%`;
    },
  },
  {
    id: 'output',
    name: 'OUTPUT',
    group: 'output',
    primaryParams: ['LimiterCeiling', 'OutputSpatialRouting', 'OutputSpatialSource', 'OutputMuteDry'],
    formatSummary: (vals) => {
      const ceil = typeof vals.LimiterCeiling === 'number' ? vals.LimiterCeiling : -0.5;
      const routing = String(vals.OutputSpatialRouting || 'Stereo');
      return `${routing} · ${ceil.toFixed(1)}dB`;
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
  const allInGroup = catalog.getParametersByGroup(module.group);
  if (options?.excludeEnable && module.enableParam) {
    return allInGroup.filter((p) => p.name !== module.enableParam);
  }
  return allInGroup;
}
