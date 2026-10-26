/**
 * Science of Gifts - Research Citation Studio Drawer
 * Dedicated workspace for empirical research verification, numbered in-text citations (Workflow A),
 * research-backed passage drafting (Workflow B), research gap discovery, and synchronized APA references.
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  BookOpen,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Loader2,
  Trash2,
  RefreshCw,
  FileText,
  Bookmark,
  Eye,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  Check,
  PenTool,
  ShieldAlert,
} from 'lucide-react';
import { WritingProject } from '../../types/project';
import { ResearchStudy } from '../../types/research';
import {
  CitationRecommendation,
  ResearchGap,
  CitationConfidence,
  CitationEvidenceType,
} from '../../types/citation';
import { storage } from '../../services/storage';
import { researchService } from '../../services/researchService';
import { toast } from '../../services/toastService';
import {
  syncCitationsAndReferences,
  insertCitationIntoHtml,
  insertDraftedPassageWithCitation,
  removeCitationFromHtml,
  verifyTargetPassageInHtml,
  isPassageCitedWithStudy,
  mergeCitationRecommendations,
  resolveStudySourceLink,
} from '../../utils/citationUtils';
import { reconcileNotesWithHtmlContent } from '../../utils/editingNotes';

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

  // Workflow B ("Draft Research Passage") state per recommendation ID
  const [draftingRecId, setDraftingRecId] = useState<string | null>(null);
  const [editingPassageByRecId, setEditingPassageByRecId] = useState<Record<string, string>>({});
  const [editingSectionByRecId, setEditingSectionByRecId] = useState<Record<string, string>>({});
  const [openDraftEditorIds, setOpenDraftEditorIds] = useState<Record<string, boolean>>({});

  // Standalone Workflow B picker for any library study
  const [selectedStudyIdForDraft, setSelectedStudyIdForDraft] = useState<string>('');
  const [isDraftingStandalone, setIsDraftingStandalone] = useState(false);

  // Synchronized state of citations in current draft
  const syncInfo = useMemo(() => {
    return syncCitationsAndReferences(project.content || '', allStudies);
  }, [project.content, allStudies]);

  // All recommendation items — synced per specific passage + study
  const recommendations: CitationRecommendation[] = useMemo(() => {
    const recs = project.citationRecommendations || [];
    return recs.map((r) => {
      const workflowType =
        r.workflowType || (r.targetPassage && r.targetPassage.trim() ? 'cite_existing' : 'draft_passage');

      if (workflowType === 'cite_existing' && r.targetPassage) {
        const citedOnPassage = isPassageCitedWithStudy(
          project.content || '',
          r.targetPassage,
          r.studyId
        );
        if (citedOnPassage) {
          return { ...r, workflowType, status: 'accepted' as const };
        }
      }
      return { ...r, workflowType };
    });
  }, [project.citationRecommendations, project.content]);

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

  const syncEditorContent = (updatedHtml: string) => {
    if (editorRef?.current) {
      editorRef.current.commands.setContent(updatedHtml, { emitUpdate: false });
    }
    window.dispatchEvent(
      new CustomEvent('sog:restore-editor-content', {
        detail: { content: updatedHtml, projectId: project.id },
      })
    );
  };

  // 1. Run Find Research Citations Discovery
  const handleFindCitations = async () => {
    setIsSearching(true);
    setSearchRationale(null);
    try {
      const res = await researchService.findCitationOpportunities(project, allStudies);
      if (res.ok) {
        setSearchRationale(
          res.rationale ||
            (res.recommendations.length === 0
              ? 'No existing sentences had direct empirical support from the Research Library.'
              : 'Discovery complete.')
        );
        if (res.gaps) {
          setResearchGaps(res.gaps);
        }

        const merged = mergeCitationRecommendations(
          project.citationRecommendations || [],
          res.recommendations,
          project.content || ''
        );

        onUpdateProject({
          ...project,
          citationRecommendations: merged,
        });

        const verifiedCount = merged.filter(
          (r) => r.status === 'pending' && r.workflowType !== 'draft_passage' && r.isVerifiedMatch
        ).length;
        const draftPassageCount = merged.filter(
          (r) => r.status === 'pending' && r.workflowType === 'draft_passage'
        ).length;

        if (verifiedCount === 0 && draftPassageCount === 0) {
          toast.info(
            'No Direct Citation Matches',
            'No existing sentences met strict empirical verification. You can draft a research-backed passage from a study instead.'
          );
        } else {
          toast.success(
            'Citations Evaluated',
            `Found ${verifiedCount} verified passage match${verifiedCount === 1 ? '' : 'es'} and ${draftPassageCount} research-backed passage opportunit${draftPassageCount === 1 ? 'y' : 'ies'}.`
          );
        }
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

  // 2. Workflow A: Insert citation into an existing verified passage
  const handleInsertCitation = (rec: CitationRecommendation) => {
    // Enforce strict verification before allowing direct passage citation insertion
    if (rec.workflowType === 'draft_passage') {
      toast.error(
        'Passage Required First',
        'This study does not match an existing sentence. Draft and approve a research-backed passage first.'
      );
      return;
    }

    if (!rec.isVerifiedMatch || rec.verificationStatus === 'insufficient_evidence') {
      toast.error(
        'Verification Required',
        rec.verificationNote ||
          'This recommendation lacks verified empirical support for direct insertion. Draft a research-backed passage instead.'
      );
      return;
    }

    const result = insertCitationIntoHtml(project.content || '', rec, allStudies);

    if (!result.success) {
      toast.error(
        'Insertion Blocked',
        result.errorReason || 'Could not unambiguously locate target passage in the current draft.'
      );
      return;
    }

    const updatedRecs = recommendations.map((r) =>
      r.id === rec.id ? { ...r, status: 'accepted' as const } : r
    );

    const reconciledNotes = project.editingNotes?.length
      ? reconcileNotesWithHtmlContent(result.updatedHtml, project.editingNotes)
      : project.editingNotes;

    onUpdateProject({
      ...project,
      content: result.updatedHtml,
      citedStudies: result.citedStudies,
      citationRecommendations: updatedRecs,
      editingNotes: reconciledNotes,
      updatedAt: new Date().toISOString(),
    });

    syncEditorContent(result.updatedHtml);

    if (result.alreadyCited) {
      toast.info(
        'Already Cited',
        `This passage already cites [${result.citationNumber}]. Duplicate marker prevented.`
      );
    } else {
      toast.success(
        'Citation Inserted',
        `Numbered citation [${result.citationNumber}] inserted and References list synchronized.`
      );
    }
  };

  // 3. Workflow B: Generate or refresh a research-backed passage for a recommendation
  const handleGenerateDraftPassageForRec = async (rec: CitationRecommendation) => {
    const study = allStudies.find((s) => s.id === rec.studyId);
    if (!study) {
      toast.error('Study Not Found', 'Referenced study was not found in the Research Library.');
      return;
    }

    setDraftingRecId(rec.id);
    try {
      const res = await researchService.draftResearchPassage(project, study, {
        targetSectionHeading: editingSectionByRecId[rec.id] ?? rec.targetSectionHeading,
        anchorPassageContext: rec.anchorPassageContext || rec.targetPassage,
      });

      if (!res.ok || !res.proposedPassage) {
        toast.error('Drafting Blocked', res.error || 'Could not draft a research-backed passage.');
        return;
      }

      setEditingPassageByRecId((prev) => ({ ...prev, [rec.id]: res.proposedPassage }));
      if (res.targetSectionHeading) {
        setEditingSectionByRecId((prev) => ({ ...prev, [rec.id]: res.targetSectionHeading! }));
      }
      setOpenDraftEditorIds((prev) => ({ ...prev, [rec.id]: true }));

      const updatedRecs = recommendations.map((r) =>
        r.id === rec.id
          ? {
              ...r,
              workflowType: 'draft_passage' as const,
              proposedPassage: res.proposedPassage,
              relevantFinding: res.relevantFinding || r.relevantFinding,
              supportingEvidence: res.supportingEvidence || r.supportingEvidence,
              limitationsOrQualifications:
                res.limitationsOrQualifications || r.limitationsOrQualifications,
              targetSectionHeading: res.targetSectionHeading || r.targetSectionHeading,
              anchorPassageContext: res.anchorPassageContext || r.anchorPassageContext,
              draftStatus: 'proposed' as const,
            }
          : r
      );

      onUpdateProject({
        ...project,
        citationRecommendations: updatedRecs,
      });

      toast.success(
        'Research Passage Drafted',
        'Review and edit the proposed passage below before approving insertion.'
      );
    } catch (err: any) {
      console.error('Error drafting research passage:', err);
    } finally {
      setDraftingRecId(null);
    }
  };

  // 4. Workflow B: Standalone "Draft Research Passage" for any study in the library
  const handleCreateStandaloneDraftPassage = async () => {
    const study = allStudies.find((s) => s.id === selectedStudyIdForDraft);
    if (!study) {
      toast.error('Select a Study', 'Choose a study from the Research Library first.');
      return;
    }

    setIsDraftingStandalone(true);
    try {
      const res = await researchService.draftResearchPassage(project, study);
      if (!res.ok || !res.proposedPassage) {
        toast.error('Drafting Blocked', res.error || 'Study lacks sufficient evidence in library.');
        return;
      }

      const linkInfo = resolveStudySourceLink(study);
      const newRecId = `cit-draft-${Date.now()}`;
      const newRec: CitationRecommendation = {
        id: newRecId,
        studyId: study.id,
        studyTitle: study.title,
        authors: study.authors || ['Research Archive'],
        publicationYear: study.publicationYear,
        publication: study.publication || study.sourceOrPublisher,
        doi: linkInfo.doi || study.doi,
        url: linkInfo.url || study.sourceUrl || study.doiOrUrl,
        sourceIdentifier:
          linkInfo.url ||
          linkInfo.displayLabel ||
          'No direct DOI or external URL on file in Research Library',
        workflowType: 'draft_passage',
        targetPassage: '',
        targetSectionHeading: res.targetSectionHeading,
        anchorPassageContext: res.anchorPassageContext,
        proposedCitationNumber: syncInfo.citedStudies.length + 1,
        relevantFinding: res.relevantFinding,
        supportingEvidence: res.supportingEvidence,
        limitationsOrQualifications: res.limitationsOrQualifications,
        explanation:
          res.explanation ||
          'Research-backed passage drafted directly from study findings in the Research Library.',
        confidence: 'verified_empirical',
        evidenceType: 'direct_empirical',
        isVerifiedMatch: false,
        verificationStatus: 'needs_review',
        isInsertionReady: false,
        verificationNote: 'Review, edit if needed, and approve to insert passage with citation.',
        proposedPassage: res.proposedPassage,
        draftStatus: 'proposed',
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      setEditingPassageByRecId((prev) => ({ ...prev, [newRecId]: res.proposedPassage }));
      if (res.targetSectionHeading) {
        setEditingSectionByRecId((prev) => ({ ...prev, [newRecId]: res.targetSectionHeading! }));
      }
      setOpenDraftEditorIds((prev) => ({ ...prev, [newRecId]: true }));

      onUpdateProject({
        ...project,
        citationRecommendations: [newRec, ...recommendations],
      });

      toast.success(
        'Research Passage Proposed',
        'Review and approve the drafted passage to insert it with its citation.'
      );
    } catch (err: any) {
      console.error('Error creating standalone draft passage:', err);
    } finally {
      setIsDraftingStandalone(false);
    }
  };

  // 5. Workflow B: Explicitly Approve & Insert drafted research passage + citation + reference
  const handleApproveAndInsertDraftedPassage = (rec: CitationRecommendation) => {
    const passageText = (
      editingPassageByRecId[rec.id] !== undefined
        ? editingPassageByRecId[rec.id]
        : rec.proposedPassage || ''
    ).trim();

    if (!passageText || passageText.length < 10) {
      toast.error(
        'Passage Required',
        'Please provide a non-empty research-backed passage before approving insertion.'
      );
      return;
    }

    const sectionHeading =
      editingSectionByRecId[rec.id] !== undefined
        ? editingSectionByRecId[rec.id]
        : rec.targetSectionHeading;

    const result = insertDraftedPassageWithCitation(
      project.content || '',
      passageText,
      rec.studyId,
      allStudies,
      {
        anchorPassageContext: rec.anchorPassageContext || rec.targetPassage || undefined,
        targetSectionHeading: sectionHeading || undefined,
      }
    );

    if (!result.success) {
      toast.error(
        'Insertion Failed',
        result.errorReason || 'Could not insert the drafted research passage.'
      );
      return;
    }

    const updatedRecs = recommendations.map((r) =>
      r.id === rec.id
        ? {
            ...r,
            targetPassage: result.insertedPassage,
            proposedPassage: passageText,
            draftStatus: 'approved' as const,
            status: 'accepted' as const,
            isVerifiedMatch: true,
            verificationStatus: 'verified' as const,
          }
        : r
    );

    const reconciledNotes = project.editingNotes?.length
      ? reconcileNotesWithHtmlContent(result.updatedHtml, project.editingNotes)
      : project.editingNotes;

    onUpdateProject({
      ...project,
      content: result.updatedHtml,
      citedStudies: result.citedStudies,
      citationRecommendations: updatedRecs,
      editingNotes: reconciledNotes,
      updatedAt: new Date().toISOString(),
    });

    syncEditorContent(result.updatedHtml);
    setOpenDraftEditorIds((prev) => ({ ...prev, [rec.id]: false }));

    toast.success(
      'Research Passage & Citation Inserted',
      `Inserted approved passage with citation [${result.citationNumber}] and updated References.`
    );
  };

  // 6. Workflow B: Reject drafted passage without modifying article
  const handleRejectDraftedPassage = (rec: CitationRecommendation) => {
    setOpenDraftEditorIds((prev) => ({ ...prev, [rec.id]: false }));
    const updatedRecs = recommendations.map((r) =>
      r.id === rec.id
        ? {
            ...r,
            draftStatus: 'rejected' as const,
            status: r.workflowType === 'draft_passage' ? ('dismissed' as const) : r.status,
          }
        : r
    );
    onUpdateProject({
      ...project,
      citationRecommendations: updatedRecs,
    });
    toast.info('Draft Rejected', 'Proposed research passage was discarded without modifying the article.');
  };

  // 7. Remove citation from document
  const handleRemoveCitation = (studyId: string, title?: string) => {
    const result = removeCitationFromHtml(project.content || '', studyId, allStudies);

    if (!result.success) {
      toast.error('Removal Failed', 'Citation not found in the article text.');
      return;
    }

    const updatedRecs = recommendations.map((r) =>
      r.studyId === studyId && r.status === 'accepted' ? { ...r, status: 'pending' as const } : r
    );

    const reconciledNotes = project.editingNotes?.length
      ? reconcileNotesWithHtmlContent(result.updatedHtml, project.editingNotes)
      : project.editingNotes;

    onUpdateProject({
      ...project,
      content: result.updatedHtml,
      citedStudies: result.citedStudies,
      citationRecommendations: updatedRecs,
      editingNotes: reconciledNotes,
      updatedAt: new Date().toISOString(),
    });

    syncEditorContent(result.updatedHtml);

    toast.info(
      'Citation Removed',
      `Removed citation for "${title || 'study'}" and renumbered references.`
    );
  };

  // 8. Dismiss recommendation
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

  // 9. Jump to citation in editor
  const handleJumpToEditor = (studyId: string, targetPassage?: string) => {
    if (!editorRef?.current) {
      toast.error('Editor Unavailable', 'Editor instance not found.');
      return;
    }

    const editor = editorRef.current;
    let foundPos = -1;
    let foundLength = 0;

    editor.state.doc.descendants((node: any, pos: number) => {
      if (foundPos !== -1) return false;

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
      } catch {
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

  const renderEvidenceTypeLabel = (evidenceType?: CitationEvidenceType) => {
    switch (evidenceType) {
      case 'direct_empirical':
        return 'Direct Empirical Finding';
      case 'author_interpretation':
        return 'Study Author Interpretation';
      case 'background_context':
        return 'Background Context';
      case 'editorial_suggestion':
        return 'AI Editorial Suggestion';
      default:
        return 'Research Finding';
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
              Evidence-first verification, research-backed passages, and APA references
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
                <span>Verifying Empirical Sources...</span>
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
                const { updatedHtml, citedStudies } = syncCitationsAndReferences(
                  project.content || '',
                  allStudies
                );
                onUpdateProject({ ...project, content: updatedHtml, citedStudies });
                syncEditorContent(updatedHtml);
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
        {/* TAB 1: CITATION OPPORTUNITIES (WORKFLOW A & WORKFLOW B)                    */}
        {/* ========================================================================= */}
        {activeTab === 'opportunities' && (
          <div className="space-y-4">
            {/* Workflow B Quick Launcher: Draft a Research-Backed Passage from any Library Study */}
            {allStudies.length > 0 && (
              <div className="p-3 bg-[#faf8f4] border border-[#e2dcd0] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#1e232a]">
                    <PenTool className="w-3.5 h-3.5 text-amber-900" />
                    <span>Write a Research-Backed Passage (Workflow B)</span>
                  </div>
                </div>
                <p className="text-[11px] text-[#5c5447] leading-relaxed">
                  When a study does not directly support an existing sentence, draft a research-backed passage grounded in the study&apos;s findings first, review it, and insert both together.
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedStudyIdForDraft}
                    onChange={(e) => setSelectedStudyIdForDraft(e.target.value)}
                    className="flex-1 min-w-0 text-xs bg-white border border-[#dcd6ca] rounded-lg px-2.5 py-1.5 text-[#1e232a]"
                  >
                    <option value="">Select a study from Research Library...</option>
                    {allStudies.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title} ({s.publicationYear || 'n.d.'})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleCreateStandaloneDraftPassage}
                    disabled={!selectedStudyIdForDraft || isDraftingStandalone}
                    className="px-3 py-1.5 text-xs font-semibold bg-[#1e232a] hover:bg-[#2d3744] disabled:opacity-50 text-white rounded-lg inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {isDraftingStandalone ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Drafting...</span>
                      </>
                    ) : (
                      <>
                        <PenTool className="w-3.5 h-3.5 text-amber-300" />
                        <span>Draft Research Passage</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Filter Strip */}
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
                  No Verified Citation Opportunities
                </h3>
                <p className="text-xs text-[#736c61] max-w-sm mx-auto leading-relaxed">
                  Click <strong>Find Research Citations</strong> above to verify whether any existing sentences are directly substantiated by studies in the Research Library, or use <strong>Draft Research Passage</strong> to write a research-backed passage first.
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
                  const isWorkflowB = opp.workflowType === 'draft_passage';
                  const livePassageCheck =
                    !isWorkflowB && opp.targetPassage
                      ? verifyTargetPassageInHtml(project.content || '', opp.targetPassage)
                      : null;

                  const isInserted =
                    opp.status === 'accepted' ||
                    (!isWorkflowB &&
                      Boolean(opp.targetPassage) &&
                      isPassageCitedWithStudy(project.content || '', opp.targetPassage, opp.studyId));

                  const canDirectlyInsertWorkflowA =
                    !isWorkflowB &&
                    opp.isVerifiedMatch === true &&
                    opp.verificationStatus === 'verified' &&
                    Boolean(livePassageCheck?.canInsert);

                  const isDraftEditorOpen =
                    Boolean(openDraftEditorIds[opp.id]) ||
                    (isWorkflowB && Boolean(opp.proposedPassage) && !isInserted);

                  const currentDraftText =
                    editingPassageByRecId[opp.id] !== undefined
                      ? editingPassageByRecId[opp.id]
                      : opp.proposedPassage || '';

                  const currentSectionHeading =
                    editingSectionByRecId[opp.id] !== undefined
                      ? editingSectionByRecId[opp.id]
                      : opp.targetSectionHeading || '';

                  return (
                    <div
                      key={opp.id || idx}
                      className={`p-3.5 bg-white border rounded-2xl shadow-2xs transition-all space-y-3 ${
                        isInserted
                          ? 'border-emerald-300 bg-emerald-50/20'
                          : isWorkflowB
                          ? 'border-amber-300/90 bg-[#fffdf9]'
                          : 'border-[#eae4d7] hover:border-[#dcd6ca]'
                      }`}
                    >
                      {/* Card Header: Number, Workflow Mode, & Confidence */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="w-6 h-6 rounded-lg bg-[#1e232a] text-[#f7f5ef] text-[11px] font-bold flex items-center justify-center font-mono">
                            {opp.proposedCitationNumber || idx + 1}
                          </span>
                          {renderConfidenceBadge(opp.confidence)}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              isWorkflowB
                                ? 'bg-amber-100/80 text-amber-950 border-amber-300'
                                : canDirectlyInsertWorkflowA
                                ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                : 'bg-rose-50 text-rose-900 border-rose-200'
                            }`}
                          >
                            {isWorkflowB
                              ? 'Workflow B: Draft Passage First'
                              : canDirectlyInsertWorkflowA
                              ? 'Workflow A: Verified Passage Match'
                              : 'Requires Verification'}
                          </span>
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
                            className="p-1 text-[#8a8275] hover:text-rose-700 rounded-md transition-colors cursor-pointer"
                            title="Dismiss opportunity"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Target Passage in Article (Workflow A) or Target Section Context (Workflow B) */}
                      {opp.targetPassage ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                              Target Sentence in Article:
                            </span>
                            {livePassageCheck && !livePassageCheck.canInsert && !isInserted && (
                              <span className="text-[10px] font-semibold text-rose-700">
                                {livePassageCheck.status === 'ambiguous'
                                  ? `Ambiguous (${livePassageCheck.matchCount} matches)`
                                  : 'Passage not found in current draft'}
                              </span>
                            )}
                          </div>
                          <blockquote className="p-2.5 bg-[#faf8f4] border-l-2 border-amber-800 rounded-r-lg text-xs font-serif text-[#2b251d] italic leading-relaxed">
                            &ldquo;{opp.targetPassage}&rdquo;
                          </blockquote>
                        </div>
                      ) : (
                        <div className="p-2.5 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-[#4a4236] space-y-1">
                          <div className="font-semibold text-amber-950">
                            No existing sentence directly states this study&apos;s finding
                          </div>
                          {opp.targetSectionHeading && (
                            <div className="text-[11px] text-[#5c5447]">
                              Suggested Section: <strong>{opp.targetSectionHeading}</strong>
                            </div>
                          )}
                          {opp.anchorPassageContext && (
                            <div className="text-[11px] text-[#5c5447] italic">
                              Suggested Anchor: &ldquo;{opp.anchorPassageContext}&rdquo;
                            </div>
                          )}
                        </div>
                      )}

                      {/* Matched Study & Strict Evidence Details */}
                      <div className="p-2.5 bg-[#fbf9f4] border border-[#eee8dc] rounded-xl space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-editorial text-sm font-bold text-[#1e232a] leading-snug">
                              {opp.studyTitle}
                            </h4>
                            <div className="text-[10px] font-mono text-[#736c61] mt-0.5">
                              Study ID: {opp.studyId} • {renderEvidenceTypeLabel(opp.evidenceType)}
                            </div>
                          </div>
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
                          {opp.publication && (
                            <span>
                              {' '}
                              • <em>{opp.publication}</em>
                            </span>
                          )}
                        </div>

                        {/* Source Identifier / DOI */}
                        <div className="text-[11px] text-[#5c5447] flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                            Source Link / DOI:
                          </span>
                          {opp.url ? (
                            <a
                              href={opp.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-700 hover:underline font-mono text-[11px] break-all"
                            >
                              {opp.doi ? `https://doi.org/${opp.doi}` : opp.url}
                            </a>
                          ) : (
                            <span className="text-[#8a8275] italic">
                              {opp.sourceIdentifier || 'No external link or DOI on file'}
                            </span>
                          )}
                        </div>

                        {/* Specific Finding from Study */}
                        <div className="pt-1.5 border-t border-[#eae4d7] text-xs">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-0.5">
                            Specific Study Finding:
                          </span>
                          <p className="text-[#383229] leading-relaxed">
                            {opp.relevantFinding || (
                              <span className="italic text-rose-700">
                                No verified empirical finding extracted in library record.
                              </span>
                            )}
                          </p>
                        </div>

                        {/* Supporting Evidence from Library Record */}
                        {opp.supportingEvidence && (
                          <div className="pt-1.5 border-t border-[#eae4d7] text-xs">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447] block mb-0.5">
                              Library Evidence Supporting Interpretation:
                            </span>
                            <p className="text-[#383229] leading-relaxed bg-white/80 p-2 rounded-lg border border-[#eae4d7] text-[11px]">
                              {opp.supportingEvidence}
                            </p>
                          </div>
                        )}

                        {/* Limitations, Uncertainty, or Qualifications */}
                        {opp.limitationsOrQualifications && (
                          <div className="pt-1.5 border-t border-[#eae4d7] text-xs">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block mb-0.5">
                              Limitations &amp; Qualifications:
                            </span>
                            <p className="text-[#5c5447] text-[11px] leading-relaxed">
                              {opp.limitationsOrQualifications}
                            </p>
                          </div>
                        )}

                        {/* Verification Warning / Note */}
                        {opp.verificationNote && !canDirectlyInsertWorkflowA && !isInserted && (
                          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200/90 text-[11px] text-amber-950 flex items-start gap-1.5">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-800 shrink-0 mt-0.5" />
                            <span>{opp.verificationNote}</span>
                          </div>
                        )}

                        {/* Editorial Rationale */}
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

                      {/* WORKFLOW B: Draft / Edit / Approve Research-Backed Passage Panel */}
                      {isDraftEditorOpen && !isInserted && (
                        <div className="p-3 bg-[#faf8f4] border border-amber-300 rounded-xl space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                              <PenTool className="w-3.5 h-3.5 text-amber-800" />
                              <span>Review &amp; Edit Research-Backed Passage</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleGenerateDraftPassageForRec(opp)}
                              disabled={draftingRecId === opp.id}
                              className="text-[11px] font-semibold text-amber-900 hover:underline inline-flex items-center gap-1 cursor-pointer"
                            >
                              {draftingRecId === opp.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  <span>Regenerating...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Regenerate from Study</span>
                                </>
                              )}
                            </button>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#736c61] block">
                              Passage to Insert (Editable — Citation [{opp.proposedCitationNumber || idx + 1}] will be attached):
                            </label>
                            <textarea
                              rows={3}
                              value={currentDraftText}
                              onChange={(e) =>
                                setEditingPassageByRecId((prev) => ({
                                  ...prev,
                                  [opp.id]: e.target.value,
                                }))
                              }
                              placeholder="Write or refine the research-backed sentence grounded in this study..."
                              className="w-full p-2.5 text-xs font-serif bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] leading-relaxed focus:outline-none focus:border-amber-800"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#736c61] block">
                              Insert into Section Heading (Optional — leaves at end of draft if blank):
                            </label>
                            <input
                              type="text"
                              value={currentSectionHeading}
                              onChange={(e) =>
                                setEditingSectionByRecId((prev) => ({
                                  ...prev,
                                  [opp.id]: e.target.value,
                                }))
                              }
                              placeholder="e.g. Why Material Weight Matters"
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a]"
                            />
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleRejectDraftedPassage(opp)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-rose-800 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                            >
                              Reject Draft
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApproveAndInsertDraftedPassage(opp)}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve &amp; Insert Passage + Citation</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Card Actions */}
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#f0ede6] flex-wrap">
                        {opp.targetPassage ? (
                          <button
                            type="button"
                            onClick={() => setViewingLocationOpp(opp)}
                            className="px-2.5 py-1.5 text-xs text-[#5c5447] hover:text-[#1e232a] bg-[#faf8f4] hover:bg-[#f0ede6] border border-[#dcd6ca] rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-amber-900" />
                            <span>Inspect Location</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-[#736c61]">
                            Requires passage approval before citing
                          </span>
                        )}

                        <div className="flex items-center gap-1.5 flex-wrap">
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
                            <>
                              {/* Option to Draft Research Passage (Workflow B) */}
                              {!isDraftEditorOpen && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (opp.proposedPassage) {
                                      setOpenDraftEditorIds((prev) => ({
                                        ...prev,
                                        [opp.id]: true,
                                      }));
                                    } else {
                                      handleGenerateDraftPassageForRec(opp);
                                    }
                                  }}
                                  disabled={draftingRecId === opp.id}
                                  className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  {draftingRecId === opp.id ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      <span>Drafting...</span>
                                    </>
                                  ) : (
                                    <>
                                      <PenTool className="w-3.5 h-3.5 text-amber-900" />
                                      <span>Draft Research Passage</span>
                                    </>
                                  )}
                                </button>
                              )}

                              {/* Workflow A: Direct Citation Insertion (only enabled when verified & unambiguous) */}
                              {!isWorkflowB && (
                                <button
                                  type="button"
                                  onClick={() => handleInsertCitation(opp)}
                                  disabled={!canDirectlyInsertWorkflowA}
                                  title={
                                    canDirectlyInsertWorkflowA
                                      ? 'Insert verified citation into matched sentence'
                                      : opp.verificationNote ||
                                        livePassageCheck?.reason ||
                                        'Direct insertion disabled because passage match or study support is not verified'
                                  }
                                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-amber-900 hover:bg-amber-950 disabled:bg-[#cfc8ba] disabled:text-[#736c61] disabled:cursor-not-allowed rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>
                                    Insert Citation [{opp.proposedCitationNumber || idx + 1}]
                                  </span>
                                </button>
                              )}
                            </>
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
                  Insert verified citation opportunities or approve a research-backed passage from the
                  Opportunities tab to build your References list.
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
                      &ldquo;{gap.claimInArticle}&rdquo;
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
                &ldquo;{viewingLocationOpp.targetPassage}&rdquo;
              </blockquote>
            </div>

            <div className="p-3 bg-[#fbf9f4] border border-[#eee8dc] rounded-xl text-xs space-y-1">
              <div className="font-bold text-[#1e232a]">{viewingLocationOpp.studyTitle}</div>
              <div className="text-[#5c5447]">
                {Array.isArray(viewingLocationOpp.authors)
                  ? viewingLocationOpp.authors.join(', ')
                  : viewingLocationOpp.authors}{' '}
                ({viewingLocationOpp.publicationYear || 'n.d.'})
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
                onClick={() =>
                  handleJumpToEditor(viewingLocationOpp.studyId, viewingLocationOpp.targetPassage)
                }
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

