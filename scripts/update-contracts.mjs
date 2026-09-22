#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Default relative source path if not provided via --source
const args = process.argv.slice(2);
let sourceDir = path.resolve(projectRoot, '../voxP4-control');
const sourceIdx = args.indexOf('--source');
if (sourceIdx !== -1 && args[sourceIdx + 1]) {
  sourceDir = path.resolve(process.cwd(), args[sourceIdx + 1]);
}

console.log(`[update-contracts] Source directory: ${sourceDir}`);
if (!fs.existsSync(sourceDir)) {
  console.error(`Error: Source directory not found: ${sourceDir}`);
  process.exit(1);
}

const filesToCopy = [
  {
    src: 'schemas/voxp4-library-v1.schema.json',
    dest: 'contracts/voxp4-library-v1.schema.json',
  },
  {
    src: 'schemas/voxp4-parameters-v1.json',
    dest: 'contracts/voxp4-parameters-v1.json',
  },
  {
    src: 'docs/portable_library_format_v1.md',
    dest: 'contracts/portable_library_format_v1.md',
  },
];

for (const item of filesToCopy) {
  const fullSrc = path.join(sourceDir, item.src);
  const fullDest = path.join(projectRoot, item.dest);
  if (!fs.existsSync(fullSrc)) {
    console.error(`Error: Expected source file not found: ${fullSrc}`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(fullDest), { recursive: true });
  fs.copyFileSync(fullSrc, fullDest);
  console.log(`Copied ${item.src} -> ${item.dest}`);
}

// Get git commit info from source if it's a git repo
let commitHash = 'unknown';
let commitDate = 'unknown';
let commitSubject = 'unknown';
try {
  commitHash = execSync('git log -1 --format="%H"', { cwd: sourceDir }).toString().trim();
  commitDate = execSync('git log -1 --format="%ci"', { cwd: sourceDir }).toString().trim();
  commitSubject = execSync('git log -1 --format="%s"', { cwd: sourceDir }).toString().trim();
} catch {
  console.warn('[update-contracts] Could not retrieve git log from source directory');
}

// Compute hashes
const hashes = filesToCopy.map((item) => {
  const fullDest = path.join(projectRoot, item.dest);
  const buf = fs.readFileSync(fullDest);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  return { ...item, hash };
});

const provenanceContent = `# VoxP4 Portable Library V1 Contract Provenance

## Source Repository
- **Source Directory**: \`${sourceDir}\`
- **Commit**: \`${commitHash}\`
- **Commit Date**: \`${commitDate}\`
- **Commit Subject**: \`${commitSubject}\`
- **Last Synchronized**: \`${new Date().toISOString()}\`

## Versioned Files and Checksums (SHA-256)

| File | Source Path in \`voxp4-control\` | SHA-256 Checksum |
| :--- | :--- | :--- |
${hashes.map((h) => `| \`${h.dest}\` | \`${h.src}\` | \`${h.hash}\` |`).join('\n')}

## Update Instructions

To update or re-synchronize these contracts from a local checkout of \`voxp4-control\`:

\`\`\`bash
npm run update-contracts -- --source ../voxP4-control
\`\`\`
`;

fs.writeFileSync(path.join(projectRoot, 'contracts/CONTRACT_PROVENANCE.md'), provenanceContent, 'utf8');
console.log('[update-contracts] Successfully updated contracts and CONTRACT_PROVENANCE.md');
