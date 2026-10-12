/**
 * Science of Gifts - Editorial Development Drawer
 * Connects the Idea Generator to a structured editorial-development workflow:
 * 1. IDEA -> 2. GENERATE 5 ANGLES -> 3. EDITORIAL DIRECTION -> 4. EDITORIAL BRIEF -> (OUTLINE in future phase)
 */

import React, { useState } from 'react';
import {
  WritingProject,
  EditorialAngle,
  EditorialDirection,
  StructuredEditorialBrief,
  EditorialDevelopment,
  AngleRole,
} from '../../types/project';
import { EditorialIdea } from '../../types/ideaGenerator';
import { geminiService } from '../../services/geminiClient';
import { storage } from '../../services/storage';
import { toast } from '../../services/toastService';
import { createVersionSnapshot } from '../../services/versionHistoryService';
import {
  Compass,
  X,
  Sparkles,
  Layers,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Check,
  Copy,
  RotateCw,
  Loader2,
  FileText,
  Sliders,
  Bookmark,
  BookOpen,
  Link2,
  Edit3,
  ShieldCheck,
  Tag,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';

interface EditorialDevelopmentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  project: WritingProject;
  onChange: (updatedProject: WritingProject) => void;
  onOpenOutline?: () => void;
}

type WorkflowStep = 'idea' | 'angles' | 'direction' | 'brief';

export const EditorialDevelopmentDrawer: React.FC<EditorialDevelopmentDrawerProps> = ({
  isOpen,
  onClose,
  project,
  onChange,
  onOpenOutline,
}) => {
  // Initialize workflow state from project or defaults
  const currentDev: EditorialDevelopment = project.editorialDevelopment || {
    originalIdea: {
      id: `idea-${Date.now()}`,
      title: project.title || 'Untitled Article',
      angle: project.brief?.purpose || project.articleMeta?.standfirst || '',
      whyInteresting: project.brief?.keyPoints?.[0] || 'Explores material craft and recipient psychology.',
      searchIntent: project.articleMeta?.searchIntent || 'Editorial insight & advice',
    },
    angles: [],
    direction: {
      briefMentionAngleIds: [],
      doNotUseAngleIds: [],
      editorsDirection: project.projectInstructions || '',
    },
    status: 'idea',
  };

  // Determine active step based on state
  const determineInitialStep = (): WorkflowStep => {
    if (currentDev.brief) return 'brief';
    if (currentDev.direction?.primaryAngleId || (currentDev.angles && currentDev.angles.some(a => a.role !== 'unassigned'))) return 'direction';
    if (currentDev.angles && currentDev.angles.length > 0) return 'angles';
    return 'idea';
  };

  const [activeStep, setActiveStep] = useState<WorkflowStep>(determineInitialStep);

  // Idea state
  const [ideaTitle, setIdeaTitle] = useState(currentDev.originalIdea?.title || project.title || '');
  const [ideaAngle, setIdeaAngle] = useState(currentDev.originalIdea?.angle || '');
  const [ideaWhy, setIdeaWhy] = useState(currentDev.originalIdea?.whyInteresting || '');
  const [ideaSearchIntent, setIdeaSearchIntent] = useState(currentDev.originalIdea?.searchIntent || '');

  // Angles & Direction state
  const [isGeneratingAngles, setIsGeneratingAngles] = useState(false);
  const [proposedAngles, setProposedAngles] = useState<EditorialAngle[] | null>(null);
  const [editorsDirection, setEditorsDirection] = useState(currentDev.direction?.editorsDirection || '');

  // Brief state
  const [isCreatingBrief, setIsCreatingBrief] = useState(false);
  const [proposedBrief, setProposedBrief] = useState<StructuredEditorialBrief | null>(null);
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [editableBrief, setEditableBrief] = useState<StructuredEditorialBrief | null>(currentDev.brief || null);
  const [copiedBrief, setCopiedBrief] = useState(false);

  if (!isOpen) return null;

  // Attached context summaries
  const attachedStudies = (project.attachedStudyIds || [])
    .map((id) => storage.getResearchStudy(id))
    .filter(Boolean);
  const internalLinks = storage.getInternalLinks();
  const styleProfile = project.styleProfileId
    ? storage.getStyleProfile(project.styleProfileId)
    : undefined;

  // Helper to persist workflow state into project
  const saveDevelopment = (
    updatedDev: Partial<EditorialDevelopment>,
    statusOverride?: 'idea' | 'angles_generated' | 'direction_set' | 'brief_ready'
  ) => {
    const nextStatus = statusOverride || updatedDev.status || currentDev.status;
    const merged: EditorialDevelopment = {
      ...currentDev,
      ...updatedDev,
      status: nextStatus,
      lastGeneratedAt: new Date().toISOString(),
    };

    onChange({
      ...project,
      editorialDevelopment: merged,
      updatedAt: new Date().toISOString(),
    });
  };

  // -------------------------------------------------------------------------
  // 1. GENERATE 5 ANGLES
  // -------------------------------------------------------------------------
  const handleGenerateAngles = async () => {
    setIsGeneratingAngles(true);
    try {
      const ideaPayload: EditorialIdea = {
        id: currentDev.originalIdea?.id || `idea-${Date.now()}`,
        title: ideaTitle.trim() || project.title,
        angle: ideaAngle.trim() || project.brief?.purpose || '',
        whyInteresting: ideaWhy.trim() || '',
        searchIntent: ideaSearchIntent.trim() || '',
      };

      const res = await geminiService.generateEditorialAngles(project, {
        idea: ideaPayload,
        modelOverride: project.modelOverride,
      });

      if (res.ok && res.angles && res.angles.length > 0) {
        // If angles already exist, stage them for review to prevent silent overwriting
        if (currentDev.angles && currentDev.angles.length > 0) {
          setProposedAngles(res.angles);
          toast.info('New Angles Proposed', 'Review the 5 newly formulated angles below.');
        } else {
          // First generation: accept directly and advance to Angles stage
          saveDevelopment({
            originalIdea: ideaPayload,
            angles: res.angles,
            status: 'angles_generated',
          });
          setActiveStep('angles');
          toast.success('5 Editorial Angles Generated', 'Assign editorial roles to shape the article direction.');
        }
      } else {
        toast.error('Generation Failed', res.error || 'Could not generate angles.');
      }
    } catch (err: any) {
      console.error('Error generating angles:', err);
      toast.error('Error', 'Failed to generate editorial angles.');
    } finally {
      setIsGeneratingAngles(false);
    }
  };

  // Accept proposed angles after review
  const handleAcceptProposedAngles = () => {
    if (!proposedAngles) return;
    const historySnapshot = createVersionSnapshot(project, 'before_ai_edit', {
      label: 'Regenerate Editorial Angles',
    });

    saveDevelopment({
      angles: proposedAngles,
      direction: {
        ...currentDev.direction,
        primaryAngleId: undefined,
        secondaryAngleId: undefined,
        briefMentionAngleIds: [],
        doNotUseAngleIds: [],
      },
      status: 'angles_generated',
    });

    onChange({
      ...project,
      versionHistory: historySnapshot,
      editorialDevelopment: {
        ...currentDev,
        angles: proposedAngles,
        direction: {
          ...currentDev.direction,
          primaryAngleId: undefined,
          secondaryAngleId: undefined,
          briefMentionAngleIds: [],
          doNotUseAngleIds: [],
        },
        status: 'angles_generated',
      },
    });

    setProposedAngles(null);
    setActiveStep('angles');
    toast.success('Angles Updated', 'Previous angles archived in Version History.');
  };

  // -------------------------------------------------------------------------
  // 2. ASSIGN ANGLE EDITORIAL ROLES
  // -------------------------------------------------------------------------
  const handleAssignRole = (angleId: string, role: AngleRole) => {
    const currentAngles = currentDev.angles || [];
    let updatedPrimary = currentDev.direction?.primaryAngleId;
    let updatedSecondary = currentDev.direction?.secondaryAngleId;
    let briefMentions = new Set(currentDev.direction?.briefMentionAngleIds || []);
    let doNotUse = new Set(currentDev.direction?.doNotUseAngleIds || []);

    const updatedAngles = currentAngles.map((angle) => {
      if (angle.id === angleId) {
        // If clicking the current role again, toggle to unassigned
        const newRole = angle.role === role ? 'unassigned' : role;

        // Clean up from lists
        if (updatedPrimary === angleId) updatedPrimary = undefined;
        if (updatedSecondary === angleId) updatedSecondary = undefined;
        briefMentions.delete(angleId);
        doNotUse.delete(angleId);

        // Assign to new role
        if (newRole === 'primary') updatedPrimary = angleId;
        if (newRole === 'secondary') updatedSecondary = angleId;
        if (newRole === 'brief_mention') briefMentions.add(angleId);
        if (newRole === 'do_not_use') doNotUse.add(angleId);

        return { ...angle, role: newRole };
      }

      // If user sets a new primary, demote the old primary
      if (role === 'primary' && angle.role === 'primary' && angle.id !== angleId) {
        return { ...angle, role: 'unassigned' as AngleRole };
      }

      // If user sets a new secondary, demote the old secondary
      if (role === 'secondary' && angle.role === 'secondary' && angle.id !== angleId) {
        return { ...angle, role: 'unassigned' as AngleRole };
      }

      return angle;
    });

    const updatedDirection: EditorialDirection = {
      ...currentDev.direction,
      primaryAngleId: updatedPrimary,
      secondaryAngleId: updatedSecondary,
      briefMentionAngleIds: Array.from(briefMentions),
      doNotUseAngleIds: Array.from(doNotUse),
      editorsDirection,
    };

    saveDevelopment({
      angles: updatedAngles,
      direction: updatedDirection,
      status: updatedPrimary ? 'direction_set' : 'angles_generated',
    });
  };

  // -------------------------------------------------------------------------
  // 3. EDITORIAL DIRECTION UPDATE
  // -------------------------------------------------------------------------
  const handleUpdateEditorsDirection = (newText: string) => {
    setEditorsDirection(newText);
    const updatedDirection: EditorialDirection = {
      ...currentDev.direction,
      editorsDirection: newText,
    };
    saveDevelopment({ direction: updatedDirection });
  };

  // -------------------------------------------------------------------------
  // 4. CREATE EDITORIAL BRIEF
  // -------------------------------------------------------------------------
  const handleCreateBrief = async () => {
    setIsCreatingBrief(true);
    try {
      const activeAngles = currentDev.angles || [];
      const activeDirection = {
        ...currentDev.direction,
        editorsDirection,
      };

      const res = await geminiService.createEditorialBrief(
        project,
        activeDirection,
        activeAngles,
        {
          idea: currentDev.originalIdea,
          modelOverride: project.modelOverride,
        }
      );

      if (res.ok && res.brief) {
        // If an existing brief exists, show for review before replacing
        if (currentDev.brief) {
          setProposedBrief(res.brief);
          toast.info('New Brief Generated', 'Inspect the synthesized brief below.');
        } else {
          // Direct apply
          applyBriefToProject(res.brief);
          setActiveStep('brief');
          toast.success('Editorial Brief Synthesized', 'Structured brief ready for editorial development.');
        }
      } else {
        toast.error('Synthesis Failed', res.error || 'Could not synthesize brief.');
      }
    } catch (err: any) {
      console.error('Error creating editorial brief:', err);
      toast.error('Error', 'Failed to create editorial brief.');
    } finally {
      setIsCreatingBrief(false);
    }
  };

  // Apply brief to project & sync with project.brief and version history
  const applyBriefToProject = (briefToApply: StructuredEditorialBrief) => {
    const historySnapshot = createVersionSnapshot(project, 'before_ai_edit', {
      label: 'Synthesized Editorial Brief',
    });

    // Map into project.brief for seamless studio integration
    const syncedProjectBrief = {
      purpose: briefToApply.centralArgument || project.brief?.purpose || '',
      audience: briefToApply.audience || project.brief?.audience || '',
      readerLearns: briefToApply.primaryAngle || project.brief?.readerLearns || '',
      readerFeels: 'Perceptive, illuminated, and confident in authentic craft over marketing hype.',
      readerAction: briefToApply.suggestedTakeaway || project.brief?.readerAction || '',
      keyPoints: [
        `Central Thesis: ${briefToApply.centralArgument}`,
        ...(briefToApply.keyQuestions || []).slice(0, 3).map((q) => `Key Question: ${q}`),
        ...(briefToApply.secondaryFocus ? [`Supporting Focus: ${briefToApply.secondaryFocus}`] : []),
      ],
      thingsToAvoid: [
        ...(briefToApply.thingsToAvoid || []),
        'Generic affiliate listicles',
        'Shallow superlatives without material evidence',
      ],
    };

    const updatedDev: EditorialDevelopment = {
      ...currentDev,
      brief: briefToApply,
      status: 'brief_ready',
    };

    setEditableBrief(briefToApply);
    setProposedBrief(null);

    onChange({
      ...project,
      title: briefToApply.workingTitle || project.title,
      brief: syncedProjectBrief,
      articleMeta: {
        ...(project.articleMeta || {
          slug: '',
          seoTitle: '',
          metaDescription: '',
          standfirst: '',
          targetKeyword: '',
          secondaryKeywords: [],
          audience: '',
          searchIntent: '',
        }),
        standfirst: briefToApply.primaryAngle || project.articleMeta?.standfirst || '',
        audience: briefToApply.audience || project.articleMeta?.audience || '',
        searchIntent: briefToApply.searchIntent || project.articleMeta?.searchIntent || '',
      },
      editorialDevelopment: updatedDev,
      versionHistory: historySnapshot,
      updatedAt: new Date().toISOString(),
    });
  };

  // Copy brief as markdown
  const handleCopyBriefMarkdown = () => {
    const brief = editableBrief || currentDev.brief;
    if (!brief) return;

    const md = `# EDITORIAL BRIEF: ${brief.workingTitle}
**Topic:** ${brief.topic}
**Audience:** ${brief.audience}
**Search Intent:** ${brief.searchIntent}

## PRIMARY EDITORIAL ANGLE
${brief.primaryAngle}

${brief.secondaryFocus ? `## SECONDARY FOCUS\n${brief.secondaryFocus}\n` : ''}
${brief.briefMentions && brief.briefMentions.length > 0 ? `## BRIEF MENTIONS\n${brief.briefMentions.map(m => `- ${m}`).join('\n')}\n` : ''}
${brief.thingsToAvoid && brief.thingsToAvoid.length > 0 ? `## THINGS TO AVOID / DO NOT PURSUE\n${brief.thingsToAvoid.map(a => `- ${a}`).join('\n')}\n` : ''}
## CENTRAL ARGUMENT
${brief.centralArgument}

## KEY QUESTIONS THE ARTICLE MUST ANSWER
${(brief.keyQuestions || []).map((q, i) => `${i + 1}. ${q}`).join('\n')}

## EDITOR'S DIRECTION
${brief.editorialDirection}

## SUGGESTED TAKEAWAY
${brief.suggestedTakeaway}

${brief.factualContext && brief.factualContext.length > 0 ? `## FACTUAL / RESEARCH-BASED CONTEXT\n${brief.factualContext.map(f => `- ${f}`).join('\n')}\n` : ''}
${brief.editorialInterpretation && brief.editorialInterpretation.length > 0 ? `## EDITORIAL INTERPRETATION\n${brief.editorialInterpretation.map(e => `- ${e}`).join('\n')}\n` : ''}
${brief.internalLinkOpportunities && brief.internalLinkOpportunities.length > 0 ? `## INTERNAL LINK OPPORTUNITIES\n${brief.internalLinkOpportunities.map(l => `- ${l}`).join('\n')}\n` : ''}
${brief.styleConsiderations ? `## STYLE CONSIDERATIONS\n${brief.styleConsiderations}\n` : ''}`;

    navigator.clipboard.writeText(md);
    setCopiedBrief(true);
    toast.success('Brief Copied', 'Editorial brief copied to clipboard as structured Markdown.');
    setTimeout(() => setCopiedBrief(false), 2000);
  };

  // Role badge helper
  const getRoleBadge = (role: AngleRole) => {
    switch (role) {
      case 'primary':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-[#1e232a] text-[#f7f5ef] shadow-2xs inline-flex items-center gap-1">
            <Check className="w-3 h-3 text-amber-300" />
            Primary Angle
          </span>
        );
      case 'secondary':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs inline-flex items-center gap-1">
            <Check className="w-3 h-3 text-amber-800" />
            Secondary Focus
          </span>
        );
      case 'brief_mention':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-blue-50 text-blue-950 border border-blue-200 inline-flex items-center gap-1">
            Brief Mention
          </span>
        );
      case 'do_not_use':
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-stone-200 text-stone-700 line-through decoration-rose-500 inline-flex items-center gap-1">
            Do Not Use
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium text-[#736c61] bg-[#f0ece1]">
            Unassigned
          </span>
        );
    }
  };

  return (
    <div className="max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full w-full md:w-[520px] lg:w-[580px] xl:w-[660px] md:max-w-[50vw] min-w-0 flex-shrink h-full bg-[#faf9f6] md:border-l border-[#dcd6ca] flex flex-col overflow-hidden animate-in slide-in-from-right-1 duration-150 z-30 shadow-xl">
      {/* Drawer Masthead */}
      <div className="p-4 sm:p-5 border-b border-[#e5dfd3] bg-[#f6f3eb] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#1e232a] flex items-center justify-center text-amber-300 shadow-2xs shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-editorial text-lg font-bold text-[#1e232a] truncate">
                Editorial Development
              </h3>
              <span className="px-1.5 py-0.5 rounded-xs text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                Phase 10.6
              </span>
            </div>
            <p className="text-xs text-[#736c61] truncate">
              Idea → 5 Angles → Editorial Direction → Editorial Brief
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#736c61] hover:text-[#2d333b] rounded-lg hover:bg-[#eae4d7] transition-colors shrink-0 cursor-pointer"
          title="Close Editorial Development"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Workflow Step Progress Bar */}
      <div className="px-4 sm:px-6 py-2.5 bg-[#f0ede4] border-b border-[#e2dcce] flex items-center justify-between gap-1 text-xs shrink-0 overflow-x-auto">
        {/* Step 1: Idea */}
        <button
          type="button"
          onClick={() => setActiveStep('idea')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition-colors shrink-0 ${
            activeStep === 'idea'
              ? 'bg-[#1e232a] text-white shadow-2xs'
              : 'text-[#5c5447] hover:bg-[#e4ded0]'
          }`}
        >
          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">1</span>
          <span>Idea</span>
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-[#b0a797] shrink-0" />

        {/* Step 2: 5 Angles */}
        <button
          type="button"
          onClick={() => setActiveStep('angles')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition-colors shrink-0 ${
            activeStep === 'angles'
              ? 'bg-[#1e232a] text-white shadow-2xs'
              : 'text-[#5c5447] hover:bg-[#e4ded0]'
          }`}
        >
          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">2</span>
          <span>5 Angles</span>
          {currentDev.angles && currentDev.angles.length > 0 && (
            <span className="text-[10px] text-amber-300 font-bold">({currentDev.angles.length})</span>
          )}
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-[#b0a797] shrink-0" />

        {/* Step 3: Direction */}
        <button
          type="button"
          onClick={() => setActiveStep('direction')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition-colors shrink-0 ${
            activeStep === 'direction'
              ? 'bg-[#1e232a] text-white shadow-2xs'
              : 'text-[#5c5447] hover:bg-[#e4ded0]'
          }`}
        >
          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">3</span>
          <span>Direction</span>
          {currentDev.direction?.primaryAngleId && (
            <Check className="w-3 h-3 text-emerald-600" />
          )}
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-[#b0a797] shrink-0" />

        {/* Step 4: Editorial Brief */}
        <button
          type="button"
          onClick={() => setActiveStep('brief')}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition-colors shrink-0 ${
            activeStep === 'brief'
              ? 'bg-[#1e232a] text-white shadow-2xs'
              : 'text-[#5c5447] hover:bg-[#e4ded0]'
          }`}
        >
          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">4</span>
          <span>Brief</span>
          {currentDev.brief && (
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          )}
        </button>
        <ChevronRight className="w-3.5 h-3.5 text-[#b0a797] shrink-0" />

        {/* Step 5: Outline (Outline Studio) */}
        <button
          type="button"
          onClick={() => {
            if (onOpenOutline) {
              onClose();
              onOpenOutline();
            }
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md font-semibold transition-colors shrink-0 text-[#5c5447] hover:bg-[#e4ded0] cursor-pointer"
          title="Open Outline Studio"
        >
          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">5</span>
          <span>Outline Studio</span>
          {project.outline && project.outline.length > 0 ? (
            <span className="text-[10px] text-blue-900 font-bold">({project.outline.length})</span>
          ) : (
            <ArrowRight className="w-3 h-3 text-[#736c61]" />
          )}
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 p-3.5 sm:p-6 space-y-5 sm:space-y-6">

        {/* ================================================================= */}
        {/* STEP 1: IDEA                                                      */}
        {/* ================================================================= */}
        {activeStep === 'idea' && (
          <div className="space-y-5 animate-in fade-in duration-100 min-w-0">
            <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 flex items-start gap-3 min-w-0">
              <Compass className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-950 min-w-0">
                <p className="font-semibold text-sm mb-0.5">Originating Concept</p>
                <p className="text-amber-900/90 leading-relaxed">
                  Every Science of Gifts article begins with an idea. Review and calibrate the core concept below before exploring 5 genuinely different editorial approaches.
                </p>
              </div>
            </div>

            {/* Editable Idea Fields */}
            <div className="space-y-4 bg-white border border-[#dcd6ca] rounded-xl p-4 sm:p-5 shadow-2xs min-w-0">
              <div>
                <label className="block text-xs font-bold text-[#443d34] uppercase tracking-wider mb-1">
                  Article Working Title
                </label>
                <input
                  type="text"
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  placeholder="e.g. The Quiet Longevity of Mechanical Field Watches"
                  className="w-full px-3 py-2 text-sm font-semibold rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500 text-[#1e232a]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#443d34] uppercase tracking-wider mb-1">
                  Core Premise / Angle
                </label>
                <textarea
                  rows={2}
                  value={ideaAngle}
                  onChange={(e) => setIdeaAngle(e.target.value)}
                  placeholder="e.g. Why utilitarian tools that require daily manual winding foster greater emotional permanence than smart devices..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500 text-[#1e232a]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#f0ede6]">
                <div>
                  <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
                    Why It's Engaging / Intellectual Hook
                  </label>
                  <textarea
                    rows={2}
                    value={ideaWhy}
                    onChange={(e) => setIdeaWhy(e.target.value)}
                    placeholder="e.g. Inverts the obsession with frictionless ease by celebrating tactile participation..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500 text-[#1e232a]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
                    Search Intent / Reader Goal
                  </label>
                  <textarea
                    rows={2}
                    value={ideaSearchIntent}
                    onChange={(e) => setIdeaSearchIntent(e.target.value)}
                    placeholder="e.g. Cultural & Psychological Insight for Discerning Buyers"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500 text-[#1e232a]"
                  />
                </div>
              </div>
            </div>

            {/* Generate Action Button */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 min-w-0">
              <div className="text-xs text-[#736c61] min-w-0">
                {currentDev.angles && currentDev.angles.length > 0 ? (
                  <span>Currently {currentDev.angles.length} angles configured. You can regenerate to explore fresh perspectives.</span>
                ) : (
                  <span>Click to formulate 5 distinct editorial approaches.</span>
                )}
              </div>
              <button
                type="button"
                onClick={handleGenerateAngles}
                disabled={isGeneratingAngles || !ideaTitle.trim()}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-[#1e232a] hover:bg-[#2d3744] transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isGeneratingAngles ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    <span>Analyzing & Formulating 5 Angles...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>{currentDev.angles && currentDev.angles.length > 0 ? 'Regenerate 5 Angles' : 'Generate 5 Editorial Angles'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 2: 5 EDITORIAL ANGLES                                        */}
        {/* ================================================================= */}
        {activeStep === 'angles' && (
          <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-100 min-w-0">
            {/* Header / Notice */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-[#f6f3eb] border border-[#e5dfd3] p-3.5 rounded-xl min-w-0">
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#1e232a]">
                  Assign Editorial Roles
                </h4>
                <p className="text-xs text-[#736c61] leading-relaxed">
                  Designate 1 Primary angle, optional Secondary focus, Brief Mentions, or Do Not Use.
                </p>
              </div>
              <button
                type="button"
                onClick={handleGenerateAngles}
                disabled={isGeneratingAngles}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-[#dcd6ca] bg-white hover:bg-[#ede8dc] text-[#2b251d] transition-colors inline-flex items-center gap-1.5 shadow-2xs self-start sm:self-auto cursor-pointer shrink-0"
                title="Generate fresh alternative angles"
              >
                {isGeneratingAngles ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-800" />
                ) : (
                  <RotateCw className="w-3.5 h-3.5 text-amber-800" />
                )}
                <span>Regenerate Angles</span>
              </button>
            </div>

            {/* Proposed Angles Review Banner (When AI regenerates) */}
            {proposedAngles && (
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-3 animate-in zoom-in-95 duration-100">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-xs text-amber-950 uppercase tracking-wide">
                      Review Proposed Angles
                    </h5>
                    <p className="text-xs text-amber-900 mt-0.5">
                      The AI formulated 5 new editorial approaches. Accept to replace current angles (previous decisions will be archived in Version History), or keep your existing set.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAcceptProposedAngles}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1e232a] text-white hover:bg-[#2d3744] transition-colors cursor-pointer"
                  >
                    Accept New 5 Angles
                  </button>
                  <button
                    type="button"
                    onClick={() => setProposedAngles(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#dcd6ca] text-[#4a443b] hover:bg-[#ede8dc] transition-colors cursor-pointer"
                  >
                    Keep Existing Angles
                  </button>
                </div>
              </div>
            )}

            {/* Angles List */}
            {(!currentDev.angles || currentDev.angles.length === 0) ? (
              <div className="text-center py-10 border-2 border-dashed border-[#dcd6ca] rounded-xl p-6 bg-white/60">
                <Compass className="w-8 h-8 text-[#a89f91] mx-auto mb-2" />
                <h5 className="font-editorial text-base font-semibold text-[#1e232a]">No Angles Generated Yet</h5>
                <p className="text-xs text-[#736c61] max-w-sm mx-auto mt-1 mb-4">
                  Generate 5 distinct editorial approaches from the originating idea to discover the best ways this article could be framed.
                </p>
                <button
                  type="button"
                  onClick={handleGenerateAngles}
                  disabled={isGeneratingAngles}
                  className="px-4 py-2 rounded-lg bg-[#1e232a] text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#2d3744] transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Generate 5 Angles Now</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4 min-w-0">
                {currentDev.angles.map((angle, index) => (
                  <div
                    key={angle.id}
                    className={`bg-white border rounded-xl p-3.5 sm:p-5 transition-all shadow-2xs min-w-0 break-words ${
                      angle.role === 'primary'
                        ? 'border-[#1e232a] ring-2 ring-[#1e232a]/10 bg-[#faf8f4]'
                        : angle.role === 'secondary'
                        ? 'border-amber-400 bg-amber-50/20'
                        : angle.role === 'brief_mention'
                        ? 'border-blue-200 bg-blue-50/10'
                        : angle.role === 'do_not_use'
                        ? 'border-stone-300 bg-stone-50/80 opacity-75'
                        : 'border-[#dcd6ca]'
                    }`}
                  >
                    {/* Header Row: Title & Current Badge */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2.5 min-w-0">
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className="w-5 h-5 rounded-md bg-[#eae4d7] text-[#5c5447] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        <h5 className="font-editorial text-base font-bold text-[#1e232a] leading-tight min-w-0 break-words">
                          {angle.title}
                        </h5>
                      </div>
                      <div className="shrink-0 self-start">
                        {getRoleBadge(angle.role)}
                      </div>
                    </div>

                    {/* Content Fields */}
                    <div className="space-y-2 text-xs mb-3.5 pl-0 sm:pl-7 min-w-0 break-words">
                      <div className="min-w-0">
                        <span className="font-bold text-[#443d34]">Core Argument: </span>
                        <span className="text-[#2b251d] leading-relaxed">{angle.coreArgument}</span>
                      </div>

                      {angle.whyInteresting && (
                        <div className="min-w-0">
                          <span className="font-bold text-amber-900">Why It's Engaging: </span>
                          <span className="text-[#5c5447] italic">{angle.whyInteresting}</span>
                        </div>
                      )}

                      {angle.whatArticleEmphasizes && (
                        <div className="min-w-0">
                          <span className="font-bold text-[#5c5447]">Emphasizes: </span>
                          <span className="text-[#5c5447]">{angle.whatArticleEmphasizes}</span>
                        </div>
                      )}

                      {angle.possibleTakeaway && (
                        <div className="min-w-0">
                          <span className="font-bold text-emerald-900">Possible Takeaway: </span>
                          <span className="text-[#2e4d3a]">{angle.possibleTakeaway}</span>
                        </div>
                      )}
                    </div>

                    {/* Role Selection Button Group */}
                    <div className="pt-3 border-t border-[#f0ede6] flex items-center justify-between gap-2 flex-wrap pl-0 sm:pl-7 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        {/* Primary Button */}
                        <button
                          type="button"
                          onClick={() => handleAssignRole(angle.id, 'primary')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                            angle.role === 'primary'
                              ? 'bg-[#1e232a] text-white shadow-2xs'
                              : 'bg-white border border-[#dcd6ca] text-[#4a443b] hover:bg-[#eae4d7]'
                          }`}
                          title="Set as central argument of the article (Max 1)"
                        >
                          Primary
                        </button>

                        {/* Secondary Button */}
                        <button
                          type="button"
                          onClick={() => handleAssignRole(angle.id, 'secondary')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                            angle.role === 'secondary'
                              ? 'bg-amber-800 text-white shadow-2xs'
                              : 'bg-white border border-[#dcd6ca] text-[#4a443b] hover:bg-[#eae4d7]'
                          }`}
                          title="Set as supporting angle (0 or 1)"
                        >
                          Secondary
                        </button>

                        {/* Brief Mention Button */}
                        <button
                          type="button"
                          onClick={() => handleAssignRole(angle.id, 'brief_mention')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                            angle.role === 'brief_mention'
                              ? 'bg-blue-800 text-white shadow-2xs'
                              : 'bg-white border border-[#dcd6ca] text-[#4a443b] hover:bg-[#eae4d7]'
                          }`}
                          title="Touch on briefly in passing"
                        >
                          Brief Mention
                        </button>

                        {/* Do Not Use Button */}
                        <button
                          type="button"
                          onClick={() => handleAssignRole(angle.id, 'do_not_use')}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                            angle.role === 'do_not_use'
                              ? 'bg-stone-600 text-white shadow-2xs'
                              : 'bg-white border border-[#dcd6ca] text-[#736c61] hover:bg-[#eae4d7]'
                          }`}
                          title="Explicitly exclude this angle"
                        >
                          Do Not Use
                        </button>
                      </div>

                      {angle.role !== 'unassigned' && (
                        <button
                          type="button"
                          onClick={() => handleAssignRole(angle.id, 'unassigned')}
                          className="text-[11px] text-[#8a8275] hover:text-[#1e232a] underline cursor-pointer shrink-0"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Bottom Step Advance */}
                <div className="pt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setActiveStep('direction')}
                    className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#1e232a] text-white hover:bg-[#2d3744] transition-colors inline-flex items-center gap-2 shadow-2xs cursor-pointer"
                  >
                    <span>Proceed to Editorial Direction</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 3: EDITORIAL DIRECTION                                       */}
        {/* ================================================================= */}
        {activeStep === 'direction' && (
          <div className="space-y-5 animate-in fade-in duration-100">
            {/* Direction Explainer */}
            <div className="bg-[#f6f3eb] border border-[#e5dfd3] p-4 rounded-xl flex items-start gap-3">
              <Compass className="w-5 h-5 text-amber-900 shrink-0 mt-0.5" />
              <div className="text-xs text-[#3a342c]">
                <h5 className="font-bold text-sm mb-0.5">Editorial Direction & Oversight</h5>
                <p className="text-[#5c5447] leading-relaxed">
                  Review the assembled editorial roles below and add your own specific instructions. Your manual editorial direction takes sovereign precedence over all AI suggestions.
                </p>
              </div>
            </div>

            {/* Roles Summary Cards */}
            <div className="space-y-3.5">
              {/* Primary Angle Summary */}
              <div className="bg-white border border-[#1e232a] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#1e232a]">
                    Primary Angle (Central Pillar)
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveStep('angles')}
                    className="text-[11px] text-amber-900 hover:underline font-semibold"
                  >
                    Change Angle
                  </button>
                </div>
                {(() => {
                  const pAngle = (currentDev.angles || []).find(
                    (a) => a.id === currentDev.direction?.primaryAngleId || a.role === 'primary'
                  );
                  if (pAngle) {
                    return (
                      <div>
                        <h6 className="font-editorial text-sm font-bold text-[#1e232a]">
                          {pAngle.title}
                        </h6>
                        <p className="text-xs text-[#4a443b] mt-1 leading-relaxed">
                          {pAngle.coreArgument}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="text-xs text-amber-800 italic bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                      No Primary Angle assigned yet. Return to Step 2 to select one, or describe your central argument manually below.
                    </div>
                  );
                })()}
              </div>

              {/* Secondary Focus Summary */}
              <div className="bg-white border border-[#dcd6ca] rounded-xl p-4 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                    Secondary Focus (Supporting Layer)
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveStep('angles')}
                    className="text-[11px] text-amber-900 hover:underline font-semibold"
                  >
                    Adjust
                  </button>
                </div>
                {(() => {
                  const sAngle = (currentDev.angles || []).find(
                    (a) => a.id === currentDev.direction?.secondaryAngleId || a.role === 'secondary'
                  );
                  if (sAngle) {
                    return (
                      <div>
                        <h6 className="font-editorial text-sm font-semibold text-[#1e232a]">
                          {sAngle.title}
                        </h6>
                        <p className="text-xs text-[#5c5447] mt-1 leading-relaxed">
                          {sAngle.coreArgument}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <span className="text-xs text-[#8c8477] italic">
                      None assigned (Optional supporting angle).
                    </span>
                  );
                })()}
              </div>

              {/* Brief Mentions & Exclusions Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Brief Mentions */}
                <div className="bg-white border border-[#dcd6ca] rounded-xl p-3.5 shadow-2xs">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-blue-900 mb-1.5">
                    Brief Mentions
                  </span>
                  {(() => {
                    const mentions = (currentDev.angles || []).filter(
                      (a) => (currentDev.direction?.briefMentionAngleIds || []).includes(a.id) || a.role === 'brief_mention'
                    );
                    if (mentions.length > 0) {
                      return (
                        <div className="space-y-1.5">
                          {mentions.map((m) => (
                            <div key={m.id} className="text-xs text-[#3a342c] bg-blue-50/60 p-1.5 rounded border border-blue-200/60 font-medium">
                              • {m.title}
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return <span className="text-xs text-[#8c8477] italic">No brief mentions assigned.</span>;
                  })()}
                </div>

                {/* Do Not Use */}
                <div className="bg-white border border-[#dcd6ca] rounded-xl p-3.5 shadow-2xs">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                    Do Not Focus On / Exclude
                  </span>
                  {(() => {
                    const excluded = (currentDev.angles || []).filter(
                      (a) => (currentDev.direction?.doNotUseAngleIds || []).includes(a.id) || a.role === 'do_not_use'
                    );
                    if (excluded.length > 0) {
                      return (
                        <div className="space-y-1.5">
                          {excluded.map((d) => (
                            <div key={d.id} className="text-xs text-stone-700 bg-stone-100 p-1.5 rounded border border-stone-200 line-through">
                              • {d.title}
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return <span className="text-xs text-[#8c8477] italic">No angles explicitly excluded.</span>;
                  })()}
                </div>
              </div>

              {/* Editor's Manual Direction (Sovereign Authority) */}
              <div className="bg-white border-2 border-amber-300/80 rounded-xl p-4 sm:p-5 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#1e232a] uppercase tracking-wider">
                    Editor's Custom Direction (Sovereign Authority)
                  </label>
                  <span className="px-1.5 py-0.5 rounded-xs text-[10px] font-semibold bg-amber-100 text-amber-900">
                    Takes Precedence Over AI
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={editorsDirection}
                  onChange={(e) => handleUpdateEditorsDirection(e.target.value)}
                  placeholder="e.g. Focus mainly on why people romanticize historical figures rather than simply explaining why they are popular. Avoid modern productivity clichés and keep the tone warm and literary."
                  className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500 text-[#1e232a] leading-relaxed"
                />
                <p className="text-[11px] text-[#736c61]">
                  Add specific constraints, focal points, or framing advice. These are editorial guidance for the brief, not rigid sentence-level rules.
                </p>
              </div>

              {/* Connected Repositories Overview */}
              <div className="bg-[#f5f2ea] border border-[#e2dcce] rounded-xl p-3.5 space-y-2 text-xs">
                <span className="font-bold text-[10px] uppercase tracking-wider text-[#5c5447] block">
                  Connected Repositories for Brief Context
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="bg-white/80 p-2 rounded-lg border border-[#ded7ca] flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-amber-900 shrink-0" />
                    <span className="text-[11px]">
                      <strong>{attachedStudies.length}</strong> Research {attachedStudies.length === 1 ? 'Study' : 'Studies'}
                    </span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-[#ded7ca] flex items-center gap-2">
                    <Link2 className="w-3.5 h-3.5 text-blue-800 shrink-0" />
                    <span className="text-[11px]">
                      <strong>{internalLinks.length}</strong> Internal Links
                    </span>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-[#ded7ca] flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span className="text-[11px] truncate">
                      {styleProfile ? `Style: ${styleProfile.name}` : 'Default Style'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Create Brief Action */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setActiveStep('angles')}
                className="text-xs font-semibold text-[#5c5447] hover:text-[#1e232a] cursor-pointer"
              >
                ← Back to Angles
              </button>
              <button
                type="button"
                onClick={handleCreateBrief}
                disabled={isCreatingBrief}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-[#1e232a] hover:bg-[#2d3744] transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
              >
                {isCreatingBrief ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    <span>Synthesizing Editorial Brief...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>{currentDev.brief ? 'Regenerate Editorial Brief' : 'Create Editorial Brief'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* STEP 4: EDITORIAL BRIEF                                           */}
        {/* ================================================================= */}
        {activeStep === 'brief' && (
          <div className="space-y-5 animate-in fade-in duration-100">
            {/* Review Proposed Brief Banner (If Regenerating) */}
            {proposedBrief && (
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl space-y-3 animate-in zoom-in-95 duration-100">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-bold text-xs text-amber-950 uppercase tracking-wide">
                      Proposed Brief Synthesized
                    </h5>
                    <p className="text-xs text-amber-900 mt-0.5">
                      Inspect the newly generated brief. You can apply it to replace your current brief (previous version will be archived), or keep your existing brief.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => applyBriefToProject(proposedBrief)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1e232a] text-white hover:bg-[#2d3744] transition-colors cursor-pointer"
                  >
                    Apply New Brief
                  </button>
                  <button
                    type="button"
                    onClick={() => setProposedBrief(null)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#dcd6ca] text-[#4a443b] hover:bg-[#ede8dc] transition-colors cursor-pointer"
                  >
                    Keep Existing Brief
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!currentDev.brief && !proposedBrief ? (
              <div className="text-center py-10 border-2 border-dashed border-[#dcd6ca] rounded-xl p-6 bg-white/60">
                <FileText className="w-8 h-8 text-[#a89f91] mx-auto mb-2" />
                <h5 className="font-editorial text-base font-semibold text-[#1e232a]">Brief Not Yet Synthesized</h5>
                <p className="text-xs text-[#736c61] max-w-sm mx-auto mt-1 mb-4">
                  Define your editorial roles in Steps 2 & 3, then synthesize the comprehensive Editorial Brief.
                </p>
                <button
                  type="button"
                  onClick={handleCreateBrief}
                  disabled={isCreatingBrief}
                  className="px-4 py-2 rounded-lg bg-[#1e232a] text-white text-xs font-semibold inline-flex items-center gap-2 hover:bg-[#2d3744] transition-colors cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Synthesize Brief Now</span>
                </button>
              </div>
            ) : (
              (() => {
                const brief = editableBrief || currentDev.brief || proposedBrief;
                if (!brief) return null;

                return (
                  <div className="space-y-4">
                    {/* Top Action Toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-[#f6f3eb] border border-[#e5dfd3] p-3 rounded-xl">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        <span className="text-xs font-bold uppercase tracking-wider text-[#1e232a]">
                          Editorial Brief Ready
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopyBriefMarkdown}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-[#dcd6ca] bg-white hover:bg-[#ede8dc] text-[#3a342c] transition-colors inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                          title="Copy as Markdown"
                        >
                          {copiedBrief ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-700" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-[#5c5447]" />
                              <span>Copy Brief</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingBrief(!isEditingBrief)}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-[#dcd6ca] bg-white hover:bg-[#ede8dc] text-[#3a342c] transition-colors inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-[#5c5447]" />
                          <span>{isEditingBrief ? 'Done Editing' : 'Edit Brief'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateBrief}
                          disabled={isCreatingBrief}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-[#dcd6ca] bg-white hover:bg-[#ede8dc] text-[#3a342c] transition-colors inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                          title="Regenerate brief with current direction"
                        >
                          <RotateCw className="w-3.5 h-3.5 text-amber-800" />
                          <span>Regenerate</span>
                        </button>
                      </div>
                    </div>

                    {/* Brief Container */}
                    <div className="bg-white border border-[#dcd6ca] rounded-xl p-5 sm:p-6 shadow-2xs space-y-5">
                      {/* 1. Working Title & Meta */}
                      <div className="border-b border-[#f0ede6] pb-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
                          Working Title
                        </span>
                        {isEditingBrief ? (
                          <input
                            type="text"
                            value={brief.workingTitle}
                            onChange={(e) => setEditableBrief({ ...brief, workingTitle: e.target.value })}
                            className="w-full mt-1 px-3 py-1.5 text-lg font-bold font-editorial rounded border border-[#dcd6ca]"
                          />
                        ) : (
                          <h4 className="font-editorial text-xl font-bold text-[#1e232a] mt-0.5 leading-snug">
                            {brief.workingTitle}
                          </h4>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 pt-3 border-t border-[#f5f2ea] text-xs">
                          <div>
                            <span className="text-[#8c8477] font-semibold block text-[10px] uppercase">Topic</span>
                            <span className="text-[#3a342c] font-medium">{brief.topic}</span>
                          </div>
                          <div>
                            <span className="text-[#8c8477] font-semibold block text-[10px] uppercase">Audience</span>
                            <span className="text-[#3a342c] font-medium">{brief.audience}</span>
                          </div>
                          <div>
                            <span className="text-[#8c8477] font-semibold block text-[10px] uppercase">Search Intent</span>
                            <span className="text-[#3a342c] font-medium">{brief.searchIntent}</span>
                          </div>
                        </div>
                      </div>

                      {/* 2. Primary Angle & Secondary Focus */}
                      <div className="space-y-3">
                        <div className="p-3.5 rounded-lg bg-[#faf8f4] border border-[#ded7ca]">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#1e232a] block mb-1">
                            Primary Editorial Angle
                          </span>
                          <p className="text-xs font-semibold text-[#1e232a] leading-relaxed">
                            {brief.primaryAngle}
                          </p>
                        </div>

                        {brief.secondaryFocus && (
                          <div className="p-3.5 rounded-lg bg-amber-50/40 border border-amber-200">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block mb-1">
                              Secondary Supporting Focus
                            </span>
                            <p className="text-xs text-[#4a443b] leading-relaxed">
                              {brief.secondaryFocus}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* 3. Central Argument */}
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61] block mb-1">
                          Central Argument
                        </span>
                        <div className="p-3 rounded-lg bg-white border border-[#dcd6ca] text-xs text-[#2b251d] font-serif leading-relaxed">
                          {brief.centralArgument}
                        </div>
                      </div>

                      {/* 4. Key Questions the Article Must Answer */}
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#736c61] block mb-1.5">
                          Key Questions the Article Should Answer
                        </span>
                        <ul className="space-y-1.5">
                          {(brief.keyQuestions || []).map((q, i) => (
                            <li key={i} className="text-xs text-[#3a342c] flex items-start gap-2 bg-[#faf9f6] p-2 rounded border border-[#ede8dc]">
                              <span className="font-bold text-amber-800">{i + 1}.</span>
                              <span className="leading-relaxed">{q}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* 5. Editorial Direction (Leading Authority) */}
                      <div className="p-3.5 rounded-lg bg-amber-50/70 border border-amber-300">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-950 block mb-1">
                          Editorial Direction & Tone Guidance
                        </span>
                        <p className="text-xs text-amber-950 leading-relaxed font-medium">
                          {brief.editorialDirection}
                        </p>
                      </div>

                      {/* 6. Brief Mentions & Exclusions */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {brief.briefMentions && brief.briefMentions.length > 0 && (
                          <div className="p-3 rounded-lg border border-[#e2dcce] bg-[#faf9f6]">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-900 block mb-1">
                              Brief Mentions
                            </span>
                            <ul className="space-y-1 text-[#4a443b]">
                              {brief.briefMentions.map((m, i) => (
                                <li key={i}>• {m}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {brief.thingsToAvoid && brief.thingsToAvoid.length > 0 && (
                          <div className="p-3 rounded-lg border border-[#e2dcce] bg-[#faf9f6]">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-700 block mb-1">
                              Things to Avoid / Exclude
                            </span>
                            <ul className="space-y-1 text-stone-600">
                              {brief.thingsToAvoid.map((a, i) => (
                                <li key={i}>• {a}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* 7. Factual Context vs Editorial Interpretation (Requirement #6) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#f0ede6]">
                        {/* Factual Context */}
                        <div className="p-3.5 rounded-lg border border-emerald-200 bg-emerald-50/30">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-800" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-950">
                              Factual / Research-Based Context
                            </span>
                          </div>
                          {brief.factualContext && brief.factualContext.length > 0 ? (
                            <ul className="space-y-1 text-xs text-emerald-950">
                              {brief.factualContext.map((f, i) => (
                                <li key={i} className="leading-relaxed">• {f}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-xs text-emerald-900/70 italic">
                              No empirical study data attached. Factual assertions must be strictly verified.
                            </span>
                          )}
                        </div>

                        {/* Editorial Interpretation */}
                        <div className="p-3.5 rounded-lg border border-purple-200 bg-purple-50/30">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-purple-800" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-purple-950">
                              Editorial Interpretation
                            </span>
                          </div>
                          {brief.editorialInterpretation && brief.editorialInterpretation.length > 0 ? (
                            <ul className="space-y-1 text-xs text-purple-950">
                              {brief.editorialInterpretation.map((ei, i) => (
                                <li key={i} className="leading-relaxed">• {ei}</li>
                              ))}
                            </ul>
                          ) : (
                            <span className="text-xs text-purple-900/70 italic">
                              Framed around recipient psychology and craft nuance.
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 8. Internal Links & Suggested Takeaway */}
                      <div className="pt-2 border-t border-[#f0ede6] space-y-2.5">
                        {brief.internalLinkOpportunities && brief.internalLinkOpportunities.length > 0 && (
                          <div className="text-xs">
                            <span className="font-bold text-[10px] uppercase tracking-wider text-blue-900 block mb-1">
                              Internal Link Opportunities (Future Outline Placement)
                            </span>
                            <div className="space-y-1 text-[#3a342c]">
                              {brief.internalLinkOpportunities.map((opp, i) => (
                                <div key={i} className="bg-blue-50/40 p-1.5 rounded border border-blue-200/50 flex items-center gap-2">
                                  <Link2 className="w-3 h-3 text-blue-800 shrink-0" />
                                  <span>{opp}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <span className="font-bold text-[10px] uppercase tracking-wider text-[#5c5447] block mb-1">
                            Suggested Takeaway
                          </span>
                          <p className="text-xs text-[#2e4d3a] font-medium bg-emerald-50/40 p-2.5 rounded-lg border border-emerald-200/60 leading-relaxed">
                            {brief.suggestedTakeaway}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Apply & Proceed Buttons */}
                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                      <div className="text-xs text-[#736c61]">
                        <span>Applies this brief to your Project Brief, standfirst, and version history.</span>
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          type="button"
                          onClick={() => applyBriefToProject(brief)}
                          className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl font-semibold text-xs text-[#1e232a] bg-white border border-[#dcd6ca] hover:bg-[#ede8dc] transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                        >
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span>Apply Brief</span>
                        </button>
                        {onOpenOutline && (
                          <button
                            type="button"
                            onClick={() => {
                              applyBriefToProject(brief);
                              onClose();
                              onOpenOutline();
                            }}
                            className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl font-semibold text-xs text-white bg-[#1e232a] hover:bg-[#2d3744] transition-all flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                          >
                            <span>Proceed to Outline Studio</span>
                            <ArrowRight className="w-4 h-4 text-amber-300" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}

      </div>
    </div>
  );
};
