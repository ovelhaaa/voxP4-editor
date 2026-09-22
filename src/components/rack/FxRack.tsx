import React, { useMemo } from 'react';
import { useEditor } from '../../state/editorState';
import { Preset, Scene, Subscene, ParameterValue } from '../../domain/models';
import { catalog } from '../../domain/catalog';
import { resolveParameterState } from '../../domain/resolution';
import { EFFECT_MODULES, getModuleParameters } from '../../domain/effectModules';
import { FxCard } from './FxCard';
import { SlidersHorizontal, Power } from 'lucide-react';

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

  // Active overrides at the current level
  const activeOverrides = useMemo(() => {
    if (currentLevel === 'subscene') return subscene?.parameters || {};
    if (currentLevel === 'scene') return scene?.parameters || {};
    return preset?.parameters || {};
  }, [currentLevel, subscene, scene, preset]);

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
    const params = getModuleParameters(mod);
    for (const p of params) {
      if (activeOverrides[p.name] !== undefined) {
        handleResetParam(p.name);
      }
    }
  };

  // Global Actions: ALL ON and BYPASS (like CYD FxChainScreen)
  const handleAllEffectsOn = () => {
    const enableParams = EFFECT_MODULES.map((m) => m.enableParam).filter(
      (p): p is string => Boolean(p)
    );
    for (const p of enableParams) {
      handleParamChange(p, true);
    }
  };

  const handleGlobalBypass = () => {
    const enableParams = EFFECT_MODULES.map((m) => m.enableParam).filter(
      (p): p is string => Boolean(p)
    );
    for (const p of enableParams) {
      handleParamChange(p, false);
    }
  };

  const parentContextName =
    currentLevel === 'subscene'
      ? 'Song'
      : currentLevel === 'scene'
        ? 'Sound'
        : 'Defaults';

  const totalOverridesCount = Object.keys(activeOverrides).length;

  return (
    <div className="space-y-4">
      {/* Rack Global Action Bar */}
      <div className="bg-[#101116] border border-[#292A30] rounded-[5px] p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider text-[#F0EDE5]">
            FX RACK
          </span>
          <span className="text-[11px] font-mono text-[#716E69]">
            7 modules
          </span>
          {totalOverridesCount > 0 && (
            <span className="text-[10px] font-mono bg-[#FF6030]/20 text-[#FF6030] px-2 py-0.5 rounded-[3px] border border-[#FF6030]/40">
              {totalOverridesCount} customized
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAllEffectsOn}
            className="h-8 px-3 rounded-[3px] bg-[#14151B] hover:bg-[#1C1D24] text-[#20D6C7] border border-[#292A30] hover:border-[#20D6C7] text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Enable all effect modules"
          >
            <Power className="w-3.5 h-3.5" />
            <span>ALL ON</span>
          </button>

          <button
            type="button"
            onClick={handleGlobalBypass}
            className="h-8 px-3 rounded-[3px] bg-[#14151B] hover:bg-[#1C1D24] text-[#B1ACA3] hover:text-[#FF6030] border border-[#292A30] hover:border-[#F45126] text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Bypass all effect modules"
          >
            <span>BYPASS</span>
          </button>

          {onOpenAdvanced && (
            <button
              type="button"
              onClick={onOpenAdvanced}
              className="h-8 px-3 rounded-[3px] bg-[#1C1D24] hover:bg-[#202128] text-[#F0EDE5] border border-[#34343C] text-xs font-mono font-medium transition cursor-pointer flex items-center gap-1.5"
              title="Open full parameter inspector"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#F45126]" />
              <span className="hidden sm:inline">Advanced...</span>
            </button>
          )}
        </div>
      </div>

      {/* Rack Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {EFFECT_MODULES.map((module) => {
          const modParams = getModuleParameters(module);
          const customizedInMod = modParams.filter(
            (p) => activeOverrides[p.name] !== undefined
          ).length;

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
            />
          );
        })}
      </div>
    </div>
  );
};
