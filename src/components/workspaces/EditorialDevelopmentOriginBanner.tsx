import React from 'react';
import { Compass } from 'lucide-react';
import { EditorialDevelopment } from '../../types/project';

interface EditorialDevelopmentOriginBannerProps {
  editorialDevelopment?: EditorialDevelopment;
  onOpenDevelop?: () => void;
}

/**
 * Reusable Editorial Development origin banner for the dedicated Development workspace (Stage 2).
 * Uses responsive flex wrapping (`min-w-0 flex-1 break-words`) and a non-shrinking action button
 * (`shrink-0`) so long idea titles wrap cleanly inside the container without overflowing.
 */
export const EditorialDevelopmentOriginBanner: React.FC<EditorialDevelopmentOriginBannerProps> = ({
  editorialDevelopment,
  onOpenDevelop,
}) => {
  if (!editorialDevelopment?.originalIdea || editorialDevelopment?.brief) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl w-full bg-[#f6f3eb] border border-[#ded7ca] rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs min-w-0 overflow-hidden">
      <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
        <Compass className="w-4 h-4 text-amber-900 shrink-0 mt-0.5 sm:mt-0" />
        <p className="min-w-0 flex-1 leading-relaxed break-words text-[#5c5447]">
          <span className="font-bold text-[#1e232a] mr-1.5">Editorial Development:</span>
          <span>
            Originated from idea &ldquo;{editorialDevelopment.originalIdea.title}&rdquo;. Ready to
            shape 5 editorial angles and synthesize a structured brief.
          </span>
        </p>
      </div>
      {onOpenDevelop && (
        <button
          type="button"
          onClick={onOpenDevelop}
          className="w-full sm:w-auto px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold bg-[#1e232a] text-white hover:bg-[#2d3744] transition-colors shrink-0 cursor-pointer shadow-2xs text-center flex items-center justify-center whitespace-nowrap"
        >
          Develop Article
        </button>
      )}
    </div>
  );
};
