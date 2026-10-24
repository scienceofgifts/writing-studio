/**
 * Science of Gifts - Cloud Revision Conflict Resolution Modal (Requirement 5 & 7)
 * Displays when a cloud save is rejected due to a newer server revision or when
 * login reconciliation detects diverging local and cloud changes.
 * Allows the user to:
 * 1. Reload the cloud version (preserving local edits in recoverable version history)
 * 2. Keep a separate recoverable copy of local edits
 * 3. Explicitly compare and resolve by saving local changes over the latest cloud revision
 */

import React, { useState, useMemo } from 'react';
import { ProjectConflictInfo } from '../types/project';
import { computeVersionDiff } from '../services/versionHistoryService';
import { countWords, ensureSemanticHtml } from '../utils/richText';
import {
  AlertTriangle,
  CloudDownload,
  Copy,
  GitCompare,
  UploadCloud,
  X,
  Columns,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

interface ConflictResolutionModalProps {
  conflict: ProjectConflictInfo | null;
  isResolving?: boolean;
  onAdoptCloud: (conflict: ProjectConflictInfo) => void;
  onKeepSeparateCopy: (conflict: ProjectConflictInfo) => void;
  onOverwriteCloud: (conflict: ProjectConflictInfo) => void;
  onClose: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  conflict,
  isResolving = false,
  onAdoptCloud,
  onKeepSeparateCopy,
  onOverwriteCloud,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'side_by_side' | 'diff'>('side_by_side');

  const diffResult = useMemo(() => {
    if (!conflict) return null;
    return computeVersionDiff(
      conflict.localProject.content || '',
      conflict.remoteProject.content || '',
      `cloud-rev-${conflict.remoteRevision}`
    );
  }, [conflict]);

  if (!conflict) return null;

  const localWords = countWords(conflict.localProject.content || '');
  const remoteWords = countWords(conflict.remoteProject.content || '');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-fade-in"
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-[#faf9f6] border border-[#dcd6ca] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 bg-amber-50 border-b border-amber-200 flex items-start justify-between gap-4 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="conflict-dialog-title"
                className="font-editorial text-lg font-bold text-[#1e232a]"
              >
                Cloud Revision Conflict — Changes Need Review
              </h3>
              <p className="text-xs text-amber-950 mt-0.5 leading-relaxed">
                {conflict.reason ||
                  `Your working copy was based on Cloud Revision #${conflict.baseRevision}, but Cloud Revision #${conflict.remoteRevision} is currently saved in the cloud.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex bg-white border border-[#dcd6ca] p-0.5 rounded-lg text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('side_by_side')}
                className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode === 'side_by_side'
                    ? 'bg-[#1e232a] text-white font-semibold'
                    : 'text-[#5c5447] hover:text-[#1e232a]'
                }`}
              >
                <Columns className="w-3.5 h-3.5" />
                <span>Side-by-Side</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('diff')}
                className={`px-2.5 py-1 rounded-md inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode === 'diff'
                    ? 'bg-[#1e232a] text-white font-semibold'
                    : 'text-[#5c5447] hover:text-[#1e232a]'
                }`}
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>Compare Diff</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isResolving}
              aria-label="Close conflict review"
              className="p-1.5 text-[#736c61] hover:text-[#1e232a] rounded-lg hover:bg-amber-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Safety Assurance Banner */}
        <div className="px-5 py-2 bg-[#f5f2ea] border-b border-[#e5dfd3] flex items-center gap-2 text-xs text-[#5c5447] shrink-0">
          <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            Neither version has been discarded. Regardless of which option you choose, previous revisions are preserved in Version History.
          </span>
        </div>

        {/* Comparison Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {viewMode === 'side_by_side' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Local Working Copy */}
              <div className="flex flex-col rounded-xl border border-amber-300 bg-white overflow-hidden shadow-2xs">
                <div className="px-4 py-2.5 bg-amber-50/80 border-b border-amber-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold uppercase tracking-wider text-amber-950 block">
                      Your Local Working Version
                    </span>
                    <span className="text-[11px] text-amber-800">
                      Based on Revision #{conflict.baseRevision} • {localWords} words
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-200/80 text-amber-950 text-[10px] font-bold uppercase">
                    Local
                  </span>
                </div>
                <div className="px-4 py-2 border-b border-[#f0ede6] bg-[#faf9f6] text-xs">
                  <span className="text-[#736c61] font-medium">Title: </span>
                  <span className="font-editorial font-bold text-[#1e232a]">
                    {conflict.localProject.title}
                  </span>
                </div>
                <div
                  className="p-4 font-editorial text-sm text-[#1e232a] leading-relaxed max-h-[340px] overflow-y-auto prose-sm"
                  dangerouslySetInnerHTML={{
                    __html: ensureSemanticHtml(conflict.localProject.content || ''),
                  }}
                />
              </div>

              {/* Authoritative Cloud Version */}
              <div className="flex flex-col rounded-xl border border-indigo-300 bg-white overflow-hidden shadow-2xs">
                <div className="px-4 py-2.5 bg-indigo-50/80 border-b border-indigo-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold uppercase tracking-wider text-indigo-950 block">
                      Current Cloud Version (Revision #{conflict.remoteRevision})
                    </span>
                    <span className="text-[11px] text-indigo-800">
                      Authoritative Cloud State • {remoteWords} words
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-indigo-200/80 text-indigo-950 text-[10px] font-bold uppercase">
                    Cloud Rev #{conflict.remoteRevision}
                  </span>
                </div>
                <div className="px-4 py-2 border-b border-[#f0ede6] bg-[#faf9f6] text-xs">
                  <span className="text-[#736c61] font-medium">Title: </span>
                  <span className="font-editorial font-bold text-[#1e232a]">
                    {conflict.remoteProject.title}
                  </span>
                </div>
                <div
                  className="p-4 font-editorial text-sm text-[#1e232a] leading-relaxed max-h-[340px] overflow-y-auto prose-sm"
                  dangerouslySetInnerHTML={{
                    __html: ensureSemanticHtml(conflict.remoteProject.content || ''),
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {diffResult && (
                <div className="flex items-center gap-3 text-xs font-medium bg-white p-3 rounded-xl border border-[#e5dfd3]">
                  <span className="text-[#5c5447]">Local vs. Cloud Revision #{conflict.remoteRevision}:</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                    +{diffResult.additionsCount} local additions
                  </span>
                  <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-semibold">
                    -{diffResult.deletionsCount} cloud differences
                  </span>
                  <span className="text-[#736c61]">
                    {diffResult.unchangedCount} paragraphs identical
                  </span>
                </div>
              )}

              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {diffResult?.diffParagraphs.map((diffP, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border text-sm font-editorial leading-relaxed ${
                      diffP.type === 'added'
                        ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                        : diffP.type === 'removed'
                        ? 'bg-rose-50/70 border-rose-300 text-rose-950 line-through'
                        : diffP.type === 'modified'
                        ? 'bg-amber-50/50 border-amber-300 text-[#1e232a]'
                        : 'bg-white border-[#e5dfd3] text-[#1e232a]'
                    }`}
                  >
                    {diffP.diffSegments
                      ? diffP.diffSegments.map((seg, sIdx) => (
                          <span
                            key={sIdx}
                            className={
                              seg.type === 'added'
                                ? 'bg-emerald-200/70 text-emerald-950 px-0.5 rounded font-medium'
                                : seg.type === 'removed'
                                ? 'bg-rose-200/70 text-rose-950 px-0.5 rounded line-through opacity-80'
                                : ''
                            }
                          >
                            {seg.value}
                          </span>
                        ))
                      : diffP.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Resolution Actions */}
        <div className="px-5 py-4 bg-[#f5f2ea] border-t border-[#e5dfd3] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isResolving}
            className="px-3.5 py-2 text-xs font-semibold text-[#5c5447] hover:text-[#1e232a] bg-white border border-[#dcd6ca] hover:bg-[#ede8dc] rounded-lg transition-colors cursor-pointer"
          >
            Review Later
          </button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* Option 1: Reload Cloud Version */}
            <button
              type="button"
              onClick={() => onAdoptCloud(conflict)}
              disabled={isResolving}
              className="px-3.5 py-2 min-h-[38px] text-xs font-semibold text-indigo-950 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              title="Adopt the cloud version and archive your local edits in Version History"
            >
              <CloudDownload className="w-3.5 h-3.5 text-indigo-700" />
              <span>Reload Cloud Version (Rev #{conflict.remoteRevision})</span>
            </button>

            {/* Option 2: Keep Separate Copy */}
            <button
              type="button"
              onClick={() => onKeepSeparateCopy(conflict)}
              disabled={isResolving}
              className="px-3.5 py-2 min-h-[38px] text-xs font-semibold text-[#1e232a] bg-white hover:bg-[#ede8dc] border border-[#dcd6ca] rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              title="Save your local edits as a separate project copy and keep the cloud version here"
            >
              <Copy className="w-3.5 h-3.5 text-amber-800" />
              <span>Keep Local as Separate Copy</span>
            </button>

            {/* Option 3: Overwrite Cloud with Local */}
            <button
              type="button"
              onClick={() => onOverwriteCloud(conflict)}
              disabled={isResolving}
              className="px-4 py-2 min-h-[38px] text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg transition-colors shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
              title="Save your local version as the new Cloud Revision #(remoteRevision + 1) while preserving the previous cloud revision in Version History"
            >
              {isResolving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                  <span>Resolving...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5 text-amber-300" />
                  <span>Save Local as New Cloud Revision</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
