import React from 'react';
import { useEditor } from '../../state/editorState';
import { PresetEditor } from './PresetEditor';
import { SceneEditor } from './SceneEditor';
import { SubsceneEditor } from './SubsceneEditor';
import { SetlistEditor } from './SetlistEditor';
import { Sliders, Mic, Music, ListOrdered } from 'lucide-react';

export const MainEditor: React.FC = () => {
  const { state, dispatch } = useEditor();
  const { selection, library } = state;

  if (selection.type === 'preset') {
    const preset = library.presets.find((p) => p.id === selection.id);
    if (preset) {
      return <PresetEditor preset={preset} />;
    }
  }

  if (selection.type === 'scene') {
    const scene = library.scenes.find((s) => s.id === selection.id);
    if (scene) {
      return <SceneEditor scene={scene} />;
    }
  }

  if (selection.type === 'subscene') {
    const scene = library.scenes.find((s) => s.id === selection.id);
    const subscene = scene?.subscenes.find((sub) => sub.id === selection.subsceneId);
    if (scene && subscene) {
      return <SubsceneEditor scene={scene} subscene={subscene} />;
    }
  }

  if (selection.type === 'setlist') {
    const setlist = library.setlists.find((st) => st.id === selection.id);
    if (setlist) {
      return <SetlistEditor setlist={setlist} />;
    }
  }

  // Fallback: Library Overview
  return (
    <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center text-center space-y-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
        <Sliders className="w-8 h-8" />
      </div>
      <div>
        <h2 className="text-xl font-bold text-slate-100">{library.name}</h2>
        <p className="text-xs text-slate-400 font-mono mt-1">ID: {library.libraryId}</p>
      </div>
      <p className="text-sm text-slate-400 max-w-md">
        Select a Preset, Scene (Song), or Setlist from the left sidebar to start editing your performance configuration.
      </p>

      <div className="grid grid-cols-3 gap-4 pt-4 max-w-lg w-full">
        <button
          type="button"
          onClick={() => {
            if (library.presets[0]) {
              dispatch({
                type: 'SET_SELECTION',
                selection: { type: 'preset', id: library.presets[0].id },
              });
            }
          }}
          className="bg-slate-900 border border-slate-800 hover:border-blue-500/50 p-4 rounded-xl text-center space-y-1 transition"
        >
          <Mic className="w-5 h-5 text-blue-400 mx-auto" />
          <div className="text-xs font-bold text-slate-200">Presets</div>
          <div className="text-[11px] text-slate-500 font-mono">{library.presets.length} configured</div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (library.scenes[0]) {
              dispatch({
                type: 'SET_SELECTION',
                selection: { type: 'scene', id: library.scenes[0].id },
              });
            }
          }}
          className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 p-4 rounded-xl text-center space-y-1 transition"
        >
          <Music className="w-5 h-5 text-emerald-400 mx-auto" />
          <div className="text-xs font-bold text-slate-200">Scenes</div>
          <div className="text-[11px] text-slate-500 font-mono">{library.scenes.length} songs</div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (library.setlists[0]) {
              dispatch({
                type: 'SET_SELECTION',
                selection: { type: 'setlist', id: library.setlists[0].id },
              });
            }
          }}
          className="bg-slate-900 border border-slate-800 hover:border-purple-500/50 p-4 rounded-xl text-center space-y-1 transition"
        >
          <ListOrdered className="w-5 h-5 text-purple-400 mx-auto" />
          <div className="text-xs font-bold text-slate-200">Setlists</div>
          <div className="text-[11px] text-slate-500 font-mono">{library.setlists.length} shows</div>
        </button>
      </div>
    </div>
  );
};
