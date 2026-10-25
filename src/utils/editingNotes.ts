/**
 * Science of Gifts - Article-Anchored Voice & Written Editing Notes Utilities
 * Provides:
 * - Selection anchor extraction from ProseMirror documents and HTML strings
 * - Stable ProseMirror transaction mapping + contextual anchor recovery
 * - Ambiguous & deleted passage detection without data loss
 * - Deterministic speech transcript filler/punctuation cleanup (preserving speaker intent)
 * - Consolidated Editing Brief generator for ChatGPT & Claude
 */

import { ArticleEditingNote, EditingNoteAnchorStatus, WritingProject } from '../types/project';
import { countWords, extractPlainTextFromHtml } from './richText';
import { htmlToMarkdown } from './markdown';
import { stripLeadingH1 } from '../services/articleExport';

export interface SelectionAnchorCapture {
  quotedText: string;
  paragraphContext: string;
  headingContext?: string;
  prefixContext: string;
  suffixContext: string;
  from: number;
  to: number;
}

export interface EditingBriefOptions {
  targetAssistant?: 'chatgpt' | 'claude' | 'universal';
  articleFormat?: 'markdown' | 'plain_text' | 'html';
  additionalGlobalDirection?: string;
}

const CONTEXT_WINDOW_CHARS = 64;

/**
 * Normalizes whitespace for resilient text comparison
 */
export function normalizeWhitespace(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts rich selection anchor context from a ProseMirror document state
 */
export function extractSelectionAnchorFromDoc(
  doc: any,
  from: number,
  to: number
): SelectionAnchorCapture | null {
  if (!doc || typeof from !== 'number' || typeof to !== 'number' || from >= to) {
    return null;
  }

  const docSize = doc.content ? doc.content.size : 0;
  const clampedFrom = Math.max(0, Math.min(from, docSize));
  const clampedTo = Math.max(clampedFrom, Math.min(to, docSize));
  if (clampedFrom >= clampedTo) return null;

  const quotedText = doc.textBetween(clampedFrom, clampedTo, ' ').trim();
  if (!quotedText) return null;

  const prefixStart = Math.max(0, clampedFrom - CONTEXT_WINDOW_CHARS);
  const suffixEnd = Math.min(docSize, clampedTo + CONTEXT_WINDOW_CHARS);

  let prefixContext = doc.textBetween(prefixStart, clampedFrom, ' ');
  let suffixContext = doc.textBetween(clampedTo, suffixEnd, ' ');

  let paragraphContext = quotedText;
  let headingContext: string | undefined = undefined;

  try {
    doc.nodesBetween(0, docSize, (node: any, pos: number) => {
      if (node.type?.name === 'heading') {
        const headingText = node.textContent?.trim();
        if (headingText && pos <= clampedFrom) {
          headingContext = headingText;
        }
      }
      if (
        (node.isTextblock ||
          node.type?.name === 'paragraph' ||
          node.type?.name === 'heading' ||
          node.type?.name === 'blockquote') &&
        pos <= clampedFrom &&
        pos + node.nodeSize >= clampedTo
      ) {
        const blockText = node.textContent?.trim();
        if (blockText) {
          paragraphContext = blockText;
          const blockContentStart = pos + 1;
          const blockContentEnd = pos + node.nodeSize - 1;
          const blockPrefixStart = Math.max(blockContentStart, clampedFrom - CONTEXT_WINDOW_CHARS);
          const blockSuffixEnd = Math.min(blockContentEnd, clampedTo + CONTEXT_WINDOW_CHARS);
          prefixContext = doc.textBetween(blockPrefixStart, clampedFrom, ' ');
          suffixContext = doc.textBetween(clampedTo, blockSuffixEnd, ' ');
        }
      }
    });
  } catch {
    // Fallback if nodesBetween is unavailable on a mock doc
  }

  return {
    quotedText,
    paragraphContext,
    headingContext,
    prefixContext,
    suffixContext,
    from: clampedFrom,
    to: clampedTo,
  };
}

interface TextCandidateMatch {
  from: number;
  to: number;
  paragraphContext: string;
  headingContext?: string;
  prefixContext: string;
  suffixContext: string;
}

/**
 * Scans a ProseMirror document to find all occurrences of `targetQuote`
 * and returns their ProseMirror `[from, to]` ranges and surrounding context.
 */
export function findQuoteCandidatesInDoc(doc: any, targetQuote: string): TextCandidateMatch[] {
  const normalizedTarget = normalizeWhitespace(targetQuote);
  if (!doc || !normalizedTarget) return [];

  const candidates: TextCandidateMatch[] = [];
  const docSize = doc.content ? doc.content.size : 0;
  let currentHeading: string | undefined = undefined;

  // 1. Search within textblocks (paragraphs, headings, list items)
  doc.descendants((node: any, pos: number) => {
    if (node.type?.name === 'heading') {
      const hText = node.textContent?.trim();
      if (hText) currentHeading = hText;
    }

    if (!node.isTextblock) return true;

    const blockHeading = currentHeading;
    const blockText: string = node.textContent || '';
    if (!blockText.trim()) return false;

    // Build a map from character index in blockText to ProseMirror document position
    const charToPmPos: number[] = [];
    node.forEach((child: any, offset: number) => {
      const childStartPos = pos + 1 + offset;
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) {
          charToPmPos.push(childStartPos + i);
        }
      } else if (child.isLeaf) {
        for (let i = 0; i < (child.textContent?.length || 0); i++) {
          charToPmPos.push(childStartPos);
        }
      }
    });

    // Search exact substring matches first, then case-insensitive / whitespace-tolerant matches
    const searchString = blockText;
    let searchIdx = 0;
    let foundExactInBlock = false;

    while (searchIdx <= searchString.length - targetQuote.length) {
      const matchIdx = searchString.indexOf(targetQuote, searchIdx);
      if (matchIdx === -1) break;
      foundExactInBlock = true;

      const endIdx = matchIdx + targetQuote.length - 1;
      const pmFrom = charToPmPos[matchIdx] ?? pos + 1 + matchIdx;
      const pmTo = (charToPmPos[endIdx] ?? pos + 1 + endIdx) + 1;

      candidates.push({
        from: pmFrom,
        to: pmTo,
        paragraphContext: blockText.trim(),
        headingContext: blockHeading,
        prefixContext: blockText.slice(Math.max(0, matchIdx - CONTEXT_WINDOW_CHARS), matchIdx),
        suffixContext: blockText.slice(
          matchIdx + targetQuote.length,
          Math.min(blockText.length, matchIdx + targetQuote.length + CONTEXT_WINDOW_CHARS)
        ),
      });

      searchIdx = matchIdx + Math.max(1, targetQuote.length);
    }

    // If no exact match due to whitespace normalization, try normalized regex match
    if (!foundExactInBlock) {
      const escapedTokens = normalizedTarget
        .split(' ')
        .filter(Boolean)
        .map((tok) => tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

      if (escapedTokens.length > 0) {
        const regex = new RegExp(escapedTokens.join('\\s+'), 'g');
        let match: RegExpExecArray | null;
        while ((match = regex.exec(searchString)) !== null) {
          const matchIdx = match.index;
          const matchLen = match[0].length;
          const endIdx = matchIdx + matchLen - 1;
          const pmFrom = charToPmPos[matchIdx] ?? pos + 1 + matchIdx;
          const pmTo = (charToPmPos[endIdx] ?? pos + 1 + endIdx) + 1;

          candidates.push({
            from: pmFrom,
            to: pmTo,
            paragraphContext: blockText.trim(),
            headingContext: blockHeading,
            prefixContext: blockText.slice(Math.max(0, matchIdx - CONTEXT_WINDOW_CHARS), matchIdx),
            suffixContext: blockText.slice(
              matchIdx + matchLen,
              Math.min(blockText.length, matchIdx + matchLen + CONTEXT_WINDOW_CHARS)
            ),
          });
        }
      }
    }

    return false;
  });

  // 2. Multi-paragraph selection fallback if targetQuote spans across multiple blocks
  if (candidates.length === 0) {
    const fullDocText = doc.textBetween(0, docSize, ' ');
    if (normalizeWhitespace(fullDocText).includes(normalizedTarget)) {
      // Find first block containing the start and last block containing the end
      const tokens = normalizedTarget.split(' ').filter(Boolean);
      if (tokens.length >= 2) {
        const firstPhrase = tokens.slice(0, Math.min(4, tokens.length)).join(' ');
        const lastPhrase = tokens.slice(Math.max(0, tokens.length - 4)).join(' ');
        const startMatches = findQuoteCandidatesInDoc(doc, firstPhrase);
        const endMatches = findQuoteCandidatesInDoc(doc, lastPhrase);
        for (const s of startMatches) {
          for (const e of endMatches) {
            if (e.to > s.from) {
              const spanText = normalizeWhitespace(doc.textBetween(s.from, e.to, ' '));
              if (spanText === normalizedTarget) {
                const prefixStart = Math.max(0, s.from - CONTEXT_WINDOW_CHARS);
                const suffixEnd = Math.min(docSize, e.to + CONTEXT_WINDOW_CHARS);
                candidates.push({
                  from: s.from,
                  to: e.to,
                  paragraphContext: doc.textBetween(s.from, e.to, '\n').trim(),
                  headingContext: s.headingContext,
                  prefixContext: doc.textBetween(prefixStart, s.from, ' '),
                  suffixContext: doc.textBetween(e.to, suffixEnd, ' '),
                });
              }
            }
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * Scores a candidate match against the note's stored context to disambiguate multiple occurrences.
 */
function scoreCandidateContext(note: ArticleEditingNote, candidate: TextCandidateMatch): number {
  let score = 0;

  const notePara = normalizeWhitespace(note.paragraphContext);
  const candPara = normalizeWhitespace(candidate.paragraphContext);
  if (notePara && candPara) {
    if (notePara === candPara) {
      score += 50;
    } else if (candPara.includes(notePara) || notePara.includes(candPara)) {
      score += 25;
    }
  }

  const notePrefix = normalizeWhitespace(note.prefixContext);
  const candPrefix = normalizeWhitespace(candidate.prefixContext);
  if (notePrefix && candPrefix) {
    if (notePrefix === candPrefix) {
      score += 35;
    } else {
      const tailLen = Math.min(24, notePrefix.length, candPrefix.length);
      if (
        tailLen >= 4 &&
        notePrefix.slice(notePrefix.length - tailLen) === candPrefix.slice(candPrefix.length - tailLen)
      ) {
        score += 22;
      }
    }
  } else if (!notePrefix && !candPrefix) {
    score += 10; // Both at start of document
  }

  const noteSuffix = normalizeWhitespace(note.suffixContext);
  const candSuffix = normalizeWhitespace(candidate.suffixContext);
  if (noteSuffix && candSuffix) {
    if (noteSuffix === candSuffix) {
      score += 35;
    } else {
      const headLen = Math.min(24, noteSuffix.length, candSuffix.length);
      if (headLen >= 4 && noteSuffix.slice(0, headLen) === candSuffix.slice(0, headLen)) {
        score += 22;
      }
    }
  } else if (!noteSuffix && !candSuffix) {
    score += 10; // Both at end of document
  }

  if (note.headingContext && candidate.headingContext) {
    if (normalizeWhitespace(note.headingContext) === normalizeWhitespace(candidate.headingContext)) {
      score += 15;
    }
  }

  return score;
}

/**
 * Maps and resolves all editing notes against a live ProseMirror document.
 * 1. Applies `trMapping` if provided (fast, exact tracking during edits before/after the passage).
 * 2. Verifies whether the mapped `[from, to]` still matches `quotedText`.
 * 3. If offsets shifted or text changed, uses contextual recovery across the document.
 * 4. Marks notes as `'resolved'`, `'ambiguous'`, or `'unresolved'` without ever discarding a note.
 */
export function mapAndResolveNotesInDoc(
  doc: any,
  notes: ArticleEditingNote[],
  trMapping?: { map: (pos: number, assoc?: number) => number }
): { updatedNotes: ArticleEditingNote[]; changed: boolean } {
  if (!doc || !Array.isArray(notes) || notes.length === 0) {
    return { updatedNotes: notes || [], changed: false };
  }

  const docSize = doc.content ? doc.content.size : 0;
  let changed = false;

  const updatedNotes = notes.map((note) => {
    let mappedFrom = note.from;
    let mappedTo = note.to;

    if (trMapping && typeof trMapping.map === 'function') {
      try {
        mappedFrom = trMapping.map(note.from, 1);
        mappedTo = trMapping.map(note.to, -1);
      } catch {
        mappedFrom = note.from;
        mappedTo = note.to;
      }
    }

    const clampedFrom = Math.max(0, Math.min(mappedFrom, docSize));
    const clampedTo = Math.max(clampedFrom, Math.min(mappedTo, docSize));

    // Check if the mapped range directly matches the note's quotedText
    if (clampedFrom < clampedTo && note.anchorStatus !== 'ambiguous') {
      const currentSlice = doc.textBetween(clampedFrom, clampedTo, ' ');
      if (normalizeWhitespace(currentSlice) === normalizeWhitespace(note.quotedText)) {
        const refreshed = extractSelectionAnchorFromDoc(doc, clampedFrom, clampedTo);
        const nextParagraph = refreshed?.paragraphContext || note.paragraphContext;
        const nextHeading = refreshed?.headingContext ?? note.headingContext;
        const nextStatus: EditingNoteAnchorStatus = 'resolved';

        if (
          note.from !== clampedFrom ||
          note.to !== clampedTo ||
          note.anchorStatus !== nextStatus ||
          note.paragraphContext !== nextParagraph ||
          note.headingContext !== nextHeading
        ) {
          changed = true;
          return {
            ...note,
            from: clampedFrom,
            to: clampedTo,
            paragraphContext: nextParagraph,
            headingContext: nextHeading,
            anchorStatus: nextStatus,
          };
        }
        return note;
      }
    }

    // Contextual Recovery: Search document for candidate matches of `note.quotedText`
    const candidates = findQuoteCandidatesInDoc(doc, note.quotedText);

    if (candidates.length === 1) {
      const match = candidates[0];
      const nextStatus: EditingNoteAnchorStatus = 'resolved';
      if (
        note.from !== match.from ||
        note.to !== match.to ||
        note.anchorStatus !== nextStatus ||
        note.paragraphContext !== match.paragraphContext
      ) {
        changed = true;
        return {
          ...note,
          from: match.from,
          to: match.to,
          paragraphContext: match.paragraphContext,
          headingContext: match.headingContext ?? note.headingContext,
          prefixContext: match.prefixContext,
          suffixContext: match.suffixContext,
          anchorStatus: nextStatus,
        };
      }
      return note;
    }

    if (candidates.length > 1) {
      // Score each candidate using prefix/suffix/paragraph context
      const scored = candidates.map((cand) => ({
        cand,
        contextScore: scoreCandidateContext(note, cand),
        distance: Math.abs(cand.from - mappedFrom),
      }));

      scored.sort((a, b) => {
        if (b.contextScore !== a.contextScore) {
          return b.contextScore - a.contextScore;
        }
        return a.distance - b.distance;
      });

      const best = scored[0];
      const secondBest = scored[1];

      // Determine if context uniquely disambiguates the best candidate
      const isUniquelyDisambiguated =
        best.contextScore > secondBest.contextScore && best.contextScore >= 20;

      const nextStatus: EditingNoteAnchorStatus = isUniquelyDisambiguated ? 'resolved' : 'ambiguous';

      if (
        note.from !== best.cand.from ||
        note.to !== best.cand.to ||
        note.anchorStatus !== nextStatus ||
        note.paragraphContext !== best.cand.paragraphContext
      ) {
        changed = true;
        return {
          ...note,
          from: best.cand.from,
          to: best.cand.to,
          paragraphContext: best.cand.paragraphContext,
          headingContext: best.cand.headingContext ?? note.headingContext,
          anchorStatus: nextStatus,
        };
      }
      return note;
    }

    // 0 candidates found: The anchored passage was deleted or modified beyond recognition.
    // Never silently delete the note — mark it as 'unresolved' ("Needs attention") and preserve its original quote & context.
    if (note.anchorStatus !== 'unresolved' || note.from !== clampedFrom || note.to !== clampedTo) {
      changed = true;
      return {
        ...note,
        from: clampedFrom,
        to: clampedTo,
        anchorStatus: 'unresolved' as const,
      };
    }

    return note;
  });

  return { updatedNotes, changed };
}

/**
 * Reconciles editing notes against raw semantic HTML string (e.g. during Version Restore or headless testing)
 * without requiring a mounted DOM editor instance.
 */
export function reconcileNotesWithHtmlContent(
  htmlContent: string,
  notes: ArticleEditingNote[]
): ArticleEditingNote[] {
  if (!Array.isArray(notes) || notes.length === 0) return [];

  // Parse HTML into structured blocks (headings, paragraphs, list items, blockquotes)
  const blockRegex = /<(h[1-6]|p|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  const blocks: Array<{
    tag: string;
    text: string;
    headingContext?: string;
    startOffset: number;
    endOffset: number;
  }> = [];

  let currentHeading: string | undefined = undefined;
  let runningOffset = 1; // ProseMirror-compatible 1-based offset approximation
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(htmlContent || '')) !== null) {
    const tag = match[1].toLowerCase();
    const rawInner = match[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'");
    const cleanText = rawInner.trim();
    if (tag.startsWith('h') && cleanText) {
      currentHeading = cleanText;
    }
    const startOffset = runningOffset;
    const endOffset = startOffset + rawInner.length;
    blocks.push({
      tag,
      text: rawInner,
      headingContext: currentHeading,
      startOffset,
      endOffset,
    });
    runningOffset = endOffset + 2;
  }

  // Fallback if HTML has no tags
  if (blocks.length === 0 && htmlContent?.trim()) {
    const plain = extractPlainTextFromHtml(htmlContent);
    blocks.push({
      tag: 'p',
      text: plain,
      startOffset: 1,
      endOffset: 1 + plain.length,
    });
  }

  const fullText = blocks.map((b) => b.text).join(' ');

  return notes.map((note) => {
    const target = note.quotedText;
    const normalizedTarget = normalizeWhitespace(target);
    if (!normalizedTarget) {
      return { ...note, anchorStatus: 'unresolved' as const };
    }

    const candidates: TextCandidateMatch[] = [];

    for (const block of blocks) {
      let idx = 0;
      let foundExact = false;
      while (idx <= block.text.length - target.length) {
        const foundIdx = block.text.indexOf(target, idx);
        if (foundIdx === -1) break;
        foundExact = true;

        const absFrom = block.startOffset + foundIdx;
        const absTo = absFrom + target.length;
        const prefix = block.text.slice(Math.max(0, foundIdx - CONTEXT_WINDOW_CHARS), foundIdx);
        const suffix = block.text.slice(
          foundIdx + target.length,
          Math.min(block.text.length, foundIdx + target.length + CONTEXT_WINDOW_CHARS)
        );

        candidates.push({
          from: absFrom,
          to: absTo,
          paragraphContext: block.text.trim(),
          headingContext: block.headingContext,
          prefixContext: prefix,
          suffixContext: suffix,
        });

        idx = foundIdx + Math.max(1, target.length);
      }

      if (!foundExact) {
        const escapedTokens = normalizedTarget
          .split(' ')
          .filter(Boolean)
          .map((tok) => tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (escapedTokens.length > 0) {
          const regex = new RegExp(escapedTokens.join('\\s+'), 'g');
          let m: RegExpExecArray | null;
          while ((m = regex.exec(block.text)) !== null) {
            const foundIdx = m.index;
            const len = m[0].length;
            const absFrom = block.startOffset + foundIdx;
            const absTo = absFrom + len;
            const prefix = block.text.slice(Math.max(0, foundIdx - CONTEXT_WINDOW_CHARS), foundIdx);
            const suffix = block.text.slice(
              foundIdx + len,
              Math.min(block.text.length, foundIdx + len + CONTEXT_WINDOW_CHARS)
            );
            candidates.push({
              from: absFrom,
              to: absTo,
              paragraphContext: block.text.trim(),
              headingContext: block.headingContext,
              prefixContext: prefix,
              suffixContext: suffix,
            });
          }
        }
      }
    }

    // Multi-block span check
    if (candidates.length === 0 && normalizeWhitespace(fullText).includes(normalizedTarget)) {
      const normFull = normalizeWhitespace(fullText);
      const pos = normFull.indexOf(normalizedTarget);
      if (pos !== -1) {
        candidates.push({
          from: pos + 1,
          to: pos + 1 + normalizedTarget.length,
          paragraphContext: note.paragraphContext || normalizedTarget,
          headingContext: note.headingContext,
          prefixContext: normFull.slice(Math.max(0, pos - CONTEXT_WINDOW_CHARS), pos),
          suffixContext: normFull.slice(
            pos + normalizedTarget.length,
            pos + normalizedTarget.length + CONTEXT_WINDOW_CHARS
          ),
        });
      }
    }

    if (candidates.length === 1) {
      const c = candidates[0];
      return {
        ...note,
        from: c.from,
        to: c.to,
        paragraphContext: c.paragraphContext,
        headingContext: c.headingContext ?? note.headingContext,
        prefixContext: c.prefixContext,
        suffixContext: c.suffixContext,
        anchorStatus: 'resolved' as const,
      };
    }

    if (candidates.length > 1) {
      const scored = candidates.map((cand) => ({
        cand,
        contextScore: scoreCandidateContext(note, cand),
        distance: Math.abs(cand.from - note.from),
      }));

      scored.sort((a, b) => {
        if (b.contextScore !== a.contextScore) return b.contextScore - a.contextScore;
        return a.distance - b.distance;
      });

      const best = scored[0];
      const secondBest = scored[1];
      const isUniquelyDisambiguated =
        best.contextScore > secondBest.contextScore && best.contextScore >= 20;

      return {
        ...note,
        from: best.cand.from,
        to: best.cand.to,
        paragraphContext: best.cand.paragraphContext,
        headingContext: best.cand.headingContext ?? note.headingContext,
        anchorStatus: isUniquelyDisambiguated ? ('resolved' as const) : ('ambiguous' as const),
      };
    }

    return {
      ...note,
      anchorStatus: 'unresolved' as const,
    };
  });
}

/**
 * Deterministically cleans a raw speech-to-text transcript:
 * - Removes conversational fillers ("um", "uh", "er", "ah", "you know", "I mean")
 * - Collapses accidental word stutters ("make make", "the the", "this this")
 * - Normalizes punctuation and capitalization
 * - Strictly preserves the speaker's actual editing instructions and qualifications
 */
export function cleanSpeechTranscriptLocally(rawTranscript: string): string {
  if (!rawTranscript || !rawTranscript.trim()) return '';

  let text = rawTranscript.trim();

  // 1. Remove standalone hesitation sounds ("um", "uh", "uhm", "er", "erm", "ah", "hmm")
  text = text.replace(/\b(u+m+|u+h+m*|e+r+m*|a+h+|h+m+)\b[,]?\s*/gi, ' ');

  // 2. Remove conversational filler phrases when bounded by pauses or starts of clauses
  text = text.replace(/(?:^|,\s*|\.\s+)(you know|i mean|sort of like|kind of like)\s*,?\s*/gi, (match) => {
    if (match.startsWith('.')) return '. ';
    if (match.startsWith(',')) return ', ';
    return '';
  });

  // 3. Remove leading filler "like" or "like," at the very start of the utterance (e.g., "Like, make this shorter")
  text = text.trim().replace(/^like\b[,]?\s+/i, '');
  text = text.replace(/,\s*like,\s+/gi, ', ');

  // 4. Collapse immediate single-word stutters (e.g. "the the" -> "the", "make make" -> "make")
  text = text.replace(/\b([a-zA-Z]{2,})\s+\1\b/gi, '$1');

  // 5. Clean up orphaned commas and extra whitespace
  text = text
    .replace(/\s+,/g, ',')
    .replace(/,{2,}/g, ',')
    .replace(/\.\s*,/g, '.')
    .replace(/^,\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';

  // 6. Capitalize the first character of the instruction and after sentence-ending punctuation
  text = text.charAt(0).toUpperCase() + text.slice(1);
  text = text.replace(/([.!?]\s+)([a-z])/g, (_m, sep, char) => `${sep}${char.toUpperCase()}`);

  // 7. Ensure clean terminal punctuation if missing
  if (!/[.!?]["')\]]?$/.test(text)) {
    text += '.';
  }

  return text;
}

/**
 * Returns editing notes sorted in document order (resolved & ambiguous notes by `from` position,
 * then `createdAt`, followed by unresolved notes).
 */
export function sortEditingNotesInArticleOrder(notes: ArticleEditingNote[]): ArticleEditingNote[] {
  if (!Array.isArray(notes)) return [];
  return [...notes].sort((a, b) => {
    const aUnresolved = a.anchorStatus === 'unresolved' ? 1 : 0;
    const bUnresolved = b.anchorStatus === 'unresolved' ? 1 : 0;
    if (aUnresolved !== bUnresolved) {
      return aUnresolved - bUnresolved;
    }
    if (a.from !== b.from) {
      return a.from - b.from;
    }
    if (a.to !== b.to) {
      return a.to - b.to;
    }
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
}

/**
 * Generates a consolidated, copyable Editing Brief for ChatGPT, Claude, or any external AI assistant.
 * Includes:
 * 1. Explicit revision instructions for the external AI (apply requested edits, preserve the rest of the article,
 *    maintain voice/tone/factual accuracy, return the revised article cleanly).
 * 2. Article metadata (Title, Standfirst/Deck, Category, Word Count).
 * 3. Full clean article text (free of any internal note markers or UI artifacts).
 * 4. All confirmed editing notes in article order (even if note markers are currently hidden in the editor UI).
 * 5. Clearly labelled section for any unresolved or ambiguous notes.
 */
export function buildConsolidatedEditingBrief(
  project: WritingProject,
  options?: EditingBriefOptions
): string {
  const targetAssistant = options?.targetAssistant || 'universal';
  const articleFormat = options?.articleFormat || 'markdown';
  const allNotes = sortEditingNotesInArticleOrder(project.editingNotes || []);
  const anchoredNotes = allNotes.filter(
    (n) => n.anchorStatus === 'resolved' || n.anchorStatus === 'ambiguous'
  );
  const unresolvedNotes = allNotes.filter((n) => n.anchorStatus === 'unresolved');

  const cleanHtml = stripLeadingH1(project.content || '');
  const cleanMarkdown = htmlToMarkdown(cleanHtml, { omitH1: true }).trim();
  const cleanPlainText = extractPlainTextFromHtml(project.content || '').trim();
  const wordCount = countWords(project.content || '');

  const articleBody =
    articleFormat === 'html'
      ? cleanHtml || project.content || ''
      : articleFormat === 'plain_text'
      ? cleanPlainText
      : cleanMarkdown || cleanPlainText;

  const assistantName =
    targetAssistant === 'chatgpt'
      ? 'ChatGPT'
      : targetAssistant === 'claude'
      ? 'Claude'
      : 'AI Editorial Assistant';

  const standfirst =
    project.articleMeta?.standfirst ||
    project.giftGuideMeta?.standfirst ||
    project.productCopyMeta?.standfirst ||
    project.brief?.purpose ||
    '';

  const category =
    project.articleMeta?.category ||
    project.giftGuideMeta?.occasionOrNiche ||
    project.type.replace('_', ' ');

  const lines: string[] = [];

  lines.push(`# CONSOLIDATED ARTICLE EDITING BRIEF (FOR ${assistantName.toUpperCase()})`);
  lines.push('');
  lines.push('## 1. INSTRUCTIONS FOR THE AI EDITOR');
  lines.push(
    'You are revising the article below based on a set of passage-anchored editorial notes recorded by the author/editor.'
  );
  lines.push('Please follow these rules strictly:');
  lines.push(
    '1. **Apply the Requested Edits**: Execute every numbered editing note below on its specified anchored passage.'
  );
  lines.push(
    '2. **Preserve Unmarked Prose**: Preserve the rest of the article verbatim unless minor transitional adjustments are required for grammatical or logical coherence around an edited passage.'
  );
  lines.push(
    '3. **Maintain Voice, Tone & Factual Accuracy**: Preserve the article’s existing editorial voice, civilized tone, and factual claims. Do not invent unsupported facts, dimensions, or clichés, and do not use em dashes (—).'
  );
  lines.push(
    '4. **Clean Output**: Return the complete, revised article cleanly without inline comment markers, brackets, or meta-commentary.'
  );

  if (options?.additionalGlobalDirection?.trim()) {
    lines.push('');
    lines.push(`**Additional Overall Direction**: ${options.additionalGlobalDirection.trim()}`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 2. ARTICLE METADATA');
  lines.push(`- **Title**: ${project.title || 'Untitled Article'}`);
  if (standfirst) {
    lines.push(`- **Subtitle / Standfirst**: ${standfirst}`);
  }
  if (category) {
    lines.push(`- **Section / Category**: ${category}`);
  }
  lines.push(`- **Current Word Count**: ~${wordCount} words`);
  lines.push(`- **Total Editing Notes**: ${allNotes.length}`);

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 3. FULL ARTICLE TEXT');
  lines.push('```' + (articleFormat === 'html' ? 'html' : 'markdown'));
  lines.push(`# ${project.title || 'Untitled Article'}`);
  if (standfirst) {
    lines.push('');
    lines.push(`*${standfirst}*`);
  }
  lines.push('');
  lines.push(articleBody || '(Article body is currently empty.)');
  lines.push('```');

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`## 4. ANCHORED EDITING NOTES (${anchoredNotes.length} IN ARTICLE ORDER)`);

  if (anchoredNotes.length === 0) {
    lines.push('');
    lines.push('*(No active anchored notes.)*');
  } else {
    anchoredNotes.forEach((note, index) => {
      const noteNum = index + 1;
      lines.push('');
      lines.push(
        `### Note #${noteNum}${note.headingContext ? ` — Section: "${note.headingContext}"` : ''}${
          note.anchorStatus === 'ambiguous' ? ' [AMBIGUOUS ANCHOR: MULTIPLE PASSAGE MATCHES]' : ''
        }`
      );
      lines.push(`- **Selected Passage**: "${note.quotedText}"`);
      if (
        note.paragraphContext &&
        normalizeWhitespace(note.paragraphContext) !== normalizeWhitespace(note.quotedText)
      ) {
        lines.push(`- **Containing Paragraph Context**: "${note.paragraphContext}"`);
      }
      if (note.anchorStatus === 'ambiguous') {
        lines.push(
          `- **Disambiguation Context**: Preceded by "${note.prefixContext.trim()}" | Followed by "${note.suffixContext.trim()}"`
        );
      }
      lines.push(`- **Editing Instruction**: ${note.instruction}`);
    });
  }

  if (unresolvedNotes.length > 0) {
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(
      `## 5. NOTES NEEDING ATTENTION / UNRESOLVED ANCHORS (${unresolvedNotes.length})`
    );
    lines.push(
      'The following notes were attached to passages that were subsequently edited or removed in the draft. Please review their original passage context and apply the intended edit where appropriate:'
    );

    unresolvedNotes.forEach((note, index) => {
      const noteNum = anchoredNotes.length + index + 1;
      lines.push('');
      lines.push(
        `### Note #${noteNum} [NEEDS ATTENTION — ORIGINAL PASSAGE MODIFIED OR REMOVED]${
          note.headingContext ? ` — Original Section: "${note.headingContext}"` : ''
        }`
      );
      lines.push(`- **Original Selected Passage**: "${note.quotedText}"`);
      if (note.paragraphContext) {
        lines.push(`- **Original Paragraph Context**: "${note.paragraphContext}"`);
      }
      lines.push(`- **Editing Instruction**: ${note.instruction}`);
    });
  }

  lines.push('');
  return lines.join('\n');
}
