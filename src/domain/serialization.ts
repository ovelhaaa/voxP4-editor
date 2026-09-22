import {
  ParameterMap,
  Preset,
  Scene,
  Setlist,
  SetlistEntry,
  Subscene,
  VoxP4Library,
} from './models';

function cleanParameters(params?: ParameterMap): ParameterMap {
  if (!params) return {};
  const cleaned: ParameterMap = {};
  const sortedKeys = Object.keys(params).sort();
  for (const k of sortedKeys) {
    const val = params[k];
    if (val !== undefined) {
      cleaned[k] = val;
    }
  }
  return cleaned;
}

function serializePreset(preset: Preset): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: preset.id,
    name: preset.name,
  };
  const params = cleanParameters(preset.parameters);
  if (Object.keys(params).length > 0) {
    result.parameters = params;
  }
  return result;
}

function serializeSubscene(sub: Subscene): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: sub.id,
    name: sub.name,
  };
  const params = cleanParameters(sub.parameters);
  if (Object.keys(params).length > 0) {
    result.parameters = params;
  }
  return result;
}

function serializeScene(scene: Scene): Record<string, unknown> {
  const result: Record<string, unknown> = {
    id: scene.id,
    name: scene.name,
  };
  if (scene.basePresetId) {
    result.basePresetId = scene.basePresetId;
  }
  if (scene.metadata && Object.keys(scene.metadata).length > 0) {
    const cleanedMeta: Record<string, string> = {};
    for (const [k, v] of Object.entries(scene.metadata)) {
      if (v !== undefined && v !== '') {
        cleanedMeta[k] = v;
      }
    }
    if (Object.keys(cleanedMeta).length > 0) {
      result.metadata = cleanedMeta;
    }
  }
  const params = cleanParameters(scene.parameters);
  if (Object.keys(params).length > 0) {
    result.parameters = params;
  }
  result.subscenes = (scene.subscenes || []).map(serializeSubscene);
  return result;
}

function serializeSetlistEntry(entry: SetlistEntry): Record<string, unknown> {
  return {
    id: entry.id,
    sceneId: entry.sceneId,
  };
}

function serializeSetlist(setlist: Setlist): Record<string, unknown> {
  return {
    id: setlist.id,
    name: setlist.name,
    entries: (setlist.entries || []).map(serializeSetlistEntry),
  };
}

/**
 * Serializes a VoxP4Library to canonical JSON format with deterministic key order
 * and 2-space indentation.
 */
export function serializeLibrary(library: VoxP4Library): string {
  const canonicalObj: Record<string, unknown> = {
    format: 'voxp4-library',
    formatVersion: 1,
    schemaVersion: 1,
    libraryId: library.libraryId,
    name: library.name,
    presets: (library.presets || []).map(serializePreset),
    scenes: (library.scenes || []).map(serializeScene),
    setlists: (library.setlists || []).map(serializeSetlist),
  };

  return JSON.stringify(canonicalObj, null, 2) + '\n';
}
