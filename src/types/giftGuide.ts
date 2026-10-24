/**
 * Science of Gifts - Gift Guide Studio Types (Phase 5)
 * Structured product inventories, guide-wide context, and editorial sections.
 */

export interface GiftProduct {
  id: string;
  name: string;
  url: string;
  imageUrl?: string;
  summary?: string;
  productType?: string;
  historicalContext?: string;
  materialDetails?: string;
  designDetails?: string;
  whyItFits?: string;
  bestFor?: string;
  buyerConsiderations?: string;
  notes?: string;
  productInstructions?: string;
  generatedCopy?: string;
  rawInfo?: string;
}

export interface FetchedProductMetadata {
  name?: string;
  productType?: string;
  url?: string;
  canonicalUrl?: string;
  summary?: string;
  materialDetails?: string;
  historicalContext?: string;
  designDetails?: string;
  whyItFits?: string;
  bestFor?: string;
  buyerConsiderations?: string;
  productInstructions?: string;
  rawInfo?: string;
  imageUrl?: string;
  resolvedUrl?: string;
}

export interface FetchProductMetadataRequest {
  url: string;
  guideTopic?: string;
  guideAudience?: string;
}

export interface FetchProductMetadataResponse {
  ok: boolean;
  metadata?: FetchedProductMetadata;
  error?: string;
}

export interface GuideFAQItem {
  id: string;
  question: string;
  answer: string;
}

export type ProductSectionFormat =
  | 'standard' // Heading -> Editorial Description -> Why It Fits -> Best For
  | 'craft_focus' // Heading -> Materials & Craft -> Editorial Description -> Best For
  | 'historical_focus' // Heading -> Historical Context -> Editorial Description -> Buyer Advice
  | 'concise'; // Heading -> Crisp Description & Best For

export interface GiftGuideSettings {
  sectionFormat: ProductSectionFormat;
  showBestFor: boolean;
  showBuyerAdvice: boolean;
  showFaq: boolean;
  showConclusion: boolean;
  numberProducts: boolean;
  includeCollectionLink: boolean;
  desiredSectionLength: string; // e.g. "120 - 150 words"
}

export interface GiftGuideMetadata {
  slug: string;
  seoTitle: string;
  metaDescription: string;
  standfirst: string;
  primaryTopic: string;
  searchIntent: string;
  audience: string;
  occasionOrNiche: string;
  collectionUrl: string;
  desiredWordCount: string;
  additionalInstructions: string;
  targetKeyword: string;
  settings: GiftGuideSettings;
  products: GiftProduct[];
  buyerAdvice: string;
  faqList: GuideFAQItem[];
  faq: string;
  conclusion: string;
}

export const DEFAULT_GUIDE_SETTINGS: GiftGuideSettings = {
  sectionFormat: 'standard',
  showBestFor: true,
  showBuyerAdvice: true,
  showFaq: true,
  showConclusion: true,
  numberProducts: true,
  includeCollectionLink: true,
  desiredSectionLength: '120 - 160 words',
};

export const DEFAULT_GIFT_GUIDE_METADATA: GiftGuideMetadata = {
  slug: '',
  seoTitle: '',
  metaDescription: '',
  standfirst: '',
  primaryTopic: '',
  searchIntent: '',
  audience: 'Curious gift seekers and discerning enthusiasts',
  occasionOrNiche: '',
  collectionUrl: '',
  desiredWordCount: '1,500 - 2,000 words',
  additionalInstructions: '',
  targetKeyword: '',
  settings: DEFAULT_GUIDE_SETTINGS,
  products: [],
  buyerAdvice: '',
  faqList: [],
  faq: '',
  conclusion: '',
};
