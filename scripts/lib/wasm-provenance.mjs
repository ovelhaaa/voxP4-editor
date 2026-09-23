/**
 * Embedded WASM provenance helpers shared by the editor's sync and verify
 * scripts.
 *
 * The WASM binary embeds its own provenance JSON (engine, dspCommit, version)
 * via `voxp4_preview_get_manifest_json()`. Reading it back guarantees the
 * sidecar `dsp-compatibility.json` declares exactly the commit that is actually
 * compiled into the binary.
 */
import fs from 'fs';
import { pathToFileURL } from 'url';

/** A canonical git commit: 40 lowercase hex characters. */
export const COMMIT_PATTERN = /^[0-9a-f]{40}$/;

export function isValidCommit(value) {
  return typeof value === 'string' && COMMIT_PATTERN.test(value);
}

/**
 * Instantiates the package ES module with the given WASM binary and returns the
 * `dspCommit` embedded in it (or null when absent).
 *
 * @param {string} mjsPath
 * @param {string} wasmPath
 * @param {typeof fs} [fsImpl]
 * @returns {Promise<string | null>}
 */
// Vitest's Vite module runner resolves dynamic imports against project paths;
// plain Node needs a file:// URL for absolute paths (a Windows "C:" path would
// otherwise be treated as an unsupported URL scheme).
const RUNNING_UNDER_VITEST = process.env.VITEST === 'true' || process.env.VITEST === '1';

export async function readEmbeddedDspCommit(mjsPath, wasmPath, fsImpl = fs) {
  const specifier = RUNNING_UNDER_VITEST ? mjsPath : pathToFileURL(mjsPath).href;
  const createModule = (await import(specifier)).default;
  const mod = await createModule({ wasmBinary: fsImpl.readFileSync(wasmPath) });
  const raw = mod.cwrap('voxp4_preview_get_manifest_json', 'string', [])();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('embedded manifest is not valid JSON');
  }

  return typeof parsed.dspCommit === 'string' ? parsed.dspCommit : null;
}
