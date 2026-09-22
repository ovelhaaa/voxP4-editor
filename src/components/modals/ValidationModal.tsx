import React, { useState } from 'react';
import { useEditor } from '../../state/editorState';
import { ValidationIssue } from '../../domain/models';
import { X, CheckCircle2, AlertTriangle, XCircle, ArrowRight } from 'lucide-react';

interface ValidationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ValidationModal: React.FC<ValidationModalProps> = ({ isOpen, onClose }) => {
  const { state, dispatch } = useEditor();
  const { errors, warnings } = state.validation;
  const [filter, setFilter] = useState<'all' | 'errors' | 'warnings'>('all');

  if (!isOpen) return null;

  const handleNavigate = (issue: ValidationIssue) => {
    if (issue.target) {
      dispatch({ type: 'NAVIGATE_TO_TARGET', target: issue.target });
      onClose();
    }
  };

  const displayedIssues =
    filter === 'errors'
      ? errors
      : filter === 'warnings'
        ? warnings
        : [...errors, ...warnings];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2">
            {errors.length > 0 ? (
              <XCircle className="w-5 h-5 text-rose-500" />
            ) : warnings.length > 0 ? (
              <AlertTriangle className="w-5 h-5 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            )}
            <h3 className="font-bold text-slate-100 text-sm">
              Library Validation Report
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status banner */}
        <div
          className={`p-3 text-xs flex items-center justify-between font-mono ${
            errors.length > 0
              ? 'bg-rose-950/40 text-rose-300 border-b border-rose-900/40'
              : warnings.length > 0
                ? 'bg-amber-950/40 text-amber-300 border-b border-amber-900/40'
                : 'bg-emerald-950/40 text-emerald-300 border-b border-emerald-900/40'
          }`}
        >
          <span>
            {errors.length > 0
              ? `✕ Document has ${errors.length} error(s). Export is blocked until errors are resolved.`
              : warnings.length > 0
                ? `⚠ Document is schema-valid but has ${warnings.length} warning(s). Export is permitted.`
                : '✓ Document is 100% valid according to V1 contract.'}
          </span>
        </div>

        {/* Filter Tabs */}
        {(errors.length > 0 || warnings.length > 0) && (
          <div className="flex items-center gap-1 p-2 bg-slate-950 border-b border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded transition ${
                filter === 'all'
                  ? 'bg-slate-800 text-white font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Issues ({errors.length + warnings.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('errors')}
              className={`px-3 py-1 rounded transition ${
                filter === 'errors'
                  ? 'bg-rose-950 text-rose-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Errors ({errors.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('warnings')}
              className={`px-3 py-1 rounded transition ${
                filter === 'warnings'
                  ? 'bg-amber-950 text-amber-300 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Warnings ({warnings.length})
            </button>
          </div>
        )}

        {/* Issues List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {displayedIssues.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-medium text-slate-200">
                No issues detected!
              </p>
              <p className="text-xs text-slate-400">
                All presets, scenes, subscenes, setlists, and parameter ranges are fully compliant with VoxP4 V1.
              </p>
            </div>
          ) : (
            displayedIssues.map((issue, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                  issue.severity === 'error'
                    ? 'bg-rose-950/20 border-rose-900/50 text-rose-200'
                    : 'bg-amber-950/20 border-amber-900/50 text-amber-200'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-bold font-mono px-1.5 py-0.2 rounded uppercase ${
                        issue.severity === 'error'
                          ? 'bg-rose-900/60 text-rose-200'
                          : 'bg-amber-900/60 text-amber-200'
                      }`}
                    >
                      {issue.severity}
                    </span>
                    <span className="font-mono text-slate-400 text-[11px]">
                      {issue.path}
                    </span>
                  </div>
                  <p className="font-medium text-slate-100">{issue.message}</p>
                </div>

                {issue.target && (
                  <button
                    type="button"
                    onClick={() => handleNavigate(issue)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1.5 rounded transition mt-0.5"
                  >
                    <span>Fix in Editor</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
