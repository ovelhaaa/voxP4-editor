import React from 'react';
import { Music, Sliders, ListOrdered, FolderKanban } from 'lucide-react';

export type MainNavSection = 'songs' | 'sounds' | 'setlists' | 'library';

interface PrimaryNavProps {
  activeSection: MainNavSection;
  onSelectSection: (section: MainNavSection) => void;
  songsCount?: number;
  soundsCount?: number;
  setlistsCount?: number;
}

export const PrimaryNav: React.FC<PrimaryNavProps> = ({
  activeSection,
  onSelectSection,
  songsCount,
  soundsCount,
  setlistsCount,
}) => {
  const items: {
    id: MainNavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count?: number;
  }[] = [
    { id: 'songs', label: 'SONGS', icon: Music, count: songsCount },
    { id: 'sounds', label: 'SOUNDS', icon: Sliders, count: soundsCount },
    { id: 'setlists', label: 'SETLISTS', icon: ListOrdered, count: setlistsCount },
    { id: 'library', label: 'LIBRARY', icon: FolderKanban },
  ];

  return (
    <>
      {/* Desktop Vertical Nav Rail */}
      <nav className="hidden md:flex flex-col w-20 bg-[#101116] border-r border-[#292A30] shrink-0 select-none py-3 justify-between">
        <div className="space-y-1.5 px-2">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className={`w-full py-3 px-1 rounded-[4px] flex flex-col items-center justify-center gap-1 transition cursor-pointer relative ${
                  isActive
                    ? 'bg-[#1C1D24] text-[#FF6030] font-bold shadow-sm'
                    : 'text-[#716E69] hover:text-[#F0EDE5] hover:bg-[#14151B]'
                }`}
                title={item.label}
              >
                {/* Left active accent bar */}
                {isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#F45126] rounded-r" />
                )}
                <Icon className="w-5 h-5" />
                <span className="text-[10px] tracking-wider font-mono">
                  {item.label}
                </span>
                {typeof item.count === 'number' && (
                  <span
                    className={`text-[9px] font-mono px-1 rounded-[2px] ${
                      isActive
                        ? 'bg-[#F45126]/20 text-[#FF6030]'
                        : 'text-[#4A4947]'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile / Narrow Viewport Bottom Navigation */}
      <nav className="flex md:hidden fixed bottom-0 left-0 right-0 h-14 bg-[#101116] border-t border-[#292A30] select-none z-40 items-center justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`flex-1 py-1.5 flex flex-col items-center justify-center gap-0.5 min-h-[44px] transition cursor-pointer ${
                isActive
                  ? 'text-[#FF6030] font-bold'
                  : 'text-[#716E69] hover:text-[#F0EDE5]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-mono tracking-wider">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
