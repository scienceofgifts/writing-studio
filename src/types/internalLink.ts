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
  targetPassage: string; // The surrounding sentence or clause in the text
  suggestedAnchor: string; // The natural phrase within the passage to link
  reason: string; // Editorial justification for why this link helps the reader
  seoRationale?: string; // SEO rationale / search intent match / commercial relevance
  previewText?: string; // Preview of sentence with anchor inserted
  minimalRevision?: string; // Optional suggested minimal revision for review
  relevance?: 'high' | 'medium';
  status: LinkOpportunityStatus;
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
