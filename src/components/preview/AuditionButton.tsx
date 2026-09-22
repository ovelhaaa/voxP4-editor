import React, { useEffect, useState } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';
import { previewEngine } from '../../audio/PreviewEngine';
import { PreviewEngineStatus } from '../../audio/types';
import { ResolvedParameterState } from '../../domain/resolution';

interface AuditionButtonProps {
  label: string;
  resolvedParams: () => readonly ResolvedParameterState[];
  className?: string;
  title?: string;
}

export const AuditionButton: React.FC<AuditionButtonProps> = ({
  label,
  resolvedParams,
  className = '',
  title = 'Audition this sound with Vocal Preview',
}) => {
  const [status, setStatus] = useState<PreviewEngineStatus>(previewEngine.getStatus());

  useEffect(() => {
    return previewEngine.subscribe(setStatus);
  }, []);

  const isCurrentAudition = status.activeContextLabel === label;
  const isPlayingThis = isCurrentAudition && status.state === 'playing';
  const isRenderingThis = isCurrentAudition && status.state === 'rendering';

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (isPlayingThis) {
      previewEngine.pause();
      return;
    }

    try {
      const params = resolvedParams();
      await previewEngine.requestRender(label, params);
      previewEngine.play();
    } catch (err) {
      console.error('Audition failed:', err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`p-1 rounded transition cursor-pointer flex items-center justify-center ${
        isPlayingThis
          ? 'bg-[#F45126] text-[#090A0E] shadow'
          : isRenderingThis
            ? 'bg-[#F45126]/20 text-[#F45126]'
            : 'text-[#716E69] hover:text-[#F45126] hover:bg-[#1C1D24]'
      } ${className}`}
      title={title}
    >
      {isRenderingThis ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isPlayingThis ? (
        <Pause className="w-3.5 h-3.5 fill-current" />
      ) : (
        <Play className="w-3.5 h-3.5 fill-current" />
      )}
    </button>
  );
};
