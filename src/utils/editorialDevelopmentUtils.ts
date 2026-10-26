/**
 * Science of Gifts - Editorial Development Workflow Utilities
 * Pure, deterministic state-management and validation helpers for:
 * 1. Idea -> 2. Five Angles -> 3. Editorial Direction -> 4. Editorial Brief
 */

import {
  WritingProject,
  EditorialAngle,
  EditorialDirection,
  EditorialDevelopment,
  StructuredEditorialBrief,
  BriefReference,
  AngleRole,
} from '../types/project';
import { EditorialIdea } from '../types/ideaGenerator';

export type WorkflowStep = 'idea' | 'angles' | 'direction' | 'brief';

export type DevelopmentWorkspaceStage =
  | 'idea'
  | 'angles'
  | 'direction'
  | 'brief'
  | 'outline'
  | 'draft_package';

/**
 * Determines the initial workflow step when opening or restoring a project's
 * Editorial Development workflow.
 *
 * IMPORTANT:
 * - Only called on initial mount, project switch (`project.id` change), or drawer open.
 * - Never called in response to ordinary `project.editorialDevelopment` edits while the
 *   user is actively working inside the workflow.
 * - Having assigned angle roles (`primary`, `secondary`, `brief_mention`, `do_not_use`)
 *   while `status === 'angles_generated'` keeps the initial step on `'angles'` until the
 *   user explicitly advances to `'direction'` (`status === 'direction_set'`) or creates a brief.
 */
export function determineInitialDevelopmentStep(dev?: EditorialDevelopment): WorkflowStep {
  if (!dev) return 'idea';
  if (dev.brief) return 'brief';
  if (dev.status === 'direction_set') return 'direction';
  if (dev.angles && dev.angles.length > 0) return 'angles';
  return 'idea';
}

/**
 * Determines the initial stage in the dedicated Editorial Development Workspace (Workspace A)
 * when opening or reopening a project.
 *
 * Restores downstream Outline Studio or Draft Package position if the project has already
 * reached those stages, otherwise restores the appropriate upstream step ('idea' | 'angles' | 'direction' | 'brief').
 */
export function determineInitialWorkspaceStage(
  project?: WritingProject | null
): DevelopmentWorkspaceStage {
  if (!project) return 'idea';
  const dev = project.editorialDevelopment;
  if (!dev) {
    if (project.outline && project.outline.length > 0) return 'outline';
    return 'idea';
  }
  if (dev.status === 'draft_package_ready') {
    return 'draft_package';
  }
  if (
    dev.status === 'outline_ready' ||
    (project.outline && project.outline.length > 0 && Boolean(dev.brief))
  ) {
    return 'outline';
  }
  return determineInitialDevelopmentStep(dev);
}

/**
 * Computes which stages in the Editorial Development Workspace have been completed for a project.
 */
export function getCompletedWorkspaceStages(
  project?: WritingProject | null
): DevelopmentWorkspaceStage[] {
  if (!project) return [];
  const dev = project.editorialDevelopment;
  const completed: DevelopmentWorkspaceStage[] = [];

  const hasIdea = Boolean(
    (dev?.originalIdea?.title || project.title || '').trim() &&
      ((dev?.angles && dev.angles.length > 0) ||
        (dev?.status && dev.status !== 'idea') ||
        Boolean(dev?.brief))
  );
  if (hasIdea) completed.push('idea');

  const hasAngles = Boolean(dev?.angles && dev.angles.length > 0);
  if (hasAngles) completed.push('angles');

  const hasDirection = Boolean(
    dev?.direction?.primaryAngleId ||
      (dev?.direction?.editorsDirection || '').trim() ||
      dev?.status === 'direction_set' ||
      dev?.status === 'brief_ready' ||
      dev?.status === 'outline_ready' ||
      dev?.status === 'draft_package_ready' ||
      Boolean(dev?.brief)
  );
  if (hasDirection) completed.push('direction');

  if (dev?.brief) completed.push('brief');

  if (project.outline && project.outline.length > 0) {
    completed.push('outline');
  }

  if (dev?.status === 'draft_package_ready') {
    completed.push('draft_package');
  }

  return completed;
}

/**
 * Returns the next available action label and target stage for the active stage in Workspace A.
 */
export function getNextAvailableWorkspaceAction(
  project: WritingProject | null | undefined,
  activeStage: DevelopmentWorkspaceStage
): {
  label: string;
  targetStage: DevelopmentWorkspaceStage | 'article_editor';
} {
  switch (activeStage) {
    case 'idea':
      return {
        label:
          project?.editorialDevelopment?.angles && project.editorialDevelopment.angles.length > 0
            ? 'Review 5 Angles'
            : 'Generate 5 Angles',
        targetStage: 'angles',
      };
    case 'angles':
      return {
        label: 'Proceed to Editorial Direction',
        targetStage: 'direction',
      };
    case 'direction':
      return {
        label: project?.editorialDevelopment?.brief
          ? 'Review Editorial Brief'
          : 'Synthesize Editorial Brief',
        targetStage: 'brief',
      };
    case 'brief':
      return {
        label: 'Proceed to Outline Studio',
        targetStage: 'outline',
      };
    case 'outline':
      return {
        label: 'Assemble Draft Package & Prompt',
        targetStage: 'draft_package',
      };
    case 'draft_package':
      return {
        label: 'Open Article Editor',
        targetStage: 'article_editor',
      };
  }
}

/**
 * Finds an existing non-deleted Article project that originated from the given EditorialIdea,
 * preventing duplicate project creation or loss of in-progress development work when reopening an idea.
 */
export function findExistingProjectForIdea(
  projects: WritingProject[],
  idea: EditorialIdea
): WritingProject | undefined {
  if (!Array.isArray(projects) || !idea) return undefined;
  const normalizedTitle = (idea.title || '').trim().toLowerCase();
  const normalizedAngle = (idea.angle || '').trim().toLowerCase();

  return projects.find((p) => {
    if (!p || p._isDeleted || p.type !== 'article') return false;
    if (idea.id && (p.originatingIdeaId === idea.id || p.editorialDevelopment?.originalIdea?.id === idea.id)) {
      return true;
    }
    const projIdeaTitle = (p.editorialDevelopment?.originalIdea?.title || '').trim().toLowerCase();
    const projIdeaAngle = (p.editorialDevelopment?.originalIdea?.angle || '').trim().toLowerCase();
    if (
      normalizedTitle &&
      projIdeaTitle === normalizedTitle &&
      (!normalizedAngle || !projIdeaAngle || projIdeaAngle === normalizedAngle)
    ) {
      return true;
    }
    return false;
  });
}

/**
 * Applies an editorial role assignment (`primary`, `secondary`, `brief_mention`,
 * `do_not_use`, or `unassigned`) to a specific angle without advancing the workflow step.
 *
 * Rules:
 * - At most 1 Primary angle (`primary`): assigning Primary to a new angle demotes any
 *   previously selected Primary angle to `unassigned`.
 * - At most 1 Secondary angle (`secondary`): assigning Secondary to a new angle demotes any
 *   previously selected Secondary angle to `unassigned`.
 * - Multiple angles can be `brief_mention` or `do_not_use`.
 * - Clicking an angle's already-active role toggles it back to `unassigned` (Clear).
 * - Does NOT set `status` to `'direction_set'` (preserves `'angles_generated'` or `'brief_ready'`).
 */
export function applyAngleRoleAssignment(
  dev: EditorialDevelopment,
  angleId: string,
  role: AngleRole,
  currentEditorsDirection?: string
): {
  angles: EditorialAngle[];
  direction: EditorialDirection;
  status: EditorialDevelopment['status'];
} {
  const currentAngles = dev.angles || [];
  let updatedPrimary = dev.direction?.primaryAngleId;
  let updatedSecondary = dev.direction?.secondaryAngleId;
  const briefMentions = new Set(dev.direction?.briefMentionAngleIds || []);
  const doNotUse = new Set(dev.direction?.doNotUseAngleIds || []);

  const updatedAngles = currentAngles.map((angle) => {
    if (angle.id === angleId) {
      const newRole: AngleRole = angle.role === role ? 'unassigned' : role;

      // Remove from all direction role slots first
      if (updatedPrimary === angleId) updatedPrimary = undefined;
      if (updatedSecondary === angleId) updatedSecondary = undefined;
      briefMentions.delete(angleId);
      doNotUse.delete(angleId);

      // Assign to the new role slot
      if (newRole === 'primary') updatedPrimary = angleId;
      if (newRole === 'secondary') updatedSecondary = angleId;
      if (newRole === 'brief_mention') briefMentions.add(angleId);
      if (newRole === 'do_not_use') doNotUse.add(angleId);

      return { ...angle, role: newRole };
    }

    // If assigning a new Primary angle, demote any previous Primary angle
    if (role === 'primary' && angle.role === 'primary' && angle.id !== angleId) {
      return { ...angle, role: 'unassigned' as AngleRole };
    }

    // If assigning a new Secondary angle, demote any previous Secondary angle
    if (role === 'secondary' && angle.role === 'secondary' && angle.id !== angleId) {
      return { ...angle, role: 'unassigned' as AngleRole };
    }

    return angle;
  });

  // Ensure primaryAngleId and secondaryAngleId stay strictly consistent with angle roles
  const actualPrimary = updatedAngles.find((a) => a.role === 'primary');
  const actualSecondary = updatedAngles.find((a) => a.role === 'secondary');
  updatedPrimary = actualPrimary ? actualPrimary.id : undefined;
  updatedSecondary = actualSecondary ? actualSecondary.id : undefined;

  const updatedDirection: EditorialDirection = {
    ...dev.direction,
    primaryAngleId: updatedPrimary,
    secondaryAngleId: updatedSecondary,
    briefMentionAngleIds: updatedAngles
      .filter((a) => a.role === 'brief_mention')
      .map((a) => a.id),
    doNotUseAngleIds: updatedAngles
      .filter((a) => a.role === 'do_not_use')
      .map((a) => a.id),
    editorsDirection:
      currentEditorsDirection !== undefined
        ? currentEditorsDirection
        : dev.direction?.editorsDirection || '',
  };

  const nextStatus: EditorialDevelopment['status'] =
    dev.status === 'brief_ready' && dev.brief ? 'brief_ready' : 'angles_generated';

  return {
    angles: updatedAngles,
    direction: updatedDirection,
    status: nextStatus,
  };
}

/**
 * Validates that required inputs exist before calling `/api/gemini/create-editorial-brief`.
 * Requires a non-empty working title/topic and either a selected Primary Angle or
 * non-empty custom Editorial Direction.
 */
export function validateBriefGenerationInputs(params: {
  projectTitle?: string;
  idea?: Partial<EditorialIdea> | null;
  angles?: EditorialAngle[] | null;
  direction?: Partial<EditorialDirection> | null;
}): { valid: boolean; error?: string } {
  const title = (params.idea?.title || params.projectTitle || '').trim();
  if (!title) {
    return {
      valid: false,
      error: 'Please provide an Article Working Title in Step 1 before creating the Editorial Brief.',
    };
  }

  const safeAngles = Array.isArray(params.angles) ? params.angles : [];
  const hasPrimaryAngle = safeAngles.some(
    (a) => a && (a.role === 'primary' || (params.direction?.primaryAngleId && a.id === params.direction.primaryAngleId))
  );
  const hasManualDirection = Boolean((params.direction?.editorsDirection || '').trim());

  if (!hasPrimaryAngle && !hasManualDirection) {
    return {
      valid: false,
      error:
        'Select a Primary Angle in Step 2 or enter custom Editorial Direction in Step 3 before creating the brief.',
    };
  }

  return { valid: true };
}

function toCleanStringArray(val: any): string[] {
  if (Array.isArray(val)) {
    return val
      .map((item) =>
        typeof item === 'string'
          ? item.trim()
          : String(item?.text || item?.title || item?.claimText || item || '').trim()
      )
      .filter(Boolean);
  }
  if (typeof val === 'string' && val.trim()) {
    return [val.trim()];
  }
  return [];
}

/**
 * Strictly validates and normalizes a raw Editorial Brief response from the AI endpoint.
 *
 * CRITICAL:
 * - Never fabricates editorial content when the AI response is empty, non-JSON, or missing
 *   essential brief fields (`workingTitle`, `centralArgument`, `primaryAngle`).
 * - Prevents empty or malformed responses from overwriting an existing valid brief.
 */
export function validateAndNormalizeEditorialBrief(
  rawInput: any,
  context: {
    projectTitle?: string;
    idea?: Partial<EditorialIdea> | null;
    direction?: Partial<EditorialDirection> | null;
    angles?: EditorialAngle[] | null;
    attachedStudies?: any[] | null;
  } = {}
): { valid: boolean; brief?: StructuredEditorialBrief; error?: string } {
  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      valid: false,
      error: 'Model did not return a structured editorial brief object.',
    };
  }

  const raw =
    rawInput.brief && typeof rawInput.brief === 'object' && !Array.isArray(rawInput.brief)
      ? rawInput.brief
      : rawInput.editorialBrief &&
        typeof rawInput.editorialBrief === 'object' &&
        !Array.isArray(rawInput.editorialBrief)
      ? rawInput.editorialBrief
      : rawInput;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      valid: false,
      error: 'Model did not return a valid structured editorial brief.',
    };
  }

  const workingTitle = String(raw.workingTitle || raw.title || '')
    .replace(/[*_#`]/g, '')
    .trim();
  const centralArgument = String(
    raw.centralArgument || raw.coreArgument || raw.thesis || ''
  ).trim();
  const primaryAngle = String(raw.primaryAngle || '').trim();

  if (!workingTitle || !centralArgument || !primaryAngle) {
    const missing: string[] = [];
    if (!workingTitle) missing.push('workingTitle');
    if (!centralArgument) missing.push('centralArgument');
    if (!primaryAngle) missing.push('primaryAngle');
    return {
      valid: false,
      error: `Model response is incomplete: missing required brief fields (${missing.join(', ')}).`,
    };
  }

  const keyQuestions = toCleanStringArray(raw.keyQuestions);
  const editorialDirection = String(
    raw.editorialDirection || context.direction?.editorsDirection || ''
  ).trim();
  const suggestedTakeaway = String(raw.suggestedTakeaway || '').trim();

  if (keyQuestions.length === 0 || !editorialDirection || !suggestedTakeaway) {
    const missingDetails: string[] = [];
    if (keyQuestions.length === 0) missingDetails.push('keyQuestions');
    if (!editorialDirection) missingDetails.push('editorialDirection');
    if (!suggestedTakeaway) missingDetails.push('suggestedTakeaway');
    return {
      valid: false,
      error: `Model response is incomplete: missing required brief sections (${missingDetails.join(', ')}).`,
    };
  }

  const safeStudies = Array.isArray(context.attachedStudies)
    ? context.attachedStudies.filter(Boolean)
    : [];
  const rawRefs = Array.isArray(raw.references) ? raw.references : [];

  const normalizedRefs: BriefReference[] =
    safeStudies.length > 0
      ? safeStudies.map((s: any) => {
          const matchedRef = rawRefs.find(
            (r: any) =>
              r?.studyId === s.id ||
              (r?.title &&
                s.title &&
                String(r.title).toLowerCase() === String(s.title).toLowerCase())
          );
          const doiRaw = s.doi || s.sourceUrl || s.doiOrUrl || matchedRef?.doiOrUrl || '';
          return {
            studyId: s.id,
            title: String(s.title || matchedRef?.title || 'Attached Study'),
            authors: Array.isArray(s.authors)
              ? s.authors.map(String)
              : toCleanStringArray(matchedRef?.authors),
            publication: String(
              s.publication || s.sourceOrPublisher || matchedRef?.publication || ''
            ),
            publicationYear: String(
              s.publicationYear || s.publicationDate || matchedRef?.publicationYear || ''
            ),
            doiOrUrl: String(doiRaw),
            isVerifiedMatch: Boolean(doiRaw || s.extractedText || s.abstract),
            verificationNote: String(
              matchedRef?.verificationNote ||
                'Attached project study from the Research Library.'
            ),
          };
        })
      : rawRefs
          .filter((r: any) => r && typeof r === 'object' && r.title)
          .map((r: any) => ({
            studyId: r.studyId ? String(r.studyId) : undefined,
            title: String(r.title).trim(),
            authors: toCleanStringArray(r.authors),
            publication: r.publication ? String(r.publication).trim() : undefined,
            publicationYear: r.publicationYear ? String(r.publicationYear).trim() : undefined,
            doiOrUrl: r.doiOrUrl ? String(r.doiOrUrl).trim() : undefined,
            isVerifiedMatch: Boolean(r.isVerifiedMatch),
            verificationNote: r.verificationNote
              ? String(r.verificationNote).trim()
              : 'Requires verification in Research Library.',
          }));

  const now = new Date().toISOString();

  const normalizedBrief: StructuredEditorialBrief = {
    workingTitle,
    topic: String(raw.topic || context.idea?.title || context.projectTitle || workingTitle).trim(),
    audience: String(raw.audience || 'Discerning readers and thoughtful gifters').trim(),
    searchIntent: String(
      raw.searchIntent || context.idea?.searchIntent || 'Editorial insight & advice'
    ).trim(),
    primaryAngle,
    secondaryFocus: String(raw.secondaryFocus || raw.secondaryAngle || '').trim(),
    briefMentions: toCleanStringArray(raw.briefMentions),
    thingsToAvoid: toCleanStringArray(raw.thingsToAvoid),
    centralArgument,
    keyQuestions,
    editorialDirection,
    suggestedTakeaway,
    factualContext: toCleanStringArray(raw.factualContext),
    editorialInterpretation: toCleanStringArray(raw.editorialInterpretation),
    internalLinkOpportunities: toCleanStringArray(raw.internalLinkOpportunities),
    references: normalizedRefs,
    styleConsiderations: String(raw.styleConsiderations || '').trim() || undefined,
    generatedAt: typeof raw.generatedAt === 'string' && raw.generatedAt ? raw.generatedAt : now,
    updatedAt: typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : now,
  };

  return {
    valid: true,
    brief: normalizedBrief,
  };
}
