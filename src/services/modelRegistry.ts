/**
 * Science of Gifts - Central Model Registry (Phase 9)
 * Single source of truth for all Gemini models, recommendations, and capability metadata.
 */

import { ModelId, ModelDefinition, AIActionType } from '../types/models';

export const DEFAULT_GLOBAL_MODEL_ID: ModelId = 'gemini-3.8-flash';

export const MODEL_REGISTRY: Record<ModelId, ModelDefinition> = {
  'gemini-3.8-flash': {
    id: 'gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    tagline: 'Flagship Editorial Model',
    description: 'Best for nuanced, human-sounding editorial prose, style matching, deep narrative coherence, and exhaustive editorial critique.',
    tier: 'Flagship Editorial',
    recommendedFor: [
      'article_generation',
      'editorial_review',
      'quality_control',
      'short_rewrite',
    ],
    recommendedUseNotes: 'Full article generation, major rewrites, editorial critique, comprehensive QC audits.',
    capabilities: {
      contextWindowTokens: 1048576,
      maxOutputTokens: 8192,
      supportsStructuredJson: true,
      supportsSystemInstructions: true,
      supportsMultimodal: true,
      speedRating: 'thorough',
      editorialStrength: 'flagship',
    },
    isDefault: true,
  },
  'gemini-3.7-flash': {
    id: 'gemini-3.7-flash',
    displayName: 'Gemini 3.7 Flash',
    tagline: 'High-Precision Reasoning & Product Copy',
    description: 'Outstanding technical reasoning, factual grounding, and structured product specification synthesis.',
    tier: 'Precision Reasoning',
    recommendedFor: [
      'product_copy',
      'quality_control',
      'editorial_review',
    ],
    recommendedUseNotes: 'Product Copy Studio, multi-variant marketing angles, factual consistency auditing.',
    capabilities: {
      contextWindowTokens: 1048576,
      maxOutputTokens: 8192,
      supportsStructuredJson: true,
      supportsSystemInstructions: true,
      supportsMultimodal: true,
      speedRating: 'thorough',
      editorialStrength: 'very-high',
    },
  },
  'gemini-3.6-flash': {
    id: 'gemini-3.6-flash',
    displayName: 'Gemini 3.6 Flash',
    tagline: 'Balanced Structure & Outline Architecture',
    description: 'Exceptional structural analysis, narrative outlines, and relationship mapping between internal articles and links.',
    tier: 'Balanced Structure',
    recommendedFor: [
      'outline_generation',
      'idea_generation',
      'internal_link_analysis',
    ],
    recommendedUseNotes: 'Content outlines, editorial link opportunity discovery, structural reorganizations.',
    capabilities: {
      contextWindowTokens: 1048576,
      maxOutputTokens: 8192,
      supportsStructuredJson: true,
      supportsSystemInstructions: true,
      supportsMultimodal: true,
      speedRating: 'balanced',
      editorialStrength: 'very-high',
    },
  },
  'gemini-3.5-flash': {
    id: 'gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    tagline: 'Fast Versatile Generation',
    description: 'Speedy, high-quality generation for sections, paragraph expansion, and stylistic transformations.',
    tier: 'Fast Versatile',
    recommendedFor: [
      'short_rewrite',
      'simple_transformation',
      'custom_command',
    ],
    recommendedUseNotes: 'Drafting sub-sections, tone adjusting, fast interactive commands.',
    capabilities: {
      contextWindowTokens: 1048576,
      maxOutputTokens: 8192,
      supportsStructuredJson: true,
      supportsSystemInstructions: true,
      supportsMultimodal: true,
      speedRating: 'fast',
      editorialStrength: 'high',
    },
  },
  'gemini-3.5-flash-lite': {
    id: 'gemini-3.5-flash-lite',
    displayName: 'Gemini 3.5 Flash Lite',
    tagline: 'High-Throughput & Routine Metadata',
    description: 'Optimized for lightweight, instant transformations, SEO meta titles, descriptions, and alt tags.',
    tier: 'High-Throughput',
    recommendedFor: [
      'seo_metadata',
      'alt_text',
      'short_rewrite',
      'simple_transformation',
    ],
    recommendedUseNotes: 'SEO titles, meta descriptions, image alt tags, quick sentence rewording.',
    capabilities: {
      contextWindowTokens: 1048576,
      maxOutputTokens: 8192,
      supportsStructuredJson: true,
      supportsSystemInstructions: true,
      supportsMultimodal: true,
      speedRating: 'ultra-fast',
      editorialStrength: 'high',
    },
  },
  'gemini-3.1-flash-lite': {
    id: 'gemini-3.1-flash-lite',
    displayName: 'Gemini 3.1 Flash Lite',
    tagline: 'Ultra-Fast Simple Transformations',
    description: 'Sub-second response time for straightforward punctuation fixes, text extraction, and formatting.',
    tier: 'Ultra-Fast',
    recommendedFor: [
      'simple_transformation',
      'alt_text',
    ],
    recommendedUseNotes: 'Simple grammar passes, headline capitalization, minor microcopy cleanups.',
    capabilities: {
      contextWindowTokens: 1048576,
      maxOutputTokens: 8192,
      supportsStructuredJson: true,
      supportsSystemInstructions: true,
      supportsMultimodal: true,
      speedRating: 'ultra-fast',
      editorialStrength: 'high',
    },
  },
};

export const ALL_MODELS: ModelDefinition[] = Object.values(MODEL_REGISTRY);

/**
 * Gets the recommended model for a specific AI action
 */
export function getRecommendedModelForAction(actionType: AIActionType): ModelDefinition {
  switch (actionType) {
    case 'article_generation':
    case 'editorial_review':
      return MODEL_REGISTRY['gemini-3.8-flash'];
    case 'quality_control':
    case 'product_copy':
      return MODEL_REGISTRY['gemini-3.7-flash'];
    case 'outline_generation':
    case 'internal_link_analysis':
      return MODEL_REGISTRY['gemini-3.6-flash'];
    case 'seo_metadata':
    case 'alt_text':
    case 'short_rewrite':
      return MODEL_REGISTRY['gemini-3.5-flash-lite'];
    case 'simple_transformation':
      return MODEL_REGISTRY['gemini-3.1-flash-lite'];
    case 'custom_command':
    default:
      return MODEL_REGISTRY['gemini-3.8-flash'];
  }
}

/**
 * Resolves the effective model ID to use based on precedence:
 * 1. Explicit Action Override (if provided)
 * 2. Project-Level Model Override (if set on project)
 * 3. Global Default Model (from Settings/Storage)
 * 4. Fallback Default (Gemini 3.8 Flash)
 */
export function resolveEffectiveModelId(params: {
  actionOverride?: ModelId;
  projectOverride?: ModelId;
  globalDefault?: ModelId;
}): ModelId {
  if (params.actionOverride && MODEL_REGISTRY[params.actionOverride]) {
    return params.actionOverride;
  }
  if (params.projectOverride && MODEL_REGISTRY[params.projectOverride]) {
    return params.projectOverride;
  }
  if (params.globalDefault && MODEL_REGISTRY[params.globalDefault]) {
    return params.globalDefault;
  }
  return DEFAULT_GLOBAL_MODEL_ID;
}

export function getModelDefinition(modelId?: string): ModelDefinition {
  if (modelId && modelId in MODEL_REGISTRY) {
    return MODEL_REGISTRY[modelId as ModelId];
  }
  return MODEL_REGISTRY[DEFAULT_GLOBAL_MODEL_ID];
}
