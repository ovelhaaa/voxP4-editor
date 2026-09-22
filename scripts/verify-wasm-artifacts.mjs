#!/usr/bin/env node
/**
 * Verifies that the committed WASM preview package is internally consistent:
 *
 *   - src/audio/wasm/voxp4-preview.mjs exists
 *   - src/audio/wasm/voxp4-preview.wasm exists and its SHA-256 matches manifest.wasmSha256
 *   - contracts/voxp4-parameters-v1.json SHA-256 matches manifest.contractSha256
 *   - manifest declares the expected engine/profile/contract/parameter/rate/block metadata
 *
 * Exits with a non-zero code (and a clear message) on any mismatch, so CI fails
 * if the WASM, the contract, or the manifest drift apart.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const MANIFEST_PATH = path.join(repoRoot, 'src', 'audio', 'wasm', 'dsp-compatibility.json');
const WASM_PATH = path.join(repoRoot, 'src', 'audio', 'wasm', 'voxp4-preview.wasm');
const MJS_PATH = path.join(repoRoot, 'src', 'audio', 'wasm', 'voxp4-preview.mjs');
const CONTRACT_PATH = path.join(repoRoot, 'contracts', 'voxp4-parameters-v1.json');

const EXPECTED = {
  engine: 'voxP4',
  profile: 'P4Production',
  contractVersion: 1,
  parameterCount: 71,
  sampleRate: 48000,
  blockSize: 64,
};

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`[verify:wasm] FAIL - ${message}`);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} not found at ${path.relative(repoRoot, filePath)}`);
    return false;
  }
  return true;
}

if (!requireFile(MANIFEST_PATH, 'DSP compatibility manifest')) {
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

for (const [key, expected] of Object.entries(EXPECTED)) {
  if (manifest[key] !== expected) {
    fail(`manifest.${key} is ${JSON.stringify(manifest[key])}, expected ${JSON.stringify(expected)}`);
  }
}

if (!requireFile(WASM_PATH, 'WASM binary')) process.exit(1);
if (!requireFile(MJS_PATH, 'WASM ES module')) process.exit(1);
if (!requireFile(CONTRACT_PATH, 'Parameter contract')) process.exit(1);

const wasmSha256 = sha256(WASM_PATH);
const contractSha256 = sha256(CONTRACT_PATH);

if (typeof manifest.wasmSha256 !== 'string' || manifest.wasmSha256.length !== 64) {
  fail('manifest.wasmSha256 is missing or not a 64-char hex digest');
} else if (manifest.wasmSha256 !== wasmSha256) {
  fail(
    `WASM SHA-256 mismatch.\n` +
      `    manifest.wasmSha256 : ${manifest.wasmSha256}\n` +
      `    actual             : ${wasmSha256}\n` +
      `    Rebuild the WASM (voxP4) and run scripts/sync-wasm.mjs, or regenerate the manifest.`
  );
}

if (typeof manifest.contractSha256 !== 'string' || manifest.contractSha256.length !== 64) {
  fail('manifest.contractSha256 is missing or not a 64-char hex digest');
} else if (manifest.contractSha256 !== contractSha256) {
  fail(
    `Contract SHA-256 mismatch.\n` +
      `    manifest.contractSha256 : ${manifest.contractSha256}\n` +
      `    actual                 : ${contractSha256}\n` +
      `    Update contracts via 'npm run update-contracts' and regenerate the WASM manifest.`
  );
}

if (typeof manifest.dspCommit !== 'string' || manifest.dspCommit.length === 0) {
  fail('manifest.dspCommit is missing');
}

if (failures.length > 0) {
  console.error(`\n[verify:wasm] ${failures.length} verification error(s).`);
  process.exit(1);
}

console.log('[verify:wasm] OK');
console.log(`  wasmSha256     = ${wasmSha256}`);
console.log(`  contractSha256 = ${contractSha256}`);
console.log(`  dspCommit      = ${manifest.dspCommit}`);
