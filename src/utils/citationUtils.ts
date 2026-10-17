/**
 * Science of Gifts - Research Citation & Reference List Utilities
 * Handles numbered in-text superscript citations, scholarly APA bibliographic formatting,
 * and automatic synchronization of the end-of-article Reference list.
 */

import { ResearchStudy } from '../types/research';
import { CitationRecommendation, CitedStudyReference } from '../types/citation';

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

/**
 * Formats a study into a clean, complete APA-style bibliographic reference HTML.
 * Never fabricates missing fields.
 */
export function formatBibliographicReference(
  study: ResearchStudy | Partial<ResearchStudy> | any
): string {
  const authorStr = formatAuthorsBibliographic(study.authors);
  const yearStr = study.publicationYear ? `(${study.publicationYear}).` : `(n.d.).`;
  const cleanTitle = (study.title || 'Untitled Research Study').trim().replace(/\.$/, '');
  const publicationStr = study.publication || study.sourceOrPublisher;

  let ref = `<span class="ref-authors font-semibold">${escapeHtml(authorStr)}</span> ${escapeHtml(yearStr)} <span class="ref-title italic font-editorial">${escapeHtml(cleanTitle)}</span>.`;

  if (publicationStr) {
    ref += ` <span class="ref-publication">${escapeHtml(publicationStr)}</span>.`;
  }

  // Add DOI or Source URL link if verified and present
  const rawDoi = study.doi || (study.doiOrUrl && study.doiOrUrl.includes('10.') ? study.doiOrUrl : '');
  const cleanDoi = rawDoi ? rawDoi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim() : '';

  if (cleanDoi) {
    const doiUrl = `https://doi.org/${cleanDoi}`;
    ref += ` <a href="${doiUrl}" target="_blank" rel="noopener noreferrer" class="ref-link text-blue-700 hover:text-blue-900 underline font-mono text-[11px] break-all">${escapeHtml(doiUrl)}</a>`;
  } else if (study.sourceUrl || study.url || study.doiOrUrl) {
    const targetUrl = (study.sourceUrl || study.url || study.doiOrUrl || '').trim();
    if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
      ref += ` <a href="${targetUrl}" target="_blank" rel="noopener noreferrer" class="ref-link text-blue-700 hover:text-blue-900 underline font-mono text-[11px] break-all">${escapeHtml(targetUrl)}</a>`;
    }
  }

  return ref;
}

/**
 * Plain text format for Markdown and plain text export
 */
export function formatPlainReference(study: ResearchStudy | Partial<ResearchStudy> | any): string {
  const authorStr = formatAuthorsBibliographic(study.authors);
  const yearStr = study.publicationYear ? `(${study.publicationYear}).` : `(n.d.).`;
  const cleanTitle = (study.title || 'Untitled Research Study').trim().replace(/\.$/, '');
  const publicationStr = study.publication || study.sourceOrPublisher;

  let ref = `${authorStr} ${yearStr} ${cleanTitle}.`;
  if (publicationStr) {
    ref += ` ${publicationStr}.`;
  }

  const rawDoi = study.doi || (study.doiOrUrl && study.doiOrUrl.includes('10.') ? study.doiOrUrl : '');
  const cleanDoi = rawDoi ? rawDoi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim() : '';

  if (cleanDoi) {
    ref += ` https://doi.org/${cleanDoi}`;
  } else if (study.sourceUrl || study.url || study.doiOrUrl) {
    const targetUrl = (study.sourceUrl || study.url || study.doiOrUrl || '').trim();
    if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
      ref += ` ${targetUrl}`;
    }
  }

  return ref;
}

/**
 * Separates article body content from the references section if one already exists.
 */
export function splitBodyAndReferences(html: string): { bodyHtml: string; referencesSectionHtml: string } {
  if (!html) return { bodyHtml: '', referencesSectionHtml: '' };

  // Match existing <section ... data-references-section ...> or <h2 ...>References</h2>
  const sectionMatch = html.match(/<section[^>]*data-references-section[^>]*>[\s\S]*?<\/section>/i);
  if (sectionMatch && sectionMatch.index !== undefined) {
    return {
      bodyHtml: html.slice(0, sectionMatch.index).trim(),
      referencesSectionHtml: sectionMatch[0],
    };
  }

  // Fallback match: <h2>References</h2> at the end
  const h2Match = html.match(/<h2[^>]*>\s*References\s*<\/h2>[\s\S]*$/i);
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

  // Match citation markers: <sup ... data-study-id="xyz" ...>N</sup>
  const citationRegex = /<sup\b[^>]*\bdata-study-id=["']([^"']+)["'][^>]*>(.*?)<\/sup>/gi;
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
  const citationRegex = /<sup\b[^>]*\bdata-study-id=["']([^"']+)["'][^>]*>(.*?)<\/sup>/gi;
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
  let updatedBody = bodyHtml.replace(
    /<sup\b([^>]*\bdata-study-id=["']([^"']+)["'][^>]*)>(.*?)<\/sup>/gi,
    (_full, attrs, studyId) => {
      const assignedNum = studyIdToNumber.get(studyId) || 1;
      // Preserve data attributes and styling
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
    const doi = study?.doi;
    const url = study?.sourceUrl || study?.doiOrUrl;

    return {
      citationNumber: num,
      studyId,
      title,
      authors,
      publicationYear,
      publication,
      doi,
      url,
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
    // If no citations are present, return body without reference section
    return {
      updatedHtml: updatedBody.trim(),
      citedStudies: [],
      totalInTextCitations: 0,
    };
  }

  // Construct styled References section
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

/**
 * Inserts a numbered citation into an article's HTML at the specified target passage.
 * Places the superscript before trailing punctuation (e.g. "claim<sup>1</sup>.")
 */
export function insertCitationIntoHtml(
  html: string,
  recommendation: CitationRecommendation,
  allStudies: ResearchStudy[]
): { updatedHtml: string; success: boolean; citationNumber: number } {
  if (!html || !recommendation || !recommendation.studyId) {
    return { updatedHtml: html, success: false, citationNumber: 0 };
  }

  const { bodyHtml } = splitBodyAndReferences(html);
  const targetPassage = (recommendation.targetPassage || '').trim();

  if (!targetPassage) {
    return { updatedHtml: html, success: false, citationNumber: 0 };
  }

  // Pre-calculate what citation number this study will receive
  const existingCitations = extractCitationsFromHtml(bodyHtml);
  let assignedNum = 1;
  const existingForStudy = existingCitations.find((c) => c.studyId === recommendation.studyId);
  if (existingForStudy) {
    assignedNum = existingForStudy.currentNumber;
  } else {
    const uniqueStudies = new Set(existingCitations.map((c) => c.studyId));
    assignedNum = uniqueStudies.size + 1;
  }

  const citationMarker = `<sup class="citation-ref text-[11px] font-semibold text-amber-900 select-none cursor-pointer" data-study-id="${escapeHtml(recommendation.studyId)}">${assignedNum}</sup>`;

  // Helper to place citation before final punctuation if sentence ends with . ! ?
  const addCitationBeforePunctuation = (sentence: string): string => {
    const trimmed = sentence.trim();
    // Don't add if already has citation marker for this study
    if (trimmed.includes(`data-study-id="${recommendation.studyId}"`)) {
      return trimmed;
    }

    const punctMatch = trimmed.match(/([.!?]+)(["']?)$/);
    if (punctMatch && punctMatch.index !== undefined) {
      const beforePunct = trimmed.slice(0, punctMatch.index);
      const punct = punctMatch[0];
      return `${beforePunct}${citationMarker}${punct}`;
    }
    return `${trimmed}${citationMarker}`;
  };

  let newBody = bodyHtml;
  let applied = false;

  // Strategy 1: Exact passage match
  if (newBody.includes(targetPassage)) {
    const citedPassage = addCitationBeforePunctuation(targetPassage);
    newBody = newBody.replace(targetPassage, citedPassage);
    applied = true;
  } else {
    // Strategy 2: Fuzzy sentence match (ignoring small whitespace differences)
    const normalizedTarget = targetPassage.replace(/\s+/g, ' ').toLowerCase();
    const cleanBodyText = newBody.replace(/<[^>]+>/g, ' ');

    if (cleanBodyText.toLowerCase().includes(normalizedTarget.slice(0, 40))) {
      // Find sentence or clause matching target
      const sentences = newBody.match(/[^<>.!?]+[.!?]+/g) || [];
      for (const sent of sentences) {
        const cleanSent = sent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        if (cleanSent.includes(normalizedTarget.slice(0, 30)) || normalizedTarget.includes(cleanSent.slice(0, 30))) {
          const citedSent = addCitationBeforePunctuation(sent);
          newBody = newBody.replace(sent, citedSent);
          applied = true;
          break;
        }
      }
    }
  }

  if (!applied) {
    // Strategy 3: Append before the last closing </p> in the article if passage cannot be mapped literally
    const lastPIndex = newBody.lastIndexOf('</p>');
    if (lastPIndex !== -1) {
      newBody = `${newBody.slice(0, lastPIndex)} ${citationMarker}${newBody.slice(lastPIndex)}`;
      applied = true;
    }
  }

  // Now synchronize all citation numbers and the Reference list
  const syncResult = syncCitationsAndReferences(newBody, allStudies);

  return {
    updatedHtml: syncResult.updatedHtml,
    success: applied,
    citationNumber: assignedNum,
  };
}

/**
 * Removes all citations for a specific study from the article and renumbers the remainder.
 */
export function removeCitationFromHtml(
  html: string,
  studyId: string,
  allStudies: ResearchStudy[]
): { updatedHtml: string; success: boolean } {
  if (!html || !studyId) return { updatedHtml: html, success: false };

  const { bodyHtml } = splitBodyAndReferences(html);
  const regex = new RegExp(
    `<sup\\b[^>]*\\bdata-study-id=["']${escapeRegex(studyId)}["'][^>]*>.*?<\\/sup>`,
    'gi'
  );

  if (!regex.test(bodyHtml)) {
    return { updatedHtml: html, success: false };
  }

  const cleanedBody = bodyHtml.replace(regex, '');
  const syncResult = syncCitationsAndReferences(cleanedBody, allStudies);

  return {
    updatedHtml: syncResult.updatedHtml,
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
