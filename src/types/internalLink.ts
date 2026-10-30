/**
 * Science of Gifts - Internal Linking System Types (Phase 4)
 * Editorial linking architecture to identify genuinely valuable linking opportunities.
 */

export type LinkDestinationType = 'article' | 'shop_guide' | 'product' | 'category' | 'other';

export interface InternalLink {
  id: string;
  title: string;
  url: string;
  topic: string;
  description: string;
  preferredAnchor?: string;
  notes?: string;
  category: string;
  destinationType?: LinkDestinationType;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _isDeleted?: boolean;
  deletedAt?: string;
}

export type LinkOpportunityStatus = 'pending' | 'accepted' | 'rejected' | 'stale';

export interface LinkOpportunity {
  id: string;
  linkId: string;
  linkTitle: string;
  linkUrl: string;
  destinationType?: LinkDestinationType;
  workflowType: 'match_existing' | 'revise_existing' | 'suggest_new';
  targetPassage: string; // The original sentence (for match/revise) OR the proposed sentence (for suggest_new)
  suggestedAnchor: string; // The exact phrase to link within the final sentence
  proposedText?: string; // The full revised sentence (for revise_existing)
  contextSentence?: string; // The existing sentence in the draft after which to insert (for suggest_new)
  readerBenefit: string; // Concise explanation of how this link provides value to a human reader
  relevanceRationale: string; // Deep editorial justification for why the destination belongs at this exact point
  confidence: 'high' | 'medium' | 'low';
  verificationNotes?: string; // Any uncertainty or factual details requiring human verification
  status: LinkOpportunityStatus;

  // Legacy fields for backward compatibility
  reason?: string; // Mapped to readerBenefit
  seoRationale?: string; // Mapped to relevanceRationale
  previewText?: string;
  minimalRevision?: string; // Mapped to proposedText
  relevance?: 'high' | 'medium'; // Mapped to confidence
}

export interface FindLinkOpportunitiesRequest {
  projectTitle: string;
  projectType: string;
  documentContent: string;
  availableLinks: {
    id: string;
    title: string;
    url: string;
    topic: string;
    description: string;
    preferredAnchor?: string;
    notes?: string;
    category: string;
    destinationType?: LinkDestinationType;
  }[];
  alreadyUsedUrls: string[];
}

export interface FindLinkOpportunitiesResponse {
  ok: boolean;
  opportunities: LinkOpportunity[];
  rationale?: string;
  error?: string;
}

export interface FetchedLinkMetadata {
  title?: string;
  description?: string;
  topic?: string;
  category?: string;
  destinationType?: LinkDestinationType;
  preferredAnchor?: string;
  notes?: string;
  canonicalUrl?: string;
  resolvedUrl?: string;
}

export interface FetchLinkMetadataRequest {
  url: string;
  existingCategories?: string[];
}

export interface FetchLinkMetadataResponse {
  ok: boolean;
  metadata?: FetchedLinkMetadata;
  error?: string;
}
