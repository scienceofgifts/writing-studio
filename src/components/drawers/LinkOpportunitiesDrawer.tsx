/**
 * Science of Gifts - Link Opportunities Drawer (Phase 4)
 * Mutually exclusive workspace drawer for discovering, reviewing, and applying editorial internal links.
 * Incorporates duplicate link protection, stale detection, Undo dismissal, dismissed recommendations restore, and View Location inspection.
 */

import React, { useState } from 'react';
import { WritingProject } from '../../types/project';
import { LinkOpportunity, InternalLink } from '../../types/internalLink';
import { storage } from '../../services/storage';
import { geminiService } from '../../services/geminiClient';
import { extractUrlsFromHtml, normalizeUrlForComparison, formatDestinationType } from '../../utils/urlUtils';
import { toast } from '../../services/toastService';
import {
  Link2,
  X,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  HelpCircle,
  Loader2,
  RotateCcw,
  CheckCheck,
  Ban,
  BookOpen,
  MapPin,
} from 'lucide-react';

export interface LocationVerificationResult {
  isVerified: boolean;
  reason: string;
  candidate?: {
    from: number;
    to: number;
    text: string;
    score: number;
    matchType: 'link_mark_and_anchor' | 'link_mark_only' | 'anchor_text_only';
  };
}

export function verifyOpportunityLocation(
  opp: LinkOpportunity,
  contentHtml: string,
  editor?: any
): LocationVerificationResult {
  const isSuggestNew = opp.workflowType === 'suggest_new';
  const targetUrl = opp.linkUrl || '';
  const targetAnchor = (opp.suggestedAnchor || '').trim().toLowerCase();
  const targetPassage = (opp.targetPassage || '').trim().toLowerCase();
  const contextSentence = (opp.contextSentence || '').trim().toLowerCase();
  const normTargetUrl = normalizeUrlForComparison(targetUrl);

  const getParentBlockText = (doc: any, pos: number): string => {
    try {
      const docSize = doc.content.size;
      const safePos = Math.min(Math.max(0, pos), docSize);
      const $pos = doc.resolve(safePos);
      return ($pos.parent?.textContent || '').toLowerCase();
    } catch (e) {
      return '';
    }
  };

  const expandLinkRange = (
    doc: any,
    startPos: number,
    linkMark: any
  ): { from: number; to: number; text: string } => {
    let from = startPos;
    const startNode = doc.nodeAt(startPos);
    let to = startPos + (startNode?.nodeSize || 0);
    const targetHref = normalizeUrlForComparison(linkMark?.attrs?.href || '');

    try {
      const $start = doc.resolve(startPos);
      const parentStart = $start.start($start.depth);
      let checkPos = startPos;
      while (checkPos > parentStart) {
        const prevNode = doc.nodeAt(checkPos - 1);
        if (!prevNode || !prevNode.isText) break;
        const prevLink = prevNode.marks?.find(
          (m: any) =>
            m.type.name === 'link' && normalizeUrlForComparison(m.attrs?.href || '') === targetHref
        );
        if (prevLink) {
          checkPos -= prevNode.nodeSize;
          from = checkPos;
        } else {
          break;
        }
      }
    } catch (e) {}

    try {
      const $start = doc.resolve(startPos);
      const parentEnd = $start.end($start.depth);
      let checkPos = to;
      while (checkPos < parentEnd) {
        const nextNode = doc.nodeAt(checkPos);
        if (!nextNode || !nextNode.isText) break;
        const nextLink = nextNode.marks?.find(
          (m: any) =>
            m.type.name === 'link' && normalizeUrlForComparison(m.attrs?.href || '') === targetHref
        );
        if (nextLink) {
          to += nextNode.nodeSize;
          checkPos = to;
        } else {
          break;
        }
      }
    } catch (e) {}

    const text = doc.textBetween(from, to, ' ');
    return { from, to, text };
  };

  // If already accepted/inserted, we only verify the presence of the URL
  if (opp.status === 'accepted') {
    if (contentHtml) {
      const urlsInHtml = extractUrlsFromHtml(contentHtml);
      const hasMatchingUrlInHtml =
        normTargetUrl && urlsInHtml.some((u) => normalizeUrlForComparison(u) === normTargetUrl);
      if (hasMatchingUrlInHtml) {
        return { isVerified: true, reason: 'Link verified in document.' };
      }
    }
  }

  // Workflow A: match_existing
  if (!isSuggestNew) {
    if (editor?.state?.doc) {
      const doc = editor.state.doc;
      const candidates: Array<{
        from: number;
        to: number;
        text: string;
        score: number;
        matchType: 'link_mark_and_anchor' | 'link_mark_only' | 'anchor_text_only';
      }> = [];
      const visitedRanges = new Set<string>();

      doc.descendants((node: any, pos: number) => {
        if (node.isText && node.text) {
          const nodeText = node.text.toLowerCase();
          let idx = nodeText.indexOf(targetAnchor);
          while (idx !== -1) {
            const from = pos + idx;
            const to = from + targetAnchor.length;
            const rangeKey = `${from}-${to}`;

            if (!visitedRanges.has(rangeKey)) {
              visitedRanges.add(rangeKey);
              let score = 30;
              const parentText = getParentBlockText(doc, pos);
              if (targetPassage && (parentText.includes(targetPassage.slice(0, 30)) || targetPassage.includes(parentText))) {
                score += 40;
              }

              candidates.push({
                from,
                to,
                text: node.text.slice(idx, idx + targetAnchor.length),
                score,
                matchType: 'anchor_text_only',
              });
            }
            idx = nodeText.indexOf(targetAnchor, idx + 1);
          }
        }
      });

      candidates.sort((a, b) => b.score - a.score);

      if (candidates.length > 0) {
        return {
          isVerified: true,
          reason: 'Existing anchor verified in draft.',
          candidate: candidates[0],
        };
      }
    }

    if (contentHtml) {
      const plainText = contentHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
      if (targetAnchor && plainText.includes(targetAnchor)) {
        return { isVerified: true, reason: 'Existing anchor verified in saved content.' };
      }
    }
  } 
  
  // Workflow B: suggest_new
  else {
    if (editor?.state?.doc) {
      const doc = editor.state.doc;
      let foundContext = false;
      let candidate: any = null;

      doc.descendants((node: any, pos: number) => {
        if (node.isText && node.text) {
          const nodeText = node.text.toLowerCase();
          if (contextSentence && nodeText.includes(contextSentence.slice(0, 40))) {
            foundContext = true;
            candidate = { from: pos, to: pos + node.text.length, text: node.text };
          }
        }
      });

      if (foundContext) {
        return { isVerified: true, reason: 'Context sentence verified in draft.', candidate };
      }
    }

    if (contentHtml) {
      const plainText = contentHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
      if (contextSentence && plainText.includes(contextSentence.slice(0, 40))) {
        return { isVerified: true, reason: 'Context sentence verified in saved content.' };
      }
    }
  }

  return {
    isVerified: false,
    reason: isSuggestNew
      ? `Could not locate context sentence: "${contextSentence.slice(0, 60)}..."`
      : `Could not locate existing anchor: "${targetAnchor}"`,
  };
}

function renderSentencePreview(passage: string, anchor: string, previewText?: string) {
  const text = (passage || previewText || '').trim();
  if (!text) return null;
  const targetAnchor = (anchor || '').trim();
  if (!targetAnchor) return <span>{text}</span>;

  const lowerText = text.toLowerCase();
  const lowerAnchor = targetAnchor.toLowerCase();
  const idx = lowerText.indexOf(lowerAnchor);

  if (idx === -1) {
    return <span>{text}</span>;
  }

  const before = text.slice(0, idx);
  const matched = text.slice(idx, idx + targetAnchor.length);
  const after = text.slice(idx + targetAnchor.length);

  return (
    <span>
      {before}
      <span className="text-blue-900 bg-blue-50/90 border border-blue-200/90 px-1.5 py-0.5 rounded-sm font-semibold underline decoration-blue-500">
        {matched}
      </span>
      {after}
    </span>
  );
}

interface LinkOpportunitiesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: WritingProject;
  onUpdateOpportunities?: (opportunities: LinkOpportunity[]) => void;
  onAcceptOpportunity: (opportunity: LinkOpportunity) => void;
  onAcceptAllOpportunities?: (opportunities: LinkOpportunity[]) => void;
  onRejectOpportunity: (opportunityId: string) => void;
  onRestoreOpportunity?: (opportunityId: string) => void;
  onRejectAllOpportunities?: () => void;
  editorRef?: React.MutableRefObject<any>;
}

export const LinkOpportunitiesDrawer: React.FC<LinkOpportunitiesDrawerProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateOpportunities,
  onAcceptOpportunity,
  onAcceptAllOpportunities,
  onRejectOpportunity,
  onRestoreOpportunity,
  onRejectAllOpportunities,
  editorRef,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [rationale, setRationale] = useState('');
  const [lastDismissedOpp, setLastDismissedOpp] = useState<LinkOpportunity | null>(null);
  const [viewingLocationOpp, setViewingLocationOpp] = useState<LinkOpportunity | null>(null);
  const [showDismissedSection, setShowDismissedSection] = useState(false);

  if (!isOpen) return null;

  const opportunities: LinkOpportunity[] = project.linkOpportunities || [];
  const usedUrls = extractUrlsFromHtml(project.content);
  const activeLibraryLinks = storage.getInternalLinks().filter((l) => l.active);

  // Check which opportunities are stale or unverified using unified location verification
  const isOpportunityStale = (opp: LinkOpportunity): boolean => {
    const res = verifyOpportunityLocation(opp, project.content, editorRef?.current);
    return !res.isVerified;
  };

  const pendingOpportunities = opportunities.filter((o) => o.status === 'pending');
  const rejectedOpportunities = opportunities.filter((o) => o.status === 'rejected');

  const handleScanForOpportunities = async () => {
    setIsScanning(true);
    setScanError('');

    try {
      const res = await geminiService.findLinkOpportunities(project, activeLibraryLinks);
      if (res.ok) {
        setRationale(res.rationale || '');
        const newOpps = res.opportunities || [];
        const existingIds = new Set(opportunities.map((o) => o.linkId));
        const merged = [...opportunities];

        newOpps.forEach((no) => {
          if (!existingIds.has(no.linkId)) {
            merged.push(no);
          }
        });

        if (onUpdateOpportunities) {
          onUpdateOpportunities(merged);
        }
      } else {
        setScanError(res.error || 'Failed to analyze link opportunities.');
      }
    } catch (err: any) {
      console.error('Scan error:', err);
      setScanError(err?.message || 'Error occurred while scanning for links.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleDismiss = (opp: LinkOpportunity) => {
    setLastDismissedOpp(opp);
    onRejectOpportunity(opp.id);
    setTimeout(() => {
      setLastDismissedOpp((current) => (current?.id === opp.id ? null : current));
    }, 6000);
  };

  const handleRestore = (oppId: string) => {
    if (onRestoreOpportunity) {
      onRestoreOpportunity(oppId);
    }
    if (lastDismissedOpp?.id === oppId) {
      setLastDismissedOpp(null);
    }
  };

  return (
    <div className="max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full w-full md:w-[460px] lg:w-[500px] shrink-0 h-full bg-[#faf9f6] md:border-l border-[#dcd6ca] flex flex-col overflow-hidden animate-in slide-in-from-right-1 duration-150 z-30">
      {/* Drawer Header */}
      <div className="p-4 sm:p-5 border-b border-[#e5dfd3] bg-[#f5f2ea] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-900 shrink-0">
            <Link2 className="w-4 h-4 text-blue-800" />
          </div>
          <div className="min-w-0">
            <h3 className="font-editorial text-lg font-semibold text-[#1e232a] truncate">
              Internal Linking Studio
            </h3>
            <p className="text-xs text-[#736c61] truncate">
              Editorial & shop connections for Science of Gifts
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#736c61] hover:text-[#2d333b] rounded-lg hover:bg-[#e8e2d5] transition-colors shrink-0"
          title="Close Internal Links"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Philosophy Callout */}
      <div className="px-5 py-2.5 bg-blue-50/70 border-b border-blue-200/60 flex items-start gap-2 text-xs text-blue-950 shrink-0">
        <HelpCircle className="w-4 h-4 text-blue-800 shrink-0 mt-0.5" />
        <span>
          <strong>Editorial Rule:</strong> Links are recommended only when they provide genuine value to the reader. No keyword stuffing, no automatic insertions.
        </span>
      </div>

      {/* Undo Dismissal Banner */}
      {lastDismissedOpp && (
        <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between text-xs text-amber-950 animate-fade-in shrink-0">
          <span>Dismissed link to <strong>{lastDismissedOpp.linkTitle}</strong>.</span>
          <button
            type="button"
            onClick={() => handleRestore(lastDismissedOpp.id)}
            className="px-2.5 py-1 bg-amber-900 text-white rounded-lg font-semibold hover:bg-amber-950 transition-colors inline-flex items-center gap-1 shadow-2xs"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Undo</span>
          </button>
        </div>
      )}

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
        {/* Scan Trigger Card */}
        <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-editorial text-sm font-bold text-[#1e232a]">
                Evaluate Link Opportunities
              </h4>
              <p className="text-[11px] text-[#736c61] mt-0.5">
                AI evaluates draft against {activeLibraryLinks.length} active destinations (editorial articles, shop gift guides & products).
              </p>
            </div>

            <button
              type="button"
              onClick={handleScanForOpportunities}
              disabled={isScanning}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2e3743] rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning Draft...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Find Opportunities</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-2 border-t border-[#ede7db] flex items-center justify-between text-[11px] text-[#5c5447]">
            <span>
              <strong>Links in Current Draft:</strong> {usedUrls.length} {usedUrls.length === 1 ? 'URL' : 'URLs'}
            </span>
            <span className="text-emerald-800 font-semibold">
              Duplicate Protection Active
            </span>
          </div>
        </div>

        {scanError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs">
            {scanError}
          </div>
        )}

        {rationale && (
          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-[11px] text-amber-950 leading-relaxed">
            <strong>Strategy:</strong> {rationale}
          </div>
        )}

        {/* SECTION 1: PROPOSED OPPORTUNITIES */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5c5447]">
              Recommendations ({pendingOpportunities.length} Pending)
            </span>

            {pendingOpportunities.length > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onAcceptAllOpportunities && onAcceptAllOpportunities(pendingOpportunities)}
                  className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Accept All</span>
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => onRejectAllOpportunities && onRejectAllOpportunities()}
                  className="text-[11px] font-semibold text-rose-800 hover:text-rose-950 inline-flex items-center gap-1"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Reject All</span>
                </button>
              </div>
            )}
          </div>

          {opportunities.length === 0 ? (
            <div className="p-8 border border-dashed border-[#dcd6ca] rounded-xl text-center bg-white/40 space-y-2">
              <Link2 className="w-6 h-6 text-[#a8a194] mx-auto" />
              <p className="text-xs text-[#736c61]">
                No link opportunities evaluated yet. Click <strong>"Find Opportunities"</strong> above to analyze this draft.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {opportunities.map((opp) => {
                const isStale = isOpportunityStale(opp);
                const isAccepted = opp.status === 'accepted';
                const isRejected = opp.status === 'rejected';

                if (isRejected) return null; // Don't show in active recommendations list

                return (
                  <div
                    key={opp.id}
                    className={`p-4 rounded-xl border transition-all space-y-3 ${
                      isAccepted
                        ? 'bg-emerald-50/60 border-emerald-300'
                        : isStale
                        ? 'bg-amber-50/70 border-amber-300'
                        : 'bg-white border-[#dcd6ca] shadow-2xs'
                    }`}
                  >
                    {/* Header: Destination Type, Title, URL & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                              opp.destinationType === 'product'
                                ? 'text-purple-900 bg-purple-50 border-purple-200'
                                : opp.destinationType === 'shop_guide'
                                ? 'text-amber-900 bg-amber-50 border-amber-200'
                                : 'text-blue-900 bg-blue-50 border-blue-200'
                            }`}
                          >
                            {formatDestinationType(opp.destinationType || 'article')}
                          </span>
                          {opp.relevance && (
                            <span className="text-[10px] text-[#736c61]">
                              · {opp.relevance === 'high' ? 'High Relevance' : 'Medium Relevance'}
                            </span>
                          )}
                        </div>

                        <h5 className="font-editorial text-sm font-bold text-[#1e232a] leading-tight">
                          {opp.linkTitle}
                        </h5>
                        <a
                          href={opp.linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono text-[#736c61] hover:text-amber-800 inline-flex items-center gap-1 truncate max-w-[280px]"
                        >
                          <span>{opp.linkUrl}</span>
                          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                        </a>
                      </div>

                      {isAccepted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Inserted</span>
                        </span>
                      )}
                      {isStale && !isAccepted && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shrink-0">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Text Modified</span>
                        </span>
                      )}
                    </div>

                    {/* Passage, Proposed Anchor, and Sentence Preview */}
                    <div className="p-3 bg-[#faf9f6] border border-[#ede7db] rounded-lg space-y-3">
                      {opp.workflowType === 'suggest_new' ? (
                        <>
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447] flex items-center gap-1">
                              <BookOpen className="w-3 h-3 text-amber-700" />
                              <span>Insert After Context</span>
                            </span>
                            <p className="font-editorial text-[11px] text-[#736c61] leading-relaxed italic border-l-2 border-amber-200 pl-2">
                              "...{opp.contextSentence}"
                            </p>
                          </div>

                          <div className="space-y-1 pt-2 border-t border-[#f0ece1]">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447] flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-blue-700" />
                              <span>Proposed New Sentence</span>
                            </span>
                            <div className="font-editorial text-xs text-[#1e232a] bg-white p-2.5 rounded-md border border-blue-100 shadow-sm leading-relaxed">
                              {renderSentencePreview(opp.targetPassage, opp.suggestedAnchor)}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447] block">
                              Existing Document Passage
                            </span>
                            <p className="font-editorial text-xs text-[#2b251d] leading-relaxed italic">
                              "{opp.targetPassage}"
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-[#1e232a] pt-1.5 border-t border-[#f0ece1]">
                            <strong className="text-[#5c5447]">Proposed Anchor:</strong>
                            <span className="px-1.5 py-0.5 rounded-sm bg-blue-100 text-blue-950 font-semibold underline decoration-blue-500">
                              {opp.suggestedAnchor}
                            </span>
                          </div>

                          <div className="pt-1.5 border-t border-[#f0ece1] text-[11px] space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447] block">
                              Sentence Preview
                            </span>
                            <p className="font-editorial text-xs text-[#1e232a] bg-white p-2.5 rounded-md border border-[#ede7db] leading-relaxed">
                              {renderSentencePreview(opp.targetPassage, opp.suggestedAnchor, opp.previewText)}
                            </p>
                          </div>
                        </>
                      )}

                      {opp.minimalRevision && (
                        <div className="p-2 bg-amber-50/90 border border-amber-200 rounded text-[11px] text-amber-950">
                          <strong className="text-amber-900">Suggested Phrasing:</strong> "{opp.minimalRevision}"
                        </div>
                      )}
                    </div>

                    {/* Editorial Reason & SEO Rationale */}
                    <div className="space-y-1 text-[11px] leading-relaxed">
                      <div className="text-[#5c5447]">
                        <strong className="text-[#1e232a]">Editorial Value:</strong> {opp.reason}
                      </div>
                      {opp.seoRationale && (
                        <div className="text-[#4a443b]">
                          <strong className="text-[#1e232a]">SEO Rationale:</strong> {opp.seoRationale}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 border-t border-[#ede7db] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setViewingLocationOpp(opp)}
                        className="px-2.5 py-1.5 text-xs font-medium text-[#5c5447] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7] transition-colors inline-flex items-center gap-1"
                      >
                        <MapPin className="w-3.5 h-3.5 text-amber-800" />
                        <span>View Location</span>
                      </button>

                      {opp.status === 'pending' && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleDismiss(opp)}
                            className="px-3 py-1.5 text-xs font-medium text-[#5c5447] hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-colors inline-flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Dismiss</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => onAcceptOpportunity(opp)}
                            disabled={isStale}
                            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isStale ? 'Anchor Not Found' : 'Accept Link'}</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION 2: DISMISSED RECOMMENDATIONS */}
        {rejectedOpportunities.length > 0 && (
          <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl space-y-3">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setShowDismissedSection(!showDismissedSection)}
            >
              <span className="text-xs font-bold uppercase tracking-wider text-[#736c61] flex items-center gap-1.5">
                <Ban className="w-3.5 h-3.5 text-stone-500" />
                <span>Dismissed Recommendations ({rejectedOpportunities.length})</span>
              </span>
              <span className="text-xs font-semibold text-amber-900 underline">
                {showDismissedSection ? 'Hide' : 'View'}
              </span>
            </div>

            {showDismissedSection && (
              <div className="space-y-2 pt-2 border-t border-[#f0ede6]">
                {rejectedOpportunities.map((opp) => (
                  <div
                    key={opp.id}
                    className="p-3 bg-[#f9f8f4] border border-[#e5dfd3] rounded-lg flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <h6 className="font-editorial text-xs font-bold text-[#1e232a] truncate">
                        {opp.linkTitle}
                      </h6>
                      <p className="text-[11px] text-[#736c61] truncate">
                        Anchor: "{opp.suggestedAnchor}"
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRestore(opp.id)}
                      className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-[#dcd6ca] text-amber-900 rounded hover:bg-amber-50 transition-colors shrink-0 inline-flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Restore</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: CURRENTLY ACTIVE LINKS IN DOCUMENT */}
        {usedUrls.length > 0 && (
          <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5c5447]">
              Hyperlinks Currently in Document ({usedUrls.length})
            </span>
            <div className="space-y-1.5">
              {usedUrls.map((url, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-[11px] font-mono p-2 bg-[#faf9f6] rounded-md border border-[#ede7db] truncate"
                >
                  <span className="truncate max-w-[320px] text-[#2d333b]">{url}</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#736c61] hover:text-blue-800 shrink-0 ml-2"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* VIEW LOCATION MODAL */}
      {viewingLocationOpp && (() => {
        const verification = verifyOpportunityLocation(
          viewingLocationOpp,
          project.content,
          editorRef?.current
        );

        return (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#faf9f6] border border-[#dcd6ca] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-[#e5dfd3] pb-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-800" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-900 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        {formatDestinationType(viewingLocationOpp.destinationType || 'article')}
                      </span>
                      <h4 className="font-editorial text-base font-bold text-[#1e232a]">
                        Location Inspection: {viewingLocationOpp.linkTitle}
                      </h4>
                    </div>
                    <p className="text-[11px] font-mono text-[#736c61] truncate max-w-sm mt-0.5">
                      {viewingLocationOpp.linkUrl}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingLocationOpp(null)}
                  className="p-1.5 text-[#736c61] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447]">
                    {viewingLocationOpp.status === 'accepted'
                      ? 'Verified Inserted Link Location'
                      : viewingLocationOpp.workflowType === 'suggest_new'
                      ? 'Proposed Insertion Point (After this sentence)'
                      : 'Proposed Insertion Passage'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      verification.isVerified
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                        : 'bg-amber-100 text-amber-900 border border-amber-200'
                    }`}
                  >
                    {verification.isVerified ? 'Verified in Draft' : 'Location Unverified / Stale'}
                  </span>
                </div>

                {!verification.isVerified && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs leading-relaxed">
                    <strong>Notice:</strong> {verification.reason}
                  </div>
                )}

                <div className="p-3 bg-white border border-[#dcd6ca] rounded-xl space-y-2">
                  <p className="font-editorial text-xs text-[#2b251d] leading-relaxed italic">
                    "{viewingLocationOpp.workflowType === 'suggest_new' 
                      ? viewingLocationOpp.contextSentence 
                      : viewingLocationOpp.targetPassage || viewingLocationOpp.suggestedAnchor}"
                  </p>
                  <div className="pt-2 border-t border-[#f0ede6] flex items-center justify-between text-[11px]">
                    <span className="text-[#5c5447]">
                      <strong>{viewingLocationOpp.workflowType === 'suggest_new' ? 'New Anchor:' : 'Target Anchor:'}</strong> {viewingLocationOpp.suggestedAnchor}
                    </span>
                    <span className="font-mono text-blue-800 truncate max-w-[200px]">
                      {viewingLocationOpp.linkUrl}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-[#e5dfd3] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (verification.isVerified && verification.candidate && editorRef?.current) {
                      const bestMatch = verification.candidate;
                      setViewingLocationOpp(null);
                      if (onClose) onClose();

                      requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                          if (editorRef?.current) {
                            const ed = editorRef.current;
                            ed.chain()
                              .focus()
                              .setTextSelection({ from: bestMatch.from, to: bestMatch.to })
                              .scrollIntoView()
                              .run();

                            toast.success(
                              'Jumped to Link Location',
                              `Highlighted "${bestMatch.text || viewingLocationOpp.suggestedAnchor}" in editor.`
                            );
                          }
                        });
                      });
                    } else if (verification.isVerified && editorRef?.current) {
                      editorRef.current.commands.focus();
                      setViewingLocationOpp(null);
                      if (onClose) onClose();
                      toast.info('Editor Focused', 'Focused editor at verified document section.');
                    } else {
                      // Unverified location - keep modal open and issue exactly 1 toast
                      toast.error('Location Unverified', verification.reason);
                    }
                  }}
                  className="px-4 py-2 bg-[#1e232a] text-white rounded-lg font-semibold hover:bg-[#2d3744] transition-colors cursor-pointer"
                >
                  Jump to Editor
                </button>
                <button
                  type="button"
                  onClick={() => setViewingLocationOpp(null)}
                  className="px-4 py-2 bg-white border border-[#dcd6ca] text-[#4a443b] rounded-lg font-semibold hover:bg-[#f5f2ea]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
