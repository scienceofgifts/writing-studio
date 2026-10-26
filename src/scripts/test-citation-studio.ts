/**
 * Automated Regression Test Suite for Citation Studio:
 * Evidence-First Recommendations and Research-Backed Writing
 *
 * Verifies all 11 required scenarios using mocked AI responses and isolated in-memory state
 * (zero production Firestore writes):
 * 1. Valid direct citation (Workflow A)
 * 2. Irrelevant / topical-only study rejection from direct citation insertion
 * 3. Unmatched passage failure (never falls back to appending at the end of the article)
 * 4. Ambiguous passage handling (duplicate sentences rejected safely without guessing)
 * 5. Insufficient study evidence handling (marked insufficient_evidence, never verified)
 * 6. Silent verification prevention (missing `isVerifiedMatch` never defaults to `true`)
 * 7. Duplicate/retry protection & re-run deduplication / dismissed state preservation
 * 8. Citation numbering, repeated study number reuse, and removal renumbering
 * 9. Source link preservation (clickable DOI/URL links vs clean output when missing)
 * 10. Research-backed passage workflow (Workflow B: propose -> review/edit -> approve/reject)
 * 11. Save/state integration (dirty-state tracking via hasProjectUnsavedChanges & manual save compatibility)
 */

import assert from 'node:assert/strict';

// In-memory localStorage shim for Node test environment
const memoryStorage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => (memoryStorage.has(key) ? memoryStorage.get(key)! : null),
  setItem: (key: string, value: string) => {
    memoryStorage.set(key, String(value));
  },
  removeItem: (key: string) => {
    memoryStorage.delete(key);
  },
  clear: () => {
    memoryStorage.clear();
  },
  key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
  get length() {
    return memoryStorage.size;
  },
};

import {
  verifyTargetPassageInHtml,
  insertCitationIntoHtml,
  insertDraftedPassageWithCitation,
  removeCitationFromHtml,
  syncCitationsAndReferences,
  mergeCitationRecommendations,
} from '../utils/citationUtils';
import { researchService } from '../services/researchService';
import { ResearchStudy } from '../types/research';
import { WritingProject } from '../types/project';
import { hasProjectUnsavedChanges } from '../services/versionHistoryService';

function createTestStudies(): ResearchStudy[] {
  const now = '2026-10-25T12:00:00.000Z';
  return [
    {
      id: 'study-galak-2016',
      title: 'Why Certain Gifts Are Great to Give but Not to Get: A Framework for Understanding Errors in Gift Giving',
      authors: ['Jeff Galak', 'Julian Givi', 'Elanor F. Williams'],
      publication: 'Current Directions in Psychological Science',
      publicationYear: 2016,
      doi: '10.1177/0963721416656937',
      sourceUrl: 'https://doi.org/10.1177/0963721416656937',
      abstract:
        'Gift givers frequently prioritize the moment of exchange, whereas recipients value long-term utility and repeated daily use over months and years.',
      tags: ['gift psychology', 'utility'],
      dateAdded: now,
      analysisStatus: 'analyzed',
      analysis: {
        id: 'ana-1',
        studyId: 'study-galak-2016',
        analyzedAt: now,
        whatWasStudied: 'Divergence between gift givers and gift recipients across exchange vs ownership horizons.',
        whatTheStudyFound: [
          'Givers focus disproportionately on the initial reaction at the moment of unwrapping, whereas recipients evaluate gifts based on long-term utility during ownership.',
        ],
        whatItMeans: 'Practical, durable everyday instruments outperform novelty items over time.',
        whatItDoesNotEstablish: ['Does not measure specific metallic alloys.'],
        methodology: 'Review of experimental dyadic gift-exchange studies.',
        limitations: ['Primarily Western consumer cohorts in controlled survey and lab settings.'],
        editorialUse: ['Use to substantiate claims about giver-recipient asymmetry and long-term utility.'],
        potentialArticleIdeas: [],
      },
      claims: [
        {
          id: 'claim-galak-1',
          studyId: 'study-galak-2016',
          claimText:
            'Gift givers focus on the moment of exchange while recipients care about long-term utility.',
          claimType: 'source_fact',
          supportedBySource:
            'Givers focus on the moment of exchange, whereas recipients focus on how valuable a gift is throughout ownership.',
          confidence: 'high',
          relevantLimitation: 'Lab and survey cohorts.',
          createdAt: now,
          updatedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'study-topical-packaging-2021',
      title: 'Ribbon Color and Festive Box Wrapping in Holiday Retail',
      authors: ['Clara Vance', 'Martin Lind'],
      publication: 'Journal of Retail Packaging',
      publicationYear: 2021,
      sourceUrl: 'https://example.com/studies/ribbon-color-2021',
      abstract:
        'Investigates how satin ribbon width influences perceived luxury in department store cosmetics counters.',
      tags: ['packaging', 'retail'],
      dateAdded: now,
      analysisStatus: 'analyzed',
      analysis: {
        id: 'ana-2',
        studyId: 'study-topical-packaging-2021',
        analyzedAt: now,
        whatWasStudied: 'Satin ribbon width in department store cosmetics.',
        whatTheStudyFound: [
          'Wider satin ribbons increased perceived box formality in holiday cosmetics displays.',
        ],
        whatItMeans: 'Wrapping aesthetics affect initial retail shelf impressions.',
        whatItDoesNotEstablish: ['Does not study tool longevity, brass patina, or heirloom instruments.'],
        methodology: 'Retail intercept survey (n=210).',
        limitations: ['Limited to disposable retail cosmetics packaging.'],
        editorialUse: ['Only relevant to wrapping paper and ribbon discussions.'],
        potentialArticleIdeas: [],
      },
      claims: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'study-empty-no-evidence',
      title: 'Unanalyzed Working Paper on Material Culture',
      authors: ['H. Arthur'],
      publicationYear: 2023,
      // Intentionally has no DOI, no URL, no abstract, no findings, and no claims
      tags: [],
      dateAdded: now,
      analysisStatus: 'unanalyzed',
      claims: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'study-no-link-craft-2019',
      title: 'Tactile Weight and Perceived Permanence in Hand Tools',
      authors: ['Eleanor Vance'],
      publication: 'Archive of Material Ergonomics',
      publicationYear: 2019,
      // Intentionally has no DOI or URL to test clean reference rendering without links
      abstract:
        'Participants rated heavier solid-brass and steel hand tools as significantly more durable and worthy of long-term repair than lightweight polymer equivalents.',
      tags: ['ergonomics', 'weight'],
      dateAdded: now,
      analysisStatus: 'analyzed',
      analysis: {
        id: 'ana-4',
        studyId: 'study-no-link-craft-2019',
        analyzedAt: now,
        whatWasStudied: 'Effect of tool mass and material density on perceived permanence and repair intent.',
        whatTheStudyFound: [
          'Higher-mass brass and steel tools elicited stronger intentions to maintain and pass down the object compared to lightweight polymer tools.',
        ],
        whatItMeans: 'Physical mass reinforces psychological attachment and stewardship.',
        whatItDoesNotEstablish: ['Does not test electronic devices.'],
        methodology: 'Tactile evaluation experiment (n=140).',
        limitations: ['Measured immediate tactile evaluation rather than multi-decade longitudinal ownership.'],
        editorialUse: ['Supports claims about tool mass and repair stewardship.'],
        potentialArticleIdeas: [],
      },
      claims: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function createSampleArticleProject(): WritingProject {
  const now = '2026-10-25T12:00:00.000Z';
  return {
    id: 'proj-citation-test',
    type: 'article',
    title: 'Why Useful Heirloom Gifts Outlast Novelty Presents',
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    content: [
      '<h2>The Trap of the Unwrapping Moment</h2>',
      '<p>Gift givers often optimize for the theatrical surprise of unwrapping, while recipients judge a gift by its quiet usefulness over years of daily life.</p>',
      '<p>True quality reveals itself over decades.</p>',
      '<h2>The Architecture of Solid Brass</h2>',
      '<p>Machined solid brass develops a warm oxide patina that records the history of the hand that holds it.</p>',
      '<p>True quality reveals itself over decades.</p>',
    ].join('\n'),
    projectInstructions: '',
    brief: {
      purpose: 'Examine why durable gifts outperform novelty items.',
      audience: 'Discerning readers',
      readerLearns: 'Psychology of gift utility and material permanence.',
      readerFeels: 'Thoughtful',
      readerAction: 'Choose lasting utility.',
      keyPoints: [],
      thingsToAvoid: [],
    },
    outline: [],
    contentRules: [],
    writingControls: {
      tone: 'editorial',
      detail: 'balanced',
      marketing: 'minimal',
      historicalContext: 'moderate',
      audience: 'enthusiast',
      wordCountTarget: '1,200 words',
    },
    aiSettings: {
      tone: 'editorial',
      detail: 'balanced',
      marketing: 'minimal',
      historicalContext: 'moderate',
      audience: 'enthusiast',
      wordCountTarget: '1,200 words',
    },
    citationRecommendations: [],
    citedStudies: [],
  };
}

async function runCitationStudioTests() {
  console.log('===================================================================');
  console.log('Running Citation Studio Evidence & Workflow Regression Test Suite');
  console.log('===================================================================\n');

  const studies = createTestStudies();
  let passed = 0;

  // ---------------------------------------------------------------------------
  // TEST 1: Valid direct citation (Workflow A)
  // ---------------------------------------------------------------------------
  {
    const project = createSampleArticleProject();
    const rawAiRecs = [
      {
        studyId: 'study-galak-2016',
        workflowType: 'cite_existing',
        targetPassage:
          'Gift givers often optimize for the theatrical surprise of unwrapping, while recipients judge a gift by its quiet usefulness over years of daily life.',
        relevantFinding:
          'Givers focus disproportionately on the initial reaction at the moment of unwrapping, whereas recipients evaluate gifts based on long-term utility during ownership.',
        supportingEvidence:
          'Givers focus on the moment of exchange, whereas recipients focus on how valuable a gift is throughout ownership.',
        limitationsOrQualifications: 'Primarily Western consumer cohorts in controlled survey and lab settings.',
        explanation: 'Directly substantiates the giver-recipient asymmetry described in this sentence.',
        confidence: 'verified_empirical',
        evidenceType: 'direct_empirical',
        isVerifiedMatch: true,
      },
    ];

    const validated = researchService.validateAndEnrichCitationRecommendations(
      rawAiRecs,
      studies,
      project.content
    );
    assert.equal(validated.length, 1, 'Should validate 1 direct recommendation');
    const rec = validated[0];
    assert.equal(rec.isVerifiedMatch, true, 'Valid empirical match must be verified');
    assert.equal(rec.verificationStatus, 'verified');
    assert.equal(rec.isInsertionReady, true);
    assert.equal(rec.workflowType, 'cite_existing');
    assert.ok(rec.limitationsOrQualifications?.includes('Western consumer cohorts'));

    const insertRes = insertCitationIntoHtml(project.content, rec, studies);
    assert.equal(insertRes.success, true, 'Insertion into unique verified sentence must succeed');
    assert.equal(insertRes.citationNumber, 1);
    assert.ok(
      insertRes.updatedHtml.includes(
        'years of daily life<sup class="citation-ref text-[11px] font-semibold text-amber-900 select-none cursor-pointer" data-study-id="study-galak-2016">1</sup>.</p>'
      ),
      'Citation [1] must be placed at the exact target sentence before the period'
    );
    assert.ok(
      insertRes.updatedHtml.includes('data-references-section="true"'),
      'References section must be generated'
    );
    assert.equal(insertRes.citedStudies.length, 1);
    assert.equal(insertRes.citedStudies[0].studyId, 'study-galak-2016');

    console.log('✓ Test 1 Passed: Valid direct citation verified, inserted at exact sentence, and added to References');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Irrelevant / topical-only study rejection from direct citation insertion
  // ---------------------------------------------------------------------------
  {
    const project = createSampleArticleProject();
    // Study is about ribbon packaging; AI returns it as background_context or conceptual without verified empirical match
    const rawAiRecs = [
      {
        studyId: 'study-topical-packaging-2021',
        workflowType: 'cite_existing',
        targetPassage:
          'Machined solid brass develops a warm oxide patina that records the history of the hand that holds it.',
        relevantFinding: 'Wider satin ribbons increased perceived box formality in holiday cosmetics displays.',
        explanation: 'Both discuss gift presentation and material appearance.',
        confidence: 'conceptual_support',
        evidenceType: 'background_context',
        isVerifiedMatch: false,
      },
    ];

    const validated = researchService.validateAndEnrichCitationRecommendations(
      rawAiRecs,
      studies,
      project.content
    );
    assert.equal(validated.length, 1);
    assert.equal(validated[0].isVerifiedMatch, false, 'Topical-only study must not be marked verified');
    assert.equal(validated[0].isInsertionReady, false, 'Topical-only study must not be insertion-ready');
    assert.equal(validated[0].verificationStatus, 'needs_review');

    console.log('✓ Test 2 Passed: Irrelevant / topical-only study is rejected from direct verified insertion');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Unmatched passage failure (no fallback to end of article)
  // ---------------------------------------------------------------------------
  {
    const project = createSampleArticleProject();
    const originalHtml = project.content;
    const unmatchedRec = {
      studyId: 'study-galak-2016',
      targetPassage: 'This sentence does not exist anywhere in the current article draft.',
    };

    const passageCheck = verifyTargetPassageInHtml(originalHtml, unmatchedRec.targetPassage);
    assert.equal(passageCheck.status, 'not_found');
    assert.equal(passageCheck.canInsert, false);

    const insertRes = insertCitationIntoHtml(originalHtml, unmatchedRec, studies);
    assert.equal(insertRes.success, false, 'Insertion must fail when target passage does not exist');
    assert.equal(
      insertRes.updatedHtml,
      originalHtml,
      'Article HTML must remain completely unchanged (never append to last </p>)'
    );
    assert.ok(insertRes.errorReason?.includes('not match'));

    console.log('✓ Test 3 Passed: Unmatched passage fails safely without modifying article or appending to end');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Ambiguous passage handling (duplicate sentences in article)
  // ---------------------------------------------------------------------------
  {
    const project = createSampleArticleProject();
    const originalHtml = project.content;
    // "True quality reveals itself over decades." appears twice in `createSampleArticleProject()`
    const duplicateSentence = 'True quality reveals itself over decades.';

    const check = verifyTargetPassageInHtml(originalHtml, duplicateSentence);
    assert.equal(check.status, 'ambiguous', 'Duplicate sentence must be flagged as ambiguous');
    assert.equal(check.matchCount, 2);
    assert.equal(check.canInsert, false);

    const validated = researchService.validateAndEnrichCitationRecommendations(
      [
        {
          studyId: 'study-galak-2016',
          workflowType: 'cite_existing',
          targetPassage: duplicateSentence,
          relevantFinding: 'Givers focus on exchange while recipients value long-term utility.',
          supportingEvidence: 'Recipients focus on how valuable a gift is throughout ownership.',
          confidence: 'verified_empirical',
          evidenceType: 'direct_empirical',
          isVerifiedMatch: true,
        },
      ],
      studies,
      originalHtml
    );
    assert.equal(validated[0].verificationStatus, 'ambiguous_passage');
    assert.equal(validated[0].isVerifiedMatch, false);
    assert.equal(validated[0].isInsertionReady, false);

    const insertRes = insertCitationIntoHtml(
      originalHtml,
      { studyId: 'study-galak-2016', targetPassage: duplicateSentence },
      studies
    );
    assert.equal(insertRes.success, false, 'Ambiguous passage must not guess silently');
    assert.equal(insertRes.updatedHtml, originalHtml);

    console.log('✓ Test 4 Passed: Ambiguous duplicate passage is detected and blocked from silent guessing');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Insufficient study evidence handling
  // ---------------------------------------------------------------------------
  {
    const project = createSampleArticleProject();
    const rawAiRecs = [
      {
        studyId: 'study-empty-no-evidence',
        workflowType: 'cite_existing',
        targetPassage:
          'Machined solid brass develops a warm oxide patina that records the history of the hand that holds it.',
        // Even if the AI claims isVerifiedMatch: true, the library study has NO findings/claims/abstract
        isVerifiedMatch: true,
        confidence: 'verified_empirical',
        evidenceType: 'direct_empirical',
      },
    ];

    const validated = researchService.validateAndEnrichCitationRecommendations(
      rawAiRecs,
      studies,
      project.content
    );
    assert.equal(validated.length, 1);
    assert.equal(
      validated[0].verificationStatus,
      'insufficient_evidence',
      'Study without library findings/claims/abstract must be marked insufficient_evidence'
    );
    assert.equal(validated[0].isVerifiedMatch, false);
    assert.equal(validated[0].isInsertionReady, false);
    assert.equal(
      validated[0].relevantFinding,
      '',
      'Must never invent a generic fallback relevantFinding string'
    );

    console.log('✓ Test 5 Passed: Study lacking library evidence is marked insufficient_evidence and never verified');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Silent verification prevention (`isVerifiedMatch` missing / undefined)
  // ---------------------------------------------------------------------------
  {
    const project = createSampleArticleProject();
    const rawAiRecs = [
      {
        studyId: 'study-galak-2016',
        workflowType: 'cite_existing',
        targetPassage:
          'Gift givers often optimize for the theatrical surprise of unwrapping, while recipients judge a gift by its quiet usefulness over years of daily life.',
        relevantFinding:
          'Givers focus disproportionately on the initial reaction at the moment of unwrapping.',
        confidence: 'verified_empirical',
        // `isVerifiedMatch` intentionally omitted (undefined)
      },
    ];

    const validated = researchService.validateAndEnrichCitationRecommendations(
      rawAiRecs,
      studies,
      project.content
    );
    assert.equal(validated.length, 1);
    assert.equal(
      validated[0].isVerifiedMatch,
      false,
      'Missing isVerifiedMatch from AI response must NEVER default to true'
    );
    assert.equal(validated[0].isInsertionReady, false);
    assert.equal(validated[0].verificationStatus, 'needs_review');

    console.log('✓ Test 6 Passed: Missing isVerifiedMatch never silently defaults to true');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Duplicate/retry protection & re-run discovery deduplication
  // ---------------------------------------------------------------------------
  {
    const project = createSampleArticleProject();
    const targetSentence =
      'Gift givers often optimize for the theatrical surprise of unwrapping, while recipients judge a gift by its quiet usefulness over years of daily life.';

    // First insertion
    const firstInsert = insertCitationIntoHtml(
      project.content,
      { studyId: 'study-galak-2016', targetPassage: targetSentence },
      studies
    );
    assert.equal(firstInsert.success, true);
    assert.equal(firstInsert.alreadyCited, false);

    // Retry / second insertion of the same study on the same sentence
    const secondInsert = insertCitationIntoHtml(
      firstInsert.updatedHtml,
      { studyId: 'study-galak-2016', targetPassage: targetSentence },
      studies
    );
    assert.equal(secondInsert.success, true);
    assert.equal(secondInsert.alreadyCited, true, 'Retry must be detected as alreadyCited');
    assert.equal(
      secondInsert.updatedHtml,
      firstInsert.updatedHtml,
      'Retrying insertion must not create a second in-text superscript or duplicate reference'
    );
    assert.equal(secondInsert.citedStudies.length, 1);
    assert.equal(secondInsert.citedStudies[0].occurrenceCount, 1);

    // Test deduplication and dismissed preservation when re-running discovery
    const existingDismissed = [
      {
        id: 'rec-dismissed-1',
        studyId: 'study-no-link-craft-2019',
        studyTitle: 'Tactile Weight and Perceived Permanence in Hand Tools',
        authors: ['Eleanor Vance'],
        workflowType: 'cite_existing' as const,
        targetPassage:
          'Machined solid brass develops a warm oxide patina that records the history of the hand that holds it.',
        proposedCitationNumber: 2,
        relevantFinding: 'Higher-mass brass tools elicited stronger intentions to maintain.',
        explanation: 'Supports material permanence.',
        confidence: 'verified_empirical' as const,
        isVerifiedMatch: true,
        status: 'dismissed' as const,
        createdAt: '2026-10-25T12:00:00.000Z',
      },
    ];

    const incomingDuplicates = [
      {
        ...existingDismissed[0],
        id: 'rec-new-dup-1',
        status: 'pending' as const,
      },
      {
        ...existingDismissed[0],
        id: 'rec-new-dup-2',
        status: 'pending' as const,
      },
    ];

    const merged = mergeCitationRecommendations(
      existingDismissed,
      incomingDuplicates,
      firstInsert.updatedHtml
    );
    assert.equal(merged.length, 1, 'Duplicate recommendations for same passage + study must be deduplicated');
    assert.equal(merged[0].status, 'dismissed', 'Previously dismissed status must be preserved across re-runs');

    console.log('✓ Test 7 Passed: Duplicate/retry insertion prevented and re-run discovery preserves dismissed items');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Citation numbering, repeated study number reuse, and removal renumbering
  // ---------------------------------------------------------------------------
  {
    const html = [
      '<p>First empirical sentence about gift utility over years of ownership.</p>',
      '<p>Second empirical sentence about heavy brass hand tools and repair stewardship.</p>',
      '<p>Third sentence revisiting giver and recipient utility horizons in gift exchange.</p>',
    ].join('\n');

    // Cite study-galak-2016 on sentence 1 -> [1]
    const step1 = insertCitationIntoHtml(
      html,
      {
        studyId: 'study-galak-2016',
        targetPassage: 'First empirical sentence about gift utility over years of ownership.',
      },
      studies
    );
    assert.equal(step1.success, true);
    assert.equal(step1.citationNumber, 1);

    // Cite study-no-link-craft-2019 on sentence 2 -> [2]
    const step2 = insertCitationIntoHtml(
      step1.updatedHtml,
      {
        studyId: 'study-no-link-craft-2019',
        targetPassage: 'Second empirical sentence about heavy brass hand tools and repair stewardship.',
      },
      studies
    );
    assert.equal(step2.success, true);
    assert.equal(step2.citationNumber, 2);
    assert.equal(step2.citedStudies.length, 2);

    // Cite study-galak-2016 again on sentence 3 -> must reuse [1] and increment occurrenceCount to 2
    const step3 = insertCitationIntoHtml(
      step2.updatedHtml,
      {
        studyId: 'study-galak-2016',
        targetPassage: 'Third sentence revisiting giver and recipient utility horizons in gift exchange.',
      },
      studies
    );
    assert.equal(step3.success, true);
    assert.equal(step3.citationNumber, 1, 'Repeated citation of same study must reuse number [1]');
    assert.equal(step3.citedStudies.length, 2, 'References list must still have 2 unique entries');
    assert.equal(step3.citedStudies[0].occurrenceCount, 2);

    // Remove study-galak-2016 -> study-no-link-craft-2019 must renumber from [2] to [1]
    const removed = removeCitationFromHtml(step3.updatedHtml, 'study-galak-2016', studies);
    assert.equal(removed.success, true);
    assert.equal(removed.citedStudies.length, 1);
    assert.equal(removed.citedStudies[0].studyId, 'study-no-link-craft-2019');
    assert.equal(removed.citedStudies[0].citationNumber, 1, 'Remaining study must renumber to [1]');
    assert.ok(
      removed.updatedHtml.includes('data-study-id="study-no-link-craft-2019">1</sup>'),
      'In-text superscript must be renumbered to 1'
    );

    console.log('✓ Test 8 Passed: Citations number in order of appearance, reuse numbers for repeated studies, and renumber on removal');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 9: Source link preservation (clickable DOI/URL vs clean reference without link)
  // ---------------------------------------------------------------------------
  {
    const html = [
      '<p>Sentence one supported by Galak study with DOI.</p>',
      '<p>Sentence two supported by Vance study without any external URL or DOI.</p>',
    ].join('\n');

    const res1 = insertCitationIntoHtml(
      html,
      { studyId: 'study-galak-2016', targetPassage: 'Sentence one supported by Galak study with DOI.' },
      studies
    );
    const res2 = insertCitationIntoHtml(
      res1.updatedHtml,
      {
        studyId: 'study-no-link-craft-2019',
        targetPassage: 'Sentence two supported by Vance study without any external URL or DOI.',
      },
      studies
    );

    const refWithDoi = res2.citedStudies.find((c) => c.studyId === 'study-galak-2016')!;
    const refWithoutLink = res2.citedStudies.find((c) => c.studyId === 'study-no-link-craft-2019')!;

    assert.ok(
      refWithDoi.formattedReference.includes('href="https://doi.org/10.1177/0963721416656937"'),
      'Study with DOI must include clickable https://doi.org/... link in References'
    );
    assert.ok(
      !refWithoutLink.formattedReference.includes('<a '),
      'Study without DOI or URL must not render a broken or empty <a> tag'
    );
    assert.ok(
      !refWithoutLink.formattedReference.includes('undefined'),
      'Reference without link must remain clean'
    );

    console.log('✓ Test 9 Passed: Source DOI/URL links preserved as clickable anchors and omitted cleanly when absent');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 10: Research-backed passage workflow (Workflow B: propose -> edit -> approve)
  // ---------------------------------------------------------------------------
  {
    const project = createSampleArticleProject();
    const initialHtml = project.content;

    // 1. AI returns a Workflow B recommendation (study relevant to topic, no existing sentence states finding)
    const validated = researchService.validateAndEnrichCitationRecommendations(
      [
        {
          studyId: 'study-no-link-craft-2019',
          workflowType: 'draft_passage',
          targetPassage: '',
          targetSectionHeading: 'The Architecture of Solid Brass',
          proposedPassage:
            'In tactile evaluations of hand tools, heavier solid-brass instruments elicited significantly stronger intentions to maintain and pass down the object than lightweight polymer alternatives.',
          relevantFinding:
            'Higher-mass brass and steel tools elicited stronger intentions to maintain and pass down the object compared to lightweight polymer tools.',
          supportingEvidence:
            'Participants rated heavier solid-brass and steel hand tools as significantly more durable and worthy of long-term repair.',
          limitationsOrQualifications:
            'Measured immediate tactile evaluation rather than multi-decade longitudinal ownership.',
          confidence: 'verified_empirical',
          evidenceType: 'direct_empirical',
          isVerifiedMatch: false,
        },
      ],
      studies,
      initialHtml
    );

    assert.equal(validated.length, 1);
    const workflowBRec = validated[0];
    assert.equal(workflowBRec.workflowType, 'draft_passage');
    assert.equal(workflowBRec.draftStatus, 'proposed');
    assert.equal(workflowBRec.isInsertionReady, false, 'Workflow B cannot be inserted without explicit passage approval');
    // Verify proposing does NOT mutate article HTML
    assert.equal(project.content, initialHtml, 'Proposing a research-backed passage must not modify the article');

    // 2. Writer edits the proposed passage and explicitly approves insertion into "The Architecture of Solid Brass"
    const writerEditedPassage =
      'Controlled tactile evaluations indicate that higher-mass brass and steel tools foster a stronger commitment to long-term care and stewardship than lightweight polymer equivalents.';

    const approvalRes = insertDraftedPassageWithCitation(
      project.content,
      writerEditedPassage,
      workflowBRec.studyId,
      studies,
      { targetSectionHeading: workflowBRec.targetSectionHeading }
    );

    assert.equal(approvalRes.success, true, 'Approving drafted passage must insert passage and citation');
    assert.equal(approvalRes.citationNumber, 1);
    assert.ok(
      approvalRes.updatedHtml.includes(
        'lightweight polymer equivalents<sup class="citation-ref text-[11px] font-semibold text-amber-900 select-none cursor-pointer" data-study-id="study-no-link-craft-2019">1</sup>.</p>'
      ),
      'Approved passage must appear in the article HTML with its numbered citation [1]'
    );
    assert.equal(approvalRes.citedStudies.length, 1);
    assert.equal(approvalRes.citedStudies[0].studyId, 'study-no-link-craft-2019');

    console.log('✓ Test 10 Passed: Workflow B drafts research-backed passage without mutating article until explicitly approved');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // TEST 11: Save/state integration (hasProjectUnsavedChanges & manual save workflow)
  // ---------------------------------------------------------------------------
  {
    const baselineProject = createSampleArticleProject();
    assert.equal(
      hasProjectUnsavedChanges(baselineProject, baselineProject),
      false,
      'Identical baseline project must be clean'
    );

    const insertRes = insertCitationIntoHtml(
      baselineProject.content,
      {
        studyId: 'study-galak-2016',
        targetPassage:
          'Gift givers often optimize for the theatrical surprise of unwrapping, while recipients judge a gift by its quiet usefulness over years of daily life.',
      },
      studies
    );

    const updatedWorkingProject: WritingProject = {
      ...baselineProject,
      content: insertRes.updatedHtml,
      citedStudies: insertRes.citedStudies,
      updatedAt: new Date().toISOString(),
    };

    assert.equal(
      hasProjectUnsavedChanges(updatedWorkingProject, baselineProject),
      true,
      'Inserting a citation must mark the working project as having unsaved changes for manual Save'
    );

    console.log('✓ Test 11 Passed: Citation insertion integrates with project state and dirty-state tracking');
    passed++;
  }

  console.log(`\n===================================================================`);
  console.log(`All ${passed}/11 Citation Studio regression tests passed!`);
  console.log(`===================================================================`);
}

runCitationStudioTests().catch((err) => {
  console.error('Citation Studio test suite failed:', err);
  process.exit(1);
});
