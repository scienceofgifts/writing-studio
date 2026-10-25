/**
 * Science of Gifts - Consolidated Editing Brief Export Modal
 * Generates a single, structured, copy-ready prompt for ChatGPT or Claude
 * containing the full clean article, all anchored editing notes in document order,
 * any unresolved/needs-attention notes, and clear external AI revision instructions.
 */

import React, { useState, useMemo } from 'react';
import { WritingProject } from '../../types/project';
import {
  buildConsolidatedEditingBrief,
  sortEditingNotesInArticleOrder,
} from '../../utils/editingNotes';
import { copyToClipboard, downloadFile, slugify } from '../../services/articleExport';
import { toast } from '../../services/toastService';
import {
  Copy,
  Check,
  Download,
  X,
  FileText,
  AlertTriangle,
  Sparkles,
  MessageSquare,
} from 'lucide-react';

interface ExportEditingBriefModalProps {
  isOpen: boolean;
  project: WritingProject;
  onClose: () => void;
}

export const ExportEditingBriefModal: React.FC<ExportEditingBriefModalProps> = ({
  isOpen,
  project,
  onClose,
}) => {
  const [targetAssistant, setTargetAssistant] = useState<'chatgpt' | 'claude' | 'universal'>('chatgpt');
  const [articleFormat, setArticleFormat] = useState<'markdown' | 'plain_text'>('markdown');
  const [additionalDirection, setAdditionalDirection] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  const orderedNotes = useMemo(
    () => sortEditingNotesInArticleOrder(project.editingNotes || []),
    [project.editingNotes]
  );

  const resolvedCount = orderedNotes.filter((n) => n.anchorStatus === 'resolved').length;
  const ambiguousCount = orderedNotes.filter((n) => n.anchorStatus === 'ambiguous').length;
  const unresolvedCount = orderedNotes.filter((n) => n.anchorStatus === 'unresolved').length;

  const briefText = useMemo(() => {
    if (!isOpen) return '';
    return buildConsolidatedEditingBrief(project, {
      targetAssistant,
      articleFormat,
      additionalGlobalDirection: additionalDirection,
    });
  }, [isOpen, project, targetAssistant, articleFormat, additionalDirection]);

  if (!isOpen) return null;

  const handleCopyBrief = async () => {
    const ok = await copyToClipboard(briefText);
    if (ok) {
      setCopied(true);
      toast.success(
        'Editing Brief Copied',
        `Copied consolidated brief with ${orderedNotes.length} editing note${
          orderedNotes.length === 1 ? '' : 's'
        } for ${
          targetAssistant === 'chatgpt'
            ? 'ChatGPT'
            : targetAssistant === 'claude'
            ? 'Claude'
            : 'your AI assistant'
        }.`
      );
      setTimeout(() => setCopied(false), 2500);
    } else {
      toast.error('Copy Failed', 'Could not copy brief to clipboard.');
    }
  };

  const handleDownloadBrief = () => {
    const slug = slugify(project.title || 'article') || 'article';
    const filename = `${slug}-editing-brief.md`;
    downloadFile(filename, briefText, 'text/markdown');
    toast.success('Brief Downloaded', `Saved ${filename}`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[1px] p-3 sm:p-6 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-editing-brief-title"
    >
      <div className="bg-[#faf9f6] border border-[#dcd6ca] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-xs">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-[#f5f2ea] border-b border-[#e5dfd3] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-amber-800" />
            </div>
            <div>
              <h3
                id="export-editing-brief-title"
                className="font-editorial font-bold text-base sm:text-lg text-[#1e232a]"
              >
                Export Consolidated Editing Brief
              </h3>
              <p className="text-[11px] text-[#736c61]">
                Complete article + {orderedNotes.length} anchored editing note
                {orderedNotes.length === 1 ? '' : 's'} formatted for ChatGPT or Claude
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[#736c61] hover:text-[#1e232a] rounded-lg hover:bg-[#e8e2d5] transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {orderedNotes.length === 0 ? (
          /* Empty State when 0 notes exist */
          <div className="p-8 text-center space-y-3 flex-1 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-800">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h4 className="font-editorial font-bold text-base text-[#1e232a]">
              No Editing Notes Attached Yet
            </h4>
            <p className="text-xs text-[#5c5447] max-w-md leading-relaxed">
              Select any word, sentence, or paragraph inside the article editor and click{' '}
              <strong>Voice Note</strong> or <strong>Write Note</strong> to attach revision instructions. Once you have added at least one note, you can export a consolidated editing brief here.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#1e232a] text-white hover:bg-[#2d3440] transition-colors cursor-pointer"
            >
              Return to Editor
            </button>
          </div>
        ) : (
          <>
            {/* Configuration & Status Bar */}
            <div className="px-4 sm:px-6 py-3 bg-white border-b border-[#e5dfd3] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#736c61]">
                  Target AI:
                </span>
                <div className="inline-flex rounded-lg border border-[#dcd6ca] bg-[#faf9f6] p-0.5">
                  {(
                    [
                      { id: 'chatgpt', label: 'ChatGPT' },
                      { id: 'claude', label: 'Claude' },
                      { id: 'universal', label: 'Universal' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTargetAssistant(opt.id)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        targetAssistant === opt.id
                          ? 'bg-[#1e232a] text-white shadow-2xs'
                          : 'text-[#5c5447] hover:text-[#1e232a]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="h-4 w-px bg-[#e5dfd3] mx-1 hidden sm:block" />

                <span className="text-[11px] font-bold uppercase tracking-wider text-[#736c61]">
                  Article Body:
                </span>
                <div className="inline-flex rounded-lg border border-[#dcd6ca] bg-[#faf9f6] p-0.5">
                  <button
                    type="button"
                    onClick={() => setArticleFormat('markdown')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      articleFormat === 'markdown'
                        ? 'bg-[#1e232a] text-white shadow-2xs'
                        : 'text-[#5c5447] hover:text-[#1e232a]'
                    }`}
                  >
                    Clean Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => setArticleFormat('plain_text')}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      articleFormat === 'plain_text'
                        ? 'bg-[#1e232a] text-white shadow-2xs'
                        : 'text-[#5c5447] hover:text-[#1e232a]'
                    }`}
                  >
                    Plain Prose
                  </button>
                </div>
              </div>

              {/* Summary Counts */}
              <div className="flex items-center gap-2 text-[11px]">
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                  {resolvedCount} anchored
                </span>
                {ambiguousCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-950 font-semibold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-800" />
                    <span>{ambiguousCount} ambiguous</span>
                  </span>
                )}
                {unresolvedCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 border border-rose-300 text-rose-950 font-semibold inline-flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-700" />
                    <span>{unresolvedCount} needs attention</span>
                  </span>
                )}
              </div>
            </div>

            {/* Content Preview & Optional Overall Note */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {(ambiguousCount > 0 || unresolvedCount > 0) && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <strong>Note on Anchor Status:</strong>{' '}
                    {unresolvedCount > 0 &&
                      `${unresolvedCount} note(s) had their original passage modified or removed and are included in a dedicated "Needs Attention" section with their original passage context. `}
                    {ambiguousCount > 0 &&
                      `${ambiguousCount} note(s) match a repeated phrase and include surrounding disambiguation context.`}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                  Optional Overall Editorial Note for {targetAssistant === 'chatgpt' ? 'ChatGPT' : targetAssistant === 'claude' ? 'Claude' : 'AI'}
                </label>
                <input
                  type="text"
                  value={additionalDirection}
                  onChange={(e) => setAdditionalDirection(e.target.value)}
                  placeholder="e.g., Keep total word count under 1,300 words while applying these edits..."
                  className="w-full px-3 py-1.5 rounded-lg border border-[#dcd6ca] bg-white text-xs text-[#1e232a] focus:outline-hidden focus:border-amber-600"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61] inline-flex items-center gap-1">
                    <FileText className="w-3 h-3 text-amber-800" />
                    <span>Consolidated Editing Brief Preview</span>
                  </span>
                  <span className="text-[11px] text-[#736c61]">
                    Includes all {orderedNotes.length} confirmed notes in article order
                  </span>
                </div>

                <textarea
                  readOnly
                  rows={14}
                  value={briefText}
                  className="w-full p-3.5 rounded-xl border border-[#dcd6ca] bg-white font-mono text-[11px] text-[#1e232a] leading-relaxed focus:outline-hidden select-all"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="px-4 sm:px-6 py-3.5 bg-[#f5f2ea] border-t border-[#e5dfd3] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleDownloadBrief}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#1e232a] bg-white hover:bg-[#ede8dc] border border-[#dcd6ca] transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-amber-800" />
                <span>Download Brief (.md)</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#5c5447] hover:text-[#1e232a] hover:bg-[#e8e2d5] transition-colors cursor-pointer"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={handleCopyBrief}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1e232a] hover:bg-[#2d3440] text-white transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-amber-300" />
                      <span>Copy Editing Brief</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
