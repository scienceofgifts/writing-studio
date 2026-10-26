/**
 * Science of Gifts - Research Citation Studio Types
 * Provides data structures for in-text numbered citations, source verification,
 * and synchronized bibliographic reference lists.
 */

export type CitationConfidence = 'verified_empirical' | 'conceptual_support' | 'partial_limitation';
export type CitationStatus = 'pending' | 'accepted' | 'dismissed';

export type CitationWorkflowType = 'cite_existing' | 'draft_passage';

export type CitationEvidenceType =
  | 'direct_empirical'
  | 'author_interpretation'
  | 'background_context'
  | 'editorial_suggestion';

export type CitationVerificationStatus =
  | 'verified'
  | 'needs_review'
  | 'insufficient_evidence'
  | 'unmatched_passage'
  | 'ambiguous_passage';

export type DraftPassageStatus = 'none' | 'drafting' | 'proposed' | 'approved' | 'rejected';

export interface CitationRecommendation {
  id: string;
  studyId: string;
  studyTitle: string;
  authors: string[];
  publicationYear?: string | number;
  publication?: string;
  doi?: string;
  url?: string;
  sourceIdentifier?: string; // Resolved DOI URL, direct source URL, or explicit missing-link note
  workflowType?: CitationWorkflowType; // 'cite_existing' (Workflow A) or 'draft_passage' (Workflow B)
  targetPassage: string; // Verbatim sentence in the article (Workflow A), or empty for Workflow B
  targetSectionHeading?: string; // Suggested section heading for Workflow B passage insertion
  anchorPassageContext?: string; // Optional existing sentence/paragraph after which to insert Workflow B passage
  proposedCitationNumber: number; // Proposed reference number (1, 2, ...)
  relevantFinding: string; // Specific finding, result, or claim from the study
  supportingEvidence?: string; // Traceable evidence in the library record supporting this interpretation
  limitationsOrQualifications?: string; // Study limitations, caveats, or scope mismatch notes
  explanation: string; // Why this source supports the passage or where a drafted passage fits
  confidence: CitationConfidence;
  evidenceType?: CitationEvidenceType;
  isVerifiedMatch: boolean;
  verificationStatus?: CitationVerificationStatus;
  isInsertionReady?: boolean; // True ONLY if verified, unambiguous, and backed by library evidence
  verificationNote?: string;
  // Workflow B: Research-Backed Passage Drafting state
  proposedPassage?: string;
  draftStatus?: DraftPassageStatus;
  status: CitationStatus;
  createdAt: string;
}

export interface CitedStudyReference {
  citationNumber: number;
  studyId: string;
  title: string;
  authors: string[];
  publicationYear?: string | number;
  publication?: string;
  doi?: string;
  url?: string;
  formattedReference: string;
  occurrenceCount?: number;
}

export interface ResearchGap {
  claimInArticle: string;
  topicNeeded: string;
  suggestion: string;
}

export interface FindCitationsResponse {
  ok: boolean;
  recommendations: CitationRecommendation[];
  gaps?: ResearchGap[];
  rationale?: string;
  error?: string;
}

export interface DraftResearchPassageResponse {
  ok: boolean;
  proposedPassage: string;
  relevantFinding: string;
  supportingEvidence: string;
  limitationsOrQualifications?: string;
  explanation?: string;
  targetSectionHeading?: string;
  anchorPassageContext?: string;
  error?: string;
}

