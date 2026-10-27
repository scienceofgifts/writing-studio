/**
 * Science of Gifts - Stage 3 Product Creative Direction & Editorial Intelligence Utilities
 * Pure, deterministic helpers for:
 * 1. Building coordinated Creative Direction prompts (6+ titles, 4-5 angles, personas, buyer/recipient psychology, mismatches).
 * 2. Enforcing Manufacturer-Copy Anti-Parroting rules in both analysis and writing prompts.
 * 3. Sanitizing product metadata for AI requests (stripping base64 mockup image blobs that cause 503 payload/token timeouts).
 * 4. Normalizing & validating AI responses without silent overwrites.
 * 5. Explicit, user-triggered selection reducers for titles, angles, personas, and audience mismatches.
 */

import {
  ProductCopyMetadata,
  ProductCreativeDirectionSuite,
  ProductTitleOption,
  ProductTitleRole,
  ProductPositioningAngleOption,
  ProductAngleRole,
  ProductRecipientPersona,
  ProductSecondaryAudience,
  ProductAudienceMismatch,
  ProductAudienceAnalysis,
  ProductEpistemicAnalysis,
  ProductPositioning,
  ProductBriefLengthPreset,
  ProductCopySectionId,
  ProductBriefConfiguration,
} from '../types/project';
import { extractBase64AndMimeFromDataUrl } from './productImageUtils';

export type CreativeDirectionRegenerateTarget = 'all' | 'titles_only' | 'angles_only';

export interface BuildCreativeDirectionPromptParams {
  productName?: string;
  productType?: string;
  productUrl?: string;
  rawProductInfo?: string;
  epistemicAnalysis?: Partial<ProductEpistemicAnalysis>;
  productContext?: {
    intendedRecipient?: string;
    giftGuideOrOccasion?: string;
    targetAudience?: string;
    contextNotes?: string;
  };
  currentPositioning?: Partial<ProductPositioning>;
  editorCustomGuidance?: string;
  regenerateTarget?: CreativeDirectionRegenerateTarget;
  mockupImages?: Array<{
    id?: string;
    name?: string;
    mimeType?: string;
    dataUrl?: string;
    isPrimary?: boolean;
  }>;
}

const TITLE_ARCHETYPE_DEFAULTS: Array<{
  styleArchetype: string;
  titleRole: ProductTitleRole;
  intendedAppeal: string;
  searchIntent: string;
}> = [
  {
    styleArchetype: 'Direct Product & Concept Identity',
    titleRole: 'product_page',
    intendedAppeal: 'Shoppers who want immediate clarity on both the design subject and the physical product type',
    searchIntent: 'Direct product and subject discovery by category and theme',
  },
  {
    styleArchetype: 'Search-Intent & Recipient Gift Fit',
    titleRole: 'search_and_gift',
    intendedAppeal: 'Gift-buyers searching by recipient interest and practical item category',
    searchIntent: 'Recipient-focused gift query combining domain interest and product category',
  },
  {
    styleArchetype: 'Domain Motif & Garment/Object Form',
    titleRole: 'domain_specificity',
    intendedAppeal: 'Specialists and enthusiasts who recognize the exact reference paired with a clear item description',
    searchIntent: 'Specific subject-matter or reference query paired with product type',
  },
  {
    styleArchetype: 'Understated Observational Wit + Category',
    titleRole: 'product_page',
    intendedAppeal: 'Readers who appreciate dry humor without losing sight of what the physical product is',
    searchIntent: 'Witty or insider gift search where product category remains unmistakable',
  },
  {
    styleArchetype: 'Everyday Use & Occasion Fit',
    titleRole: 'search_and_gift',
    intendedAppeal: 'Gift-givers matching the item to a real workspace, lab, studio, or daily routine',
    searchIntent: 'Occasion and daily-use gift search for a specific recipient profile',
  },
  {
    styleArchetype: 'Visual Graphic Detail + Product Type',
    titleRole: 'product_page',
    intendedAppeal: 'Buyers drawn to diagram aesthetics, archival illustration, or clean layout on a functional item',
    searchIntent: 'Aesthetic and illustration style search combined with product category',
  },
  {
    styleArchetype: 'Gift-Guide Editorial Headline',
    titleRole: 'editorial_headline',
    intendedAppeal: 'Magazine and gift-guide readers browsing curated recommendations',
    searchIntent: 'Editorial gift-guide discovery with explicit product category anchor',
  },
];

const ANGLE_ARCHETYPE_DEFAULTS = [
  'Domain Literacy & Inside Recognition',
  'Visual Composition & Graphic Restraint',
  'Everyday Ritual & Practical Wearability',
  'Intellectual / Historical Lineage',
];

function cleanEditorialString(val: any, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val
    .replace(/—/g, ', ')
    .replace(/^[*_#`]+|[*_#`]+$/g, '')
    .trim() || fallback;
}

/**
 * Scrubs any language that implies guaranteed search rankings or #1 placement
 * so SEO rationales remain realistic and grounded in search intent and product clarity.
 */
export function sanitizeSeoExplanation(text: string): string {
  const cleaned = cleanEditorialString(text);
  if (!cleaned) return '';
  return cleaned
    .replace(/\bguarantees?\s+(?:top\s+|#1\s+|first[- ]page\s+)?(?:search\s+)?rankings?\b/gi, 'supports clear search intent alignment')
    .replace(/\bguaranteed\s+to\s+rank(?:\s+#1|\s+first|\s+highly)?\b/gi, 'structured to match relevant search queries')
    .replace(/\bwill\s+rank\s+#1\b/gi, 'clarifies product category for search discovery')
    .replace(/\bensures?\s+(?:top|first[- ]page|#1)\s+(?:google\s+|search\s+)?rankings?\b/gi, 'improves descriptive clarity for searchers');
}

/**
 * Checks whether a candidate title clearly identifies the product category/type.
 */
export function doesTitleIncludeProductCategory(title: string, productType: string): boolean {
  const tLower = (title || '').toLowerCase();
  const typeClean = (productType || '').toLowerCase().trim();
  if (!tLower || !typeClean) return false;
  if (tLower.includes(typeClean)) return true;

  const stopWords = new Set(['the', 'and', 'for', 'with', 'custom', 'curated', 'item', 'piece', 'object', 'product', 'gift']);
  const tokens = typeClean
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length >= 3 && !stopWords.has(tok));

  if (tokens.length === 0) return true;
  return tokens.some((tok) => tLower.includes(tok));
}

/**
 * Ensures a title clearly includes the product category when missing.
 */
export function ensureTitleProductCategoryClarity(
  title: string,
  productType: string
): string {
  const cleanTitle = cleanEditorialString(title);
  const cleanType = cleanEditorialString(productType);
  if (!cleanTitle) return cleanType || 'Curated Product';
  if (!cleanType || cleanType.toLowerCase() === 'curated piece' || cleanType.toLowerCase() === 'curated product') {
    return cleanTitle;
  }
  if (doesTitleIncludeProductCategory(cleanTitle, cleanType)) {
    return cleanTitle;
  }
  return `${cleanTitle} (${cleanType})`;
}

function normalizeTitleRole(val: any, fallback: ProductTitleRole = 'product_page'): ProductTitleRole {
  const v = String(val || '').toLowerCase().trim();
  if (
    v === 'product_page' ||
    v === 'search_and_gift' ||
    v === 'domain_specificity' ||
    v === 'editorial_headline'
  ) {
    return v;
  }
  if (v.includes('search') || v.includes('gift')) return 'search_and_gift';
  if (v.includes('domain') || v.includes('niche') || v.includes('subject')) return 'domain_specificity';
  if (v.includes('editorial') || v.includes('article') || v.includes('headline')) return 'editorial_headline';
  return fallback;
}

function cleanStringArray(val: any, fallback: string[] = []): string[] {
  if (Array.isArray(val)) {
    const cleaned = val
      .map((item) =>
        typeof item === 'string'
          ? cleanEditorialString(item)
          : cleanEditorialString(item?.text || item?.keyword || item?.motivation || item?.caution || '')
      )
      .filter(Boolean);
    return cleaned.length > 0 ? cleaned : fallback;
  }
  if (typeof val === 'string' && val.trim()) {
    return val
      .split(/[,;|]+/)
      .map((s) => cleanEditorialString(s))
      .filter(Boolean);
  }
  return fallback;
}

/**
 * Strips base64 `dataUrl` image payloads and snapshot history from ProductCopyMetadata
 * before serializing into `/api/gemini/action` or prompt text.
 * Also fences `rawProductInfo` as raw manufacturer source material to prevent vendor parroting.
 */
export function sanitizeProductMetadataForPrompt(rawProduct: any): Record<string, any> | null {
  if (!rawProduct || typeof rawProduct !== 'object') {
    return null;
  }

  const clone: Record<string, any> = { ...rawProduct };

  // Strip heavy base64 mockup image dataUrls that bloat JSON prompts by 100k+ tokens and trigger 503 errors
  if (Array.isArray(clone.mockupImages)) {
    const primaryImg = clone.mockupImages.find((img: any) => img?.isPrimary) || clone.mockupImages[0];
    clone.mockupImagesSummary = {
      count: clone.mockupImages.length,
      primaryImageName: primaryImg?.name || undefined,
    };
    delete clone.mockupImages;
  }

  // Strip any legacy inline base64 imageUrl if it is a data: URI
  if (typeof clone.imageUrl === 'string' && clone.imageUrl.startsWith('data:')) {
    clone.imageUrl = '[Uploaded Mockup Image]';
  }

  // Fence rawProductInfo so the model treats manufacturer copy strictly as raw factual source claims
  if (typeof clone.rawProductInfo === 'string' && clone.rawProductInfo.trim()) {
    clone.rawManufacturerSpecNotes = {
      epistemicRule:
        'RAW VENDOR SOURCE MATERIAL ONLY: Extract objective physical facts (fabric blend, GSM/oz weight, dimensions, care, print method) only. NEVER copy, parrot, or lightly paraphrase vendor phrasing, promotional superlatives, or marketing sentences.',
      sourceText: clone.rawProductInfo.trim().slice(0, 2500),
    };
    delete clone.rawProductInfo;
  }

  // Summarize creativeDirection to only selected/active items so unselected candidates don't clutter action prompts
  if (clone.creativeDirection && typeof clone.creativeDirection === 'object') {
    const cd = clone.creativeDirection as ProductCreativeDirectionSuite;
    const primaryTitle = cd.titleOptions?.find((t) => t.id === cd.selectedPrimaryTitleId);
    const primaryAngle = cd.positioningAngles?.find(
      (a) => a.id === cd.selectedPrimaryAngleId || a.role === 'primary'
    );
    const secondaryAngles = (cd.positioningAngles || []).filter(
      (a) =>
        (cd.selectedSecondaryAngleIds || []).includes(a.id) || a.role === 'secondary'
    );
    const excludedAngles = (cd.positioningAngles || []).filter(
      (a) => (cd.excludedAngleIds || []).includes(a.id) || a.role === 'do_not_use'
    );

    clone.selectedCreativeDirection = {
      selectedHeadlineOption: primaryTitle
        ? {
            title: primaryTitle.title,
            standfirst: primaryTitle.standfirst,
            styleArchetype: primaryTitle.styleArchetype,
            rationale: primaryTitle.rationale,
          }
        : undefined,
      primaryAngle: primaryAngle
        ? {
            title: primaryAngle.title,
            coreHook: primaryAngle.coreHook,
            supportingEvidence: primaryAngle.supportingEvidence,
            whatToEmphasize: primaryAngle.whatToEmphasize,
            risksAndWhatToAvoid: primaryAngle.risksAndWhatToAvoid,
          }
        : undefined,
      secondaryAngles: secondaryAngles.map((a) => ({
        title: a.title,
        coreHook: a.coreHook,
        whatToEmphasize: a.whatToEmphasize,
      })),
      excludedAnglesToAvoid: excludedAngles.map((a) => ({
        title: a.title,
        reasonToAvoid: a.risksAndWhatToAvoid || a.coreHook,
      })),
      buyerMotivations: cd.audienceAnalysis?.buyerMotivations || [],
      recipientPerspective: cd.audienceAnalysis?.recipientPerspective || '',
      audienceMismatches: (cd.audienceAnalysis?.audienceMismatches || []).map((m) => ({
        whoShouldSkip: m.whoShouldSkip,
        copyCaution: m.copyCaution,
      })),
      editorialCautions: cd.editorialCautions || [],
    };
    delete clone.creativeDirection;
  }

  // Attach resolved brief configuration so in-app generation honors section selection, spec restraint, and word count
  const resolvedBrief = resolveProductBriefConfig(rawProduct as ProductCopyMetadata);
  clone.resolvedBriefBlueprint = {
    selectedSections: PRODUCT_COPY_SECTIONS_CATALOG.filter((s) =>
      resolvedBrief.selectedSections.includes(s.id)
    ).map((s) => ({
      id: s.id,
      label: s.label,
      directive: s.promptDirective,
    })),
    excludedSections: PRODUCT_COPY_SECTIONS_CATALOG.filter(
      (s) => !resolvedBrief.selectedSections.includes(s.id)
    ).map((s) => ({
      id: s.id,
      label: s.label,
      omissionRule: s.omissionDirective,
    })),
    targetWordCount: resolvedBrief.targetWordCount,
    acceptableWordRange: `${resolvedBrief.minWords}-${resolvedBrief.maxWords} words`,
    headlineCountsTowardWordCount: resolvedBrief.headlineCountsTowardWordCount,
    includeTechnicalSpecs: resolvedBrief.includeTechnicalSpecs,
    specificationPolicy: resolvedBrief.includeTechnicalSpecs
      ? 'Include only verified physical specifications.'
      : 'DO NOT repeat materials, dimensions, insulation performance, care instructions, or compliance details already displayed elsewhere on the product page.',
  };

  return clone;
}

/**
 * Resolves the primary Gemini model for `/api/gemini/action` requests.
 * For Product Copy actions (`projectType === 'product_copy'` or `action === 'generate_product_copy'`),
 * defaults to `gemini-3.6-flash` (matching `/api/products/analyze-research` and `/api/products/generate-creative-direction`)
 * when no explicit non-default model override was chosen, avoiding `gemini-3.8-flash` upstream timeouts/503s.
 */
export function resolveProductCopyActionModel(params: {
  requestedModel?: string;
  modelOverride?: string;
  projectType?: string;
  action?: string;
  actionType?: string;
  validModels?: Set<string>;
}): string {
  const valid =
    params.validModels ||
    new Set([
      'gemini-3-flash-preview',
      'gemini-3.8-flash',
      'gemini-3.7-flash',
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
    ]);

  const isProductCopy =
    params.projectType === 'product_copy' ||
    params.actionType === 'product_copy' ||
    params.action === 'generate_product_copy';

  const explicitCandidate = (params.modelOverride || params.requestedModel || '').trim();
  if (isProductCopy) {
    // If no explicit model was chosen, or if the implicit global default ('gemini-3.8-flash') was passed without explicit override
    if (!explicitCandidate || explicitCandidate === 'gemini-3.8-flash' || explicitCandidate === 'gemini-3.6-flash') {
      return 'gemini-3-flash-preview';
    }
    if (valid.has(explicitCandidate)) {
      return explicitCandidate;
    }
    return 'gemini-3-flash-preview';
  }

  if (explicitCandidate && valid.has(explicitCandidate)) {
    return explicitCandidate;
  }
  return 'gemini-3-flash-preview';
}

/**
 * Normalizes `parsed.proposedText` from `/api/gemini/action` so structured object responses
 * (e.g. `{ headline, standfirst, description }` or `{ proposedText: { Headline, Standfirst, Description } }`)
 * are converted cleanly into editorial HTML/text instead of failing `typeof parsed.proposedText !== 'string'`.
 */
export function normalizeEditorialActionProposedText(parsed: any): string | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if (typeof parsed.proposedText === 'string' && parsed.proposedText.trim()) {
    return parsed.proposedText.trim();
  }

  const candidateObj =
    parsed.proposedText && typeof parsed.proposedText === 'object'
      ? parsed.proposedText
      : parsed;

  const headline = cleanEditorialString(
    candidateObj.headline || candidateObj.Headline || candidateObj.title
  );
  const standfirst = cleanEditorialString(
    candidateObj.standfirst || candidateObj.Standfirst || candidateObj.subtitle || candidateObj.deck
  );
  const description = cleanEditorialString(
    candidateObj.description ||
      candidateObj.Description ||
      candidateObj.body ||
      candidateObj.content ||
      candidateObj.copy
  );

  if (headline || standfirst || description) {
    const parts: string[] = [];
    if (headline) parts.push(`<h2>${headline}</h2>`);
    if (standfirst) parts.push(`<p><em>${standfirst}</em></p>`);
    if (description) {
      if (/<[a-z][\s\S]*>/i.test(description)) {
        parts.push(description);
      } else {
        const paragraphs = description
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);
        parts.push(...paragraphs.map((p) => `<p>${p}</p>`));
      }
    }
    return parts.join('\n');
  }

  return null;
}

/**
 * Builds the system instruction and user prompt (plus optional primary mockup inlineData)
 * for coordinated Stage 3 Product Creative Direction generation.
 */
export function buildCreativeDirectionPromptAndParts(
  params: BuildCreativeDirectionPromptParams
): {
  systemInstruction: string;
  contents: any;
} {
  const {
    productName = 'Untitled Product',
    productType = 'Curated Product',
    productUrl = '',
    rawProductInfo = '',
    epistemicAnalysis,
    productContext,
    currentPositioning,
    editorCustomGuidance = '',
    regenerateTarget = 'all',
    mockupImages = [],
  } = params;

  const vf = epistemicAnalysis?.verifiedFacts || {};
  const vo = epistemicAnalysis?.visibleObservations || {};
  const ei = epistemicAnalysis?.editorialInferences || {};

  const systemInstruction = `You are the Creative Editorial Director for "Science of Gifts", an independent literary publication and curated shop dedicated to thoughtful gifting, scientific and historical curiosity, fine material craft, and dry observational wit.

Your task is to analyze the reviewed Stage 2 Product Facts, Visible Mockup Observations, and Recipient Context Profile, and synthesize a complete, high-intelligence Creative Direction Suite in a single JSON pass.

STRICT EDITORIAL & EPISTEMIC RULES:
1. EPISTEMIC HONESTY:
   - Ground every positioning angle's "supportingEvidence" in either the provided Verified Facts (from the product URL) or Visible Observations (from the mockup image).
   - Never invent fabric weights, GSM, dimensions, provenance, or historical origins not supported by the Verified Facts.
   - If fields are listed in "unverifiedFields", explicitly warn against claiming them in "editorialCautions" and angle "risksAndWhatToAvoid".
2. MANUFACTURER COPY ANTI-PARROTING RULE:
   - Any raw manufacturer specification notes ("rawProductInfo") are provided strictly to identify physical construction facts.
   - NEVER copy, parrot, or echo vendor marketing language, promotional superlatives, or generic e-commerce clichés.
3. HOUSE VOICE & PUNCTUATION:
   - Never use em dashes (—). Use commas, colons, semicolons, or parentheses instead.
   - Never use markdown formatting (no **, *, #) inside JSON string values.
   - Avoid forbidden clichés ("Perfect for...", "Whether you're looking for...", "Must-have", "Takes it to the next level", "Elevate your...").
4. REQUIRED CREATIVE OUTPUT DEPTH & TITLE GENERATION RULES:
   - "titleOptions": Generate 6 to 8 genuinely useful title alternatives spanning clear product-page titles, search/recipient-intent gift titles, domain-specific titles, and editorial headlines:
     * PRIORITIZE ACCURATE PRODUCT IDENTIFICATION, USEFUL SEARCH INTENT, AND NATURAL WORDING OVER CLEVERNESS.
     * The actual product category ("${productType}") MUST be clear in every title so shoppers and search engines immediately know what physical item is being offered.
     * Avoid corny puns, forced wordplay, pretentious magazine clichés ("Field Notes on...", "The Case for...", "Quietly Specific"), keyword stuffing, or cleverness that obscures the product.
     * Distinguish storefront product titles ("titleRole": "product_page" or "search_and_gift" or "domain_specificity") from gift-guide/article section headlines ("titleRole": "editorial_headline").
     * Each title option MUST include:
       - "title": Natural, clear title including the product category (no em dashes).
       - "standfirst": 1-sentence companion subtitle/deck.
       - "styleArchetype": Strategy label.
       - "titleRole": One of "product_page" | "search_and_gift" | "domain_specificity" | "editorial_headline".
       - "searchIntent": Intended buyer or reader search intent.
       - "targetKeywords": Array of 2 to 4 natural descriptive search phrases (product category + subject/motif + recipient).
       - "intendedAppeal": Which buyer or recipient impulse this serves.
       - "rationale": Strategy explanation (why this phrasing works).
       - "strengths": Specific clarity, search-intent, and gift-appeal strengths.
       - "weaknesses": Honest trade-offs (e.g., length, niche specificity, or editorial vs. storefront tone).
     * SEO HONESTY RULE: Frame search intent and keyword explanations strictly around descriptive clarity, product category identification, and natural query alignment. NEVER claim or imply guaranteed rankings, #1 placement, or guaranteed search traffic.
   - "recommendedTitleIndex" & "recommendedTitleRationale":
     * Identify the single strongest overall title (0-based index in "titleOptions") and provide a 2-sentence reasoned explanation of why it best balances product category clarity, natural wording, search intent, and recipient appeal.
   - "positioningAngles": Generate 4 to 5 distinct creative positioning angles. Each angle MUST include "title", "archetype", "coreHook", "supportingEvidence", "whatToEmphasize", and "risksAndWhatToAvoid".
   - "audienceAnalysis":
     * "primaryPersonas": 2 to 3 specific, vivid recipient personas ("name", "profileSummary", "whyItResonates", "contextOfUse").
     * "secondaryAudiences": 2 to 3 adjacent or unexpected secondary audiences ("audience", "whyItFits").
     * "buyerMotivations": 3 to 4 psychological reasons why a gift-buyer selects this item for someone else (e.g., signaling shared niche literacy, safe vs. insider humor, occasion fit).
     * "recipientPerspective": 2 to 3 sentences explaining how the recipient actually experiences opening, wearing, displaying, or using this item.
     * "audienceMismatches": 2 to 3 specific anti-personas or mismatched buyer expectations ("whoShouldSkip", "whyItMismatches", "copyCaution").
   - "editorialCautions": 3 to 4 concrete guardrails on tone, unverified specs, or overclaiming.`;

  const lines: string[] = [];
  lines.push(`PRODUCT NAME: ${productName}`);
  lines.push(`PRODUCT CATEGORY / TYPE: ${productType}`);
  if (productUrl) lines.push(`PRODUCT URL: ${productUrl}`);
  lines.push(`GENERATION SCOPE: ${regenerateTarget}`);

  if (editorCustomGuidance.trim()) {
    lines.push(
      `\n=== EDITOR'S CUSTOM GUIDANCE (SOVEREIGN PRIORITY) ===\n${editorCustomGuidance.trim()}`
    );
  }

  lines.push(`\n=== RECIPIENT & GIFT CONTEXT PROFILE ===`);
  lines.push(`- Intended Recipient: ${productContext?.intendedRecipient || 'Discerning recipient'}`);
  lines.push(`- Gift Guide / Occasion: ${productContext?.giftGuideOrOccasion || 'Thoughtful gifting'}`);
  lines.push(`- Target Audience: ${productContext?.targetAudience || 'Curious enthusiasts'}`);
  if (productContext?.contextNotes) {
    lines.push(`- Editorial Context & Tone Notes: ${productContext.contextNotes}`);
  }

  lines.push(`\n=== STAGE 2 REVIEWED EPISTEMIC INPUTS ===`);
  lines.push(`A. VERIFIED PRODUCT FACTS (SOURCED SPECS):`);
  lines.push(`- Price: ${vf.price || 'Unverified'}`);
  lines.push(`- Materials: ${vf.materials || 'Unverified'}`);
  lines.push(`- Dimensions: ${vf.dimensions || 'Unverified'}`);
  lines.push(`- Colors: ${vf.colors || 'Unverified'}`);
  lines.push(`- Features: ${vf.features || 'Unverified'}`);
  lines.push(`- Variants: ${vf.variants || 'Unverified'}`);
  if (vf.additionalSpecs) lines.push(`- Additional Specs: ${vf.additionalSpecs}`);
  if (vf.unverifiedFields && vf.unverifiedFields.length > 0) {
    lines.push(`- UNVERIFIED FIELDS (DO NOT ASSERT AS FACT): ${vf.unverifiedFields.join(', ')}`);
  }

  if (rawProductInfo.trim()) {
    lines.push(
      `\nRAW MANUFACTURER SPECIFICATION NOTES (FACTUAL SOURCE MATERIAL ONLY — DO NOT PARROT VENDOR PHRASING OR HYPE):\n${rawProductInfo
        .trim()
        .slice(0, 2000)}`
    );
  }

  lines.push(`\nB. VISIBLE MOCKUP OBSERVATIONS:`);
  lines.push(`- Visible Text / Inscription: ${vo.visibleText || 'None noted'}`);
  lines.push(`- Graphic Design & Imagery: ${vo.designAndImagery || 'None noted'}`);
  lines.push(`- Garment / Object Style: ${vo.garmentOrObjectStyle || productType}`);
  lines.push(`- Visible Colors & Contrast: ${vo.visibleColors || 'None noted'}`);
  lines.push(`- Additional Visual Details: ${vo.visualDetails || 'None noted'}`);

  lines.push(`\nC. INITIAL EDITORIAL INFERENCES:`);
  lines.push(`- Design Concept: ${ei.designConcept || 'None noted'}`);
  lines.push(`- Historical / Scientific / Cultural Context: ${ei.historicalOrCulturalContext || 'None noted'}`);
  lines.push(`- Recipient Resonance: ${ei.recipientResonance || 'None noted'}`);
  lines.push(`- Initial Editorial Caution: ${ei.editorialCaution || 'None noted'}`);

  if (currentPositioning && Object.values(currentPositioning).some((v) => Boolean(v && v.trim()))) {
    lines.push(`\n=== EXISTING WRITER POSITIONING NOTES (RESPECT AS CONTEXT) ===`);
    if (currentPositioning.keySellingAngle) {
      lines.push(`- Key Selling Angle: ${currentPositioning.keySellingAngle}`);
    }
    if (currentPositioning.suitedRecipient) {
      lines.push(`- Suited Recipient: ${currentPositioning.suitedRecipient}`);
    }
    if (currentPositioning.whatToEmphasize) {
      lines.push(`- What to Emphasize: ${currentPositioning.whatToEmphasize}`);
    }
    if (currentPositioning.whatToAvoid) {
      lines.push(`- What to Avoid: ${currentPositioning.whatToAvoid}`);
    }
  }

  lines.push(`\nReturn ONLY valid JSON matching this schema:
{
  "titleOptions": [
    {
      "title": "string (natural, clear title that explicitly includes the product category '${productType}', no em dashes)",
      "standfirst": "string (1-sentence companion deck/subtitle)",
      "styleArchetype": "string (e.g. Direct Product & Concept Identity, Search-Intent & Recipient Gift Fit, Domain Motif & Garment/Object Form, Understated Observational Wit + Category, Everyday Use & Occasion Fit, Visual Graphic Detail + Product Type, Gift-Guide Editorial Headline)",
      "titleRole": "product_page | search_and_gift | domain_specificity | editorial_headline",
      "searchIntent": "string (the realistic shopper or reader search intent this title serves, without promising guaranteed rankings)",
      "targetKeywords": ["string (2-4 natural descriptive search phrases including product category and subject)"],
      "intendedAppeal": "string (which reader or buyer impulse this hooks)",
      "rationale": "string (why this title works for product clarity, search intent, and recipient fit)",
      "strengths": "string (specific clarity, natural wording, and search/gift strengths)",
      "weaknesses": "string (honest trade-offs, niche scope, or length considerations)"
    }
  ],
  "recommendedTitleIndex": 0,
  "recommendedTitleRationale": "string (2-3 sentences explaining why this title is the strongest overall choice across accurate product identification, natural language, search intent, and gift appeal, without implying guaranteed rankings)",
  "positioningAngles": [
    {
      "title": "string (concise angle name)",
      "archetype": "string",
      "coreHook": "string (1-2 sentence positioning thesis)",
      "supportingEvidence": "string (specific Verified Facts or Visible Observations supporting this angle)",
      "whatToEmphasize": "string (concrete details the writer should foreground)",
      "risksAndWhatToAvoid": "string (how this angle could fail or overclaim if mishandled)"
    }
  ],
  "audienceAnalysis": {
    "primaryPersonas": [
      {
        "name": "string (vivid persona label)",
        "profileSummary": "string (who they are and what they care about)",
        "whyItResonates": "string (why this specific design/object clicks with them)",
        "contextOfUse": "string (where and how they wear, use, or display it)"
      }
    ],
    "secondaryAudiences": [
      {
        "audience": "string (adjacent audience segment)",
        "whyItFits": "string (why it transfers well to this group)"
      }
    ],
    "buyerMotivations": ["string (why the gift-giver chooses this item and what it signals)"],
    "recipientPerspective": "string (how the recipient experiences opening and owning it)",
    "audienceMismatches": [
      {
        "whoShouldSkip": "string (anti-persona or mismatched expectation)",
        "whyItMismatches": "string (why this item is a poor fit for them)",
        "copyCaution": "string (how the copy should avoid misleading this buyer)"
      }
    ]
  },
  "editorialCautions": ["string (specific factual or tonal guardrails)"]
}`);

  const promptText = lines.join('\n');

  // Attach primary mockup image (up to 2 images) if available for visual grounding
  const validImages = (mockupImages || [])
    .filter((img) => Boolean(img && img.dataUrl && extractBase64AndMimeFromDataUrl(img.dataUrl)))
    .sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0))
    .slice(0, 2);

  if (validImages.length === 0) {
    return {
      systemInstruction,
      contents: promptText,
    };
  }

  const parts: any[] = [];
  validImages.forEach((img, idx) => {
    const parsed = extractBase64AndMimeFromDataUrl(img.dataUrl || '');
    if (!parsed) return;
    parts.push({
      text: `Product Mockup ${idx + 1}${img.isPrimary ? ' (PRIMARY)' : ''}: ${img.name || 'mockup'}`,
    });
    parts.push({
      inlineData: {
        data: parsed.base64Data,
        mimeType: parsed.mimeType,
      },
    });
  });
  parts.push({ text: promptText });

  return {
    systemInstruction,
    contents: [{ role: 'user', parts }],
  };
}

/**
 * Normalizes and validates raw AI JSON into a complete ProductCreativeDirectionSuite.
 * Guarantees 6 to 8 distinct title options (with clear product category identification,
 * search intent, keyword coverage, non-guaranteed SEO explanations, and a reasoned overall recommendation)
 * and >= 4 positioning angles.
 * Never sets selectedPrimaryTitleId or selectedPrimaryAngleId automatically.
 */
export function normalizeCreativeDirectionOutput(
  parsedModelJson: any,
  context: {
    productName?: string;
    productType?: string;
    intendedRecipient?: string;
    visibleText?: string;
    designConcept?: string;
    unverifiedFields?: string[];
    editorCustomGuidance?: string;
    modelUsed?: string;
  } = {}
): ProductCreativeDirectionSuite {
  const raw = parsedModelJson && typeof parsedModelJson === 'object' ? parsedModelJson : {};
  const prodName = cleanEditorialString(context.productName, 'Curated Object');
  const prodType = cleanEditorialString(context.productType, 'Curated Piece');
  const recipient = cleanEditorialString(context.intendedRecipient, 'Discerning Enthusiasts');
  const nowIso = new Date().toISOString();
  const ts = Date.now();

  const defaultKeywordSet = [
    prodType.toLowerCase(),
    prodName.toLowerCase(),
    `${recipient.toLowerCase()} gift`,
  ].filter(Boolean);

  // 1. Normalize Title Options (guarantee 6 to 8 distinct, category-clear options)
  const rawTitles = Array.isArray(raw.titleOptions) ? raw.titleOptions : [];
  const titleOptions: ProductTitleOption[] = rawTitles
    .slice(0, 8)
    .map((item: any, idx: number) => {
      const fallbackArchetype =
        TITLE_ARCHETYPE_DEFAULTS[idx % TITLE_ARCHETYPE_DEFAULTS.length];
      const rawTitleText = cleanEditorialString(item?.title);
      if (!rawTitleText) return null;

      const titleRole = normalizeTitleRole(
        item?.titleRole || item?.role || item?.format,
        fallbackArchetype.titleRole
      );
      const ensuredTitle = ensureTitleProductCategoryClarity(rawTitleText, prodType);
      const includesCategory = doesTitleIncludeProductCategory(ensuredTitle, prodType);

      return {
        id: cleanEditorialString(item?.id, `title-${ts}-${idx + 1}`),
        title: ensuredTitle,
        standfirst: cleanEditorialString(
          item?.standfirst || item?.subtitle,
          `A closer look at ${prodName} (${prodType.toLowerCase()}) for ${recipient.toLowerCase()}.`
        ),
        styleArchetype: cleanEditorialString(
          item?.styleArchetype || item?.styleLabel,
          fallbackArchetype.styleArchetype
        ),
        titleRole,
        includesProductCategory: includesCategory,
        searchIntent: sanitizeSeoExplanation(
          item?.searchIntent || fallbackArchetype.searchIntent
        ),
        targetKeywords: cleanStringArray(item?.targetKeywords || item?.keywords, defaultKeywordSet),
        intendedAppeal: cleanEditorialString(
          item?.intendedAppeal || item?.appeal,
          fallbackArchetype.intendedAppeal
        ),
        rationale: sanitizeSeoExplanation(
          item?.rationale ||
            `Identifies the ${prodType.toLowerCase()} clearly while connecting the design concept to ${recipient.toLowerCase()}.`
        ),
        strengths: sanitizeSeoExplanation(
          item?.strengths ||
            `Clear ${prodType.toLowerCase()} category identification and natural wording.`
        ),
        weaknesses: sanitizeSeoExplanation(
          item?.weaknesses ||
            'May benefit from a supporting standfirst to elaborate on the specific visual motif.'
        ),
        isRecommended: Boolean(item?.isRecommended),
      };
    })
    .filter(Boolean) as ProductTitleOption[];

  // Pad up to 6–7 distinct, natural, category-clear title options if model returned fewer than 6
  const baseSubject = doesTitleIncludeProductCategory(prodName, prodType)
    ? prodName
    : `${prodName} ${prodType}`;

  const fallbackTemplates: Array<Omit<ProductTitleOption, 'id'>> = [
    {
      title: baseSubject,
      standfirst: `An understated ${prodType.toLowerCase()} designed for ${recipient.toLowerCase()} who appreciate accurate visual detail.`,
      styleArchetype: 'Direct Product & Concept Identity',
      titleRole: 'product_page',
      includesProductCategory: true,
      searchIntent: `Shoppers searching directly for a ${prodName.toLowerCase()} ${prodType.toLowerCase()}`,
      targetKeywords: [prodType.toLowerCase(), prodName.toLowerCase(), `${prodType.toLowerCase()} for ${recipient.toLowerCase()}`],
      intendedAppeal: 'Shoppers who want immediate clarity on both the design subject and the physical product type',
      rationale: `Pairs the exact motif name with the ${prodType.toLowerCase()} category in natural, straightforward language.`,
      strengths: 'Unmistakable product category clarity and natural phrasing for product pages and search.',
      weaknesses: 'Prioritizes direct clarity over narrative intrigue.',
    },
    {
      title: `${baseSubject} for ${recipient}`,
      standfirst: `A practical ${prodType.toLowerCase()} that pairs domain-specific visual character with everyday use.`,
      styleArchetype: 'Search-Intent & Recipient Gift Fit',
      titleRole: 'search_and_gift',
      includesProductCategory: true,
      searchIntent: `Gift buyers searching for a ${prodType.toLowerCase()} gift for ${recipient.toLowerCase()}`,
      targetKeywords: [`${prodType.toLowerCase()} for ${recipient.toLowerCase()}`, `${recipient.toLowerCase()} gift`, prodName.toLowerCase()],
      intendedAppeal: 'High-intent gift shoppers looking for a specific recipient and product type match',
      rationale: `Connects the ${prodType.toLowerCase()} directly to the intended recipient and how gift shoppers naturally search.`,
      strengths: 'Strong alignment with recipient gift queries and clear product identification.',
      weaknesses: 'More utilitarian than an editorial feature headline.',
    },
    {
      title: `${prodName}: Graphic ${prodType} with Scientific & Visual Detail`,
      standfirst: `Clean diagram composition and dry observational wit on a classic ${prodType.toLowerCase()}.`,
      styleArchetype: 'Domain Motif & Garment/Object Form',
      titleRole: 'domain_specificity',
      includesProductCategory: true,
      searchIntent: `Enthusiasts searching for a domain-specific graphic ${prodType.toLowerCase()}`,
      targetKeywords: [`graphic ${prodType.toLowerCase()}`, prodName.toLowerCase(), `science ${prodType.toLowerCase()}`],
      intendedAppeal: 'Domain specialists and detail-oriented buyers who notice the visual motif',
      rationale: `Highlights the subject-matter motif while keeping the ${prodType.toLowerCase()} category explicit.`,
      strengths: 'Balances niche subject recognition with explicit product category terms.',
      weaknesses: 'Slightly longer for compact mobile product grids.',
    },
    {
      title: `Understated Domain Wit: The ${baseSubject}`,
      standfirst: `A ${prodType.toLowerCase()} that trades loud novelty slogans for quiet insider recognition.`,
      styleArchetype: 'Understated Observational Wit + Category',
      titleRole: 'product_page',
      includesProductCategory: true,
      searchIntent: `Buyers looking for a tasteful, non-corny ${prodType.toLowerCase()} for ${recipient.toLowerCase()}`,
      targetKeywords: [prodName.toLowerCase(), prodType.toLowerCase(), `subtle ${recipient.toLowerCase()} gift`],
      intendedAppeal: 'Skeptical gift buyers tired of loud, generic novelty merchandise',
      rationale: `Differentiates the ${prodType.toLowerCase()} from loud novelty items while naming the product clearly.`,
      strengths: 'Addresses buyer hesitation around wearable or displayable gifts while keeping the category clear.',
      weaknesses: 'Leads with tone before the product noun.',
    },
    {
      title: `Everyday Lab, Studio & Weekend ${baseSubject}`,
      standfirst: `Built for regular rotation by ${recipient.toLowerCase()} at the desk, seminar, or studio.`,
      styleArchetype: 'Everyday Use & Occasion Fit',
      titleRole: 'search_and_gift',
      includesProductCategory: true,
      searchIntent: `Shoppers seeking a practical everyday ${prodType.toLowerCase()} for ${recipient.toLowerCase()}`,
      targetKeywords: [`everyday ${prodType.toLowerCase()}`, prodName.toLowerCase(), `${recipient.toLowerCase()} apparel and gifts`],
      intendedAppeal: 'Gift-givers matching the item to a real workspace, lab, or daily routine',
      rationale: `Grounds the ${prodType.toLowerCase()} in realistic contexts of use rather than abstract praise.`,
      strengths: 'Helps the buyer picture where and how the recipient will actually use the item.',
      weaknesses: 'Less focused on the specific graphic inscription.',
    },
    {
      title: `Illustrated Diagram ${baseSubject} for Curious Minds`,
      standfirst: `Drawing on clean specimen linework and legible typography in a comfortable ${prodType.toLowerCase()}.`,
      styleArchetype: 'Visual Graphic Detail + Product Type',
      titleRole: 'product_page',
      includesProductCategory: true,
      searchIntent: `Shoppers searching for an illustrated or diagram-style ${prodType.toLowerCase()}`,
      targetKeywords: [`illustrated ${prodType.toLowerCase()}`, `diagram ${prodType.toLowerCase()}`, prodName.toLowerCase()],
      intendedAppeal: 'Buyers drawn to visual composition, archival linework, and legible typography',
      rationale: `Foregrounds the visual execution and physical ${prodType.toLowerCase()} category together.`,
      strengths: 'Descriptive visual cues for shoppers comparing design quality.',
      weaknesses: 'Focuses more on visual style than the specific joke.',
    },
    {
      title: `Why the ${baseSubject} Makes a Thoughtful Gift for ${recipient}`,
      standfirst: `How a well-executed ${prodType.toLowerCase()} earns a permanent place in weekly rotation.`,
      styleArchetype: 'Gift-Guide Editorial Headline',
      titleRole: 'editorial_headline',
      includesProductCategory: true,
      searchIntent: `Readers browsing curated gift guides for ${recipient.toLowerCase()}`,
      targetKeywords: [`gift for ${recipient.toLowerCase()}`, prodName.toLowerCase(), prodType.toLowerCase()],
      intendedAppeal: 'Magazine and gift-guide readers evaluating why this item stands out',
      rationale: `Structured as a natural editorial or gift-guide section headline while keeping the ${prodType.toLowerCase()} explicit.`,
      strengths: 'Ideal for editorial roundups, gift guides, and feature introductions.',
      weaknesses: 'Framed as an editorial headline rather than a compact storefront SKU title.',
    },
  ];

  let padIndex = 0;
  while (titleOptions.length < 6 && padIndex < fallbackTemplates.length) {
    const candidate = fallbackTemplates[padIndex];
    const alreadyExists = titleOptions.some(
      (t) => t.title.toLowerCase() === candidate.title.toLowerCase()
    );
    if (!alreadyExists) {
      titleOptions.push({
        id: `title-${ts}-fallback-${padIndex + 1}`,
        ...candidate,
      });
    }
    padIndex++;
  }

  // Determine recommended title (prefer explicit model index/id, else first product_page or search_and_gift title that includes product category)
  let recIdx = -1;
  if (
    typeof raw.recommendedTitleIndex === 'number' &&
    raw.recommendedTitleIndex >= 0 &&
    raw.recommendedTitleIndex < titleOptions.length
  ) {
    recIdx = raw.recommendedTitleIndex;
  } else if (typeof raw.recommendedTitleId === 'string' && raw.recommendedTitleId.trim()) {
    recIdx = titleOptions.findIndex((t) => t.id === raw.recommendedTitleId.trim());
  } else {
    recIdx = titleOptions.findIndex((t) => t.isRecommended);
  }

  if (recIdx < 0) {
    recIdx = titleOptions.findIndex(
      (t) =>
        t.includesProductCategory &&
        (t.titleRole === 'product_page' || t.titleRole === 'search_and_gift')
    );
  }
  if (recIdx < 0) recIdx = 0;

  titleOptions.forEach((t, idx) => {
    t.isRecommended = idx === recIdx;
  });

  const recommendedOption = titleOptions[recIdx];
  const recommendedTitleId = recommendedOption?.id;
  const recommendedTitleRationale = sanitizeSeoExplanation(
    raw.recommendedTitleRationale ||
      (recommendedOption
        ? `"${recommendedOption.title}" is recommended because it clearly identifies the ${prodType.toLowerCase()} category, uses natural phrasing without corny wordplay, and aligns with how gift shoppers and enthusiasts search for ${recipient.toLowerCase()} gifts.`
        : '')
  );

  // 2. Normalize Positioning Angles (guarantee at least 4 distinct angles)
  const rawAngles = Array.isArray(raw.positioningAngles) ? raw.positioningAngles : [];
  const positioningAngles: ProductPositioningAngleOption[] = rawAngles
    .map((item: any, idx: number) => {
      const title = cleanEditorialString(item?.title);
      const coreHook = cleanEditorialString(item?.coreHook || item?.hook || item?.coreArgument);
      if (!title && !coreHook) return null;
      return {
        id: cleanEditorialString(item?.id, `angle-${ts}-${idx + 1}`),
        title: title || `Positioning Angle ${idx + 1}`,
        archetype: cleanEditorialString(
          item?.archetype,
          ANGLE_ARCHETYPE_DEFAULTS[idx % ANGLE_ARCHETYPE_DEFAULTS.length]
        ),
        coreHook:
          coreHook ||
          `Positions ${prodName} around specific visual details and authentic recipient fit.`,
        supportingEvidence: cleanEditorialString(
          item?.supportingEvidence,
          context.visibleText
            ? `Grounded in visible inscription ("${context.visibleText}") and observed mockup composition.`
            : 'Grounded in reviewed product specifications and visible mockup details.'
        ),
        whatToEmphasize: cleanEditorialString(
          item?.whatToEmphasize,
          'Visible graphic execution, honest form factor, and why the recipient will recognize the thought behind it.'
        ),
        risksAndWhatToAvoid: cleanEditorialString(
          item?.risksAndWhatToAvoid,
          'Avoid overclaiming technical specifications or repeating generic vendor marketing adjectives.'
        ),
        role: 'unassigned' as ProductAngleRole,
      };
    })
    .filter(Boolean) as ProductPositioningAngleOption[];

  const fallbackAngles: Array<Omit<ProductPositioningAngleOption, 'id' | 'role'>> = [
    {
      title: 'Insider Recognition & Shared Literacy',
      archetype: 'Domain Literacy & Inside Recognition',
      coreHook: `Frame ${prodName} as a quiet signal of shared domain knowledge between the gift-giver and ${recipient.toLowerCase()}.`,
      supportingEvidence: context.visibleText
        ? `Directly supported by the visible mockup text ("${context.visibleText}") and graphic motif.`
        : 'Supported by the visual motif and recipient context profile.',
      whatToEmphasize: 'The intellectual or humorous recognition moment when the recipient first reads or inspects the design.',
      risksAndWhatToAvoid: 'Do not over-explain the joke or use breathless fan clichés.',
    },
    {
      title: 'Visual Restraint & Graphic Composition',
      archetype: 'Visual Composition & Graphic Restraint',
      coreHook: `Focus on the clean visual hierarchy, typography, and wearable/displayable restraint of ${prodName}.`,
      supportingEvidence: 'Grounded in visible mockup observations of layout, contrast, and garment/object silhouette.',
      whatToEmphasize: 'How the graphic sits on the object, color contrast, and why an adult enthusiast can actually wear or use it in public.',
      risksAndWhatToAvoid: 'Do not invent print techniques or fabric weights that are not in Verified Facts.',
    },
    {
      title: 'Everyday Utility & Familiar Ritual',
      archetype: 'Everyday Ritual & Practical Wearability',
      coreHook: `Pair the conceptual charm of ${prodName} with the straightforward comfort of a ${prodType.toLowerCase()} built for regular rotation.`,
      supportingEvidence: 'Grounded in the object form factor and verified construction details.',
      whatToEmphasize: 'Practical contexts of use (studio, lab, weekend reading, desk ritual) without exaggerating durability.',
      risksAndWhatToAvoid: 'Avoid generic e-commerce filler ("elevate your everyday", "wardrobe staple").',
    },
    {
      title: 'Curatorial Context & Conceptual Lineage',
      archetype: 'Intellectual / Historical Lineage',
      coreHook: `Connect the motif on ${prodName} to the broader scientific, historical, or cultural tradition it nods to.`,
      supportingEvidence: context.designConcept
        ? `Grounded in the editorial inference: ${context.designConcept}`
        : 'Grounded in the conceptual framing of the motif and target audience curiosity.',
      whatToEmphasize: 'The real-world concept, diagram tradition, or cultural reference that gives the design substance.',
      risksAndWhatToAvoid: 'Never present a thematic nod as historical provenance of the physical merchandise itself.',
    },
  ];

  let anglePadIdx = 0;
  while (positioningAngles.length < 4 && anglePadIdx < fallbackAngles.length) {
    const candidate = fallbackAngles[anglePadIdx];
    const exists = positioningAngles.some(
      (a) => a.title.toLowerCase() === candidate.title.toLowerCase()
    );
    if (!exists) {
      positioningAngles.push({
        id: `angle-${ts}-fallback-${anglePadIdx + 1}`,
        ...candidate,
        role: 'unassigned',
      });
    }
    anglePadIdx++;
  }

  // 3. Normalize Audience & Persona Analysis
  const rawAud =
    raw.audienceAnalysis && typeof raw.audienceAnalysis === 'object' ? raw.audienceAnalysis : {};

  const rawPersonas = Array.isArray(rawAud.primaryPersonas) ? rawAud.primaryPersonas : [];
  const primaryPersonas: ProductRecipientPersona[] = rawPersonas
    .map((p: any, idx: number) => {
      const name = cleanEditorialString(p?.name);
      if (!name) return null;
      return {
        id: cleanEditorialString(p?.id, `persona-${ts}-${idx + 1}`),
        name,
        profileSummary: cleanEditorialString(
          p?.profileSummary,
          `A ${recipient.toLowerCase()} who values specificity over generic gifts.`
        ),
        whyItResonates: cleanEditorialString(
          p?.whyItResonates,
          'Recognizes the exact visual and conceptual cue without needing explanation.'
        ),
        contextOfUse: cleanEditorialString(
          p?.contextOfUse,
          'Worn or used in studio, office, seminar, or relaxed weekend settings.'
        ),
      };
    })
    .filter(Boolean) as ProductRecipientPersona[];

  if (primaryPersonas.length === 0) {
    primaryPersonas.push(
      {
        id: `persona-${ts}-1`,
        name: `The Detail-Minded ${recipient}`,
        profileSummary: `Someone deeply immersed in their field or hobby who spots inaccurate clichés immediately.`,
        whyItResonates: `Appreciates that ${prodName} gets the visual tone and reference right with restraint.`,
        contextOfUse: 'Everyday rotation, workspace, or casual gatherings with peers.',
      },
      {
        id: `persona-${ts}-2`,
        name: 'The Understated Visual Collector',
        profileSummary: 'Prefers clean diagrams, dry wit, and functional objects over loud slogans.',
        whyItResonates: 'Values the balance between graphic clarity and a familiar, practical form factor.',
        contextOfUse: 'Weekend reading, travel, studio work, or home study.',
      }
    );
  }

  const rawSecondary = Array.isArray(rawAud.secondaryAudiences) ? rawAud.secondaryAudiences : [];
  const secondaryAudiences: ProductSecondaryAudience[] = rawSecondary
    .map((s: any, idx: number) => {
      const audience = cleanEditorialString(s?.audience || s?.name);
      if (!audience) return null;
      return {
        id: cleanEditorialString(s?.id, `sec-aud-${ts}-${idx + 1}`),
        audience,
        whyItFits: cleanEditorialString(
          s?.whyItFits,
          'Shares overlapping appreciation for the visual motif and dry editorial tone.'
        ),
      };
    })
    .filter(Boolean) as ProductSecondaryAudience[];

  if (secondaryAudiences.length === 0) {
    secondaryAudiences.push({
      id: `sec-aud-${ts}-1`,
      audience: 'Educators, students, and adjacent hobbyists',
      whyItFits: 'Connects with the subject matter as a recognizable conversation piece.',
    });
  }

  const buyerMotivations = cleanStringArray(rawAud.buyerMotivations, [
    `Signals that the gift-giver genuinely understands ${recipient.toLowerCase()}'s specific interests rather than buying a generic gift basket.`,
    'Combines immediate visual recognition on opening with practical, low-maintenance everyday use.',
  ]);

  const recipientPerspective = cleanEditorialString(
    rawAud.recipientPerspective,
    `Upon opening ${prodName}, the recipient feels seen for their specific taste and domain curiosity, appreciating a piece that is clever without trying too hard.`
  );

  const rawMismatches = Array.isArray(rawAud.audienceMismatches) ? rawAud.audienceMismatches : [];
  const audienceMismatches: ProductAudienceMismatch[] = rawMismatches
    .map((m: any, idx: number) => {
      const whoShouldSkip = cleanEditorialString(m?.whoShouldSkip || m?.persona);
      if (!whoShouldSkip) return null;
      return {
        id: cleanEditorialString(m?.id, `mismatch-${ts}-${idx + 1}`),
        whoShouldSkip,
        whyItMismatches: cleanEditorialString(
          m?.whyItMismatches,
          'Expects technical field equipment or formal luxury rather than a graphic/editorial piece.'
        ),
        copyCaution: cleanEditorialString(
          m?.copyCaution,
          'Be transparent about what the physical object is and avoid implying technical certification.'
        ),
      };
    })
    .filter(Boolean) as ProductAudienceMismatch[];

  if (audienceMismatches.length === 0) {
    audienceMismatches.push({
      id: `mismatch-${ts}-1`,
      whoShouldSkip: 'Buyers seeking technical performance gear or formal dress items',
      whyItMismatches: `${prodName} is chosen for its graphic concept and everyday comfort, not specialized technical performance.`,
      copyCaution: 'State the physical garment or object style plainly and avoid technical performance hyperbole.',
    });
  }

  const unverifiedNote =
    context.unverifiedFields && context.unverifiedFields.length > 0
      ? `Do not invent or assert unverified specifications (${context.unverifiedFields.join(', ')}).`
      : 'Only cite physical specifications present in Verified Facts.';

  const editorialCautions = cleanStringArray(raw.editorialCautions, [
    unverifiedNote,
    'Do not echo or paraphrase manufacturer marketing sentences from raw spec notes.',
    'Avoid generic gift-guide clichés and let the visual details carry the intrigue.',
  ]);

  return {
    generatedAt: nowIso,
    modelUsed: context.modelUsed,
    editorCustomGuidance: context.editorCustomGuidance,
    titleOptions,
    recommendedTitleId,
    recommendedTitleRationale,
    positioningAngles,
    audienceAnalysis: {
      primaryPersonas,
      secondaryAudiences,
      buyerMotivations,
      recipientPerspective,
      audienceMismatches,
    },
    editorialCautions,
  };
}

/**
 * Non-destructively merges a newly generated ProductCreativeDirectionSuite into ProductCopyMetadata.
 * NEVER overwrites existing `headline`, `standfirst`, `description`, `bestFor`, or `positioning` fields.
 * Supports full generation ('all') as well as targeted regeneration ('titles_only' | 'angles_only').
 */
export function mergeCreativeDirectionIntoMeta(
  currentMeta: ProductCopyMetadata,
  incomingSuite: ProductCreativeDirectionSuite,
  regenerateTarget: CreativeDirectionRegenerateTarget = 'all'
): ProductCopyMetadata {
  const existingCd = currentMeta.creativeDirection;

  if (!existingCd || regenerateTarget === 'all') {
    return {
      ...currentMeta,
      creativeDirection: {
        ...incomingSuite,
        // Preserve prior user selection IDs ONLY if those IDs still exist, otherwise leave undefined
        selectedPrimaryTitleId: undefined,
        selectedPrimaryAngleId: undefined,
        selectedSecondaryAngleIds: [],
        excludedAngleIds: [],
        selectedPersonaIds: [],
        appliedMismatchIds: [],
      },
    };
  }

  if (regenerateTarget === 'titles_only') {
    // Keep existing angles, personas, cautions, and angle selections; replace titleOptions
    // If the user previously selected a title card, preserve that selected card at the top so it is never lost
    const prevSelectedTitle = existingCd.selectedPrimaryTitleId
      ? existingCd.titleOptions.find((t) => t.id === existingCd.selectedPrimaryTitleId)
      : undefined;

    const mergedTitles = prevSelectedTitle
      ? [
          prevSelectedTitle,
          ...incomingSuite.titleOptions.filter(
            (t) => t.title.toLowerCase() !== prevSelectedTitle.title.toLowerCase()
          ),
        ]
      : incomingSuite.titleOptions;

    return {
      ...currentMeta,
      creativeDirection: {
        ...existingCd,
        generatedAt: incomingSuite.generatedAt,
        modelUsed: incomingSuite.modelUsed || existingCd.modelUsed,
        editorCustomGuidance:
          incomingSuite.editorCustomGuidance ?? existingCd.editorCustomGuidance,
        titleOptions: mergedTitles,
        recommendedTitleId: incomingSuite.recommendedTitleId || existingCd.recommendedTitleId,
        recommendedTitleRationale:
          incomingSuite.recommendedTitleRationale || existingCd.recommendedTitleRationale,
        selectedPrimaryTitleId: prevSelectedTitle ? prevSelectedTitle.id : undefined,
      },
    };
  }

  if (regenerateTarget === 'angles_only') {
    // Keep existing titleOptions, audienceAnalysis, and title selections; update positioningAngles
    // Preserve any angle the user already assigned a role ('primary' | 'secondary' | 'do_not_use')
    const assignedAngles = (existingCd.positioningAngles || []).filter(
      (a) => a.role && a.role !== 'unassigned'
    );
    const assignedTitlesLower = new Set(assignedAngles.map((a) => a.title.toLowerCase()));
    const freshUnassigned = incomingSuite.positioningAngles.filter(
      (a) => !assignedTitlesLower.has(a.title.toLowerCase())
    );

    return {
      ...currentMeta,
      creativeDirection: {
        ...existingCd,
        generatedAt: incomingSuite.generatedAt,
        modelUsed: incomingSuite.modelUsed || existingCd.modelUsed,
        editorCustomGuidance:
          incomingSuite.editorCustomGuidance ?? existingCd.editorCustomGuidance,
        positioningAngles: [...assignedAngles, ...freshUnassigned],
      },
    };
  }

  return {
    ...currentMeta,
    creativeDirection: incomingSuite,
  };
}

/**
 * Explicit user action: Select a Title Option card and apply it to `meta.headline` (and optionally `meta.standfirst`).
 */
export function applySelectedTitleToMeta(
  meta: ProductCopyMetadata,
  titleId: string,
  options: { applyStandfirst?: boolean } = { applyStandfirst: true }
): ProductCopyMetadata {
  const cd = meta.creativeDirection;
  if (!cd) return meta;

  const chosen = cd.titleOptions.find((t) => t.id === titleId);
  if (!chosen) return meta;

  const shouldSetStandfirst =
    options.applyStandfirst !== false && Boolean(chosen.standfirst && chosen.standfirst.trim());

  return {
    ...meta,
    headline: chosen.title,
    standfirst: shouldSetStandfirst ? chosen.standfirst : meta.standfirst,
    creativeDirection: {
      ...cd,
      selectedPrimaryTitleId: chosen.id,
    },
  };
}

/**
 * Explicit user action: Assign a role ('primary' | 'secondary' | 'do_not_use' | 'unassigned')
 * to a Positioning Angle card and sync the chosen direction into `meta.positioning`.
 */
export function applyProductAngleRoleToMeta(
  meta: ProductCopyMetadata,
  angleId: string,
  nextRole: ProductAngleRole
): ProductCopyMetadata {
  const cd = meta.creativeDirection;
  if (!cd) return meta;

  const updatedAngles = cd.positioningAngles.map((angle) => {
    if (angle.id === angleId) {
      return { ...angle, role: nextRole };
    }
    // Enforce single primary angle
    if (nextRole === 'primary' && angle.role === 'primary') {
      return { ...angle, role: 'unassigned' as ProductAngleRole };
    }
    return angle;
  });

  const primaryAngle = updatedAngles.find((a) => a.role === 'primary');
  const secondaryAngles = updatedAngles.filter((a) => a.role === 'secondary');
  const excludedAngles = updatedAngles.filter((a) => a.role === 'do_not_use');

  const currentPos: ProductPositioning = { ...(meta.positioning || {}) };

  if (nextRole === 'primary' && primaryAngle) {
    currentPos.keySellingAngle = `${primaryAngle.title}: ${primaryAngle.coreHook}`;
    currentPos.whatMakesItInteresting = primaryAngle.supportingEvidence || currentPos.whatMakesItInteresting;
    currentPos.whatToEmphasize = [
      primaryAngle.whatToEmphasize,
      ...secondaryAngles.map((s) => `[Secondary: ${s.title}] ${s.whatToEmphasize}`),
    ]
      .filter(Boolean)
      .join(' | ');
  } else if (nextRole === 'secondary') {
    const secParts = secondaryAngles.map((s) => `[Secondary: ${s.title}] ${s.whatToEmphasize}`);
    const baseEmphasize = primaryAngle ? primaryAngle.whatToEmphasize : currentPos.whatToEmphasize || '';
    currentPos.whatToEmphasize = [baseEmphasize, ...secParts].filter(Boolean).join(' | ');
  }

  if (excludedAngles.length > 0) {
    const avoidNotes = excludedAngles.map(
      (e) => `Avoid angle "${e.title}" (${e.risksAndWhatToAvoid || e.coreHook})`
    );
    const primaryRisk = primaryAngle?.risksAndWhatToAvoid
      ? `Watchout: ${primaryAngle.risksAndWhatToAvoid}`
      : '';
    currentPos.whatToAvoid = [primaryRisk, ...avoidNotes].filter(Boolean).join(' | ');
  } else if (nextRole === 'primary' && primaryAngle?.risksAndWhatToAvoid && !currentPos.whatToAvoid) {
    currentPos.whatToAvoid = primaryAngle.risksAndWhatToAvoid;
  }

  return {
    ...meta,
    positioning: currentPos,
    creativeDirection: {
      ...cd,
      positioningAngles: updatedAngles,
      selectedPrimaryAngleId: primaryAngle?.id,
      selectedSecondaryAngleIds: secondaryAngles.map((a) => a.id),
      excludedAngleIds: excludedAngles.map((a) => a.id),
    },
  };
}

/**
 * Explicit user action: Apply a Recipient Persona card to `meta.positioning.suitedRecipient` and `whyWouldSomeoneWantIt`.
 */
export function applyRecipientPersonaToPositioning(
  meta: ProductCopyMetadata,
  personaId: string
): ProductCopyMetadata {
  const cd = meta.creativeDirection;
  if (!cd) return meta;

  const persona = cd.audienceAnalysis.primaryPersonas.find((p) => p.id === personaId);
  if (!persona) return meta;

  const existingIds = new Set(cd.selectedPersonaIds || []);
  existingIds.add(persona.id);

  const currentPos: ProductPositioning = { ...(meta.positioning || {}) };
  currentPos.suitedRecipient = `${persona.name}: ${persona.profileSummary} (${persona.contextOfUse})`;
  const buyerNote =
    cd.audienceAnalysis.buyerMotivations.length > 0
      ? ` Gift-buyer motivation: ${cd.audienceAnalysis.buyerMotivations[0]}`
      : '';
  currentPos.whyWouldSomeoneWantIt = `${persona.whyItResonates}${buyerNote}`;

  return {
    ...meta,
    positioning: currentPos,
    creativeDirection: {
      ...cd,
      selectedPersonaIds: Array.from(existingIds),
    },
  };
}

/**
 * Explicit user action: Apply an Audience Mismatch caution to `meta.positioning.whatToAvoid`.
 */
export function applyAudienceMismatchToPositioning(
  meta: ProductCopyMetadata,
  mismatchId: string
): ProductCopyMetadata {
  const cd = meta.creativeDirection;
  if (!cd) return meta;

  const mismatch = cd.audienceAnalysis.audienceMismatches.find((m) => m.id === mismatchId);
  if (!mismatch) return meta;

  const existingIds = new Set(cd.appliedMismatchIds || []);
  existingIds.add(mismatch.id);

  const cautionLine = `Mismatch caution (${mismatch.whoShouldSkip}): ${mismatch.copyCaution}`;
  const currentAvoid = (meta.positioning?.whatToAvoid || '').trim();
  const nextAvoid = currentAvoid.includes(mismatch.copyCaution)
    ? currentAvoid
    : [currentAvoid, cautionLine].filter(Boolean).join(' | ');

  return {
    ...meta,
    positioning: {
      ...(meta.positioning || {}),
      whatToAvoid: nextAvoid,
    },
    creativeDirection: {
      ...cd,
      appliedMismatchIds: Array.from(existingIds),
    },
  };
}

export interface ProductCopySectionDefinition {
  id: ProductCopySectionId;
  label: string;
  shortLabel: string;
  description: string;
  defaultEnabled: boolean;
  promptDirective: string;
  omissionDirective: string;
}

export const PRODUCT_COPY_SECTIONS_CATALOG: ProductCopySectionDefinition[] = [
  {
    id: 'headline_and_standfirst',
    label: 'Headline and standfirst',
    shortLabel: 'Headline & Standfirst',
    description: 'Editorial headline and 1-sentence italic standfirst/deck introducing the piece.',
    defaultEnabled: true,
    promptDirective:
      'Include the Headline (H2) and a 1-sentence italic Standfirst/Deck at the very top before the main body paragraphs.',
    omissionDirective:
      'Do NOT include a headline or standfirst/deck; begin directly with the main body prose.',
  },
  {
    id: 'editorial_description',
    label: 'Original editorial description',
    shortLabel: 'Editorial Description',
    description:
      'Core narrative interpreting the product from a distinctive editorial point of view in natural language.',
    defaultEnabled: true,
    promptDirective:
      'Establish a distinctive editorial point of view in natural language. Interpret why this object or graphic concept exists and what makes it compelling rather than summarizing manufacturer copy.',
    omissionDirective: 'Omit general introductory narrative.',
  },
  {
    id: 'design_and_visual_details',
    label: 'Design and visual details',
    shortLabel: 'Design & Visuals',
    description:
      'Interprets the visual composition, typography, and graphic execution rather than taking a mechanical inventory.',
    defaultEnabled: true,
    promptDirective:
      'Interpret how the visual design, typography, or graphic composition works on the object. Explain the aesthetic restraint or visual effect rather than merely inventorying visible elements.',
    omissionDirective:
      'Do NOT include a dedicated visual-details breakdown of colors, ink placement, or layout.',
  },
  {
    id: 'humor_and_cultural_context',
    label: 'Humor and cultural context',
    shortLabel: 'Humor & Cultural Context',
    description:
      'Explores the inside joke, domain literacy, scientific/historical nod, or cultural reference without overexplaining.',
    defaultEnabled: true,
    promptDirective:
      'Unpack the humor, domain reference, or cultural/historical lineage behind the design with dry wit and confidence (never over-explain the joke or lecture the reader).',
    omissionDirective:
      'Do NOT include historical, scientific, or cultural background tangents.',
  },
  {
    id: 'recipient_and_gift_rationale',
    label: 'Recipient appeal and gift-giving rationale',
    shortLabel: 'Recipient & Gift Appeal',
    description:
      'Clearly explains who will appreciate this product, why they recognize themselves in it, and why it makes a good gift.',
    defaultEnabled: true,
    promptDirective:
      'Clearly explain who would appreciate this product and why it makes a genuinely good gift—capturing the moment of recognition between the gift-giver and the recipient.',
    omissionDirective:
      'Do NOT frame the copy around gift-giving occasions or recipient profiles.',
  },
  {
    id: 'practical_use_and_suitability',
    label: 'Practical use and suitability',
    shortLabel: 'Practical Use & Suitability',
    description:
      'Everyday contexts where the item fits naturally (studio, lab, desk, weekend rotation) without performance hype.',
    defaultEnabled: false,
    promptDirective:
      'Include a grounded note on practical everyday use and suitability (where and how the item naturally fits into daily routines without exaggerating performance).',
    omissionDirective:
      'Do NOT include a separate practical-use or suitability breakdown.',
  },
  {
    id: 'caveats_and_who_not_for',
    label: 'Caveats or who the product is not for',
    shortLabel: 'Caveats / Who Not For',
    description:
      'Candid note on who should skip the product or mismatched expectations to avoid.',
    defaultEnabled: false,
    promptDirective:
      'Include a brief, candid caveat on who this product is NOT for (grounded in the audience mismatch notes, without generic legal or compliance disclaimers).',
    omissionDirective:
      'Do NOT include caveats, "who this is not for" warnings, or buyer disclaimers in the copy.',
  },
  {
    id: 'technical_specifications',
    label: 'Technical specifications (optional, off by default)',
    shortLabel: 'Technical Specifications',
    description:
      'Material, dimension, or construction specs. Off by default when specifications are already listed elsewhere on the product page.',
    defaultEnabled: false,
    promptDirective:
      'Include a concise, factual Technical Specifications section using ONLY Verified Product Facts (never invent unverified specs or repeat vendor marketing hype).',
    omissionDirective:
      'Do NOT include a Technical Specifications section or repeat materials, dimensions, insulation performance, care instructions, or compliance details already displayed elsewhere on the product page.',
  },
];

export const DEFAULT_PRODUCT_BRIEF_SECTIONS: ProductCopySectionId[] =
  PRODUCT_COPY_SECTIONS_CATALOG.filter((s) => s.defaultEnabled).map((s) => s.id);

export const BRIEF_LENGTH_PRESET_DESCRIPTIONS: Record<
  ProductBriefLengthPreset,
  { label: string; wordRange: string; defaultTargetWords: number; structureNote: string }
> = {
  concise_fourthwall: {
    label: 'Concise Storefront Copy (120-160 words)',
    wordRange: '120-160 words',
    defaultTargetWords: 140,
    structureNote:
      '1-2 tight, perceptive editorial paragraphs focused on the design hook, humor/context, and why the recipient will love it (no redundant spec lists).',
  },
  standard_editorial: {
    label: 'Standard Editorial Product Copy (180-240 words)',
    wordRange: '180-240 words',
    defaultTargetWords: 180,
    structureNote:
      '2-3 cohesive editorial paragraphs interpreting the design, humor/cultural reference, and recipient gift appeal in natural prose.',
  },
  object_monograph: {
    label: 'In-Depth Object Monograph (320-420 words)',
    wordRange: '320-420 words',
    defaultTargetWords: 350,
    structureNote:
      '3-4 unhurried literary paragraphs exploring the conceptual lineage, visual execution, and recipient psychology in depth.',
  },
};

export interface ResolvedProductBriefConfig {
  selectedSections: ProductCopySectionId[];
  targetWordCount: number;
  wordCountTolerancePercent: number;
  minWords: number;
  maxWords: number;
  headlineCountsTowardWordCount: boolean;
  allowNarrativeSpecMention: boolean;
  includeTechnicalSpecs: boolean;
  includeHeadlineAndStandfirst: boolean;
  includeCaveats: boolean;
}

/**
 * Parses a numeric word count from a string or number while ignoring generic article-level defaults
 * (such as "1,200 - 1,500 words" or "1,000 - 1,200 words") unless explicitly intended.
 */
export function parseProductWordCountTarget(
  rawTarget: string | number | undefined,
  fallback = 180
): number {
  if (typeof rawTarget === 'number' && Number.isFinite(rawTarget) && rawTarget > 0) {
    return Math.min(1200, Math.max(40, Math.round(rawTarget)));
  }
  if (typeof rawTarget === 'string' && rawTarget.trim()) {
    const normalized = rawTarget.replace(/,/g, '').trim();
    // Ignore default article-length strings ("1200 - 1500 words", "1000 - 1200 words")
    if (/1000\s*-\s*1200|1200\s*-\s*1500|1800\s*-\s*2200|2500/i.test(normalized)) {
      return fallback;
    }
    const rangeMatch = normalized.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/i);
    if (rangeMatch) {
      const low = parseInt(rangeMatch[1], 10);
      const high = parseInt(rangeMatch[2], 10);
      if (low > 0 && high >= low && high <= 1200) {
        return Math.round((low + high) / 2);
      }
    }
    const singleMatch = normalized.match(/(\d+)/);
    if (singleMatch) {
      const val = parseInt(singleMatch[1], 10);
      if (val >= 40 && val <= 1200) {
        return val;
      }
    }
  }
  return fallback;
}

/**
 * Resolves the effective ProductBriefConfiguration with safe defaults for existing projects.
 */
export function resolveProductBriefConfig(
  meta: Partial<ProductCopyMetadata>,
  wordCountTargetOverride?: string | number
): ResolvedProductBriefConfig {
  const presetKey: ProductBriefLengthPreset = meta.briefLengthPreset || 'standard_editorial';
  const preset = BRIEF_LENGTH_PRESET_DESCRIPTIONS[presetKey] || BRIEF_LENGTH_PRESET_DESCRIPTIONS.standard_editorial;

  const rawSelected = meta.briefConfig?.selectedSections;
  const validCatalogIds = new Set<ProductCopySectionId>(
    PRODUCT_COPY_SECTIONS_CATALOG.map((s) => s.id)
  );
  const filteredSelected = Array.isArray(rawSelected)
    ? rawSelected.filter((id): id is ProductCopySectionId => validCatalogIds.has(id))
    : [];

  const selectedSections: ProductCopySectionId[] =
    filteredSelected.length > 0 ? filteredSelected : [...DEFAULT_PRODUCT_BRIEF_SECTIONS];

  const configuredTarget = meta.briefConfig?.targetWordCount;
  const targetWordCount =
    typeof configuredTarget === 'number' && configuredTarget >= 40
      ? Math.round(configuredTarget)
      : parseProductWordCountTarget(wordCountTargetOverride, preset.defaultTargetWords);

  const wordCountTolerancePercent =
    typeof meta.briefConfig?.wordCountTolerancePercent === 'number' &&
    meta.briefConfig.wordCountTolerancePercent > 0
      ? meta.briefConfig.wordCountTolerancePercent
      : 10;

  const toleranceWords = Math.max(
    15,
    Math.round((targetWordCount * wordCountTolerancePercent) / 100)
  );
  const minWords = Math.max(30, targetWordCount - toleranceWords);
  const maxWords = targetWordCount + toleranceWords;

  const headlineCountsTowardWordCount = Boolean(
    meta.briefConfig?.headlineCountsTowardWordCount ?? false
  );
  const allowNarrativeSpecMention = meta.briefConfig?.allowNarrativeSpecMention ?? true;

  return {
    selectedSections,
    targetWordCount,
    wordCountTolerancePercent,
    minWords,
    maxWords,
    headlineCountsTowardWordCount,
    allowNarrativeSpecMention,
    includeTechnicalSpecs: selectedSections.includes('technical_specifications'),
    includeHeadlineAndStandfirst: selectedSections.includes('headline_and_standfirst'),
    includeCaveats: selectedSections.includes('caveats_and_who_not_for'),
  };
}

export interface ProductDraftWordCountValidation {
  status: 'within_target' | 'under_target' | 'over_target' | 'empty';
  targetWords: number;
  minWords: number;
  maxWords: number;
  countedWords: number;
  mainBodyWords: number;
  headlineAndStandfirstWords: number;
  totalWords: number;
  deltaWords: number;
  headlineCountsTowardWordCount: boolean;
  summaryMessage: string;
}

function countWordsInPlainText(text: string): number {
  const cleaned = (text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#*_`~>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/**
 * Validates a returned or pasted product copy draft against the configured target word count,
 * explicitly distinguishing main body words from headline and standfirst words.
 */
export function validateProductDraftWordCount(
  draftTextOrHtml: string,
  metaOrConfig: Partial<ProductCopyMetadata> | ResolvedProductBriefConfig,
  options?: {
    explicitHeadline?: string;
    explicitStandfirst?: string;
  }
): ProductDraftWordCountValidation {
  const resolved: ResolvedProductBriefConfig =
    'minWords' in metaOrConfig && 'maxWords' in metaOrConfig
      ? (metaOrConfig as ResolvedProductBriefConfig)
      : resolveProductBriefConfig(metaOrConfig as Partial<ProductCopyMetadata>);

  const raw = (draftTextOrHtml || '').trim();
  if (!raw) {
    return {
      status: 'empty',
      targetWords: resolved.targetWordCount,
      minWords: resolved.minWords,
      maxWords: resolved.maxWords,
      countedWords: 0,
      mainBodyWords: 0,
      headlineAndStandfirstWords: 0,
      totalWords: 0,
      deltaWords: -resolved.targetWordCount,
      headlineCountsTowardWordCount: resolved.headlineCountsTowardWordCount,
      summaryMessage: `No draft text yet. Target: ${resolved.targetWordCount} ${
        resolved.headlineCountsTowardWordCount ? 'total words' : 'main-body words (excluding headline & standfirst)'
      } (acceptable range: ${resolved.minWords}–${resolved.maxWords} words).`,
    };
  }

  let headlineAndStandfirstWords = 0;
  let mainBodyText = raw;

  // Detect HTML structure (<h1>/<h2> headline + optional <p><em> or <p><strong> standfirst)
  if (/<(p|h1|h2|h3|div|ul|ol)\b/i.test(raw)) {
    let workingHtml = raw;
    const headingMatch = workingHtml.match(/^\s*<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>\s*/i);
    if (headingMatch) {
      headlineAndStandfirstWords += countWordsInPlainText(headingMatch[1]);
      workingHtml = workingHtml.slice(headingMatch[0].length).trim();

      // Check if the immediate next paragraph is a short italic/bold standfirst deck (<= 35 words)
      const firstParaMatch = workingHtml.match(/^\s*<p[^>]*>\s*<(?:em|i|strong|b)[^>]*>([\s\S]*?)<\/(?:em|i|strong|b)>\s*<\/p>\s*/i);
      if (firstParaMatch) {
        const deckWords = countWordsInPlainText(firstParaMatch[1]);
        if (deckWords <= 40) {
          headlineAndStandfirstWords += deckWords;
          workingHtml = workingHtml.slice(firstParaMatch[0].length).trim();
        }
      }
    }
    mainBodyText = workingHtml;
  } else {
    // Plain text or Markdown structure: check if first block is a heading or short title line
    const blocks = raw
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);

    if (blocks.length >= 2) {
      const firstBlock = blocks[0];
      const firstBlockLines = firstBlock.split('\n').map((l) => l.trim()).filter(Boolean);
      const firstLineWords = countWordsInPlainText(firstBlockLines[0]);
      const isHeadingLine =
        /^#{1,3}\s+/.test(firstBlockLines[0]) ||
        (firstBlockLines.length === 1 && firstLineWords <= 16 && !/[.!?]$/.test(firstBlockLines[0]));

      if (isHeadingLine) {
        headlineAndStandfirstWords += firstLineWords;
        if (firstBlockLines.length >= 2) {
          const secondLineWords = countWordsInPlainText(firstBlockLines.slice(1).join(' '));
          if (secondLineWords <= 40) {
            headlineAndStandfirstWords += secondLineWords;
            mainBodyText = blocks.slice(1).join('\n\n');
          } else {
            mainBodyText = [firstBlockLines.slice(1).join('\n'), ...blocks.slice(1)].join('\n\n');
          }
        } else {
          // Check if blocks[1] is a short italic standfirst deck and blocks.length >= 3
          const secondBlockWords = countWordsInPlainText(blocks[1]);
          const looksLikeDeck =
            blocks.length >= 3 &&
            secondBlockWords <= 35 &&
            (/^\*[^*]+\*$/.test(blocks[1]) || /^_[^_]+_$/.test(blocks[1]) || secondBlockWords <= 24);
          if (looksLikeDeck) {
            headlineAndStandfirstWords += secondBlockWords;
            mainBodyText = blocks.slice(2).join('\n\n');
          } else {
            mainBodyText = blocks.slice(1).join('\n\n');
          }
        }
      }
    }
  }

  // If explicit headline/standfirst were provided separately and not embedded in the body text
  if (headlineAndStandfirstWords === 0 && (options?.explicitHeadline || options?.explicitStandfirst)) {
    headlineAndStandfirstWords =
      countWordsInPlainText(options?.explicitHeadline || '') +
      countWordsInPlainText(options?.explicitStandfirst || '');
  }

  const mainBodyWords = countWordsInPlainText(mainBodyText);
  const totalWords =
    countWordsInPlainText(raw) > mainBodyWords
      ? countWordsInPlainText(raw)
      : mainBodyWords + headlineAndStandfirstWords;

  const countedWords = resolved.headlineCountsTowardWordCount ? totalWords : mainBodyWords;
  const deltaWords = countedWords - resolved.targetWordCount;

  let status: ProductDraftWordCountValidation['status'] = 'within_target';
  if (countedWords === 0) {
    status = 'empty';
  } else if (countedWords < resolved.minWords) {
    status = 'under_target';
  } else if (countedWords > resolved.maxWords) {
    status = 'over_target';
  }

  const scopeLabel = resolved.headlineCountsTowardWordCount
    ? 'total words (including headline & standfirst)'
    : 'main-body words (excluding headline & standfirst)';

  let summaryMessage = '';
  if (status === 'within_target') {
    summaryMessage = `Word count on target: ${countedWords} ${scopeLabel} (target: ${resolved.targetWordCount}, acceptable range: ${resolved.minWords}–${resolved.maxWords}).`;
  } else if (status === 'under_target') {
    const shortBy = resolved.minWords - countedWords;
    summaryMessage = `Under target: ${countedWords} ${scopeLabel} (${ Math.abs(deltaWords) } words below your ${resolved.targetWordCount}-word target; needs at least ${resolved.minWords} words, +${shortBy} more).`;
  } else if (status === 'over_target') {
    const overBy = countedWords - resolved.maxWords;
    summaryMessage = `Over target: ${countedWords} ${scopeLabel} (${deltaWords} words above your ${resolved.targetWordCount}-word target; max acceptable is ${resolved.maxWords} words, trim ${overBy}).`;
  }

  return {
    status,
    targetWords: resolved.targetWordCount,
    minWords: resolved.minWords,
    maxWords: resolved.maxWords,
    countedWords,
    mainBodyWords,
    headlineAndStandfirstWords,
    totalWords,
    deltaWords,
    headlineCountsTowardWordCount: resolved.headlineCountsTowardWordCount,
    summaryMessage,
  };
}

/**
 * Builds the comprehensive External Writing Prompt (for ChatGPT / Claude / external editors)
 * incorporating:
 * 1. Spec-repetition suppression (unless technical_specifications is explicitly selected)
 * 2. User-selected sections (preserving choices and omitting unselected sections)
 * 3. Strict target word-count enforcement with explicit headline/standfirst counting rules
 * 4. Original editorial interpretation (never inventorying visible elements or parroting vendor prose)
 * 5. Anti-overexplaining & anti-disclaimer guardrails
 */
export function buildProductExternalWritingPrompt(params: {
  projectTitle?: string;
  meta: ProductCopyMetadata;
  wordCountTarget?: string | number;
}): string {
  const { projectTitle = 'Untitled Product', meta, wordCountTarget } = params;
  const epistemic = meta.epistemicAnalysis || {
    analysisMode: 'url_only',
    analyzedAt: '',
    verifiedFacts: { unverifiedFields: [] },
    visibleObservations: {},
    editorialInferences: {},
  };
  const vf = epistemic.verifiedFacts || {};
  const vo = epistemic.visibleObservations || {};
  const ei = epistemic.editorialInferences || {};
  const pos = meta.positioning || {};
  const cd = meta.creativeDirection;

  const presetKey: ProductBriefLengthPreset = meta.briefLengthPreset || 'standard_editorial';
  const preset =
    BRIEF_LENGTH_PRESET_DESCRIPTIONS[presetKey] ||
    BRIEF_LENGTH_PRESET_DESCRIPTIONS.standard_editorial;
  const briefConfig = resolveProductBriefConfig(meta, wordCountTarget);

  const selectedDefs = PRODUCT_COPY_SECTIONS_CATALOG.filter((s) =>
    briefConfig.selectedSections.includes(s.id)
  );
  const omittedDefs = PRODUCT_COPY_SECTIONS_CATALOG.filter(
    (s) => !briefConfig.selectedSections.includes(s.id)
  );

  const resolvedProductType =
    meta.productType?.trim() || vo.garmentOrObjectStyle?.trim() || '';

  const lines: string[] = [];
  lines.push('# PRODUCT COPY WRITING BRIEF & PROMPT');
  lines.push('');
  lines.push(
    'Write an original editorial product description for "Science of Gifts" following the selected sections, editorial point of view, and strict word-count requirement below.'
  );
  lines.push('');
  lines.push('## HOUSE EDITORIAL & EPISTEMIC RULES (MANDATORY)');
  lines.push(
    '1. **Original Editorial Point of View (Interpret, Do Not Inventory)**: Interpret the product rather than merely inventorying its visible mockup elements or reproducing manufacturer prose. Write in natural, perceptive editorial prose with a clear point of view that explains why the design works, who will appreciate it, and why it makes a memorable gift.'
  );
  lines.push(
    '2. **Manufacturer-Copy Anti-Parroting Rule**: Raw Manufacturer Spec Source (EXTRACT HARD PHYSICAL SPECS ONLY — DO NOT COPY VENDOR PHRASING) is strictly background reference. NEVER copy, parrot, or lightly paraphrase vendor marketing prose, promotional superlatives, or generic print-on-demand boilerplate.'
  );
  if (!briefConfig.includeTechnicalSpecs) {
    lines.push(
      '3. **No Repeated Specifications (Specs Displayed Separately on Page)**: Materials, dimensions, insulation performance, care/washing instructions, sizing tables, and compliance details are ALREADY displayed elsewhere on the product page. Do NOT repeat, list, or summarize technical specifications, dimensions, care instructions, or compliance details in your copy. Focus on the product\'s design, humor, appeal, intended recipient, and why it makes a good gift. Mention a physical detail ONLY when it materially strengthens the editorial narrative.'
    );
  } else {
    lines.push(
      '3. **Factual Restraint on Specifications**: Never invent measurements, fabric weights (GSM/oz), materials, pricing, or provenance details not listed under Verified Product Facts. Even with Technical Specifications enabled, avoid dumping care instructions or generic compliance boilerplate.'
    );
  }
  lines.push(
    '4. **Avoid Overexplaining & Disclaimers**: Do not over-explain the joke or reference. Do NOT add generic buyer disclaimers, safety/compliance claims, washing instructions, or feature checklists unless directly required by a selected section and supported by verified facts.'
  );
  lines.push(
    '5. **Voice & Punctuation**: Write in a human, specific, observant, and occasionally dry-witted editorial voice. Never use em dashes (—) and avoid clichés ("Perfect for...", "Whether you\'re looking for...", "Must-have", "Takes it to the next level", "More than just a...").'
  );

  // Word Count & Section Blueprint prominently placed so external LLMs never miss it
  lines.push('');
  lines.push('## 1. WORD COUNT & SECTION BLUEPRINT (STRICT ENFORCEMENT)');
  lines.push(
    `- **Target Word Count**: **${briefConfig.targetWordCount} words** (Acceptable tolerance range: **${briefConfig.minWords}–${briefConfig.maxWords} words**, ±${briefConfig.wordCountTolerancePercent}%)`
  );
  if (briefConfig.headlineCountsTowardWordCount) {
    lines.push(
      `- **Headline & Standfirst Counting Rule**: **INCLUDED** — The ${briefConfig.targetWordCount}-word target (${briefConfig.minWords}–${briefConfig.maxWords} words) counts the Headline, Standfirst, and Main Body together.`
    );
  } else {
    lines.push(
      `- **Headline & Standfirst Counting Rule**: **EXCLUDED FROM TARGET** — The **${briefConfig.targetWordCount}-word target (${briefConfig.minWords}–${briefConfig.maxWords} words) applies strictly to the MAIN BODY paragraphs**. The Headline and Standfirst do NOT count toward the ${briefConfig.targetWordCount} words.`
    );
  }
  lines.push(
    `- **Length Enforcement Mandate**: Do NOT under-write or stop short at 90–120 words. Your ${
      briefConfig.headlineCountsTowardWordCount ? 'complete draft' : 'main body prose alone'
    } MUST reach between **${briefConfig.minWords} and ${briefConfig.maxWords} words**. Achieve this length through substantive editorial interpretation of the selected sections below—never by padding with specification lists, care instructions, or filler.`
  );
  lines.push(`- **Format Preset**: ${preset.label}`);

  lines.push('');
  lines.push('### Selected Sections to Include (Include ONLY These Sections)');
  selectedDefs.forEach((sec, idx) => {
    lines.push(`${idx + 1}. **${sec.label}**: ${sec.promptDirective}`);
  });

  if (omittedDefs.length > 0) {
    lines.push('');
    lines.push('### Excluded Sections (DO NOT INCLUDE in Copy)');
    omittedDefs.forEach((sec) => {
      lines.push(`- **${sec.label}**: ${sec.omissionDirective}`);
    });
  }

  lines.push('');
  lines.push('## 2. PRODUCT IDENTITY & RECIPIENT CONTEXT');
  lines.push(`- **Product Name**: ${meta.productName || projectTitle}`);
  if (resolvedProductType) lines.push(`- **Product Category / Form Factor**: ${resolvedProductType}`);
  if (meta.productUrl) lines.push(`- **Product URL**: ${meta.productUrl}`);
  if (meta.intendedRecipient) lines.push(`- **Intended Recipient**: ${meta.intendedRecipient}`);
  if (meta.giftGuideOrOccasion) lines.push(`- **Gift Guide / Occasion**: ${meta.giftGuideOrOccasion}`);
  if (meta.targetAudience) lines.push(`- **Target Audience**: ${meta.targetAudience}`);
  if (meta.contextNotes) lines.push(`- **Editorial Context & Tone Notes**: ${meta.contextNotes}`);

  // Visual & Design Context (framed for interpretation rather than literal inventory)
  if (
    vo.visibleText ||
    vo.designAndImagery ||
    vo.garmentOrObjectStyle ||
    vo.visibleColors ||
    vo.visualDetails
  ) {
    lines.push('');
    lines.push(
      '## 3. DESIGN & VISUAL CONTEXT (INTERPRET MEANING & APPEAL — DO NOT MERELY INVENTORY)'
    );
    lines.push(
      '*(Interpret these details to support your editorial point of view; do NOT list them as a mechanical visual inventory.)*'
    );
    if (vo.visibleText) lines.push(`- **Visible Text / Inscription**: ${vo.visibleText}`);
    if (vo.designAndImagery) lines.push(`- **Graphic Design & Imagery**: ${vo.designAndImagery}`);
    if (vo.garmentOrObjectStyle) {
      lines.push(`- **Garment / Object Form**: ${vo.garmentOrObjectStyle}`);
    }
    if (vo.visibleColors && briefConfig.selectedSections.includes('design_and_visual_details')) {
      lines.push(`- **Palette / Contrast Context**: ${vo.visibleColors}`);
    }
    if (vo.visualDetails && briefConfig.selectedSections.includes('design_and_visual_details')) {
      lines.push(`- **Composition Note**: ${vo.visualDetails}`);
    }
  }

  if (
    ei.designConcept ||
    ei.historicalOrCulturalContext ||
    ei.recipientResonance ||
    ei.editorialCaution ||
    meta.designConcept ||
    meta.historicalContext
  ) {
    lines.push('');
    lines.push('## 4. EDITORIAL INTERPRETATION, HUMOR & RECIPIENT RESONANCE');
    if (ei.designConcept || meta.designConcept) {
      lines.push(`- **Design Concept & Wit**: ${ei.designConcept || meta.designConcept}`);
    }
    if (ei.historicalOrCulturalContext || meta.historicalContext) {
      lines.push(
        `- **Cultural / Intellectual Reference**: ${
          ei.historicalOrCulturalContext || meta.historicalContext
        }`
      );
    }
    if (ei.recipientResonance) {
      lines.push(`- **Why It Resonates With Recipient**: ${ei.recipientResonance}`);
    }
    if (ei.editorialCaution) {
      lines.push(
        `- **Internal Writer Guardrail (Do Not Output as a Disclaimer)**: ${ei.editorialCaution}`
      );
    }
  }

  // Stage 3 Selected Creative Direction & Audience Psychology
  if (cd) {
    const selectedTitle = cd.titleOptions.find((t) => t.id === cd.selectedPrimaryTitleId);
    const primaryAngle = cd.positioningAngles.find(
      (a) => a.id === cd.selectedPrimaryAngleId || a.role === 'primary'
    );
    const secondaryAngles = cd.positioningAngles.filter(
      (a) => (cd.selectedSecondaryAngleIds || []).includes(a.id) || a.role === 'secondary'
    );
    const excludedAngles = cd.positioningAngles.filter(
      (a) => (cd.excludedAngleIds || []).includes(a.id) || a.role === 'do_not_use'
    );

    lines.push('');
    lines.push('## 5. SELECTED CREATIVE DIRECTION & GIFT PSYCHOLOGY');
    if (selectedTitle) {
      lines.push(
        `- **Selected Editorial Title**: "${selectedTitle.title}" (${selectedTitle.styleArchetype})`
      );
      if (selectedTitle.standfirst) {
        lines.push(`- **Companion Standfirst**: ${selectedTitle.standfirst}`);
      }
      lines.push(`- **Title Rationale**: ${selectedTitle.rationale}`);
    }
    if (primaryAngle) {
      lines.push(`- **Primary Positioning Angle**: ${primaryAngle.title} — ${primaryAngle.coreHook}`);
      lines.push(`- **Supporting Evidence**: ${primaryAngle.supportingEvidence}`);
      lines.push(`- **Angle Details to Foreground**: ${primaryAngle.whatToEmphasize}`);
      if (primaryAngle.risksAndWhatToAvoid) {
        lines.push(`- **Angle Watchouts**: ${primaryAngle.risksAndWhatToAvoid}`);
      }
    }
    if (secondaryAngles.length > 0) {
      lines.push(
        `- **Secondary Supporting Angle(s)**: ${secondaryAngles
          .map((a) => `${a.title} (${a.coreHook})`)
          .join('; ')}`
      );
    }
    if (excludedAngles.length > 0) {
      lines.push(
        `- **Excluded Angles (DO NOT USE)**: ${excludedAngles
          .map((a) => `${a.title} (${a.risksAndWhatToAvoid || a.coreHook})`)
          .join('; ')}`
      );
    }
    if (cd.audienceAnalysis?.buyerMotivations?.length > 0) {
      lines.push(
        `- **Gift-Buyer Motivations**: ${cd.audienceAnalysis.buyerMotivations.join(' | ')}`
      );
    }
    if (cd.audienceAnalysis?.recipientPerspective) {
      lines.push(`- **Recipient Perspective**: ${cd.audienceAnalysis.recipientPerspective}`);
    }
    if (
      briefConfig.includeCaveats &&
      cd.audienceAnalysis?.audienceMismatches &&
      cd.audienceAnalysis.audienceMismatches.length > 0
    ) {
      lines.push(
        `- **Audience Mismatches (For Selected Caveats Section)**: ${cd.audienceAnalysis.audienceMismatches
          .map((m) => `${m.whoShouldSkip}: ${m.copyCaution}`)
          .join(' | ')}`
      );
    }
    if (cd.editorialCautions?.length > 0) {
      lines.push(
        `- **Internal Editorial Guardrails (Do Not Write as Copy Disclaimers)**: ${cd.editorialCautions.join(
          ' | '
        )}`
      );
    }
  }

  const hasPositioning = Object.values(pos).some((v) => Boolean(v && v.trim()));
  if (hasPositioning) {
    lines.push('');
    lines.push('## 6. WRITER POSITIONING SYNTHESIS');
    if (pos.keySellingAngle) lines.push(`- **Key Selling Angle**: ${pos.keySellingAngle}`);
    if (pos.suitedRecipient) lines.push(`- **Suited Recipient Profile**: ${pos.suitedRecipient}`);
    if (pos.whatMakesItInteresting) {
      lines.push(`- **What Makes It Interesting**: ${pos.whatMakesItInteresting}`);
    }
    if (pos.whyWouldSomeoneWantIt) {
      lines.push(`- **Why Someone Would Want It**: ${pos.whyWouldSomeoneWantIt}`);
    }
    if (pos.whatToEmphasize) lines.push(`- **What to Emphasize**: ${pos.whatToEmphasize}`);
    if (pos.whatToAvoid) lines.push(`- **What to Avoid**: ${pos.whatToAvoid}`);
    if (pos.emotionalAngle) lines.push(`- **Emotional Angle**: ${pos.emotionalAngle}`);
    if (pos.historicalAngle) lines.push(`- **Historical Angle**: ${pos.historicalAngle}`);
  }

  if (meta.headline || meta.standfirst || meta.bestFor) {
    lines.push('');
    lines.push('## 7. WORKING COPY ELEMENTS');
    if (meta.headline && briefConfig.includeHeadlineAndStandfirst) {
      lines.push(`- **Working Headline**: ${meta.headline}`);
    }
    if (meta.standfirst && briefConfig.includeHeadlineAndStandfirst) {
      lines.push(`- **Working Standfirst**: ${meta.standfirst}`);
    }
    if (meta.bestFor) lines.push(`- **Best Suited For**: ${meta.bestFor}`);
  }

  // Specification Handling: Restrained by default vs. Full Verified Specs when technical_specifications is selected
  lines.push('');
  if (briefConfig.includeTechnicalSpecs) {
    lines.push('## 8. VERIFIED PRODUCT SPECIFICATIONS (FOR TECHNICAL SPECIFICATIONS SECTION)');
    if (vf.price || meta.price) lines.push(`- **Price**: ${vf.price || meta.price}`);
    if (vf.materials || meta.materials) {
      lines.push(`- **Materials & Construction**: ${vf.materials || meta.materials}`);
    }
    if (vf.features || meta.features) {
      lines.push(`- **Physical Features**: ${vf.features || meta.features}`);
    }
    if (vf.dimensions || meta.dimensions) {
      lines.push(`- **Dimensions & Weight**: ${vf.dimensions || meta.dimensions}`);
    }
    if (vf.colors || meta.colors) {
      lines.push(`- **Colors & Finishes**: ${vf.colors || meta.colors}`);
    }
    if (vf.variants || meta.variantsSpec) {
      lines.push(`- **Available Variants**: ${vf.variants || meta.variantsSpec}`);
    }
    if (vf.additionalSpecs || meta.additionalFacts) {
      lines.push(`- **Additional Verified Facts**: ${vf.additionalSpecs || meta.additionalFacts}`);
    }
    if (vf.unverifiedFields && vf.unverifiedFields.length > 0) {
      lines.push(`- **Unverified Fields (DO NOT INVENT)**: ${vf.unverifiedFields.join(', ')}`);
    }
    if (meta.rawProductInfo && meta.rawProductInfo.trim()) {
      lines.push(
        `- **Raw Manufacturer Spec Source (EXTRACT HARD PHYSICAL SPECS ONLY — DO NOT COPY VENDOR PHRASING)**:\n${meta.rawProductInfo.trim()}`
      );
    }
  } else {
    lines.push(
      '## 8. SPECIFICATION RESTRAINT POLICY (TECHNICAL SPECIFICATIONS SECTION IS OFF)'
    );
    lines.push(
      '- **Storefront Spec Separation**: Materials, dimensions, insulation performance, care instructions, and compliance details are already displayed in a separate table on the product page. Do NOT repeat or list them here.'
    );
    if (briefConfig.allowNarrativeSpecMention && (vf.materials || meta.materials)) {
      lines.push(
        `- **Optional Narrative Touchpoint Only**: If and only if it materially strengthens a sentence in the editorial narrative, you may briefly reference the basic medium (${
          vf.materials || meta.materials
        }), but do NOT recite percentages, dimensions, care instructions, or spec lists.`
      );
    }
    if (vf.unverifiedFields && vf.unverifiedFields.length > 0) {
      lines.push(`- **Unverified Fields (DO NOT INVENT)**: ${vf.unverifiedFields.join(', ')}`);
    }
  }

  lines.push('');
  lines.push('## 9. FINAL VERIFICATION CHECKLIST BEFORE OUTPUTTING');
  lines.push(
    `1. **Word Count Check**: Does the ${
      briefConfig.headlineCountsTowardWordCount
        ? 'total draft (including headline & standfirst)'
        : 'main body prose (excluding headline & standfirst)'
    } reach **${briefConfig.minWords}–${briefConfig.maxWords} words** (Target: **${
      briefConfig.targetWordCount
    } words**)? If it is shorter than ${
      briefConfig.minWords
    } words, expand the editorial interpretation of the design, humor, and recipient appeal before responding.`
  );
  lines.push(
    `2. **Selected Sections Check**: Did you include ONLY the ${selectedDefs.length} selected section(s) (${selectedDefs
      .map((s) => s.shortLabel)
      .join(', ')}) and omit all excluded sections?`
  );
  if (!briefConfig.includeTechnicalSpecs) {
    lines.push(
      '3. **Zero Redundant Specs Check**: Did you remove all repeated dimensions, material breakdowns, insulation specs, care/washing instructions, and compliance disclaimers?'
    );
  }

  return lines.join('\n');
}

