import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runSync, validatePackage, REQUIRED_FILES } from '../scripts/sync-wasm.mjs';

const WASM_SRC = path.resolve(__dirname, '../src/audio/wasm');
const CONTRACT = path.resolve(__dirname, '../contracts/voxp4-parameters-v1.json');

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
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'voxp4-sync-'));
    inputDir = path.join(tmpRoot, 'package');
    destDir = path.join(tmpRoot, 'dest', 'wasm');
    makePackage(inputDir);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('validates a complete package', () => {
    const manifest = validatePackage(inputDir, CONTRACT);
    expect(manifest.dspCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.wasmSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('installs the complete new package (all-or-nothing replacement)', () => {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'legacy-marker.txt'), 'old');

    runSync({ inputDir, destDir, contractPath: CONTRACT, log: () => {} });

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

  it('rejects a WASM hash mismatch and leaves the destination untouched', () => {
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'marker.txt'), 'old');

    const manifest = readManifest(inputDir);
    manifest.wasmSha256 = 'f'.repeat(64);
    writeManifest(inputDir, manifest);

    expect(() => runSync({ inputDir, destDir, contractPath: CONTRACT, log: () => {} })).toThrow(
      /wasmSha256/
    );
    expect(fs.readFileSync(path.join(destDir, 'marker.txt'), 'utf8')).toBe('old');
  });

  it('rejects a contract hash mismatch', () => {
    const manifest = readManifest(inputDir);
    manifest.contractSha256 = '0'.repeat(64);
    writeManifest(inputDir, manifest);

    expect(() => validatePackage(inputDir, CONTRACT)).toThrow(/contractSha256/);
  });

  it('rejects a package with a missing file', () => {
    fs.rmSync(path.join(inputDir, 'voxp4-preview.wasm'));
    expect(() => validatePackage(inputDir, CONTRACT)).toThrow(/required package file missing/);
  });

  it('rolls back to the previous complete package if the final swap fails', () => {
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

    expect(() =>
      runSync({
        inputDir,
        destDir,
        contractPath: CONTRACT,
        fsImpl: failingFs,
        log: () => {},
      })
    ).toThrow(/simulated swap failure/);

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
