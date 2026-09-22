import React, { useState, useMemo } from 'react';
import { useEditor } from '../../state/editorState';
import { catalog } from '../../domain/catalog';
import { resolveParameterState, ParameterSource } from '../../domain/resolution';
import { ParameterControl } from '../controls/ParameterControl';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { ParameterValue } from '../../domain/models';

export const ParameterInspector: React.FC = () => {
  const { state, dispatch } = useEditor();
  const { selection, library } = state;

  const [filterMode, setFilterMode] = useState<'all' | 'overrides'>('all');
  const [activeGroup, setActiveGroup] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Find active entity and contextual objects for resolution
  const context = useMemo(() => {
    if (selection.type === 'preset') {
      const preset = library.presets.find((p) => p.id === selection.id);
      return {
        type: 'preset' as const,
        preset,
        scene: undefined,
        subscene: undefined,
        currentLevel: 'preset' as const,
        title: preset?.name || 'Preset',
        id: preset?.id || '',
        params: preset?.parameters || {},
      };
    }

    if (selection.type === 'scene') {
      const scene = library.scenes.find((s) => s.id === selection.id);
      const preset = library.presets.find((p) => p.id === scene?.basePresetId);
      return {
        type: 'scene' as const,
        preset,
        scene,
        subscene: undefined,
        currentLevel: 'scene' as const,
        title: scene?.name || 'Scene',
        id: scene?.id || '',
        params: scene?.parameters || {},
      };
    }

    if (selection.type === 'subscene') {
      const scene = library.scenes.find((s) => s.id === selection.id);
      const preset = library.presets.find((p) => p.id === scene?.basePresetId);
      const subscene = scene?.subscenes.find((sub) => sub.id === selection.subsceneId);
      return {
        type: 'subscene' as const,
        preset,
        scene,
        subscene,
        currentLevel: 'subscene' as const,
        title: `${scene?.name || 'Scene'} → ${subscene?.name || 'Section'}`,
        id: subscene?.id || '',
        params: subscene?.parameters || {},
      };
    }

    return null;
  }, [selection, library]);

  // Resolve all parameters for the current context
  const resolvedList = useMemo(() => {
    if (!context) return [];
    return catalog.getAllParameters().map((desc) => {
      const resolved = resolveParameterState({
        name: desc.name,
        preset: context.preset,
        scene: context.scene,
        subscene: context.subscene,
        currentLevel: context.currentLevel,
      });
      return resolved;
    });
  }, [context]);

  // Filter list based on filterMode, group, and search query
  const filteredList = useMemo(() => {
    return resolvedList.filter((item) => {
      if (filterMode === 'overrides' && !item.isOverriddenHere) {
        return false;
      }
      if (activeGroup !== 'all' && item.descriptor.group !== activeGroup) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchDisplay = item.descriptor.display.toLowerCase().includes(q);
        const matchKey = item.descriptor.key.toLowerCase().includes(q);
        if (!matchName && !matchDisplay && !matchKey) {
          return false;
        }
      }
      return true;
    });
  }, [resolvedList, filterMode, activeGroup, searchQuery]);

  const overrideCount = useMemo(() => {
    return resolvedList.filter((item) => item.isOverriddenHere).length;
  }, [resolvedList]);

  if (!context) {
    return (
      <div className="w-80 bg-slate-900 border-l border-slate-800 p-6 flex flex-col items-center justify-center text-center text-slate-400">
        <SlidersHorizontal className="w-10 h-10 mb-2 opacity-30" />
        <p className="text-sm font-medium">Select a Preset, Scene, or Subscene to inspect parameters</p>
      </div>
    );
  }

  const handleValueChange = (name: string, newVal: ParameterValue) => {
    if (context.type === 'preset' && context.preset) {
      dispatch({
        type: 'SET_PRESET_PARAMETER',
        presetId: context.preset.id,
        paramName: name,
        value: newVal,
      });
    } else if (context.type === 'scene' && context.scene) {
      dispatch({
        type: 'SET_SCENE_PARAMETER',
        sceneId: context.scene.id,
        paramName: name,
        value: newVal,
      });
    } else if (context.type === 'subscene' && context.scene && context.subscene) {
      dispatch({
        type: 'SET_SUBSCENE_PARAMETER',
        sceneId: context.scene.id,
        subsceneId: context.subscene.id,
        paramName: name,
        value: newVal,
      });
    }
  };

  const handleRemoveOverride = (name: string) => {
    if (context.type === 'preset' && context.preset) {
      dispatch({
        type: 'DELETE_PRESET_PARAMETER',
        presetId: context.preset.id,
        paramName: name,
      });
    } else if (context.type === 'scene' && context.scene) {
      dispatch({
        type: 'DELETE_SCENE_PARAMETER',
        sceneId: context.scene.id,
        paramName: name,
      });
    } else if (context.type === 'subscene' && context.scene && context.subscene) {
      dispatch({
        type: 'DELETE_SUBSCENE_PARAMETER',
        sceneId: context.scene.id,
        subsceneId: context.subscene.id,
        paramName: name,
      });
    }
  };

  const handleCreateOverride = (name: string, resolvedVal: ParameterValue) => {
    handleValueChange(name, resolvedVal);
  };

  const getSourceBadge = (source: ParameterSource, isOverriddenHere: boolean) => {
    if (isOverriddenHere) {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
          OVERRIDDEN HERE
        </span>
      );
    }
    if (source === 'scene') {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium bg-emerald-950 text-emerald-300 border border-emerald-800">
          INHERITED FROM SCENE
        </span>
      );
    }
    if (source === 'preset') {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium bg-blue-950 text-blue-300 border border-blue-800">
          INHERITED FROM PRESET
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-medium bg-slate-800 text-slate-400 border border-slate-700">
        DEFAULT
      </span>
    );
  };

  const formatValueStr = (val: ParameterValue | undefined): string => {
    if (val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return Number.isInteger(val) ? val.toString() : val.toFixed(2);
    return `"${val}"`;
  };

  return (
    <aside className="w-84 xl:w-96 bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 select-none overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold text-slate-300 truncate tracking-wide flex items-center gap-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate">{context.title}</span>
          </div>
          <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
            {context.type.toUpperCase()}
          </span>
        </div>

        {/* View Toggle: All vs Overrides only */}
        <div className="flex items-center bg-slate-800/80 p-0.5 rounded border border-slate-700/60 text-xs">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`flex-1 py-1 px-2 rounded text-center transition font-medium ${
              filterMode === 'all'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All (71)
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('overrides')}
            className={`flex-1 py-1 px-2 rounded text-center transition font-medium flex items-center justify-center gap-1 ${
              filterMode === 'overrides'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Overrides only</span>
            <span className="text-[10px] font-mono px-1 rounded bg-black/30">
              {overrideCount}
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search parameter..."
            className="w-full bg-slate-800/90 border border-slate-700/80 rounded pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Group Filter Chips */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-mono no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveGroup('all')}
            className={`px-2 py-0.5 rounded whitespace-nowrap transition ${
              activeGroup === 'all'
                ? 'bg-slate-700 text-white font-bold'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            ALL
          </button>
          {catalog.getGroups().map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setActiveGroup(g)}
              className={`px-2 py-0.5 rounded whitespace-nowrap uppercase transition ${
                activeGroup === g
                  ? 'bg-amber-600 text-white font-bold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Parameter Cards List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredList.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            {filterMode === 'overrides'
              ? 'No active overrides at this level. Switch to "All (71)" to override parameters.'
              : 'No parameters matched the search filter.'}
          </div>
        ) : (
          filteredList.map((item) => {
            const { descriptor, isOverriddenHere, resolvedValue, source } = item;
            return (
              <div
                key={item.name}
                className={`p-2.5 rounded-lg border transition ${
                  isOverriddenHere
                    ? 'bg-slate-800/70 border-amber-500/50 shadow-sm'
                    : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Header row: Name & Origin */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-100 leading-tight">
                      {descriptor.display}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      {item.name}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getSourceBadge(source, isOverriddenHere)}
                  </div>
                </div>

                {/* Interactive Parameter Control */}
                <div className="my-2">
                  <ParameterControl
                    descriptor={descriptor}
                    value={resolvedValue}
                    onChange={(newVal) => handleValueChange(item.name, newVal)}
                  />
                </div>

                {/* Override Action Controls */}
                <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-800">
                  {isOverriddenHere ? (
                    <button
                      type="button"
                      onClick={() => handleRemoveOverride(item.name)}
                      className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition"
                    >
                      <X className="w-3 h-3" />
                      <span>Remove override (revert)</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCreateOverride(item.name, resolvedValue)}
                      className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-medium transition"
                    >
                      <span>+ Override here</span>
                    </button>
                  )}

                  <span className="text-[10px] font-mono text-slate-400">
                    def: {formatValueStr(item.defaultValue)}
                  </span>
                </div>

                {/* Resolution Chain Visualizer */}
                <div className="mt-2 pt-1.5 border-t border-slate-800/60 text-[10px] font-mono text-slate-400 space-y-0.5 bg-slate-950/40 p-1.5 rounded">
                  <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1">
                    Inheritance Chain
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>Default:</span>
                    <span>{formatValueStr(item.defaultValue)}</span>
                  </div>

                  {context.currentLevel !== 'preset' && (
                    <div
                      className={`flex items-center justify-between ${
                        item.presetValue !== undefined ? 'text-blue-300 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <span>Preset ({context.preset?.name || 'none'}):</span>
                      <span>{item.presetValue !== undefined ? formatValueStr(item.presetValue) : 'inherited'}</span>
                    </div>
                  )}

                  {context.currentLevel === 'subscene' && (
                    <div
                      className={`flex items-center justify-between ${
                        item.sceneValue !== undefined ? 'text-emerald-300 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <span>Scene ({context.scene?.name || 'none'}):</span>
                      <span>{item.sceneValue !== undefined ? formatValueStr(item.sceneValue) : 'inherited'}</span>
                    </div>
                  )}

                  {context.currentLevel === 'subscene' && (
                    <div
                      className={`flex items-center justify-between ${
                        item.subsceneValue !== undefined ? 'text-amber-300 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <span>Subscene ({context.subscene?.name || 'none'}):</span>
                      <span>{item.subsceneValue !== undefined ? formatValueStr(item.subsceneValue) : 'inherited'}</span>
                    </div>
                  )}

                  <div className="border-t border-slate-800 pt-0.5 flex items-center justify-between text-slate-200 font-bold">
                    <span className="text-amber-400">Resolved:</span>
                    <span className="text-amber-300">{formatValueStr(resolvedValue)}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
