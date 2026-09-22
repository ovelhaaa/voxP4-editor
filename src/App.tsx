import React, { useState } from 'react';
import { EditorProvider } from './state/EditorProvider';
import { Header } from './components/layout/Header';
import { LibraryTree } from './components/layout/LibraryTree';
import { MainEditor } from './components/editors/MainEditor';
import { ParameterInspector } from './components/inspector/ParameterInspector';
import { ValidationModal } from './components/modals/ValidationModal';
import { ImportErrorModal } from './components/modals/ImportErrorModal';

const AppContent: React.FC = () => {
  const [isValidationOpen, setIsValidationOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Header
        onOpenValidation={() => setIsValidationOpen(true)}
        onImportError={(errors) => setImportErrors(errors)}
      />

      <div className="flex-1 flex overflow-hidden">
        <LibraryTree />
        <main className="flex-1 flex overflow-hidden bg-slate-950">
          <MainEditor />
        </main>
        <ParameterInspector />
      </div>

      <ValidationModal
        isOpen={isValidationOpen}
        onClose={() => setIsValidationOpen(false)}
      />

      <ImportErrorModal
        errors={importErrors}
        onClose={() => setImportErrors([])}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <EditorProvider>
      <AppContent />
    </EditorProvider>
  );
};
