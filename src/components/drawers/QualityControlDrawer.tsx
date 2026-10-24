/**
 * Science of Gifts - Quality Control Drawer (Phase 8)
 * Systematic, checklist-oriented verification answering:
 * "Is this content complete, compliant, internally consistent, and ready?"
 */

import React, { useState, useMemo } from 'react';
import {
  WritingProject,
  QCResult,
  QCFinding,
  QCSeverity,
  QCOverallStatus,
  QCCategory,
  DiffProposal,
} from '../../types/project';
import { geminiService } from '../../services/geminiClient';
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RotateCcw,
  Sparkles,
  Check,
  X,
  ShieldCheck,
  ShieldAlert,
  Search,
  BookOpen,
  Link2,
  Package,
  Layers,
  FileText,
  Scale,
  Wand2,
  Loader2,
  RefreshCw,
  HelpCircle,
  Filter,
  Cpu,
} from 'lucide-react';
import { ModelId } from '../../types/models';
import { ALL_MODELS, getModelDefinition } from '../../services/modelRegistry';
import { storage } from '../../services/storage';

interface QualityControlDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: WritingProject;
  onUpdateQC: (qcResult: QCResult) => void;
  onRequestProposal: (proposal: DiffProposal) => void;
  onApplyFix: (finding: QCFinding) => void;
}

export const QualityControlDrawer: React.FC<QualityControlDrawerProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateQC,
  onRequestProposal,
  onApplyFix,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [includeAiAudit, setIncludeAiAudit] = useState(true);
  const [qcModelOverride, setQcModelOverride] = useState<ModelId | undefined>(undefined);
  const [activeFilter, setActiveFilter] = useState<'all' | 'critical' | 'warning' | 'suggestion'>('all');
  const [dismissedFindingIds, setDismissedFindingIds] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const qc: QCResult | undefined = project.qualityControl;

  // Stale detection: compare current document length vs QC run length
  const isOutdated = useMemo(() => {
    if (!qc) return false;
    const currentLen = (project.content || '').length;
    return Math.abs(currentLen - qc.documentLengthAtRun) > 30;
  }, [qc, project.content]);

  // Filtered findings
  const visibleFindings = useMemo(() => {
    if (!qc || !qc.findings) return [];
    return qc.findings.filter((f) => {
      if (dismissedFindingIds.has(f.id)) return false;
      if (activeFilter === 'critical') return f.severity === 'critical';
      if (activeFilter === 'warning') return f.severity === 'warning';
      if (activeFilter === 'suggestion') return f.severity === 'suggestion';
      return true;
    });
  }, [qc, activeFilter, dismissedFindingIds]);

  // Run or Rerun QC
  const handleRunQC = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await geminiService.runQualityControl(project, {
        enableAiChecks: includeAiAudit,
        modelOverride: qcModelOverride,
      });

      if (res.ok && res.result) {
        onUpdateQC(res.result);
        setDismissedFindingIds(new Set());
      } else {
        setErrorMessage(res.error || 'Failed to complete Quality Control verification.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during QC check.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Fix with AI
  const handleFixWithAI = async (finding: QCFinding) => {
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
    setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  const handleDismissFinding = (id: string) => {
    setDismissedFindingIds((prev) => new Set([...prev, id]));
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
                <div className="font-editorial text-sm font-bold tracking-tight text-emerald-950">
                  READY FOR PUBLICATION
                </div>
                <div className="text-[11px] text-emerald-800">
                  No blocking issues found. All core criteria satisfied.
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
                <div className="font-editorial text-sm font-bold tracking-tight text-amber-950">
                  WARNINGS FOUND
                </div>
                <div className="text-[11px] text-amber-800">
                  Can technically proceed, but review flagged items.
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
                <div className="font-editorial text-sm font-bold tracking-tight text-rose-950">
                  ACTION REQUIRED
                </div>
                <div className="text-[11px] text-rose-800">
                  One or more blocking requirements are not satisfied.
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

  const getSeverityPill = (severity: QCSeverity) => {
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

  if (!isOpen) return null;

  return (
    <aside
      className="max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full w-full md:w-[480px] lg:w-[540px] shrink-0 h-full bg-[#fcfbfa] md:border-l border-[#ded7ca] flex flex-col overflow-hidden animate-in slide-in-from-right-1 duration-150 z-30"
      aria-label="Quality Control Drawer"
    >
      {/* DRAWER HEADER */}
      <div className="p-4 sm:p-5 bg-[#f4efe4] border-b border-[#ded7ca] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#1e232a] text-[#f7f5ef] flex items-center justify-center font-display font-semibold shadow-2xs shrink-0">
            <ClipboardCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <h2 className="font-editorial text-base font-bold text-[#1e232a] leading-tight truncate">
              Quality Control
            </h2>
            <p className="text-[11px] text-[#736c61] truncate">
              Verification checklist & compliance gate before publication.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#736c61] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7] transition-colors shrink-0"
          title="Close Quality Control panel"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* CONTROLS & TRIGGER STRIP */}
      <div className="p-4 bg-white border-b border-[#e5dfd3] shrink-0 space-y-3 text-xs">
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

        <button
          type="button"
          disabled={isLoading}
          onClick={handleRunQC}
          className="w-full py-2.5 px-4 bg-[#1e232a] hover:bg-[#2d3440] text-white font-semibold rounded-lg shadow-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 select-none"
        >
          {isLoading ? (
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

        {isOutdated && (
          <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-md text-[11px] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>Document changed since last check. QC may be outdated.</span>
            </div>
            <button
              type="button"
              onClick={handleRunQC}
              className="text-amber-950 font-bold underline shrink-0 hover:text-amber-900"
            >
              Run Again
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-md text-[11px] flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* QC BODY */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {qc ? (
          <>
            {/* Overall Status Masthead */}
            {getOverallStatusBadge(qc.status)}

            {/* Severity Counters & Summary */}
            <div className="grid grid-cols-3 gap-2">
              <div
                onClick={() => setActiveFilter('critical')}
                className={`p-2.5 rounded-lg border text-center cursor-pointer transition-colors ${
                  activeFilter === 'critical'
                    ? 'bg-rose-100 border-rose-400 text-rose-950 font-bold'
                    : 'bg-white border-[#e5dfd3] text-[#443d34] hover:bg-[#faf8f4]'
                }`}
              >
                <div className="text-base font-bold text-rose-700">{qc.counts.critical}</div>
                <div className="text-[10px] uppercase tracking-wider text-[#736c61]">Action Required</div>
              </div>

              <div
                onClick={() => setActiveFilter('warning')}
                className={`p-2.5 rounded-lg border text-center cursor-pointer transition-colors ${
                  activeFilter === 'warning'
                    ? 'bg-amber-100 border-amber-400 text-amber-950 font-bold'
                    : 'bg-white border-[#e5dfd3] text-[#443d34] hover:bg-[#faf8f4]'
                }`}
              >
                <div className="text-base font-bold text-amber-700">{qc.counts.warning}</div>
                <div className="text-[10px] uppercase tracking-wider text-[#736c61]">Warnings</div>
              </div>

              <div
                onClick={() => setActiveFilter('suggestion')}
                className={`p-2.5 rounded-lg border text-center cursor-pointer transition-colors ${
                  activeFilter === 'suggestion'
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

            {/* Findings List Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-[#443d34]">
                    Detailed Findings ({visibleFindings.length})
                  </span>
                  {activeFilter !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setActiveFilter('all')}
                      className="text-[10px] text-amber-800 underline font-medium"
                    >
                      (Clear filter)
                    </button>
                  )}
                </div>
              </div>

              {visibleFindings.length === 0 ? (
                <div className="p-6 border border-dashed border-[#dcd6ca] rounded-xl text-center bg-white/50 space-y-1.5">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                  <div className="font-editorial text-xs font-bold text-[#1e232a]">
                    No Findings in this View
                  </div>
                  <p className="text-[11px] text-[#736c61]">
                    {activeFilter === 'critical'
                      ? 'No blocking critical issues.'
                      : 'All items are verified.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleFindings.map((finding) => (
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
                          {getSeverityPill(finding.severity)}
                          <button
                            type="button"
                            onClick={() => handleDismissFinding(finding.id)}
                            className="p-1 text-[#8c8477] hover:text-[#1e232a] rounded"
                            title="Dismiss from view"
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

                      {/* Proposed Fix / Target text */}
                      {finding.proposedText && (
                        <div className="p-2 bg-emerald-50/80 border border-emerald-200 rounded-md text-[11px] text-emerald-950 font-editorial">
                          <span className="font-bold block text-[10px] uppercase text-emerald-800">
                            Suggested Replacement:
                          </span>
                          &ldquo;{finding.proposedText}&rdquo;
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#f0ece3]">
                        {finding.targetText && (
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleFixWithAI(finding)}
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
          /* Empty / Initial State */
          <div className="p-8 border border-dashed border-[#dcd6ca] rounded-2xl text-center bg-white/60 space-y-4 my-auto">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-center mx-auto shadow-2xs">
              <ClipboardCheck className="w-6 h-6 text-emerald-700" />
            </div>

            <div className="space-y-1">
              <h3 className="font-editorial text-base font-bold text-[#1e232a]">
                Quality Control Verification
              </h3>
              <p className="text-xs text-[#736c61] max-w-sm mx-auto leading-relaxed">
                Run systematic completeness, rule compliance, URL validation, and factual consistency checks before publication.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={isLoading}
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
    </aside>
  );
};
