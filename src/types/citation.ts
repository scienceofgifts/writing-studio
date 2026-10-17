/**
 * Science of Gifts - Research Citation Studio Types
 * Provides data structures for in-text numbered citations, source verification,
 * and synchronized bibliographic reference lists.
 */

export type CitationConfidence = 'verified_empirical' | 'conceptual_support' | 'partial_limitation';
export type CitationStatus = 'pending' | 'accepted' | 'dismissed';

export interface CitationRecommendation {
  id: string;
  studyId: string;
  studyTitle: string;
  authors: string[];
  publicationYear?: string | number;
  publication?: string;
  doi?: string;
  url?: string;
  targetPassage: string; // The verbatim claim or sentence in the article that receives the citation
  proposedCitationNumber: number; // Proposed reference number (1, 2, ...)
  relevantFinding: string; // The empirical finding from the study supporting this claim
  explanation: string; // Why this source is relevant and directly supports the sentence
  confidence: CitationConfidence;
  isVerifiedMatch: boolean;
  verificationNote?: string;
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
