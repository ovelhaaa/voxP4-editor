import React, { useState } from 'react';
import { useEditor } from '../../state/editorState';
import { ProjectHeader } from './ProjectHeader';
import { PrimaryNav, MainNavSection } from './PrimaryNav';
import { SongsView } from '../views/SongsView';
import { SoundsView } from '../views/SoundsView';
import { SetlistsView } from '../views/SetlistsView';
import { LibraryView } from '../views/LibraryView';
import { AdvancedParameterDrawer } from '../inspector/AdvancedParameterDrawer';
import { ValidationModal } from '../modals/ValidationModal';
import { ImportErrorModal } from '../modals/ImportErrorModal';

export const AppShell: React.FC = () => {
  const { state, dispatch } = useEditor();
  const { selection, library } = state;

  const [isValidationOpen, setIsValidationOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Derive active tab from selection
  const activeSection: MainNavSection =
    selection.type === 'preset'
      ? 'sounds'
      : selection.type === 'setlist'
        ? 'setlists'
        : selection.type === 'library'
          ? 'library'
          : 'songs';

  const handleSelectSection = (section: MainNavSection) => {
    switch (section) {
      case 'songs': {
        const sceneToSelect = library.scenes[0];
        if (sceneToSelect) {
          dispatch({
            type: 'SET_SELECTION',
            selection: { type: 'scene', id: sceneToSelect.id },
          });
        }
        break;
      }
      case 'sounds': {
        const presetToSelect = library.presets[0];
        if (presetToSelect) {
          dispatch({
            type: 'SET_SELECTION',
            selection: { type: 'preset', id: presetToSelect.id },
          });
        }
        break;
      }
      case 'setlists': {
        const setlistToSelect = library.setlists[0];
        if (setlistToSelect) {
          dispatch({
            type: 'SET_SELECTION',
            selection: { type: 'setlist', id: setlistToSelect.id },
          });
        }
        break;
      }
      case 'library': {
        dispatch({
          type: 'SET_SELECTION',
          selection: { type: 'library', id: library.libraryId },
        });
        break;
      }
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#090A0E] text-[#F0EDE5] overflow-hidden">
      {/* Streamlined Hardware Header */}
      <ProjectHeader
        onOpenValidation={() => setIsValidationOpen(true)}
        onImportError={(errors) => setImportErrors(errors)}
        onToggleAdvancedDrawer={() => setIsAdvancedOpen(!isAdvancedOpen)}
        isAdvancedOpen={isAdvancedOpen}
      />

      {/* Main Task Area with Single Focus */}
      <div className="flex-1 flex overflow-hidden pb-14 md:pb-0">
        {/* Primary Navigation Rail (Desktop) / Bottom Nav (Mobile) */}
        <PrimaryNav
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
          songsCount={library.scenes.length}
          soundsCount={library.presets.length}
          setlistsCount={library.setlists.length}
        />

        {/* Active View Container */}
        <div className="flex-1 flex overflow-hidden bg-[#090A0E]">
          {activeSection === 'songs' && (
            <SongsView onOpenAdvanced={() => setIsAdvancedOpen(true)} />
          )}
          {activeSection === 'sounds' && (
            <SoundsView onOpenAdvanced={() => setIsAdvancedOpen(true)} />
          )}
          {activeSection === 'setlists' && <SetlistsView />}
          {activeSection === 'library' && (
            <LibraryView onImportError={(errors) => setImportErrors(errors)} />
          )}
        </div>
      </div>

      {/* Advanced Parameter Drawer (Slide-over, Closed by default) */}
      <AdvancedParameterDrawer
        isOpen={isAdvancedOpen}
        onClose={() => setIsAdvancedOpen(false)}
      />

      {/* Validation Modal (Accessible from header / project menu) */}
      <ValidationModal
        isOpen={isValidationOpen}
        onClose={() => setIsValidationOpen(false)}
      />

      {/* Atomic Import Error Modal */}
      <ImportErrorModal
        errors={importErrors}
        onClose={() => setImportErrors([])}
      />
    </div>
  );
};
