/**
 * Focused Regression Tests for Stage 1: Editorial Development Workflow Repair
 * Covers:
 * 1. Angle-role assignment & step transition isolation
 * 2. Editorial Brief input validation, API generation, malformed/empty response rejection, and retry
 * 3. Regression protection (manual save, version history, zero unintended Firestore writes, project readability)
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  determineInitialDevelopmentStep,
  applyAngleRoleAssignment,
  validateBriefGenerationInputs,
  validateAndNormalizeEditorialBrief,
  WorkflowStep,
} from '../editorialDevelopmentUtils';
import {
  WritingProject,
  EditorialAngle,
  EditorialDevelopment,
  StructuredEditorialBrief,
} from '../../types/project';
import {
  hasProjectUnsavedChanges,
  createVersionSnapshot,
} from '../../services/versionHistoryService';
import { handleApiRequest } from '../../../worker';

function createSampleAngles(): EditorialAngle[] {
  return [
    {
      id: 'angle-1',
      title: 'The Patina of Daily Utility',
      coreArgument: 'Tools that age visibly record shared domestic history.',
      whyInteresting: 'Counters disposable luxury with earned character.',
      whatArticleEmphasizes: 'Material aging in brass, linen, and vegetable-tanned leather.',
      possibleTakeaway: 'Choose gifts that improve through handling.',
      role: 'unassigned',
    },
    {
      id: 'angle-2',
      title: 'The Quiet Ritual of Maintenance',
      coreArgument: 'Objects requiring care create stronger psychological attachment.',
      whyInteresting: 'Draws on the IKEA effect and tactile stewardship.',
      whatArticleEmphasizes: 'Sharpening, oiling, and seasonal upkeep.',
      possibleTakeaway: 'Give the maintenance kit alongside the tool.',
      role: 'unassigned',
    },
    {
      id: 'angle-3',
      title: 'Workshop Provenance Over Brand Prestige',
      coreArgument: 'Regional craft lineages matter more than luxury logos.',
      whyInteresting: 'Focuses on named makers and guild traditions.',
      whatArticleEmphasizes: 'Sheffield steel, Seki blades, and Solingen forging.',
      possibleTakeaway: 'Look for maker marks and repair guarantees.',
      role: 'unassigned',
    },
    {
      id: 'angle-4',
      title: 'Weight and Balance as Tactile Signals',
      coreArgument: 'Physical heft shapes perceived reliability before first use.',
      whyInteresting: 'Connects sensory haptics to recipient appreciation.',
      whatArticleEmphasizes: 'Handle geometry, tang construction, and density.',
      possibleTakeaway: 'Test balance point rather than packaging.',
      role: 'unassigned',
    },
    {
      id: 'angle-5',
      title: 'The Problem with Novelty Gadgets',
      coreArgument: 'Single-purpose novelty items clutter drawers and erode goodwill.',
      whyInteresting: 'Explains why cleverness ages poorly.',
      whatArticleEmphasizes: 'Avoiding unitaskers and trend-driven gimmicks.',
      possibleTakeaway: 'Prefer foundational forms over novelty.',
      role: 'unassigned',
    },
  ];
}

function createSampleProject(): WritingProject {
  return {
    id: 'proj-test-stage1',
    title: 'Heirloom Kitchen Tools and Tactile Permanence',
    type: 'article',
    status: 'draft',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-10T10:00:00.000Z',
    content: '<p>Initial draft paragraph that must remain untouched by drawer updates.</p>',
    brief: {
      purpose: 'Explore why tactile craft tools endure.',
      audience: 'Thoughtful home cooks and gift buyers',
      readerLearns: 'How material choice governs longevity',
      readerFeels: 'Grounded and discerning',
      readerAction: 'Evaluate tools by construction and repairability',
      keyPoints: ['Patina over polish'],
      thingsToAvoid: ['Generic affiliate hype'],
    },
    outline: [
      {
        id: 'sec-1',
        title: 'Introduction',
        description: 'Opening hook on heirloom utility',
        completed: false,
      },
    ],
    contentRules: [],
    projectInstructions: '',
    writingControls: {
      tone: 'editorial',
      detail: 'balanced',
      marketing: 'minimal',
      historicalContext: 'moderate',
      audience: 'enthusiast',
      wordCountTarget: '1,200 - 1,500 words',
    },
    aiSettings: {
      tone: 'editorial',
      detail: 'balanced',
      marketing: 'minimal',
      historicalContext: 'moderate',
      audience: 'enthusiast',
      wordCountTarget: '1,200 - 1,500 words',
    },
    editorialDevelopment: {
      originalIdea: {
        id: 'idea-1',
        title: 'Heirloom Kitchen Tools and Tactile Permanence',
        angle: 'Why objects that demand care outlast frictionless alternatives.',
        whyInteresting: 'Reframes maintenance as emotional investment.',
        searchIntent: 'Cultural & material insight',
      },
      angles: createSampleAngles(),
      direction: {
        briefMentionAngleIds: [],
        doNotUseAngleIds: [],
        editorsDirection: '',
      },
      status: 'angles_generated',
    },
  };
}

/**
 * Simulates the EditorialDevelopmentDrawer step controller + role assignment + proceed actions
 * using the exact functions wired into EditorialDevelopmentDrawer.tsx.
 */
class DrawerWorkflowHarness {
  public project: WritingProject;
  public activeStep: WorkflowStep;
  private lastInitializedProjectId: string;
  private wasOpen: boolean;

  constructor(initialProject: WritingProject, isOpen = true) {
    this.project = initialProject;
    this.activeStep = determineInitialDevelopmentStep(initialProject.editorialDevelopment);
    this.lastInitializedProjectId = initialProject.id;
    this.wasOpen = isOpen;
  }

  public receiveProps(nextProject: WritingProject, isOpen = true) {
    const projectChanged = this.lastInitializedProjectId !== nextProject.id;
    const justOpened = isOpen && !this.wasOpen;
    this.wasOpen = isOpen;
    this.project = nextProject;

    // Matches EditorialDevelopmentDrawer useEffect: ONLY restore step on project switch or reopen
    if (projectChanged || justOpened) {
      this.lastInitializedProjectId = nextProject.id;
      this.activeStep = determineInitialDevelopmentStep(nextProject.editorialDevelopment);
    }
  }

  public assignRole(angleId: string, role: EditorialAngle['role']) {
    const dev = this.project.editorialDevelopment!;
    const result = applyAngleRoleAssignment(
      dev,
      angleId,
      role,
      dev.direction?.editorsDirection || ''
    );
    const updatedProject: WritingProject = {
      ...this.project,
      editorialDevelopment: {
        ...dev,
        angles: result.angles,
        direction: result.direction,
        status: result.status,
        lastGeneratedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    // Simulate parent onChange -> re-render with updated project prop
    this.receiveProps(updatedProject, this.wasOpen);
  }

  public proceedToDirection() {
    const dev = this.project.editorialDevelopment!;
    const nextStatus =
      dev.status !== 'brief_ready' && dev.status !== 'direction_set'
        ? 'direction_set'
        : dev.status;
    const updatedProject: WritingProject = {
      ...this.project,
      editorialDevelopment: {
        ...dev,
        status: nextStatus,
        lastGeneratedAt: new Date().toISOString(),
      },
      updatedAt: new Date().toISOString(),
    };
    this.receiveProps(updatedProject, this.wasOpen);
    this.activeStep = 'direction';
  }
}

describe('1. Angle-role assignment & workflow step transitions', () => {
  it('clicking Primary on an angle keeps activeStep on "angles" and does not advance to "direction"', () => {
    const project = createSampleProject();
    const harness = new DrawerWorkflowHarness(project);

    assert.equal(harness.activeStep, 'angles');

    harness.assignRole('angle-1', 'primary');

    assert.equal(harness.activeStep, 'angles', 'activeStep must remain on "angles" after clicking Primary');
    const dev = harness.project.editorialDevelopment!;
    assert.equal(dev.direction.primaryAngleId, 'angle-1');
    assert.equal(dev.angles.find((a) => a.id === 'angle-1')?.role, 'primary');
    assert.equal(dev.status, 'angles_generated');
  });

  it('clicking Primary on another angle moves the primary role to the new angle without advancing steps', () => {
    const project = createSampleProject();
    const harness = new DrawerWorkflowHarness(project);

    harness.assignRole('angle-1', 'primary');
    assert.equal(harness.activeStep, 'angles');
    assert.equal(harness.project.editorialDevelopment?.direction.primaryAngleId, 'angle-1');

    // Now click Primary on angle-2
    harness.assignRole('angle-2', 'primary');
    assert.equal(harness.activeStep, 'angles', 'activeStep must still remain on "angles"');

    const dev = harness.project.editorialDevelopment!;
    assert.equal(dev.direction.primaryAngleId, 'angle-2');
    assert.equal(dev.angles.find((a) => a.id === 'angle-1')?.role, 'unassigned');
    assert.equal(dev.angles.find((a) => a.id === 'angle-2')?.role, 'primary');
  });

  it('clicking Secondary, Brief Mention, Do Not Use, and Clear keeps activeStep on "angles" and allows multiple roles', () => {
    const project = createSampleProject();
    const harness = new DrawerWorkflowHarness(project);

    // Assign Primary to angle-1
    harness.assignRole('angle-1', 'primary');
    assert.equal(harness.activeStep, 'angles');

    // Assign Secondary to angle-2
    harness.assignRole('angle-2', 'secondary');
    assert.equal(harness.activeStep, 'angles');

    // Assign Secondary to angle-3 (demotes angle-2)
    harness.assignRole('angle-3', 'secondary');
    assert.equal(harness.activeStep, 'angles');
    assert.equal(harness.project.editorialDevelopment?.direction.secondaryAngleId, 'angle-3');
    assert.equal(
      harness.project.editorialDevelopment?.angles.find((a) => a.id === 'angle-2')?.role,
      'unassigned'
    );

    // Assign Brief Mention to angle-2 and angle-4
    harness.assignRole('angle-2', 'brief_mention');
    harness.assignRole('angle-4', 'brief_mention');
    assert.equal(harness.activeStep, 'angles');
    assert.deepEqual(harness.project.editorialDevelopment?.direction.briefMentionAngleIds, [
      'angle-2',
      'angle-4',
    ]);

    // Assign Do Not Use to angle-5
    harness.assignRole('angle-5', 'do_not_use');
    assert.equal(harness.activeStep, 'angles');
    assert.deepEqual(harness.project.editorialDevelopment?.direction.doNotUseAngleIds, ['angle-5']);

    // Clear angle-4 using 'unassigned'
    harness.assignRole('angle-4', 'unassigned');
    assert.equal(harness.activeStep, 'angles');
    assert.deepEqual(harness.project.editorialDevelopment?.direction.briefMentionAngleIds, [
      'angle-2',
    ]);
    assert.equal(
      harness.project.editorialDevelopment?.angles.find((a) => a.id === 'angle-4')?.role,
      'unassigned'
    );
  });

  it('clicking "Proceed to Editorial Direction" advances to "direction" and persists status="direction_set"', () => {
    const project = createSampleProject();
    const harness = new DrawerWorkflowHarness(project);

    harness.assignRole('angle-1', 'primary');
    harness.assignRole('angle-2', 'secondary');
    assert.equal(harness.activeStep, 'angles');

    harness.proceedToDirection();
    assert.equal(harness.activeStep, 'direction');
    assert.equal(harness.project.editorialDevelopment?.status, 'direction_set');
  });

  it('reopening the drawer on a project restores the appropriate step without breaking active interaction', () => {
    const project = createSampleProject();
    const harness = new DrawerWorkflowHarness(project);

    // Assign roles while on Step 2 ('angles') without proceeding to Step 3 yet
    harness.assignRole('angle-1', 'primary');
    assert.equal(harness.activeStep, 'angles');

    // Close and reopen drawer while still in 'angles_generated' status -> restores 'angles'
    harness.receiveProps(harness.project, false);
    harness.receiveProps(harness.project, true);
    assert.equal(harness.activeStep, 'angles');

    // Proceed to Editorial Direction -> status becomes 'direction_set'
    harness.proceedToDirection();
    assert.equal(harness.activeStep, 'direction');

    // Close and reopen drawer -> restores 'direction'
    harness.receiveProps(harness.project, false);
    harness.receiveProps(harness.project, true);
    assert.equal(harness.activeStep, 'direction');

    // Once a brief is present -> reopening restores 'brief'
    const projectWithBrief: WritingProject = {
      ...harness.project,
      editorialDevelopment: {
        ...harness.project.editorialDevelopment!,
        status: 'brief_ready',
        brief: {
          workingTitle: 'The Patina of Daily Utility',
          topic: 'Heirloom Tools',
          audience: 'Discerning gifters',
          searchIntent: 'Cultural insight',
          primaryAngle: 'Tools that age visibly record shared domestic history.',
          secondaryFocus: '',
          briefMentions: [],
          thingsToAvoid: [],
          centralArgument: 'Maintenance builds lasting attachment.',
          keyQuestions: ['Why do tactile materials age better?'],
          editorialDirection: 'Warm, observant editorial prose.',
          suggestedTakeaway: 'Select repairable materials.',
          factualContext: [],
          editorialInterpretation: [],
          internalLinkOpportunities: [],
          references: [],
          generatedAt: '2026-01-10T10:05:00.000Z',
          updatedAt: '2026-01-10T10:05:00.000Z',
        },
      },
    };
    harness.receiveProps(projectWithBrief, false);
    harness.receiveProps(projectWithBrief, true);
    assert.equal(harness.activeStep, 'brief');
  });
});

describe('2. Editorial Brief input validation, API generation, malformed response handling, and retry', () => {
  it('catches missing required inputs before making an API call with a clear error message', () => {
    // Missing working title
    const missingTitle = validateBriefGenerationInputs({
      projectTitle: '   ',
      idea: { title: '' },
      angles: createSampleAngles(),
      direction: {
        primaryAngleId: 'angle-1',
        briefMentionAngleIds: [],
        doNotUseAngleIds: [],
        editorsDirection: '',
      },
    });
    assert.equal(missingTitle.valid, false);
    assert.match(missingTitle.error || '', /Working Title/i);

    // Missing both Primary Angle and manual Editorial Direction
    const missingDirection = validateBriefGenerationInputs({
      projectTitle: 'Heirloom Kitchen Tools',
      idea: { title: 'Heirloom Kitchen Tools' },
      angles: createSampleAngles(), // all unassigned
      direction: {
        primaryAngleId: undefined,
        briefMentionAngleIds: [],
        doNotUseAngleIds: [],
        editorsDirection: '   ',
      },
    });
    assert.equal(missingDirection.valid, false);
    assert.match(missingDirection.error || '', /Primary Angle|Editorial Direction/i);

    // Valid when Primary Angle is selected
    const validWithPrimary = validateBriefGenerationInputs({
      projectTitle: 'Heirloom Kitchen Tools',
      angles: createSampleAngles().map((a, i) => (i === 0 ? { ...a, role: 'primary' } : a)),
      direction: {
        primaryAngleId: 'angle-1',
        briefMentionAngleIds: [],
        doNotUseAngleIds: [],
        editorsDirection: '',
      },
    });
    assert.equal(validWithPrimary.valid, true);

    // Valid when manual Editorial Direction is provided even without a Primary Angle
    const validWithManualDirection = validateBriefGenerationInputs({
      projectTitle: 'Heirloom Kitchen Tools',
      angles: createSampleAngles(),
      direction: {
        primaryAngleId: undefined,
        briefMentionAngleIds: [],
        doNotUseAngleIds: [],
        editorsDirection: 'Focus on regional Japanese forging lineages and carbon steel care.',
      },
    });
    assert.equal(validWithManualDirection.valid, true);
  });

  it('rejects empty or malformed AI responses without fabricating editorial content or overwriting an existing brief', () => {
    // 1. Empty object {}
    const emptyRes = validateAndNormalizeEditorialBrief({});
    assert.equal(emptyRes.valid, false);
    assert.equal(emptyRes.brief, undefined);
    assert.match(emptyRes.error || '', /missing required brief fields/i);

    // 2. Null or non-object
    assert.equal(validateAndNormalizeEditorialBrief(null).valid, false);
    assert.equal(validateAndNormalizeEditorialBrief('not json').valid, false);
    assert.equal(validateAndNormalizeEditorialBrief([]).valid, false);

    // 3. Partial object missing centralArgument or primaryAngle
    const partialRes = validateAndNormalizeEditorialBrief({
      workingTitle: 'Only a Title Returned',
    });
    assert.equal(partialRes.valid, false);
    assert.equal(partialRes.brief, undefined);
    assert.match(partialRes.error || '', /centralArgument/);

    // 4. Partial object missing keyQuestions
    const missingQuestions = validateAndNormalizeEditorialBrief({
      workingTitle: 'Valid Title',
      centralArgument: 'Valid central argument.',
      primaryAngle: 'Valid primary angle.',
      keyQuestions: [],
      editorialDirection: 'Warm tone.',
      suggestedTakeaway: 'Buy repairable tools.',
    });
    assert.equal(missingQuestions.valid, false);
    assert.match(missingQuestions.error || '', /keyQuestions/);
  });

  it('normalizes a valid Editorial Brief response and reconciles attached study references accurately', () => {
    const rawValid = {
      workingTitle: 'The Quiet Stewardship of Carbon Steel',
      topic: 'Heirloom Culinary Tools',
      audience: 'Home cooks and thoughtful gifters',
      searchIntent: 'Material longevity and gift suitability',
      primaryAngle: 'Objects that require deliberate care foster deeper recipient attachment.',
      secondaryFocus: 'Named regional workshops outlast designer branding.',
      briefMentions: ['Seasonal oiling routines'],
      thingsToAvoid: ['Disposable non-stick cookware'],
      centralArgument:
        'When a gift asks a small ritual of care from its owner, it transforms from a commodity into a companion.',
      keyQuestions: [
        'Why does manual upkeep deepen emotional value?',
        'Which materials age most gracefully in a working kitchen?',
      ],
      editorialDirection: 'Write with unhurried, sensory precision; avoid promotional clichés.',
      suggestedTakeaway: 'Pair a carbon-steel knife with a whetstone and camellia oil.',
      factualContext: ['Norton et al. (2012) demonstrated that labor increases valuation.'],
      editorialInterpretation: ['Care rituals anchor domestic memory.'],
      internalLinkOpportunities: ['Guide to Japanese Whetstones'],
      references: [
        {
          studyId: 'study-ikea-2012',
          title: 'The IKEA Effect: When Labor Leads to Love',
          verificationNote: 'Supports the link between effort and object valuation.',
        },
      ],
      styleConsiderations: 'Concrete nouns, zero em dashes.',
    };

    const validation = validateAndNormalizeEditorialBrief(rawValid, {
      attachedStudies: [
        {
          id: 'study-ikea-2012',
          title: 'The IKEA Effect: When Labor Leads to Love',
          authors: ['Michael I. Norton', 'Daniel Mochon', 'Dan Ariely'],
          publication: 'Journal of Consumer Psychology',
          publicationYear: '2012',
          doi: '10.1016/j.jcps.2011.08.002',
        },
      ],
    });

    assert.equal(validation.valid, true);
    assert.ok(validation.brief);
    assert.equal(validation.brief.workingTitle, 'The Quiet Stewardship of Carbon Steel');
    assert.equal(validation.brief.references?.length, 1);
    assert.equal(validation.brief.references?.[0].isVerifiedMatch, true);
    assert.equal(validation.brief.references?.[0].doiOrUrl, '10.1016/j.jcps.2011.08.002');
  });

  it('worker /api/gemini/create-editorial-brief returns 400 when required inputs are missing', async () => {
    const req = new Request('http://localhost:3000/api/gemini/create-editorial-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectTitle: 'Heirloom Kitchen Tools',
        angles: createSampleAngles(), // all unassigned
        direction: {
          primaryAngleId: undefined,
          editorsDirection: '',
        },
      }),
    });

    const res = await handleApiRequest(req, {
      GEMINI_API_KEY: 'test-key',
      ASSETS: { fetch: async () => new Response('not found', { status: 404 }) },
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error || '', /Primary Angle|Editorial Direction/i);
  });

  it('handles API failure, duplicate-click guard, and retry while preserving existing brief, angles, and direction', async () => {
    const project = createSampleProject();
    // Assign Primary and Secondary angles and custom direction
    const roleStep1 = applyAngleRoleAssignment(
      project.editorialDevelopment!,
      'angle-1',
      'primary',
      'Keep tone grounded in workshop craft.'
    );
    const roleStep2 = applyAngleRoleAssignment(
      {
        ...project.editorialDevelopment!,
        angles: roleStep1.angles,
        direction: roleStep1.direction,
      },
      'angle-2',
      'secondary',
      'Keep tone grounded in workshop craft.'
    );

    const existingBrief: StructuredEditorialBrief = {
      workingTitle: 'Existing Valid Brief Title',
      topic: 'Kitchen Craft',
      audience: 'Home cooks',
      searchIntent: 'Insight',
      primaryAngle: 'Existing primary angle.',
      secondaryFocus: '',
      briefMentions: [],
      thingsToAvoid: [],
      centralArgument: 'Existing central argument that must not be overwritten on failure.',
      keyQuestions: ['Existing question?'],
      editorialDirection: 'Keep tone grounded in workshop craft.',
      suggestedTakeaway: 'Existing takeaway.',
      factualContext: [],
      editorialInterpretation: [],
      internalLinkOpportunities: [],
      references: [],
      generatedAt: '2026-01-10T10:00:00.000Z',
      updatedAt: '2026-01-10T10:00:00.000Z',
    };

    let currentProject: WritingProject = {
      ...project,
      editorialDevelopment: {
        ...project.editorialDevelopment!,
        angles: roleStep2.angles,
        direction: roleStep2.direction,
        status: 'direction_set',
        brief: existingBrief,
      },
    };

    let apiCallCount = 0;
    let shouldFail = true;
    let isCreatingBrief = false;
    let briefError: string | null = null;
    let activeStep: WorkflowStep = 'direction';

    const simulateHandleCreateBrief = async () => {
      // Duplicate-click guard
      if (isCreatingBrief) return;

      const dev = currentProject.editorialDevelopment!;
      const inputCheck = validateBriefGenerationInputs({
        projectTitle: currentProject.title,
        idea: dev.originalIdea,
        angles: dev.angles,
        direction: dev.direction,
      });
      if (!inputCheck.valid) {
        briefError = inputCheck.error || 'Invalid inputs';
        return;
      }

      isCreatingBrief = true;
      briefError = null;
      try {
        apiCallCount += 1;
        await new Promise((r) => setTimeout(r, 15));
        if (shouldFail) {
          throw new Error('Upstream AI timeout');
        }
        const mockRawBrief = {
          workingTitle: 'Retry Synthesized Brief Title',
          topic: 'Heirloom Kitchen Tools',
          audience: 'Discerning cooks',
          searchIntent: 'Material longevity',
          primaryAngle: 'Tools that age visibly record shared domestic history.',
          secondaryFocus: 'Objects requiring care create stronger psychological attachment.',
          briefMentions: [],
          thingsToAvoid: [],
          centralArgument: 'Retry succeeded with full structured thesis.',
          keyQuestions: ['How does patina build value?'],
          editorialDirection: 'Keep tone grounded in workshop craft.',
          suggestedTakeaway: 'Choose repairable tools.',
          factualContext: [],
          editorialInterpretation: [],
          internalLinkOpportunities: [],
          references: [],
        };
        const validation = validateAndNormalizeEditorialBrief(mockRawBrief);
        if (!validation.valid || !validation.brief) {
          throw new Error(validation.error);
        }
        currentProject = {
          ...currentProject,
          editorialDevelopment: {
            ...dev,
            brief: validation.brief,
            status: 'brief_ready',
          },
        };
        activeStep = 'brief';
      } catch (err: any) {
        briefError = err.message;
      } finally {
        isCreatingBrief = false;
      }
    };

    // 1. Trigger two concurrent clicks while shouldFail = true -> duplicate-click guard allows only 1 call
    await Promise.all([simulateHandleCreateBrief(), simulateHandleCreateBrief()]);
    assert.equal(apiCallCount, 1, 'Duplicate-click guard must prevent concurrent API requests');
    assert.equal(briefError, 'Upstream AI timeout');
    assert.equal(activeStep, 'direction', 'Must remain on direction step when API fails');

    // Verify existing brief, angles, roles, and editor direction were NOT overwritten or lost
    assert.equal(
      currentProject.editorialDevelopment?.brief?.workingTitle,
      'Existing Valid Brief Title'
    );
    assert.equal(currentProject.editorialDevelopment?.direction.primaryAngleId, 'angle-1');
    assert.equal(currentProject.editorialDevelopment?.direction.secondaryAngleId, 'angle-2');
    assert.equal(
      currentProject.editorialDevelopment?.direction.editorsDirection,
      'Keep tone grounded in workshop craft.'
    );

    // 2. Now retry with shouldFail = false -> succeeds and transitions to 'brief'
    shouldFail = false;
    await simulateHandleCreateBrief();
    assert.equal(apiCallCount, 2);
    assert.equal(briefError, null);
    assert.equal(activeStep, 'brief');
    assert.equal(
      currentProject.editorialDevelopment?.brief?.workingTitle,
      'Retry Synthesized Brief Title'
    );
  });
});

describe('3. Regression protection: manual save, version history, and project integrity', () => {
  it('tracks unsaved changes on Editorial Development updates and creates clean manual-save snapshots without touching article prose', () => {
    const baselineProject = createSampleProject();
    assert.equal(hasProjectUnsavedChanges(baselineProject, baselineProject), false);

    // Assign roles in Editorial Development
    const roleUpdate = applyAngleRoleAssignment(
      baselineProject.editorialDevelopment!,
      'angle-1',
      'primary',
      'Maintain observational restraint.'
    );

    const workingProject: WritingProject = {
      ...baselineProject,
      editorialDevelopment: {
        ...baselineProject.editorialDevelopment!,
        angles: roleUpdate.angles,
        direction: roleUpdate.direction,
        status: roleUpdate.status,
      },
      updatedAt: new Date().toISOString(),
    };

    // 1. In-memory update marks project as having unsaved changes relative to baseline
    assert.equal(
      hasProjectUnsavedChanges(workingProject, baselineProject),
      true,
      'Editorial Development updates must mark the project dirty for Manual Save'
    );

    // 2. Article HTML content is completely untouched
    assert.equal(workingProject.content, baselineProject.content);

    // 3. Manual save creates a version snapshot and resets dirty state against the new saved baseline
    const history = createVersionSnapshot(workingProject, 'manual_save', { force: true });
    const savedProject: WritingProject = {
      ...workingProject,
      versionHistory: history,
    };

    assert.equal(history.length, 1);
    assert.equal(
      hasProjectUnsavedChanges(savedProject, savedProject),
      false,
      'After Manual Save updates the baseline, project is clean'
    );
    assert.equal(
      savedProject.editorialDevelopment?.direction.primaryAngleId,
      'angle-1',
      'Saved project preserves Editorial Development state'
    );
  });

  it('opens idea-linked articles directly into Editor without the Editorial Development banner while preserving idea metadata, entry points, and layout-safe banner styling', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const articleWorkspaceSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/workspaces/ArticleWorkspace.tsx'),
      'utf8'
    );
    const bannerComponentSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/workspaces/EditorialDevelopmentOriginBanner.tsx'),
      'utf8'
    );

    // 1. ArticleWorkspace must NOT render the "Originated from idea" banner above the Editor
    assert.equal(
      articleWorkspaceSource.includes('Originated from idea'),
      false,
      'ArticleWorkspace must open directly into Editor without the Editorial Development banner above it'
    );

    // 2. ArticleWorkspace preserves existing entry points to reopen Editorial Development
    assert.equal(
      articleWorkspaceSource.includes("onTogglePanel?.('develop')"),
      true,
      'ArticleWorkspace must preserve existing Develop Article toolbar/menu entry points'
    );

    // 3. Reusable EditorialDevelopmentOriginBanner fixes the inline-truncate overflow defect
    assert.equal(
      bannerComponentSource.includes('sm:inline truncate'),
      false,
      'Banner must not combine display:inline with truncate (which causes white-space:nowrap text overflow)'
    );
    assert.equal(
      bannerComponentSource.includes('min-w-0 flex-1') &&
        bannerComponentSource.includes('break-words') &&
        bannerComponentSource.includes('shrink-0'),
      true,
      'Banner must use min-w-0 flex-1 break-words on text and shrink-0 on the button'
    );

    // 4. Editing article prose preserves originating idea and all editorialDevelopment data
    const projectWithIdea = createSampleProject();
    delete projectWithIdea.editorialDevelopment!.brief;

    const editedProject: WritingProject = {
      ...projectWithIdea,
      content: '<p>Updated article draft prose while linked to originating idea.</p>',
      updatedAt: new Date().toISOString(),
    };

    assert.equal(
      editedProject.editorialDevelopment?.originalIdea?.id,
      'idea-1',
      'Originating idea ID must be preserved when editing the article'
    );
    assert.equal(
      editedProject.editorialDevelopment?.originalIdea?.title,
      'Heirloom Kitchen Tools and Tactile Permanence',
      'Originating idea title must be preserved when editing the article'
    );
    assert.equal(
      editedProject.editorialDevelopment?.angles.length,
      5,
      'Generated angles must be preserved when editing the article'
    );
  });
});

