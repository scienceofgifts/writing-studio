/**
 * Science of Gifts - Product Research Extraction & Epistemic Separation Utilities
 * Provides deterministic HTML/JSON-LD product fact extraction, multimodal input validation,
 * and strict epistemic normalization separating:
 * 1. Verified Facts (sourced from URL / JSON-LD / page specs)
 * 2. Visible Observations (directly visible in mockup image(s))
 * 3. Editorial Inferences (AI positioning, recipient fit, and contextual hypotheses)
 */

import {
  ProductVerifiedFacts,
  ProductVisibleObservations,
  ProductEditorialInferences,
  FieldVerificationStatus,
} from '../types/project';
import {
  ProductResearchResult,
  ProductResearchMockupInput,
  ProductResearchContextInput,
  ProductResearchGuideContext,
} from '../services/productResearchService';
import { extractBase64AndMimeFromDataUrl } from './productImageUtils';

export interface ExtractedUrlPageFacts {
  sourceUrl: string;
  canonicalUrl: string;
  productName: string;
  productType: string;
  imageUrl: string;
  description: string;
  price: string;
  materials: string;
  dimensions: string;
  colors: string;
  features: string;
  variants: string;
  textSnippet: string;
}

/**
 * Extracts structured JSON-LD Product data, OpenGraph metadata, canonical URL,
 * and visible text snippet from raw product page HTML.
 */
export function extractProductFactsFromHtml(
  html: string,
  sourceUrl: string
): ExtractedUrlPageFacts {
  const safeHtml = html || '';
  const getMeta = (names: string[]): string => {
    for (const name of names) {
      const regex1 = new RegExp(
        `<meta\\s+[^>]*?(?:name|property|itemprop)=["']${name}["'][^>]*?content=["']([^"']+)["']`,
        'i'
      );
      const m1 = safeHtml.match(regex1);
      if (m1 && m1[1]) return m1[1].trim();

      const regex2 = new RegExp(
        `<meta\\s+[^>]*?content=["']([^"']+)["'][^>]*?(?:name|property|itemprop)=["']${name}["']`,
        'i'
      );
      const m2 = safeHtml.match(regex2);
      if (m2 && m2[1]) return m2[1].trim();
    }
    return '';
  };

  const canonicalMatch =
    safeHtml.match(/<link\s+[^>]*?rel=["']canonical["'][^>]*?href=["']([^"']+)["']/i) ||
    safeHtml.match(/<link\s+[^>]*?href=["']([^"']+)["'][^>]*?rel=["']canonical["']/i);
  let canonicalUrl = canonicalMatch?.[1]?.trim() || getMeta(['og:url']) || sourceUrl;

  let productName =
    getMeta(['og:title', 'twitter:title']) ||
    safeHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
    '';
  productName = productName
    .replace(/\s*(?:\||–|—|-)\s*(?:Science of Gifts|Shop|Store|Fourthwall).*$/i, '')
    .trim();

  let imageUrl = getMeta(['og:image', 'twitter:image']);
  let description = getMeta(['description', 'og:description', 'twitter:description']);
  let priceAmount = getMeta(['product:price:amount', 'og:price:amount']);
  let priceCurrency = getMeta(['product:price:currency', 'og:price:currency']);
  let price = priceAmount
    ? `${priceCurrency ? `${priceCurrency} ` : '$'}${priceAmount}`.trim()
    : '';
  let materials = '';
  let dimensions = '';
  let colors = '';
  let features = '';
  let variants = '';
  let productType = '';

  // Parse all <script type="application/ld+json"> blocks
  const jsonLdRegex =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = jsonLdRegex.exec(safeHtml)) !== null) {
    const rawBlock = match[1]?.trim();
    if (!rawBlock) continue;
    try {
      const parsed = JSON.parse(rawBlock);
      const candidates: any[] = Array.isArray(parsed)
        ? parsed
        : parsed['@graph'] && Array.isArray(parsed['@graph'])
        ? parsed['@graph']
        : [parsed];

      for (const item of candidates) {
        if (!item || typeof item !== 'object') continue;
        const itemType = Array.isArray(item['@type'])
          ? item['@type'].join(' ')
          : String(item['@type'] || '');
        if (!/Product/i.test(itemType)) continue;

        if (item.name && typeof item.name === 'string') {
          productName = item.name.trim();
        }
        if (item.description && typeof item.description === 'string') {
          description = item.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        if (item.url && typeof item.url === 'string' && item.url.startsWith('http')) {
          canonicalUrl = item.url.trim();
        }
        if (item.image) {
          imageUrl =
            typeof item.image === 'string'
              ? item.image
              : Array.isArray(item.image)
              ? typeof item.image[0] === 'string'
                ? item.image[0]
                : item.image[0]?.url || imageUrl
              : item.image?.url || imageUrl;
        }
        if (item.material) {
          materials = Array.isArray(item.material)
            ? item.material.join(', ')
            : String(item.material).trim();
        }
        if (item.color) {
          colors = Array.isArray(item.color)
            ? item.color.join(', ')
            : String(item.color).trim();
        }
        if (item.category && typeof item.category === 'string') {
          productType = item.category.trim();
        }

        // Extract dimensions / weight if present in JSON-LD
        const dimParts: string[] = [];
        if (item.width) dimParts.push(`Width: ${typeof item.width === 'object' ? item.width.value || item.width.name : item.width}`);
        if (item.height) dimParts.push(`Height: ${typeof item.height === 'object' ? item.height.value || item.height.name : item.height}`);
        if (item.depth) dimParts.push(`Depth: ${typeof item.depth === 'object' ? item.depth.value || item.depth.name : item.depth}`);
        if (item.weight) dimParts.push(`Weight: ${typeof item.weight === 'object' ? item.weight.value || item.weight.name : item.weight}`);
        if (dimParts.length > 0) {
          dimensions = dimParts.join(', ');
        }

        // Extract offers / price / variants
        const offers = item.offers;
        if (offers) {
          const offerList = Array.isArray(offers)
            ? offers
            : offers.offers && Array.isArray(offers.offers)
            ? offers.offers
            : [offers];

          const firstOffer = offerList[0];
          if (firstOffer) {
            const pVal = firstOffer.price ?? firstOffer.lowPrice ?? firstOffer.highPrice;
            const pCur = firstOffer.priceCurrency || priceCurrency || 'USD';
            if (pVal !== undefined && pVal !== null && String(pVal).trim() !== '') {
              price = pCur === 'USD' ? `$${String(pVal).replace(/^\$/, '')} USD` : `${pVal} ${pCur}`;
            }
          }

          if (offerList.length > 1) {
            const variantNames = offerList
              .map((o: any) => o?.name || o?.sku || '')
              .filter(Boolean)
              .slice(0, 10);
            if (variantNames.length > 0) {
              variants = variantNames.join(', ');
            } else {
              variants = `${offerList.length} available options/variants`;
            }
          }
        }

        if (Array.isArray(item.hasVariant) && item.hasVariant.length > 0) {
          const vNames = item.hasVariant
            .map((v: any) => v?.name || v?.color || v?.size || '')
            .filter(Boolean)
            .slice(0, 12);
          if (vNames.length > 0) {
            variants = vNames.join(', ');
          }
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  const textSnippet = safeHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4500);

  return {
    sourceUrl,
    canonicalUrl: canonicalUrl || sourceUrl,
    productName,
    productType,
    imageUrl,
    description,
    price,
    materials,
    dimensions,
    colors,
    features,
    variants,
    textSnippet,
  };
}

/**
 * Validates and prepares the multimodal Gemini prompt & inlineData parts for
 * URL-only, Image-only, or URL + Image product analysis.
 */
export function buildProductAnalysisPromptAndParts(params: {
  targetUrl?: string;
  extractedUrlFacts?: ExtractedUrlPageFacts | null;
  mockupImages?: ProductResearchMockupInput[];
  guideContext?: ProductResearchGuideContext;
  productContext?: ProductResearchContextInput;
}): {
  analysisMode: 'url_only' | 'image_only' | 'url_and_image';
  contents: any;
  systemInstruction: string;
} {
  const hasUrl = Boolean(params.targetUrl && params.targetUrl.trim());
  const validImages = (params.mockupImages || []).filter((img) =>
    Boolean(img && img.dataUrl && extractBase64AndMimeFromDataUrl(img.dataUrl))
  );
  const hasImages = validImages.length > 0;

  if (!hasUrl && !hasImages) {
    throw new Error('Product URL or at least one mockup image is required for research synthesis');
  }

  const analysisMode: 'url_only' | 'image_only' | 'url_and_image' =
    hasUrl && hasImages ? 'url_and_image' : hasUrl ? 'url_only' : 'image_only';

  // Sort images so primary image comes first
  const sortedImages = [...validImages].sort(
    (a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0)
  );

  const systemInstruction = `You are a senior product researcher and visual archivist for "Science of Gifts".
Your task is to analyze the provided product inputs (Analysis Mode: ${analysisMode}) and return a structured JSON analysis with STRICT EPISTEMIC SEPARATION between:

1. "verifiedFacts": ONLY hard physical specifications and factual data explicitly stated in the fetched product page URL or JSON-LD metadata.
   - CRITICAL RULE: Never guess or infer material composition, fabric weight, GSM, dimensions, or price from a mockup image.
   - MANUFACTURER COPY ANTI-PARROTING RULE: Vendor descriptions and page text excerpts are provided ONLY to extract objective specifications (e.g., fabric blend, oz/yd² or GSM weight, dimensions, print method, care instructions, available sizes/colors, price). NEVER copy, parrot, or lightly paraphrase vendor marketing prose, promotional superlatives ("ultra-soft", "must-have", "elevate your wardrobe"), or generic print-on-demand boilerplate.
   - If Analysis Mode is "image_only" (no URL provided), all fields in "verifiedFacts" (price, materials, dimensions, features, variants) MUST be empty strings "" because no product page URL was provided to verify specifications.
   - Even when a URL is provided, if a specification (e.g. dimensions, materials, price, variants) is not explicitly stated on the page, return "" for that field and list the field name in "unverifiedFields".

2. "visibleObservations": ONLY visual details directly observable in the uploaded mockup image(s).
   - "visibleText": Exact words, phrases, numbers, formulas, or inscriptions visible on the product mockup.
   - "designAndImagery": Specific graphic motifs, illustrations, diagrams, typography/lettering style, visual hierarchy, and layout visible in the mockup.
   - "garmentOrObjectStyle": The visible physical object or garment form factor (e.g., pullover hoodie, crew-neck sweatshirt, ceramic mug, framed print, brass instrument).
   - "visibleColors": Base color(s) and print/ink colors visibly rendered in the mockup, including contrast and palette register.
   - "visualDetails": Placement (front chest, wrap-around, centered), linework texture, aesthetic register (e.g., vintage scientific plate, dry diagram, bold typographic statement), or visual finish visible in the image.
   - If Analysis Mode is "url_only" and no mockup image was uploaded, leave visibleObservations fields empty or summarize only what is explicitly described as visual appearance on the page.

3. "editorialInferences": Clearly labeled editorial positioning, contextual hypotheses, and recipient fit ideas written in fresh, independent "Science of Gifts" editorial analysis (never echoing vendor sales copy).
   - "designConcept": Suggested aesthetic thesis, visual wit mechanism, or conceptual framing for the design.
   - "historicalOrCulturalContext": Relevant scientific, historical, literary, or cultural context connected to the motif or object.
   - "recipientResonance": Why this item appeals to the intended recipient, audience, or gift guide occasion.
   - "editorialCaution": Claims to avoid or verify before writing copy (e.g. reminding the writer not to invent unverified fabric weights or provenance, and not to repeat vendor marketing clichés).`;

  const promptLines: string[] = [];
  promptLines.push(`ANALYSIS MODE: ${analysisMode}`);

  if (hasUrl && params.extractedUrlFacts) {
    const f = params.extractedUrlFacts;
    promptLines.push(`\n=== PRODUCT URL & EXTRACTED PAGE DATA ===`);
    promptLines.push(`Source URL: ${f.sourceUrl}`);
    promptLines.push(`Canonical URL: ${f.canonicalUrl}`);
    if (f.productName) promptLines.push(`Extracted Title: ${f.productName}`);
    if (f.productType) promptLines.push(`Extracted Category: ${f.productType}`);
    if (f.price) promptLines.push(`Extracted Price: ${f.price}`);
    if (f.materials) promptLines.push(`Extracted Materials: ${f.materials}`);
    if (f.dimensions) promptLines.push(`Extracted Dimensions: ${f.dimensions}`);
    if (f.colors) promptLines.push(`Extracted Colors: ${f.colors}`);
    if (f.variants) promptLines.push(`Extracted Variants: ${f.variants}`);
    if (f.description) {
      promptLines.push(
        `Vendor Meta Description (RAW FACTUAL SOURCE ONLY — DO NOT PARROT VENDOR PHRASING OR HYPE): ${f.description}`
      );
    }
    promptLines.push(
      `Raw Page Text Excerpt (EXTRACT HARD PHYSICAL SPECS ONLY — IGNORE PROMOTIONAL BOILERPLATE):\n${f.textSnippet}`
    );
  } else {
    promptLines.push(
      `\n=== NO PRODUCT URL PROVIDED (IMAGE-ONLY ANALYSIS) ===\nDo NOT populate verifiedFacts (price, materials, dimensions, features, variants). Focus on visibleObservations from the attached mockup image(s) and editorialInferences.`
    );
  }

  if (params.productContext || params.guideContext) {
    promptLines.push(`\n=== EDITORIAL & RECIPIENT CONTEXT ===`);
    if (params.productContext?.intendedRecipient) {
      promptLines.push(`Intended Recipient: ${params.productContext.intendedRecipient}`);
    }
    if (params.productContext?.giftGuideOrOccasion) {
      promptLines.push(`Gift Guide / Occasion: ${params.productContext.giftGuideOrOccasion}`);
    }
    if (params.productContext?.targetAudience) {
      promptLines.push(`Target Audience: ${params.productContext.targetAudience}`);
    }
    if (params.productContext?.contextNotes) {
      promptLines.push(`Editorial Context Notes: ${params.productContext.contextNotes}`);
    }
    if (params.guideContext && Object.keys(params.guideContext).length > 0) {
      promptLines.push(`Guide Context: ${JSON.stringify(params.guideContext)}`);
    }
  }

  promptLines.push(`\nReturn ONLY valid JSON with these keys:
{
  "productName": "string",
  "productType": "string",
  "verifiedFacts": {
    "price": "string (ONLY if stated on URL, else empty string)",
    "materials": "string (ONLY if stated on URL, else empty string)",
    "dimensions": "string (ONLY if stated on URL, else empty string)",
    "colors": "string (ONLY if stated on URL, else empty string)",
    "features": "string (ONLY if stated on URL, else empty string)",
    "variants": "string (ONLY if stated on URL, else empty string)",
    "additionalSpecs": "string",
    "verificationNotes": "string",
    "unverifiedFields": ["price", "materials", "dimensions", "colors", "features", "variants"]
  },
  "visibleObservations": {
    "visibleText": "string",
    "designAndImagery": "string",
    "garmentOrObjectStyle": "string",
    "visibleColors": "string",
    "visualDetails": "string"
  },
  "editorialInferences": {
    "designConcept": "string",
    "historicalOrCulturalContext": "string",
    "recipientResonance": "string",
    "editorialCaution": "string"
  },
  "whyItFits": "string",
  "bestFor": "string",
  "buyerConsiderations": "string",
  "intendedRecipient": "string",
  "targetAudience": "string"
}`);

  const promptText = promptLines.join('\n');

  if (!hasImages) {
    return {
      analysisMode,
      contents: promptText,
      systemInstruction,
    };
  }

  const parts: any[] = [];
  sortedImages.forEach((img, index) => {
    const parsed = extractBase64AndMimeFromDataUrl(img.dataUrl);
    if (!parsed) return;
    parts.push({
      text: `Mockup Image ${index + 1}${img.isPrimary ? ' (PRIMARY MOCKUP)' : ''}: ${img.name || 'mockup'}`,
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
    analysisMode,
    contents: [{ role: 'user', parts }],
    systemInstruction,
  };
}

/**
 * Deterministically normalizes the AI response and extracted URL facts into
 * a ProductResearchResult with strict epistemic separation and full backward compatibility.
 */
export function normalizeProductResearchOutput(params: {
  analysisMode: 'url_only' | 'image_only' | 'url_and_image';
  targetUrl?: string;
  extractedUrlFacts?: ExtractedUrlPageFacts | null;
  parsedModelJson: any;
  productContext?: ProductResearchContextInput;
}): ProductResearchResult {
  const { analysisMode, targetUrl = '', extractedUrlFacts, parsedModelJson = {}, productContext } = params;
  const rawVf = parsedModelJson?.verifiedFacts && typeof parsedModelJson.verifiedFacts === 'object'
    ? parsedModelJson.verifiedFacts
    : {};
  const rawVo = parsedModelJson?.visibleObservations && typeof parsedModelJson.visibleObservations === 'object'
    ? parsedModelJson.visibleObservations
    : {};
  const rawEi = parsedModelJson?.editorialInferences && typeof parsedModelJson.editorialInferences === 'object'
    ? parsedModelJson.editorialInferences
    : {};

  const isImageOnly = analysisMode === 'image_only' || !targetUrl.trim();
  const cleanStr = (val: any): string => (typeof val === 'string' ? val.trim() : '');

  // 1. Construct Verified Facts with strict epistemic enforcement
  const factKeys = ['price', 'materials', 'dimensions', 'colors', 'features', 'variants'] as const;
  const fieldStatus: Partial<Record<(typeof factKeys)[number], FieldVerificationStatus>> = {};
  const unverifiedFields: string[] = [];

  let verifiedFacts: ProductVerifiedFacts;

  if (isImageOnly) {
    // In image-only mode, NO specification can be verified from a URL
    factKeys.forEach((k) => {
      fieldStatus[k] = 'not_available';
      unverifiedFields.push(k);
    });
    verifiedFacts = {
      sourceUrl: '',
      canonicalUrl: '',
      price: '',
      materials: '',
      dimensions: '',
      colors: '',
      features: '',
      variants: '',
      additionalSpecs: '',
      verificationNotes:
        'Analyzed from uploaded mockup image(s) only (no product URL provided). Physical specifications such as fabric/material composition, dimensions, variants, and pricing cannot be verified from a visual mockup alone.',
      unverifiedFields,
      fieldStatus,
    };
  } else {
    // URL is present: combine deterministic JSON-LD/meta extraction with URL-grounded model extraction
    const price = cleanStr(extractedUrlFacts?.price || rawVf.price || parsedModelJson.price);
    const materials = cleanStr(extractedUrlFacts?.materials || rawVf.materials || parsedModelJson.materials);
    const dimensions = cleanStr(extractedUrlFacts?.dimensions || rawVf.dimensions || parsedModelJson.dimensions);
    const colors = cleanStr(extractedUrlFacts?.colors || rawVf.colors || parsedModelJson.colors);
    const features = cleanStr(extractedUrlFacts?.features || rawVf.features || parsedModelJson.features);
    const variants = cleanStr(extractedUrlFacts?.variants || rawVf.variants || parsedModelJson.variants);
    const additionalSpecs = cleanStr(rawVf.additionalSpecs || parsedModelJson.additionalFacts);

    const resolvedValues: Record<(typeof factKeys)[number], string> = {
      price,
      materials,
      dimensions,
      colors,
      features,
      variants,
    };

    factKeys.forEach((k) => {
      if (resolvedValues[k]) {
        fieldStatus[k] = 'verified_from_url';
      } else {
        fieldStatus[k] = 'unverified';
        unverifiedFields.push(k);
      }
    });

    const defaultVerificationNote =
      unverifiedFields.length > 0
        ? `Verified available specifications from ${targetUrl}. Could not verify from page: ${unverifiedFields.join(', ')}.`
        : `All core product specifications verified from ${targetUrl}.`;

    verifiedFacts = {
      sourceUrl: targetUrl,
      canonicalUrl: cleanStr(extractedUrlFacts?.canonicalUrl || parsedModelJson.canonicalUrl || targetUrl),
      price,
      materials,
      dimensions,
      colors,
      features,
      variants,
      additionalSpecs,
      verificationNotes: cleanStr(rawVf.verificationNotes) || defaultVerificationNote,
      unverifiedFields,
      fieldStatus,
    };
  }

  // 2. Construct Visible Observations (from mockup image(s))
  const visibleObservations: ProductVisibleObservations = {
    visibleText: cleanStr(rawVo.visibleText),
    designAndImagery: cleanStr(rawVo.designAndImagery || parsedModelJson.designDescription),
    garmentOrObjectStyle: cleanStr(rawVo.garmentOrObjectStyle || parsedModelJson.productType),
    visibleColors: cleanStr(rawVo.visibleColors || (isImageOnly ? parsedModelJson.colors : '')),
    visualDetails: cleanStr(
      rawVo.visualDetails ||
        (analysisMode === 'url_only'
          ? 'No mockup image uploaded; visual observations limited to product page metadata.'
          : '')
    ),
  };

  // 3. Construct Editorial Inferences (clearly separated from verified facts)
  const editorialInferences: ProductEditorialInferences = {
    designConcept: cleanStr(rawEi.designConcept || parsedModelJson.designConcept),
    historicalOrCulturalContext: cleanStr(
      rawEi.historicalOrCulturalContext || parsedModelJson.historicalContext
    ),
    recipientResonance: cleanStr(
      rawEi.recipientResonance || parsedModelJson.whyItFits || parsedModelJson.bestFor
    ),
    editorialCaution:
      cleanStr(rawEi.editorialCaution) ||
      (unverifiedFields.length > 0
        ? `Do not state unverified specifications (${unverifiedFields.join(', ')}) as factual claims unless manually confirmed.`
        : 'Avoid inventing provenance, measurements, or historical claims not supported by the verified facts.'),
  };

  const resolvedProductName =
    cleanStr(parsedModelJson.productName) ||
    cleanStr(extractedUrlFacts?.productName) ||
    cleanStr(rawVo.garmentOrObjectStyle) ||
    'Curated Product';

  const resolvedProductType =
    cleanStr(parsedModelJson.productType) ||
    cleanStr(extractedUrlFacts?.productType) ||
    cleanStr(rawVo.garmentOrObjectStyle) ||
    'Curated Item';

  const resolvedCanonicalUrl = isImageOnly
    ? ''
    : verifiedFacts.canonicalUrl || targetUrl;

  const rawInfoSummary = isImageOnly
    ? [
        visibleObservations.visibleText ? `Visible Text: ${visibleObservations.visibleText}` : '',
        visibleObservations.designAndImagery ? `Visible Design: ${visibleObservations.designAndImagery}` : '',
        visibleObservations.garmentOrObjectStyle ? `Visible Style: ${visibleObservations.garmentOrObjectStyle}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : cleanStr(parsedModelJson.rawProductInfo) ||
      cleanStr(extractedUrlFacts?.description) ||
      cleanStr(extractedUrlFacts?.textSnippet).slice(0, 350);

  return {
    // Legacy flat fields preserved for Gift Guide Studio & existing callers
    productName: resolvedProductName,
    productType: resolvedProductType,
    productUrl: isImageOnly ? '' : targetUrl,
    imageUrl: cleanStr(extractedUrlFacts?.imageUrl || parsedModelJson.imageUrl),
    materials: verifiedFacts.materials || '',
    features: verifiedFacts.features || '',
    dimensions: verifiedFacts.dimensions || '',
    colors: verifiedFacts.colors || visibleObservations.visibleColors || '',
    designConcept: editorialInferences.designConcept || '',
    historicalContext: editorialInferences.historicalOrCulturalContext || '',
    whyItFits:
      cleanStr(parsedModelJson.whyItFits) ||
      editorialInferences.recipientResonance ||
      'Offers authentic craft and lasting utility.',
    bestFor:
      cleanStr(parsedModelJson.bestFor) ||
      cleanStr(productContext?.intendedRecipient) ||
      'Enthusiasts and discerning recipients.',
    buyerConsiderations:
      cleanStr(parsedModelJson.buyerConsiderations) ||
      editorialInferences.editorialCaution ||
      '',
    intendedRecipient:
      cleanStr(parsedModelJson.intendedRecipient) ||
      cleanStr(productContext?.intendedRecipient) ||
      cleanStr(parsedModelJson.bestFor) ||
      '',
    targetAudience:
      cleanStr(parsedModelJson.targetAudience) ||
      cleanStr(productContext?.targetAudience) ||
      '',
    additionalFacts: verifiedFacts.additionalSpecs || '',
    rawProductInfo: rawInfoSummary,
    canonicalUrl: resolvedCanonicalUrl,

    // Stage 2 structured epistemic fields
    price: verifiedFacts.price || '',
    variants: verifiedFacts.variants || '',
    analysisMode,
    verifiedFacts,
    visibleObservations,
    editorialInferences,
  };
}
