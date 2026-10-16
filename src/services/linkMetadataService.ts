/**
 * Science of Gifts - Internal Link Metadata Fetcher (Client Service)
 * Communicates with the secure backend endpoint /api/links/fetch-metadata
 */

import { getApiUrl } from './apiConfig';
import { FetchLinkMetadataResponse } from '../types/internalLink';

/**
 * Requests article metadata for a destination URL from the studio server.
 */
export async function fetchLinkMetadata(
  url: string,
  existingCategories: string[] = []
): Promise<FetchLinkMetadataResponse> {
  if (!url || !url.trim()) {
    return { ok: false, error: 'Please provide a URL to fetch details for.' };
  }

  let formattedUrl = url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }

  try {
    const res = await fetch(getApiUrl('/api/links/fetch-metadata'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        existingCategories,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || `Server responded with status ${res.status} (${res.statusText})`,
      };
    }

    return {
      ok: true,
      metadata: data.metadata,
    };
  } catch (err: any) {
    console.error('Fetch link metadata failed:', err);
    return {
      ok: false,
      error: err?.message || 'Network error occurred while fetching article metadata.',
    };
  }
}

/**
 * Requests product details for a product URL from the studio server.
 */
export async function fetchProductMetadata(
  url: string,
  guideContext?: { topic?: string; audience?: string }
): Promise<import('../types/giftGuide').FetchProductMetadataResponse> {
  if (!url || !url.trim()) {
    return { ok: false, error: 'Please provide a valid product URL to fetch details.' };
  }

  let formattedUrl = url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = `https://${formattedUrl}`;
  }

  try {
    const res = await fetch(getApiUrl('/api/products/fetch-metadata'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        guideTopic: guideContext?.topic || '',
        guideAudience: guideContext?.audience || '',
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || `Server responded with status ${res.status} (${res.statusText})`,
      };
    }

    return {
      ok: true,
      metadata: data.metadata,
    };
  } catch (err: any) {
    console.error('Fetch product metadata failed:', err);
    return {
      ok: false,
      error: err?.message || 'Network error occurred while fetching product details.',
    };
  }
}

