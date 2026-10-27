/**
 * Science of Gifts - Research Citation & Reference List Utilities
 * Handles numbered in-text superscript citations, scholarly APA bibliographic formatting,
 * and automatic synchronization of the end-of-article Reference list.
 */

import { ResearchStudy } from '../types/research';
import { CitationRecommendation, CitedStudyReference } from '../types/citation';
import { 
  normalizePassageText, 
  normalizePassageKey,
  verifyTargetPassageInHtml as verifySharedTargetPassageInHtml,
  buildHtmlToPlainIndex,
  PassageMatchResult 
} from './richText';

/**
 * Formats authors into standard academic bibliographic style:
 * "Galak, J., & Givi, J." or "Author, A."
 */
export function formatAuthorsBibliographic(authors?: string[] | string): string {
  if (!authors) return 'Science of Gifts Research Archive';
  const authorList = Array.isArray(authors)
    ? authors
    : String(authors)
        .split(/[,;&]|\band\b/i)
        .map((a) => a.trim())
        .filter(Boolean);

  if (authorList.length === 0) return 'Science of Gifts Research Archive';

  const formatted = authorList.map((author) => {
    const clean = author.trim();
    if (!clean) return '';
    // If already in "Last, F." format
    if (clean.includes(',')) return clean;

    const parts = clean.split(/\s+/);
    if (parts.length === 1) return parts[0];
    const lastName = parts[parts.length - 1];
    const initials = parts
      .slice(0, parts.length - 1)
      .map((p) => (p[0] ? `${p[0].toUpperCase()}.` : ''))
      .join(' ');
    return initials ? `${lastName}, ${initials}` : lastName;
  }).filter(Boolean);

  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
  if (formatted.length <= 6) {
    return `${formatted.slice(0, -1).join(', ')}, & ${formatted[formatted.length - 1]}`;
  }
  return `${formatted[0]} et al.`;
}

export interface PassageVerificationResult extends PassageMatchResult {
  canInsert: boolean;
  citationWindowHtml?: string;
  insertAtHtmlIndex?: number;
}

/**
 * Resolves a verified external link (DOI URL or direct HTTP/HTTPS URL) for a study, if available.
 * Never fabricates links.
 */
export function resolveStudySourceLink(
  study?: ResearchStudy | Partial<ResearchStudy> | any
): { url?: string; doi?: string; displayLabel?: string } {
  if (!study) return {};

  const rawDoi = String(
    study.doi || (study.doiOrUrl && /10\.\d{4,9}\//i.test(String(study.doiOrUrl)) ? study.doiOrUrl : '')
  ).trim();

  if (rawDoi) {
    const cleanDoi = rawDoi
      .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
      .replace(/^doi:\s*/i, '')
      .trim();
    if (cleanDoi) {
      const doiUrl = `https://doi.org/${cleanDoi}`;
      return { url: doiUrl, doi: cleanDoi, displayLabel: `DOI: ${cleanDoi}` };
    }
  }

  const candidateUrl = String(study.sourceUrl || study.url || study.doiOrUrl || '').trim();
  if (candidateUrl && (candidateUrl.startsWith('http://') || candidateUrl.startsWith('https://'))) {
    return { url: candidateUrl, displayLabel: candidateUrl };
  }

  return {};
}

/**
 * Formats a study into a clean, complete APA-style bibliographic reference HTML.
 * Never fabricates missing fields.
 */
export function formatBibliographicReference(
  study: ResearchStudy | Partial<ResearchStudy> | any
): string {
  const authorStr = formatAuthorsBibliographic(study?.authors);
  const yearStr = study?.publicationYear ? `(${study.publicationYear}).` : `(n.d.).`;
  const cleanTitle = (study?.title || 'Untitled Research Study').trim().replace(/\.$/, '');
  const publicationStr = study?.publication || study?.sourceOrPublisher;

  let ref = `<span class="ref-authors font-semibold">${escapeHtml(authorStr)}</span> ${escapeHtml(yearStr)} <span class="ref-title italic font-editorial">${escapeHtml(cleanTitle)}</span>.`;

  if (publicationStr) {
    ref += ` <span class="ref-publication">${escapeHtml(publicationStr)}</span>.`;
  }

  const { url } = resolveStudySourceLink(study);
  if (url) {
    ref += ` <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="ref-link text-blue-700 hover:text-blue-900 underline font-mono text-[11px] break-all">${escapeHtml(url)}</a>`;
  }

  return ref;
}

/**
 * Plain text format for Markdown and plain text export
 */
export function formatPlainReference(study: ResearchStudy | Partial<ResearchStudy> | any): string {
  const authorStr = formatAuthorsBibliographic(study?.authors);
  const yearStr = study?.publicationYear ? `(${study.publicationYear}).` : `(n.d.).`;
  const cleanTitle = (study?.title || 'Untitled Research Study').trim().replace(/\.$/, '');
  const publicationStr = study?.publication || study?.sourceOrPublisher;

  let ref = `${authorStr} ${yearStr} ${cleanTitle}.`;
  if (publicationStr) {
    ref += ` ${publicationStr}.`;
  }

  const { url } = resolveStudySourceLink(study);
  if (url) {
    ref += ` ${url}`;
  }

  return ref;
}

/**
 * Separates article body content from the references section if one already exists.
 */
export function splitBodyAndReferences(html: string): { bodyHtml: string; referencesSectionHtml: string } {
  if (!html) return { bodyHtml: '', referencesSectionHtml: '' };

  // Match existing <section ... data-references-section ...> or <section ... data-references-block ...>
  const sectionMatch = html.match(
    /(?:<hr\s*\/?>\s*)?<section[^>]*\b(?:data-references-section|data-references-block|\barticle-references|\breferences-section)[^>]*>[\s\S]*?<\/section>/i
  );
  if (sectionMatch && sectionMatch.index !== undefined) {
    return {
      bodyHtml: html.slice(0, sectionMatch.index).trim(),
      referencesSectionHtml: sectionMatch[0],
    };
  }

  // Fallback match: <h2>References</h2> at the end
  const h2Match = html.match(/(?:<hr\s*\/?>\s*)?<h2[^>]*>\s*References\s*<\/h2>[\s\S]*$/i);
  if (h2Match && h2Match.index !== undefined) {
    return {
      bodyHtml: html.slice(0, h2Match.index).trim(),
      referencesSectionHtml: h2Match[0],
    };
  }

  return { bodyHtml: html, referencesSectionHtml: '' };
}

/**
 * Extracts all citations from an HTML string, preserving order of appearance.
 */
export function extractCitationsFromHtml(
  html: string
): Array<{ studyId: string; currentNumber: number; match: string; index: number }> {
  const { bodyHtml } = splitBodyAndReferences(html);
  const citations: Array<{ studyId: string; currentNumber: number; match: string; index: number }> = [];

  // Match citation markers: <sup ... data-study-id="xyz" ...>N</sup> or data-citation-study-id="xyz"
  const citationRegex =
    /<sup\b[^>]*\b(?:data-study-id|data-citation-study-id)=["']([^"']+)["'][^>]*>(.*?)<\/sup>/gi;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(bodyHtml)) !== null) {
    const studyId = match[1];
    const rawNumber = parseInt(match[2].replace(/\D/g, ''), 10) || 1;
    citations.push({
      studyId,
      currentNumber: rawNumber,
      match: match[0],
      index: match.index,
    });
  }

  return citations;
}

/**
 * Synchronizes in-text citation numbers (1, 2, 3...) with the References list at the end of the article.
 * - Same study cited multiple times reuses its first-assigned citation number.
 * - Removed citations trigger renumbering of remaining citations.
 * - Generates clean, deduplicated, ordered References section.
 */
export function syncCitationsAndReferences(
  html: string,
  allStudies: ResearchStudy[]
): {
  updatedHtml: string;
  citedStudies: CitedStudyReference[];
  totalInTextCitations: number;
} {
  if (!html) {
    return { updatedHtml: '', citedStudies: [], totalInTextCitations: 0 };
  }

  const { bodyHtml } = splitBodyAndReferences(html);
  const studiesMap = new Map<string, ResearchStudy>();
  allStudies.forEach((s) => studiesMap.set(s.id, s));

  // 1. Scan in-text citations in order of first appearance
  const citationRegex =
    /<sup\b[^>]*\b(?:data-study-id|data-citation-study-id)=["']([^"']+)["'][^>]*>(.*?)<\/sup>/gi;
  const orderedStudyIds: string[] = [];
  const studyIdToNumber = new Map<string, number>();
  const occurrenceCountMap = new Map<string, number>();

  let m: RegExpExecArray | null;
  while ((m = citationRegex.exec(bodyHtml)) !== null) {
    const studyId = m[1];
    occurrenceCountMap.set(studyId, (occurrenceCountMap.get(studyId) || 0) + 1);

    if (!studyIdToNumber.has(studyId)) {
      orderedStudyIds.push(studyId);
      studyIdToNumber.set(studyId, orderedStudyIds.length);
    }
  }

  // 2. Renumber in-text superscripts in bodyHtml
  const updatedBody = bodyHtml.replace(
    /<sup\b[^>]*\b(?:data-study-id|data-citation-study-id)=["']([^"']+)["'][^>]*>(.*?)<\/sup>/gi,
    (_full, studyId) => {
      const assignedNum = studyIdToNumber.get(studyId) || 1;
      return `<sup class="citation-ref text-[11px] font-semibold text-amber-900 select-none cursor-pointer" data-study-id="${escapeHtml(studyId)}">${assignedNum}</sup>`;
    }
  );

  // 3. Build CitedStudyReference list
  const citedStudies: CitedStudyReference[] = orderedStudyIds.map((studyId, idx) => {
    const num = idx + 1;
    const study = studiesMap.get(studyId);
    const title = study?.title || 'Referenced Academic Study';
    const authors = study?.authors || ['Science of Gifts Archive'];
    const publicationYear = study?.publicationYear;
    const publication = study?.publication || study?.sourceOrPublisher;
    const { url, doi } = resolveStudySourceLink(study);

    return {
      citationNumber: num,
      studyId,
      title,
      authors,
      publicationYear,
      publication,
      doi: doi || study?.doi,
      url: url || study?.sourceUrl || study?.doiOrUrl,
      formattedReference: formatBibliographicReference(
        study || {
          id: studyId,
          title,
          authors,
        }
      ),
      occurrenceCount: occurrenceCountMap.get(studyId) || 1,
    };
  });

  // 4. Generate or omit References Section
  if (citedStudies.length === 0) {
    return {
      updatedHtml: updatedBody.trim(),
      citedStudies: [],
      totalInTextCitations: 0,
    };
  }

  let referencesSection = `\n<section class="article-references mt-10 pt-6 border-t border-[#e2dcd0]" data-references-section="true">\n`;
  referencesSection += `  <h2 class="font-editorial text-xl font-bold text-[#1e232a] mb-4 tracking-tight">References</h2>\n`;
  referencesSection += `  <ol class="references-list space-y-2.5 text-xs text-[#383229] pl-5 list-decimal font-ui leading-relaxed">\n`;

  citedStudies.forEach((cs) => {
    referencesSection += `    <li value="${cs.citationNumber}" data-study-id="${escapeHtml(cs.studyId)}" class="pl-1">\n`;
    referencesSection += `      ${cs.formattedReference}\n`;
    referencesSection += `    </li>\n`;
  });

  referencesSection += `  </ol>\n`;
  referencesSection += `</section>`;

  const totalInTextCitations = Array.from(occurrenceCountMap.values()).reduce((a, b) => a + b, 0);

  return {
    updatedHtml: `${updatedBody.trim()}\n${referencesSection}`,
    citedStudies,
    totalInTextCitations,
  };
}

export interface PassageVerificationResult extends PassageMatchResult {
  canInsert: boolean;
  citationWindowHtml?: string;
}

/**
 * Verifies that a target passage exists unambiguously in the article HTML.
 * Rejects missing passages, short/generic fragments, and ambiguous passages that appear multiple times.
 */
export function verifyTargetPassageInHtml(
  htmlContent: string,
  targetPassage: string
): PassageVerificationResult {
  const { bodyHtml } = splitBodyAndReferences(htmlContent || '');
  const match = verifySharedTargetPassageInHtml(bodyHtml, targetPassage);
  
  const result: PassageVerificationResult = {
    ...match,
    canInsert: match.status === 'unique_match',
  };

  if (match.status === 'not_found') {
    result.reason = 'Target passage does not match any sentence in the current article text.';
    return result;
  }
  if (match.status === 'ambiguous') {
    result.reason = `Target passage appears ${match.matchCount} times in the article and cannot be matched unambiguously.`;
    return result;
  }

  // Determine exact HTML insertion index (before terminal sentence punctuation if present)
  const { normMap } = buildHtmlToPlainIndex(bodyHtml);
  const cleanTarget = normalizePassageText(targetPassage);
  const normText = normMap.map(c => c.char).join('');
  const findIdx = normText.indexOf(cleanTarget);
  
  const firstChar = normMap[findIdx];
  const lastChar = normMap[findIdx + cleanTarget.length - 1];
  let insertAtHtmlIndex = lastChar.htmlEnd;

  if (/[.!?]/.test(lastChar.char)) {
    insertAtHtmlIndex = lastChar.htmlStart;
  } else if (findIdx + cleanTarget.length < normMap.length && /[.!?]/.test(normMap[findIdx + cleanTarget.length].char)) {
    insertAtHtmlIndex = normMap[findIdx + cleanTarget.length].htmlStart;
  } else {
    // Advance past any immediately closing inline tags (</em>, </strong>, </a>, </span>)
    const afterSlice = bodyHtml.slice(insertAtHtmlIndex);
    const closingInlineMatch = afterSlice.match(/^(?:<\/(?:em|strong|i|b|u|a|span|code)>)+/i);
    if (closingInlineMatch) {
      insertAtHtmlIndex += closingInlineMatch[0].length;
    }
  }

  const lookaheadSize = 100;
  result.insertAtHtmlIndex = insertAtHtmlIndex;
  result.citationWindowHtml = bodyHtml.slice(
    Math.max(0, firstChar.htmlStart - 20),
    Math.min(bodyHtml.length, lastChar.htmlEnd + lookaheadSize)
  );

  return result;
}

/**
 * Checks whether a specific target passage in the article is already cited with `studyId`.
 */
export function isPassageCitedWithStudy(
  htmlContent: string,
  targetPassage: string,
  studyId: string
): boolean {
  if (!htmlContent || !studyId) return false;
  if (!targetPassage || !targetPassage.trim()) return false;

  const verification = verifyTargetPassageInHtml(htmlContent, targetPassage);
  if (verification.status !== 'unique_match' || !verification.citationWindowHtml) {
    return false;
  }

  const studyAttrRegex = new RegExp(
    `\\b(?:data-study-id|data-citation-study-id)=["']${escapeRegex(studyId)}["']`,
    'i'
  );
  return studyAttrRegex.test(verification.citationWindowHtml);
}

/**
 * Inserts a numbered citation into an article's HTML at the specified target passage.
 * - Requires an unambiguous match of `recommendation.targetPassage` in the current article HTML.
 * - NEVER falls back to appending at the end of the article or into an unrelated paragraph.
 * - Idempotent: if the matched passage already cites `recommendation.studyId`, does not insert a duplicate marker.
 */
export function insertCitationIntoHtml(
  html: string,
  recommendation: CitationRecommendation | { studyId: string; targetPassage: string },
  allStudies: ResearchStudy[]
): {
  updatedHtml: string;
  citedStudies: CitedStudyReference[];
  success: boolean;
  citationNumber: number;
  alreadyCited?: boolean;
  errorReason?: string;
} {
  if (!html || !recommendation || !recommendation.studyId) {
    return {
      updatedHtml: html,
      citedStudies: [],
      success: false,
      citationNumber: 0,
      errorReason: 'Missing article content or study ID.',
    };
  }

  const studyExists = allStudies.some((s) => s.id === recommendation.studyId);
  if (!studyExists) {
    return {
      updatedHtml: html,
      citedStudies: syncCitationsAndReferences(html, allStudies).citedStudies,
      success: false,
      citationNumber: 0,
      errorReason: `Study "${recommendation.studyId}" does not exist in the Research Library.`,
    };
  }

  const targetPassage = (recommendation.targetPassage || '').trim();
  if (!targetPassage) {
    return {
      updatedHtml: html,
      citedStudies: syncCitationsAndReferences(html, allStudies).citedStudies,
      success: false,
      citationNumber: 0,
      errorReason: 'No target passage specified. Use "Draft Research Passage" to write a research-backed passage first.',
    };
  }

  const verification = verifyTargetPassageInHtml(html, targetPassage);
  if (!verification.canInsert || verification.status !== 'unique_match' || verification.insertAtHtmlIndex === undefined) {
    return {
      updatedHtml: html,
      citedStudies: syncCitationsAndReferences(html, allStudies).citedStudies,
      success: false,
      citationNumber: 0,
      errorReason: verification.reason || 'Could not unambiguously locate target passage in the current draft.',
    };
  }

  const { bodyHtml } = splitBodyAndReferences(html);

  // Idempotency check: if this passage already carries a citation marker for this study, do not duplicate
  const studyAttrRegex = new RegExp(
    `\\b(?:data-study-id|data-citation-study-id)=["']${escapeRegex(recommendation.studyId)}["']`,
    'i'
  );
  if (verification.citationWindowHtml && studyAttrRegex.test(verification.citationWindowHtml)) {
    const syncResult = syncCitationsAndReferences(bodyHtml, allStudies);
    const assigned =
      syncResult.citedStudies.find((c) => c.studyId === recommendation.studyId)?.citationNumber || 1;
    return {
      updatedHtml: syncResult.updatedHtml,
      citedStudies: syncResult.citedStudies,
      success: true,
      citationNumber: assigned,
      alreadyCited: true,
    };
  }

  const tempMarker = `<sup class="citation-ref text-[11px] font-semibold text-amber-900 select-none cursor-pointer" data-study-id="${escapeHtml(recommendation.studyId)}">0</sup>`;

  const newBody =
    bodyHtml.slice(0, verification.insertAtHtmlIndex) +
    tempMarker +
    bodyHtml.slice(verification.insertAtHtmlIndex);

  const syncResult = syncCitationsAndReferences(newBody, allStudies);
  const assignedNum =
    syncResult.citedStudies.find((c) => c.studyId === recommendation.studyId)?.citationNumber || 1;

  return {
    updatedHtml: syncResult.updatedHtml,
    citedStudies: syncResult.citedStudies,
    success: true,
    citationNumber: assignedNum,
    alreadyCited: false,
  };
}

/**
 * Workflow B: Inserts an explicitly approved, research-backed passage together with its
 * numbered in-text citation and updates the References section.
 */
export function insertDraftedPassageWithCitation(
  html: string,
  draftedPassage: string,
  studyId: string,
  allStudies: ResearchStudy[],
  options?: {
    anchorPassageContext?: string;
    targetSectionHeading?: string;
  }
): {
  updatedHtml: string;
  citedStudies: CitedStudyReference[];
  success: boolean;
  citationNumber: number;
  insertedPassage: string;
  alreadyCited?: boolean;
  errorReason?: string;
} {
  const cleanPassage = normalizePassageText(draftedPassage);
  if (!cleanPassage || cleanPassage.length < 10) {
    return {
      updatedHtml: html,
      citedStudies: syncCitationsAndReferences(html || '', allStudies).citedStudies,
      success: false,
      citationNumber: 0,
      insertedPassage: '',
      errorReason: 'Drafted research passage cannot be empty.',
    };
  }

  if (!studyId || !allStudies.some((s) => s.id === studyId)) {
    return {
      updatedHtml: html,
      citedStudies: syncCitationsAndReferences(html || '', allStudies).citedStudies,
      success: false,
      citationNumber: 0,
      insertedPassage: cleanPassage,
      errorReason: 'Referenced study was not found in the Research Library.',
    };
  }

  // Idempotency check: if the exact drafted passage already exists in the article, just ensure it is cited
  const existingCheck = verifyTargetPassageInHtml(html || '', cleanPassage);
  if (existingCheck.status === 'unique_match') {
    const res = insertCitationIntoHtml(
      html || '',
      { studyId, targetPassage: cleanPassage },
      allStudies
    );
    return {
      ...res,
      insertedPassage: cleanPassage,
    };
  }

  const { bodyHtml } = splitBodyAndReferences(html || '');
  const tempMarker = `<sup class="citation-ref text-[11px] font-semibold text-amber-900 select-none cursor-pointer" data-study-id="${escapeHtml(studyId)}">0</sup>`;

  // Place citation marker before terminal punctuation of the drafted passage
  const passageWithPunct = /[.!?]$/.test(cleanPassage) ? cleanPassage : `${cleanPassage}.`;
  const punctMatch = passageWithPunct.match(/([.!?]+)(["']?)$/);
  const citedParagraphHtml =
    punctMatch && punctMatch.index !== undefined
      ? `<p>${escapeHtml(passageWithPunct.slice(0, punctMatch.index))}${tempMarker}${escapeHtml(punctMatch[0])}</p>`
      : `<p>${escapeHtml(passageWithPunct)}${tempMarker}</p>`;

  let newBody = bodyHtml.trim();
  let insertedAfterAnchor = false;

  // 1. Try inserting after anchorPassageContext if uniquely matched in a <p> block
  if (options?.anchorPassageContext && options.anchorPassageContext.trim().length >= 10) {
    const anchorCheck = verifyTargetPassageInHtml(newBody, options.anchorPassageContext);
    if (anchorCheck.status === 'unique_match' && anchorCheck.htmlEnd !== undefined) {
      const closePIdx = newBody.indexOf('</p>', anchorCheck.htmlEnd);
      if (closePIdx !== -1) {
        const insertPoint = closePIdx + 4;
        newBody = `${newBody.slice(0, insertPoint)}\n${citedParagraphHtml}${newBody.slice(insertPoint)}`;
        insertedAfterAnchor = true;
      }
    }
  }

  // 2. Otherwise try inserting into the section matching targetSectionHeading
  if (!insertedAfterAnchor && options?.targetSectionHeading && options.targetSectionHeading.trim()) {
    const cleanHeading = normalizePassageText(options.targetSectionHeading).toLowerCase();
    const headingRegex = /<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
    let hMatch: RegExpExecArray | null;
    while ((hMatch = headingRegex.exec(newBody)) !== null) {
      const headingText = normalizePassageText(hMatch[2]).toLowerCase();
      if (headingText && (headingText === cleanHeading || headingText.includes(cleanHeading) || cleanHeading.includes(headingText))) {
        const sectionStart = hMatch.index + hMatch[0].length;
        const restAfterHeading = newBody.slice(sectionStart);
        const nextHeadingMatch = restAfterHeading.match(/<h[23]\b[^>]*>/i);
        const sectionEnd =
          nextHeadingMatch && nextHeadingMatch.index !== undefined
            ? sectionStart + nextHeadingMatch.index
            : newBody.length;
        newBody = `${newBody.slice(0, sectionEnd).trimEnd()}\n${citedParagraphHtml}\n${newBody.slice(sectionEnd).trimStart()}`.trim();
        insertedAfterAnchor = true;
        break;
      }
    }
  }

  // 3. Otherwise append as a new paragraph at the end of the article body (before References)
  if (!insertedAfterAnchor) {
    newBody = newBody ? `${newBody}\n${citedParagraphHtml}` : citedParagraphHtml;
  }

  const syncResult = syncCitationsAndReferences(newBody, allStudies);
  const assignedNum =
    syncResult.citedStudies.find((c) => c.studyId === studyId)?.citationNumber || 1;

  return {
    updatedHtml: syncResult.updatedHtml,
    citedStudies: syncResult.citedStudies,
    success: true,
    citationNumber: assignedNum,
    insertedPassage: passageWithPunct,
    alreadyCited: false,
  };
}

/**
 * Deduplicates and merges incoming citation recommendations with previously stored recommendations.
 * - Preserves dismissed and accepted statuses across re-runs.
 * - Deduplicates by (studyId, workflowType, normalizedTargetPassage / section).
 * - Syncs accepted state only when the specific passage is actually cited with that study in `currentHtml`.
 */
export function mergeCitationRecommendations(
  existingRecs: CitationRecommendation[],
  incomingRecs: CitationRecommendation[],
  currentHtml: string
): CitationRecommendation[] {
  const buildRecKey = (r: CitationRecommendation): string => {
    const wf = r.workflowType || (r.targetPassage?.trim() ? 'cite_existing' : 'draft_passage');
    const passageKey =
      wf === 'cite_existing'
        ? normalizePassageKey(r.targetPassage || '')
        : normalizePassageKey(r.targetSectionHeading || r.anchorPassageContext || r.relevantFinding || '');
    return `${r.studyId}::${wf}::${passageKey}`;
  };

  const existingByKey = new Map<string, CitationRecommendation>();
  for (const oldRec of existingRecs || []) {
    if (!oldRec || !oldRec.studyId) continue;
    existingByKey.set(buildRecKey(oldRec), oldRec);
  }

  const mergedMap = new Map<string, CitationRecommendation>();

  // 1. Keep previously reviewed (dismissed or accepted) recommendations so re-running never loses history
  for (const [key, oldRec] of existingByKey.entries()) {
    if (oldRec.status === 'dismissed' || oldRec.status === 'accepted') {
      mergedMap.set(key, oldRec);
    }
  }

  // 2. Merge incoming recommendations, deduplicating by key and respecting prior user decisions
  for (const newRec of incomingRecs || []) {
    if (!newRec || !newRec.studyId) continue;
    const key = buildRecKey(newRec);
    const existing = existingByKey.get(key);

    if (existing && existing.status === 'dismissed') {
      mergedMap.set(key, existing);
      continue;
    }

    const isAlreadyCitedInDoc =
      newRec.targetPassage && newRec.targetPassage.trim()
        ? isPassageCitedWithStudy(currentHtml, newRec.targetPassage, newRec.studyId)
        : existing?.status === 'accepted' && existing.targetPassage
        ? isPassageCitedWithStudy(currentHtml, existing.targetPassage, existing.studyId)
        : false;

    if (isAlreadyCitedInDoc) {
      mergedMap.set(key, {
        ...(existing || newRec),
        ...newRec,
        id: existing?.id || newRec.id,
        status: 'accepted',
      });
      continue;
    }

    if (existing && existing.status === 'accepted') {
      mergedMap.set(key, existing);
      continue;
    }

    if (!mergedMap.has(key)) {
      mergedMap.set(key, {
        ...newRec,
        id: existing?.id || newRec.id,
        proposedPassage: existing?.proposedPassage || newRec.proposedPassage,
        draftStatus: existing?.draftStatus || newRec.draftStatus,
      });
    }
  }

  return Array.from(mergedMap.values());
}

/**
 * Removes all citations for a specific study from the article and renumbers the remainder.
 */
export function removeCitationFromHtml(
  html: string,
  studyId: string,
  allStudies: ResearchStudy[]
): { updatedHtml: string; citedStudies: CitedStudyReference[]; success: boolean } {
  if (!html || !studyId) return { updatedHtml: html, citedStudies: [], success: false };

  const { bodyHtml } = splitBodyAndReferences(html);
  const regex = new RegExp(
    `<sup\\b[^>]*\\b(?:data-study-id|data-citation-study-id)=["']${escapeRegex(studyId)}["'][^>]*>.*?<\\/sup>`,
    'gi'
  );

  if (!regex.test(bodyHtml)) {
    return {
      updatedHtml: html,
      citedStudies: syncCitationsAndReferences(html, allStudies).citedStudies,
      success: false,
    };
  }

  const cleanedBody = bodyHtml.replace(regex, '');
  const syncResult = syncCitationsAndReferences(cleanedBody, allStudies);

  return {
    updatedHtml: syncResult.updatedHtml,
    citedStudies: syncResult.citedStudies,
    success: true,
  };
}

/**
 * Escapes HTML characters for safe insertion
 */
function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeRegex(str: string): string {
  return str.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');
}

