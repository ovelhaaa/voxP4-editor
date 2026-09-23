import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runSync, validatePackage, REQUIRED_FILES } from '../scripts/sync-wasm.mjs';

const WASM_SRC = path.resolve(__dirname, '../src/audio/wasm');
const CONTRACT = path.resolve(__dirname, '../contracts/voxp4-parameters-v1.json');
// Keep test temp dirs inside the project so Vitest can resolve the copied WASM
// ES module (node_modules/.cache is ignored by git).
const TMP_BASE = path.resolve(__dirname, '../node_modules/.cache/voxp4-sync-tests');

function makePackage(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  for (const file of REQUIRED_FILES) {
    fs.copyFileSync(path.join(WASM_SRC, file), path.join(dir, file));
  }
}

function readManifest(dir: string): any {
  return JSON.parse(fs.readFileSync(path.join(dir, 'dsp-compatibility.json'), 'utf8'));
}

function writeManifest(dir: string, manifest: any): void {
  fs.writeFileSync(path.join(dir, 'dsp-compatibility.json'), JSON.stringify(manifest, null, 2) + '\n');
}

describe('sync-wasm transactional package sync', () => {
  let tmpRoot: string;
  let inputDir: string;
  let destDir: string;

  beforeEach(() => {
    fs.mkdirSync(TMP_BASE, { recursive: true });
    tmpRoot = fs.mkdtempSync(path.join(TMP_BASE, 'run-'));
    inputDir = path.join(tmpRoot, 'package');
    destDir = path.join(tmpRoot, 'dest', 'wasm');
    makePackage(inputDir);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('validates a complete package against its embedded WASM commit', async () => {
    const manifest = await validatePackage(inputDir, CONTRACT);
    expect(manifest.dspCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.wasmSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('installs the complete new package (all-or-nothing replacement)', async () => {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'legacy-marker.txt'), 'old');

    await runSync({ inputDir, destDir, contractPath: CONTRACT, log: () => {} });

    for (const file of REQUIRED_FILES) {
      expect(fs.readFileSync(path.join(destDir, file))).toEqual(
        fs.readFileSync(path.join(inputDir, file))
      );
    }
    // A complete swap removes files that were not part of the new package.
    expect(fs.existsSync(path.join(destDir, 'legacy-marker.txt'))).toBe(false);
    // No staging/backup leftovers.
    const leftovers = fs
      .readdirSync(path.dirname(destDir))
      .filter((name) => name.startsWith('.wasm-'));
    expect(leftovers).toEqual([]);
  });

  it('rejects a WASM hash mismatch and leaves the destination untouched', async () => {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'marker.txt'), 'old');

    const manifest = readManifest(inputDir);
    manifest.wasmSha256 = 'f'.repeat(64);
    writeManifest(inputDir, manifest);

    await expect(
      runSync({ inputDir, destDir, contractPath: CONTRACT, log: () => {} })
    ).rejects.toThrow(/wasmSha256/);
    expect(fs.readFileSync(path.join(destDir, 'marker.txt'), 'utf8')).toBe('old');
  });

  it('rejects "unknown" or malformed dspCommit values', async () => {
    for (const bad of ['unknown', '', 'abc123', 'A'.repeat(40)]) {
      const manifest = readManifest(inputDir);
      manifest.dspCommit = bad;
      writeManifest(inputDir, manifest);
      await expect(validatePackage(inputDir, CONTRACT)).rejects.toThrow(/dspCommit/);
    }
  });

  it('rejects a manifest whose dspCommit differs from the embedded commit', async () => {
    const manifest = readManifest(inputDir);
    // Valid format, but not the commit actually compiled into the WASM.
    manifest.dspCommit = '0'.repeat(40);
    writeManifest(inputDir, manifest);

    await expect(validatePackage(inputDir, CONTRACT)).rejects.toThrow(
      /embedded dspCommit .* does not match/
    );
  });

  it('rejects a contract hash mismatch', async () => {
    const manifest = readManifest(inputDir);
    manifest.contractSha256 = '0'.repeat(64);
    writeManifest(inputDir, manifest);

    await expect(validatePackage(inputDir, CONTRACT)).rejects.toThrow(/contractSha256/);
  });

  it('rejects a package with a missing file', async () => {
    fs.rmSync(path.join(inputDir, 'voxp4-preview.wasm'));
    await expect(validatePackage(inputDir, CONTRACT)).rejects.toThrow(
      /required package file missing/
    );
  });

  it('rolls back to the previous complete package if the final swap fails', async () => {
    makePackage(destDir);
    const oldWasm = fs.readFileSync(path.join(destDir, 'voxp4-preview.wasm'));

    const failingFs: typeof fs = {
      ...fs,
      renameSync: ((from: fs.PathLike, to: fs.PathLike) => {
        if (String(from).includes('.wasm-staging-')) {
          throw new Error('simulated swap failure');
        }
        return fs.renameSync(from, to);
      }) as typeof fs.renameSync,
    };

    await expect(
      runSync({
        inputDir,
        destDir,
        contractPath: CONTRACT,
        fsImpl: failingFs,
        log: () => {},
      })
    ).rejects.toThrow(/simulated swap failure/);

    // Destination is still the previous complete package.
    expect(fs.readFileSync(path.join(destDir, 'voxp4-preview.wasm'))).toEqual(oldWasm);
    for (const file of REQUIRED_FILES) {
      expect(fs.existsSync(path.join(destDir, file))).toBe(true);
    }

    const leftovers = fs
      .readdirSync(path.dirname(destDir))
      .filter((name) => name.startsWith('.wasm-'));
    expect(leftovers).toEqual([]);
  });
});
