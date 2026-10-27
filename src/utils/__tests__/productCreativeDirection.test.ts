/**
 * Stage 3A Unit Tests: Product Creative Direction, Manufacturer Anti-Parroting,
 * Non-Destructive Selection Reducers, and Prompt Sanitization (503 Fix).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeProductMetadataForPrompt,
  buildCreativeDirectionPromptAndParts,
  normalizeCreativeDirectionOutput,
  mergeCreativeDirectionIntoMeta,
  applySelectedTitleToMeta,
  applyProductAngleRoleToMeta,
  applyRecipientPersonaToPositioning,
  applyAudienceMismatchToPositioning,
  buildProductExternalWritingPrompt,
  PRODUCT_COPY_SECTIONS_CATALOG,
  DEFAULT_PRODUCT_BRIEF_SECTIONS,
  resolveProductBriefConfig,
  validateProductDraftWordCount,
  resolveProductCopyActionModel,
  normalizeEditorialActionProposedText,
  sanitizeSeoExplanation,
  doesTitleIncludeProductCategory,
  ensureTitleProductCategoryClarity,
} from '../productCreativeDirectionUtils';
import { buildProductAnalysisPromptAndParts } from '../productResearchUtils';
import { ProductCopyMetadata } from '../../types/project';

function createBaseMeta(): ProductCopyMetadata {
  return {
    productName: "Schrodinger's Cat Laboratory Crewneck",
    productType: 'Heavyweight Crewneck Sweatshirt',
    productUrl: 'https://shop.scienceofgifts.com/products/schrodinger-cat-crewneck',
    rawProductInfo:
      'ELEVATE YOUR WARDROBE with this ULTRA-SOFT MUST-HAVE sweatshirt! 80% ringspun cotton, 20% polyester fleece, 9.5 oz/yd². Double-needle stitched collar.',
    intendedRecipient: 'Physics grad students and lab researchers',
    giftGuideOrOccasion: 'Gifts for Physicists & Lab Colleagues',
    targetAudience: 'STEM researchers, educators, and science enthusiasts',
    contextNotes: 'Dry academic wit, zero novelty-store hype.',
    headline: 'Existing User Headline That Must Not Be Overwritten',
    standfirst: 'Existing user standfirst deck.',
    description: 'Existing user product description.',
    bestFor: 'Existing user best-for note.',
    positioning: {
      keySellingAngle: 'Existing manual angle',
      suitedRecipient: 'Existing manual recipient',
      whatToEmphasize: 'Existing manual emphasis',
      whatToAvoid: 'Existing manual avoid note',
    },
    epistemicAnalysis: {
      analysisMode: 'url_and_image',
      analyzedAt: '2026-10-26T00:00:00.000Z',
      verifiedFacts: {
        sourceUrl: 'https://shop.scienceofgifts.com/products/schrodinger-cat-crewneck',
        price: '$54.00',
        materials: '80% ringspun cotton, 20% polyester fleece, 9.5 oz/yd²',
        dimensions: '',
        colors: 'Charcoal, Bone',
        features: 'Double-needle stitched collar',
        variants: 'S, M, L, XL, 2XL',
        unverifiedFields: ['dimensions'],
      },
      visibleObservations: {
        visibleText: '|Ψ⟩ = 1/√2 (|Alive⟩ + |Asleep⟩)',
        designAndImagery: 'Minimalist Dirac bra-ket state vector diagram with a sleeping cat line drawing',
        garmentOrObjectStyle: 'Crewneck sweatshirt',
        visibleColors: 'Charcoal fleece base with cream ink',
        visualDetails: 'Centered chest diagram in serif mathematical notation',
      },
      editorialInferences: {
        designConcept: 'Plays on quantum superposition and a cat napping in a sunbeam',
        historicalOrCulturalContext: 'Erwin Schrodinger 1935 thought experiment in Dirac notation',
        recipientResonance: 'Rewards anyone who has survived a quantum mechanics problem set',
        editorialCaution: 'Dimensions are unverified; do not invent garment measurements',
      },
    },
    mockupImages: [
      {
        id: 'img-1',
        name: 'front-mockup.jpg',
        mimeType: 'image/jpeg',
        isPrimary: true,
        addedAt: '2026-10-26T00:00:00.000Z',
        dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(120000),
      },
    ],
  };
}

describe('Stage 3A: Manufacturer-Copy Anti-Parroting & Prompt Sanitization', () => {
  it('1. Enforces Manufacturer-Copy Anti-Parroting in Stage 2 Analysis Prompt', () => {
    const built = buildProductAnalysisPromptAndParts({
      targetUrl: 'https://shop.scienceofgifts.com/products/schrodinger-cat-crewneck',
      extractedUrlFacts: {
        sourceUrl: 'https://shop.scienceofgifts.com/products/schrodinger-cat-crewneck',
        canonicalUrl: 'https://shop.scienceofgifts.com/products/schrodinger-cat-crewneck',
        productName: 'Schrodinger Crewneck',
        productType: 'Sweatshirt',
        imageUrl: '',
        description: 'ELEVATE YOUR WARDROBE with this ULTRA-SOFT MUST-HAVE piece!',
        price: '$54.00',
        materials: '80% cotton / 20% polyester',
        dimensions: '',
        colors: 'Charcoal',
        features: '',
        variants: 'S-2XL',
        textSnippet: 'Buy now! Game-changing comfort! 9.5 oz ringspun fleece.',
      },
    });

    assert.match(built.systemInstruction, /MANUFACTURER COPY ANTI-PARROTING RULE/i);
    assert.match(built.systemInstruction, /NEVER copy, parrot, or lightly paraphrase vendor marketing prose/i);
    assert.match(
      String(built.contents),
      /RAW FACTUAL SOURCE ONLY — DO NOT PARROT VENDOR PHRASING OR HYPE/i
    );
  });

  it('2. Strips heavy base64 mockupImages and fences rawProductInfo in sanitizeProductMetadataForPrompt', () => {
    const meta = createBaseMeta();
    const sanitized = sanitizeProductMetadataForPrompt(meta);
    assert.ok(sanitized);

    // Must strip mockupImages array containing 120KB base64 dataUrl
    assert.equal(sanitized.mockupImages, undefined);
    assert.deepEqual(sanitized.mockupImagesSummary, {
      count: 1,
      primaryImageName: 'front-mockup.jpg',
    });

    // Must replace rawProductInfo with fenced rawManufacturerSpecNotes
    assert.equal(sanitized.rawProductInfo, undefined);
    assert.ok(sanitized.rawManufacturerSpecNotes);
    assert.match(
      sanitized.rawManufacturerSpecNotes.epistemicRule,
      /RAW VENDOR SOURCE MATERIAL ONLY/i
    );

    const serialized = JSON.stringify(sanitized);
    assert.ok(
      serialized.length < 5000,
      `Expected sanitized JSON payload < 5KB, got ${serialized.length} bytes`
    );
  });

  it('3. Enforces Manufacturer-Copy Anti-Parroting in Stage 3 Creative Direction and External Writing Prompts', () => {
    const meta = createBaseMeta();
    const cdPrompt = buildCreativeDirectionPromptAndParts({
      productName: meta.productName,
      productType: meta.productType,
      rawProductInfo: meta.rawProductInfo,
      epistemicAnalysis: meta.epistemicAnalysis,
      productContext: {
        intendedRecipient: meta.intendedRecipient,
        giftGuideOrOccasion: meta.giftGuideOrOccasion,
        targetAudience: meta.targetAudience,
        contextNotes: meta.contextNotes,
      },
      mockupImages: meta.mockupImages,
    });

    assert.match(cdPrompt.systemInstruction, /MANUFACTURER COPY ANTI-PARROTING RULE/i);
    assert.ok(Array.isArray(cdPrompt.contents));
    const userParts = cdPrompt.contents[0].parts;
    const textPart = userParts[userParts.length - 1].text;
    assert.match(
      textPart,
      /RAW MANUFACTURER SPECIFICATION NOTES \(FACTUAL SOURCE MATERIAL ONLY — DO NOT PARROT VENDOR PHRASING OR HYPE\)/i
    );

    const extPrompt = buildProductExternalWritingPrompt({
      projectTitle: meta.productName,
      meta,
    });
    assert.match(extPrompt, /Manufacturer-Copy Anti-Parroting Rule/i);
    assert.match(
      extPrompt,
      /Raw Manufacturer Spec Source \(EXTRACT HARD PHYSICAL SPECS ONLY — DO NOT COPY VENDOR PHRASING\)/i
    );
  });
});

describe('Stage 3A: Creative Direction Normalization & Non-Destructive Selection Reducers', () => {
  it('4. Normalizes partial AI JSON and guarantees >= 6 distinct titles and >= 4 positioning angles with full metadata', () => {
    const partialJson = {
      titleOptions: [
        {
          title: 'The Eigenstate Crewneck — A Study in Lab Comfort',
          standfirst: 'Dirac notation meets heavyweight ringspun fleece.',
          styleArchetype: 'Inside-Joke & Domain Literacy',
          intendedAppeal: 'Physicists who read state vectors at a glance',
          rationale: 'Speaks directly to quantum mechanics literacy.',
          strengths: 'Immediate insider recognition.',
          weaknesses: 'Opaque to non-STEM shoppers.',
        },
      ],
      positioningAngles: [
        {
          title: 'Dirac Notation Literacy',
          archetype: 'Domain Literacy',
          coreHook: 'Treats the ket notation as a genuine inside nod rather than a loud pun.',
          supportingEvidence: 'Visible text |Ψ⟩ = 1/√2 (|Alive⟩ + |Asleep⟩) on chest.',
          whatToEmphasize: 'The replacement of Dead with Asleep in the state vector.',
          risksAndWhatToAvoid: 'Do not over-explain basic quantum mechanics.',
        },
      ],
      audienceAnalysis: {
        primaryPersonas: [
          {
            name: 'The Quantum Lab Grad Student',
            profileSummary: 'Spends long hours in a chilled optics lab.',
            whyItResonates: 'Appreciates accurate Dirac bra-ket typography and a 9.5 oz fleece layer.',
            contextOfUse: 'Department coffee hour, lab bench, or grading sessions.',
          },
        ],
      },
    };

    const suite = normalizeCreativeDirectionOutput(partialJson, {
      productName: "Schrodinger's Cat Crewneck",
      productType: 'Crewneck Sweatshirt',
      intendedRecipient: 'Physics grad students',
      visibleText: '|Ψ⟩ = 1/√2 (|Alive⟩ + |Asleep⟩)',
      unverifiedFields: ['dimensions'],
    });

    // Must guarantee at least 6 distinct title options
    assert.ok(
      suite.titleOptions.length >= 6,
      `Expected >= 6 title options, got ${suite.titleOptions.length}`
    );
    const uniqueTitles = new Set(suite.titleOptions.map((t) => t.title.toLowerCase()));
    assert.equal(uniqueTitles.size, suite.titleOptions.length);

    // Em dashes must be stripped from titles
    assert.ok(!suite.titleOptions[0].title.includes('—'));

    // Every title option must have required evaluation metadata
    for (const t of suite.titleOptions) {
      assert.ok(t.id && t.title && t.styleArchetype && t.intendedAppeal && t.rationale && t.strengths && t.weaknesses);
    }

    // Must guarantee at least 4 distinct positioning angles, all initially 'unassigned'
    assert.ok(
      suite.positioningAngles.length >= 4,
      `Expected >= 4 positioning angles, got ${suite.positioningAngles.length}`
    );
    for (const a of suite.positioningAngles) {
      assert.equal(a.role, 'unassigned');
      assert.ok(a.supportingEvidence && a.whatToEmphasize && a.risksAndWhatToAvoid);
    }

    // Must populate personas, secondary audiences, buyer motivations, recipient perspective, mismatches, and cautions
    assert.ok(suite.audienceAnalysis.primaryPersonas.length >= 1);
    assert.ok(suite.audienceAnalysis.secondaryAudiences.length >= 1);
    assert.ok(suite.audienceAnalysis.buyerMotivations.length >= 1);
    assert.ok(suite.audienceAnalysis.recipientPerspective.length > 10);
    assert.ok(suite.audienceAnalysis.audienceMismatches.length >= 1);
    assert.ok(suite.editorialCautions.length >= 1);

    // Must NOT auto-select any title or angle
    assert.equal(suite.selectedPrimaryTitleId, undefined);
    assert.equal(suite.selectedPrimaryAngleId, undefined);
  });

  it('5. Never overwrites existing user fields during full or targeted Creative Direction generation', () => {
    const meta = createBaseMeta();
    const suite = normalizeCreativeDirectionOutput({}, {
      productName: meta.productName,
      productType: meta.productType,
      intendedRecipient: meta.intendedRecipient,
    });

    const merged = mergeCreativeDirectionIntoMeta(meta, suite, 'all');

    // Existing copy and positioning fields MUST remain untouched
    assert.equal(merged.headline, 'Existing User Headline That Must Not Be Overwritten');
    assert.equal(merged.standfirst, 'Existing user standfirst deck.');
    assert.equal(merged.description, 'Existing user product description.');
    assert.equal(merged.bestFor, 'Existing user best-for note.');
    assert.equal(merged.positioning?.keySellingAngle, 'Existing manual angle');
    assert.equal(merged.positioning?.suitedRecipient, 'Existing manual recipient');
    assert.ok(merged.creativeDirection);
  });

  it('6. Applies title, angle roles, personas, and audience mismatches ONLY on explicit user action', () => {
    const meta = createBaseMeta();
    const suite = normalizeCreativeDirectionOutput({}, {
      productName: meta.productName,
      productType: meta.productType,
      intendedRecipient: meta.intendedRecipient,
    });
    let current = mergeCreativeDirectionIntoMeta(meta, suite, 'all');

    // 1. Explicit Title Selection
    const targetTitle = current.creativeDirection!.titleOptions[1];
    current = applySelectedTitleToMeta(current, targetTitle.id, { applyStandfirst: true });
    assert.equal(current.headline, targetTitle.title);
    assert.equal(current.standfirst, targetTitle.standfirst);
    assert.equal(current.creativeDirection?.selectedPrimaryTitleId, targetTitle.id);

    // 2. Explicit Angle Selection (Primary, Secondary, Do Not Use)
    const angle0 = current.creativeDirection!.positioningAngles[0];
    const angle1 = current.creativeDirection!.positioningAngles[1];
    const angle2 = current.creativeDirection!.positioningAngles[2];

    current = applyProductAngleRoleToMeta(current, angle0.id, 'primary');
    assert.equal(current.creativeDirection?.selectedPrimaryAngleId, angle0.id);
    assert.ok(current.positioning?.keySellingAngle?.includes(angle0.title));

    // Selecting a new primary angle demotes the old primary angle
    current = applyProductAngleRoleToMeta(current, angle1.id, 'primary');
    assert.equal(current.creativeDirection?.selectedPrimaryAngleId, angle1.id);
    const updatedAngle0 = current.creativeDirection?.positioningAngles.find(
      (a) => a.id === angle0.id
    );
    assert.equal(updatedAngle0?.role, 'unassigned');

    // Mark angle2 as 'do_not_use'
    current = applyProductAngleRoleToMeta(current, angle2.id, 'do_not_use');
    assert.ok(current.creativeDirection?.excludedAngleIds?.includes(angle2.id));
    assert.ok(current.positioning?.whatToAvoid?.includes(angle2.title));

    // 3. Explicit Persona & Mismatch Application
    const persona0 = current.creativeDirection!.audienceAnalysis.primaryPersonas[0];
    current = applyRecipientPersonaToPositioning(current, persona0.id);
    assert.ok(current.positioning?.suitedRecipient?.includes(persona0.name));

    const mismatch0 = current.creativeDirection!.audienceAnalysis.audienceMismatches[0];
    current = applyAudienceMismatchToPositioning(current, mismatch0.id);
    assert.ok(current.positioning?.whatToAvoid?.includes(mismatch0.whoShouldSkip));
  });
});

describe('Writing Brief & External Writing Prompt Workflow (Problems 1–5 Regression Suite)', () => {
  it('7. Problem 1 (Repeated Specifications): Suppresses raw specs, dimensions, care, and compliance dumps by default while preserving optional Technical Specifications toggle', () => {
    const meta = createBaseMeta();
    meta.dimensions = '11 oz capacity, 3.8 in height';
    meta.features = 'Dishwasher safe, BPA-free, double-wall vacuum insulation';

    // Default state: technical_specifications is OFF
    const defaultCfg = resolveProductBriefConfig(meta);
    assert.equal(defaultCfg.includeTechnicalSpecs, false);

    const defaultPrompt = buildProductExternalWritingPrompt({
      projectTitle: meta.productName,
      meta,
    });

    assert.match(defaultPrompt, /No Repeated Specifications/i);
    assert.match(defaultPrompt, /SPECIFICATION RESTRAINT POLICY/i);
    // Must not dump raw dimensions, features, or variants list when Technical Specifications is OFF
    assert.ok(!defaultPrompt.includes('**Physical Features**: Dishwasher safe'));
    assert.ok(!defaultPrompt.includes('**Available Variants**: S, M, L, XL, 2XL'));

    // When user explicitly selects 'technical_specifications', verified specs ARE included
    const metaWithSpecs: ProductCopyMetadata = {
      ...meta,
      briefConfig: {
        selectedSections: [...DEFAULT_PRODUCT_BRIEF_SECTIONS, 'technical_specifications'],
      },
    };
    const promptWithSpecs = buildProductExternalWritingPrompt({
      projectTitle: metaWithSpecs.productName,
      meta: metaWithSpecs,
    });
    assert.match(
      promptWithSpecs,
      /## 8\. VERIFIED PRODUCT SPECIFICATIONS \(FOR TECHNICAL SPECIFICATIONS SECTION\)/i
    );
    assert.ok(promptWithSpecs.includes('80% ringspun cotton, 20% polyester fleece'));
  });

  it('8. Problem 2 (Selectable Sections): Restores all 8 selectable sections, preserves choices in project metadata, and explicitly separates Included vs. Excluded sections in prompt', () => {
    assert.equal(PRODUCT_COPY_SECTIONS_CATALOG.length, 8);
    const catalogIds = PRODUCT_COPY_SECTIONS_CATALOG.map((s) => s.id);
    assert.deepEqual(catalogIds, [
      'headline_and_standfirst',
      'editorial_description',
      'design_and_visual_details',
      'humor_and_cultural_context',
      'recipient_and_gift_rationale',
      'practical_use_and_suitability',
      'caveats_and_who_not_for',
      'technical_specifications',
    ]);

    // Default enabled sections exclude caveats, practical use, and technical specs
    assert.ok(!DEFAULT_PRODUCT_BRIEF_SECTIONS.includes('technical_specifications'));
    assert.ok(!DEFAULT_PRODUCT_BRIEF_SECTIONS.includes('caveats_and_who_not_for'));
    assert.ok(!DEFAULT_PRODUCT_BRIEF_SECTIONS.includes('practical_use_and_suitability'));

    // Custom user selection persisted on meta.briefConfig
    const meta: ProductCopyMetadata = {
      ...createBaseMeta(),
      briefConfig: {
        selectedSections: [
          'headline_and_standfirst',
          'editorial_description',
          'humor_and_cultural_context',
          'recipient_and_gift_rationale',
        ],
      },
    };

    const prompt = buildProductExternalWritingPrompt({
      projectTitle: meta.productName,
      meta,
    });

    assert.match(prompt, /### Selected Sections to Include/i);
    assert.match(prompt, /### Excluded Sections \(DO NOT INCLUDE in Copy\)/i);
    // Design & visual details was unchecked, so it must appear under Excluded Sections
    const excludedBlock = prompt.split('### Excluded Sections (DO NOT INCLUDE in Copy)')[1] || '';
    assert.match(excludedBlock, /Design and visual details/i);
    assert.match(excludedBlock, /Caveats or who the product is not for/i);
    assert.match(excludedBlock, /Technical specifications/i);
  });

  it('9. Problem 3 (Word-Count Enforcement & Validation): Ignores generic 1,200–1,500 article default, enforces 180-word main-body target, and validates short (107w) vs. on-target (180w) drafts', () => {
    const meta = createBaseMeta();

    // Even when project.writingControls.wordCountTarget is the legacy article default "1,200 - 1,500 words",
    // resolveProductBriefConfig must ignore it and use the product target (180 words default)
    const resolved = resolveProductBriefConfig(meta, '1,200 - 1,500 words');
    assert.equal(resolved.targetWordCount, 180);
    assert.equal(resolved.headlineCountsTowardWordCount, false);
    assert.equal(resolved.minWords, 162);
    assert.equal(resolved.maxWords, 198);

    const prompt = buildProductExternalWritingPrompt({
      projectTitle: meta.productName,
      meta,
      wordCountTarget: '1,200 - 1,500 words',
    });

    assert.match(prompt, /\*\*Target Word Count\*\*: \*\*180 words\*\*/i);
    assert.match(prompt, /Acceptable tolerance range: \*\*162–198 words\*\*/i);
    assert.match(
      prompt,
      /\*\*Headline & Standfirst Counting Rule\*\*: \*\*EXCLUDED FROM TARGET\*\*/i
    );
    assert.match(prompt, /Do NOT under-write or stop short at 90–120 words/i);

    // Validate a short draft (~107 main-body words + 20 headline/standfirst words = 127 total)
    const headlineAndDeck =
      '## The Eigenstate Crewneck for Chilled Optics Labs\n\n*Where Dirac bra-ket notation meets a quiet afternoon nap in the department lounge.*';
    const shortBodyWords = Array.from({ length: 107 }, (_, i) => `word${i + 1}`).join(' ');
    const shortDraft = `${headlineAndDeck}\n\n${shortBodyWords}`;

    const shortCheck = validateProductDraftWordCount(shortDraft, resolved);
    assert.equal(shortCheck.headlineAndStandfirstWords, 20);
    assert.equal(shortCheck.mainBodyWords, 107);
    assert.equal(shortCheck.totalWords, 127);
    assert.equal(shortCheck.countedWords, 107); // Headline & standfirst excluded by default
    assert.equal(shortCheck.status, 'under_target');
    assert.match(shortCheck.summaryMessage, /Under target: 107 main-body words/i);

    // Validate an on-target draft (180 main-body words)
    const onTargetBodyWords = Array.from({ length: 180 }, (_, i) => `word${i + 1}`).join(' ');
    const onTargetDraft = `${headlineAndDeck}\n\n${onTargetBodyWords}`;
    const onTargetCheck = validateProductDraftWordCount(onTargetDraft, resolved);
    assert.equal(onTargetCheck.mainBodyWords, 180);
    assert.equal(onTargetCheck.countedWords, 180);
    assert.equal(onTargetCheck.status, 'within_target');

    // When headlineCountsTowardWordCount is true, totalWords (127) is counted
    const inclusiveCfg = resolveProductBriefConfig({
      ...meta,
      briefConfig: {
        targetWordCount: 180,
        headlineCountsTowardWordCount: true,
      },
    });
    const inclusiveCheck = validateProductDraftWordCount(shortDraft, inclusiveCfg);
    assert.equal(inclusiveCheck.countedWords, 127);
  });

  it('10. Problems 4 & 5 (Original Editorial Point of View & Anti-Overexplaining): Instructs model to interpret rather than inventory visible elements and forbids generic disclaimers', () => {
    const meta = createBaseMeta();
    const prompt = buildProductExternalWritingPrompt({
      projectTitle: meta.productName,
      meta,
    });

    assert.match(
      prompt,
      /Original Editorial Point of View \(Interpret, Do Not Inventory\)/i
    );
    assert.match(
      prompt,
      /Interpret these details to support your editorial point of view; do NOT list them as a mechanical visual inventory/i
    );
    assert.match(
      prompt,
      /Avoid Overexplaining & Disclaimers/i
    );
    assert.match(
      prompt,
      /Do NOT add generic buyer disclaimers, safety\/compliance claims, washing instructions, or feature checklists/i
    );
  });

  it('11. Regression Test (Generate Full Copy Proposal 503 Fix): Routes product_copy actions to gemini-3-flash-preview by default and normalizes structured proposedText JSON', () => {
    // 1. Default product_copy action without explicit override routes to responsive gemini-3-flash-preview instead of hanging gemini-3.8-flash
    assert.equal(
      resolveProductCopyActionModel({
        requestedModel: 'gemini-3.8-flash',
        projectType: 'product_copy',
        action: 'generate_product_copy',
      }),
      'gemini-3-flash-preview'
    );
    assert.equal(
      resolveProductCopyActionModel({
        projectType: 'product_copy',
        actionType: 'product_copy',
      }),
      'gemini-3-flash-preview'
    );

    // 2. Explicit valid project/action model override is respected
    assert.equal(
      resolveProductCopyActionModel({
        modelOverride: 'gemini-3.5-flash',
        projectType: 'product_copy',
        action: 'generate_product_copy',
      }),
      'gemini-3.5-flash'
    );

    // 3. Non-product_copy article actions preserve standard default
    assert.equal(
      resolveProductCopyActionModel({
        requestedModel: 'gemini-3.8-flash',
        projectType: 'article',
        action: 'rewrite',
      }),
      'gemini-3.8-flash'
    );

    // 4. Normalizes both plain string proposedText and nested object proposedText
    assert.equal(
      normalizeEditorialActionProposedText({
        proposedText: '<p>Clean editorial proposal.</p>',
        explanation: 'Refined.',
      }),
      '<p>Clean editorial proposal.</p>'
    );

    const normalizedStructured = normalizeEditorialActionProposedText({
      proposedText: {
        Headline: 'The Quantum Superposition Heavyweight Crewneck',
        Standfirst: 'Dry laboratory wit printed on substantial fleece.',
        Description: '<p>First paragraph of editorial copy.</p>',
      },
      explanation: 'Structured proposal.',
    });
    assert.ok(normalizedStructured);
    assert.match(normalizedStructured!, /<h2>The Quantum Superposition Heavyweight Crewneck<\/h2>/);
    assert.match(normalizedStructured!, /<p><em>Dry laboratory wit printed on substantial fleece\.<\/em><\/p>/);
    assert.match(normalizedStructured!, /<p>First paragraph of editorial copy\.<\/p>/);
  });

  it('12. Step 2 Title Generation Upgrade: Enforces product category clarity, 6–8 alternatives, search intent & keyword coverage, non-guaranteed SEO explanations, and recommended title without auto-overwrite', () => {
    const meta = createBaseMeta();

    // 1. Prompt explicitly instructs accurate product identification, natural wording over cleverness, and forbids guaranteed ranking claims
    const { systemInstruction, contents } = buildCreativeDirectionPromptAndParts({
      productName: meta.productName,
      productType: meta.productType,
      productContext: {
        intendedRecipient: meta.intendedRecipient,
      },
    });
    assert.match(
      systemInstruction,
      /PRIORITIZE ACCURATE PRODUCT IDENTIFICATION, USEFUL SEARCH INTENT, AND NATURAL WORDING OVER CLEVERNESS/i
    );
    assert.match(
      systemInstruction,
      /NEVER claim or imply guaranteed rankings, #1 placement, or guaranteed search traffic/i
    );
    assert.match(String(contents), /recommendedTitleRationale/);

    // 2. When AI omits the product category from a title or includes ranking-guarantee language, normalization repairs both
    const normalized = normalizeCreativeDirectionOutput(
      {
        titleOptions: [
          {
            title: 'Simultaneously Observed and Unobserved', // Missing category!
            standfirst: 'A quantum mechanics nod for lab days.',
            styleArchetype: 'Understated Observational Wit + Category',
            titleRole: 'product_page',
            searchIntent: 'This title guarantees top search rankings for physics gifts.',
            targetKeywords: ['physics gift', 'quantum sweatshirt'],
            intendedAppeal: 'Physics students',
            rationale: 'Guaranteed to rank #1 on Google for quantum gifts.',
            strengths: 'Will rank #1 and ensures first-page search rankings.',
            weaknesses: 'Niche physics reference.',
          },
        ],
        recommendedTitleIndex: 0,
        recommendedTitleRationale:
          'This option guarantees top rankings while naming the product.',
      },
      {
        productName: meta.productName,
        productType: meta.productType,
        intendedRecipient: meta.intendedRecipient,
      }
    );

    assert.ok(normalized.titleOptions.length >= 6 && normalized.titleOptions.length <= 8);

    // Every normalized title option must clearly include the product category and have searchIntent + targetKeywords
    for (const opt of normalized.titleOptions) {
      assert.equal(
        doesTitleIncludeProductCategory(opt.title, meta.productType),
        true,
        `Expected title "${opt.title}" to clearly identify category "${meta.productType}"`
      );
      assert.equal(opt.includesProductCategory, true);
      assert.ok(opt.searchIntent && opt.searchIntent.length > 5);
      assert.ok(Array.isArray(opt.targetKeywords) && opt.targetKeywords.length >= 2);
      assert.ok(opt.titleRole);
      // Must never contain ranking guarantee claims
      assert.doesNotMatch(opt.searchIntent || '', /guarantees?\s+top|rank\s+#1/i);
      assert.doesNotMatch(opt.rationale, /guaranteed\s+to\s+rank|rank\s+#1/i);
      assert.doesNotMatch(opt.strengths, /will\s+rank\s+#1|ensures\s+first-page/i);
    }

    // Recommended title is identified with a sanitized rationale, but selectedPrimaryTitleId remains undefined (no auto-overwrite)
    assert.ok(normalized.recommendedTitleId);
    assert.equal(normalized.titleOptions[0].isRecommended, true);
    assert.ok(normalized.recommendedTitleRationale);
    assert.doesNotMatch(normalized.recommendedTitleRationale!, /guarantees?\s+top\s+rankings?/i);
    assert.equal(normalized.selectedPrimaryTitleId, undefined);
  });
});

