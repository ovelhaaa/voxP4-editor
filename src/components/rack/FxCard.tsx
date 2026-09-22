import React, { useState } from 'react';
import { EffectModuleDefinition, getModuleParameters } from '../../domain/effectModules';
import { ParameterValue } from '../../domain/models';
import { catalog } from '../../domain/catalog';
import { ParameterControl } from '../controls/ParameterControl';
import { ChevronDown, ChevronUp, RotateCcw, Sliders } from 'lucide-react';

interface FxCardProps {
  module: EffectModuleDefinition;
  resolvedParams: Record<string, ParameterValue>;
  onParamChange: (paramName: string, value: ParameterValue) => void;
  onResetModule: () => void;
  isCustomized: boolean;
  customizedCount: number;
  contextLevel: 'preset' | 'scene' | 'subscene';
  parentContextName: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const FxCard: React.FC<FxCardProps> = ({
  module,
  resolvedParams,
  onParamChange,
  onResetModule,
  isCustomized,
  customizedCount,
  contextLevel,
  parentContextName,
  isExpanded,
  onToggleExpand,
}) => {
  const [showMoreSecondary, setShowMoreSecondary] = useState(false);

  const hasEnableParam = Boolean(module.enableParam);
  const isEnabled = hasEnableParam
    ? Boolean(resolvedParams[module.enableParam!])
    : true;

  const isOutputRouting = module.id === 'output';
  const summaryText = module.formatSummary(resolvedParams);

  // Get primary parameter descriptors
  const primaryDescriptors = module.primaryParams
    .map((name) => catalog.getParameter(name))
    .filter((d): d is NonNullable<typeof d> => d !== undefined);

  // Secondary parameters (for "More...")
  const secondaryDescriptors = getModuleParameters(module, { excludeEnable: true })
    .filter((desc) => !module.primaryParams.includes(desc.name));

  const resetTargetName =
    contextLevel === 'subscene'
      ? 'Song'
      : contextLevel === 'scene'
        ? 'Sound'
        : 'Defaults';

  return (
    <div
      className={`rounded-[5px] bg-[#14151B] border transition flex flex-col overflow-hidden ${
        isOutputRouting
          ? 'border-[#34343C]'
          : isEnabled
            ? 'border-[#34343C]'
            : 'border-[#292A30] opacity-75'
      }`}
    >
      {/* Hardware Top Rail:
          - For Output: neutral border color
          - For effects: lit orange when ON, dark when OFF */}
      <div
        className={`h-[3px] w-full transition-colors ${
          isOutputRouting
            ? 'bg-[#292A30]'
            : isEnabled
              ? 'bg-[#F45126]'
              : 'bg-[#1C1D24]'
        }`}
      />

      {/* Card Header & Collapsed Summary */}
      <div className="p-3.5 bg-[#101116] border-b border-[#292A30] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* LED indicator (only for effects that have enable) */}
          {!isOutputRouting && (
            <span
              className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
                isEnabled
                  ? 'bg-[#FF6030] shadow-[0_0_8px_#F45126]'
                  : 'bg-[#414147]'
              }`}
            />
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold tracking-wider text-[#F0EDE5] truncate">
                {module.name}
              </h3>
              {isOutputRouting && (
                <span className="text-[9px] font-mono uppercase bg-[#1C1D24] text-[#B1ACA3] px-1.5 py-0.2 rounded border border-[#34343C]">
                  ROUTING
                </span>
              )}
            </div>
            <div className="text-[11px] font-mono text-[#20D6C7] truncate mt-0.5">
              {summaryText}
            </div>
          </div>
        </div>

        {/* Right Header Actions: ON/BYPASS switch (if effect) + Controls Expand button */}
        <div className="flex items-center gap-2 shrink-0">
          {hasEnableParam && (
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              onClick={() => onParamChange(module.enableParam!, !isEnabled)}
              className={`h-7 px-2.5 rounded-[3px] text-xs font-mono font-bold tracking-wider transition border flex items-center gap-1.5 cursor-pointer ${
                isEnabled
                  ? 'bg-[#B83A1C] hover:bg-[#F45126] text-[#F0EDE5] border-[#F45126]'
                  : 'bg-[#14151B] hover:bg-[#1C1D24] text-[#716E69] border-[#34343C]'
              }`}
            >
              <span>{isEnabled ? 'ON' : 'OFF'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleExpand}
            className={`h-7 px-2.5 rounded-[3px] text-xs font-mono transition border flex items-center gap-1 cursor-pointer ${
              isExpanded
                ? 'bg-[#1C1D24] text-[#FF6030] border-[#F45126]'
                : 'bg-[#14151B] hover:bg-[#1C1D24] text-[#B1ACA3] hover:text-[#F0EDE5] border-[#292A30]'
            }`}
            title={isExpanded ? 'Collapse controls' : 'Expand controls'}
          >
            <Sliders className="w-3 h-3" />
            <span className="hidden sm:inline">{isExpanded ? 'Hide' : 'Edit'}</span>
            {isExpanded ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Inheritance / Customization Bar */}
      <div className="px-3.5 py-1.5 bg-[#14151B] border-b border-[#292A30]/60 flex items-center justify-between text-[11px]">
        <span className="text-[#716E69]">
          {isCustomized ? (
            <span className="text-[#FF6030] font-medium flex items-center gap-1">
              <span>●</span>
              <span>Customized ({customizedCount})</span>
            </span>
          ) : (
            <span className="text-[#716E69]">
              Same as {parentContextName}
            </span>
          )}
        </span>

        {isCustomized && (
          <button
            type="button"
            onClick={onResetModule}
            className="text-[10px] text-[#B1ACA3] hover:text-[#F45126] flex items-center gap-1 transition cursor-pointer"
            title={`Reset all customized parameters in this effect to ${resetTargetName}`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset to {resetTargetName}</span>
          </button>
        )}
      </div>

      {/* Expanded Controls Area (Progressive Disclosure) */}
      {isExpanded && (
        <div className="p-4 space-y-3.5 bg-[#14151B]">
          {primaryDescriptors.map((desc) => {
            const val = resolvedParams[desc.name] ?? catalog.getDefaultValue(desc.name);
            return (
              <div key={desc.name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#B1ACA3] font-medium">{desc.display}</span>
                  <span className="text-[11px] font-mono text-[#716E69]">
                    {typeof val === 'boolean'
                      ? val ? 'ON' : 'OFF'
                      : typeof val === 'number'
                        ? Number.isInteger(val) ? val : val.toFixed(2)
                        : String(val)}
                    {desc.unit ? ` ${desc.unit}` : ''}
                  </span>
                </div>
                <ParameterControl
                  descriptor={desc}
                  value={val}
                  onChange={(newVal) => onParamChange(desc.name, newVal)}
                />
              </div>
            );
          })}

          {/* Secondary Parameters ("More...") */}
          {secondaryDescriptors.length > 0 && (
            <div className="pt-2 border-t border-[#292A30]">
              <button
                type="button"
                onClick={() => setShowMoreSecondary(!showMoreSecondary)}
                className="w-full py-1 text-xs text-[#B1ACA3] hover:text-[#F0EDE5] flex items-center justify-center gap-1.5 transition cursor-pointer select-none rounded-[3px] hover:bg-[#1C1D24]"
              >
                <span>{showMoreSecondary ? 'Less' : `More (${secondaryDescriptors.length} controls)...`}</span>
                {showMoreSecondary ? (
                  <ChevronUp className="w-3.5 h-3.5 text-[#F45126]" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-[#716E69]" />
                )}
              </button>

              {showMoreSecondary && (
                <div className="mt-3 pt-3 border-t border-[#292A30]/60 space-y-3.5">
                  {secondaryDescriptors.map((desc) => {
                    const val = resolvedParams[desc.name] ?? catalog.getDefaultValue(desc.name);
                    return (
                      <div key={desc.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-[#B1ACA3] font-medium">{desc.display}</span>
                          <span className="text-[11px] font-mono text-[#716E69]">
                            {typeof val === 'boolean'
                              ? val ? 'ON' : 'OFF'
                              : typeof val === 'number'
                                ? Number.isInteger(val) ? val : val.toFixed(2)
                                : String(val)}
                            {desc.unit ? ` ${desc.unit}` : ''}
                          </span>
                        </div>
                        <ParameterControl
                          descriptor={desc}
                          value={val}
                          onChange={(newVal) => onParamChange(desc.name, newVal)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
