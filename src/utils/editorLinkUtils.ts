/**
 * Science of Gifts - Editor Link Utilities
 * Shared logic for resolving link opportunity locations against the Tiptap document.
 */

import { LinkOpportunity } from '../types/internalLink';
import { normalizeUrlForComparison, extractUrlsFromHtml } from './urlUtils';
import { normalizePassageText, findPassageMatches } from './richText';

export interface LocationVerificationResult {
  isVerified: boolean;
  reason: string;
  candidate?: {
    from: number;
    to: number;
    text: string;
    score: number;
    matchType: 'link_mark_and_anchor' | 'link_mark_only' | 'anchor_text_only';
  };
}

/**
 * Builds a character-level index mapping normalized plain text characters 
 * back to their exact ProseMirror positions in the document.
 */
function buildPMToPlainIndex(doc: any): {
  normText: string;
  posMap: number[];
} {
  let fullText = '';
  const posMap: number[] = [];

  doc.descendants((node: any, pos: number) => {
    if (node.isText) {
      // Skip citation markers (superscripts) so they don't interfere with matching
      const hasSuperscript = node.marks?.some((m: any) => m.type.name === 'superscript');
      if (hasSuperscript) return;

      const text = node.text;
      for (let i = 0; i < text.length; i++) {
        fullText += text[i];
        posMap.push(pos + i);
      }
    } else if (node.isBlock || node.type.name === 'hardBreak') {
      // Add a newline for block boundaries to ensure word boundaries match
      if (fullText.length > 0 && fullText[fullText.length - 1] !== '\n') {
        fullText += '\n';
        posMap.push(pos);
      }
    }
  });

  return { normText: fullText, posMap };
}

/**
 * Resolves a link opportunity against the current editor document state.
 */
export function resolveLinkOpportunityLocation(
  opp: LinkOpportunity,
  contentHtml: string,
  editor?: any
): LocationVerificationResult {
  const isSuggestNew = opp.workflowType === 'suggest_new';
  const targetUrl = opp.linkUrl || '';
  const targetAnchor = opp.suggestedAnchor || '';
  const targetPassage = opp.targetPassage || '';
  const contextSentence = opp.contextSentence || '';
  const normTargetUrl = normalizeUrlForComparison(targetUrl);

  // 1. Verification for already accepted links
  if (opp.status === 'accepted') {
    if (contentHtml) {
      const urlsInHtml = extractUrlsFromHtml(contentHtml);
      const hasMatchingUrlInHtml =
        normTargetUrl && urlsInHtml.some((u) => normalizeUrlForComparison(u) === normTargetUrl);
      if (hasMatchingUrlInHtml) {
        return { isVerified: true, reason: 'Link verified in document.' };
      }
    }
  }

  // 2. Resolve via Editor (Robust multi-node matching)
  if (editor?.state?.doc) {
    const doc = editor.state.doc;
    const { normText, posMap } = buildPMToPlainIndex(doc);
    
    let searchNeedle = '';
    if (opp.workflowType === 'match_existing') {
      searchNeedle = targetAnchor;
    } else if (opp.workflowType === 'revise_existing') {
      searchNeedle = targetPassage;
    } else {
      searchNeedle = contextSentence;
    }

    if (!searchNeedle) {
      return { isVerified: false, reason: 'Search needle is empty for this workflow.' };
    }

    const matches = findPassageMatches(normText, searchNeedle);

    if (matches.length === 0) {
      // Fallback: if it's match_existing, try matching the targetPassage if provided
      if (opp.workflowType === 'match_existing' && targetPassage) {
        const passageMatches = findPassageMatches(normText, targetPassage);
        if (passageMatches.length === 1) {
          // Found the passage, now find anchor within it
          const match = passageMatches[0];
          const passageText = normText.substring(match.start, match.end);
          const anchorMatches = findPassageMatches(passageText, targetAnchor);
          if (anchorMatches.length > 0) {
            const from = posMap[match.start + anchorMatches[0].start];
            const to = posMap[match.start + anchorMatches[0].end - 1] + 1;
            return {
              isVerified: true,
              reason: 'Existing anchor verified via passage context.',
              candidate: {
                from,
                to,
                text: doc.textBetween(from, to, ' '),
                score: 100,
                matchType: 'anchor_text_only'
              }
            };
          }
        }
      }

      return {
        isVerified: false,
        reason: isSuggestNew
          ? `Could not locate context sentence: "${contextSentence.slice(0, 60)}..."`
          : `Could not locate source text: "${searchNeedle.slice(0, 60)}..."`,
      };
    }

    // DISAMBIGUATION: If multiple matches found for anchor, try using targetPassage to narrow it down
    if (matches.length > 1 && opp.workflowType === 'match_existing' && targetPassage) {
      const passageMatches = findPassageMatches(normText, targetPassage);
      if (passageMatches.length === 1) {
        const pMatch = passageMatches[0];
        const passageText = normText.substring(pMatch.start, pMatch.end);
        const anchorMatches = findPassageMatches(passageText, targetAnchor);
        if (anchorMatches.length === 1) {
          const from = posMap[pMatch.start + anchorMatches[0].start];
          const to = posMap[pMatch.start + anchorMatches[0].end - 1] + 1;
          return {
            isVerified: true,
            reason: 'Existing anchor verified via passage context (disambiguated).',
            candidate: {
              from,
              to,
              text: doc.textBetween(from, to, ' '),
              score: 100,
              matchType: 'anchor_text_only'
            }
          };
        }
      }
    }

    if (matches.length > 1) {
      return {
        isVerified: false,
        reason: `Found ${matches.length} identical matches for "${searchNeedle.slice(0, 30)}...". Please refine the text to ensure a unique link insertion.`,
      };
    }

    const match = matches[0];
    let from = posMap[match.start];
    let to = posMap[match.end - 1] + 1;

    // For match_existing, if we matched the targetPassage instead of the anchor, we need to find the anchor within it
    if (opp.workflowType === 'match_existing' && searchNeedle === targetAnchor) {
      // Already matched the anchor
    } else if (opp.workflowType === 'match_existing') {
       // Should not happen with new logic but for safety
    }

    return {
      isVerified: true,
      reason: opp.workflowType === 'revise_existing' 
        ? 'Original passage verified in draft.' 
        : isSuggestNew 
        ? 'Context sentence verified in draft.' 
        : 'Existing anchor verified in draft.',
      candidate: {
        from,
        to,
        text: doc.textBetween(from, to, ' '),
        score: 100,
        matchType: 'anchor_text_only',
      },
    };
  }

  // 3. Resolve via HTML (Fallback for non-editor contexts)
  if (contentHtml) {
    const plainText = contentHtml.replace(/<[^>]+>/g, ' ').toLowerCase();
    const searchNeedle = opp.workflowType === 'match_existing' ? targetAnchor : opp.workflowType === 'revise_existing' ? targetPassage : contextSentence;
    if (searchNeedle && plainText.includes(searchNeedle.toLowerCase())) {
      return { isVerified: true, reason: 'Source text verified in saved content.' };
    }
  }

  return {
    isVerified: false,
    reason: isSuggestNew
      ? `Could not locate context sentence: "${contextSentence.slice(0, 60)}..."`
      : `Could not locate existing anchor: "${targetAnchor}"`,
  };
}
