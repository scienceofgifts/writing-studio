/**
 * Science of Gifts - URL Handling & Document Link Utilities (Phase 4)
 * Cleans tracking parameters, validates URLs, and handles semantic HTML hyperlinking.
 */

import { 
  buildHtmlToPlainIndex, 
  normalizePassageText, 
  verifyTargetPassageInHtml,
  expandHtmlRangeToBalancedTags
} from './richText';

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

  // Idempotency: don't add the same URL twice if it's already in the doc
  if (isUrlAlreadyInDocument(url, html)) {
    return { updatedHtml: html, applied: false };
  }

  const cleanHref = cleanTrackingParameters(url);
  const normalizedAnchor = normalizePassageText(anchorText);
  
  // Use robust indexing to find where the text actually lives in HTML
  const { normText, normMap } = buildHtmlToPlainIndex(html);
  const plainText = normText;
  
  let targetStart = -1;
  let targetEnd = -1;

  if (targetPassage && targetPassage.trim()) {
    const normalizedPassage = normalizePassageText(targetPassage);
    const passageStart = plainText.indexOf(normalizedPassage);
    
    if (passageStart !== -1) {
      // Find the anchor within the passage
      const anchorInPassageOffset = normalizedPassage.indexOf(normalizedAnchor);
      if (anchorInPassageOffset !== -1) {
        targetStart = passageStart + anchorInPassageOffset;
        targetEnd = targetStart + normalizedAnchor.length;
      }
    }
  } else {
    // Search globally for the first instance of the anchor
    targetStart = plainText.indexOf(normalizedAnchor);
    if (targetStart !== -1) {
      targetEnd = targetStart + normalizedAnchor.length;
    }
  }

  if (targetStart !== -1 && targetEnd !== -1) {
    let htmlStart = normMap[targetStart].htmlStart;
    let htmlEnd = normMap[targetEnd - 1].htmlEnd;

    // Expand to include surrounding tags if we are splitting them (e.g. <strong>strong</strong> match)
    const expanded = expandHtmlRangeToBalancedTags(html, htmlStart, htmlEnd);
    htmlStart = expanded.start;
    htmlEnd = expanded.end;

    // Safety check: Ensure we aren't splitting an existing tag or already inside an <a>
    const segment = html.substring(htmlStart, htmlEnd);
    const before = html.substring(0, htmlStart);
    
    // Simple check for being inside a tag or an <a>
    const isInsideTag = before.lastIndexOf('<') > before.lastIndexOf('>');
    const isInsideLink = before.toLowerCase().lastIndexOf('<a') > before.toLowerCase().lastIndexOf('</a>');

    if (!isInsideTag && !isInsideLink && !segment.toLowerCase().includes('<a')) {
      const linked = `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer">${segment}</a>`;
      const updatedHtml = html.substring(0, htmlStart) + linked + html.substring(htmlEnd);
      return { updatedHtml, applied: true };
    }
  }

  return { updatedHtml: html, applied: false };
}

/**
 * Inserts a new sentence into the HTML immediately following a confirmed context sentence.
 * Used for "suggest_new" internal link workflows.
 */
export function insertSentenceAfterContext(
  html: string,
  contextSentence: string,
  newSentence: string,
  url: string,
  anchorText: string
): { updatedHtml: string; applied: boolean } {
  if (!html || !contextSentence || !newSentence || !url || !anchorText) {
    return { updatedHtml: html, applied: false };
  }

  const cleanHref = cleanTrackingParameters(url);
  const normalizedContext = normalizePassageText(contextSentence);
  
  const { normText, normMap } = buildHtmlToPlainIndex(html);
  const plainText = normText;
  
  const contextStart = plainText.indexOf(normalizedContext);
  if (contextStart === -1) {
    return { updatedHtml: html, applied: false };
  }

  // Check for ambiguity (multiple matches)
  if (plainText.indexOf(normalizedContext, contextStart + 1) !== -1) {
    console.warn('Ambiguous context sentence for link insertion');
    return { updatedHtml: html, applied: false };
  }

  const contextEndPlain = contextStart + normalizedContext.length;
  const htmlEnd = normMap[contextEndPlain - 1].htmlEnd;

  // We want to insert after the context sentence, but before any closing tags of the parent block if possible.
  
  // Format the new sentence with the link
  const linkedSentence = newSentence.replace(
    anchorText, 
    `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer">${anchorText}</a>`
  );

  let insertionPoint = htmlEnd;
  const trailingHtml = html.substring(htmlEnd);
  
  // If it's something like ". </p>", we keep the space/tags together
  const blockClosingMatch = trailingHtml.match(/^(\s*)(<\/p>|<\/div>|<\/li>)/i);
  if (blockClosingMatch) {
    insertionPoint = htmlEnd + blockClosingMatch[1].length;
  }

  // Ensure single space separation if needed
  const needsLeadingSpace = !html.substring(0, insertionPoint).endsWith(' ') && !linkedSentence.startsWith(' ');
  const space = needsLeadingSpace ? ' ' : '';

  const updatedHtml = 
    html.substring(0, insertionPoint) + 
    space + linkedSentence + 
    html.substring(insertionPoint);

  return { updatedHtml, applied: true };
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

