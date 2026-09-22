import React, { useState, useMemo } from 'react';
import { useEditor } from '../../state/editorState';
import { Preset, Scene, Subscene, ParameterValue } from '../../domain/models';
import { catalog } from '../../domain/catalog';
import { resolveParameterState } from '../../domain/resolution';
import { EFFECT_MODULES, getModuleParameters } from '../../domain/effectModules';
import { FxCard } from './FxCard';
import { SlidersHorizontal } from 'lucide-react';

interface FxRackProps {
  preset?: Preset;
  scene?: Scene;
  subscene?: Subscene;
  currentLevel: 'preset' | 'scene' | 'subscene';
  onOpenAdvanced?: () => void;
}

export const FxRack: React.FC<FxRackProps> = ({
  preset,
  scene,
  subscene,
  currentLevel,
  onOpenAdvanced,
}) => {
  const { dispatch } = useEditor();

  // Single-expanded-module state across the rack
  const [expandedModuleId, setExpandedModuleId] = useState<string | null>(null);

  // Active sparse overrides at the current level
  const activeOverrides = useMemo(() => {
    if (currentLevel === 'subscene') return subscene?.parameters || {};
    if (currentLevel === 'scene') return scene?.parameters || {};
    return preset?.parameters || {};
  }, [currentLevel, subscene, scene, preset]);

  // Set of all parameter names belonging to the 7 displayed effect modules (excludes tempo, key, scale)
  const allRackParamNames = useMemo(() => {
    const names = new Set<string>();
    for (const m of EFFECT_MODULES) {
      if (m.enableParam) names.add(m.enableParam);
      for (const p of getModuleParameters(m)) {
        names.add(p.name);
      }
    }
    return names;
  }, []);

  // Total customizations specifically within the FX rack
  const totalCustomizedInRack = useMemo(() => {
    let count = 0;
    for (const key of Object.keys(activeOverrides)) {
      if (allRackParamNames.has(key)) {
        count++;
      }
    }
    return count;
  }, [activeOverrides, allRackParamNames]);

  // Resolve all parameters for the current context
  const resolvedState = useMemo(() => {
    const all = catalog.getAllParameters();
    const resolvedMap: Record<string, ParameterValue> = {};
    for (const desc of all) {
      const state = resolveParameterState({
        name: desc.name,
        preset,
        scene,
        subscene,
        currentLevel,
      });
      resolvedMap[desc.name] = state.resolvedValue;
    }
    return resolvedMap;
  }, [preset, scene, subscene, currentLevel]);

  const handleParamChange = (paramName: string, value: ParameterValue) => {
    if (currentLevel === 'subscene' && scene && subscene) {
      dispatch({
        type: 'SET_SUBSCENE_PARAMETER',
        sceneId: scene.id,
        subsceneId: subscene.id,
        paramName,
        value,
      });
    } else if (currentLevel === 'scene' && scene) {
      dispatch({
        type: 'SET_SCENE_PARAMETER',
        sceneId: scene.id,
        paramName,
        value,
      });
    } else if (currentLevel === 'preset' && preset) {
      dispatch({
        type: 'SET_PRESET_PARAMETER',
        presetId: preset.id,
        paramName,
        value,
      });
    }
  };

  const handleResetParam = (paramName: string) => {
    if (currentLevel === 'subscene' && scene && subscene) {
      dispatch({
        type: 'DELETE_SUBSCENE_PARAMETER',
        sceneId: scene.id,
        subsceneId: subscene.id,
        paramName,
      });
    } else if (currentLevel === 'scene' && scene) {
      dispatch({
        type: 'DELETE_SCENE_PARAMETER',
        sceneId: scene.id,
        paramName,
      });
    } else if (currentLevel === 'preset' && preset) {
      dispatch({
        type: 'DELETE_PRESET_PARAMETER',
        presetId: preset.id,
        paramName,
      });
    }
  };

  const handleResetModule = (moduleKey: string) => {
    const mod = EFFECT_MODULES.find((m) => m.id === moduleKey);
    if (!mod) return;
    if (mod.enableParam && activeOverrides[mod.enableParam] !== undefined) {
      handleResetParam(mod.enableParam);
    }
    const params = getModuleParameters(mod);
    for (const p of params) {
      if (activeOverrides[p.name] !== undefined) {
        handleResetParam(p.name);
      }
    }
  };

  const parentContextName =
    currentLevel === 'subscene'
      ? 'Song'
      : currentLevel === 'scene'
        ? 'Sound'
        : 'Defaults';

  return (
    <div className="space-y-3.5">
      {/* Rack Header */}
      <div className="bg-[#101116] border border-[#292A30] rounded-[5px] px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider text-[#F0EDE5]">
            FX RACK
          </span>
          <span className="text-[11px] font-mono text-[#716E69]">
            7 modules
          </span>
          {totalCustomizedInRack > 0 && (
            <span className="text-[10px] font-mono bg-[#FF6030]/20 text-[#FF6030] px-2 py-0.5 rounded-[3px] border border-[#FF6030]/40">
              {totalCustomizedInRack} customized
            </span>
          )}
        </div>

        {onOpenAdvanced && (
          <button
            type="button"
            onClick={onOpenAdvanced}
            className="h-7 px-2.5 rounded-[3px] bg-[#14151B] hover:bg-[#1C1D24] text-[#B1ACA3] hover:text-[#F0EDE5] border border-[#292A30] text-xs font-mono transition cursor-pointer flex items-center gap-1.5"
            title="Open all 71 parameters inspector"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#F45126]" />
            <span className="hidden sm:inline">Advanced Parameters...</span>
          </button>
        )}
      </div>

      {/* Rack Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5 items-start">
        {EFFECT_MODULES.map((module) => {
          const modParams = getModuleParameters(module);
          const customizedInMod =
            (module.enableParam && activeOverrides[module.enableParam] !== undefined ? 1 : 0) +
            modParams.filter((p) => activeOverrides[p.name] !== undefined).length;

          const isExpanded = expandedModuleId === module.id;

          return (
            <FxCard
              key={module.id}
              module={module}
              resolvedParams={resolvedState}
              onParamChange={handleParamChange}
              onResetModule={() => handleResetModule(module.id)}
              isCustomized={customizedInMod > 0}
              customizedCount={customizedInMod}
              contextLevel={currentLevel}
              parentContextName={parentContextName}
              isExpanded={isExpanded}
              onToggleExpand={() =>
                setExpandedModuleId(isExpanded ? null : module.id)
              }
            />
          );
        })}
      </div>
    </div>
  );
};
