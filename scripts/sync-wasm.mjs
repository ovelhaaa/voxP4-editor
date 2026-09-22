#!/usr/bin/env node
/**
 * Atomically updates the committed WASM preview package in
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
 * The package is fully validated BEFORE any file is replaced. There is no
 * partial update: if any check fails, the current editor artifacts are untouched.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const DEST_DIR = path.join(repoRoot, 'src', 'audio', 'wasm');
const CONTRACT_PATH = path.join(repoRoot, 'contracts', 'voxp4-parameters-v1.json');

const REQUIRED_FILES = ['voxp4-preview.mjs', 'voxp4-preview.wasm', 'dsp-compatibility.json'];
const EXPECTED = {
  engine: 'voxP4',
  profile: 'P4Production',
  contractVersion: 1,
  parameterCount: 71,
  sampleRate: 48000,
  blockSize: 64,
};

function die(message) {
  console.error(`[sync-wasm] ERROR - ${message}`);
  process.exit(1);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const inputDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!inputDir) {
  die('missing <package-dir> argument.\nUsage: node scripts/sync-wasm.mjs <package-dir>');
}
if (!fs.existsSync(inputDir) || !fs.statSync(inputDir).isDirectory()) {
  die(`package directory not found: ${inputDir}`);
}

for (const file of REQUIRED_FILES) {
  const filePath = path.join(inputDir, file);
  if (!fs.existsSync(filePath)) {
    die(`required package file missing: ${file}`);
  }
}

const manifestPath = path.join(inputDir, 'dsp-compatibility.json');
const wasmPath = path.join(inputDir, 'voxp4-preview.wasm');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const [key, expected] of Object.entries(EXPECTED)) {
  if (manifest[key] !== expected) {
    die(`manifest.${key} is ${JSON.stringify(manifest[key])}, expected ${JSON.stringify(expected)}`);
  }
}

const actualWasmSha = sha256(wasmPath);
if (manifest.wasmSha256 !== actualWasmSha) {
  die(
    `manifest.wasmSha256 does not match the package WASM.\n` +
      `  manifest : ${manifest.wasmSha256}\n` +
      `  actual   : ${actualWasmSha}`
  );
}

if (!fs.existsSync(CONTRACT_PATH)) {
  die(`editor contract not found at ${CONTRACT_PATH}`);
}
const editorContractSha = sha256(CONTRACT_PATH);
if (manifest.contractSha256 !== editorContractSha) {
  die(
    `package manifest contractSha256 does not match the editor contract.\n` +
      `  manifest        : ${manifest.contractSha256}\n` +
      `  editor contract : ${editorContractSha}\n` +
      `  The WASM package was built against a different parameter contract version.`
  );
}

if (typeof manifest.dspCommit !== 'string' || manifest.dspCommit.length === 0) {
  die('manifest.dspCommit is missing');
}

// ---- All validation passed: stage then atomically swap. ----
if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}

const staged = [];
for (const file of REQUIRED_FILES) {
  const src = path.join(inputDir, file);
  const staging = path.join(DEST_DIR, `.${file}.staging-${process.pid}`);
  fs.copyFileSync(src, staging);
  staged.push({ file, staging, final: path.join(DEST_DIR, file) });
}

try {
  for (const { staging, final } of staged) {
    fs.renameSync(staging, final);
  }
} catch (err) {
  for (const { staging } of staged) {
    if (fs.existsSync(staging)) fs.unlinkSync(staging);
  }
  die(`failed while committing files: ${err.message}`);
}

console.log('[sync-wasm] OK');
for (const file of REQUIRED_FILES) {
  console.log(`  updated ${path.relative(repoRoot, path.join(DEST_DIR, file))}`);
}
console.log(`  dspCommit = ${manifest.dspCommit}`);
