import React, { useRef } from 'react';
import { useEditor } from '../../state/editorState';
import {
  FolderKanban,
  Download,
  FolderOpen,
  PlusCircle,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldCheck,
} from 'lucide-react';

interface LibraryViewProps {
  onImportError: (errors: string[]) => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({ onImportError }) => {
  const {
    state,
    dispatch,
    createNewLibrary,
    loadDemo,
    importLibraryCandidate,
    exportLibrary,
  } = useEditor();

  const { library, validation } = state;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const errorCount = validation.errors.length;
  const warningCount = validation.warnings.length;

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
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#090A0E] space-y-6 max-w-4xl mx-auto">
      {/* Project Banner */}
      <div className="bg-[#14151B] border border-[#292A30] rounded-[5px] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[4px] bg-[#1C1D24] border border-[#34343C] flex items-center justify-center text-[#F45126]">
              <FolderKanban className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#F0EDE5]">
                {library.name}
              </h2>
              <p className="text-xs text-[#716E69] font-mono">
                ID: {library.libraryId} · Format V{library.formatVersion}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportLibrary}
              disabled={errorCount > 0}
              className={`h-9 px-4 rounded-[3px] text-xs font-mono font-bold tracking-wider transition cursor-pointer flex items-center gap-2 ${
                errorCount > 0
                  ? 'bg-[#1C1D24] text-[#716E69] border border-[#292A30] cursor-not-allowed'
                  : 'bg-[#F45126] hover:bg-[#FF6030] text-[#090A0E] shadow-[0_0_12px_rgba(244,81,38,0.35)]'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>EXPORT .VOXP4.JSON</span>
            </button>
          </div>
        </div>

        {/* Project Name Editor */}
        <div className="pt-2 border-t border-[#292A30]/60 flex items-center gap-3">
          <label className="text-xs text-[#B1ACA3] font-mono shrink-0">
            Project Title:
          </label>
          <input
            type="text"
            value={library.name}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_LIBRARY_NAME', name: e.target.value })
            }
            className="flex-1 bg-[#101116] border border-[#34343C] rounded-[3px] px-3 py-1.5 text-xs text-[#F0EDE5] font-medium focus:border-[#F45126] focus:outline-none"
          />
        </div>
      </div>

      {/* File Operations */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => createNewLibrary()}
          className="bg-[#14151B] border border-[#292A30] hover:border-[#34343C] p-4 rounded-[5px] text-left space-y-1.5 transition cursor-pointer hover:bg-[#1C1D24]"
        >
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#F0EDE5]">
            <PlusCircle className="w-4 h-4 text-[#F45126]" />
            <span>New Project</span>
          </div>
          <p className="text-[11px] text-[#716E69]">
            Start fresh with a clean default song, sound, and setlist.
          </p>
        </button>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="bg-[#14151B] border border-[#292A30] hover:border-[#34343C] p-4 rounded-[5px] text-left space-y-1.5 transition cursor-pointer hover:bg-[#1C1D24]"
        >
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#F0EDE5]">
            <FolderOpen className="w-4 h-4 text-[#20D6C7]" />
            <span>Import Project</span>
          </div>
          <p className="text-[11px] text-[#716E69]">
            Load an existing .voxp4.json file with atomic validation safety.
          </p>
        </button>

        <button
          type="button"
          onClick={loadDemo}
          className="bg-[#14151B] border border-[#292A30] hover:border-[#34343C] p-4 rounded-[5px] text-left space-y-1.5 transition cursor-pointer hover:bg-[#1C1D24]"
        >
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#F0EDE5]">
            <Sparkles className="w-4 h-4 text-[#E6A63A]" />
            <span>Load Demo Tour</span>
          </div>
          <p className="text-[11px] text-[#716E69]">
            Explore the official tour rig with showcase songs and effects.
          </p>
        </button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelected}
          accept=".json,.voxp4.json"
          className="hidden"
        />
      </div>

      {/* Library Capacities & Hardware Limits */}
      <div className="bg-[#14151B] border border-[#292A30] rounded-[5px] p-4 space-y-3">
        <h3 className="text-xs font-mono font-bold tracking-wider text-[#F0EDE5] uppercase">
          Library Capacity
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="bg-[#101116] border border-[#292A30] rounded-[3px] p-2.5">
            <span className="text-[#716E69] text-[10px] block">SOUNDS</span>
            <span className="text-base font-bold text-[#F0EDE5]">
              {library.presets.length}
            </span>
            <span className="text-[10px] text-[#716E69]"> / 64 max</span>
          </div>

          <div className="bg-[#101116] border border-[#292A30] rounded-[3px] p-2.5">
            <span className="text-[#716E69] text-[10px] block">SONGS</span>
            <span className="text-base font-bold text-[#F0EDE5]">
              {library.scenes.length}
            </span>
            <span className="text-[10px] text-[#716E69]"> / 64 max</span>
          </div>

          <div className="bg-[#101116] border border-[#292A30] rounded-[3px] p-2.5">
            <span className="text-[#716E69] text-[10px] block">SETLISTS</span>
            <span className="text-base font-bold text-[#F0EDE5]">
              {library.setlists.length}
            </span>
            <span className="text-[10px] text-[#716E69]"> / 16 max</span>
          </div>

          <div className="bg-[#101116] border border-[#292A30] rounded-[3px] p-2.5">
            <span className="text-[#716E69] text-[10px] block">CONTRACT</span>
            <span className="text-base font-bold text-[#20D6C7]">
              71 params
            </span>
            <span className="text-[10px] text-[#716E69]"> V1 frozen</span>
          </div>
        </div>
      </div>

      {/* Validation & Health Report */}
      <div className="bg-[#14151B] border border-[#292A30] rounded-[5px] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#20D6C7]" />
            <h3 className="text-xs font-mono font-bold tracking-wider text-[#F0EDE5] uppercase">
              Document Health & Validation
            </h3>
          </div>

          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-[3px] text-xs font-mono font-semibold border ${
              errorCount > 0
                ? 'bg-[#E65050]/20 text-[#E65050] border-[#E65050]/50'
                : warningCount > 0
                  ? 'bg-[#E6A63A]/10 text-[#E6A63A] border-[#E6A63A]/40'
                  : 'bg-[#14151B] text-[#20D6C7] border-[#20D6C7]/40'
            }`}
          >
            {errorCount > 0 ? (
              <>
                <XCircle className="w-3.5 h-3.5" />
                <span>
                  {errorCount} {errorCount === 1 ? 'ERROR' : 'ERRORS'} (BLOCKS EXPORT)
                </span>
              </>
            ) : warningCount > 0 ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{warningCount} WARNINGS</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>100% VALID V1 DOCUMENT</span>
              </>
            )}
          </div>
        </div>

        {errorCount === 0 && warningCount === 0 ? (
          <div className="p-4 bg-[#101116] rounded-[4px] border border-[#292A30] text-xs text-[#B1ACA3] flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-[#20D6C7] shrink-0" />
            <span>
              All schema limits, referential connections, and parameter values satisfy
              the VoxP4 Portable Library V1 specification.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Errors */}
            {validation.errors.map((err, i) => (
              <div
                key={`err-${i}`}
                className="p-3 bg-[#E65050]/10 border border-[#E65050]/40 rounded-[4px] text-xs text-[#E65050] flex items-start gap-2.5"
              >
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">{err.message}</div>
                  <div className="text-[10px] font-mono text-[#E65050]/80 mt-0.5">
                    Path: {err.path} {err.target ? `· Target: ${err.target.type}` : ''}
                  </div>
                </div>
              </div>
            ))}

            {/* Warnings */}
            {validation.warnings.map((warn, i) => (
              <div
                key={`warn-${i}`}
                className="p-3 bg-[#E6A63A]/10 border border-[#E6A63A]/40 rounded-[4px] text-xs text-[#E6A63A] flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">{warn.message}</div>
                  <div className="text-[10px] font-mono text-[#E6A63A]/80 mt-0.5">
                    Path: {warn.path}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
