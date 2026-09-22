import React from 'react';
import { EditorProvider } from './state/EditorProvider';
import { AppShell } from './components/layout/AppShell';

export const App: React.FC = () => {
  return (
    <EditorProvider>
      <AppShell />
    </EditorProvider>
  );
};
