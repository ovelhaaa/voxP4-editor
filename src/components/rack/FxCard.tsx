import React, { useState } from 'react';
import { EffectModuleDefinition, getModuleParameters } from '../../domain/effectModules';
import { ParameterValue } from '../../domain/models';
import { catalog } from '../../domain/catalog';
import { ParameterControl } from '../controls/ParameterControl';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

interface FxCardProps {
  module: EffectModuleDefinition;
  resolvedParams: Record<string, ParameterValue>;
  onParamChange: (paramName: string, value: ParameterValue) => void;
  onResetModule: () => void;
  isCustomized: boolean;
  customizedCount: number;
  contextLevel: 'preset' | 'scene' | 'subscene';
  parentContextName: string;
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
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isEnabled = module.enableParam
    ? Boolean(resolvedParams[module.enableParam])
    : true;

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
        isEnabled ? 'border-[#34343C]' : 'border-[#292A30] opacity-85'
      }`}
    >
      {/* Hardware Top Rail: lit orange when module is ON */}
      <div
        className={`h-[3px] w-full transition-colors ${
          isEnabled ? 'bg-[#F45126]' : 'bg-[#1C1D24]'
        }`}
      />

      {/* Card Header */}
      <div className="px-4 py-3 bg-[#101116] border-b border-[#292A30] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* LED indicator */}
          <span
            className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
              isEnabled
                ? 'bg-[#FF6030] shadow-[0_0_8px_#F45126]'
                : 'bg-[#414147]'
            }`}
          />
          <h3 className="text-xs font-bold tracking-wider text-[#F0EDE5] truncate">
            {module.name}
          </h3>
          <span className="text-[11px] font-mono text-[#20D6C7] bg-[#14151B] px-2 py-0.5 rounded-[3px] border border-[#292A30] truncate">
            {summaryText}
          </span>
        </div>

        {/* Enable Toggle (if applicable) */}
        {module.enableParam && (
          <div className="shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={isEnabled}
              onClick={() =>
                onParamChange(module.enableParam!, !isEnabled)
              }
              className={`h-7 px-3 rounded-[3px] text-xs font-mono font-bold tracking-wider transition border flex items-center gap-1.5 cursor-pointer ${
                isEnabled
                  ? 'bg-[#B83A1C] hover:bg-[#F45126] text-[#F0EDE5] border-[#F45126]'
                  : 'bg-[#14151B] hover:bg-[#1C1D24] text-[#716E69] border-[#34343C]'
              }`}
            >
              <span>{isEnabled ? 'ON' : 'BYPASS'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Inheritance / Customization Bar */}
      <div className="px-4 py-1.5 bg-[#14151B] border-b border-[#292A30]/60 flex items-center justify-between text-[11px]">
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

      {/* Primary Parameters (Basic Mode) */}
      <div className="p-4 space-y-3.5 flex-1">
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
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full py-1 text-xs text-[#B1ACA3] hover:text-[#F0EDE5] flex items-center justify-center gap-1.5 transition cursor-pointer select-none rounded-[3px] hover:bg-[#1C1D24]"
            >
              <span>{isExpanded ? 'Less' : `More (${secondaryDescriptors.length} controls)...`}</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-[#F45126]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[#716E69]" />
              )}
            </button>

            {isExpanded && (
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
    </div>
  );
};
