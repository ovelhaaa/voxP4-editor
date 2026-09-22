import React, { useState, useMemo } from 'react';
import { useEditor } from '../../state/editorState';
import { catalog } from '../../domain/catalog';
import { resolveParameterState, ParameterSource } from '../../domain/resolution';
import { ParameterControl } from '../controls/ParameterControl';
import { Search, X, SlidersHorizontal, ArrowRight } from 'lucide-react';
import { ParameterValue } from '../../domain/models';

interface AdvancedParameterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdvancedParameterDrawer: React.FC<AdvancedParameterDrawerProps> = ({
  isOpen,
  onClose,
}) => {
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
        title: preset?.name || 'Sound',
        subtitle: 'Preset Level',
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
        title: scene?.name || 'Song',
        subtitle: 'Song Level (Base)',
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
        title: subscene?.name || 'Section',
        subtitle: `${scene?.name || 'Song'} → ${subscene?.name || 'Section'}`,
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
      return resolveParameterState({
        name: desc.name,
        preset: context.preset,
        scene: context.scene,
        subscene: context.subscene,
        currentLevel: context.currentLevel,
      });
    });
  }, [context]);

  // Filter list
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

  if (!isOpen) return null;

  const handleValueChange = (name: string, newVal: ParameterValue) => {
    if (!context) return;
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
    if (!context) return;
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

  const getSourceBadge = (source: ParameterSource, isOverriddenHere: boolean) => {
    if (isOverriddenHere) {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] font-bold bg-[#F45126]/20 text-[#FF6030] border border-[#F45126]/40">
          CUSTOMIZED HERE
        </span>
      );
    }
    if (source === 'scene') {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] font-medium bg-[#14151B] text-[#20D6C7] border border-[#20D6C7]/30">
          FROM SONG
        </span>
      );
    }
    if (source === 'preset') {
      return (
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] font-medium bg-[#14151B] text-[#B1ACA3] border border-[#34343C]">
          FROM SOUND
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] font-medium bg-[#14151B] text-[#716E69] border border-[#292A30]">
        DEFAULT
      </span>
    );
  };

  const formatVal = (val: ParameterValue | undefined): string => {
    if (val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return Number.isInteger(val) ? val.toString() : val.toFixed(2);
    return `"${val}"`;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <aside className="relative w-full max-w-md bg-[#14151B] border-l border-[#34343C] flex flex-col h-full shadow-2xl z-10 select-none">
        {/* Header */}
        <div className="p-4 bg-[#101116] border-b border-[#292A30] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-[#F45126]" />
              <h2 className="text-xs font-mono font-bold tracking-wider text-[#F0EDE5]">
                ADVANCED PARAMETERS
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#B1ACA3] hover:text-[#F0EDE5] bg-[#14151B] hover:bg-[#1C1D24] border border-[#292A30] rounded-[3px] transition cursor-pointer"
              title="Close drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {context ? (
            <div className="bg-[#14151B] p-2.5 rounded-[4px] border border-[#292A30] flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-[#F0EDE5]">
                  {context.title}
                </div>
                <div className="text-[11px] text-[#716E69] font-mono">
                  {context.subtitle}
                </div>
              </div>
              <div className="text-[10px] font-mono bg-[#1C1D24] text-[#B1ACA3] px-2 py-0.5 rounded-[2px] border border-[#34343C]">
                ID: {context.id}
              </div>
            </div>
          ) : (
            <div className="text-xs text-[#716E69]">
              No active Sound, Song, or Section selected.
            </div>
          )}

          {/* Mode Switch: All vs Overrides */}
          <div className="flex items-center bg-[#101116] p-0.5 rounded-[4px] border border-[#292A30] text-xs">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`flex-1 py-1.5 px-2 rounded-[3px] text-center font-mono transition cursor-pointer ${
                filterMode === 'all'
                  ? 'bg-[#1C1D24] text-[#F0EDE5] font-semibold shadow-sm'
                  : 'text-[#716E69] hover:text-[#B1ACA3]'
              }`}
            >
              All (71)
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('overrides')}
              className={`flex-1 py-1.5 px-2 rounded-[3px] text-center font-mono transition cursor-pointer flex items-center justify-center gap-1.5 ${
                filterMode === 'overrides'
                  ? 'bg-[#F45126] text-[#090A0E] font-bold shadow-sm'
                  : 'text-[#716E69] hover:text-[#B1ACA3]'
              }`}
            >
              <span>Customized</span>
              <span className="text-[10px] px-1 rounded bg-black/20">
                {overrideCount}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#716E69]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search parameter by name or keyword..."
              className="w-full bg-[#101116] border border-[#292A30] rounded-[4px] pl-8 pr-3 py-1.5 text-xs text-[#F0EDE5] placeholder-[#716E69] focus:outline-none focus:border-[#F45126] font-mono transition"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-[#716E69] hover:text-[#F0EDE5]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Group Chips */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] font-mono no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveGroup('all')}
              className={`px-2 py-1 rounded-[3px] whitespace-nowrap transition cursor-pointer ${
                activeGroup === 'all'
                  ? 'bg-[#1C1D24] text-[#FF6030] font-bold border border-[#F45126]/50'
                  : 'bg-[#101116] text-[#716E69] hover:text-[#B1ACA3] border border-[#292A30]'
              }`}
            >
              ALL
            </button>
            {catalog.getGroups().map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setActiveGroup(g)}
                className={`px-2 py-1 rounded-[3px] whitespace-nowrap uppercase transition cursor-pointer ${
                  activeGroup === g
                    ? 'bg-[#F45126] text-[#090A0E] font-bold'
                    : 'bg-[#101116] text-[#716E69] hover:text-[#B1ACA3] border border-[#292A30]'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Parameter List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!context ? (
            <div className="text-center py-12 text-xs text-[#716E69]">
              Select a Sound or Song to view its parameters.
            </div>
          ) : filteredList.length === 0 ? (
            <div className="text-center py-12 text-xs text-[#716E69]">
              {filterMode === 'overrides'
                ? 'No customized parameters at this level.'
                : 'No parameters found matching the filter.'}
            </div>
          ) : (
            filteredList.map((item) => {
              const { descriptor, isOverriddenHere, resolvedValue, source } = item;
              return (
                <div
                  key={item.name}
                  className={`p-3 rounded-[4px] border transition ${
                    isOverriddenHere
                      ? 'bg-[#1C1D24] border-[#F45126]/50 shadow-sm'
                      : 'bg-[#14151B] border-[#292A30] hover:border-[#34343C]'
                  }`}
                >
                  {/* Parameter Title & Source */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-xs font-semibold text-[#F0EDE5]">
                        {descriptor.display}
                      </div>
                      <div className="text-[10px] font-mono text-[#716E69]">
                        {item.name}
                      </div>
                    </div>
                    {getSourceBadge(source, isOverriddenHere)}
                  </div>

                  {/* Interactive Control */}
                  <div className="my-2.5">
                    <ParameterControl
                      descriptor={descriptor}
                      value={resolvedValue}
                      onChange={(newVal) => handleValueChange(item.name, newVal)}
                    />
                  </div>

                  {/* Override Actions */}
                  <div className="flex items-center justify-between text-[11px] pt-2 border-t border-[#292A30]">
                    {isOverriddenHere ? (
                      <button
                        type="button"
                        onClick={() => handleRemoveOverride(item.name)}
                        className="text-[#E65050] hover:text-[#FF6030] flex items-center gap-1 font-mono transition cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                        <span>Revert (remove customization)</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleValueChange(item.name, resolvedValue)}
                        className="text-[#20D6C7] hover:text-[#55EFE2] flex items-center gap-1 font-mono transition cursor-pointer"
                      >
                        <span>+ Customize here</span>
                      </button>
                    )}

                    <span className="text-[10px] font-mono text-[#716E69]">
                      default: {formatVal(item.defaultValue)}
                    </span>
                  </div>

                  {/* Full Resolution Chain Details */}
                  <div className="mt-2.5 pt-2 border-t border-[#292A30]/60 text-[10px] font-mono text-[#716E69] space-y-1 bg-[#101116] p-2 rounded-[3px]">
                    <div className="text-[9px] uppercase tracking-wider text-[#4A4947]">
                      Inheritance Chain
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Firmware Default:</span>
                      <span>{formatVal(item.defaultValue)}</span>
                    </div>

                    {context.currentLevel !== 'preset' && (
                      <div
                        className={`flex items-center justify-between ${
                          item.presetValue !== undefined
                            ? 'text-[#B1ACA3]'
                            : 'text-[#4A4947]'
                        }`}
                      >
                        <span>Sound ({context.preset?.name || 'none'}):</span>
                        <span>
                          {item.presetValue !== undefined
                            ? formatVal(item.presetValue)
                            : 'inherited'}
                        </span>
                      </div>
                    )}

                    {context.currentLevel === 'subscene' && (
                      <div
                        className={`flex items-center justify-between ${
                          item.sceneValue !== undefined
                            ? 'text-[#20D6C7]'
                            : 'text-[#4A4947]'
                        }`}
                      >
                        <span>Song ({context.scene?.name || 'none'}):</span>
                        <span>
                          {item.sceneValue !== undefined
                            ? formatVal(item.sceneValue)
                            : 'inherited'}
                        </span>
                      </div>
                    )}

                    {context.currentLevel === 'subscene' && (
                      <div
                        className={`flex items-center justify-between ${
                          item.subsceneValue !== undefined
                            ? 'text-[#FF6030]'
                            : 'text-[#4A4947]'
                        }`}
                      >
                        <span>Section ({context.subscene?.name || 'none'}):</span>
                        <span>
                          {item.subsceneValue !== undefined
                            ? formatVal(item.subsceneValue)
                            : 'inherited'}
                        </span>
                      </div>
                    )}

                    <div className="border-t border-[#292A30] pt-1 flex items-center justify-between text-[#F0EDE5] font-bold">
                      <span className="text-[#FF6030] flex items-center gap-1">
                        <ArrowRight className="w-2.5 h-2.5" />
                        <span>Resolved:</span>
                      </span>
                      <span className="text-[#FF6030]">
                        {formatVal(resolvedValue)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
};
