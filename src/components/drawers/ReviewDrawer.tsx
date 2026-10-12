/**
 * Science of Gifts - AI Editorial Review Drawer (Phase 7)
 * Evaluates writing against editorial principles, voice profiles, factual accuracy,
 * repetition, and hard content rules without automatic silent rewriting.
 */

import React, { useState, useMemo } from 'react';
import {
  WritingProject,
  ReviewFinding,
  ReviewMode,
  ReviewScope,
  ReviewSeverity,
  ReviewCategory,
  EditorialReviewResult,
} from '../../types/project';
import { geminiService } from '../../services/geminiClient';
import { extractPlainTextFromHtml } from '../../utils/richText';
import {
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  Check,
  X,
  ChevronDown,
  Layers,
  FileText,
  MousePointer,
  Filter,
  CheckCheck,
  Scale,
  RefreshCw,
  Search,
  BookOpen,
  Loader2,
  Flame,
  Zap,
  Cpu,
  HelpCircle,
} from 'lucide-react';
import { ModelId } from '../../types/models';
import { ALL_MODELS, getModelDefinition } from '../../services/modelRegistry';
import { storage } from '../../services/storage';

interface ReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: WritingProject;
  selectedText?: string;
  onUpdateReview: (reviewResult: EditorialReviewResult) => void;
  onAcceptFinding: (finding: ReviewFinding) => void;
  onAcceptAllFindings: (findings: ReviewFinding[]) => void;
  onRejectFinding: (findingId: string) => void;
  onRejectAllFindings: () => void;
}

export const ReviewDrawer: React.FC<ReviewDrawerProps> = ({
  isOpen,
  onClose,
  project,
  selectedText = '',
  onUpdateReview,
  onAcceptFinding,
  onAcceptAllFindings,
  onRejectFinding,
  onRejectAllFindings,
}) => {
  const [scope, setScope] = useState<ReviewScope>(selectedText ? 'selection' : 'all');
  const [mode, setMode] = useState<ReviewMode>('full');
  const [reviewModelOverride, setReviewModelOverride] = useState<ModelId | undefined>(undefined);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    project.outline && project.outline.length > 0 ? project.outline[0].id : ''
  );
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical_important' | 'rules' | 'ai_repetition' | 'suggestions'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const review: EditorialReviewResult | undefined = project.editorialReview;

  // Stale detection: compare current document content against findings' original text
  const findingsWithStaleState = useMemo(() => {
    if (!review || !review.findings) return [];
    const plainDoc = extractPlainTextFromHtml(project.content).toLowerCase();

    return review.findings.map((f) => {
      if (f.status === 'accepted' || f.status === 'rejected') return f;
      if (f.originalText && f.originalText.trim()) {
        const cleanOrig = f.originalText.trim().toLowerCase();
        if (!plainDoc.includes(cleanOrig)) {
          return { ...f, status: 'stale' as const };
        }
      }
      return f;
    });
  }, [review, project.content]);

  // Filtered findings based on active tab
  const filteredFindings = useMemo(() => {
    return findingsWithStaleState.filter((f) => {
      if (activeFilter === 'critical_important') {
        return f.severity === 'critical' || f.severity === 'important';
      }
      if (activeFilter === 'rules') {
        return f.category === 'content_rules' || f.isRuleViolation;
      }
      if (activeFilter === 'ai_repetition') {
        return f.category === 'ai_language' || f.category === 'repetition';
      }
      if (activeFilter === 'suggestions') {
        return f.severity === 'suggestion' || f.severity === 'minor';
      }
      return true;
    });
  }, [findingsWithStaleState, activeFilter]);

  const pendingWithProposed = useMemo(() => {
    return findingsWithStaleState.filter(
      (f) => f.status === 'pending' && f.proposedText && f.proposedText.trim()
    );
  }, [findingsWithStaleState]);

  const pendingCount = useMemo(() => {
    return findingsWithStaleState.filter((f) => f.status === 'pending').length;
  }, [findingsWithStaleState]);

  // Run Editorial Review
  const handleRunReview = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await geminiService.runEditorialReview(project, {
        scope,
        mode,
        selectedText: scope === 'selection' ? selectedText : undefined,
        targetSectionId: scope === 'section' ? selectedSectionId : undefined,
        modelOverride: reviewModelOverride,
      });

      if (res.ok && res.result) {
        onUpdateReview(res.result);
      } else {
        setErrorMessage(res.error || 'Failed to conduct editorial review.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during review.');
    } finally {
      setIsLoading(false);
    }
  };

  const getSeverityBadge = (severity: ReviewSeverity) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-900 border border-rose-300">
            Critical
          </span>
        );
      case 'important':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
            Important
          </span>
        );
      case 'minor':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-stone-100 text-stone-800 border border-stone-300">
            Minor
          </span>
        );
      case 'suggestion':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-900 border border-blue-200">
            Suggestion
          </span>
        );
    }
  };

  const getCategoryLabel = (category: ReviewCategory, isRule?: boolean) => {
    if (isRule || category === 'content_rules') {
      return (
        <span className="flex items-center gap-1 font-bold text-purple-900">
          <Scale className="w-3.5 h-3.5 text-purple-700" />
          <span>Rule Violation</span>
        </span>
      );
    }
    switch (category) {
      case 'ai_language':
        return (
          <span className="flex items-center gap-1 font-semibold text-amber-900">
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>AI-Sounding Language</span>
          </span>
        );
      case 'repetition':
        return (
          <span className="flex items-center gap-1 font-semibold text-blue-900">
            <RotateCcw className="w-3.5 h-3.5 text-blue-700" />
            <span>Repetition</span>
          </span>
        );
      case 'clarity':
        return (
          <span className="flex items-center gap-1 font-semibold text-emerald-900">
            <HelpCircle className="w-3.5 h-3.5 text-emerald-700" />
            <span>Clarity & References</span>
          </span>
        );
      case 'flow':
        return (
          <span className="flex items-center gap-1 font-semibold text-stone-900">
            <Layers className="w-3.5 h-3.5 text-stone-700" />
            <span>Flow & Structure</span>
          </span>
        );
      case 'tone_style':
        return (
          <span className="flex items-center gap-1 font-semibold text-amber-950">
            <BookOpen className="w-3.5 h-3.5 text-amber-800" />
            <span>Tone & Style Drift</span>
          </span>
        );
      case 'unsupported_claims':
        return (
          <span className="flex items-center gap-1 font-semibold text-rose-900">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-700" />
            <span>Unsupported Claim</span>
          </span>
        );
      case 'seo':
        return (
          <span className="flex items-center gap-1 font-semibold text-teal-900">
            <Search className="w-3.5 h-3.5 text-teal-700" />
            <span>SEO & Search Intent</span>
          </span>
        );
      case 'internal_links':
        return (
          <span className="flex items-center gap-1 font-semibold text-indigo-900">
            <FileText className="w-3.5 h-3.5 text-indigo-700" />
            <span>Internal Linking</span>
          </span>
        );
      default:
        return <span>Editorial Review</span>;
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      className="max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full w-full md:w-[480px] lg:w-[540px] shrink-0 h-full bg-[#fcfbfa] md:border-l border-[#ded7ca] flex flex-col overflow-hidden animate-in slide-in-from-right-1 duration-150 z-30"
      aria-label="Editorial Review Drawer"
    >
      {/* DRAWER HEADER */}
      <div className="p-4 sm:p-5 bg-[#f5f1e8] border-b border-[#ded7ca] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#1e232a] text-[#f7f5ef] flex items-center justify-center font-display font-semibold shadow-2xs shrink-0">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 className="font-editorial text-base font-bold text-[#1e232a] leading-tight truncate">
              AI Editorial Review
            </h2>
            <p className="text-[11px] text-[#736c61] truncate">
              Discerning critique & targeted refinements without silent rewrites.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#736c61] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7] transition-colors shrink-0"
          title="Close review panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* REVIEW CONFIGURATION PANEL */}
      <div className="p-4 bg-white border-b border-[#e5dfd3] shrink-0 space-y-3.5 text-xs">
        {/* Scope Selector */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#736c61] mb-1.5">
            Review Scope
          </label>
          <div className="grid grid-cols-3 gap-1.5 p-0.5 bg-[#f5f1e8] rounded-lg border border-[#e5dfd3]">
            <button
              type="button"
              onClick={() => setScope('all')}
              className={`py-1.5 px-2 rounded-md font-semibold text-center transition-colors ${
                scope === 'all'
                  ? 'bg-white shadow-2xs text-[#1e232a]'
                  : 'text-[#6e685f] hover:text-[#1e232a]'
              }`}
            >
              Entire Document
            </button>
            <button
              type="button"
              onClick={() => setScope('selection')}
              className={`py-1.5 px-2 rounded-md font-semibold text-center transition-colors flex items-center justify-center gap-1 ${
                scope === 'selection'
                  ? 'bg-white shadow-2xs text-[#1e232a]'
                  : 'text-[#6e685f] hover:text-[#1e232a]'
              }`}
            >
              <MousePointer className="w-3 h-3 text-amber-700" />
              <span>Selection</span>
              {selectedText && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setScope('section')}
              className={`py-1.5 px-2 rounded-md font-semibold text-center transition-colors ${
                scope === 'section'
                  ? 'bg-white shadow-2xs text-[#1e232a]'
                  : 'text-[#6e685f] hover:text-[#1e232a]'
              }`}
            >
              Section
            </button>
          </div>

          {scope === 'selection' && (
            <div className="mt-1.5 p-2 bg-amber-50/80 border border-amber-200/80 rounded-md text-[11px] text-amber-900">
              {selectedText ? (
                <span className="line-clamp-2 italic">
                  &ldquo;{selectedText}&rdquo; ({selectedText.split(/\s+/).filter(Boolean).length} words selected)
                </span>
              ) : (
                <span className="text-amber-800">
                  No text currently selected in the editor. Highlight text or switch to Entire Document.
                </span>
              )}
            </div>
          )}

          {scope === 'section' && project.outline && project.outline.length > 0 && (
            <div className="mt-1.5">
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-[#dcd6ca] bg-[#faf9f6] text-xs text-[#1e232a]"
              >
                {project.outline.map((item, idx) => (
                  <option key={item.id} value={item.id}>
                    {idx + 1}. {item.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Mode Selector */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#736c61] mb-1.5">
            Review Focus / Mode
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {[
              { id: 'full', label: 'Full Review' },
              { id: 'overall', label: 'Overall Editorial' },
              { id: 'ai_language', label: 'AI Language' },
              { id: 'repetition', label: 'Repetition' },
              { id: 'clarity_flow', label: 'Clarity & Flow' },
              { id: 'style', label: 'Style & Voice' },
              { id: 'rules', label: 'Hard Rules' },
              { id: 'unsupported_claims', label: 'Factual Claims' },
              { id: 'seo', label: 'SEO & Intent' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id as ReviewMode)}
                className={`px-2 py-1.5 rounded-md border text-[11px] font-medium text-left transition-colors truncate ${
                  mode === m.id
                    ? 'bg-[#1e232a] text-white border-[#1e232a] shadow-2xs font-semibold'
                    : 'bg-[#faf9f6] text-[#4a443b] border-[#dcd6ca] hover:bg-[#f2eee5]'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Phase 9: Model Selection & Recommendation */}
        <div className="flex items-center justify-between gap-2 p-2 bg-[#faf9f6] border border-[#e5dfd3] rounded-lg text-xs">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-indigo-700" />
            <span className="text-[11px] font-semibold text-[#5c5447]">Model:</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-amber-800 font-medium hidden sm:inline">
              Rec: Gemini 3.8 Flash
            </span>
            <select
              value={reviewModelOverride || ''}
              onChange={(e) => setReviewModelOverride((e.target.value as ModelId) || undefined)}
              className="text-xs font-semibold px-2 py-1 bg-white border border-[#dcd6ca] rounded-md text-[#1e232a] focus:outline-hidden cursor-pointer"
            >
              <option value="">
                Project Default ({getModelDefinition(project.modelOverride || storage.getGlobalModel()).displayName})
              </option>
              {ALL_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName} {m.id === 'gemini-3.8-flash' ? '(Recommended)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Trigger Review Button */}
        <div className="pt-1">
          <button
            type="button"
            disabled={isLoading || (scope === 'selection' && !selectedText)}
            onClick={handleRunReview}
            className="w-full py-2.5 px-4 bg-[#1e232a] hover:bg-[#2d3440] text-white font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 select-none"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                <span>Conducting Editorial Review...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>{review ? 'Re-Run Editorial Review' : 'Run Editorial Review'}</span>
              </>
            )}
          </button>
        </div>

        {/* Phase 9 Error / Quota Fallback Handling */}
        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-950 rounded-lg text-xs space-y-2">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{getModelDefinition(reviewModelOverride || project.modelOverride || storage.getGlobalModel()).displayName} could not complete this request.</p>
                <p className="text-[11px] text-rose-800 mt-0.5">{errorMessage}</p>
              </div>
            </div>
            <div className="pt-2 border-t border-rose-200/80">
              <div className="text-[11px] font-bold text-rose-900 mb-1">Try another model:</div>
              <div className="flex flex-wrap gap-1">
                {ALL_MODELS.map((alt) => (
                  <button
                    key={alt.id}
                    type="button"
                    onClick={() => {
                      setReviewModelOverride(alt.id);
                      setErrorMessage(null);
                    }}
                    className="px-2 py-1 bg-white hover:bg-rose-100/80 border border-rose-300 rounded text-[10px] font-medium text-rose-900 transition-colors shadow-2xs"
                  >
                    {alt.displayName}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* REVIEW FINDINGS & QUALITATIVE SUMMARY */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {review ? (
          <>
            {/* Qualitative Assessment Card */}
            <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-[#f0ece3] pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#1e232a] uppercase tracking-wider font-editorial">
                    Editorial Assessment
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-900 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                    <Cpu className="w-2.5 h-2.5 text-indigo-700" />
                    <span>{getModelDefinition(reviewModelOverride || project.modelOverride || storage.getGlobalModel()).displayName}</span>
                  </span>
                  <span className="text-[10px] text-[#8c8477]">
                    {new Date(review.reviewedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                {/* Severity Counts */}
                <div className="flex items-center gap-1.5 text-[10px] font-bold">
                  {review.counts.critical > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-900">
                      {review.counts.critical} Critical
                    </span>
                  )}
                  {review.counts.important > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900">
                      {review.counts.important} Important
                    </span>
                  )}
                  {review.counts.minor > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-800">
                      {review.counts.minor} Minor
                    </span>
                  )}
                  {review.counts.suggestion > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-900">
                      {review.counts.suggestion} Suggestions
                    </span>
                  )}
                </div>
              </div>

              {/* Qualitative Synopsis */}
              <p className="font-editorial text-xs text-[#2b251d] leading-relaxed italic">
                &ldquo;{review.qualitativeSummary}&rdquo;
              </p>
            </div>

            {/* Batch Actions & Filter Tabs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#5c5447]">
                  Findings ({findingsWithStaleState.length})
                </span>

                {pendingCount > 0 && (
                  <div className="flex items-center gap-2">
                    {pendingWithProposed.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onAcceptAllFindings(pendingWithProposed)}
                        className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1"
                      >
                        <CheckCheck className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Accept All Fixes ({pendingWithProposed.length})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onRejectAllFindings}
                      className="text-[11px] font-semibold text-[#736c61] hover:text-[#1e232a]"
                    >
                      Dismiss Pending
                    </button>
                  </div>
                )}
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setActiveFilter('all')}
                  className={`px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors ${
                    activeFilter === 'all'
                      ? 'bg-[#1e232a] text-white'
                      : 'bg-white border border-[#dcd6ca] text-[#5c5447] hover:bg-[#ede8dc]'
                  }`}
                >
                  All ({findingsWithStaleState.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('critical_important')}
                  className={`px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors ${
                    activeFilter === 'critical_important'
                      ? 'bg-amber-800 text-white'
                      : 'bg-white border border-[#dcd6ca] text-[#5c5447] hover:bg-[#ede8dc]'
                  }`}
                >
                  Priority (
                  {
                    findingsWithStaleState.filter(
                      (f) => f.severity === 'critical' || f.severity === 'important'
                    ).length
                  }
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('rules')}
                  className={`px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors ${
                    activeFilter === 'rules'
                      ? 'bg-purple-800 text-white'
                      : 'bg-white border border-[#dcd6ca] text-[#5c5447] hover:bg-[#ede8dc]'
                  }`}
                >
                  Rules (
                  {
                    findingsWithStaleState.filter(
                      (f) => f.category === 'content_rules' || f.isRuleViolation
                    ).length
                  }
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('ai_repetition')}
                  className={`px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors ${
                    activeFilter === 'ai_repetition'
                      ? 'bg-blue-800 text-white'
                      : 'bg-white border border-[#dcd6ca] text-[#5c5447] hover:bg-[#ede8dc]'
                  }`}
                >
                  AI / Repetition (
                  {
                    findingsWithStaleState.filter(
                      (f) => f.category === 'ai_language' || f.category === 'repetition'
                    ).length
                  }
                  )
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFilter('suggestions')}
                  className={`px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors ${
                    activeFilter === 'suggestions'
                      ? 'bg-stone-800 text-white'
                      : 'bg-white border border-[#dcd6ca] text-[#5c5447] hover:bg-[#ede8dc]'
                  }`}
                >
                  Suggestions (
                  {
                    findingsWithStaleState.filter(
                      (f) => f.severity === 'suggestion' || f.severity === 'minor'
                    ).length
                  }
                  )
                </button>
              </div>
            </div>

            {/* Findings List */}
            {filteredFindings.length === 0 ? (
              <div className="p-8 border border-dashed border-[#dcd6ca] rounded-xl text-center bg-white/50 space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <h4 className="font-editorial text-sm font-bold text-[#1e232a]">
                  No Findings in this View
                </h4>
                <p className="text-xs text-[#736c61]">
                  All items have been addressed or no matching issues were detected.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredFindings.map((finding) => {
                  const isAccepted = finding.status === 'accepted';
                  const isRejected = finding.status === 'rejected';
                  const isStale = finding.status === 'stale';

                  return (
                    <div
                      key={finding.id}
                      className={`p-4 rounded-xl border transition-all shadow-2xs space-y-3 text-xs ${
                        isAccepted
                          ? 'bg-emerald-50/70 border-emerald-200 opacity-80'
                          : isRejected
                          ? 'bg-stone-50 border-stone-200 opacity-60'
                          : isStale
                          ? 'bg-amber-50/40 border-amber-200/60'
                          : 'bg-white border-[#e5dfd3] hover:border-[#dcd6ca]'
                      }`}
                    >
                      {/* Card Header: Category, Severity, Location */}
                      <div className="flex items-center justify-between gap-2 border-b border-[#f0ece3] pb-2">
                        <div className="flex items-center gap-2">
                          {getCategoryLabel(finding.category, finding.isRuleViolation)}
                          {finding.location?.description && (
                            <span className="text-[10px] text-[#8c8477] truncate max-w-[140px]">
                              • {finding.location.description}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {getSeverityBadge(finding.severity)}
                          {isAccepted && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-900 inline-flex items-center gap-0.5">
                              <Check className="w-3 h-3 text-emerald-700" />
                              <span>Accepted</span>
                            </span>
                          )}
                          {isRejected && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-stone-200 text-stone-700 inline-flex items-center gap-0.5">
                              <X className="w-3 h-3 text-stone-500" />
                              <span>Rejected</span>
                            </span>
                          )}
                          {isStale && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-900 inline-flex items-center gap-0.5" title="Document text was modified since review">
                              <Clock className="w-3 h-3 text-amber-700" />
                              <span>Text Modified</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Original Passage Quote */}
                      {finding.originalText && (
                        <div className="p-2.5 bg-[#faf8f4] border border-[#e8e2d5] rounded-lg text-xs font-editorial text-[#3c352d] leading-relaxed">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8c8477] block mb-1">
                            Flagged Passage:
                          </span>
                          &ldquo;{finding.originalText}&rdquo;
                        </div>
                      )}

                      {/* Why & Explanation */}
                      <div className="space-y-1">
                        <div className="font-semibold text-[#1e232a] text-[11px]">
                          Why:
                        </div>
                        <p className="text-xs text-[#4a443b] leading-relaxed">
                          {finding.explanation}
                        </p>
                      </div>

                      {/* Suggested Action */}
                      {finding.suggestedAction && (
                        <div className="space-y-0.5 pt-1">
                          <div className="font-semibold text-[#5c5447] text-[10px] uppercase tracking-wider">
                            Suggested Action:
                          </div>
                          <p className="text-xs text-[#5c5447] italic">
                            {finding.suggestedAction}
                          </p>
                        </div>
                      )}

                      {/* Proposed Revision Diff */}
                      {finding.proposedText && (
                        <div className="p-2.5 bg-emerald-50/80 border border-emerald-200 rounded-lg text-xs font-editorial text-emerald-950 leading-relaxed space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                            Proposed Revision:
                          </span>
                          <div dangerouslySetInnerHTML={{ __html: finding.proposedText }} />
                        </div>
                      )}

                      {/* Action Buttons */}
                      {finding.status === 'pending' && (
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#f0ece3]">
                          <button
                            type="button"
                            onClick={() => onRejectFinding(finding.id)}
                            className="px-2.5 py-1 text-xs font-semibold text-[#736c61] hover:text-[#1e232a] rounded-md hover:bg-[#f5f1e8] transition-colors"
                          >
                            Reject
                          </button>

                          {finding.proposedText && (
                            <button
                              type="button"
                              disabled={isStale}
                              onClick={() => onAcceptFinding(finding)}
                              className="px-3 py-1 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-md shadow-2xs inline-flex items-center gap-1 transition-colors disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Accept Fix</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* Empty / Unreviewed Welcome State */
          <div className="p-8 border border-dashed border-[#dcd6ca] rounded-2xl text-center bg-white/60 space-y-4 my-auto">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-center mx-auto shadow-2xs">
              <ShieldCheck className="w-6 h-6 text-amber-700" />
            </div>

            <div className="space-y-1">
              <h3 className="font-editorial text-base font-bold text-[#1e232a]">
                Demand Excellence with AI Editorial Review
              </h3>
              <p className="text-xs text-[#736c61] max-w-sm mx-auto leading-relaxed">
                Analyze your draft for AI clichés, repetition across sections, unsupported claims, tone drift, and hard content constraints.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={handleRunReview}
                className="px-4 py-2 bg-[#1e232a] hover:bg-[#2d3440] text-white text-xs font-semibold rounded-lg shadow-xs inline-flex items-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Run First Review</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
