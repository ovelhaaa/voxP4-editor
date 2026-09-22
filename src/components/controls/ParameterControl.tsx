import React from 'react';
import { ParameterDescriptor } from '../../domain/catalog';
import { ParameterValue } from '../../domain/models';

interface ParameterControlProps {
  descriptor: ParameterDescriptor;
  value: ParameterValue;
  onChange: (newValue: ParameterValue) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const ParameterControl: React.FC<ParameterControlProps> = ({
  descriptor,
  value,
  onChange,
  disabled = false,
  compact = false,
}) => {
  const { type, min, max, step, unit, values } = descriptor;

  // Bool -> Hardware-like Toggle Switch
  if (type === 'bool') {
    const isChecked = Boolean(value);
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isChecked}
          disabled={disabled}
          onClick={() => onChange(!isChecked)}
          className={`h-7 px-3 rounded-[3px] text-xs font-mono font-bold tracking-wider transition border flex items-center justify-center gap-1.5 select-none ${
            isChecked
              ? 'bg-[#B83A1C] hover:bg-[#F45126] text-[#F0EDE5] border-[#F45126]'
              : 'bg-[#14151B] hover:bg-[#1C1D24] text-[#716E69] border-[#34343C]'
          } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              isChecked ? 'bg-[#FF6030] shadow-[0_0_6px_#F45126]' : 'bg-[#414147]'
            }`}
          />
          <span>{isChecked ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    );
  }

  // Enum -> Segmented control (if <= 4 options) or styled Select dropdown
  if (type === 'enum' && values && values.length > 0) {
    const strVal = String(value);

    if (values.length <= 4 && !compact) {
      return (
        <div className="flex items-center w-full bg-[#101116] p-0.5 rounded-[4px] border border-[#292A30]">
          {values.map((opt) => {
            const isSelected = opt === strVal;
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => onChange(opt)}
                className={`flex-1 py-1.5 px-2 text-xs font-mono rounded-[3px] transition text-center truncate ${
                  isSelected
                    ? 'bg-[#1C1D24] text-[#FF6030] border border-[#F45126]/60 font-semibold shadow-sm'
                    : 'text-[#B1ACA3] hover:text-[#F0EDE5] hover:bg-[#14151B] border border-transparent'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                title={opt}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    return (
      <div className="w-full">
        <select
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-[#14151B] border border-[#34343C] text-[#F0EDE5] text-xs rounded-[4px] px-2.5 py-1.5 focus:border-[#F45126] focus:outline-none disabled:opacity-40 font-mono transition"
        >
          {values.map((v) => (
            <option key={v} value={v} className="bg-[#14151B] text-[#F0EDE5]">
              {v}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Int / Float -> Range slider + Numeric Input
  const numVal = typeof value === 'number' ? value : Number(value) || 0;
  const stepVal = step || (type === 'int' ? 1 : 0.01);

  return (
    <div className="flex items-center gap-2.5 w-full">
      <input
        type="range"
        min={min}
        max={max}
        step={stepVal}
        value={numVal}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(type === 'int' ? Math.round(v) : v);
        }}
        className="flex-1 h-2 bg-[#202128] rounded-[3px] appearance-none cursor-pointer accent-[#F45126] border border-[#292A30] disabled:opacity-40"
      />
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={min}
          max={max}
          step={stepVal}
          value={numVal}
          disabled={disabled}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              const clamped = Math.min(Math.max(v, min), max);
              onChange(type === 'int' ? Math.round(clamped) : clamped);
            }
          }}
          className="w-16 bg-[#14151B] border border-[#34343C] text-right text-xs rounded-[3px] px-1.5 py-1 text-[#F0EDE5] font-mono focus:border-[#F45126] focus:outline-none disabled:opacity-40 transition"
        />
        {unit && (
          <span
            className="text-[10px] text-[#716E69] font-mono w-7 truncate"
            title={unit}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};
