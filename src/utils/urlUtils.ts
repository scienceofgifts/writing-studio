/**
 * Science of Gifts - URL Handling & Document Link Utilities (Phase 4)
 * Cleans tracking parameters, validates URLs, and handles semantic HTML hyperlinking.
 */

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
  'affiliate_id',
]);

/**
 * Checks if a string is a valid HTTP/HTTPS URL
 */
export function isValidUrl(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Checks whether a URL has known tracking or analytics query parameters
 */
export function hasTrackingParameters(input: string): boolean {
  if (!isValidUrl(input)) return false;
  try {
    const parsed = new URL(input.trim());
    for (const key of parsed.searchParams.keys()) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Strips tracking parameters (utm_*, fbclid, gclid, ref, etc.) while preserving clean path & valid query args
 */
export function cleanTrackingParameters(input: string): string {
  if (!isValidUrl(input)) return input.trim();
  try {
    const parsed = new URL(input.trim());
    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach((k) => parsed.searchParams.delete(k));

    // Convert http to https if domain is modern
    if (parsed.protocol === 'http:' && !parsed.hostname.includes('localhost')) {
      parsed.protocol = 'https:';
    }

    let result = parsed.toString();
    // Remove trailing '?' if query string is now empty
    if (result.endsWith('?')) {
      result = result.slice(0, -1);
    }
    return result;
  } catch {
    return input.trim();
  }
}

/**
 * Scans an HTML string and returns an array of unique href URLs present in <a> tags
 */
export function extractUrlsFromHtml(html: string): string[] {
  if (!html) return [];
  const urls: string[] = [];
  const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(html)) !== null) {
    if (match[1]) {
      const clean = match[1].trim();
      if (!urls.includes(clean)) {
        urls.push(clean);
      }
    }
  }

  return urls;
}

/**
 * Checks if a specific URL is already used in an HTML document
 */
export function isUrlAlreadyInDocument(url: string, html: string): boolean {
  if (!url || !html) return false;
  const existing = extractUrlsFromHtml(html);
  const normalizedTarget = normalizeUrlForComparison(url);
  return existing.some((existingUrl) => normalizeUrlForComparison(existingUrl) === normalizedTarget);
}

/**
 * Normalizes a URL for comparison (removes trailing slash and lowercases protocol/hostname)
 */
export function normalizeUrlForComparison(url: string): string {
  if (!url) return '';
  try {
    const cleaned = cleanTrackingParameters(url);
    const parsed = new URL(cleaned.trim());
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname =
      parsed.pathname.endsWith('/') && parsed.pathname.length > 1
        ? parsed.pathname.slice(0, -1)
        : parsed.pathname;
    return `${hostname}${pathname.toLowerCase()}${parsed.search.toLowerCase()}`;
  } catch {
    let clean = url.trim().toLowerCase();
    clean = clean.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
    return clean;
  }
}

/**
 * Inserts a structured hyperlink into an HTML string for a specific anchor text
 * without disturbing surrounding tags or rewriting unrelated content.
 * Returns the modified HTML and a success flag.
 */
export function applyHyperlinkToHtml(
  html: string,
  anchorText: string,
  url: string,
  targetPassage?: string
): { updatedHtml: string; applied: boolean } {
  if (!html || !anchorText || !url) {
    return { updatedHtml: html, applied: false };
  }

  const cleanHref = cleanTrackingParameters(url);
  const trimmedAnchor = anchorText.trim();

  // If already linked with this exact anchor inside an <a> tag, don't double-link
  const alreadyLinkedRegex = new RegExp(`<a\\s+[^>]*href=["'][^"']+["'][^>]*>[^<]*${escapeRegex(trimmedAnchor)}[^<]*<\\/a>`, 'i');
  if (alreadyLinkedRegex.test(html)) {
    return { updatedHtml: html, applied: false };
  }

  // Strategy 1: If targetPassage is supplied, locate that passage and replace the anchor inside it
  if (targetPassage && targetPassage.trim()) {
    const trimmedPassage = targetPassage.trim();
    if (html.includes(trimmedPassage) && trimmedPassage.includes(trimmedAnchor)) {
      const linkedAnchor = `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer">${trimmedAnchor}</a>`;
      const updatedPassage = trimmedPassage.replace(trimmedAnchor, linkedAnchor);
      const updatedHtml = html.replace(trimmedPassage, updatedPassage);
      return { updatedHtml, applied: true };
    }
  }

  // Strategy 2: Match the first occurrence of the anchor text that is NOT already inside an <a> tag or attribute
  // We use a regex that matches text outside of tags
  const textPattern = new RegExp(`(?<!<[^>]*)(${escapeRegex(trimmedAnchor)})(?![^<]*<\\/a>)(?![^<]*>)`, 'i');
  if (textPattern.test(html)) {
    const updatedHtml = html.replace(
      textPattern,
      `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer">$1</a>`
    );
    return { updatedHtml, applied: true };
  }

  // Fallback: direct first replacement if plain occurrence exists and not inside a tag
  const directIndex = html.indexOf(trimmedAnchor);
  if (directIndex !== -1) {
    // Check if it's not inside an HTML tag attribute
    const before = html.slice(0, directIndex);
    const lastOpenTag = before.lastIndexOf('<');
    const lastCloseTag = before.lastIndexOf('>');
    const isInsideTag = lastOpenTag > lastCloseTag;

    if (!isInsideTag) {
      const linked = `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer">${trimmedAnchor}</a>`;
      const updatedHtml = html.slice(0, directIndex) + linked + html.slice(directIndex + trimmedAnchor.length);
      return { updatedHtml, applied: true };
    }
  }

  return { updatedHtml: html, applied: false };
}

function escapeRegex(string: string): string {
  return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

/**
 * Automatically infers the destination type based on URL pattern and title
 */
export function inferDestinationType(
  url: string,
  titleOrType?: string
): 'article' | 'shop_guide' | 'product' | 'category' | 'other' {
  if (!url) return 'article';
  const cleanUrl = url.toLowerCase().trim();

  // If explicit og:type passed
  if (titleOrType === 'product') return 'product';
  if (titleOrType === 'article') return 'article';

  // Check URL path structures
  if (cleanUrl.includes('/products/')) {
    return 'product';
  }
  if (cleanUrl.includes('/collections/') || cleanUrl.includes('/pages/')) {
    return 'shop_guide';
  }
  if (cleanUrl.includes('/categories/') || cleanUrl.includes('/category/')) {
    return 'category';
  }
  if (cleanUrl.includes('shop.scienceofgifts.com')) {
    // If shop domain without /products/, likely a guide or category
    return 'shop_guide';
  }

  // Check title cues
  if (titleOrType) {
    const t = titleOrType.toLowerCase();
    if (t.includes('gift guide') || t.includes('gifts for') || t.includes('collection')) {
      return 'shop_guide';
    }
    if (
      t.includes('hoodie') ||
      t.includes('mug') ||
      t.includes('compass') ||
      t.includes('print') ||
      t.includes('magnifier') ||
      t.includes('bag') ||
      t.includes('watch')
    ) {
      return 'product';
    }
  }

  return 'article';
}

/**
 * Returns human-friendly label for destination types
 */
export function formatDestinationType(
  type?: 'article' | 'shop_guide' | 'product' | 'category' | 'other'
): string {
  switch (type) {
    case 'shop_guide':
      return 'Shop Guide';
    case 'product':
      return 'Product';
    case 'category':
      return 'Category';
    case 'other':
      return 'Resource';
    case 'article':
    default:
      return 'Editorial Article';
  }
}

