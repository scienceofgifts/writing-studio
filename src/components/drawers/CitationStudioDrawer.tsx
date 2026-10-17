/**
 * Science of Gifts - Research Citation Studio Drawer
 * Dedicated workspace for empirical research verification, numbered in-text citations,
 * research gap discovery, and synchronized APA bibliographic references.
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  BookOpen,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Trash2,
  Search,
  RotateCcw,
  RefreshCw,
  HelpCircle,
  FileText,
  Bookmark,
  ChevronRight,
  Eye,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { WritingProject } from '../../types/project';
import { ResearchStudy } from '../../types/research';
import {
  CitationRecommendation,
  CitedStudyReference,
  ResearchGap,
  CitationConfidence,
} from '../../types/citation';
import { storage } from '../../services/storage';
import { researchService } from '../../services/researchService';
import { toast } from '../../services/toastService';
import {
  syncCitationsAndReferences,
  insertCitationIntoHtml,
  removeCitationFromHtml,
  extractCitationsFromHtml,
  splitBodyAndReferences,
} from '../../utils/citationUtils';

interface CitationStudioDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: WritingProject;
  onUpdateProject: (updated: WritingProject) => void;
  editorRef?: React.MutableRefObject<any>;
  onNavigateToResearchLibrary?: () => void;
}

export const CitationStudioDrawer: React.FC<CitationStudioDrawerProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProject,
  editorRef,
  onNavigateToResearchLibrary,
}) => {
  const [allStudies] = useState<ResearchStudy[]>(() => storage.getResearchStudies());
  const [activeTab, setActiveTab] = useState<'opportunities' | 'active_citations' | 'gaps'>('opportunities');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | CitationConfidence>('all');
  const [isSearching, setIsSearching] = useState(false);
  const [searchRationale, setSearchRationale] = useState<string | null>(null);
  const [researchGaps, setResearchGaps] = useState<ResearchGap[]>([]);
  const [viewingLocationOpp, setViewingLocationOpp] = useState<CitationRecommendation | null>(null);

  // Synchronized state of citations in current draft
  const syncInfo = useMemo(() => {
    return syncCitationsAndReferences(project.content || '', allStudies);
  }, [project.content, allStudies]);

  const citedStudyIds = useMemo(() => {
    return new Set(syncInfo.citedStudies.map((s) => s.studyId));
  }, [syncInfo.citedStudies]);

  // All recommendation items
  const recommendations: CitationRecommendation[] = useMemo(() => {
    const recs = project.citationRecommendations || [];
    // Automatically keep status synced with actual draft state
    return recs.map((r) => {
      if (citedStudyIds.has(r.studyId)) {
        return { ...r, status: 'accepted' as const };
      }
      return r;
    });
  }, [project.citationRecommendations, citedStudyIds]);

  const filteredOpportunities = useMemo(() => {
    return recommendations.filter((r) => {
      if (r.status === 'dismissed') return false;
      if (confidenceFilter === 'all') return true;
      return r.confidence === confidenceFilter;
    });
  }, [recommendations, confidenceFilter]);

  const pendingCount = useMemo(() => {
    return recommendations.filter((r) => r.status === 'pending').length;
  }, [recommendations]);

  if (!isOpen) return null;

  // 1. Run Find Research Citations Discovery
  const handleFindCitations = async () => {
    setIsSearching(true);
    setSearchRationale(null);
    try {
      const res = await researchService.findCitationOpportunities(project, allStudies);
      if (res.ok) {
        setSearchRationale(res.rationale || 'Discovery complete.');
        if (res.gaps && res.gaps.length > 0) {
          setResearchGaps(res.gaps);
        }

        // Merge recommendations, preserving existing statuses
        const existingMap = new Map((project.citationRecommendations || []).map((r) => [r.studyId, r]));
        const merged = res.recommendations.map((newRec) => {
          const existing = existingMap.get(newRec.studyId);
          if (existing && existing.status === 'dismissed') {
            return existing;
          }
          if (citedStudyIds.has(newRec.studyId)) {
            return { ...newRec, status: 'accepted' as const };
          }
          return newRec;
        });

        onUpdateProject({
          ...project,
          citationRecommendations: merged,
        });

        toast.success(
          'Citations Discovered',
          `Found ${res.recommendations.length} empirical citations and ${res.gaps?.length || 0} research gaps.`
        );
      } else {
        toast.error('Discovery Error', res.error || 'Failed to analyze article text.');
      }
    } catch (err: any) {
      console.error('Error in handleFindCitations:', err);
      toast.error('Discovery Error', err?.message || 'Error executing research analysis.');
    } finally {
      setIsSearching(false);
    }
  };

  // 2. Insert citation into document
  const handleInsertCitation = (rec: CitationRecommendation) => {
    const { updatedHtml, success, citationNumber } = insertCitationIntoHtml(
      project.content || '',
      rec,
      allStudies
    );

    if (!success) {
      toast.error('Insertion Failed', 'Could not locate target passage in the current draft.');
      return;
    }

    // Update recommendation status
    const updatedRecs = recommendations.map((r) =>
      r.id === rec.id || r.studyId === rec.studyId ? { ...r, status: 'accepted' as const } : r
    );

    // Update project state
    onUpdateProject({
      ...project,
      content: updatedHtml,
      citationRecommendations: updatedRecs,
      updatedAt: new Date().toISOString(),
    });

    // Sync Tiptap editor if mounted
    if (editorRef?.current) {
      editorRef.current.commands.setContent(updatedHtml, false);
    }

    toast.success(
      'Citation Inserted',
      `Numbered citation [${citationNumber}] inserted and References list synchronized.`
    );
  };

  // 3. Remove citation from document
  const handleRemoveCitation = (studyId: string, title?: string) => {
    const { updatedHtml, success } = removeCitationFromHtml(
      project.content || '',
      studyId,
      allStudies
    );

    if (!success) {
      toast.error('Removal Failed', 'Citation not found in the article text.');
      return;
    }

    const updatedRecs = recommendations.map((r) =>
      r.studyId === studyId ? { ...r, status: 'pending' as const } : r
    );

    onUpdateProject({
      ...project,
      content: updatedHtml,
      citationRecommendations: updatedRecs,
      updatedAt: new Date().toISOString(),
    });

    if (editorRef?.current) {
      editorRef.current.commands.setContent(updatedHtml, false);
    }

    toast.info('Citation Removed', `Removed citation for "${title || 'study'}" and renumbered references.`);
  };

  // 4. Dismiss recommendation
  const handleDismiss = (recId: string) => {
    const updatedRecs = recommendations.map((r) =>
      r.id === recId ? { ...r, status: 'dismissed' as const } : r
    );
    onUpdateProject({
      ...project,
      citationRecommendations: updatedRecs,
    });
    toast.info('Dismissed', 'Citation opportunity dismissed.');
  };

  // 5. Jump to citation in editor
  const handleJumpToEditor = (studyId: string, targetPassage?: string) => {
    if (!editorRef?.current) {
      toast.error('Editor Unavailable', 'Editor instance not found.');
      return;
    }

    const editor = editorRef.current;
    let foundPos = -1;
    let foundLength = 0;

    // Scan ProseMirror document for text nodes or superscripts matching studyId or targetPassage
    editor.state.doc.descendants((node: any, pos: number) => {
      if (foundPos !== -1) return false;

      // Check for superscript marks with data-study-id
      if (node.isText && node.marks) {
        const hasMatch = node.marks.some(
          (m: any) =>
            m.type.name === 'superscript' &&
            m.attrs &&
            m.attrs['data-study-id'] === studyId
        );
        if (hasMatch) {
          foundPos = pos;
          foundLength = node.nodeSize;
          return false;
        }
      }

      // Check text content if targetPassage provided
      if (node.isText && targetPassage && node.text) {
        const passageSnippet = targetPassage.trim().slice(0, 35).toLowerCase();
        const nodeText = node.text.toLowerCase();
        const idx = nodeText.indexOf(passageSnippet);
        if (idx !== -1) {
          foundPos = pos + idx;
          foundLength = Math.min(targetPassage.length, node.text.length - idx);
          return false;
        }
      }

      return true;
    });

    if (foundPos !== -1) {
      try {
        editor.commands.focus();
        editor.commands.setTextSelection({ from: foundPos, to: foundPos + foundLength });
        editor.commands.scrollIntoView();
        setViewingLocationOpp(null);
        toast.success('Navigated to Target', 'Highlighted citation location in editor.');
      } catch (err) {
        editor.commands.focus();
        editor.commands.scrollIntoView();
      }
    } else {
      editor.commands.focus();
      editor.commands.scrollIntoView();
      toast.info('Editor Focused', 'Scrolled editor to view.');
    }
  };

  // Confidence badge renderer
  const renderConfidenceBadge = (confidence: CitationConfidence) => {
    switch (confidence) {
      case 'verified_empirical':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
            <span>Verified Empirical</span>
          </span>
        );
      case 'conceptual_support':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-800 border border-blue-200">
            <Bookmark className="w-3 h-3 text-blue-700" />
            <span>Conceptual Support</span>
          </span>
        );
      case 'partial_limitation':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-700" />
            <span>Preliminary / Limitation</span>
          </span>
        );
    }
  };

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 w-full sm:w-[480px] md:w-[540px] lg:w-[580px] bg-[#faf9f6] border-l border-[#dcd6ca] shadow-2xl flex flex-col animate-slide-left"
      role="dialog"
      aria-modal="true"
      aria-label="Research Citation Studio"
    >
      {/* 1. DRAWER HEADER */}
      <div className="p-4 bg-[#f5f2eb] border-b border-[#e5dfd3] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-950 text-amber-100 flex items-center justify-center shadow-xs shrink-0">
            <BookOpen className="w-5 h-5 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-editorial font-bold text-[#1e232a] truncate leading-tight">
              Research Citation Studio
            </h2>
            <p className="text-[11px] text-[#736c61] truncate">
              Empirical verification, numbered superscripts, and APA references
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-[#736c61] hover:text-[#1e232a] hover:bg-[#eae4d7] rounded-lg transition-colors cursor-pointer"
          title="Close drawer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 2. TOP ACTION & METRICS STRIP */}
      <div className="p-4 bg-[#fdfbf7] border-b border-[#e5dfd3] shrink-0 space-y-3">
        {/* Primary Find Citations Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFindCitations}
            disabled={isSearching}
            className="flex-1 py-2 px-3.5 bg-amber-900 hover:bg-amber-950 disabled:bg-amber-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-wait"
          >
            {isSearching ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                <span>Evaluating Empirical Sources...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Find Research Citations</span>
              </>
            )}
          </button>

          {syncInfo.citedStudies.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const { updatedHtml } = syncCitationsAndReferences(project.content || '', allStudies);
                onUpdateProject({ ...project, content: updatedHtml });
                if (editorRef?.current) editorRef.current.commands.setContent(updatedHtml, false);
                toast.success('Synchronized', 'Re-synchronized References list.');
              }}
              className="p-2 text-[#5c5447] hover:text-[#1e232a] bg-white hover:bg-[#ede8dc] border border-[#dcd6ca] rounded-xl transition-colors cursor-pointer"
              title="Re-synchronize References & Numbering"
            >
              <RefreshCw className="w-4 h-4 text-amber-900" />
            </button>
          )}
        </div>

        {/* 4 Summary Stat Cards */}
        <div className="grid grid-cols-4 gap-2 text-center select-none">
          <div className="p-2 bg-white border border-[#eae4d7] rounded-xl shadow-2xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
              In-Text
            </div>
            <div className="text-base font-bold text-amber-900 font-editorial mt-0.5">
              {syncInfo.totalInTextCitations}
            </div>
          </div>

          <div className="p-2 bg-white border border-[#eae4d7] rounded-xl shadow-2xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
              References
            </div>
            <div className="text-base font-bold text-blue-900 font-editorial mt-0.5">
              {syncInfo.citedStudies.length}
            </div>
          </div>

          <div className="p-2 bg-white border border-[#eae4d7] rounded-xl shadow-2xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
              Available
            </div>
            <div className="text-base font-bold text-emerald-800 font-editorial mt-0.5">
              {pendingCount}
            </div>
          </div>

          <div className="p-2 bg-white border border-[#eae4d7] rounded-xl shadow-2xs">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
              Gaps
            </div>
            <div className="text-base font-bold text-rose-800 font-editorial mt-0.5">
              {researchGaps.length}
            </div>
          </div>
        </div>

        {searchRationale && (
          <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-[#5c5447] flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
            <p className="leading-snug">{searchRationale}</p>
          </div>
        )}
      </div>

      {/* 3. NAVIGATION TABS */}
      <div className="px-4 pt-2 bg-[#f5f2eb] border-b border-[#e5dfd3] flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('opportunities')}
          className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'opportunities'
              ? 'border-amber-900 text-amber-950 font-bold'
              : 'border-transparent text-[#736c61] hover:text-[#1e232a]'
          }`}
        >
          <span>Opportunities</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-900 text-white">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('active_citations')}
          className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'active_citations'
              ? 'border-amber-900 text-amber-950 font-bold'
              : 'border-transparent text-[#736c61] hover:text-[#1e232a]'
          }`}
        >
          <span>References List</span>
          {syncInfo.citedStudies.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900">
              {syncInfo.citedStudies.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gaps')}
          className={`pb-2.5 px-2 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'gaps'
              ? 'border-amber-900 text-amber-950 font-bold'
              : 'border-transparent text-[#736c61] hover:text-[#1e232a]'
          }`}
        >
          <span>Research Gaps</span>
          {researchGaps.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-900">
              {researchGaps.length}
            </span>
          )}
        </button>
      </div>

      {/* 4. SCROLLABLE TAB CONTENT */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ========================================================================= */}
        {/* TAB 1: CITATION OPPORTUNITIES                                             */}
        {/* ========================================================================= */}
        {activeTab === 'opportunities' && (
          <div className="space-y-4">
            {/* Filter Pill Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61] mr-1">
                Filter:
              </span>
              {(['all', 'verified_empirical', 'conceptual_support', 'partial_limitation'] as const).map(
                (filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setConfidenceFilter(filter)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                      confidenceFilter === filter
                        ? 'bg-amber-900 text-white border-amber-900'
                        : 'bg-white text-[#5c5447] border-[#dcd6ca] hover:bg-[#f5f2eb]'
                    }`}
                  >
                    {filter === 'all'
                      ? 'All'
                      : filter === 'verified_empirical'
                      ? 'Empirical'
                      : filter === 'conceptual_support'
                      ? 'Conceptual'
                      : 'Limitations'}
                  </button>
                )
              )}
            </div>

            {/* List of Recommendation Cards */}
            {filteredOpportunities.length === 0 ? (
              <div className="p-8 text-center bg-white border border-[#eae4d7] rounded-2xl space-y-3">
                <BookOpen className="w-8 h-8 text-[#a8a194] mx-auto stroke-1" />
                <h3 className="font-editorial text-base font-bold text-[#1e232a]">
                  No Citation Opportunities
                </h3>
                <p className="text-xs text-[#736c61] max-w-sm mx-auto leading-relaxed">
                  Click <strong>Find Research Citations</strong> above to analyze the article text
                  against studies in the Science of Gifts Research Library.
                </p>
                {allStudies.length === 0 && onNavigateToResearchLibrary && (
                  <button
                    type="button"
                    onClick={onNavigateToResearchLibrary}
                    className="inline-flex items-center gap-1.5 text-xs text-amber-900 hover:text-amber-950 font-semibold underline mt-2 cursor-pointer"
                  >
                    <span>Open Research Library to upload studies</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredOpportunities.map((opp, idx) => {
                  const isInserted = opp.status === 'accepted' || citedStudyIds.has(opp.studyId);
                  const cleanDraftText = (project.content || '').replace(/<[^>]+>/g, ' ');
                  const isVerifiedInDraft = cleanDraftText.toLowerCase().includes(opp.targetPassage.trim().slice(0, 30).toLowerCase());

                  return (
                    <div
                      key={opp.id || idx}
                      className={`p-3.5 bg-white border rounded-2xl shadow-2xs transition-all space-y-3 ${
                        isInserted
                          ? 'border-emerald-300 bg-emerald-50/20'
                          : 'border-[#eae4d7] hover:border-[#dcd6ca]'
                      }`}
                    >
                      {/* Card Header: Proposed Number & Confidence */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-[#1e232a] text-[#f7f5ef] text-[11px] font-bold flex items-center justify-center font-mono">
                            {opp.proposedCitationNumber || idx + 1}
                          </span>
                          {renderConfidenceBadge(opp.confidence)}
                        </div>

                        {isInserted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
                            <Check className="w-3 h-3 text-emerald-700" />
                            <span>Inserted</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDismiss(opp.id)}
                            className="p-1 text-[#8a8275] hover:text-rose-700 rounded-md transition-colors"
                            title="Dismiss opportunity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Target Passage in Article */}
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                          Article Claim / Passage:
                        </div>
                        <blockquote className="p-2.5 bg-[#faf8f4] border-l-2 border-amber-800 rounded-r-lg text-xs font-serif text-[#2b251d] italic leading-relaxed">
                          "{opp.targetPassage}"
                        </blockquote>
                      </div>

                      {/* Matched Study Details */}
                      <div className="p-2.5 bg-[#fbf9f4] border border-[#eee8dc] rounded-xl space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-editorial text-sm font-bold text-[#1e232a] leading-snug">
                            {opp.studyTitle}
                          </h4>
                          {opp.url && (
                            <a
                              href={opp.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-700 hover:text-blue-900 p-0.5 shrink-0"
                              title="Open original study source"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>

                        <div className="text-[11px] text-[#5c5447]">
                          <span className="font-semibold">
                            {Array.isArray(opp.authors) ? opp.authors.join(', ') : opp.authors}
                          </span>
                          {opp.publicationYear && <span> ({opp.publicationYear})</span>}
                          {opp.publication && <span> • <em>{opp.publication}</em></span>}
                        </div>

                        {/* Empirical Finding */}
                        <div className="pt-1.5 border-t border-[#eae4d7] text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-0.5">
                            Key Empirical Finding:
                          </span>
                          <p className="text-[#383229] leading-relaxed">
                            {opp.relevantFinding}
                          </p>
                        </div>

                        {/* Editorial Relevance */}
                        {opp.explanation && (
                          <div className="pt-1 border-t border-[#eae4d7] text-xs">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61] block mb-0.5">
                              Editorial Rationale:
                            </span>
                            <p className="text-[#5c5447] italic leading-relaxed">
                              {opp.explanation}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#f0ede6]">
                        <button
                          type="button"
                          onClick={() => setViewingLocationOpp(opp)}
                          className="px-2.5 py-1.5 text-xs text-[#5c5447] hover:text-[#1e232a] bg-[#faf8f4] hover:bg-[#f0ede6] border border-[#dcd6ca] rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-900" />
                          <span>Inspect Location</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          {isInserted ? (
                            <button
                              type="button"
                              onClick={() => handleRemoveCitation(opp.studyId, opp.studyTitle)}
                              className="px-3 py-1.5 text-xs font-semibold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove Citation</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleInsertCitation(opp)}
                              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Insert Citation [{opp.proposedCitationNumber || idx + 1}]</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ACTIVE CITATIONS & REFERENCES LIST                                 */}
        {/* ========================================================================= */}
        {activeTab === 'active_citations' && (
          <div className="space-y-4">
            <div className="p-3 bg-white border border-[#eae4d7] rounded-xl text-xs text-[#5c5447] leading-relaxed">
              Below is the synchronized academic References section automatically attached to the
              end of your article in standard APA style. Numbering strictly corresponds to the order of
              first appearance in the text.
            </div>

            {syncInfo.citedStudies.length === 0 ? (
              <div className="p-8 text-center bg-white border border-[#eae4d7] rounded-2xl space-y-2">
                <FileText className="w-8 h-8 text-[#a8a194] mx-auto stroke-1" />
                <h3 className="font-editorial text-base font-bold text-[#1e232a]">
                  No Active References
                </h3>
                <p className="text-xs text-[#736c61] max-w-sm mx-auto">
                  Insert citation opportunities from the Opportunities tab to automatically build your
                  References list.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <ol className="space-y-3">
                  {syncInfo.citedStudies.map((cs) => (
                    <li
                      key={cs.studyId}
                      className="p-3 bg-white border border-[#eae4d7] rounded-xl shadow-2xs space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-md bg-amber-900 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                            {cs.citationNumber}
                          </span>
                          <span className="text-[11px] font-semibold text-[#736c61]">
                            Cited {cs.occurrenceCount || 1} time{cs.occurrenceCount !== 1 ? 's' : ''} in text
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleJumpToEditor(cs.studyId)}
                            className="px-2 py-1 text-[11px] text-[#5c5447] hover:text-[#1e232a] bg-[#faf8f4] hover:bg-[#f0ede6] border border-[#dcd6ca] rounded-md transition-colors cursor-pointer"
                            title="Locate citation in editor"
                          >
                            Jump to Text
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveCitation(cs.studyId, cs.title)}
                            className="p-1 text-rose-700 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            title="Remove citation and renumber"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Rendered APA Formatted Reference */}
                      <div
                        className="text-xs text-[#2b251d] font-ui leading-relaxed pt-1 border-t border-[#f0ede6]"
                        dangerouslySetInnerHTML={{ __html: cs.formattedReference }}
                      />
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: RESEARCH GAPS                                                     */}
        {/* ========================================================================= */}
        {activeTab === 'gaps' && (
          <div className="space-y-4">
            <div className="p-3 bg-white border border-[#eae4d7] rounded-xl text-xs text-[#5c5447] leading-relaxed">
              Research Gaps highlight claims or assertions in your draft that lack empirical backing
              in the current Research Library, recommending which topics or studies should be added.
            </div>

            {researchGaps.length === 0 ? (
              <div className="p-8 text-center bg-white border border-[#eae4d7] rounded-2xl space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto stroke-1" />
                <h3 className="font-editorial text-base font-bold text-[#1e232a]">
                  No Unsubstantiated Gaps Flagged
                </h3>
                <p className="text-xs text-[#736c61] max-w-sm mx-auto">
                  Run <strong>Find Research Citations</strong> to detect claims requiring academic
                  evidence.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {researchGaps.map((gap, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-white border border-rose-200/80 rounded-2xl shadow-2xs space-y-2"
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
                      <AlertTriangle className="w-4 h-4 text-rose-700" />
                      <span>Unsubstantiated Draft Claim</span>
                    </div>

                    <blockquote className="p-2 bg-rose-50/50 border-l-2 border-rose-600 text-xs italic text-[#2b251d] rounded-r-md">
                      "{gap.claimInArticle}"
                    </blockquote>

                    <div className="text-xs space-y-1 pt-1 border-t border-[#f0ede6]">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                          Research Study Needed:
                        </span>
                        <p className="font-semibold text-[#1e232a]">{gap.topicNeeded}</p>
                      </div>

                      {gap.suggestion && (
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                            Editorial Recommendation:
                          </span>
                          <p className="text-[#5c5447] italic">{gap.suggestion}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. LOCATION INSPECTION MODAL */}
      {viewingLocationOpp && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#faf9f6] border border-[#dcd6ca] rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-editorial text-base font-bold text-[#1e232a]">
                  Inspect Citation Location
                </h3>
                <p className="text-xs text-[#736c61]">
                  Verify where citation [#{viewingLocationOpp.proposedCitationNumber || 1}] belongs in the draft
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingLocationOpp(null)}
                className="p-1 text-[#736c61] hover:text-[#1e232a] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                Target Passage in Draft:
              </div>
              <blockquote className="p-3 bg-white border border-[#eae4d7] rounded-xl text-xs font-serif italic text-[#1e232a] leading-relaxed">
                "{viewingLocationOpp.targetPassage}"
              </blockquote>
            </div>

            <div className="p-3 bg-[#fbf9f4] border border-[#eee8dc] rounded-xl text-xs space-y-1">
              <div className="font-bold text-[#1e232a]">{viewingLocationOpp.studyTitle}</div>
              <div className="text-[#5c5447]">
                {Array.isArray(viewingLocationOpp.authors)
                  ? viewingLocationOpp.authors.join(', ')
                  : viewingLocationOpp.authors} ({viewingLocationOpp.publicationYear || 'n.d.'})
              </div>
              <p className="text-[#383229] pt-1 border-t border-[#eae4d7] italic">
                {viewingLocationOpp.relevantFinding}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e5dfd3]">
              <button
                type="button"
                onClick={() => setViewingLocationOpp(null)}
                className="px-3 py-1.5 text-xs text-[#5c5447] hover:text-[#1e232a] bg-white border border-[#dcd6ca] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleJumpToEditor(viewingLocationOpp.studyId, viewingLocationOpp.targetPassage)}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 rounded-lg inline-flex items-center gap-1.5 shadow-2xs"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Jump to Editor</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
