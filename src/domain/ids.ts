/**
 * Generates stable semantic IDs for entities in the format `${prefix}-${random}`
 * or UUID-like strings.
 */
export function generateId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${rand}`;
}

export function generateLibraryId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);
  const rand = Math.random().toString(36).substring(2, 6);
  return slug ? `${slug}-${rand}` : `rig-${rand}`;
}

export function isValidId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(id);
}
