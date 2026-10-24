/**
 * Science of Gifts - Intelligent Product Research Service (Client Service)
 * Communicates with /api/products/analyze-research endpoint for AI-assisted product research.
 */

import { getApiUrl } from './apiConfig';
import { ModelId } from '../types/models';

export interface ProductResearchGuideContext {
  title?: string;
  subtitle?: string;
  primaryTopic?: string;
  audience?: string;
  occasionOrNiche?: string;
  editorialBrief?: string;
}

export interface ProductResearchResult {
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
}

export interface ProductResearchResponse {
  ok: boolean;
  metadata?: ProductResearchResult;
  modelUsed?: string;
  error?: string;
}

/**
 * Submits a product page URL for server-side HTML retrieval and Gemini AI research analysis.
 * Supports optional guideContext for guide-specific editorial synthesis.
 */
export async function analyzeProductResearch(
  url: string,
  modelOverride?: ModelId,
  guideContext?: ProductResearchGuideContext
): Promise<ProductResearchResponse> {
  if (!url || !url.trim()) {
    return { ok: false, error: 'Please enter a valid product URL to analyze.' };
  }

  let formattedUrl = url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }

  try {
    const res = await fetch(getApiUrl('/api/products/analyze-research'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        modelOverride,
        guideContext,
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
      error: err?.message || 'Network error occurred while analyzing product page.',
    };
  }
}
