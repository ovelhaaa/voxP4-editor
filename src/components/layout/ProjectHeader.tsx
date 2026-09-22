import React, { useRef, useState, useEffect } from 'react';
import { useEditor } from '../../state/editorState';
import {
  RotateCcw,
  RotateCw,
  Download,
  FolderOpen,
  PlusCircle,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MoreVertical,
  SlidersHorizontal,
} from 'lucide-react';

interface ProjectHeaderProps {
  onOpenValidation: () => void;
  onImportError: (errors: string[]) => void;
  onToggleAdvancedDrawer: () => void;
  isAdvancedOpen: boolean;
}

export const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  onOpenValidation,
  onImportError,
  onToggleAdvancedDrawer,
  isAdvancedOpen,
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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const errorCount = state.validation.errors.length;
  const warningCount = state.validation.warnings.length;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMenuOpen]);

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
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
    setIsMenuOpen(false);
  };

  return (
    <header className="h-14 bg-[#101116] border-b border-[#292A30] flex items-center justify-between px-4 select-none shrink-0 z-30">
      {/* Brand & Project Name */}
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 text-[#F45126] font-bold tracking-wider text-sm shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-[#F45126] shadow-[0_0_8px_#F45126]" />
          <span className="tracking-widest font-mono">VOXP4</span>
          <span className="text-[10px] bg-[#1C1D24] text-[#B1ACA3] px-1.5 py-0.5 rounded-[3px] font-mono border border-[#34343C]">
            V1
          </span>
        </div>

        <div className="h-4 w-px bg-[#292A30] shrink-0" />

        {/* Inline editable project name */}
        <div className="flex items-center gap-1.5 min-w-0">
          <input
            type="text"
            value={state.library.name}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_LIBRARY_NAME', name: e.target.value })
            }
            className="bg-transparent hover:bg-[#14151B] focus:bg-[#14151B] border border-transparent focus:border-[#34343C] rounded-[3px] px-2 py-1 text-sm font-medium text-[#F0EDE5] focus:outline-none transition w-44 sm:w-60 truncate"
            title="Click to edit project name"
          />
          {state.isDirty && (
            <span
              className="text-[#F45126] font-bold text-base leading-none"
              title="Unsaved local draft changes"
            >
              *
            </span>
          )}
        </div>
      </div>

      {/* Center Validation Badge: Silence is success. Only visible when there are errors or warnings */}
      <div className="hidden md:flex items-center">
        {(errorCount > 0 || warningCount > 0) && (
          <button
            type="button"
            onClick={onOpenValidation}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-[3px] text-xs font-mono tracking-wide border transition cursor-pointer ${
              errorCount > 0
                ? 'bg-[#E65050]/20 text-[#E65050] border-[#E65050]/50 hover:bg-[#E65050]/30'
                : 'bg-[#E6A63A]/10 text-[#E6A63A] border-[#E6A63A]/40 hover:bg-[#E6A63A]/20'
            }`}
            title="Validation Details"
          >
            {errorCount > 0 ? (
              <>
                <XCircle className="w-3.5 h-3.5 text-[#E65050]" />
                <span>
                  {errorCount} {errorCount === 1 ? 'ERROR' : 'ERRORS'}
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-3.5 h-3.5 text-[#E6A63A]" />
                <span>{warningCount} WARNINGS</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Undo / Redo */}
        <div className="flex items-center bg-[#14151B] border border-[#292A30] rounded-[3px] p-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={state.past.length === 0}
            className="p-1.5 text-[#B1ACA3] hover:text-[#F0EDE5] disabled:opacity-20 disabled:cursor-not-allowed rounded-[2px] hover:bg-[#1C1D24] transition cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={state.future.length === 0}
            className="p-1.5 text-[#B1ACA3] hover:text-[#F0EDE5] disabled:opacity-20 disabled:cursor-not-allowed rounded-[2px] hover:bg-[#1C1D24] transition cursor-pointer"
            title="Redo (Ctrl+Shift+Z)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Toggle Advanced Parameter Drawer */}
        <button
          type="button"
          onClick={onToggleAdvancedDrawer}
          className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-[3px] border transition cursor-pointer ${
            isAdvancedOpen
              ? 'bg-[#1C1D24] text-[#FF6030] border-[#F45126]'
              : 'bg-[#14151B] text-[#B1ACA3] hover:text-[#F0EDE5] border-[#292A30] hover:border-[#34343C]'
          }`}
          title="Toggle Advanced Parameter Drawer"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Advanced</span>
        </button>

        {/* Project Overflow Menu (...) */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 text-[#B1ACA3] hover:text-[#F0EDE5] bg-[#14151B] hover:bg-[#1C1D24] border border-[#292A30] rounded-[3px] transition cursor-pointer"
            title="Project Menu"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-[#14151B] border border-[#34343C] rounded-[4px] shadow-xl py-1 text-xs z-50">
              <button
                type="button"
                onClick={() => {
                  createNewLibrary();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-[#F0EDE5] hover:bg-[#1C1D24] flex items-center gap-2 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-[#F45126]" />
                <span>New Project</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  loadDemo();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-[#F0EDE5] hover:bg-[#1C1D24] flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-[#E6A63A]" />
                <span>Load Tour Demo</span>
              </button>

              <div className="h-px bg-[#292A30] my-1" />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full text-left px-3 py-2 text-[#F0EDE5] hover:bg-[#1C1D24] flex items-center gap-2 cursor-pointer"
              >
                <FolderOpen className="w-4 h-4 text-[#20D6C7]" />
                <span>Import (.voxp4.json)</span>
              </button>

              <div className="h-px bg-[#292A30] my-1" />

              <button
                type="button"
                onClick={() => {
                  onOpenValidation();
                  setIsMenuOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-[#B1ACA3] hover:bg-[#1C1D24] flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Validation Details</span>
              </button>
            </div>
          )}
        </div>

        {/* Hidden file input for import */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelected}
          accept=".json,.voxp4.json"
          className="hidden"
        />

        {/* Primary Export Button (Single, non-duplicated export action) */}
        <button
          type="button"
          onClick={exportLibrary}
          disabled={errorCount > 0}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-mono font-bold tracking-wider rounded-[3px] transition cursor-pointer ${
            errorCount > 0
              ? 'bg-[#1C1D24] text-[#716E69] border border-[#292A30] cursor-not-allowed'
              : 'bg-[#F45126] hover:bg-[#FF6030] text-[#090A0E] shadow-[0_0_10px_rgba(244,81,38,0.3)]'
          }`}
          title={
            errorCount > 0
              ? 'Fix validation errors before exporting'
              : 'Export canonical .voxp4.json'
          }
        >
          <Download className="w-3.5 h-3.5" />
          <span>EXPORT</span>
        </button>
      </div>
    </header>
  );
};
