/**
 * Science of Gifts Writing Studio - Server-Side URL Metadata Fetcher & SSRF Guard
 * Securely retrieves article metadata from HTTP/HTTPS URLs with comprehensive SSRF protections.
 */

import dns from 'dns';
import net from 'net';
import { GoogleGenAI } from '@google/genai';
import { FetchedLinkMetadata } from '../types/internalLink';
import { FetchedProductMetadata } from '../types/giftGuide';

// Forbidden local / internal top-level or sub-domains
const FORBIDDEN_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.arpa$/i,
  /\.lan$/i,
  /\.corp$/i,
  /\.home$/i,
  /\.test$/i,
  /\.invalid$/i,
];

// Disallowed internal service ports
const DISALLOWED_PORTS = new Set([
  '22',    // SSH
  '23',    // Telnet
  '25',    // SMTP
  '3000',  // Studio's own dev server port
  '3306',  // MySQL
  '5432',  // PostgreSQL
  '6379',  // Redis
  '8086',  // InfluxDB
  '9200',  // Elasticsearch
  '27017', // MongoDB
]);

/**
 * Checks whether an IPv4 or IPv6 address is private, loopback, link-local, or reserved.
 */
export function isPrivateOrReservedIP(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return true;

  // Handle IPv4-mapped IPv6 (e.g. ::ffff:192.168.1.1 or ::ffff:7f00:1)
  let cleanIp = ip.trim().toLowerCase();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.slice(7);
  }

  // If not a valid IP string, do not treat as an IP
  if (!net.isIP(cleanIp)) {
    return false;
  }

  // IPv4 validation
  if (cleanIp.includes('.')) {
    const parts = cleanIp.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // malformed, treat as unsafe
    }

    const [a, b, c] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private network RFC 1918)
    if (a === 10) return true;
    // 100.64.0.0/10 (Carrier-grade NAT RFC 6598: 100.64.0.0 - 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 (Loopback RFC 1122)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local RFC 3927)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private network RFC 1918: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1 RFC 5737)
    if (a === 192 && b === 0 && c === 2) return true;
    // 192.88.99.0/24 (6to4 Relay Anycast RFC 7526)
    if (a === 192 && b === 88 && c === 99) return true;
    // 192.168.0.0/16 (Private network RFC 1918)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Network benchmark tests RFC 2544: 198.18.0.0 - 198.19.255.255)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2 RFC 5737)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3 RFC 5737)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast RFC 5771)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved RFC 1112)
    if (a >= 240) return true;

    return false;
  }

  // IPv6 validation
  if (cleanIp === '::' || cleanIp === '::1' || cleanIp === '0:0:0:0:0:0:0:1') {
    return true; // Loopback or unspecified
  }
  // fe80::/10 (Link-local unicast)
  if (/^fe[89ab][0-9a-f]/i.test(cleanIp)) {
    return true;
  }
  // fc00::/7 (Unique local address: fc00::/8 and fd00::/8)
  if (/^f[cd][0-9a-f]{2}:/i.test(cleanIp)) {
    return true;
  }
  // ff00::/8 (Multicast)
  if (/^ff[0-9a-f]{2}:/i.test(cleanIp)) {
    return true;
  }

  return false;
}

/**
 * Validates a target URL against SSRF rules and resolves hostname IPs.
 */
export async function validateUrlSafety(urlStr: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error('Malformed URL provided.');
  }

  // Protocol check
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS URLs are allowed.`);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    throw new Error('URL must include a valid host name.');
  }

  // Disallow forbidden host patterns
  for (const pattern of FORBIDDEN_HOST_PATTERNS) {
    if (pattern.test(hostname)) {
      throw new Error(`Requests to "${hostname}" are blocked for security.`);
    }
  }

  // Port check
  if (parsed.port && DISALLOWED_PORTS.has(parsed.port)) {
    throw new Error(`Port ${parsed.port} is restricted.`);
  }

  // Check if hostname is directly a private/reserved IP
  if (net.isIP(hostname) && isPrivateOrReservedIP(hostname)) {
    throw new Error(`Access to private IP address "${hostname}" is prohibited.`);
  }

  // Resolve hostname via DNS to verify target IP addresses
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new Error(`Could not resolve hostname "${hostname}".`);
    }

    for (const addr of addresses) {
      if (isPrivateOrReservedIP(addr.address)) {
        throw new Error(`Host "${hostname}" resolved to prohibited private/local IP ${addr.address}.`);
      }
    }
  } catch (dnsErr: any) {
    if (dnsErr.code === 'ENOTFOUND' || dnsErr.code === 'EAI_AGAIN') {
      throw new Error(`Domain "${hostname}" does not exist or DNS lookup failed.`);
    }
    throw dnsErr;
  }

  return parsed;
}

/**
 * Fetches HTML content with strict redirect tracking, revalidation, timeouts, and size caps.
 */
export async function fetchHtmlWithSecurity(
  initialUrl: string,
  maxRedirects = 5
): Promise<{ html: string; finalUrl: string }> {
  let currentUrl = initialUrl;
  let redirectCount = 0;
  const visitedUrls = new Set<string>();

  while (true) {
    const validatedUrl = await validateUrlSafety(currentUrl);
    const normalizedUrl = validatedUrl.toString();

    if (visitedUrls.has(normalizedUrl)) {
      throw new Error('Redirect loop detected.');
    }
    visitedUrls.add(normalizedUrl);

    // Timeout signal: 8 seconds maximum
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(normalizedUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ScienceOfGiftsStudio/1.0; +https://www.scienceofgifts.com)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr.name === 'AbortError') {
        throw new Error('Request timed out after 8 seconds. The destination server took too long to respond.');
      }
      throw new Error(`Connection failed: ${fetchErr.message || 'Unable to connect to website'}`);
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectCount++;
      if (redirectCount > maxRedirects) {
        throw new Error(`Exceeded maximum allowed redirects (${maxRedirects}).`);
      }

      const locationHeader = response.headers.get('location');
      if (!locationHeader) {
        throw new Error(`Redirect response (${response.status}) missing Location header.`);
      }

      // Resolve relative redirect against current URL
      try {
        currentUrl = new URL(locationHeader, currentUrl).toString();
      } catch {
        throw new Error(`Invalid redirect Location: "${locationHeader}".`);
      }
      continue;
    }

    // Check HTTP status code
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Article not found (HTTP 404) at ${currentUrl}`);
      }
      if (response.status === 403 || response.status === 401) {
        throw new Error(`Website blocked access (HTTP ${response.status}). The site may require authentication or bot verification.`);
      }
      throw new Error(`Server returned HTTP ${response.status} (${response.statusText || 'Error'}).`);
    }

    // Validate Content-Type
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error(`Destination returned non-HTML content (${contentType || 'unknown'}). Only HTML articles can be parsed.`);
    }

    // Stream and cap response size to max 1MB to prevent memory exhaustion
    const MAX_BYTES = 1024 * 1024; // 1MB
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return { html: text.slice(0, MAX_BYTES), finalUrl: currentUrl };
    }

    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        receivedBytes += value.length;
        chunks.push(value);
        if (receivedBytes >= MAX_BYTES) {
          await reader.cancel();
          break;
        }
      }
    }

    const totalBuffer = Buffer.concat(chunks);
    const html = totalBuffer.toString('utf-8');
    return { html, finalUrl: currentUrl };
  }
}

/**
 * Decodes standard HTML entities and unicode escapes
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&hellip;|&#8230;/g, '…')
    .replace(/&bull;|&#8226;/g, '•')
    .replace(/&trade;|&#8482;/g, '™')
    .replace(/&copy;|&#169;/g, '©')
    .replace(/&reg;|&#174;/g, '®')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strips HTML tags and script/style contents
 */
export function stripHtmlTags(str: string): string {
  if (!str) return '';
  return str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans site branding and separators from an editorial title
 */
export function cleanEditorialTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  let cleaned = decodeHtmlEntities(rawTitle).trim();

  // Strip common trailing site suffixes: e.g., "Title | Science of Gifts", "Title - SiteName", "Title » SiteName"
  cleaned = cleaned.replace(/\s*(?:\||–|—|-|»|::)\s*(?:Science of Gifts|The Science of Gifts|Blog|Home|Shop|Official Site|Store).*$/i, '');

  // If there's still a general site separator near the end, check if the remaining portion is substantial
  const separatorMatch = cleaned.match(/^(.*?)\s+[|\-–—»]\s+([^|\-–—»]+)$/);
  if (separatorMatch) {
    const candidate = separatorMatch[1].trim();
    if (candidate.length >= 10) {
      cleaned = candidate;
    }
  }

  // Remove leading site prefix: e.g., "Science of Gifts: Title"
  cleaned = cleaned.replace(/^(?:Science of Gifts|The Science of Gifts)\s*:\s*/i, '');

  return cleaned.trim();
}

/**
 * Generates a natural, contextual link anchor phrase from a title
 */
export function derivePreferredAnchor(title: string, topic?: string): string {
  if (!title) return '';
  let anchor = title.trim();

  // Strip leading articles and question words
  anchor = anchor
    .replace(/^(why|how|when|what)\s+(people|we|you|readers|buyers)\s+/i, '$1 $2 ')
    .replace(/^(an?\s+|the\s+)/i, '');

  // Lowercase the phrase so it embeds naturally in sentence copy
  anchor = anchor.toLowerCase();

  // Truncate if overly long (keep under 8 words)
  const words = anchor.split(/\s+/);
  if (words.length > 8) {
    anchor = words.slice(0, 8).join(' ');
  }

  return anchor.trim();
}

/**
 * Matches extracted metadata to one of the user's existing categories
 */
export function matchCategory(
  extractedSection: string,
  tags: string[],
  title: string,
  existingCategories: string[] = [],
  description = '',
  h1Text = ''
): string | undefined {
  if (!existingCategories || existingCategories.length === 0) return undefined;

  const normalize = (s: string) => (s || '').toLowerCase().trim();

  // 1. Direct match on article section
  if (extractedSection) {
    const normSec = normalize(extractedSection);
    const direct = existingCategories.find((c) => normalize(c) === normSec);
    if (direct) return direct;
  }

  // 2. Direct match on any tag
  for (const tag of tags) {
    const normTag = normalize(tag);
    const match = existingCategories.find((c) => normalize(c) === normTag);
    if (match) return match;
  }

  // 3. Substring / keyword overlap matching with highest score
  const fullText = `${extractedSection} ${tags.join(' ')} ${title} ${h1Text} ${description}`.toLowerCase();
  let bestMatch: string | undefined;
  let bestScore = 0;

  for (const cat of existingCategories) {
    if (cat.toLowerCase() === 'general') continue; // don't eagerly match 'General'
    const catWords = cat.toLowerCase().split(/[\s&/,\-]+/).filter((w) => w.length > 2);
    let score = 0;
    for (const word of catWords) {
      if (fullText.includes(word)) {
        score += word.length;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = cat;
    }
  }

  return bestScore > 0 ? bestMatch : undefined;
}

/**
 * Extracts and synthesizes article metadata from fetched HTML
 */
export function extractMetadataFromHtml(
  html: string,
  requestedUrl: string,
  existingCategories: string[] = []
): FetchedLinkMetadata {
  const metaMap = new Map<string, string>();

  // Extract all <meta> tags
  const metaRegex = /<meta\s+([^>]*?)>/gi;
  let metaMatch: RegExpExecArray | null;

  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const tagContent = metaMatch[1];
    const nameMatch = tagContent.match(/(?:name|property|http-equiv|itemprop)=["']([^"']+)["']/i);
    const contentMatch = tagContent.match(/content=["']([^"']*?)["']/i);

    if (nameMatch && contentMatch) {
      const key = nameMatch[1].toLowerCase().trim();
      const value = decodeHtmlEntities(contentMatch[1]).trim();
      metaMap.set(key, value);
    }
  }

  // Extract <link rel="canonical">
  let canonicalUrl: string | undefined;
  const canonicalMatch = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i) ||
    html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  if (canonicalMatch && canonicalMatch[1]) {
    try {
      const parsedCanonical = new URL(canonicalMatch[1], requestedUrl);
      if (parsedCanonical.protocol === 'http:' || parsedCanonical.protocol === 'https:') {
        canonicalUrl = parsedCanonical.toString();
      }
    } catch {
      // ignore malformed canonical
    }
  }

  // Extract <title>
  let docTitle = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    docTitle = decodeHtmlEntities(titleMatch[1]).trim();
  }

  // Extract primary <h1>
  let h1Text = '';
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    h1Text = stripHtmlTags(decodeHtmlEntities(h1Match[1]));
  }

  // Determine Title: prioritize og:title > twitter:title > docTitle > h1Text
  const rawTitle = metaMap.get('og:title') || metaMap.get('twitter:title') || docTitle || h1Text || '';
  const title = cleanEditorialTitle(rawTitle);

  // Determine Description: prioritize meta description > og:description > twitter:description
  let description = metaMap.get('description') || metaMap.get('og:description') || metaMap.get('twitter:description') || '';
  
  // Fallback description from first meaningful <p> inside article or main
  if (!description || description.length < 20) {
    const articleSection = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
      html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
      html;
    
    const pMatches = articleSection.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi);
    for (const p of pMatches) {
      const cleanP = stripHtmlTags(decodeHtmlEntities(p[1]));
      // Skip short nav/cookie/newsletter snippets
      if (
        cleanP.length >= 60 &&
        !cleanP.toLowerCase().includes('cookie') &&
        !cleanP.toLowerCase().includes('subscribe') &&
        !cleanP.toLowerCase().includes('newsletter') &&
        !cleanP.toLowerCase().includes('all rights reserved')
      ) {
        description = cleanP.slice(0, 240);
        // Cut cleanly at last space
        const lastSpace = description.lastIndexOf(' ');
        if (lastSpace > 180) {
          description = description.slice(0, lastSpace) + '...';
        }
        break;
      }
    }
  }

  // Clean description
  description = decodeHtmlEntities(description).replace(/\s+/g, ' ').trim();
  if (description.length > 280) {
    description = description.slice(0, 277) + '...';
  }

  // Topic / Subject Domain
  const keywordsStr = metaMap.get('keywords') || metaMap.get('news_keywords') || '';
  const tags: string[] = [];
  if (keywordsStr) {
    tags.push(...keywordsStr.split(',').map((t) => t.trim()).filter((t) => t.length > 0));
  }
  const articleTag = metaMap.get('article:tag');
  if (articleTag && !tags.includes(articleTag)) {
    tags.push(articleTag);
  }

  let topic = '';
  if (tags.length > 0) {
    topic = tags.slice(0, 3).join(', ');
  } else if (title) {
    // Derive subject domain concisely from title
    topic = title.replace(/^(the|an?)\s+/i, '').replace(/(\s*guide|\s*overview|\s*review|\s*study)$/i, '');
  }

  // Category matching
  const articleSection = metaMap.get('article:section') || '';
  const matchedCat = matchCategory(articleSection, tags, title, existingCategories, description, h1Text);

  // Preferred anchor text suggestion
  const preferredAnchor = derivePreferredAnchor(title, topic);

  // Editorial Notes
  let notes: string | undefined = undefined;
  const author = metaMap.get('author') || metaMap.get('article:author');
  const standfirst = metaMap.get('standfirst') || metaMap.get('subtitle');
  if (standfirst) {
    notes = `Standfirst: "${standfirst.slice(0, 120)}"`;
  } else if (author && topic) {
    notes = `Editorial piece by ${author} on ${topic}.`;
  }

  return {
    title: title || undefined,
    description: description || undefined,
    topic: topic || undefined,
    category: matchedCat || undefined,
    preferredAnchor: preferredAnchor || undefined,
    notes: notes || undefined,
    canonicalUrl: canonicalUrl || undefined,
  };
}

/**
 * High-level service function to fetch and extract metadata safely from a URL.
 * Combines Stage A (article extraction) with Stage B (lightweight AI-assisted editorial research).
 */
export async function fetchUrlMetadata(
  url: string,
  existingCategories: string[] = [],
  apiKey?: string
): Promise<FetchedLinkMetadata> {
  const { html, finalUrl } = await fetchHtmlWithSecurity(url);
  const extracted = extractMetadataFromHtml(html, finalUrl, existingCategories);
  extracted.resolvedUrl = finalUrl;

  const keyToUse = apiKey || process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

  if (keyToUse) {
    try {
      const genAI = new GoogleGenAI({ apiKey: keyToUse });
      const textSnippet = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 6000);

      const prompt = `You are a senior editorial strategist and internal linking analyst for Science of Gifts Studio.
Analyze the following retrieved article page content and structured page metadata.

Source URL: ${finalUrl}
Extracted Base Details: ${JSON.stringify(extracted)}
Page Content Excerpt: ${textSnippet}
Existing Library Categories: ${JSON.stringify(existingCategories)}

Extract and synthesize internal link metadata to help the AI editor identify when this article genuinely deserves a contextual link and how to introduce that link naturally.

EDITORIAL ANALYSIS RULES:
1. ARTICLE TITLE: Prefer the actual article title extracted from the page. Do NOT rewrite it unnecessarily.
2. CATEGORY: Match to one of the Existing Library Categories if appropriate (${JSON.stringify(existingCategories)}). If none fit well, provide a clean category name.
3. TOPIC: Produce a concise description of the article's main subject and relevant subtopics. Avoid vague labels or simply repeating the title.
4. SHORT DESCRIPTION: Create a concise, accurate summary of what the article actually covers (max 200 chars). Prefer the page's existing description when informative & accurate; improve only if useful.
5. PREFERRED ANCHOR TEXT: Suggest a natural phrase (2 to 5 words) that could fit into a sentence linking to this article. Avoid keyword stuffing, generic phrases ("click here", "this article"), awkward exact-match anchors, and long text.
6. EDITORIAL NOTES (CRITICAL): Generate concise, actionable notes explaining:
   - When linking to this article would genuinely help a reader.
   - Which topics, claims, questions, or discussions make the article relevant.
   - What contextual relationship would justify inserting the link.
   - When the article would be an inappropriate or redundant link.
   (Example: "Link when discussing decorative display of heirlooms, home styling, or keeping meaningful objects in living spaces. Do not link merely when the word 'gift' or 'home' appears.")

Return ONLY a valid JSON object matching this schema:
{
  "title": "string",
  "category": "string",
  "topic": "string",
  "description": "string",
  "preferredAnchor": "string",
  "notes": "string",
  "canonicalUrl": "string"
}`;

      const res = await genAI.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      });

      const respText = res.text?.trim() || '';
      let parsed: any = null;
      try {
        parsed = JSON.parse(respText);
      } catch {
        const match = respText.match(/\{[\s\S]*\}/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch {}
        }
      }

      if (parsed && typeof parsed === 'object') {
        return {
          title: parsed.title || extracted.title,
          description: parsed.description || extracted.description,
          topic: parsed.topic || extracted.topic,
          category: parsed.category || extracted.category,
          preferredAnchor: parsed.preferredAnchor || extracted.preferredAnchor,
          notes: parsed.notes || extracted.notes,
          canonicalUrl: parsed.canonicalUrl || extracted.canonicalUrl,
          resolvedUrl: finalUrl,
        };
      }
    } catch (aiErr: any) {
      console.warn('Gemini article analysis error, using extracted metadata:', aiErr?.message || aiErr);
    }
  }

  return extracted;
}

/**
 * Parses and synthesizes product specifications and metadata from HTML content,
 * JSON-LD schema objects, and Open Graph tags.
 */
export function extractProductMetadataFromHtml(
  html: string,
  requestedUrl: string,
  guideContext?: { topic?: string; audience?: string }
): FetchedProductMetadata {
  const metaMap = new Map<string, string>();

  // Extract all <meta> tags
  const metaRegex = /<meta\s+([^>]*?)>/gi;
  let metaMatch: RegExpExecArray | null;

  while ((metaMatch = metaRegex.exec(html)) !== null) {
    const tagContent = metaMatch[1];
    const nameMatch = tagContent.match(/(?:name|property|http-equiv|itemprop)=["']([^"']+)["']/i);
    const contentMatch = tagContent.match(/content=["']([^"']*?)["']/i);

    if (nameMatch && contentMatch) {
      const key = nameMatch[1].toLowerCase().trim();
      const value = decodeHtmlEntities(contentMatch[1]).trim();
      metaMap.set(key, value);
    }
  }

  // Extract <link rel="canonical">
  let canonicalUrl: string | undefined;
  const canonicalMatch =
    html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i) ||
    html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i);
  if (canonicalMatch && canonicalMatch[1]) {
    try {
      const parsedCanonical = new URL(canonicalMatch[1], requestedUrl);
      if (parsedCanonical.protocol === 'http:' || parsedCanonical.protocol === 'https:') {
        canonicalUrl = parsedCanonical.toString();
      }
    } catch {
      // ignore malformed canonical
    }
  }

  // Extract JSON-LD product blocks
  let jsonLdProduct: any = null;
  const jsonLdRegex = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch: RegExpExecArray | null;

  while ((jsonLdMatch = jsonLdRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(jsonLdMatch[1]);
      const items = Array.isArray(parsed)
        ? parsed
        : parsed['@graph'] && Array.isArray(parsed['@graph'])
        ? parsed['@graph']
        : [parsed];

      for (const item of items) {
        if (
          item &&
          (item['@type'] === 'Product' ||
            item['@type'] === 'IndividualProduct' ||
            item['@type'] === 'ProductGroup' ||
            (Array.isArray(item['@type']) && item['@type'].includes('Product')))
        ) {
          jsonLdProduct = item;
          break;
        } else if (item && item['@type'] === 'ItemPage' && item.mainEntity && item.mainEntity['@type'] === 'Product') {
          jsonLdProduct = item.mainEntity;
          break;
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
    if (jsonLdProduct) break;
  }

  // 1. PRODUCT NAME
  let rawName =
    jsonLdProduct?.name ||
    metaMap.get('og:title') ||
    metaMap.get('twitter:title') ||
    '';

  if (!rawName) {
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1Match && h1Match[1]) {
      rawName = stripHtmlTags(decodeHtmlEntities(h1Match[1]));
    }
  }
  const productName = cleanEditorialTitle(rawName);

  // 2. PRODUCT TYPE / CATEGORY
  let productType =
    jsonLdProduct?.category ||
    metaMap.get('og:product:category') ||
    metaMap.get('product:category') ||
    '';

  if (Array.isArray(productType)) {
    productType = productType.filter(Boolean).join(' / ');
  } else if (typeof productType === 'object' && productType?.name) {
    productType = productType.name;
  }

  if (!productType) {
    const nameLower = (productName + ' ' + html.slice(0, 2000)).toLowerCase();
    if (/compass|sextant|astrolabe|telescope|barometer/i.test(nameLower)) productType = 'Navigational Instrument';
    else if (/watch|chronometer|timepiece/i.test(nameLower)) productType = 'Timepiece';
    else if (/pen|journal|notebook|desk|fountain/i.test(nameLower)) productType = 'Desk Accessory';
    else if (/decanter|glass|whiskey|flask/i.test(nameLower)) productType = 'Barware';
    else if (/bag|wallet|leather|briefcase/i.test(nameLower)) productType = 'Leather Goods';
    else if (/knife|tool|axe|blade/i.test(nameLower)) productType = 'Pocket & Bench Tool';
    else if (/blanket|throw|wool|linen/i.test(nameLower)) productType = 'Home & Hearth';
  }

  // 3. PRODUCT SUMMARY
  let summary =
    jsonLdProduct?.description ||
    metaMap.get('description') ||
    metaMap.get('og:description') ||
    metaMap.get('twitter:description') ||
    '';

  summary = decodeHtmlEntities(stripHtmlTags(summary)).replace(/\s+/g, ' ').trim();
  if (summary.length > 250) {
    const lastSpace = summary.slice(0, 247).lastIndexOf(' ');
    summary = summary.slice(0, lastSpace > 160 ? lastSpace : 247) + '...';
  }

  // 4. PHYSICAL & MATERIAL DETAILS
  const materialParts: string[] = [];
  if (jsonLdProduct?.material) {
    const mat = Array.isArray(jsonLdProduct.material)
      ? jsonLdProduct.material.join(', ')
      : String(jsonLdProduct.material);
    materialParts.push(`Materials: ${mat}`);
  }
  if (jsonLdProduct?.color) {
    materialParts.push(`Color: ${jsonLdProduct.color}`);
  }
  if (jsonLdProduct?.brand?.name || typeof jsonLdProduct?.brand === 'string') {
    const brandName = jsonLdProduct.brand.name || jsonLdProduct.brand;
    materialParts.push(`Maker: ${brandName}`);
  }
  if (jsonLdProduct?.offers?.price && jsonLdProduct?.offers?.priceCurrency) {
    materialParts.push(`Price: ${jsonLdProduct.offers.priceCurrency} ${jsonLdProduct.offers.price}`);
  }

  if (Array.isArray(jsonLdProduct?.additionalProperty)) {
    for (const prop of jsonLdProduct.additionalProperty) {
      if (prop?.name && prop?.value) {
        materialParts.push(`${prop.name}: ${prop.value}`);
      }
    }
  }

  const ogMat = metaMap.get('og:product:material') || metaMap.get('product:material');
  if (ogMat && !materialParts.some((p) => p.toLowerCase().includes(ogMat.toLowerCase()))) {
    materialParts.push(`Material: ${ogMat}`);
  }

  const specsMatch = html.match(/(?:<ul\b[^>]*class=["'][^"']*(?:spec|detail|feature|product-info)[^"']*["'][^>]*>([\s\S]*?)<\/ul>|<table\b[^>]*>([\s\S]*?)<\/table>)/gi);
  if (specsMatch) {
    for (const block of specsMatch.slice(0, 3)) {
      const cleanBlock = stripHtmlTags(decodeHtmlEntities(block)).replace(/\s+/g, ' ');
      if (cleanBlock.length > 15 && cleanBlock.length < 300) {
        if (!materialParts.includes(cleanBlock)) {
          materialParts.push(cleanBlock);
        }
      }
    }
  }

  const materialDetails = materialParts.join('. ').replace(/\.\s*\./g, '.').trim();

  // 5. HISTORICAL CONTEXT & LINEAGE
  let historicalContext = '';
  const fullTextClean = stripHtmlTags(decodeHtmlEntities(html));
  const historyRegex = /(?:history|heritage|lineage|provenance|tradition|origin|historical|patterned after|century|vintage|19\d\d|18\d\d)[^.!\n]*[.!\n]/gi;
  const historyMatches = fullTextClean.match(historyRegex);
  if (historyMatches && historyMatches.length > 0) {
    historicalContext = historyMatches.slice(0, 2).map((m) => m.trim()).join(' ');
    if (historicalContext.length > 280) {
      historicalContext = historicalContext.slice(0, 277) + '...';
    }
  }

  // 6. DESIGN & SENSORY DETAILS
  let designDetails = '';
  const sensoryRegex = /(?:finish|texture|crafted|machined|polished|heavy|weight|tactile|latch|engraved|hand-finished|brass|leather|wood)[^.!\n]*[.!\n]/gi;
  const sensoryMatches = fullTextClean.match(sensoryRegex);
  if (sensoryMatches && sensoryMatches.length > 0) {
    designDetails = sensoryMatches.slice(0, 2).map((m) => m.trim()).join(' ');
    if (designDetails.length > 240) {
      designDetails = designDetails.slice(0, 237) + '...';
    }
  }

  // 7. BUYER CONSIDERATIONS
  let buyerConsiderations = '';
  const buyerRegex = /(?:care|maintenance|size|weight|note|requires|wipe|avoid|dimensions|heavier|hand wash|storage)[^.!\n]*[.!\n]/gi;
  const buyerMatches = fullTextClean.match(buyerRegex);
  if (buyerMatches && buyerMatches.length > 0) {
    buyerConsiderations = buyerMatches.slice(0, 2).map((m) => m.trim()).join(' ');
    if (buyerConsiderations.length > 240) {
      buyerConsiderations = buyerConsiderations.slice(0, 237) + '...';
    }
  }

  // 8. WHY IT FITS THIS GUIDE
  let whyItFits = '';
  if (productName) {
    const topic = guideContext?.topic || 'curated gifts';
    whyItFits = `Provides authentic material heft and functional connection for ${topic.toLowerCase()}.`;
  }

  // 9. BEST FOR
  let bestFor = '';
  if (productName) {
    const audience = guideContext?.audience || 'discerning gifters and enthusiasts';
    bestFor = `Ideal for ${audience.toLowerCase()} who appreciate enduring craft and heirloom utility.`;
  }

  // 10. PRODUCT IMAGE URL
  let imageUrl =
    metaMap.get('og:image') ||
    metaMap.get('twitter:image') ||
    '';

  if (!imageUrl && jsonLdProduct) {
    if (typeof jsonLdProduct.image === 'string') {
      imageUrl = jsonLdProduct.image;
    } else if (Array.isArray(jsonLdProduct.image) && jsonLdProduct.image[0]) {
      imageUrl = typeof jsonLdProduct.image[0] === 'string' ? jsonLdProduct.image[0] : jsonLdProduct.image[0]?.url;
    } else if (jsonLdProduct.image && jsonLdProduct.image.url) {
      imageUrl = jsonLdProduct.image.url;
    }
  }

  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    try {
      imageUrl = new URL(imageUrl, requestedUrl).toString();
    } catch {
      // ignore
    }
  }

  return {
    name: productName || undefined,
    productType: productType || undefined,
    summary: summary || undefined,
    materialDetails: materialDetails || undefined,
    historicalContext: historicalContext || undefined,
    designDetails: designDetails || undefined,
    whyItFits: whyItFits || undefined,
    bestFor: bestFor || undefined,
    buyerConsiderations: buyerConsiderations || undefined,
    imageUrl: imageUrl || undefined,
    canonicalUrl: canonicalUrl || undefined,
  };
}

/**
 * Server-side helper to fetch and extract product details securely.
 */
export async function fetchProductUrlMetadata(
  url: string,
  guideContext?: { topic?: string; audience?: string }
): Promise<FetchedProductMetadata> {
  const { html, finalUrl } = await fetchHtmlWithSecurity(url);
  const metadata = extractProductMetadataFromHtml(html, finalUrl, guideContext);
  metadata.resolvedUrl = finalUrl;
  return metadata;
}
