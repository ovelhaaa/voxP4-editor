#!/usr/bin/env node
/**
 * Transactionally updates the committed WASM preview package in
 * src/audio/wasm/ from an external package directory.
 *
 * Usage:
 *   node scripts/sync-wasm.mjs <package-dir>
 *
 * <package-dir> must contain exactly:
 *   voxp4-preview.mjs
 *   voxp4-preview.wasm
 *   dsp-compatibility.json
 *
 * Validation rejects packages whose `manifest.dspCommit` is not a 40-char
 * lowercase hex commit (so "unknown" is refused) or whose embedded WASM
 * `dspCommit` differs from the sidecar manifest.
 *
 * The update is all-or-nothing: the destination ends up either as the complete
 * old package or the complete new package, never a mix. The sequence is:
 *
 *   1. validate the incoming package;
 *   2. copy it into a sibling staging directory;
 *   3. validate the staging copy again;
 *   4. move the current package to a backup directory;
 *   5. swap the staging directory into place;
 *   6. delete the backup (only after a successful swap).
 *
 * If step 4 or 5 fails, the backup is restored before returning an error.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath, pathToFileURL } from 'url';
import { isValidCommit, readEmbeddedDspCommit } from './lib/wasm-provenance.mjs';

export const REQUIRED_FILES = ['voxp4-preview.mjs', 'voxp4-preview.wasm', 'dsp-compatibility.json'];
export const EXPECTED = {
  engine: 'voxP4',
  profile: 'P4Production',
  contractVersion: 1,
  parameterCount: 71,
  sampleRate: 48000,
  blockSize: 64,
};

function sha256(filePath, fsImpl) {
  return crypto.createHash('sha256').update(fsImpl.readFileSync(filePath)).digest('hex');
}

/**
 * Validates a package directory. Throws an Error on any inconsistency.
 * Returns the parsed manifest on success.
 *
 * This is async because it also instantiates the WASM and requires the commit
 * embedded in the binary to equal `manifest.dspCommit`.
 */
export async function validatePackage(inputDir, contractPath, fsImpl = fs) {
  if (!fsImpl.existsSync(inputDir) || !fsImpl.statSync(inputDir).isDirectory()) {
    throw new Error(`package directory not found: ${inputDir}`);
  }

  for (const file of REQUIRED_FILES) {
    if (!fsImpl.existsSync(path.join(inputDir, file))) {
      throw new Error(`required package file missing: ${file}`);
    }
  }

  const manifest = JSON.parse(fsImpl.readFileSync(path.join(inputDir, 'dsp-compatibility.json'), 'utf8'));

  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (manifest[key] !== expected) {
      throw new Error(
        `manifest.${key} is ${JSON.stringify(manifest[key])}, expected ${JSON.stringify(expected)}`
      );
    }
  }

  const actualWasmSha = sha256(path.join(inputDir, 'voxp4-preview.wasm'), fsImpl);
  if (manifest.wasmSha256 !== actualWasmSha) {
    throw new Error(
      `manifest.wasmSha256 does not match the package WASM.\n` +
        `  manifest : ${manifest.wasmSha256}\n` +
        `  actual   : ${actualWasmSha}`
    );
  }

  if (!fsImpl.existsSync(contractPath)) {
    throw new Error(`editor contract not found at ${contractPath}`);
  }
  const editorContractSha = sha256(contractPath, fsImpl);
  if (manifest.contractSha256 !== editorContractSha) {
    throw new Error(
      `package manifest contractSha256 does not match the editor contract.\n` +
        `  manifest        : ${manifest.contractSha256}\n` +
        `  editor contract : ${editorContractSha}\n` +
        `  The WASM package was built against a different parameter contract version.`
    );
  }

  if (!isValidCommit(manifest.dspCommit)) {
    throw new Error(
      `manifest.dspCommit must be a 40-char lowercase hex git commit ` +
        `(got ${JSON.stringify(manifest.dspCommit)}); "unknown" is not accepted.`
    );
  }

  let embeddedCommit;
  try {
    embeddedCommit = await readEmbeddedDspCommit(
      path.join(inputDir, 'voxp4-preview.mjs'),
      path.join(inputDir, 'voxp4-preview.wasm'),
      fsImpl
    );
  } catch (err) {
    throw new Error(`could not inspect the embedded WASM manifest: ${err.message}`);
  }

  if (embeddedCommit !== manifest.dspCommit) {
    throw new Error(
      `embedded dspCommit ${JSON.stringify(embeddedCommit)} does not match ` +
        `manifest dspCommit ${manifest.dspCommit}`
    );
  }

  return manifest;
}

function removeDirQuietly(dir, fsImpl) {
  try {
    if (fsImpl.existsSync(dir)) fsImpl.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort.
  }
}

/**
 * Performs the transactional install. Validates everything before touching the
 * destination and rolls back to the previous complete package on failure.
 *
 * @returns {{ manifest: object, updated: string[] }}
 */
export async function runSync({ inputDir, destDir, contractPath, fsImpl = fs, log = console.log, pid = process.pid }) {
  const manifest = await validatePackage(inputDir, contractPath, fsImpl);

  const parentDir = path.dirname(destDir);
  fsImpl.mkdirSync(parentDir, { recursive: true });

  const stagingDir = path.join(parentDir, `.wasm-staging-${pid}`);
  const backupDir = path.join(parentDir, `.wasm-backup-${pid}`);

  // Clear any leftovers from a previous interrupted run.
  removeDirQuietly(stagingDir, fsImpl);
  removeDirQuietly(backupDir, fsImpl);

  let backupCreated = false;

  try {
    // 2. Copy the whole package into staging.
    fsImpl.mkdirSync(stagingDir, { recursive: true });
    for (const file of REQUIRED_FILES) {
      fsImpl.copyFileSync(path.join(inputDir, file), path.join(stagingDir, file));
    }

    // 3. Re-validate the staging copy.
    await validatePackage(stagingDir, contractPath, fsImpl);

    // 4. Move the current package out of the way.
    const destExists = fsImpl.existsSync(destDir);
    if (destExists) {
      fsImpl.renameSync(destDir, backupDir);
      backupCreated = true;
    }

    // 5. Swap the validated staging package into place.
    try {
      fsImpl.renameSync(stagingDir, destDir);
    } catch (swapError) {
      if (backupCreated && !fsImpl.existsSync(destDir)) {
        try {
          fsImpl.renameSync(backupDir, destDir);
          backupCreated = false;
        } catch (rollbackError) {
          throw new Error(
            `swap failed (${swapError.message}) and rollback failed (${rollbackError.message}). ` +
              `The previous package is preserved at ${backupDir}.`
          );
        }
      }
      throw swapError;
    }
  } catch (err) {
    removeDirQuietly(stagingDir, fsImpl);
    // If we moved the destination aside but did not complete the swap, restore it.
    if (backupCreated && !fsImpl.existsSync(destDir) && fsImpl.existsSync(backupDir)) {
      fsImpl.renameSync(backupDir, destDir);
      backupCreated = false;
    }
    throw err;
  }

  // 6. Success: drop the backup.
  if (backupCreated) {
    try {
      fsImpl.rmSync(backupDir, { recursive: true, force: true });
    } catch (err) {
      log(`[sync-wasm] WARNING: could not remove backup ${backupDir}: ${err.message}`);
    }
  }

  return {
    manifest,
    updated: REQUIRED_FILES.map((file) => path.join(destDir, file)),
  };
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '..');
  const destDir = path.join(repoRoot, 'src', 'audio', 'wasm');
  const contractPath = path.join(repoRoot, 'contracts', 'voxp4-parameters-v1.json');

  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error('[sync-wasm] ERROR - missing <package-dir> argument.');
    console.error('Usage: node scripts/sync-wasm.mjs <package-dir>');
    process.exit(1);
  }

  try {
    const { manifest, updated } = await runSync({
      inputDir: path.resolve(inputArg),
      destDir,
      contractPath,
    });
    console.log('[sync-wasm] OK');
    for (const file of updated) console.log(`  updated ${path.relative(repoRoot, file)}`);
    console.log(`  dspCommit = ${manifest.dspCommit}`);
  } catch (err) {
    console.error(`[sync-wasm] ERROR - ${err.message}`);
    process.exit(1);
  }
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[sync-wasm] ERROR - ${err.message}`);
    process.exit(1);
  });
}
