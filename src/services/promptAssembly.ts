/**
 * Science of Gifts - Centralized AI Prompt & Context Assembly System
 * Requirement #9: Modular context assembly system for editorial intelligence.
 * Ensures each AI action receives ONLY the relevant context modules rather than
 * scattering prompt construction throughout individual UI components.
 */

import {
  WritingProject,
  WritingControls,
  ProjectBrief,
  OutlineItem,
  ContentRule,
  GiftProduct,
  GuideFAQItem,
} from '../types/project';
import { StyleProfile } from '../types/styleReference';
import { InternalLink } from '../types/internalLink';
import { storage } from './storage';
import { extractPlainTextFromHtml } from '../utils/richText';
import { extractUrlsFromHtml } from '../utils/urlUtils';
import { assembleSystemInstruction } from './instructionArchitecture';

export type ActionCategory =
  | 'SELECTION_EDIT'     // rewrite_selection, make_more_concise, expand_selection, improve_flow, change_tone, add_context, simplify
  | 'GENERATION'         // generate_intro, generate_section, continue_writing, generate_gift_guide_intro, etc.
  | 'PRODUCT_EDIT'       // generate_product_section, rewrite_product_section, generate_best_for, etc.
  | 'GUIDE_SECTION'      // generate_buyer_advice, generate_faq, generate_conclusion
  | 'REVIEW'             // review_writing
  | 'OUTLINE'            // generate_outline
  | 'LINKING'            // find_link_opportunities
  | 'CUSTOM';            // custom_command

export interface AssemblePromptOptions {
  project: WritingProject;
  action: string;
  selectedText?: string;
  scope?: 'selection' | 'paragraph' | 'section' | 'all';
  customCommand?: string;
  targetOutlineItem?: OutlineItem;
  targetProduct?: GiftProduct;
  relevantProduct?: GiftProduct | any;
  targetFaqItem?: GuideFAQItem;
  globalInstructions: string[];
  styleProfile?: StyleProfile;
  internalLinks?: InternalLink[];
  alreadyUsedUrls?: string[];
}

export interface AssembledPrompt {
  systemInstruction: string;
  userPrompt: string;
  includedModules: string[];
}

/**
 * Determine the category of an editorial action to decide context inclusion
 */
export function categorizeAction(action: string): ActionCategory {
  switch (action) {
    case 'rewrite_selection':
    case 'make_more_concise':
    case 'expand_selection':
    case 'improve_flow':
    case 'change_tone':
    case 'add_context':
    case 'simplify':
      return 'SELECTION_EDIT';
    case 'generate_product_section':
    case 'rewrite_product_section':
    case 'generate_best_for':
    case 'generate_product_buyer_advice':
    case 'add_product_historical_context':
    case 'improve_product_flow':
    case 'change_product_tone':
    case 'make_product_concise':
      return 'PRODUCT_EDIT';
    case 'generate_intro':
    case 'generate_gift_guide_intro':
    case 'generate_section':
    case 'continue_writing':
      return 'GENERATION';
    case 'generate_buyer_advice':
    case 'generate_faq':
    case 'generate_faq_answers':
    case 'generate_conclusion':
    case 'generate_collection_link':
      return 'GUIDE_SECTION';
    case 'review_writing':
      return 'REVIEW';
    case 'generate_outline':
      return 'OUTLINE';
    case 'find_link_opportunities':
      return 'LINKING';
    case 'custom_command':
    default:
      return 'CUSTOM';
  }
}

/**
 * Modular Context Assembly
 */
export function assemblePrompt(options: AssemblePromptOptions): AssembledPrompt {
  const {
    project,
    action,
    selectedText = '',
    scope = selectedText ? 'selection' : 'all',
    customCommand = '',
    targetOutlineItem,
    globalInstructions = [],
  } = options;

  const category = categorizeAction(action);
  const activeRules = (project.contentRules || [])
    .filter((r) => r.enabled)
    .map((r) => r.rule);

  const controls: WritingControls = project.writingControls || project.aiSettings || {
    tone: 'editorial',
    detail: 'balanced',
    marketing: 'minimal',
    historicalContext: 'moderate',
    audience: 'enthusiast',
    wordCountTarget: '1,200 - 1,500 words',
  };

  let effectiveProfile = options.styleProfile;
  if (!effectiveProfile && project.styleProfileId) {
    effectiveProfile = storage.getStyleProfile(project.styleProfileId) || undefined;
  }

  let profileDirectives: string[] = [];
  if (effectiveProfile) {
    profileDirectives =
      effectiveProfile.userEditedInstructions && effectiveProfile.userEditedInstructions.length > 0
        ? effectiveProfile.userEditedInstructions
        : effectiveProfile.generatedInstructions || [];
  }

  const isSelectionOnly = category === 'SELECTION_EDIT' && Boolean(selectedText);

  const includedModules: string[] = [];

  // Track included modules for transparent AI telemetry
  includedModules.push('HOUSE_CONSTITUTION');
  if (globalInstructions.length > 0) includedModules.push('GLOBAL_INSTRUCTIONS');
  if (activeRules.length > 0) includedModules.push('CONTENT_RULES');
  includedModules.push('WRITING_CONTROLS');
  if (effectiveProfile && profileDirectives.length > 0) includedModules.push('STYLE_PROFILE');
  if (project.projectInstructions && project.projectInstructions.trim()) includedModules.push('PROJECT_INSTRUCTIONS');
  if (project.brief && (project.brief.purpose || project.brief.audience)) includedModules.push('PROJECT_BRIEF');

  // ==============================================================
  // ASSEMBLE 3-LAYER SYSTEM INSTRUCTION
  // Layer 1: House Constitution (Universal, Inviolable)
  // Layer 2: Editorial Brief & Controls (Project Parameters)
  // Layer 3: Voice & Style Profile (Aesthetic texture, de-duplicated)
  // ==============================================================
  const systemInstruction = assembleSystemInstruction({
    houseConfig: {
      globalInstructions,
      activeRules,
    },
    briefConfig: {
      projectTitle: project.title,
      projectType: project.type,
      projectInstructions: project.projectInstructions,
      brief: project.brief,
      writingControls: controls,
      isMicroAction: isSelectionOnly,
    },
    styleConfig: effectiveProfile
      ? {
          profileName: effectiveProfile.name,
          directives: profileDirectives,
        }
      : undefined,
  });

  // ==============================================================
  // USER PROMPT ASSEMBLY: Action Context & Targeted Scope
  // ==============================================================
  const userLines: string[] = [
    `ACTION TARGET: "${project.title || 'Untitled'}" [${project.type.toUpperCase()}]`,
  ];

  // ==========================================
  // 7b. GIFT GUIDE CONTEXT (Phase 5 Gift Guide Studio)
  // ==========================================
  if (project.type === 'gift_guide' && project.giftGuideMeta) {
    const gg = project.giftGuideMeta;
    includedModules.push('GIFT_GUIDE_INFO');
    userLines.push(
      '',
      'GIFT GUIDE INFORMATION:',
      `- Guide Title: "${project.title}"`,
      gg.standfirst ? `- Standfirst / Curatorial Premise: ${gg.standfirst}` : '',
      gg.primaryTopic ? `- Primary Topic: ${gg.primaryTopic}` : '',
      gg.searchIntent ? `- Primary Search Intent: ${gg.searchIntent}` : '',
      gg.audience ? `- Target Audience: ${gg.audience}` : '',
      gg.occasionOrNiche ? `- Occasion / Theme / Niche: ${gg.occasionOrNiche}` : '',
      gg.collectionUrl ? `- Shop Collection URL: ${gg.collectionUrl}` : '',
      gg.desiredWordCount ? `- Desired Word Count: ${gg.desiredWordCount}` : '',
      gg.additionalInstructions ? `- Additional Guide Instructions: ${gg.additionalInstructions}` : '',
      gg.settings ? `- Section Format Preference: ${gg.settings.sectionFormat} (Target section length: ${gg.settings.desiredSectionLength || '120-160 words'})` : ''
    );

    // Guide-wide products overview
    const prods: GiftProduct[] = gg.products || [];
    if (prods.length > 0) {
      includedModules.push('PRODUCTS_OVERVIEW');
      userLines.push(
        '',
        `GUIDE PRODUCTS OVERVIEW (${prods.length} Products in Curated Order):`,
        ...prods.map(
          (p: GiftProduct, idx: number) =>
            `${idx + 1}. "${p.name}" [Type: ${p.productType || 'Unspecified'}]${
              p.summary ? ` — ${p.summary}` : ''
            }`
        )
      );
    }

    // Specific product data for product actions
    const activeProd = options.targetProduct || options.relevantProduct;
    if (activeProd) {
      const prodIndex = prods.findIndex((p: GiftProduct) => p.id === activeProd.id);
      const positionStr =
        prodIndex >= 0
          ? `Product #${prodIndex + 1} of ${prods.length}`
          : 'Target Product';

      includedModules.push('TARGET_PRODUCT_DATA');
      userLines.push(
        '',
        `TARGET PRODUCT FOR THIS ACTION (${positionStr.toUpperCase()}):`,
        `- Name: "${activeProd.name}"`,
        activeProd.productType ? `- Product Type: ${activeProd.productType}` : '',
        activeProd.url ? `- Product URL: ${activeProd.url}` : '',
        activeProd.summary ? `- Short Summary: ${activeProd.summary}` : '',
        activeProd.materialDetails ? `- Physical / Material Details: ${activeProd.materialDetails}` : '',
        activeProd.historicalContext ? `- Historical / Contextual Details: ${activeProd.historicalContext}` : '',
        activeProd.designDetails ? `- Design Details: ${activeProd.designDetails}` : '',
        activeProd.whyItFits ? `- Why It Fits This Guide: ${activeProd.whyItFits}` : '',
        activeProd.bestFor ? `- Best For: ${activeProd.bestFor}` : '',
        activeProd.buyerConsiderations ? `- Buyer Considerations: ${activeProd.buyerConsiderations}` : '',
        activeProd.notes ? `- Editorial Notes: ${activeProd.notes}` : '',
        activeProd.productInstructions ? `- Product-Specific Direction: ${activeProd.productInstructions}` : '',
        activeProd.rawInfo ? `- Raw Specifications: ${activeProd.rawInfo}` : '',
        '',
        'CRITICAL FACTUAL RESTRAINT: Do NOT invent missing details, dimensions, materials, or historical claims. Use ONLY supplied details.'
      );

      // Repetition control: provide excerpts of previously written product copies
      const writtenProds = prods.filter(
        (p: GiftProduct) => p.id !== activeProd.id && p.generatedCopy && p.generatedCopy.trim()
      );
      if (writtenProds.length > 0) {
        includedModules.push('REPETITION_CONTROL');
        userLines.push(
          '',
          'PREVIOUSLY GENERATED PRODUCT SECTIONS (FOR REPETITION AVOIDANCE):',
          'Avoid repetitive sentence openings, identical paragraph architectures, and formulaic clichés ("Perfect for...", "Ideal for...", "A great gift for...", "Whether you\'re..."). Vary your opening angles, sentence cadence, and reasons for inclusion.',
          ...writtenProds.slice(-4).map(
            (p: GiftProduct) =>
              `[Section for "${p.name}"]: "${extractPlainTextFromHtml(p.generatedCopy || '').slice(0, 140)}..."`
          )
        );
      }
    }
  }

  // ==========================================
  // 8. CONTENT OUTLINE (Relevant for Generation, Continue, or Section actions)
  // ==========================================
  if (category === 'GENERATION' || action === 'continue_writing' || targetOutlineItem) {
    if (project.outline && project.outline.length > 0) {
      includedModules.push('CONTENT_OUTLINE');
      userLines.push('', 'CONTENT OUTLINE BLUEPRINT:');
      project.outline.forEach((item, idx) => {
        const desc = item.description || item.notes ? ` — ${item.description || item.notes}` : '';
        userLines.push(`${idx + 1}. ${item.title}${desc}`);
      });
    }

    if (targetOutlineItem) {
      includedModules.push('TARGET_OUTLINE_ITEM');
      userLines.push(
        '',
        `TARGET OUTLINE SECTION TO DRAFT: "${targetOutlineItem.title}"`,
        targetOutlineItem.description || targetOutlineItem.notes
          ? `Section Notes: ${targetOutlineItem.description || targetOutlineItem.notes}`
          : ''
      );
    }
  }

  // ==========================================
  // 9. DOCUMENT CONTEXT
  // ==========================================
  const plainDoc = extractPlainTextFromHtml(project.content);
  if (category === 'GENERATION' || action === 'continue_writing' || action === 'review_writing') {
    if (plainDoc.trim()) {
      includedModules.push('CURRENT_DOCUMENT_CONTEXT');
      userLines.push(
        '',
        'EXISTING DOCUMENT CONTEXT (Excerpt):',
        plainDoc.length > 3000 ? '...' + plainDoc.slice(-3000) : plainDoc
      );
    }
  }

  // ==========================================
  // 10. RELEVANT INTERNAL LINKS (Phase 4 Linking Engine)
  // ==========================================
  if (category === 'LINKING' || action === 'find_link_opportunities') {
    const rawLinks = options.internalLinks || storage.getInternalLinks();
    const activeLinks = rawLinks.filter((l) => l.active);
    const usedUrls = options.alreadyUsedUrls || extractUrlsFromHtml(project.content);

    if (activeLinks.length > 0) {
      includedModules.push('RELEVANT_INTERNAL_LINKS');
      userLines.push(
        '',
        'AVAILABLE INTERNAL LINK LIBRARY (SCIENCE OF GIFTS PUBLICATION REPOSITORY):',
        'Analyze the document against these specific Science of Gifts articles. Only recommend links where the article provides genuine depth and value for the reader.',
        ...activeLinks.map(
          (l, i) =>
            `${i + 1}. [ID: ${l.id}] "${l.title}"\n   - URL: ${l.url}\n   - Topic: ${l.topic}\n   - Description: ${l.description}${
              l.preferredAnchor ? `\n   - Preferred Anchor (Suggestion): "${l.preferredAnchor}"` : ''
            }${l.notes ? `\n   - Editorial Notes: ${l.notes}` : ''}`
        )
      );

      if (usedUrls.length > 0) {
        userLines.push(
          '',
          'ALREADY USED URLS IN THIS DOCUMENT (DUPLICATE LINK PROTECTION):',
          'Do NOT recommend any of the following URLs again unless an exceptional editorial need exists:',
          ...usedUrls.map((u) => `- ${u}`)
        );
      }
    }
  }

  // ==========================================
  // 11. SELECTED TEXT (Target of Editing)
  // ==========================================
  if (selectedText && selectedText.trim()) {
    includedModules.push('SELECTED_TEXT');
    userLines.push(
      '',
      'SELECTED TEXT TO MODIFY / REFINE:',
      '"""',
      selectedText.trim(),
      '"""'
    );
  }

  // ==========================================
  // 12. REQUESTED ACTION & OUTPUT INSTRUCTIONS
  // ==========================================
  if (action === 'find_link_opportunities' || category === 'LINKING') {
    userLines.push(
      '',
      'ACTION: FIND EDITORIAL LINK OPPORTUNITIES',
      'Analyze the document content and identify exact locations where an existing Science of Gifts article from the library above would genuinely enrich the reader experience.',
      '',
      'MANDATORY EDITORIAL LINKING RULES:',
      '1. ONLY suggest a link when it genuinely helps the reader understand the topic or explore craft/psychological depth.',
      '2. Do NOT link merely because a keyword matches. Never force unnatural or exact-match SEO phrases.',
      '3. Anchor text MUST be natural, concise, and descriptive words already present (or naturally fitting) in the sentence.',
      '4. Never suggest clumsy phrases like "Read our article here" or "Click here".',
      '5. Do NOT link every paragraph. Prefer 2 to 5 high-value editorial connections over high quantity.',
      '6. Never recommend the same URL twice in one document.',
      '',
      'OUTPUT INSTRUCTIONS:',
      'Return ONLY valid JSON matching this exact structure:',
      '{',
      '  "opportunities": [',
      '    {',
      '      "linkId": "Exact ID of the library link (e.g. link-sog-displayable-gifts)",',
      '      "linkTitle": "Title of the target article",',
      '      "linkUrl": "Exact clean URL of the target article",',
      '      "targetPassage": "Exact sentence or clause from the document where the link belongs",',
      '      "suggestedAnchor": "Exact words within the targetPassage that should become the hyperlinked text",',
      '      "reason": "Clear 1-2 sentence editorial justification of why this link enriches the reader experience",',
      '      "relevance": "high"',
      '    }',
      '  ],',
      '  "rationale": "1-2 sentence editorial summary of internal linking strategy for this draft"',
      '}'
    );
  } else {
    userLines.push(
      '',
      `ACTION: ${action.toUpperCase()}`,
      `SCOPE: ${scope.toUpperCase()}`,
      customCommand ? `SPECIFIC DIRECTION: ${customCommand}` : `STANDARD ACTION: ${formatActionLabel(action)}`,
      '',
      'OUTPUT INSTRUCTIONS:',
      'Return ONLY valid JSON matching this exact structure:',
      '{',
      '  "proposedText": "The newly written or rewritten text. Must be publication-ready. CRITICAL: Never use Markdown formatting syntax (do NOT use **, *, #, ##, -, [link](url)). Output clean semantic HTML tags (<p>, <h2>, <h3>, <blockquote>, <strong>, <em>, <ul><li>) or clean prose ready for the visual rich-text canvas.",',
      '  "explanation": "A concise 1-2 sentence editorial note explaining how the prose was elevated according to Science of Gifts editorial standards."',
      '}'
    );
  }

  const userPrompt = userLines.filter(Boolean).join('\n');

  return {
    systemInstruction,
    userPrompt,
    includedModules,
  };
}

function describeTone(tone: string): string {
  switch (tone) {
    case 'editorial':
      return 'Civilized, authoritative, classic essayist voice';
    case 'conversational':
      return 'Warm, observant, speaking as a trusted connoisseur friend';
    case 'informative':
      return 'Clear, direct, grounded in practical utility and material reality';
    case 'witty':
      return 'Dry, perceptive humor with understated irony';
    case 'sophisticated':
      return 'Literary, evocative, connoisseur appreciation';
    case 'neutral':
      return 'Impartial, balanced, clean, and unadorned';
    default:
      return 'Measured editorial voice';
  }
}

function describeAudience(audience: string): string {
  switch (audience) {
    case 'general':
      return 'Broad thoughtful readers seeking accessible recommendations';
    case 'enthusiast':
      return 'Curious readers who appreciate craft, origins, and tactile details';
    case 'expert':
      return 'Knowledgeable connoisseurs who demand exact material and historical fidelity';
    default:
      return 'Discerning readers';
  }
}

function formatActionLabel(action: string): string {
  switch (action) {
    case 'rewrite_selection':
      return 'Rewrite the selected text for improved cadence and clarity';
    case 'make_more_concise':
      return 'Tighten the prose and remove any redundant words';
    case 'expand_selection':
      return 'Deepen the observation with tangible tactile and material details';
    case 'improve_flow':
      return 'Smooth transitions between ideas and naturalize rhythm';
    case 'change_tone':
      return 'Modulate tone to match the active writing controls';
    case 'add_context':
      return 'Provide illuminating historical or provenance context';
    case 'simplify':
      return 'Untangle complex phrasing into clean, direct editorial language';
    case 'generate_product_section':
      return 'Draft an insightful, unhurried product entry explaining its place in the guide';
    case 'rewrite_product_section':
      return 'Rewrite the product entry with fresh phrasing and refined editorial cadence';
    case 'generate_best_for':
      return 'Create a concise, insightful "Best For" summary for this product';
    case 'generate_product_buyer_advice':
      return 'Provide practical buyer guidance for evaluating this specific product';
    case 'generate_gift_guide_intro':
      return 'Draft an evocative guide introduction setting the curatorial premise';
    case 'generate_buyer_advice':
      return 'Compose discerning buyer guidance for choosing among the products in this guide';
    case 'generate_faq':
      return 'Draft thoughtful, non-spam FAQ entries addressing real buyer questions';
    case 'generate_faq_answers':
      return 'Provide clear, authoritative answers to the specified FAQ question';
    case 'generate_conclusion':
      return 'Draft a resonant, civilized conclusion reflecting on the gift selection';
    case 'generate_collection_link':
      return 'Insert an editorially appropriate link to the shop collection';
    default:
      return action.replace(/_/g, ' ');
  }
}
