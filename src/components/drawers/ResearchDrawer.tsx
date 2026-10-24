import React, { useState, useMemo } from 'react';
import {
  X,
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  Search,
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Check,
  ListOrdered,
  Download,
} from 'lucide-react';
import { WritingProject, OutlineItem } from '../../types/project';
import { ResearchStudy, ResearchClaim, ClaimType } from '../../types/research';
import { storage } from '../../services/storage';
import { researchService } from '../../services/researchService';
import { toast } from '../../services/toastService';

interface ResearchDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: WritingProject;
  onUpdateProject: (updated: WritingProject) => void;
  onNavigateToResearchLibrary?: () => void;
  onOpenCitationStudio?: () => void;
}

export const ResearchDrawer: React.FC<ResearchDrawerProps> = ({
  isOpen,
  onClose,
  project,
  onUpdateProject,
  onNavigateToResearchLibrary,
  onOpenCitationStudio,
}) => {
  const [allStudies, setAllStudies] = useState<ResearchStudy[]>(() => storage.getResearchStudies());
  const [searchQuery, setSearchQuery] = useState('');
  const [isAttaching, setIsAttaching] = useState(false);
  const [expandedStudyId, setExpandedStudyId] = useState<string | null>(null);
  const [isBuildingOutline, setIsBuildingOutline] = useState(false);

  if (!isOpen) return null;

  const attachedStudyIds = project.attachedStudyIds || [];
  const selectedClaimIds = project.selectedClaimIds || [];

  const attachedStudies = useMemo(() => {
    return allStudies.filter((s) => attachedStudyIds.includes(s.id));
  }, [allStudies, attachedStudyIds]);

  const unattachedStudies = useMemo(() => {
    return allStudies.filter((s) => !attachedStudyIds.includes(s.id));
  }, [allStudies, attachedStudyIds]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return unattachedStudies;
    const q = searchQuery.toLowerCase();
    return unattachedStudies.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.authors || []).some((a) => a.toLowerCase().includes(q)) ||
        (s.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [unattachedStudies, searchQuery]);

  // Attach a study to current article
  const handleAttachStudy = (studyId: string) => {
    const updatedAttached = [...attachedStudyIds, studyId];
    // Automatically select its source fact claims
    const study = allStudies.find((s) => s.id === studyId);
    const newClaimIds = [...selectedClaimIds];
    if (study && study.claims) {
      study.claims.forEach((c) => {
        if (!newClaimIds.includes(c.id)) {
          newClaimIds.push(c.id);
        }
      });
    }

    onUpdateProject({
      ...project,
      attachedStudyIds: updatedAttached,
      selectedClaimIds: newClaimIds,
    });
    setExpandedStudyId(studyId);
    toast.success('Study Attached', `Attached "${study?.title || 'Study'}" to article context.`);
  };

  // Remove attached study
  const handleRemoveStudy = (studyId: string) => {
    const updatedAttached = attachedStudyIds.filter((id) => id !== studyId);
    const study = allStudies.find((s) => s.id === studyId);
    const studyClaimIds = (study?.claims || []).map((c) => c.id);
    const updatedClaimIds = selectedClaimIds.filter((id) => !studyClaimIds.includes(id));

    // Also remove from outline section assignments
    const updatedOutline = (project.outline || []).map((sec) => ({
      ...sec,
      assignedStudyIds: (sec.assignedStudyIds || []).filter((id) => id !== studyId),
    }));

    onUpdateProject({
      ...project,
      attachedStudyIds: updatedAttached,
      selectedClaimIds: updatedClaimIds,
      outline: updatedOutline,
    });
    toast.success('Study Removed', 'Removed study from article context.');
  };

  // Toggle active claim for this article
  const handleToggleClaim = (claimId: string) => {
    const isSelected = selectedClaimIds.includes(claimId);
    const updatedClaims = isSelected
      ? selectedClaimIds.filter((id) => id !== claimId)
      : [...selectedClaimIds, claimId];

    onUpdateProject({
      ...project,
      selectedClaimIds: updatedClaims,
    });
  };

  // Build Research-Aware Outline
  const handleBuildResearchOutline = async () => {
    if (attachedStudies.length === 0) {
      toast.error('No Studies Attached', 'Attach at least one research study before generating an outline.');
      return;
    }

    setIsBuildingOutline(true);
    try {
      const activeClaims = attachedStudies.flatMap((s) =>
        (s.claims || []).filter((c) => selectedClaimIds.includes(c.id))
      );

      const result = await researchService.buildResearchOutline(
        project,
        attachedStudies,
        activeClaims,
        project.modelOverride
      );

      onUpdateProject({
        ...project,
        outline: result.outline,
      });

      toast.success('Research Outline Built', result.rationale || 'Assigned studies to appropriate sections.');
    } catch (err) {
      toast.error('Outline Generation Failed', 'Could not build research-based outline.');
    } finally {
      setIsBuildingOutline(false);
    }
  };

  // Export Self-Contained Editorial Handoff Package
  const handleExportEditorialPackage = () => {
    const activeClaims = attachedStudies.flatMap((s) =>
      (s.claims || []).filter((c) => selectedClaimIds.includes(c.id))
    );

    const internalLinks = storage.getInternalLinks();
    const pkg = researchService.prepareEditorialPackage(
      project,
      attachedStudies,
      activeClaims,
      internalLinks
    );

    const blob = new Blob([pkg.markdownExport], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(project.title || 'article').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-editorial-package.md`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Package Exported', 'Downloaded complete Markdown editorial package.');
  };

  const getClaimBadge = (type: ClaimType) => {
    switch (type) {
      case 'source_fact':
        return <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-900 border border-blue-200">Fact</span>;
      case 'editorial_interpretation':
        return <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-900 border border-purple-200">Interpretation</span>;
      case 'writing_suggestion':
        return <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-900 border border-emerald-200">Suggestion</span>;
    }
  };

  return (
    <aside className="w-96 border-l border-[#eae4d7] bg-white flex flex-col h-full z-20 shrink-0 text-[#1e232a] shadow-xs">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#eae4d7] bg-[#f7f4ed] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-amber-900" />
          <h2 className="text-sm font-serif font-bold text-[#1e232a]">Article Research Context</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-[#736c61] hover:text-[#1e232a] hover:bg-[#eae4d7] transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Drawer Scroll Area */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Outline Action Banner */}
        <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-950">
            <Sparkles className="w-3.5 h-3.5 text-amber-800" />
            <span>Research-Aware Outline</span>
          </div>
          <p className="text-[11px] text-[#5e5548] leading-relaxed">
            Maps attached studies to relevant sections without forcing artificial citations into narrative transitions.
          </p>
          <button
            type="button"
            onClick={handleBuildResearchOutline}
            disabled={isBuildingOutline || attachedStudies.length === 0}
            className="w-full py-1.5 px-3 text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white rounded-lg shadow-2xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isBuildingOutline ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Building Outline...</span>
              </>
            ) : (
              <>
                <ListOrdered className="w-3.5 h-3.5" />
                <span>Build Research-Based Outline</span>
              </>
            )}
          </button>
        </div>

        {/* Feature: Research Citation Studio Action Banner */}
        {onOpenCitationStudio && (
          <div className="p-3.5 rounded-xl bg-[#faf8f4] border border-[#e2dcd0] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1e232a]">
                <BookOpen className="w-3.5 h-3.5 text-amber-900" />
                <span>Research Citation Studio</span>
              </div>
              {project.citationRecommendations && project.citationRecommendations.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase bg-amber-100 text-amber-950">
                  {project.citationRecommendations.filter((r) => r.status === 'pending').length} available
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#5e5548] leading-relaxed">
              Find empirical claims in your draft that can be verified with numbered in-text citations and automatic APA references.
            </p>
            <button
              type="button"
              onClick={onOpenCitationStudio}
              className="w-full py-1.5 px-3 text-xs font-semibold bg-[#1e232a] hover:bg-[#2d3744] text-white rounded-lg shadow-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>Open Citation Studio</span>
            </button>
          </div>
        )}

        {/* Attached Studies Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#736c61]">
              Attached Studies ({attachedStudies.length})
            </span>
            <button
              type="button"
              onClick={() => setIsAttaching(!isAttaching)}
              className="text-xs font-semibold text-amber-900 hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              <span>Attach Studies</span>
            </button>
          </div>

          {/* Search & Attach Picker */}
          {isAttaching && (
            <div className="p-3 rounded-xl bg-[#faf8f4] border border-[#dcd6ca] space-y-2.5 animate-in fade-in duration-100">
              <div className="relative">
                <Search className="w-3 h-3 text-[#857d72] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Research Library to attach..."
                  className="w-full pl-7 pr-2.5 py-1 text-xs bg-white border border-[#dcd6ca] rounded-md"
                />
              </div>

              <div className="max-h-44 overflow-y-auto space-y-1.5">
                {searchResults.length === 0 ? (
                  <p className="text-[11px] text-[#857d72] text-center py-2">
                    {unattachedStudies.length === 0
                      ? 'All library studies are currently attached.'
                      : 'No unattached studies match search.'}
                  </p>
                ) : (
                  searchResults.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => handleAttachStudy(s.id)}
                      className="p-2 rounded-lg bg-white border border-[#eae4d7] hover:border-amber-700 cursor-pointer flex items-center justify-between text-left transition-colors"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="text-xs font-serif font-semibold text-[#1e232a] truncate">
                          {s.title}
                        </div>
                        <div className="text-[10px] text-[#736c61]">
                          {s.authors?.[0] || 'Unknown'} ({s.publicationYear || 'n.d.'})
                        </div>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-amber-800 shrink-0" />
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Attached Study Cards */}
          {attachedStudies.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-[#cfc8ba] text-center text-xs text-[#736c61] bg-[#faf8f4] space-y-1">
              <BookOpen className="w-6 h-6 text-[#857d72] mx-auto" />
              <p className="font-semibold text-[#1e232a]">No studies attached yet</p>
              <p className="text-[11px]">Click "Attach Studies" above to link empirical papers to this article.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {attachedStudies.map((study) => {
                const isExpanded = expandedStudyId === study.id;
                const studyClaims = study.claims || [];

                return (
                  <div
                    key={study.id}
                    className="p-3 rounded-xl border border-[#dcd6ca] bg-[#faf8f4] hover:border-[#cfc8ba] transition-all space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div
                        onClick={() => setExpandedStudyId(isExpanded ? null : study.id)}
                        className="flex-1 cursor-pointer"
                      >
                        <h4 className="text-xs font-serif font-bold text-[#1e232a] line-clamp-1 hover:text-amber-950">
                          {study.title}
                        </h4>
                        <div className="text-[10px] text-[#736c61]">
                          {study.authors?.[0] || 'Author'} ({study.publicationYear || 'n.d.'}) •{' '}
                          {studyClaims.length} Claims
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setExpandedStudyId(isExpanded ? null : study.id)}
                          className="p-1 text-[#736c61] hover:text-[#1e232a]"
                        >
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveStudy(study.id)}
                          className="p-1 text-[#857d72] hover:text-rose-700"
                          title="Remove from Article"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Study Details: Key Findings & Claims Selection */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-[#eae4d7] space-y-2 text-xs animate-in fade-in duration-100">
                        {/* Findings summary */}
                        {study.analysis?.whatTheStudyFound && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                              Key Finding:
                            </span>
                            <p className="text-[11px] text-[#403a31] font-serif leading-relaxed italic bg-white p-2 rounded-md border border-[#eae4d7]">
                              "{study.analysis.whatTheStudyFound[0]}"
                            </p>
                          </div>
                        )}

                        {/* Claims Checkboxes */}
                        {studyClaims.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                              Selected Article Claims ({studyClaims.filter((c) => selectedClaimIds.includes(c.id)).length} of {studyClaims.length}):
                            </span>

                            <div className="space-y-1">
                              {studyClaims.map((claim) => {
                                const isChecked = selectedClaimIds.includes(claim.id);
                                return (
                                  <label
                                    key={claim.id}
                                    className={`flex items-start gap-2 p-1.5 rounded-md border text-[11px] cursor-pointer transition-colors ${
                                      isChecked
                                        ? 'bg-amber-50/80 border-amber-300 text-[#1e232a]'
                                        : 'bg-white border-[#eae4d7] text-[#736c61]'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handleToggleClaim(claim.id)}
                                      className="mt-0.5 rounded text-amber-900 focus:ring-amber-800"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        {getClaimBadge(claim.claimType)}
                                      </div>
                                      <span className="leading-snug">{claim.claimText}</span>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 3: Package Export */}
        {attachedStudies.length > 0 && (
          <div className="pt-2 border-t border-[#eae4d7]">
            <button
              type="button"
              onClick={handleExportEditorialPackage}
              className="w-full py-2 px-3 text-xs font-semibold bg-[#faf8f4] hover:bg-[#f0ede6] text-[#2b251d] border border-[#dcd6ca] rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-amber-900" />
              <span>Export Full Editorial Package (MD)</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
