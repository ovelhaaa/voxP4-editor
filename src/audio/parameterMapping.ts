import { ResolvedParameterState } from '../domain/resolution';

/**
 * Maps a resolved parameter state list to the flat numeric wire representation
 * consumed by the WASM DSP. Keys are canonical semantic keys (e.g. "delay.wet").
 *
 * - bool  -> 1.0 / 0.0
 * - enum  -> canonical index within the contract values list
 * - int   -> numeric value
 * - float -> numeric value
 */
export function mapResolvedParameters(
  resolved: readonly ResolvedParameterState[]
): Record<string, number> {
  const result: Record<string, number> = {};

  for (const r of resolved) {
    const desc = r.descriptor;
    const val = r.resolvedValue;

    if (desc.type === 'bool') {
      result[desc.key] = val ? 1.0 : 0.0;
    } else if (desc.type === 'enum') {
      const idx = desc.values ? desc.values.indexOf(String(val)) : -1;
      result[desc.key] = idx >= 0 ? idx : desc.default;
    } else {
      result[desc.key] = typeof val === 'number' && Number.isFinite(val) ? val : desc.default;
    }
  }

  return result;
}
