import React from 'react';
import { XCircle, X } from 'lucide-react';

interface ImportErrorModalProps {
  errors: string[];
  onClose: () => void;
}

export const ImportErrorModal: React.FC<ImportErrorModalProps> = ({ errors, onClose }) => {
  if (errors.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-rose-800 rounded-xl shadow-2xl max-w-lg w-full flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 bg-rose-950/40 flex items-center justify-between">
          <div className="flex items-center gap-2 text-rose-400">
            <XCircle className="w-5 h-5" />
            <h3 className="font-bold text-slate-100 text-sm">Import Rejected (Atomic Safety)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Description */}
        <div className="p-4 text-xs text-slate-300 space-y-2 border-b border-slate-800 bg-slate-950/30">
          <p>
            The selected file could not be imported because it violates the VoxP4 V1 specification.
          </p>
          <p className="text-emerald-400 font-medium">
            ✓ Your current project, undo history, and local changes remain completely intact and untouched.
          </p>
        </div>

        {/* Errors list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {errors.map((err, idx) => (
            <div
              key={idx}
              className="p-2.5 bg-rose-950/20 border border-rose-900/40 rounded text-xs text-rose-300 font-mono"
            >
              {err}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-rose-900 hover:bg-rose-800 text-white text-xs font-semibold rounded transition"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
