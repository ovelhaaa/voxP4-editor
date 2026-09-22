import React, { useRef } from 'react';
import { useEditor } from '../../state/editorState';
import {
  Sliders,
  FolderOpen,
  Download,
  PlusCircle,
  RotateCcw,
  RotateCw,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface HeaderProps {
  onOpenValidation: () => void;
  onImportError: (errors: string[]) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenValidation,
  onImportError,
}) => {
  const {
    state,
    dispatch,
    createNewLibrary,
    loadDemo,
    importLibraryCandidate,
    exportLibrary,
    undo,
    redo,
  } = useEditor();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const errorCount = state.validation.errors.length;
  const warningCount = state.validation.warnings.length;

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const result = importLibraryCandidate(content);
        if (!result.success) {
          onImportError(result.errors);
        }
      }
      // Reset input so same file can be re-selected if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  return (
    <header className="h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 select-none shrink-0 z-20">
      {/* Brand & Project Name */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-amber-500 font-bold tracking-wider text-sm">
          <Sliders className="w-5 h-5" />
          <span>VOXP4 EDITOR</span>
          <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
            V1
          </span>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        {/* Inline editable library name */}
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={state.library.name}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_LIBRARY_NAME', name: e.target.value })
            }
            className="bg-transparent hover:bg-slate-900 focus:bg-slate-900 border border-transparent focus:border-slate-700 rounded px-2 py-0.5 text-sm font-medium text-slate-100 focus:outline-none transition w-48 sm:w-64"
            title="Library Title (click to edit)"
          />
          {state.isDirty && (
            <span
              className="text-amber-400 font-bold text-base leading-none"
              title="Unsaved local changes"
            >
              *
            </span>
          )}
        </div>
      </div>

      {/* Center Validation Badge */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={onOpenValidation}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide border transition ${
            errorCount > 0
              ? 'bg-rose-950/50 text-rose-300 border-rose-800 hover:bg-rose-900/60'
              : warningCount > 0
                ? 'bg-amber-950/50 text-amber-300 border-amber-800 hover:bg-amber-900/60'
                : 'bg-emerald-950/50 text-emerald-300 border-emerald-800 hover:bg-emerald-900/60'
          }`}
          title="Click to view detailed validation report"
        >
          {errorCount > 0 ? (
            <>
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>
                INVALID — {errorCount} {errorCount === 1 ? 'ERROR' : 'ERRORS'}
              </span>
            </>
          ) : warningCount > 0 ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>
                VALID — {warningCount}{' '}
                {warningCount === 1 ? 'WARNING' : 'WARNINGS'}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>VALID</span>
            </>
          )}
        </button>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2">
        {/* Undo / Redo */}
        <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 mr-2">
          <button
            type="button"
            onClick={undo}
            disabled={state.past.length === 0}
            className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed rounded hover:bg-slate-800 transition"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={state.future.length === 0}
            className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed rounded hover:bg-slate-800 transition"
            title="Redo (Ctrl+Shift+Z)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => createNewLibrary()}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition"
          title="Create brand new library"
        >
          <PlusCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">New</span>
        </button>

        <button
          type="button"
          onClick={loadDemo}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-amber-400 hover:text-amber-300 bg-amber-950/30 hover:bg-amber-950/60 border border-amber-900/50 rounded transition"
          title="Load official demo tour library"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Demo</span>
        </button>

        {/* Hidden file input for import */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelected}
          accept=".json,.voxp4.json"
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded transition"
          title="Import .voxp4.json file"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Import</span>
        </button>

        <button
          type="button"
          onClick={exportLibrary}
          disabled={errorCount > 0}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded transition shadow-sm ${
            errorCount > 0
              ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/50'
          }`}
          title={
            errorCount > 0
              ? 'Fix validation errors before exporting'
              : 'Export canonical .voxp4.json'
          }
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
