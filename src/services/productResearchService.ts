/**
 * Science of Gifts - Intelligent Product Research Service (Client Service)
 * Communicates with /api/products/analyze-research endpoint for AI-assisted product research.
 * Supports URL-only, Image-only (mockup vision), and URL + Image multimodal analysis
 * with strict epistemic separation between Verified Facts, Visible Observations, and Editorial Inferences.
 */

import { getApiUrl } from './apiConfig';
import { ModelId } from '../types/models';
import {
  ProductVerifiedFacts,
  ProductVisibleObservations,
  ProductEditorialInferences,
  ProductCreativeDirectionSuite,
  ProductEpistemicAnalysis,
  ProductPositioning,
} from '../types/project';
import { CreativeDirectionRegenerateTarget } from '../utils/productCreativeDirectionUtils';

export interface ProductResearchGuideContext {
  title?: string;
  subtitle?: string;
  primaryTopic?: string;
  audience?: string;
  occasionOrNiche?: string;
  editorialBrief?: string;
}

export interface ProductResearchMockupInput {
  id?: string;
  name?: string;
  mimeType: string;
  dataUrl: string;
  isPrimary?: boolean;
}

export interface ProductResearchContextInput {
  intendedRecipient?: string;
  giftGuideOrOccasion?: string;
  targetAudience?: string;
  contextNotes?: string;
}

export interface ProductResearchOptions {
  mockupImages?: ProductResearchMockupInput[];
  productContext?: ProductResearchContextInput;
}

export interface ProductResearchResult {
  // Legacy / Gift Guide Studio flat fields (preserved for full backward compatibility)
  productName?: string;
  productType?: string;
  productUrl?: string;
  imageUrl?: string;
  materials?: string;
  features?: string;
  dimensions?: string;
  colors?: string;
  designConcept?: string;
  historicalContext?: string;
  whyItFits?: string;
  bestFor?: string;
  buyerConsiderations?: string;
  intendedRecipient?: string;
  targetAudience?: string;
  additionalFacts?: string;
  rawProductInfo?: string;
  canonicalUrl?: string;

  // Stage 2: Extended product specs & epistemic sections
  price?: string;
  variants?: string;
  analysisMode?: 'url_only' | 'image_only' | 'url_and_image';
  verifiedFacts?: ProductVerifiedFacts;
  visibleObservations?: ProductVisibleObservations;
  editorialInferences?: ProductEditorialInferences;
}

export interface ProductResearchResponse {
  ok: boolean;
  metadata?: ProductResearchResult;
  modelUsed?: string;
  error?: string;
}

export interface GenerateCreativeDirectionParams {
  productName?: string;
  productType?: string;
  productUrl?: string;
  rawProductInfo?: string;
  epistemicAnalysis?: Partial<ProductEpistemicAnalysis>;
  productContext?: ProductResearchContextInput;
  currentPositioning?: Partial<ProductPositioning>;
  editorCustomGuidance?: string;
  regenerateTarget?: CreativeDirectionRegenerateTarget;
  mockupImages?: ProductResearchMockupInput[];
  modelOverride?: ModelId;
}

export interface GenerateCreativeDirectionResponse {
  ok: boolean;
  creativeDirection?: ProductCreativeDirectionSuite;
  modelUsed?: string;
  error?: string;
}

/**
 * Submits a product page URL, uploaded mockup image(s), or both for server-side HTML retrieval
 * and Gemini AI multimodal research analysis.
 * Preserves backward compatibility with Gift Guide Studio callers.
 */
export async function analyzeProductResearch(
  url: string,
  modelOverride?: ModelId,
  guideContext?: ProductResearchGuideContext,
  options?: ProductResearchOptions
): Promise<ProductResearchResponse> {
  const cleanUrl = (url || '').trim();
  const mockupImages = Array.isArray(options?.mockupImages)
    ? options!.mockupImages.filter((img) => Boolean(img && img.dataUrl && img.dataUrl.trim()))
    : [];

  if (!cleanUrl && mockupImages.length === 0) {
    return {
      ok: false,
      error: 'Please enter a product URL, upload at least one mockup image, or provide both to analyze.',
    };
  }

  let formattedUrl = '';
  if (cleanUrl) {
    formattedUrl = /^https?:\/\//i.test(cleanUrl) ? cleanUrl : `https://${cleanUrl}`;
  }

  try {
    const res = await fetch(getApiUrl('/api/products/analyze-research'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl || undefined,
        modelOverride,
        guideContext,
        mockupImages,
        productContext: options?.productContext,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || `Server returned status ${res.status} (${res.statusText})`,
      };
    }

    return {
      ok: true,
      metadata: data.metadata,
      modelUsed: data.modelUsed,
    };
  } catch (err: any) {
    console.error('Product research analysis failed:', err);
    return {
      ok: false,
      error: err?.message || 'Network error occurred while analyzing product.',
    };
  }
}

/**
 * Stage 3: Generates coordinated Product Creative Direction (6+ distinct titles, 4-5 positioning angles,
 * recipient personas, gift-buyer motivations, recipient perspective, audience mismatches, and editorial cautions)
 * in a single structured AI request.
 * Kept strictly separate from Stage 2 Product Analysis so the editor can review facts first.
 */
export async function generateProductCreativeDirection(
  params: GenerateCreativeDirectionParams
): Promise<GenerateCreativeDirectionResponse> {
  try {
    const validMockupImages = Array.isArray(params.mockupImages)
      ? params.mockupImages
          .filter((img) => Boolean(img && img.dataUrl && img.dataUrl.trim()))
          .slice(0, 2)
      : [];

    const res = await fetch(getApiUrl('/api/products/generate-creative-direction'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...params,
        mockupImages: validMockupImages,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return {
        ok: false,
        error: data?.error || `Server returned status ${res.status} (${res.statusText})`,
      };
    }

    return {
      ok: true,
      creativeDirection: data.creativeDirection,
      modelUsed: data.modelUsed,
    };
  } catch (err: any) {
    console.error('Product creative direction generation failed:', err);
    return {
      ok: false,
      error: err?.message || 'Network error occurred while generating editorial direction.',
    };
  }
}
