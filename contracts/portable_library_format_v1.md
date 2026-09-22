# VoxP4 Portable Library Format — Version 1 (V1) Frozen Specification

## 1. Overview and Purpose

The **VoxP4 Portable Library Format (V1)** is the public, language-agnostic data contract for storing and exchanging musical performance configurations within the VoxP4 ecosystem.

This specification enables external authoring tools (such as future Web Editors, desktop library managers, mobile companion apps, and command-line scripts) to create, inspect, edit, version, and validate VoxP4 project files that can be directly imported and executed by the `voxP4-control` physical surface and any future runtimes.

### Core Architectural Invariant
> **The portable library format represents the musical and performance state of the VoxP4 vocal processor.**  
> It is strictly decoupled from C++ implementation classes, LVGL widgets, GUI screen layout, and raw VoxLink wire protocol packets.

---

## 2. File Identification & Encoding

- **Format Identifier**: `voxp4-library`
- **Format Version**: `1` (Exact match required for V1; unsupported versions are rejected atomically)
- **Schema Version**: `1` (Exact match required for frozen V1 specification)
- **Character Encoding**: UTF-8 without Byte Order Mark (BOM).
- **File Extensions**: `.voxp4.json` (recommended) or `.json`.
- **MIME Type**: `application/vnd.voxp4.library+json` or `application/json`.
- **Determinism**: Serializers emit fields in canonical order with 2-space indentation to facilitate Git diffs, human readability, and deterministic round-tripping.
- **Maximum File Size**: 131,072 bytes (128 KB).

---

## 3. Object Identification & Identity Rules

All top-level entities (`Preset`, `Scene`, `Subscene`, `Setlist`, `SetlistEntry`) possess a persistent string identifier (`id`):
- **Immutability**: An `id` is an immutable, opaque string. Renaming an object's display `name` MUST NOT change its `id`.
- **Uniqueness**:
  - `Preset` IDs must be unique across `presets[]`.
  - `Scene` IDs must be unique across `scenes[]`.
  - `Subscene` IDs must be unique within their parent `Scene.subscenes[]`.
  - `Setlist` IDs must be unique across `setlists[]`.
  - `SetlistEntry` IDs must be unique within their parent `Setlist.entries[]`.
- **Format**:
  - Semantic slug format is recommended: lowercase alphanumeric words separated by hyphens (e.g. `"preset-wide-vocal"`, `"scene-creep"`, `"subscene-chorus-lead"`).
  - Standard UUID strings (e.g. `"a8098c1a-f86e-11da-bd1a-00112444be1e"`) are fully valid and supported.
  - Length: minimum 1 character, maximum 64 characters.
  - Array indices MUST NOT be used as persistent identities.

---

## 4. Domain Model Schema

A portable library file is a single JSON object structured as follows:

```json
{
  "format": "voxp4-library",
  "formatVersion": 1,
  "schemaVersion": 1,
  "libraryId": "rig-tour-2026",
  "name": "Live Tour Rig 2026",
  "presets": [ ... ],
  "scenes": [ ... ],
  "setlists": [ ... ]
}
```

### 4.1. Top-Level Fields

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `format` | string | Yes | Must be `"voxp4-library"`. |
| `formatVersion` | integer | Yes | Must be `1` for this frozen specification. |
| `schemaVersion` | integer | Yes | Semantic schema revision (must be `1`). |
| `libraryId` | string | Yes | Stable, opaque identifier for the entire library (1..64 chars). |
| `name` | string | Yes | Human-readable title of the library (1..64 chars). |
| `presets` | array | Yes | Array of reusable Preset objects (max 64). |
| `scenes` | array | Yes | Array of Scene (song/performance) objects (max 64). |
| `setlists` | array | Yes | Array of Setlist objects (max 16). |

Structural objects reject unrecognized envelope fields (`"additionalProperties": false`).

---

### 4.2. Preset Object

A `Preset` represents a reusable sound configuration.

```json
{
  "id": "preset-wide-vocal",
  "name": "Wide Vocal",
  "parameters": {
    "HarmonyEnable": true,
    "HarmonyLevel": 0.85,
    "ChorusMode": "Microshift",
    "ChorusMix": 0.35,
    "ChorusMicroshiftLeftCents": -7.0,
    "ChorusMicroshiftRightCents": 9.0,
    "ReverbWet": 0.22
  }
}
```

- `id`: Unique string ID (1..64 chars).
- `name`: Display name (1..64 chars).
- `parameters`: Sparse object mapping semantic parameter names to values. Does not need to include all 71 parameters.

---

### 4.3. Scene Object

A `Scene` represents an autonomous performance unit (e.g. a song, spoken word segment, or special acoustic texture).

```json
{
  "id": "scene-song-a",
  "name": "Song A",
  "basePresetId": "preset-wide-vocal",
  "metadata": {
    "artist": "The Band",
    "notes": "Intro starts with acoustic guitar",
    "tags": "live, ballad"
  },
  "parameters": {
    "TempoBpm": 95.0,
    "HarmonyKey": "E",
    "HarmonyScale": "Major"
  },
  "subscenes": [ ... ]
}
```

- `id`: Unique string ID (1..64 chars).
- `name`: Display name of the scene (1..64 chars).
- `basePresetId`: (Optional) ID of a preset in `presets[]` to inherit from.
- `metadata`: (Optional) Freeform non-DSP metadata: `artist`, `notes`, `tags` (extensible with custom string fields).
  - **Musical Notice**: Musical properties such as tempo, tonal key, and scale MUST NOT be placed in `metadata`. They exist strictly as parameters (`TempoBpm`, `HarmonyKey`, `HarmonyScale`).
- `parameters`: (Optional) Sparse overrides applied on top of the base preset.
- `subscenes`: Ordered array of `Subscene` objects (max 16).

---

### 4.4. Subscene Object

A `Subscene` represents a section or variation within a scene (e.g. Intro, Verse, Chorus, Bridge, Solo).

```json
{
  "id": "song-a-chorus",
  "name": "Chorus",
  "parameters": {
    "HarmonyEnable": true,
    "DelayEnable": true,
    "DelayWet": 0.24,
    "ReverbWet": 0.30
  }
}
```

- `id`: Unique string ID within the scene (1..64 chars).
- `name`: Display name (1..64 chars).
- `parameters`: Sparse overrides applied on top of the scene and preset.

---

### 4.5. Setlist & SetlistEntry Object

A `Setlist` defines an ordered sequence of Scenes for live performance.

```json
{
  "id": "setlist-tour-night-1",
  "name": "Tour Night 1",
  "entries": [
    {
      "id": "entry-1",
      "sceneId": "scene-song-a"
    },
    {
      "id": "entry-2",
      "sceneId": "scene-song-b"
    },
    {
      "id": "entry-3",
      "sceneId": "scene-song-a"
    }
  ]
}
```

- Max setlists: 16. Max entries per setlist: 64.
- A scene may appear multiple times in the same setlist. Each occurrence has its own unique entry `id`.
- `sceneId` must reference a valid `id` in `scenes[]`.

---

## 5. Parameter Contract & Canonical Enums

The full parameter catalog is machine-readable in [`schemas/voxp4-parameters-v1.json`](file:///c:/progs/VoxP4/voxP4-control/schemas/voxp4-parameters-v1.json).

### 5.1. Naming Conventions
- Primary format: PascalCase semantic names (`"TempoBpm"`, `"HarmonyEnable"`, `"ChorusMode"`, `"ReverbWet"`).
- Dot-notation keys (`"tempo.bpm"`, `"harmony.enable"`) are accepted by the parser for developer convenience.

### 5.2. Strict Enum Rules
All 11 enum parameters serialize and deserialize strictly using canonical string labels. Numeric integer fallback during serialization is forbidden:
1. `HarmonyMode`: `"Fixed"`, `"Diatonic"`, `"Midi"`
2. `HarmonyKey`: `"C"`, `"C#"`, `"D"`, `"D#"`, `"E"`, `"F"`, `"F#"`, `"G"`, `"G#"`, `"A"`, `"A#"`, `"B"` (aliases like `"Db"`, `"Eb"`, `"Gb"`, `"Ab"`, `"Bb"` are parsed to their sharp equivalents).
3. `HarmonyScale`: `"Major"`, `"NaturalMinor"`, `"HarmonicMinor"`, `"MelodicMinor"`, `"Dorian"`, `"Phrygian"`, `"Lydian"`, `"Mixolydian"`, `"Locrian"`, `"MajorPentatonic"`, `"MinorPentatonic"`, `"BluesMinor"` (aliases `"minor"` -> NaturalMinor, `"blues"` -> BluesMinor).
4. `HarmonyVoice1NonScalePolicy`: `"Nearest"`, `"Chromatic"`, `"Bypass"`
5. `DelayLeftSubdivision`, `DelayRightSubdivision`, `ChorusSubdivision`:
   `"Whole"`, `"Half"`, `"Quarter"`, `"Eighth"`, `"Sixteenth"`, `"ThirtySecond"`, `"DottedHalf"`, `"DottedQuarter"`, `"DottedEighth"`, `"DottedSixteenth"`, `"TripletQuarter"`, `"TripletEighth"`, `"TripletSixteenth"`
6. `OutputSpatialRouting`: `"Parallel"`, `"DelayIntoReverb"`
7. `OutputSpatialSource`: `"Input"`, `"PostDynamics"`, `"PostHarmony"`
8. `ChorusMode`: `"Chorus"`, `"Ensemble"`, `"Dimension"`, `"Microshift"`
9. `DriveMode`: `"Warm"`, `"Overdrive"`, `"Megaphone"` (aliases `"crunch"`, `"lead"`).

---

## 6. Two-Level Validation Architecture

Validation is explicitly divided into two decoupled layers:

### Level 1 — Structural Validation (JSON Schema)
Enforced by [`schemas/voxp4-library-v1.schema.json`](file:///c:/progs/VoxP4/voxP4-control/schemas/voxp4-library-v1.schema.json):
- JSON syntax validity.
- Required envelope keys (`format`, `formatVersion`, `libraryId`, `name`).
- Exact version values (`formatVersion == 1`, `schemaVersion == 1`).
- Array size limits (`presets <= 64`, `scenes <= 64`, `subscenes <= 16`, `setlists <= 16`, `entries <= 64`).
- String length bounds (`1..64` chars).
- No unknown envelope properties (`additionalProperties: false`).

### Level 2 — Semantic Validation (Firmware Runtime)
Enforced by `LibraryValidator` and `ParameterRegistry`:
- Referential integrity: all `scene.basePresetId` exist in `presets[]`; all `setlist.entry.sceneId` exist in `scenes[]`.
- Uniqueness: no duplicate IDs across presets, scenes, subscenes within a scene, setlists, or entries within a setlist.
- Parameter bounds: all numbers within $[min, max]$.
- Unknown parameter policy: unknown parameters trigger validation failure (Strict Import) to prevent silent parameter loss during live performance.
- Enum validation: unknown enum strings are rejected.

---

## 7. Memory Model & Runtime Independence

The CYD firmware runtime uses a **fixed-capacity sparse override representation** (`CompactParamSet`):
- A 71-bit bitset (10 bytes) tracking parameter presence.
- A fixed array of 71 typed `ParameterValue` slots.
- Total memory per override set: ~292 bytes.
- Zero heap allocation, zero node fragmentation, $O(1)$ random access.
- Total RAM for a realistic 10-song setlist: **~26 KB**, leaving **>240 KB free heap** on the ESP32.

---

## 8. Web Editor Integration Contract

An external Web Editor or authoring tool should follow these rules:
1. Fetch [`schemas/voxp4-parameters-v1.json`](file:///c:/progs/VoxP4/voxP4-control/schemas/voxp4-parameters-v1.json) to populate effect UI controls, sliders, ranges, and enum dropdowns.
2. Build the document as a standard JSON object adhering to [`schemas/voxp4-library-v1.schema.json`](file:///c:/progs/VoxP4/voxP4-control/schemas/voxp4-library-v1.schema.json).
3. Always emit `format: "voxp4-library"`, `formatVersion: 1`, `schemaVersion: 1`.
4. Use stable semantic slugs for IDs (e.g. `scene-song-title`).
5. Only write overrides into `parameters` that differ from the parent tier or default.
6. Validate the export against the schema before saving as `.voxp4.json`.
7. Import into the CYD via the atomic import pipeline: if the file contains any structural or semantic error, the CYD rejects it completely and keeps the previous valid library intact.
