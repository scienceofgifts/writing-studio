/**
 * Science of Gifts - Internal Linking System Types (Phase 4)
 * Editorial linking architecture to identify genuinely valuable linking opportunities.
 */

export interface InternalLink {
  id: string;
  title: string;
  url: string;
  topic: string;
  description: string;
  preferredAnchor?: string;
  notes?: string;
  category: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type LinkOpportunityStatus = 'pending' | 'accepted' | 'rejected' | 'stale';

export interface LinkOpportunity {
  id: string;
  linkId: string;
  linkTitle: string;
  linkUrl: string;
  targetPassage: string; // The surrounding sentence or clause in the text
  suggestedAnchor: string; // The natural phrase within the passage to link
  reason: string; // Editorial justification for why this link helps the reader
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
    category: string;
  }[];
  alreadyUsedUrls: string[];
}

export interface FindLinkOpportunitiesResponse {
  ok: boolean;
  opportunities: LinkOpportunity[];
  rationale?: string;
  error?: string;
}
