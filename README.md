# VoxP4 Web Editor

**Offline-First Portable Library Editor for the VoxP4 Ecosystem**

> **Architectural Declaration**:  
> The **VoxP4 Web Editor** is an independent consumer of the VoxP4 Portable Library contract. It does not depend on the `voxP4-control` firmware implementation, C/C++ classes, LVGL widgets, or wire protocol packets. The `.voxp4.json` data specification is the sole boundary between the two systems.

---

## 1. Overview

The **VoxP4 Web Editor** is a visual authoring environment for creating, editing, validating, and maintaining VoxP4 musical performance configurations:

```text
VoxP4 Library (.voxp4.json)
├── Presets (Reusable vocal sounds: Compressor, Gate, Drive, Chorus, Delay, Reverb)
├── Scenes (Song performance units with musical Key, Scale, Tempo, and base preset)
│   └── Subscenes (Song sections: Intro, Verse, Chorus, Bridge, Solo, Outro overrides)
└── Setlists (Ordered live concert setlists, supporting song repetitions)
```

The editor runs entirely in the browser (client-side), operates completely offline without internet or backend dependencies, and produces strictly compliant `.voxp4.json` files executable by physical `voxP4-control` surface hardware.

---

## 2. Architectural Principles & Invariants

1. **Frozen V1 Contract as Truth**: All parameter definitions, ranges, defaults, and schema rules derive directly from the officially frozen Portable Library V1 specification (`contracts/`).
2. **Exact Canonical Lookup**: Parameter identity is strictly `parameter.name`. The editor performs exact matching without ad-hoc alias layers or non-contract enum conversions.
3. **No Wire ID Identity**: Public parameter authoring uses semantic names exclusively (`wireId != parameter identity`). Wire IDs and dense indexes do not exist in the domain model.
4. **Sparse Document Representation**: Presets, Scenes, and Subscenes store **only explicit overrides**; derived/resolved state is computed on the fly and never written to `.voxp4.json`.
5. **Two-Level Validation**:
   - *Level 1 (Structural)*: JSON Schema (Draft-07 via Ajv) checking envelope structure, lengths, capacities.
   - *Level 2 (Semantic)*: Referential integrity (`basePresetId`, `sceneId`), ID uniqueness, bounds checking, canonical enums.
6. **Atomic Import Safety**: Candidate files are fully validated before touching current state. Corrupt files are rejected atomically, leaving current data and history intact.
7. **History Root Reset**: Creating, importing, or restoring a project resets the undo/redo history root, ensuring `Ctrl+Z` never resurrects a replaced document.

---

## 3. Four-Tier Parameter Inheritance Resolution

The parameter resolution hierarchy is evaluated dynamically:

```text
Firmware Default
      ↓
Preset
      ↓
Scene
      ↓
Subscene
      ↓
Resolved Value
```

In the **Parameter Inspector**, each parameter clearly displays its current status:
- `OVERRIDDEN HERE`: Explicit override stored at the current entity tier.
- `INHERITED FROM SCENE`: Value inherited from parent Scene override.
- `INHERITED FROM PRESET`: Value inherited from base Preset.
- `DEFAULT`: Value inherited from firmware default.

Users can toggle `[All parameters (71)]` or `[Overrides only (N)]`, click `+ Override here` to promote any inherited value to an override, or click `Remove override` to revert to inheritance.

---

## 4. Project Structure

```text
voxP4-editor/
├── contracts/                             # Versioned public contracts
│   ├── voxp4-library-v1.schema.json       # Structural JSON Schema (Draft-07)
│   ├── voxp4-parameters-v1.json           # Canonical 71 parameter descriptors
│   ├── portable_library_format_v1.md      # Specification documentation
│   └── CONTRACT_PROVENANCE.md             # Source commit & SHA-256 hashes
├── scripts/
│   └── update-contracts.mjs               # Contract synchronization script
├── examples/
│   └── demo_setlist.voxp4.json            # Canonical reference tour setlist
├── src/
│   ├── domain/                            # Pure domain logic (no React dependencies)
│   │   ├── models.ts                      # TypeScript domain models
│   │   ├── ids.ts                         # Stable ID generator & validation
│   │   ├── catalog.ts                     # ParameterCatalog with exact lookup
│   │   ├── resolution.ts                  # 4-tier pure inheritance resolution
│   │   ├── validation.ts                  # Level 1 + Level 2 validator
│   │   └── serialization.ts               # Deterministic canonical JSON serializer
│   ├── persistence/
│   │   └── draftStorage.ts                # IndexedDB offline draft storage
│   ├── state/
│   │   ├── editorState.ts                 # State reducer, history stack, actions
│   │   └── EditorProvider.tsx             # React context provider & shortcuts
│   ├── components/
│   │   ├── controls/                      # Metadata-driven ParameterControl
│   │   ├── layout/                        # Header, LibraryTree
│   │   ├── editors/                       # Preset, Scene, Subscene, Setlist editors
│   │   ├── inspector/                     # ParameterInspector & resolution chain
│   │   └── modals/                        # ValidationModal, ImportErrorModal
│   ├── fixtures/                          # Canonical demo library fixture
│   ├── App.tsx                            # Stage layout container
│   ├── main.tsx                           # Application entry point
│   └── index.css                          # Tailwind CSS v4 & theme styling
├── tests/                                 # Comprehensive Vitest test suite
├── AGENTS.md                              # Rules and invariants for AI agents
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 5. Getting Started

### Requirements
- Node.js v20+ (tested on Node v24)
- npm v10+

### Installation
```bash
npm install
```

### Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your web browser.

### Production Build
```bash
npm run build
```
Builds the strictly typed, optimized single-page application into `dist/`.

### Run Test Suite
```bash
npm test
```
Executes all 25 test suites (154 unit and integration tests) using Vitest.

### Update Contracts
```bash
npm run update-contracts
# or specify an explicit path:
npm run update-contracts -- --source ../voxP4-control
```

### Verify WASM Artifacts
```bash
npm run verify:wasm
```
Recalculates the real SHA-256 of `src/audio/wasm/voxp4-preview.wasm` and
`contracts/voxp4-parameters-v1.json` and compares them against
`src/audio/wasm/dsp-compatibility.json`. CI runs this before the tests and fails
on any mismatch (WASM changed without manifest, contract changed without manifest,
or an invalid manifest).

### Update the WASM Preview Package
From the `voxP4` repository, `scripts/build-wasm.bat` builds the DSP, generates
`dsp-compatibility.json`, and synchronizes the three-file package into this
editor. To sync an already-built package manually:
```bash
npm run sync-wasm -- <package-dir>
```
The package directory must contain `voxp4-preview.mjs`, `voxp4-preview.wasm`, and
`dsp-compatibility.json`. The sync is transactional (all-or-nothing): the package
is validated, copied to a staging directory, re-validated, and only then swapped
into place with a backup. If the final swap fails, the previous complete package
is restored, so a partial or mismatched update is impossible. Validation covers
hashes, profile, contract version, parameter count, sample rate, and block size.

Official editor artifacts must come from a **clean** `voxP4` worktree; the
generator refuses to emit a manifest from a dirty tree or when the commit
embedded in the WASM does not match `git HEAD`.

---

## 6. Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+Z` / `Cmd+Z` | Undo last action |
| `Ctrl+Shift+Z` / `Ctrl+Y` / `Cmd+Shift+Z` | Redo action |

---

## 7. Contract Provenance

The public contract files in `contracts/` were obtained from:
- **Repository**: `ovelhaaa/voxp4-control`
- **Commit**: `0424145c7baa11e9c8bc472ae29546f8c62530fd`
- **Checksums**: Verified via SHA-256 in `contracts/CONTRACT_PROVENANCE.md`
