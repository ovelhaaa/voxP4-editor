import Ajv from 'ajv';
import rawSchema from '../../contracts/voxp4-library-v1.schema.json';
import { catalog } from './catalog';
import {
  ParameterMap,
  ValidationIssue,
  ValidationResult,
  VoxP4Library,
} from './models';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile(rawSchema);

/**
 * Performs Level 1 (Structural Schema) and Level 2 (Semantic Domain) validation
 * on a VoxP4Library object.
 */
export function validateLibrary(library: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Level 1: Structural JSON Schema Validation
  const schemaValid = validateSchema(library);
  if (!schemaValid && validateSchema.errors) {
    for (const err of validateSchema.errors) {
      const path = err.instancePath || '/';
      const msg = `${err.message ?? 'schema violation'}${
        err.params && Object.keys(err.params).length > 0
          ? ` (${JSON.stringify(err.params)})`
          : ''
      }`;
      errors.push({
        path,
        message: `Schema error: ${msg}`,
        severity: 'error',
      });
    }
  }

  // If the object isn't even a basic object, return schema errors immediately
  if (!library || typeof library !== 'object') {
    return {
      isValid: false,
      errors: errors.length > 0 ? errors : [{ path: '/', message: 'Library is not an object', severity: 'error' }],
      warnings: [],
    };
  }

  const lib = library as Partial<VoxP4Library>;

  // Check top-level contract strings
  if (lib.format !== 'voxp4-library') {
    errors.push({
      path: '/format',
      message: `Invalid format '${String(lib.format)}', expected 'voxp4-library'`,
      severity: 'error',
    });
  }
  if (lib.formatVersion !== 1) {
    errors.push({
      path: '/formatVersion',
      message: `Unsupported formatVersion '${String(lib.formatVersion)}', must be 1`,
      severity: 'error',
    });
  }
  if (lib.schemaVersion !== 1) {
    errors.push({
      path: '/schemaVersion',
      message: `Unsupported schemaVersion '${String(lib.schemaVersion)}', must be 1`,
      severity: 'error',
    });
  }

  // Level 2: Semantic Validation

  const presetIds = new Set<string>();
  const sceneIds = new Set<string>();
  const setlistIds = new Set<string>();

  // 1. Validate Presets
  if (Array.isArray(lib.presets)) {
    if (lib.presets.length > 64) {
      errors.push({
        path: '/presets',
        message: `Preset count (${lib.presets.length}) exceeds maximum capacity of 64`,
        severity: 'error',
      });
    }

    lib.presets.forEach((preset, pIdx) => {
      const pPath = `/presets/${pIdx}`;
      if (!preset || typeof preset !== 'object') return;

      if (!preset.id) {
        errors.push({
          path: `${pPath}/id`,
          message: `Preset at index ${pIdx} is missing an id`,
          severity: 'error',
        });
      } else {
        if (presetIds.has(preset.id)) {
          errors.push({
            path: `${pPath}/id`,
            message: `Duplicate Preset ID '${preset.id}'`,
            severity: 'error',
            target: { type: 'preset', id: preset.id },
          });
        }
        presetIds.add(preset.id);
      }

      if (!preset.name || preset.name.trim() === '') {
        errors.push({
          path: `${pPath}/name`,
          message: `Preset '${preset.id || pIdx}' has an empty name`,
          severity: 'error',
          target: { type: 'preset', id: preset.id },
        });
      }

      // Validate Preset parameters
      validateParameterMap(preset.parameters, `${pPath}/parameters`, errors, {
        type: 'preset',
        id: preset.id,
      });
    });
  }

  // 2. Validate Scenes & Subscenes
  if (Array.isArray(lib.scenes)) {
    if (lib.scenes.length > 64) {
      errors.push({
        path: '/scenes',
        message: `Scene count (${lib.scenes.length}) exceeds maximum capacity of 64`,
        severity: 'error',
      });
    }

    lib.scenes.forEach((scene, sIdx) => {
      const sPath = `/scenes/${sIdx}`;
      if (!scene || typeof scene !== 'object') return;

      if (!scene.id) {
        errors.push({
          path: `${sPath}/id`,
          message: `Scene at index ${sIdx} is missing an id`,
          severity: 'error',
        });
      } else {
        if (sceneIds.has(scene.id)) {
          errors.push({
            path: `${sPath}/id`,
            message: `Duplicate Scene ID '${scene.id}'`,
            severity: 'error',
            target: { type: 'scene', id: scene.id },
          });
        }
        sceneIds.add(scene.id);
      }

      if (!scene.name || scene.name.trim() === '') {
        errors.push({
          path: `${sPath}/name`,
          message: `Scene '${scene.id || sIdx}' has an empty name`,
          severity: 'error',
          target: { type: 'scene', id: scene.id },
        });
      }

      // Referential integrity: basePresetId
      if (scene.basePresetId) {
        if (!presetIds.has(scene.basePresetId)) {
          errors.push({
            path: `${sPath}/basePresetId`,
            message: `Scene '${scene.name || scene.id}' references unknown Preset '${scene.basePresetId}'`,
            severity: 'error',
            target: { type: 'scene', id: scene.id },
          });
        }
      }

      // Scene-level parameter overrides
      validateParameterMap(scene.parameters, `${sPath}/parameters`, errors, {
        type: 'scene',
        id: scene.id,
      });

      // Subscenes
      if (Array.isArray(scene.subscenes)) {
        if (scene.subscenes.length > 16) {
          errors.push({
            path: `${sPath}/subscenes`,
            message: `Scene '${scene.name || scene.id}' has ${scene.subscenes.length} subscenes, exceeding maximum of 16`,
            severity: 'error',
            target: { type: 'scene', id: scene.id },
          });
        }

        if (scene.subscenes.length === 0) {
          warnings.push({
            path: `${sPath}/subscenes`,
            message: `Scene '${scene.name || scene.id}' contains no subscenes`,
            severity: 'warning',
            target: { type: 'scene', id: scene.id },
          });
        }

        const subsceneIds = new Set<string>();
        scene.subscenes.forEach((sub, subIdx) => {
          const subPath = `${sPath}/subscenes/${subIdx}`;
          if (!sub || typeof sub !== 'object') return;

          if (!sub.id) {
            errors.push({
              path: `${subPath}/id`,
              message: `Subscene at index ${subIdx} in Scene '${scene.id}' missing an id`,
              severity: 'error',
            });
          } else {
            if (subsceneIds.has(sub.id)) {
              errors.push({
                path: `${subPath}/id`,
                message: `Duplicate Subscene ID '${sub.id}' in Scene '${scene.name || scene.id}'`,
                severity: 'error',
                target: { type: 'subscene', id: scene.id, subsceneId: sub.id },
              });
            }
            subsceneIds.add(sub.id);
          }

          if (!sub.name || sub.name.trim() === '') {
            errors.push({
              path: `${subPath}/name`,
              message: `Subscene '${sub.id || subIdx}' in Scene '${scene.id}' has an empty name`,
              severity: 'error',
              target: { type: 'subscene', id: scene.id, subsceneId: sub.id },
            });
          }

          validateParameterMap(sub.parameters, `${subPath}/parameters`, errors, {
            type: 'subscene',
            id: scene.id,
            subsceneId: sub.id,
          });
        });
      }
    });
  }

  // 3. Validate Setlists
  const referencedSceneIds = new Set<string>();
  if (Array.isArray(lib.setlists)) {
    if (lib.setlists.length > 16) {
      errors.push({
        path: '/setlists',
        message: `Setlist count (${lib.setlists.length}) exceeds maximum capacity of 16`,
        severity: 'error',
      });
    }

    lib.setlists.forEach((setlist, stIdx) => {
      const stPath = `/setlists/${stIdx}`;
      if (!setlist || typeof setlist !== 'object') return;

      if (!setlist.id) {
        errors.push({
          path: `${stPath}/id`,
          message: `Setlist at index ${stIdx} is missing an id`,
          severity: 'error',
        });
      } else {
        if (setlistIds.has(setlist.id)) {
          errors.push({
            path: `${stPath}/id`,
            message: `Duplicate Setlist ID '${setlist.id}'`,
            severity: 'error',
            target: { type: 'setlist', id: setlist.id },
          });
        }
        setlistIds.add(setlist.id);
      }

      if (!setlist.name || setlist.name.trim() === '') {
        errors.push({
          path: `${stPath}/name`,
          message: `Setlist '${setlist.id || stIdx}' has an empty name`,
          severity: 'error',
          target: { type: 'setlist', id: setlist.id },
        });
      }

      if (Array.isArray(setlist.entries)) {
        if (setlist.entries.length > 64) {
          errors.push({
            path: `${stPath}/entries`,
            message: `Setlist '${setlist.name || setlist.id}' has ${setlist.entries.length} entries, exceeding maximum of 64`,
            severity: 'error',
            target: { type: 'setlist', id: setlist.id },
          });
        }

        if (setlist.entries.length === 0) {
          warnings.push({
            path: `${stPath}/entries`,
            message: `Setlist '${setlist.name || setlist.id}' has no entries`,
            severity: 'warning',
            target: { type: 'setlist', id: setlist.id },
          });
        }

        const entryIds = new Set<string>();
        setlist.entries.forEach((entry, eIdx) => {
          const ePath = `${stPath}/entries/${eIdx}`;
          if (!entry || typeof entry !== 'object') return;

          if (!entry.id) {
            errors.push({
              path: `${ePath}/id`,
              message: `Entry at index ${eIdx} in Setlist '${setlist.id}' missing an id`,
              severity: 'error',
              target: { type: 'setlist', id: setlist.id },
            });
          } else {
            if (entryIds.has(entry.id)) {
              errors.push({
                path: `${ePath}/id`,
                message: `Duplicate entry ID '${entry.id}' in Setlist '${setlist.name || setlist.id}'`,
                severity: 'error',
                target: { type: 'setlist', id: setlist.id },
              });
            }
            entryIds.add(entry.id);
          }

          if (!entry.sceneId) {
            errors.push({
              path: `${ePath}/sceneId`,
              message: `Entry '${entry.id || eIdx}' in Setlist '${setlist.id}' is missing sceneId`,
              severity: 'error',
              target: { type: 'setlist', id: setlist.id },
            });
          } else {
            referencedSceneIds.add(entry.sceneId);
            if (!sceneIds.has(entry.sceneId)) {
              errors.push({
                path: `${ePath}/sceneId`,
                message: `Setlist '${setlist.name || setlist.id}' entry references unknown Scene '${entry.sceneId}'`,
                severity: 'error',
                target: { type: 'setlist', id: setlist.id },
              });
            }
          }
        });
      }
    });
  }

  // 4. Cleanliness Warnings
  if (Array.isArray(lib.scenes)) {
    lib.scenes.forEach((scene) => {
      if (scene && scene.id && !referencedSceneIds.has(scene.id)) {
        warnings.push({
          path: `/scenes/${scene.id}`,
          message: `Scene '${scene.name}' (${scene.id}) is not used in any setlist`,
          severity: 'warning',
          target: { type: 'scene', id: scene.id },
        });
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateParameterMap(
  parameters: unknown,
  basePath: string,
  errors: ValidationIssue[],
  target: ValidationIssue['target']
): void {
  if (!parameters || typeof parameters !== 'object') return;

  const map = parameters as ParameterMap;
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;

    // Strict exact lookup in catalog
    const desc = catalog.getParameter(key);
    if (!desc) {
      errors.push({
        path: `${basePath}/${key}`,
        message: `Unknown parameter '${key}' (not in frozen V1 catalog)`,
        severity: 'error',
        target: target ? { ...target, paramName: key } : undefined,
      });
      continue;
    }

    const validation = catalog.validateValue(key, value);
    if (!validation.valid) {
      errors.push({
        path: `${basePath}/${key}`,
        message: validation.error ?? `Invalid value for parameter '${key}'`,
        severity: 'error',
        target: target ? { ...target, paramName: key } : undefined,
      });
    }
  }
}
