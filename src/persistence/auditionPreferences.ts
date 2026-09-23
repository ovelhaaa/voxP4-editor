import { AuditionLengthMode, AuditionRegion } from '../audio/types';

/**
 * Audition preferences are editor/UI state only. They are intentionally NOT
 * part of the Portable Library V1 contract and are never serialized to
 * `.voxp4.json`.
 */
export interface AuditionPreferences {
  readonly autoPreview: boolean;
  readonly loudnessMatch: boolean;
  readonly lengthMode: AuditionLengthMode;
  /** Region selections keyed by source id. */
  readonly regions: Record<string, AuditionRegion>;
}

export const DEFAULT_AUDITION_PREFERENCES: AuditionPreferences = {
  autoPreview: true,
  loudnessMatch: true,
  lengthMode: 'full',
  regions: {},
};

const STORAGE_KEY = 'voxp4_editor_audition_prefs_v1';

const VALID_LENGTH_MODES: readonly AuditionLengthMode[] = ['short', 'medium', 'full'];

function isRegion(value: unknown): value is AuditionRegion {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.startSeconds === 'number' &&
    Number.isFinite(r.startSeconds) &&
    typeof r.endSeconds === 'number' &&
    Number.isFinite(r.endSeconds)
  );
}

export function loadAuditionPreferences(): AuditionPreferences {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_AUDITION_PREFERENCES;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUDITION_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AuditionPreferences>;

    const lengthMode = VALID_LENGTH_MODES.includes(parsed.lengthMode as AuditionLengthMode)
      ? (parsed.lengthMode as AuditionLengthMode)
      : DEFAULT_AUDITION_PREFERENCES.lengthMode;

    const regions: Record<string, AuditionRegion> = {};
    if (parsed.regions && typeof parsed.regions === 'object') {
      for (const [sourceId, region] of Object.entries(parsed.regions)) {
        if (isRegion(region)) {
          regions[sourceId] = { startSeconds: region.startSeconds, endSeconds: region.endSeconds };
        }
      }
    }

    return {
      autoPreview:
        typeof parsed.autoPreview === 'boolean'
          ? parsed.autoPreview
          : DEFAULT_AUDITION_PREFERENCES.autoPreview,
      loudnessMatch:
        typeof parsed.loudnessMatch === 'boolean'
          ? parsed.loudnessMatch
          : DEFAULT_AUDITION_PREFERENCES.loudnessMatch,
      lengthMode,
      regions,
    };
  } catch {
    return DEFAULT_AUDITION_PREFERENCES;
  }
}

export function saveAuditionPreferences(preferences: AuditionPreferences): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Storage unavailable or full; audition preferences are best-effort.
  }
}
