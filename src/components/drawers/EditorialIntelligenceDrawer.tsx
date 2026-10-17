/**
 * Science of Gifts - Unified Editorial Intelligence Drawer (Phase 1)
 * Combines AI Editorial Review and Quality Control checks into a single coherent interface.
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  WritingProject,
  ReviewFinding,
  ReviewMode,
  ReviewScope,
  ReviewSeverity,
  ReviewCategory,
  EditorialReviewResult,
  QCResult,
  QCFinding,
  QCSeverity,
  QCOverallStatus,
  DiffProposal,
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
  HelpCircle,
  ClipboardCheck,
  Link2,
  Wand2,
  Cpu,
  Sliders,
} from 'lucide-react';
import { ModelId } from '../../types/models';
import { ALL_MODELS, getModelDefinition } from '../../services/modelRegistry';
import { storage } from '../../services/storage';

interface EditorialIntelligenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: WritingProject;
  selectedText?: string;
  defaultTab?: 'review' | 'qc';
  onUpdateReview: (reviewResult: EditorialReviewResult) => void;
  onAcceptFinding: (finding: ReviewFinding) => void;
  onAcceptAllFindings: (findings: ReviewFinding[]) => void;
  onRejectFinding: (findingId: string) => void;
  onRejectAllFindings: () => void;
  onUpdateQC: (qcResult: QCResult) => void;
  onRequestProposal: (proposal: DiffProposal) => void;
  onApplyFix: (finding: QCFinding) => void;
}

export const EditorialIntelligenceDrawer: React.FC<EditorialIntelligenceDrawerProps> = ({
  isOpen,
  onClose,
  project,
  selectedText = '',
  defaultTab = 'review',
  onUpdateReview,
  onAcceptFinding,
  onAcceptAllFindings,
  onRejectFinding,
  onRejectAllFindings,
  onUpdateQC,
  onRequestProposal,
  onApplyFix,
}) => {
  // Tab State
  const [activeTab, setActiveTab] = useState<'review' | 'qc'>(defaultTab);

  // Sync tab with external updates (e.g., clicking navigation panel buttons)
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  // ==========================================
  // EDITORIAL REVIEW STATE & HANDLERS
  // ==========================================
  const [scope, setScope] = useState<ReviewScope>(selectedText ? 'selection' : 'all');
  const [mode, setMode] = useState<ReviewMode>('full');
  const [reviewModelOverride, setReviewModelOverride] = useState<ModelId | undefined>(undefined);
  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    project.outline && project.outline.length > 0 ? project.outline[0].id : ''
  );
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'critical_important' | 'rules' | 'ai_repetition' | 'suggestions'>('all');
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [isReviewSettingsOpen, setIsReviewSettingsOpen] = useState(false);

  const review: EditorialReviewResult | undefined = project.editorialReview;

  // Stale detection: compare current document content against findings' original text
  const reviewFindingsWithStale = useMemo(() => {
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

  // Filtered review findings
  const filteredReviewFindings = useMemo(() => {
    return reviewFindingsWithStale.filter((f) => {
      if (reviewFilter === 'critical_important') {
        return f.severity === 'critical' || f.severity === 'important';
      }
      if (reviewFilter === 'rules') {
        return f.category === 'content_rules' || f.isRuleViolation;
      }
      if (reviewFilter === 'ai_repetition') {
        return f.category === 'ai_language' || f.category === 'repetition';
      }
      if (reviewFilter === 'suggestions') {
        return f.severity === 'suggestion' || f.severity === 'minor';
      }
      return true;
    });
  }, [reviewFindingsWithStale, reviewFilter]);

  const reviewPendingWithProposed = useMemo(() => {
    return reviewFindingsWithStale.filter(
      (f) => f.status === 'pending' && f.proposedText && f.proposedText.trim()
    );
  }, [reviewFindingsWithStale]);

  const reviewPendingCount = useMemo(() => {
    return reviewFindingsWithStale.filter((f) => f.status === 'pending').length;
  }, [reviewFindingsWithStale]);

  // Run Editorial Review
  const handleRunReview = async () => {
    setIsReviewLoading(true);
    setReviewError(null);

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
        setReviewError(res.error || 'Failed to conduct editorial review.');
      }
    } catch (err: any) {
      setReviewError(err.message || 'An unexpected error occurred during review.');
    } finally {
      setIsReviewLoading(false);
    }
  };

  // ==========================================
  // QUALITY CONTROL STATE & HANDLERS
  // ==========================================
  const [isQcLoading, setIsQcLoading] = useState(false);
  const [includeAiAudit, setIncludeAiAudit] = useState(true);
  const [qcModelOverride, setQcModelOverride] = useState<ModelId | undefined>(undefined);
  const [qcFilter, setQcFilter] = useState<'all' | 'critical' | 'warning' | 'suggestion'>('all');
  const [dismissedQcFindingIds, setDismissedQcFindingIds] = useState<Set<string>>(new Set());
  const [qcError, setQcError] = useState<string | null>(null);

  const qc: QCResult | undefined = project.qualityControl;

  // Stale detection: compare current document length vs QC run length
  const isQcOutdated = useMemo(() => {
    if (!qc) return false;
    const currentLen = (project.content || '').length;
    return Math.abs(currentLen - qc.documentLengthAtRun) > 30;
  }, [qc, project.content]);

  // Filtered QC findings (and filter out items that exist under review if appropriate)
  const filteredQcFindings = useMemo(() => {
    if (!qc || !qc.findings) return [];
    return qc.findings.filter((f) => {
      if (dismissedQcFindingIds.has(f.id)) return false;
      if (qcFilter === 'critical') return f.severity === 'critical';
      if (qcFilter === 'warning') return f.severity === 'warning';
      if (qcFilter === 'suggestion') return f.severity === 'suggestion';
      return true;
    });
  }, [qc, qcFilter, dismissedQcFindingIds]);

  // Run or Rerun QC
  const handleRunQC = async () => {
    setIsQcLoading(true);
    setQcError(null);
    try {
      const res = await geminiService.runQualityControl(project, {
        enableAiChecks: includeAiAudit,
        modelOverride: qcModelOverride,
      });

      if (res.ok && res.result) {
        onUpdateQC(res.result);
        setDismissedQcFindingIds(new Set());
      } else {
        setQcError(res.error || 'Failed to complete Quality Control verification.');
      }
    } catch (err: any) {
      setQcError(err.message || 'An unexpected error occurred during QC check.');
    } finally {
      setIsQcLoading(false);
    }
  };

  // Handle QC Fix with AI
  const handleFixQcWithAI = async (finding: QCFinding) => {
    if (finding.proposedText && finding.targetText) {
      // Use existing diff proposal modal workflow
      onRequestProposal({
        id: `prop-qc-${finding.id}`,
        scopeDescription: `Quality Control Fix: "${finding.title}"`,
        targetText: finding.targetText,
        proposedText: finding.proposedText,
        modelUsed: qcModelOverride || project.modelOverride || storage.getGlobalModel(),
        explanation: `${finding.explanation} ${finding.suggestedAction || ''}`,
      });
      return;
    }

    // Call AI action for contextual revision
    setIsQcLoading(true);
    try {
      const res = await geminiService.executeAction(project, 'rewrite_selection', {
        selectedText: finding.targetText,
        scope: 'selection',
        modelOverride: qcModelOverride,
        customCommand: `Resolve Quality Control issue: ${finding.explanation}. ${finding.suggestedAction || ''} Ensure strictly no em dashes and no marketing clichés.`,
      });

      if (res.ok && res.proposedText) {
        onRequestProposal({
          id: `prop-qc-${finding.id}`,
          scopeDescription: `Quality Control Fix: "${finding.title}"`,
          targetText: finding.targetText || project.content,
          proposedText: res.proposedText,
          modelUsed: res.modelUsed,
          explanation: finding.explanation,
        });
      }
    } finally {
      setIsQcLoading(false);
    }
  };

  const handleDismissQcFinding = (id: string) => {
    setDismissedQcFindingIds((prev) => new Set([...prev, id]));
  };

  // ==========================================
  // SHARED RENDERING HELPERS
  // ==========================================
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

  const getQcSeverityPill = (severity: QCSeverity) => {
    switch (severity) {
      case 'critical':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-900 border border-rose-300 shrink-0">
            Critical
          </span>
        );
      case 'warning':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 shrink-0">
            Warning
          </span>
        );
      case 'suggestion':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-stone-100 text-stone-800 border border-stone-300 shrink-0">
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
            <span>AI Language</span>
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
            <span>Clarity</span>
          </span>
        );
      case 'flow':
        return (
          <span className="flex items-center gap-1 font-semibold text-stone-900">
            <Layers className="w-3.5 h-3.5 text-stone-700" />
            <span>Flow</span>
          </span>
        );
      case 'tone_style':
        return (
          <span className="flex items-center gap-1 font-semibold text-amber-950">
            <BookOpen className="w-3.5 h-3.5 text-amber-800" />
            <span>Tone Drift</span>
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
            <span>SEO</span>
          </span>
        );
      case 'internal_links':
        return (
          <span className="flex items-center gap-1 font-semibold text-indigo-900">
            <FileText className="w-3.5 h-3.5 text-indigo-700" />
            <span>Internal Links</span>
          </span>
        );
      default:
        return <span>Review</span>;
    }
  };

  const getOverallStatusBadge = (status: QCOverallStatus) => {
    switch (status) {
      case 'ready':
        return (
          <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between gap-3 text-emerald-950">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold shadow-2xs">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <div className="font-editorial text-xs font-bold tracking-tight text-emerald-950">
                  READY FOR PUBLICATION
                </div>
                <div className="text-[10px] text-emerald-800">
                  All criteria satisfied. Adheres to guidelines.
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-200 text-emerald-950">
              PASSED
            </span>
          </div>
        );
      case 'warning':
        return (
          <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-3 text-amber-950">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-500 text-white flex items-center justify-center font-bold shadow-2xs">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="font-editorial text-xs font-bold tracking-tight text-amber-950">
                  WARNINGS PENDING
                </div>
                <div className="text-[10px] text-amber-800">
                  Minor issues or suggestions remain. Review.
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-200 text-amber-950">
              WARNING
            </span>
          </div>
        );
      case 'action_required':
      default:
        return (
          <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl flex items-center justify-between gap-3 text-rose-950">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-rose-600 text-white flex items-center justify-center font-bold shadow-2xs">
                <X className="w-5 h-5" />
              </div>
              <div>
                <div className="font-editorial text-xs font-bold tracking-tight text-rose-950">
                  ACTION REQUIRED
                </div>
                <div className="text-[10px] text-rose-800">
                  Violations of core house constraints detected.
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-200 text-rose-950">
              BLOCKING
            </span>
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <aside
      className="max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full w-full md:w-[480px] lg:w-[540px] shrink-0 h-full bg-[#fcfbfa] md:border-l border-[#ded7ca] flex flex-col overflow-hidden animate-in slide-in-from-right-1 duration-150 z-30"
      aria-label="Editorial Intelligence Panel"
    >
      {/* PANEL MAIN HEADER */}
      <div className="p-4 sm:p-5 bg-[#f4efe4] border-b border-[#ded7ca] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#1e232a] text-[#f7f5ef] flex items-center justify-center font-display font-semibold shadow-2xs shrink-0">
            <Wand2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 className="font-editorial text-base font-bold text-[#1e232a] leading-tight truncate">
              Editorial Intelligence
            </h2>
            <p className="text-[11px] text-[#736c61] truncate">
              Unified copy quality, factual alignment & compliance guardrails.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#736c61] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7] transition-colors shrink-0"
          title="Close Editorial Intelligence"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* COHESIVE TAB NAVIGATOR */}
      <div className="flex border-b border-[#ded7ca] bg-[#faf9f6] shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('review')}
          className={`flex-1 py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
            activeTab === 'review'
              ? 'border-amber-600 text-[#1e232a] bg-white'
              : 'border-transparent text-[#736c61] hover:text-[#1e232a] hover:bg-[#eae4d7]/30'
          }`}
        >
          <ShieldCheck className={`w-4 h-4 ${activeTab === 'review' ? 'text-amber-600' : 'text-[#736c61]'}`} />
          <span>Editorial Review</span>
          {reviewPendingCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white leading-none">
              {reviewPendingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('qc')}
          className={`flex-1 py-3 px-4 text-xs font-semibold flex items-center justify-center gap-2 border-b-2 transition-all ${
            activeTab === 'qc'
              ? 'border-emerald-600 text-[#1e232a] bg-white'
              : 'border-transparent text-[#736c61] hover:text-[#1e232a] hover:bg-[#eae4d7]/30'
          }`}
        >
          <ClipboardCheck className={`w-4 h-4 ${activeTab === 'qc' ? 'text-emerald-600' : 'text-[#736c61]'}`} />
          <span>Quality Control</span>
          {qc && qc.counts && (qc.counts.critical > 0 || qc.counts.warning > 0) && (
            <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold leading-none text-white ${
              qc.counts.critical > 0 ? 'bg-rose-500' : 'bg-amber-500'
            }`}>
              {qc.counts.critical + qc.counts.warning}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* EDITORIAL REVIEW TAB PANEL */}
      {/* ========================================================================= */}
      {activeTab === 'review' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* CONFIGURATION PANEL & COLLAPSIBLE REVIEW SETTINGS */}
          <div className="p-4 bg-white border-b border-[#e5dfd3] shrink-0 space-y-3 text-xs">
            {/* Summary & Toggle Header for Review Settings */}
            <div className="flex items-center justify-between bg-[#f6f3eb] border border-[#e5dfd3] rounded-lg p-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <Sliders className="w-4 h-4 text-amber-800 shrink-0" />
                <div className="min-w-0 text-[11px]">
                  <span className="font-semibold text-[#1e232a]">
                    Mode: {mode === 'full' ? 'Full Review' : mode.replace(/_/g, ' ')}
                  </span>
                  <span className="mx-1.5 text-[#a8a095]">|</span>
                  <span className="text-[#6e685f] truncate">
                    Scope: {scope === 'all' ? 'Entire Document' : scope === 'selection' ? 'Selection' : 'Section'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReviewSettingsOpen(!isReviewSettingsOpen)}
                className="px-2 py-1 bg-white border border-[#dcd6ca] rounded-md font-semibold text-[#4a443b] hover:bg-[#ede8dc] transition-colors inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <span>{isReviewSettingsOpen ? 'Hide Settings' : 'Review Settings'}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isReviewSettingsOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Collapsible Advanced Settings Section */}
            {isReviewSettingsOpen && (
              <div className="space-y-3 pt-2 border-t border-[#f0ede6] animate-in fade-in duration-150">
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

                {/* Focus Mode Selector */}
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

                {/* Model Selection Panel */}
                <div className="flex items-center justify-between gap-2 p-2 bg-[#faf9f6] border border-[#e5dfd3] rounded-lg text-xs">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-700" />
                    <span className="text-[11px] font-semibold text-[#5c5447]">AI Model:</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={reviewModelOverride || ''}
                      onChange={(e) => setReviewModelOverride((e.target.value as ModelId) || undefined)}
                      className="text-xs font-semibold px-2 py-1 bg-white border border-[#dcd6ca] rounded-md text-[#1e232a] focus:outline-hidden cursor-pointer"
                    >
                      <option value="">
                        Default ({getModelDefinition(project.modelOverride || storage.getGlobalModel()).displayName})
                      </option>
                      {ALL_MODELS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Run Review Trigger Button (Always visible and easily accessible) */}
            <div className="pt-1">
              <button
                type="button"
                disabled={isReviewLoading || (scope === 'selection' && !selectedText)}
                onClick={handleRunReview}
                className="w-full py-2.5 px-4 bg-[#1e232a] hover:bg-[#2d3440] text-white font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 select-none cursor-pointer"
              >
                {isReviewLoading ? (
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
          </div>

            {/* Review Error Display */}
            {reviewError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-950 rounded-lg text-xs space-y-2 mt-2 mx-4">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">{getModelDefinition(reviewModelOverride || project.modelOverride || storage.getGlobalModel()).displayName} could not complete this request.</p>
                    <p className="text-[11px] text-rose-800 mt-0.5">{reviewError}</p>
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
                          setReviewError(null);
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

          {/* RESULTS CONTENT PANEL */}
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
                      Review Findings ({reviewFindingsWithStale.length})
                    </span>

                    {reviewPendingCount > 0 && (
                      <div className="flex items-center gap-2">
                        {reviewPendingWithProposed.length > 0 && (
                          <button
                            type="button"
                            onClick={() => onAcceptAllFindings(reviewPendingWithProposed)}
                            className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1"
                          >
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Accept All ({reviewPendingWithProposed.length})</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onRejectAllFindings}
                          className="text-[11px] font-semibold text-[#736c61] hover:text-[#1e232a]"
                        >
                          Dismiss All
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Filter Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setReviewFilter('all')}
                      className={`px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors ${
                        reviewFilter === 'all'
                          ? 'bg-[#1e232a] text-white'
                          : 'bg-white border border-[#dcd6ca] text-[#5c5447] hover:bg-[#ede8dc]'
                      }`}
                    >
                      All ({reviewFindingsWithStale.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewFilter('critical_important')}
                      className={`px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors ${
                        reviewFilter === 'critical_important'
                          ? 'bg-amber-800 text-white'
                          : 'bg-white border border-[#dcd6ca] text-[#5c5447] hover:bg-[#ede8dc]'
                      }`}
                    >
                      Priority (
                      {
                        reviewFindingsWithStale.filter(
                          (f) => f.severity === 'critical' || f.severity === 'important'
                        ).length
                      }
                      )
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewFilter('rules')}
                      className={`px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors ${
                        reviewFilter === 'rules'
                          ? 'bg-purple-800 text-white'
                          : 'bg-white border border-[#dcd6ca] text-[#5c5447] hover:bg-[#ede8dc]'
                      }`}
                    >
                      Rules (
                      {
                        reviewFindingsWithStale.filter(
                          (f) => f.category === 'content_rules' || f.isRuleViolation
                        ).length
                      }
                      )
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewFilter('ai_repetition')}
                      className={`px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors ${
                        reviewFilter === 'ai_repetition'
                          ? 'bg-blue-800 text-white'
                          : 'bg-white border border-[#dcd6ca] text-[#5c5447] hover:bg-[#ede8dc]'
                      }`}
                    >
                      AI / Repetition (
                      {
                        reviewFindingsWithStale.filter(
                          (f) => f.category === 'ai_language' || f.category === 'repetition'
                        ).length
                      }
                      )
                    </button>
                    <button
                      type="button"
                      onClick={() => setReviewFilter('suggestions')}
                      className={`px-2.5 py-1 rounded-full font-medium shrink-0 transition-colors ${
                        reviewFilter === 'suggestions'
                          ? 'bg-stone-800 text-white'
                          : 'bg-white border border-[#dcd6ca] text-[#5c5447] hover:bg-[#ede8dc]'
                      }`}
                    >
                      Suggestions (
                      {
                        reviewFindingsWithStale.filter(
                          (f) => f.severity === 'suggestion' || f.severity === 'minor'
                        ).length
                      }
                      )
                    </button>
                  </div>
                </div>

                {/* Findings List */}
                {filteredReviewFindings.length === 0 ? (
                  <div className="p-8 border border-dashed border-[#dcd6ca] rounded-xl text-center bg-white/50 space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                    <h4 className="font-editorial text-sm font-bold text-[#1e232a]">
                      No Findings in this View
                    </h4>
                    <p className="text-xs text-[#736c61]">
                      All items in this filter have been addressed or resolved.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredReviewFindings.map((finding) => {
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

                          {/* Explanation */}
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
              /* Empty state */
              <div className="p-8 border border-dashed border-[#dcd6ca] rounded-2xl text-center bg-white/60 space-y-4 my-auto">
                <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-center mx-auto shadow-2xs">
                  <ShieldCheck className="w-6 h-6 text-amber-700" />
                </div>

                <div className="space-y-1">
                  <h3 className="font-editorial text-base font-bold text-[#1e232a]">
                    AI Editorial Review
                  </h3>
                  <p className="text-xs text-[#736c61] max-w-sm mx-auto leading-relaxed">
                    Check your text against tone specifications, vocabulary constraints, repeating patterns, and style reference guides.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isReviewLoading}
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUALITY CONTROL TAB PANEL */}
      {/* ========================================================================= */}
      {activeTab === 'qc' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* CONFIGURATION & TRIGGER PANEL */}
          <div className="p-4 bg-white border-b border-[#e5dfd3] shrink-0 space-y-3.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-[#5c5447]">
                <input
                  type="checkbox"
                  checked={includeAiAudit}
                  onChange={(e) => setIncludeAiAudit(e.target.checked)}
                  className="rounded border-[#dcd6ca] text-emerald-700 focus:ring-emerald-600 w-3.5 h-3.5"
                />
                <span>Include Deep AI Factual & Consistency Audit</span>
              </label>

              {qc && (
                <span className="text-[10px] text-[#8c8477]">
                  Checked {new Date(qc.runAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* Model Selection for QC */}
            <div className="flex items-center justify-between gap-2 p-2 bg-[#faf9f6] border border-[#e5dfd3] rounded-lg text-xs">
              <div className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-emerald-700" />
                <span className="text-[11px] font-semibold text-[#5c5447]">QC Model:</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-emerald-800 font-medium hidden sm:inline">
                  Rec: Gemini 3.7 Flash
                </span>
                <select
                  value={qcModelOverride || ''}
                  onChange={(e) => setQcModelOverride((e.target.value as ModelId) || undefined)}
                  className="text-xs font-semibold px-2 py-1 bg-white border border-[#dcd6ca] rounded-md text-[#1e232a] focus:outline-hidden cursor-pointer"
                >
                  <option value="">
                    Project Default ({getModelDefinition(project.modelOverride || storage.getGlobalModel()).displayName})
                  </option>
                  {ALL_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} {m.id === 'gemini-3.7-flash' ? '(Recommended)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* QC Trigger Button */}
            <button
              type="button"
              disabled={isQcLoading}
              onClick={handleRunQC}
              className="w-full py-2.5 px-4 bg-[#1e232a] hover:bg-[#2d3440] text-white font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 select-none"
            >
              {isQcLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Verifying Completeness & Compliance...</span>
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-4 h-4 text-emerald-400" />
                  <span>{qc ? 'Rerun Quality Control' : 'Run Quality Control'}</span>
                </>
              )}
            </button>

            {isQcOutdated && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-md text-[11px] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Document changed since last check.</span>
                </div>
                <button
                  type="button"
                  onClick={handleRunQC}
                  className="text-amber-950 font-bold underline shrink-0 hover:text-amber-900"
                >
                  Rerun
                </button>
              </div>
            )}

            {qcError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-md text-[11px] flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{qcError}</span>
              </div>
            )}
          </div>

          {/* QC RESULTS PANEL */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {qc ? (
              <>
                {/* Overall status */}
                {getOverallStatusBadge(qc.status)}

                {/* Filter Pills */}
                <div className="grid grid-cols-3 gap-2">
                  <div
                    onClick={() => setQcFilter('critical')}
                    className={`p-2.5 rounded-lg border text-center cursor-pointer transition-colors ${
                      qcFilter === 'critical'
                        ? 'bg-rose-100 border-rose-400 text-rose-950 font-bold'
                        : 'bg-white border-[#e5dfd3] text-[#443d34] hover:bg-[#faf8f4]'
                    }`}
                  >
                    <div className="text-base font-bold text-rose-700">{qc.counts.critical}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[#736c61]">Blocking</div>
                  </div>

                  <div
                    onClick={() => setQcFilter('warning')}
                    className={`p-2.5 rounded-lg border text-center cursor-pointer transition-colors ${
                      qcFilter === 'warning'
                        ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold'
                        : 'bg-white border-[#e5dfd3] text-[#443d34] hover:bg-[#faf8f4]'
                    }`}
                  >
                    <div className="text-base font-bold text-amber-700">{qc.counts.warning}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[#736c61]">Warnings</div>
                  </div>

                  <div
                    onClick={() => setQcFilter('suggestion')}
                    className={`p-2.5 rounded-lg border text-center cursor-pointer transition-colors ${
                      qcFilter === 'suggestion'
                        ? 'bg-stone-100 border-stone-400 text-stone-950 font-bold'
                        : 'bg-white border-[#e5dfd3] text-[#443d34] hover:bg-[#faf8f4]'
                    }`}
                  >
                    <div className="text-base font-bold text-stone-700">{qc.counts.suggestion}</div>
                    <div className="text-[10px] uppercase tracking-wider text-[#736c61]">Suggestions</div>
                  </div>
                </div>

                {/* Systematic Category Checklist */}
                <div className="p-3.5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-2.5">
                  <div className="flex items-center justify-between border-b border-[#f0ece3] pb-1.5">
                    <span className="font-editorial text-xs font-bold text-[#1e232a] uppercase tracking-wider">
                      Verification Checklist
                    </span>
                    <span className="text-[10px] text-[#8c8477]">
                      {qc.categoryChecks.filter((c) => c.status === 'passed').length} / {qc.categoryChecks.length} Passed
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {qc.categoryChecks.map((check) => {
                      const isPassed = check.status === 'passed';
                      const isWarning = check.status === 'warning';
                      const isFailed = check.status === 'failed';

                      return (
                        <div
                          key={check.category}
                          className={`p-2 rounded-lg border flex items-center justify-between gap-2 text-xs transition-colors ${
                            isPassed
                              ? 'bg-emerald-50/40 border-emerald-200/60 text-emerald-950'
                              : isWarning
                              ? 'bg-amber-50/60 border-amber-200 text-amber-950'
                              : 'bg-rose-50/70 border-rose-200 text-rose-950 font-medium'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isPassed && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                            {isWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                            {isFailed && <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                            <span className="truncate">{check.label}</span>
                          </div>

                          <span
                            className={`text-[10px] shrink-0 ${
                              isPassed ? 'text-emerald-800' : isWarning ? 'text-amber-800' : 'text-rose-800 font-semibold'
                            }`}
                          >
                            {check.message}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detailed Findings List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-[#443d34]">
                      <span>QC Findings ({filteredQcFindings.length})</span>
                      {qcFilter !== 'all' && (
                        <button
                          type="button"
                          onClick={() => setQcFilter('all')}
                          className="text-[10px] text-amber-800 underline font-medium"
                        >
                          (Show all)
                        </button>
                      )}
                    </div>
                  </div>

                  {filteredQcFindings.length === 0 ? (
                    <div className="p-6 border border-dashed border-[#dcd6ca] rounded-xl text-center bg-white/50 space-y-1.5">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                      <div className="font-editorial text-xs font-bold text-[#1e232a]">
                        No Findings in this View
                      </div>
                      <p className="text-[11px] text-[#736c61]">
                        {qcFilter === 'critical'
                          ? 'No blocking critical compliance issues detected.'
                          : 'All check constraints successfully satisfied.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredQcFindings.map((finding) => (
                        <div
                          key={finding.id}
                          className={`p-4 rounded-xl border transition-all shadow-2xs space-y-2.5 ${
                            finding.severity === 'critical'
                              ? 'bg-rose-50/50 border-rose-200'
                              : finding.severity === 'warning'
                              ? 'bg-amber-50/40 border-amber-200'
                              : 'bg-white border-[#e5dfd3]'
                          }`}
                        >
                          {/* Finding Card Top */}
                          <div className="flex items-start justify-between gap-2 border-b border-[#f0ece3] pb-2">
                            <div>
                              <div className="font-bold text-xs text-[#1e232a] flex items-center gap-1.5">
                                {finding.isRuleViolation && (
                                  <Scale className="w-3.5 h-3.5 text-purple-700 shrink-0" />
                                )}
                                {finding.isFactualUnsupported && (
                                  <ShieldAlert className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                                )}
                                <span>{finding.title}</span>
                              </div>
                              <div className="text-[10px] text-[#8c8477] mt-0.5">
                                Location: {finding.location}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {getQcSeverityPill(finding.severity)}
                              <button
                                type="button"
                                onClick={() => handleDismissQcFinding(finding.id)}
                                className="p-1 text-[#8c8477] hover:text-[#1e232a] rounded"
                                title="Dismiss finding"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Explanation */}
                          <p className="text-xs text-[#3c352d] leading-relaxed">
                            {finding.explanation}
                          </p>

                          {/* Suggested Action */}
                          {finding.suggestedAction && (
                            <div className="text-[11px] text-[#5c5447] italic bg-white/70 p-2 rounded-md border border-[#e8e2d5]">
                              <span className="font-semibold not-italic text-[#443d34]">Action: </span>
                              {finding.suggestedAction}
                            </div>
                          )}

                          {/* Proposed Fix / Replacement */}
                          {finding.proposedText && (
                            <div className="p-2 bg-emerald-50/80 border border-emerald-200 rounded-md text-[11px] text-emerald-950 font-editorial">
                              <span className="font-bold block text-[10px] uppercase text-emerald-800">
                                Suggested Replacement:
                              </span>
                              &ldquo;{finding.proposedText}&rdquo;
                            </div>
                          )}

                          {/* Action trigger button */}
                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#f0ece3]">
                            {finding.targetText && (
                              <button
                                type="button"
                                disabled={isQcLoading}
                                onClick={() => handleFixQcWithAI(finding)}
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-md shadow-2xs inline-flex items-center gap-1 transition-colors"
                              >
                                <Sparkles className="w-3 h-3 text-amber-300" />
                                <span>Fix with AI</span>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              /* QC Initial state */
              <div className="p-8 border border-dashed border-[#dcd6ca] rounded-2xl text-center bg-white/60 space-y-4 my-auto">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-center mx-auto shadow-2xs">
                  <ClipboardCheck className="w-6 h-6 text-emerald-700" />
                </div>

                <div className="space-y-1">
                  <h3 className="font-editorial text-base font-bold text-[#1e232a]">
                    Quality Control Checklist
                  </h3>
                  <p className="text-xs text-[#736c61] max-w-sm mx-auto leading-relaxed">
                    Verify complete structural adherence, brand rule checks, SEO keyphrase validation, and factuality cross-checks.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    disabled={isQcLoading}
                    onClick={handleRunQC}
                    className="px-4 py-2 bg-[#1e232a] hover:bg-[#2d3440] text-white text-xs font-semibold rounded-lg shadow-xs inline-flex items-center gap-1.5 transition-colors"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Run Quality Control</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
