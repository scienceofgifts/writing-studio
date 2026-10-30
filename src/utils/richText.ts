/**
 * Science of Gifts - Rich Text Utilities
 * Converts plain text/paragraphs to structured semantic HTML without Markdown syntax.
 */

/**
 * Ensures text is structured semantic HTML for the visual rich-text editor.
 * If legacy Markdown or raw text is passed, converts it to clean HTML.
 */
export function ensureSemanticHtml(content: string): string {
  if (!content || !content.trim()) {
    return '<p></p>';
  }

  const trimmed = content.trim();

  // If already semantic HTML tags, return as is
  if (/^<(p|h1|h2|h3|h4|blockquote|ul|ol|div)/i.test(trimmed)) {
    return trimmed;
  }

  // Convert raw text or legacy lines into semantic HTML
  const lines = content.split('\n');
  const htmlParts: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (!line) {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      continue;
    }

    // Convert any legacy # headings into real heading tags
    if (line.startsWith('# ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h1>${cleanInline(line.substring(2))}</h1>`);
    } else if (line.startsWith('## ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h2>${cleanInline(line.substring(3))}</h2>`);
    } else if (line.startsWith('### ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h3>${cleanInline(line.substring(4))}</h3>`);
    } else if (line.startsWith('#### ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<h4>${cleanInline(line.substring(5))}</h4>`);
    } else if (line.startsWith('> ')) {
      if (inList) { htmlParts.push('</ul>'); inList = false; }
      htmlParts.push(`<blockquote><p>${cleanInline(line.substring(2))}</p></blockquote>`);
    } else if (line.startsWith('* ') || line.startsWith('- ') || line.startsWith('• ')) {
      if (!inList) {
        htmlParts.push('<ul>');
        inList = true;
      }
      const itemText = line.replace(/^[\*\-•]\s+/, '');
      htmlParts.push(`<li>${cleanInline(itemText)}</li>`);
    } else {
      if (inList) {
        htmlParts.push('</ul>');
        inList = false;
      }
      htmlParts.push(`<p>${cleanInline(line)}</p>`);
    }
  }

  if (inList) {
    htmlParts.push('</ul>');
  }

  return htmlParts.join('\n');
}

/**
 * Converts inline legacy formatting (like bold/italic/links) into semantic HTML tags
 */
function cleanInline(text: string): string {
  return text
    // Convert links [label](url) to <a href="url">label</a>
    .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
    // Convert bold **text** to <strong>text</strong>
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Convert italic *text* to <em>text</em>
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
}

/**
 * Extracts clean, unformatted plain text from an HTML string for Gemini context
 */
export function extractPlainTextFromHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * Counts words in an HTML string or plain text
 */
export function countWords(content: string): number {
  if (!content) return 0;
  const plainText = extractPlainTextFromHtml(content);
  if (!plainText.trim()) return 0;
  return plainText.trim().split(/\s+/).filter(Boolean).length;
}

export interface MappedPlainChar {
  char: string;
  htmlStart: number;
  htmlEnd: number;
}

/**
 * Decodes common HTML entities into their plain text equivalents.
 */
export const decodeEntity = (ent: string): string => {
  const lower = ent.toLowerCase();
  if (lower === 'nbsp' || lower === '#160') return ' ';
  if (lower === 'amp' || lower === '#38') return '&';
  if (lower === 'lt' || lower === '#60') return '<';
  if (lower === 'gt' || lower === '#62') return '>';
  if (lower === 'quot' || lower === '#34') return '"';
  if (lower === '#039' || lower === '#39' || lower === 'apos') return "'";
  if (lower === 'mdash' || lower === '#8212') return '—';
  if (lower === 'ndash' || lower === '#8211') return '–';
  return ' ';
};

/**
 * Builds a character-level index mapping normalized plain text characters (with formatting tags stripped)
 * back to their exact byte offsets in the source HTML string.
 */
export function buildHtmlToPlainIndex(html: string): {
  normText: string;
  normMap: MappedPlainChar[];
} {
  const rawChars: MappedPlainChar[] = [];
  let i = 0;
  const len = html.length;

  const citationSupRegex =
    /^<sup\b[^>]*\b(?:data-study-id|data-citation-study-id)=["'][^"']+["'][^>]*>[\s\S]*?<\/sup>/i;
  const blockEndTagRegex = /^<\/(?:p|h[1-6]|li|blockquote|div|section|article)\b[^>]*>/i;
  const brTagRegex = /^<br\b[^>]*\/?>/i;
  const genericTagRegex = /^<[^>]+>/;
  const entityRegex = /^&(#?\w+);/;

  while (i < len) {
    const rest = html.slice(i);

    // 1. Skip citation/badges completely if present
    const supMatch = rest.match(citationSupRegex);
    if (supMatch) {
      i += supMatch[0].length;
      continue;
    }

    // 2. Block end tag -> emit newline separator so sentences across blocks do not merge
    const blockMatch = rest.match(blockEndTagRegex) || rest.match(brTagRegex);
    if (blockMatch) {
      rawChars.push({ char: '\n', htmlStart: i, htmlEnd: i + blockMatch[0].length });
      i += blockMatch[0].length;
      continue;
    }

    // 3. Other HTML tags -> skip
    const tagMatch = rest.match(genericTagRegex);
    if (tagMatch) {
      i += tagMatch[0].length;
      continue;
    }

    // 4. HTML entities -> decode
    if (html[i] === '&') {
      const entMatch = rest.match(entityRegex);
      if (entMatch) {
        const decoded = decodeEntity(entMatch[1]);
        rawChars.push({ char: decoded, htmlStart: i, htmlEnd: i + entMatch[0].length });
        i += entMatch[0].length;
        continue;
      }
    }

    // 5. Regular character
    rawChars.push({ char: html[i], htmlStart: i, htmlEnd: i + 1 });
    i += 1;
  }

  // Collapse horizontal whitespace runs while preserving block boundary newlines
  const normMap: MappedPlainChar[] = [];
  for (const item of rawChars) {
    if (item.char === '\n') {
      if (normMap.length > 0 && normMap[normMap.length - 1].char === ' ') {
        normMap[normMap.length - 1] = item;
      } else if (normMap.length === 0 || normMap[normMap.length - 1].char !== '\n') {
        normMap.push(item);
      }
    } else if (/\s/.test(item.char)) {
      if (
        normMap.length > 0 &&
        normMap[normMap.length - 1].char !== ' ' &&
        normMap[normMap.length - 1].char !== '\n'
      ) {
        normMap.push({ char: ' ', htmlStart: item.htmlStart, htmlEnd: item.htmlEnd });
      }
    } else {
      normMap.push(item);
    }
  }

  // Trim leading/trailing whitespace
  while (normMap.length > 0 && /\s/.test(normMap[0].char)) {
    normMap.shift();
  }
  while (normMap.length > 0 && /\s/.test(normMap[normMap.length - 1].char)) {
    normMap.pop();
  }

  return {
    normText: normMap.map((c) => c.char).join(''),
    normMap,
  };
}

/**
 * Expands an HTML range [start, end] to include any surrounding formatting tags
 * (strong, em, etc.) that would otherwise be "split" by the range.
 * This ensures the resulting segment is valid HTML and preserves formatting.
 */
export function expandHtmlRangeToBalancedTags(html: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  let e = end;
  
  let currentSegment = html.substring(s, e);
  
  // 1. Expand backwards to catch opening tags for unmatched closing tags
  let iterations = 0;
  while (s > 0 && iterations < 5) {
    iterations++;
    const tags = currentSegment.match(/<[^>]+>/g) || [];
    let firstUnmatchedClosing: string | null = null;
    const stack: string[] = [];
    
    for (const tag of tags) {
      if (tag.startsWith('</')) {
        const name = tag.slice(2, -1).split(/[ >]/)[0].toLowerCase();
        if (stack.length > 0 && stack[stack.length - 1] === name) {
          stack.pop();
        } else {
          firstUnmatchedClosing = name;
          break;
        }
      } else if (!tag.endsWith('/>') && !tag.startsWith('<!')) {
        const name = tag.slice(1).split(/[ >]/)[0].toLowerCase();
        if (!['br', 'hr', 'img', 'input', 'meta'].includes(name)) {
          stack.push(name);
        }
      }
    }
    
    if (!firstUnmatchedClosing) break;
    
    // Find the nearest opening tag for this closing tag before 's'
    const before = html.substring(0, s);
    const openTagRegex = new RegExp(`<${firstUnmatchedClosing}\\b[^>]*>`, 'gi');
    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    while ((match = openTagRegex.exec(before)) !== null) {
      lastMatch = match;
    }
    
    if (!lastMatch) break;
    s = lastMatch.index;
    currentSegment = html.substring(s, e);
  }

  // 2. Expand forwards to catch closing tags for unmatched opening tags
  iterations = 0;
  while (e < html.length && iterations < 5) {
    iterations++;
    const tags = currentSegment.match(/<[^>]+>/g) || [];
    const stack: string[] = [];
    
    for (const tag of tags) {
      if (tag.startsWith('</')) {
        const name = tag.slice(2, -1).split(/[ >]/)[0].toLowerCase();
        if (stack.length > 0 && stack[stack.length - 1] === name) {
          stack.pop();
        }
      } else if (!tag.endsWith('/>') && !tag.startsWith('<!')) {
        const name = tag.slice(1).split(/[ >]/)[0].toLowerCase();
        if (!['br', 'hr', 'img', 'input', 'meta'].includes(name)) {
          stack.push(name);
        }
      }
    }
    
    if (stack.length === 0) break;
    
    const lastUnmatchedOpening = stack[stack.length - 1];
    const after = html.substring(e);
    const closeTagRegex = new RegExp(`</${lastUnmatchedOpening}>`, 'i');
    const closeMatch = after.match(closeTagRegex);
    
    if (!closeMatch) break;
    e = e + (closeMatch.index || 0) + closeMatch[0].length;
    currentSegment = html.substring(s, e);
  }

  return { start: s, end: e };
}

/**
 * Normalizes a passage for use as a stable key in maps/deduplication.
 */
export function normalizePassageKey(text: string): string {
  if (!text) return '';
  return normalizePassageText(text).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Normalizes a target passage string for deterministic comparison.
 */
export function normalizePassageText(passage: string): string {
  if (!passage) return '';
  return passage
    .replace(/<sup\b[^>]*\b(?:data-study-id|data-citation-study-id)=["'][^"']+["'][^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/\s*\[\d+\]\s*(?=[.!?]|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PassageMatchResult {
  status: 'unique_match' | 'not_found' | 'ambiguous';
  matchCount: number;
  htmlStart?: number;
  htmlEnd?: number;
  reason?: string;
}

/**
 * Robustly finds occurrences of a query string in normalized text,
 * handling case sensitivity, word boundaries, and terminal punctuation.
 */
export function findPassageMatches(
  normText: string,
  query: string
): Array<{ start: number; end: number }> {
  const cleanTarget = normalizePassageText(query);
  if (!cleanTarget || cleanTarget.length < 2) return [];

  const findOccurrences = (needle: string, caseInsensitive: boolean): Array<{ start: number; end: number }> => {
    const haystack = caseInsensitive ? normText.toLowerCase() : normText;
    const search = caseInsensitive ? needle.toLowerCase() : needle;
    if (!search) return [];

    const results: Array<{ start: number; end: number }> = [];
    let pos = 0;
    while (pos <= haystack.length - search.length) {
      const idx = haystack.indexOf(search, pos);
      if (idx === -1) break;

      const endIdx = idx + search.length;
      const charBefore = idx > 0 ? haystack[idx - 1] : ' ';
      const charAfter = endIdx < haystack.length ? haystack[endIdx] : ' ';
      const startsAtWordBoundary = !/[a-z0-9]/i.test(charBefore) || !/[a-z0-9]/i.test(search[0]);
      const endsAtWordBoundary =
        !/[a-z0-9]/i.test(charAfter) || !/[a-z0-9]/i.test(search[search.length - 1]);

      if (startsAtWordBoundary && endsAtWordBoundary) {
        results.push({ start: idx, end: endIdx });
      }
      pos = idx + 1;
    }
    return results;
  };

  let matches = findOccurrences(cleanTarget, false);
  if (matches.length === 0) {
    matches = findOccurrences(cleanTarget, true);
  }
  
  // Try matching without terminal punctuation if not found
  if (matches.length === 0 && /[.!?]+$/.test(cleanTarget)) {
    const withoutPunct = cleanTarget.replace(/[.!?]+$/, '').trim();
    if (withoutPunct.length >= 5) {
      matches = findOccurrences(withoutPunct, false);
      if (matches.length === 0) {
        matches = findOccurrences(withoutPunct, true);
      }
    }
  }

  return matches;
}

/**
 * Verifies that a target passage exists unambiguously in the HTML.
 * Correctly handles matching across formatting tags (strong, em, etc.).
 */
export function verifyTargetPassageInHtml(
  html: string,
  targetPassage: string
): PassageMatchResult {
  const cleanTarget = normalizePassageText(targetPassage);

  if (!cleanTarget || cleanTarget.length < 5) {
    return {
      status: 'not_found',
      matchCount: 0,
      reason: 'Target passage is empty or too short to match safely.',
    };
  }

  const { normText, normMap } = buildHtmlToPlainIndex(html || '');
  if (!normText) {
    return {
      status: 'not_found',
      matchCount: 0,
      reason: 'Content is empty.',
    };
  }

  const matches = findPassageMatches(normText, cleanTarget);

  if (matches.length === 0) {
    return {
      status: 'not_found',
      matchCount: 0,
      reason: 'Target passage does not match any sentence in the current text.',
    };
  }

  if (matches.length > 1) {
    return {
      status: 'ambiguous',
      matchCount: matches.length,
      reason: `Target passage appears ${matches.length} times and cannot be matched unambiguously.`,
    };
  }

  const match = matches[0];
  const firstChar = normMap[match.start];
  const lastChar = normMap[match.end - 1];

  return {
    status: 'unique_match',
    matchCount: 1,
    htmlStart: firstChar.htmlStart,
    htmlEnd: lastChar.htmlEnd,
  };
}
