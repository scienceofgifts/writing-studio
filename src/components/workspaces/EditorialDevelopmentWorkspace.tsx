/**
 * Science of Gifts - Workspace A: Dedicated Editorial Development Workspace
 *
 * Takes an article concept from initial idea selection to a finished external-model
 * editorial prompt, completely separate from the Article Writing & Editing workspace.
 *
 * Reuses the existing, tested implementations for:
 * 1. Idea Selection
 * 2. Five Angles & Editorial Role Assignments
 * 3. Editorial Direction
 * 4. Editorial Brief
 * 5. Outline Studio
 * 6. Draft Package & External-Model Prompt
 */

import React, { useState, useEffect, useRef } from 'react';
import { WritingProject, OutlineItem, ActivePanel } from '../../types/project';
import {
  DevelopmentWorkspaceStage,
  WorkflowStep,
  determineInitialWorkspaceStage,
  getCompletedWorkspaceStages,
  getNextAvailableWorkspaceAction,
} from '../../utils/editorialDevelopmentUtils';
import { EditorialDevelopmentDrawer } from '../drawers/EditorialDevelopmentDrawer';
import { ContentOutlineDrawer } from '../drawers/ContentOutlineDrawer';
import { DraftPackageDrawer } from '../drawers/DraftPackageDrawer';
import {
  Compass,
  Layers,
  ListOrdered,
  Sparkles,
  FileText,
  Check,
  ChevronRight,
  ArrowRight,
  BookOpen,
  Lightbulb,
  Edit3,
} from 'lucide-react';

interface EditorialDevelopmentWorkspaceProps {
  project: WritingProject;
  onChange: (updatedProject: WritingProject) => void;
  onOpenArticleEditor: () => void;
  onReturnToArticles: () => void;
  onOpenIdeaGenerator: () => void;
  onDraftSection?: (section: OutlineItem) => void;
  activePanel?: ActivePanel;
  onTogglePanel?: (panel: Exclude<ActivePanel, null>) => void;
}

const STAGE_DEFINITIONS: Array<{
  id: DevelopmentWorkspaceStage;
  number: number;
  label: string;
  shortLabel: string;
}> = [
  { id: 'idea', number: 1, label: 'Idea Selection', shortLabel: 'Idea' },
  { id: 'angles', number: 2, label: 'Five Angles', shortLabel: '5 Angles' },
  { id: 'direction', number: 3, label: 'Editorial Direction', shortLabel: 'Direction' },
  { id: 'brief', number: 4, label: 'Editorial Brief', shortLabel: 'Brief' },
  { id: 'outline', number: 5, label: 'Outline Studio', shortLabel: 'Outline' },
  { id: 'draft_package', number: 6, label: 'Draft Package & Prompt', shortLabel: 'Draft Package' },
];

export const EditorialDevelopmentWorkspace: React.FC<EditorialDevelopmentWorkspaceProps> = ({
  project,
  onChange,
  onOpenArticleEditor,
  onReturnToArticles,
  onOpenIdeaGenerator,
  onDraftSection,
  activePanel,
  onTogglePanel,
}) => {
  // Restore appropriate stage ONLY on mount or when switching to a different project ID
  const [activeStage, setActiveStage] = useState<DevelopmentWorkspaceStage>(() =>
    determineInitialWorkspaceStage(project)
  );
  const lastProjectIdRef = useRef<string>(project.id);

  useEffect(() => {
    if (lastProjectIdRef.current !== project.id) {
      lastProjectIdRef.current = project.id;
      setActiveStage(determineInitialWorkspaceStage(project));
    }
  }, [project.id, project]);

  const completedStages = getCompletedWorkspaceStages(project);
  const completedSet = new Set<DevelopmentWorkspaceStage>(completedStages);
  const nextAction = getNextAvailableWorkspaceAction(project, activeStage);

  const handleTitleChange = (newTitle: string) => {
    onChange({
      ...project,
      title: newTitle,
      updatedAt: new Date().toISOString(),
    });
  };

  const isUpstreamStage =
    activeStage === 'idea' ||
    activeStage === 'angles' ||
    activeStage === 'direction' ||
    activeStage === 'brief';

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-[#faf9f6] overflow-hidden">
      {/* ===================================================================== */}
      {/* 1. DEDICATED WORKSPACE HEADER & STAGE NAVIGATION                      */}
      {/* ===================================================================== */}
      <div className="px-4 sm:px-6 py-3 bg-[#f6f3eb] border-b border-[#e5dfd3] shrink-0 space-y-3">
        {/* Top Row: Workspace Identity, Editable Working Title, and Deliberate Workspace Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 min-w-0">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-[#1e232a] text-amber-300 flex items-center justify-center shadow-2xs shrink-0 mt-0.5 sm:mt-0">
              <Layers className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-900 bg-amber-100/90 border border-amber-300/80 px-2 py-0.5 rounded-md">
                  Editorial Development Workspace
                </span>
                <span className="text-[11px] text-[#736c61] hidden sm:inline">
                  Idea → 5 Angles → Direction → Brief → Outline → Draft Prompt
                </span>
              </div>
              <input
                type="text"
                value={project.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Article Working Title..."
                className="w-full min-w-0 font-editorial text-lg sm:text-xl md:text-2xl font-bold text-[#1e232a] bg-transparent focus:outline-hidden border-b border-transparent focus:border-amber-500 py-0.5 tracking-tight truncate mt-0.5"
              />
            </div>
          </div>

          {/* Right Action Controls: Idea Shelf, Research Studies, Open Article Editor */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenIdeaGenerator}
              className="px-2.5 py-1.5 text-xs font-semibold text-[#4a443b] bg-white hover:bg-[#ede8dc] border border-[#dcd6ca] rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Browse or generate ideas in the Idea Generator"
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-700" />
              <span>Idea Generator</span>
            </button>

            {onTogglePanel && (
              <button
                type="button"
                onClick={() => onTogglePanel('research')}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                  activePanel === 'research'
                    ? 'bg-[#1e232a] text-white border-[#1e232a]'
                    : 'text-[#4a443b] bg-white border-[#dcd6ca] hover:bg-[#ede8dc]'
                }`}
                title="Attach or inspect empirical studies from the Research Library"
              >
                <BookOpen
                  className={`w-3.5 h-3.5 ${
                    activePanel === 'research' ? 'text-amber-300' : 'text-amber-800'
                  }`}
                />
                <span>Research</span>
                {project.attachedStudyIds && project.attachedStudyIds.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      activePanel === 'research'
                        ? 'bg-amber-800 text-amber-100'
                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                    }`}
                  >
                    {project.attachedStudyIds.length}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={onOpenArticleEditor}
              className="px-3.5 py-1.5 text-xs font-semibold text-[#1e232a] bg-amber-100 hover:bg-amber-200/90 border border-amber-300 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Switch to the Article Writing & Editing workspace for this project"
            >
              <Edit3 className="w-3.5 h-3.5 text-amber-900" />
              <span>Open Article Editor</span>
              <ArrowRight className="w-3.5 h-3.5 text-amber-900" />
            </button>
          </div>
        </div>

        {/* Bottom Row: Unified 6-Stage Stepper + Next Available Action */}
        <div className="pt-2 border-t border-[#e8e2d5] flex flex-col xl:flex-row xl:items-center justify-between gap-2.5 min-w-0">
          {/* 6 Stages */}
          <div
            className="flex items-center gap-1 overflow-x-auto pb-1 xl:pb-0 text-xs min-w-0"
            role="tablist"
            aria-label="Editorial Development Stages"
          >
            {STAGE_DEFINITIONS.map((stage, index) => {
              const isCurrent = activeStage === stage.id;
              const isCompleted = completedSet.has(stage.id);
              const anglesCount = project.editorialDevelopment?.angles?.length || 0;
              const outlineCount = project.outline?.length || 0;

              return (
                <React.Fragment key={stage.id}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isCurrent}
                    onClick={() => setActiveStage(stage.id)}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold transition-all inline-flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                      isCurrent
                        ? 'bg-[#1e232a] text-white border-[#1e232a] shadow-2xs'
                        : isCompleted
                        ? 'bg-white text-[#1e232a] border-[#d5cebe] hover:bg-[#efeae0]'
                        : 'bg-transparent text-[#615a50] border-transparent hover:bg-[#eae4d7] hover:text-[#1e232a]'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        isCurrent
                          ? 'bg-amber-400 text-[#1e232a]'
                          : isCompleted
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-[#e2dcce] text-[#5c5447]'
                      }`}
                    >
                      {isCompleted && !isCurrent ? (
                        <Check className="w-2.5 h-2.5 text-emerald-700" />
                      ) : (
                        stage.number
                      )}
                    </span>
                    <span className="hidden sm:inline">{stage.label}</span>
                    <span className="sm:hidden">{stage.shortLabel}</span>

                    {stage.id === 'angles' && anglesCount > 0 && (
                      <span
                        className={`text-[10px] font-bold ${
                          isCurrent ? 'text-amber-300' : 'text-amber-800'
                        }`}
                      >
                        ({anglesCount})
                      </span>
                    )}

                    {stage.id === 'outline' && outlineCount > 0 && (
                      <span
                        className={`text-[10px] font-bold ${
                          isCurrent ? 'text-blue-300' : 'text-blue-800'
                        }`}
                      >
                        ({outlineCount})
                      </span>
                    )}
                  </button>

                  {index < STAGE_DEFINITIONS.length - 1 && (
                    <ChevronRight className="w-3.5 h-3.5 text-[#b5ad9e] shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Next Available Action Indicator */}
          <div className="flex items-center justify-between sm:justify-end gap-2 text-xs shrink-0 bg-white/80 px-3 py-1.5 rounded-lg border border-[#dcd6ca]">
            <span className="text-[11px] font-medium text-[#736c61]">
              Completed: <strong className="text-[#1e232a]">{completedStages.length}/6</strong>
            </span>
            <span className="text-[#c7bfaf]">•</span>
            <button
              type="button"
              onClick={() => {
                if (nextAction.targetStage === 'article_editor') {
                  onOpenArticleEditor();
                } else {
                  setActiveStage(nextAction.targetStage);
                }
              }}
              className="font-semibold text-amber-900 hover:text-amber-950 inline-flex items-center gap-1 cursor-pointer hover:underline"
            >
              <span>Next: {nextAction.label}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. FOCUSED STAGE WORKSPACE BODY                                       */}
      {/* ===================================================================== */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 md:p-8 flex flex-col">
        {isUpstreamStage && (
          <EditorialDevelopmentDrawer
            isOpen={true}
            variant="workspace"
            activeWorkspaceStep={activeStage as WorkflowStep}
            onStepChange={(nextStep) => setActiveStage(nextStep)}
            onClose={onReturnToArticles}
            project={project}
            onChange={onChange}
            onOpenOutline={() => setActiveStage('outline')}
            onOpenIdeaGenerator={onOpenIdeaGenerator}
          />
        )}

        {activeStage === 'outline' && (
          <ContentOutlineDrawer
            isOpen={true}
            variant="workspace"
            onClose={onReturnToArticles}
            project={project}
            outline={project.outline}
            onChange={(updatedOutline) =>
              onChange({
                ...project,
                outline: updatedOutline,
                updatedAt: new Date().toISOString(),
              })
            }
            onUpdateProject={onChange}
            onDraftSection={onDraftSection}
            onOpenDevelop={() => setActiveStage('brief')}
            onOpenDraftPackage={() => setActiveStage('draft_package')}
            onOpenArticleEditor={onOpenArticleEditor}
            onReturnToArticles={onReturnToArticles}
          />
        )}

        {activeStage === 'draft_package' && (
          <DraftPackageDrawer
            isOpen={true}
            variant="workspace"
            onClose={onReturnToArticles}
            project={project}
            onUpdateProject={onChange}
            onOpenOutline={() => setActiveStage('outline')}
            onOpenDevelop={() => setActiveStage('brief')}
            onOpenArticleEditor={onOpenArticleEditor}
            onReturnToArticles={onReturnToArticles}
          />
        )}
      </div>
    </div>
  );
};
