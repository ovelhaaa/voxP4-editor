import { VoxP4Library } from '../domain/models';

export const canonicalDemoLibrary: VoxP4Library = {
  format: 'voxp4-library',
  formatVersion: 1,
  schemaVersion: 1,
  libraryId: 'arena-world-tour',
  name: 'Arena World Tour 2026',
  presets: [
    {
      id: 'preset-studio-dry',
      name: 'Studio Dry Vocal',
      parameters: {
        HarmonyEnable: false,
        CompressorEnable: true,
        CompressorThresholdDb: -20.0,
        CompressorRatio: 4.0,
        GateEnable: true,
        GateThresholdDb: -50.0,
        ReverbEnable: true,
        ReverbWet: 0.1,
        DelayEnable: false,
      },
    },
    {
      id: 'preset-stadium-shimmer',
      name: 'Stadium Shimmer',
      parameters: {
        HarmonyEnable: true,
        HarmonyLevel: 0.75,
        HarmonyVoice1Pan: 0.25,
        ReverbEnable: true,
        ReverbWet: 0.35,
        ReverbDecayS: 3.5,
        DelayEnable: true,
        DelayWet: 0.2,
        DelayFeedback: 0.35,
        ChorusMode: 'Chorus',
        ChorusMix: 0.25,
      },
    },
  ],
  scenes: [
    {
      id: 'scene-hallelujah',
      name: 'Hallelujah',
      basePresetId: 'preset-studio-dry',
      metadata: {
        artist: 'Leonard Cohen',
        notes: '12/8 ballad in C',
      },
      parameters: {
        TempoBpm: 54.0,
        HarmonyKey: 'C',
        HarmonyScale: 'Major',
      },
      subscenes: [
        {
          id: 'hal-verse-1',
          name: 'Verse 1',
          parameters: {
            HarmonyEnable: false,
            ReverbWet: 0.12,
          },
        },
        {
          id: 'hal-chorus-1',
          name: 'Chorus 1',
          parameters: {
            HarmonyEnable: true,
            HarmonyInterval: 4,
            ReverbWet: 0.25,
          },
        },
        {
          id: 'hal-verse-2',
          name: 'Verse 2',
          parameters: {
            HarmonyEnable: false,
            ReverbWet: 0.14,
          },
        },
        {
          id: 'hal-climax-chorus',
          name: 'Climax Chorus',
          parameters: {
            HarmonyEnable: true,
            HarmonyInterval: 7,
            HarmonyLevel: 0.95,
            DelayEnable: true,
            DelayWet: 0.28,
            ReverbWet: 0.4,
          },
        },
      ],
    },
    {
      id: 'scene-sound-of-silence',
      name: 'Sound of Silence',
      basePresetId: 'preset-stadium-shimmer',
      metadata: {
        artist: 'Disturbed Style',
        notes: 'Starts whispered, ends towering',
      },
      parameters: {
        TempoBpm: 86.0,
        HarmonyKey: 'D#',
        HarmonyScale: 'NaturalMinor',
      },
      subscenes: [
        {
          id: 'silence-intro',
          name: 'Whisper Intro',
          parameters: {
            HarmonyEnable: false,
            ReverbWet: 0.22,
            DelayEnable: false,
          },
        },
        {
          id: 'silence-epic-end',
          name: 'Epic Outro',
          parameters: {
            HarmonyEnable: true,
            HarmonyLevel: 1.0,
            DelayEnable: true,
            DelayWet: 0.35,
            ReverbWet: 0.45,
            DriveEnable: true,
            DriveMix: 0.3,
          },
        },
      ],
    },
  ],
  setlists: [
    {
      id: 'setlist-encore',
      name: 'Encore Set',
      entries: [
        {
          id: 'enc-1',
          sceneId: 'scene-hallelujah',
        },
        {
          id: 'enc-2',
          sceneId: 'scene-sound-of-silence',
        },
      ],
    },
  ],
};
