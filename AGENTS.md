# Rules and Architecture Guidelines for AI Agents Working on VoxP4 Web Editor

Welcome, Agent. This repository is the official independent web editor for the **VoxP4 Portable Library V1 Format**.
Before contributing, modifying, or refactoring this codebase, you **must adhere to the following invariants**:

---

## 1. Frozen Public Contract (V1)
- The files in `contracts/` represent the officially frozen V1 contract from `ovelhaaa/voxp4-control` (Commit `0424145c7baa11e9c8bc472ae29546f8c62530fd`).
- **Never modify `contracts/voxp4-library-v1.schema.json` or `contracts/voxp4-parameters-v1.json` manually or silently.**
- Any updates to contracts must be performed via `npm run update-contracts` and documented in `contracts/CONTRACT_PROVENANCE.md`.

---

## 2. No Metadata Duplication
- Parameter definitions (names, types, ranges, step, unit, defaults, enum lists) **must strictly derive from `voxp4-parameters-v1.json` via `ParameterCatalog`**.
- Do NOT hardcode parameter ranges, lists, or enums into React components.
- Do NOT create 71 individual parameter input components. All controls must be dynamically rendered via `ParameterControl` driven by descriptor metadata.

---

## 3. Parameter Identity: Semantic Names (NO Wire IDs, NO Dense Indexes)
- The public identity of a parameter in the Web Editor is strictly its **canonical semantic name** (`parameter.name`, e.g. `TempoBpm`, `ChorusMode`, `ReverbWet`).
- Wire IDs (`uint16_t`) and dense indexes (`0..70`) are CYD firmware implementation details and belong exclusively to the runtime or future sync protocols.
- **Never** use wire IDs as dictionary keys, property names, or authoring identities in the web application (`wireId != parameter identity`).
- Automated tests enforce that `ParameterCatalog` has no `getByWireId` and that `src/` never indexes by wire ID.

---

## 4. Exact Canonical Lookup (NO Ad-hoc Aliases)
- The frozen contract is the sole source of truth.
- Parameter names and enum strings use exact canonical matching.
- Do not introduce non-contract alias layers (e.g. `ReverbMix -> ReverbWet` or `minor -> NaturalMinor`) in the editor. If a file contains unknown parameter names or invalid enum values, it is a validation error.

---

## 5. Sparse Overrides Only (Never Persist Resolved State)
- The document format is strictly sparse.
- `Preset`, `Scene`, and `Subscene` store **only explicit overrides** in their `parameters` map.
- If a Scene inherits `ReverbWet = 0.20` from its base preset, do NOT serialize `"ReverbWet": 0.20` into the Scene's JSON.
- Resolved parameter state (`resolveParameterState`) is purely derived runtime state and must **never** be written to disk or `.voxp4.json`.

---

## 6. Stable and Immutable Identifiers (IDs)
- All entities (`Preset`, `Scene`, `Subscene`, `Setlist`, `SetlistEntry`) have persistent, stable string IDs.
- Renaming an object's display `name` **must never** change its `id`.
- Never use array indices as entity identities.
- In a Setlist, a Scene may appear multiple times; each `SetlistEntry` possesses its own unique `id` independent of `sceneId`.

---

## 7. Two-Level Validation Architecture
- **Level 1 (Structural)**: JSON Schema validation via `ajv` checking envelope structure, types, string length bounds (1..64), and array capacities ($\le$ 64 presets, $\le$ 64 scenes, $\le$ 16 subscenes, $\le$ 16 setlists, $\le$ 64 entries).
- **Level 2 (Semantic)**: Checks referential integrity (`basePresetId`, `sceneId`), duplicate IDs, parameter bounds ($min \le val \le max$), and canonical enum strings.
- Validation separates **Errors** (which block export) from **Warnings** (which inform the user but do not block export).

---

## 8. Atomic Import & History Root Reset
- When importing a file, candidate data is parsed and validated **before** touching the current project. If invalid, the import is rejected atomically, leaving current data and history 100% intact.
- When a new project is created, imported, or restored from draft, a **new history root** is established. `Ctrl+Z` must never resurrect a previously replaced library.

---

## 9. Contract Independence & Zero C++ Dependencies
- The Web Editor is a completely decoupled web application.
- It must never import or depend on C/C++ files, LVGL, Arduino, ESP-IDF, PlatformIO, or firmware headers.
- The build must succeed with only Web Editor source code + public JSON contracts.
