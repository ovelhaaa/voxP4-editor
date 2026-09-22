import React from 'react';
import { ParameterDescriptor } from '../../domain/catalog';
import { ParameterValue } from '../../domain/models';

interface ParameterControlProps {
  descriptor: ParameterDescriptor;
  value: ParameterValue;
  onChange: (newValue: ParameterValue) => void;
  disabled?: boolean;
}

export const ParameterControl: React.FC<ParameterControlProps> = ({
  descriptor,
  value,
  onChange,
  disabled = false,
}) => {
  const { type, min, max, step, unit, values } = descriptor;

  // Bool -> Switch toggle
  if (type === 'bool') {
    const isChecked = Boolean(value);
    return (
      <div className="flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isChecked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="sr-only peer"
          />
          <div
            className={`w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all ${
              isChecked ? 'bg-amber-600' : 'bg-slate-700'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </label>
        <span className="text-xs font-mono font-medium text-slate-300">
          {isChecked ? 'ON' : 'OFF'}
        </span>
      </div>
    );
  }

  // Enum -> Select dropdown
  if (type === 'enum' && values && values.length > 0) {
    const strVal = String(value);
    return (
      <div className="w-full">
        <select
          value={strVal}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-2.5 py-1.5 focus:border-amber-500 focus:outline-none disabled:opacity-50 font-mono"
        >
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Int / Float -> Range slider + Numeric Input
  const numVal = typeof value === 'number' ? value : Number(value) || 0;

  return (
    <div className="flex items-center gap-2 w-full">
      <input
        type="range"
        min={min}
        max={max}
        step={step || (type === 'int' ? 1 : 0.01)}
        value={numVal}
        disabled={disabled}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(type === 'int' ? Math.round(v) : v);
        }}
        className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-50"
      />
      <div className="flex items-center gap-1 w-24">
        <input
          type="number"
          min={min}
          max={max}
          step={step || (type === 'int' ? 1 : 0.01)}
          value={numVal}
          disabled={disabled}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v)) {
              const clamped = Math.min(Math.max(v, min), max);
              onChange(type === 'int' ? Math.round(clamped) : clamped);
            }
          }}
          className="w-16 bg-slate-800 border border-slate-700 text-right text-xs rounded px-1.5 py-1 text-slate-200 font-mono focus:border-amber-500 focus:outline-none disabled:opacity-50"
        />
        {unit && (
          <span className="text-[10px] text-slate-400 font-mono truncate" title={unit}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
};
