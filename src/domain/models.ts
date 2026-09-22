export type ParameterValue = boolean | number | string;

export type ParameterMap = Record<string, ParameterValue>;

export interface SceneMetadata {
  artist?: string;
  notes?: string;
  tags?: string;
  [key: string]: string | undefined;
}

export interface Preset {
  id: string;
  name: string;
  parameters: ParameterMap;
}

export interface Subscene {
  id: string;
  name: string;
  parameters: ParameterMap;
}

export interface Scene {
  id: string;
  name: string;
  basePresetId?: string;
  metadata?: SceneMetadata;
  parameters: ParameterMap;
  subscenes: Subscene[];
}

export interface SetlistEntry {
  id: string;
  sceneId: string;
}

export interface Setlist {
  id: string;
  name: string;
  entries: SetlistEntry[];
}

export interface VoxP4Library {
  format: 'voxp4-library';
  formatVersion: 1;
  schemaVersion: 1;
  libraryId: string;
  name: string;
  presets: Preset[];
  scenes: Scene[];
  setlists: Setlist[];
}

export type EntityTargetType = 'preset' | 'scene' | 'subscene' | 'setlist' | 'library';

export interface EntityTarget {
  type: EntityTargetType;
  id: string;
  subsceneId?: string;
  paramName?: string;
}

export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
  target?: EntityTarget;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
