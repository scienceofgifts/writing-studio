/**
 * Science of Gifts - Central Model Registry & Model Management Types (Phase 9)
 */

export type ModelId =
  | 'gemini-3.8-flash'
  | 'gemini-3.7-flash'
  | 'gemini-3.6-flash'
  | 'gemini-3.5-flash'
  | 'gemini-3.5-flash-lite'
  | 'gemini-3.1-flash-lite';

export type AIActionType =
  | 'article_generation'
  | 'editorial_review'
  | 'quality_control'
  | 'product_copy'
  | 'outline_generation'
  | 'idea_generation'
  | 'internal_link_analysis'
  | 'seo_metadata'
  | 'alt_text'
  | 'short_rewrite'
  | 'simple_transformation'
  | 'custom_command';

export interface ModelCapabilities {
  contextWindowTokens: number;
  maxOutputTokens: number;
  supportsStructuredJson: boolean;
  supportsSystemInstructions: boolean;
  supportsMultimodal: boolean;
  speedRating: 'ultra-fast' | 'fast' | 'balanced' | 'thorough';
  editorialStrength: 'high' | 'very-high' | 'flagship';
}

export interface ModelDefinition {
  id: ModelId;
  displayName: string;
  tagline: string;
  description: string;
  tier: 'Flagship Editorial' | 'Precision Reasoning' | 'Balanced Structure' | 'Fast Versatile' | 'High-Throughput' | 'Ultra-Fast';
  recommendedFor: AIActionType[];
  recommendedUseNotes: string;
  capabilities: ModelCapabilities;
  isDefault?: boolean;
}

export interface AIRequestMetadata {
  id: string;
  modelUsed: ModelId;
  modelDisplayName: string;
  action: string;
  actionType: AIActionType;
  timestamp: string;
  durationMs?: number;
  status: 'completed' | 'failed' | 'fallback_offered';
  errorMessage?: string;
}
