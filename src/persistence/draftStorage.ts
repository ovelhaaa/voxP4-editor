import { get, set, del } from 'idb-keyval';
import { VoxP4Library } from '../domain/models';

const DRAFT_KEY = 'voxp4_editor_active_draft_v1';

export async function saveDraft(library: VoxP4Library): Promise<void> {
  if (typeof indexedDB !== 'undefined') {
    try {
      await set(DRAFT_KEY, library);
      return;
    } catch (err) {
      console.warn('[draftStorage] Failed to save draft to IndexedDB:', err);
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(library));
    } catch {
      // Storage full or unavailable
    }
  }
}

export async function loadDraft(): Promise<VoxP4Library | null> {
  if (typeof indexedDB !== 'undefined') {
    try {
      const val = await get<VoxP4Library>(DRAFT_KEY);
      if (val && typeof val === 'object' && val.format === 'voxp4-library') {
        return val;
      }
    } catch (err) {
      console.warn('[draftStorage] IndexedDB read failed, trying localStorage:', err);
    }
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.format === 'voxp4-library') {
          return parsed;
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

export async function clearDraft(): Promise<void> {
  if (typeof indexedDB !== 'undefined') {
    try {
      await del(DRAFT_KEY);
    } catch (err) {
      console.warn('[draftStorage] Failed to clear IndexedDB draft:', err);
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore
    }
  }
}
