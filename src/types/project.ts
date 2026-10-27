/**
 * Science of Gifts - Editorial Writing Studio
 * Shared Data Model & Types (Phase 2)
 */

import { LinkOpportunity } from './internalLink';
import {
  GiftProduct,
  GiftGuideMetadata,
  GuideFAQItem,
  GiftGuideSettings,
  ProductSectionFormat,
} from './giftGuide';

import { ModelId, AIRequestMetadata, AIActionType } from './models';
import { ProjectVersionSnapshot } from './versionHistory';

import { EditorialIdea } from './ideaGenerator';
import { CitationRecommendation, CitedStudyReference } from './citation';
export * from './giftGuide';
export * from './models';
export * from './versionHistory';
export * from './citation';

export type ProjectType = 'article' | 'gift_guide' | 'product_copy';

export type ProjectStatus = 'draft' | 'in_progress' | 'review' | 'complete';

export type ActivePanel =
  | 'brief'
  | 'outline'
  | 'controls'
  | 'rules'
  | 'instructions'
  | 'links'
  | 'citations'
  | 'review'
  | 'qc'
  | 'history'
  | 'research'
  | 'develop'
  | 'draft_package'
  | null;

export type ToneSetting =
  | 'editorial'
  | 'conversational'
  | 'informative'
  | 'sophisticated'
  | 'witty'
  | 'neutral';

export type DetailSetting = 'concise' | 'balanced' | 'detailed';

export type MarketingSetting = 'minimal' | 'moderate' | 'strong';

export type HistoricalSetting = 'none' | 'light' | 'moderate' | 'deep';

export type AudienceSetting = 'general' | 'enthusiast' | 'expert';

export interface WritingControls {
  tone: ToneSetting;
  detail: DetailSetting;
  marketing: MarketingSetting;
  historicalContext: HistoricalSetting;
  audience: AudienceSetting;
  wordCountTarget: string; // e.g. "1,200 - 1,500 words" or "1500"
}

// Alias for backwards compatibility
export type AISettings = WritingControls;

export interface ProjectBrief {
  purpose: string;
  audience: string;
  readerLearns: string;
  readerFeels: string;
  readerAction: string;
  keyPoints: string[];
  thingsToAvoid: string[];
}

export type OutlineStructureType = 'essay' | 'standard_article' | 'guide' | 'custom';

export interface OutlineItemInternalLink {
  id?: string;
  title: string;
  url: string;
  targetAnchor?: string;
  relevanceReason?: string;
}

export interface OutlineItem {
  id: string;
  title: string; // Step title or section label (e.g., "1. Opening Observation" or "The Physics of Heirloom Joinery")
  heading?: string; // Optional conventional H2/H3 heading (optional in Essay mode)
  description?: string; // Optional description
  purpose?: string; // Purpose: what this section/step establishes or achieves
  mainIdea?: string; // Main idea / intellectual argument of this part
  develops?: string; // What this part develops / progression in the argument
  assignedStudyIds?: string[]; // Research studies assigned to this section
  assignedClaims?: string[]; // Specific claims or empirical data points assigned
  assignedInternalLinks?: OutlineItemInternalLink[]; // Internal links recommended for this section
  notes?: string; // Important editorial notes, tone precautions, things to avoid
  completed?: boolean;
}

export interface OutlineProposal {
  items: OutlineItem[];
  rationale?: string;
  structureType?: OutlineStructureType;
}

export interface OutlineStudioMetadata {
  structureType: OutlineStructureType;
  customStructureNotes?: string;
  editorialRationale?: string;
  generatedAt?: string;
}

export interface ContentRule {
  id: string;
  rule: string;
  enabled: boolean;
  isCustom?: boolean;
}

export interface GlobalInstruction {
  id: string;
  text: string;
  category: 'style' | 'constraint' | 'voice' | 'factuality';
  enabled: boolean;
  updatedAt: string;
  _isDeleted?: boolean;
  deletedAt?: string;
}

export * from './giftGuide';

export interface ArticleAuthor {
  name: string;
  role?: string;
  bio?: string;
  email?: string;
}

export interface ArticleHeroImage {
  url: string;
  altText: string;
  caption?: string;
  credit?: string;
}

export interface ArticleRelatedContent {
  title: string;
  url: string;
  reason?: string;
}

export interface ArticleMetadata {
  slug: string;
  seoTitle: string;
  metaDescription: string;
  standfirst: string; // Deck / standfirst
  category?: string;
  author?: ArticleAuthor;
  heroImage?: ArticleHeroImage;
  targetKeyword: string;
  secondaryKeywords: string[];
  audience: string;
  searchIntent: string;
  tags?: string[];
  sources?: string[];
  relatedContent?: ArticleRelatedContent[];
  publishedAt?: string;
}

// =========================================================================
// EDITORIAL DEVELOPMENT WORKFLOW (Idea -> Angles -> Direction -> Brief)
// =========================================================================

export type AngleRole =
  | 'primary'
  | 'secondary'
  | 'brief_mention'
  | 'do_not_use'
  | 'unassigned';

export interface EditorialAngle {
  id: string;
  title: string;
  coreArgument: string;
  whyInteresting: string;
  whatArticleEmphasizes: string;
  possibleTakeaway: string;
  role: AngleRole;
}

export interface EditorialDirection {
  primaryAngleId?: string;
  secondaryAngleId?: string;
  briefMentionAngleIds: string[];
  doNotUseAngleIds: string[];
  editorsDirection: string;
}

export interface BriefReference {
  studyId?: string;
  title: string;
  authors: string[];
  publication?: string;
  publicationYear?: string;
  doiOrUrl?: string;
  isVerifiedMatch: boolean;
  verificationNote?: string;
}

export interface StructuredEditorialBrief {
  workingTitle: string;
  topic: string;
  audience: string;
  searchIntent: string;
  primaryAngle: string;
  secondaryFocus: string;
  briefMentions: string[];
  thingsToAvoid: string[];
  centralArgument: string;
  keyQuestions: string[];
  editorialDirection: string;
  suggestedTakeaway: string;
  factualContext: string[]; // Clearly distinguished factual / research findings
  editorialInterpretation: string[]; // Clearly distinguished editorial synthesis
  internalLinkOpportunities: string[];
  references?: BriefReference[];
  styleConsiderations?: string;
  generatedAt?: string;
  updatedAt?: string;
}

export interface EditorialDevelopment {
  originalIdea?: EditorialIdea;
  angles: EditorialAngle[];
  direction: EditorialDirection;
  brief?: StructuredEditorialBrief;
  status: 'idea' | 'angles_generated' | 'direction_set' | 'brief_ready' | 'outline_ready' | 'draft_package_ready';
  lastGeneratedAt?: string;
}

export interface ProductPositioning {
  whatMakesItInteresting?: string;
  whyWouldSomeoneWantIt?: string;
  suitedRecipient?: string;
  whatToEmphasize?: string;
  whatToAvoid?: string;
  keySellingAngle?: string;
  emotionalAngle?: string;
  historicalAngle?: string;
}

export interface ProductCopyVariants {
  formalEditorial?: string;
  emotionalStorytelling?: string;
  conciseConversion?: string;
  technicalHistorical?: string;
}

export interface ProductContextProfile {
  id: string;
  name: string;
  intendedRecipient: string;
  giftGuideOrOccasion: string;
  targetAudience: string;
  contextNotes: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
  _isDeleted?: boolean;
  deletedAt?: string;
}

export interface ProductMockupImage {
  id: string;
  name: string;
  mimeType: string;
  isPrimary: boolean;
  width?: number;
  height?: number;
  originalSizeBytes?: number;
  compressedSizeBytes?: number;
  contentHash?: string;
  addedAt: string;
  /**
   * Compressed data URL (e.g., data:image/webp;base64,... or data:image/jpeg;base64,...).
   * Stored in dedicated asset storage and stripped from historical snapshots.
   */
  dataUrl?: string;
}

export type FieldVerificationStatus =
  | 'verified_from_url'
  | 'unverified'
  | 'manual_entry'
  | 'not_available';

export interface ProductVerifiedFacts {
  sourceUrl?: string;
  canonicalUrl?: string;
  price?: string;
  materials?: string;
  dimensions?: string;
  colors?: string;
  features?: string;
  variants?: string;
  additionalSpecs?: string;
  verificationNotes?: string;
  unverifiedFields?: string[];
  fieldStatus?: Partial<
    Record<
      'price' | 'materials' | 'dimensions' | 'colors' | 'features' | 'variants',
      FieldVerificationStatus
    >
  >;
}

export interface ProductVisibleObservations {
  visibleText?: string;
  designAndImagery?: string;
  garmentOrObjectStyle?: string;
  visibleColors?: string;
  visualDetails?: string;
}

export interface ProductEditorialInferences {
  designConcept?: string;
  historicalOrCulturalContext?: string;
  recipientResonance?: string;
  editorialCaution?: string;
}

export interface ProductEpistemicAnalysis {
  analysisMode: 'url_only' | 'image_only' | 'url_and_image';
  analyzedAt: string;
  modelUsed?: string;
  verifiedFacts: ProductVerifiedFacts;
  visibleObservations: ProductVisibleObservations;
  editorialInferences: ProductEditorialInferences;
}

// =========================================================================
// STAGE 3: PRODUCT CREATIVE DIRECTION & EDITORIAL INTELLIGENCE SUITE
// =========================================================================

export type ProductAngleRole =
  | 'primary'
  | 'secondary'
  | 'do_not_use'
  | 'unassigned';

export type ProductBriefLengthPreset =
  | 'concise_fourthwall'
  | 'standard_editorial'
  | 'object_monograph';

export type ProductCopySectionId =
  | 'headline_and_standfirst'
  | 'editorial_description'
  | 'design_and_visual_details'
  | 'humor_and_cultural_context'
  | 'recipient_and_gift_rationale'
  | 'practical_use_and_suitability'
  | 'caveats_and_who_not_for'
  | 'technical_specifications';

export interface ProductBriefConfiguration {
  selectedSections?: ProductCopySectionId[];
  targetWordCount?: number;
  wordCountTolerancePercent?: number;
  headlineCountsTowardWordCount?: boolean;
  allowNarrativeSpecMention?: boolean;
}

export type ProductTitleRole =
  | 'product_page'
  | 'search_and_gift'
  | 'domain_specificity'
  | 'editorial_headline';

export interface ProductTitleOption {
  id: string;
  title: string;
  standfirst?: string;
  styleArchetype: string;
  titleRole?: ProductTitleRole;
  includesProductCategory?: boolean;
  searchIntent?: string;
  targetKeywords?: string[];
  intendedAppeal: string;
  rationale: string;
  strengths: string;
  weaknesses: string;
  isRecommended?: boolean;
}

export interface ProductPositioningAngleOption {
  id: string;
  title: string;
  archetype: string;
  coreHook: string;
  supportingEvidence: string;
  whatToEmphasize: string;
  risksAndWhatToAvoid: string;
  role: ProductAngleRole;
}

export interface ProductRecipientPersona {
  id: string;
  name: string;
  profileSummary: string;
  whyItResonates: string;
  contextOfUse: string;
}

export interface ProductSecondaryAudience {
  id: string;
  audience: string;
  whyItFits: string;
}

export interface ProductAudienceMismatch {
  id: string;
  whoShouldSkip: string;
  whyItMismatches: string;
  copyCaution: string;
}

export interface ProductAudienceAnalysis {
  primaryPersonas: ProductRecipientPersona[];
  secondaryAudiences: ProductSecondaryAudience[];
  buyerMotivations: string[];
  recipientPerspective: string;
  audienceMismatches: ProductAudienceMismatch[];
}

export interface ProductCreativeDirectionSuite {
  generatedAt: string;
  modelUsed?: string;
  editorCustomGuidance?: string;
  titleOptions: ProductTitleOption[];
  recommendedTitleId?: string;
  recommendedTitleRationale?: string;
  positioningAngles: ProductPositioningAngleOption[];
  audienceAnalysis: ProductAudienceAnalysis;
  editorialCautions: string[];
  // Explicit user selections (never auto-applied without user action)
  selectedPrimaryTitleId?: string;
  selectedPrimaryAngleId?: string;
  selectedSecondaryAngleIds?: string[];
  excludedAngleIds?: string[];
  selectedPersonaIds?: string[];
  appliedMismatchIds?: string[];
}

export interface ProductCopyMetadata {
  // Product Information (Structured Facts)
  productName: string;
  productType: string;
  productUrl: string;
  imageUrl?: string;
  rawProductInfo: string;
  designDescription?: string;
  designDetails?: string;
  designConcept?: string;
  historicalContext?: string;
  materials?: string;
  features?: string;
  dimensions?: string;
  colors?: string;
  intendedRecipient?: string;
  targetAudience?: string;
  productNotes?: string;
  additionalFacts?: string;

  // Stage 2: Context Profile, Mockup Images, and Epistemic Analysis
  contextProfileId?: string;
  giftGuideOrOccasion?: string;
  contextNotes?: string;
  price?: string;
  variantsSpec?: string;
  mockupImages?: ProductMockupImage[];
  epistemicAnalysis?: ProductEpistemicAnalysis;
  lastAnalyzedAt?: string;

  // Stage 3: Coordinated Creative Direction & Brief Configuration
  creativeDirection?: ProductCreativeDirectionSuite;
  briefLengthPreset?: ProductBriefLengthPreset;
  briefConfig?: ProductBriefConfiguration;

  // Product Positioning
  positioning?: ProductPositioning;

  // Dedicated Generated Copy Fields
  productTitle?: string;
  headline?: string;
  standfirst?: string;
  description?: string;
  bestFor?: string;
  keyFeaturesBullets?: string[];
  historicalAngleCopy?: string;
  materialsCraftNote?: string;
  callToAction?: string;
  shortCopySocial?: string;
  ecommerceBullets?: string[];

  // Multi-Variant Copy
  variants?: ProductCopyVariants;

  // SEO Metadata
  slug?: string;
  seoTitle?: string;
  metaDescription?: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
}

export type ReviewCategory =
  | 'ai_language'
  | 'repetition'
  | 'clarity'
  | 'flow'
  | 'tone_style'
  | 'content_rules'
  | 'unsupported_claims'
  | 'seo'
  | 'internal_links';

export type ReviewMode =
  | 'full'
  | 'overall'
  | 'style'
  | 'clarity_flow'
  | 'repetition'
  | 'ai_language'
  | 'unsupported_claims'
  | 'seo'
  | 'rules';

export type ReviewScope = 'all' | 'selection' | 'section';

export type ReviewSeverity = 'critical' | 'important' | 'minor' | 'suggestion';

export type ReviewFindingStatus = 'pending' | 'accepted' | 'rejected' | 'stale';

export type ReviewFindingLocationType =
  | 'paragraph'
  | 'sentence'
  | 'heading'
  | 'product_section'
  | 'field'
  | 'document';

export interface ReviewFindingLocation {
  type: ReviewFindingLocationType;
  description?: string;
  targetOutlineId?: string;
  productId?: string;
  field?: string;
}

export interface ReviewFinding {
  id: string;
  category: ReviewCategory;
  severity: ReviewSeverity;
  location: ReviewFindingLocation;
  originalText?: string;
  explanation: string;
  suggestedAction: string;
  proposedText?: string;
  status: ReviewFindingStatus;
  ruleId?: string;
  isRuleViolation?: boolean;
  createdAt?: string;
}

export interface EditorialReviewResult {
  id: string;
  reviewedAt: string;
  scope: ReviewScope;
  selectedText?: string;
  targetSectionId?: string;
  mode: ReviewMode;
  qualitativeSummary: string;
  counts: {
    critical: number;
    important: number;
    minor: number;
    suggestion: number;
  };
  findings: ReviewFinding[];
}

export type QCOverallStatus = 'ready' | 'warning' | 'action_required';

export type QCSeverity = 'critical' | 'warning' | 'suggestion';

export type QCCategory =
  | 'completeness'
  | 'outline'
  | 'word_count'
  | 'content_rules'
  | 'em_dash'
  | 'forbidden_phrases'
  | 'ai_patterns'
  | 'repetition'
  | 'factual_consistency'
  | 'product_data'
  | 'seo'
  | 'urls'
  | 'links'
  | 'style_profile';

export type QCCheckStatus = 'passed' | 'warning' | 'failed' | 'not_applicable';

export interface QCCategoryCheck {
  category: QCCategory;
  label: string;
  status: QCCheckStatus;
  message: string;
  issueCount: number;
}

export interface QCFinding {
  id: string;
  category: QCCategory;
  severity: QCSeverity;
  title: string;
  location: string;
  explanation: string;
  suggestedAction?: string;
  targetText?: string;
  proposedText?: string;
  isFactualContradiction?: boolean;
  isFactualUnsupported?: boolean;
  isRuleViolation?: boolean;
  isStale?: boolean;
}

export interface QCResult {
  id: string;
  runAt: string;
  documentLengthAtRun: number;
  status: QCOverallStatus;
  summary: string;
  counts: {
    critical: number;
    warning: number;
    suggestion: number;
  };
  categoryChecks: QCCategoryCheck[];
  findings: QCFinding[];
  isStale?: boolean;
}

export type EditingNoteAnchorStatus = 'resolved' | 'ambiguous' | 'unresolved';

export type EditingNoteInputMethod = 'voice' | 'text';

export interface ArticleEditingNote {
  id: string;
  projectId: string;
  quotedText: string; // Exact selected passage text
  paragraphContext: string; // Surrounding paragraph / block text
  headingContext?: string; // Nearest preceding section heading if available
  prefixContext: string; // Preceding characters for disambiguation
  suffixContext: string; // Following characters for disambiguation
  from: number; // ProseMirror document start position
  to: number; // ProseMirror document end position
  instruction: string; // Confirmed editing instruction
  rawTranscript?: string; // Original raw transcript if created via voice
  inputMethod: EditingNoteInputMethod;
  anchorStatus: EditingNoteAnchorStatus;
  createdAt: string;
  updatedAt: string;
}

export type ProjectSaveStatus =
  | 'unsaved'
  | 'saving_local'
  | 'saved_local'
  | 'saving_cloud'
  | 'saved_cloud'
  | 'cloud_save_failed'
  | 'conflict';

export interface ProjectConflictInfo {
  projectId: string;
  localProject: WritingProject;
  remoteProject: WritingProject;
  baseRevision: number;
  remoteRevision: number;
  detectedAt: string;
  reason: string;
}

export interface WritingProject {
  id: string;
  type: ProjectType;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: ProjectStatus;
  content: string; // Structured rich-text HTML representation
  projectInstructions: string;
  brief: ProjectBrief;
  outline: OutlineItem[];
  contentRules: ContentRule[];
  writingControls: WritingControls;
  aiSettings: WritingControls; // Kept in sync for backward compatibility
  styleProfileId?: string; // Optional applied Style Profile ID (Phase 3)
  linkOpportunities?: LinkOpportunity[]; // Editorial internal link recommendations (Phase 4)
  editorialReview?: EditorialReviewResult; // AI Editorial Review findings (Phase 7)
  qualityControl?: QCResult; // Quality Control verification result (Phase 8)
  modelOverride?: ModelId; // Project-level AI model override (Phase 9)
  versionHistory?: ProjectVersionSnapshot[]; // Full structured version history (Phase 9)
  lastAIRequest?: AIRequestMetadata; // Request transparency metadata (Phase 9)
  articleMeta?: ArticleMetadata;
  giftGuideMeta?: GiftGuideMetadata;
  productCopyMeta?: ProductCopyMetadata;
  attachedStudyIds?: string[]; // Attached research studies for this project
  selectedClaimIds?: string[]; // Specifically chosen claims for editorial use
  citationRecommendations?: CitationRecommendation[]; // Research citation recommendations
  citedStudies?: CitedStudyReference[]; // Sources currently cited in the article text with active numbering
  originatingIdeaId?: string; // ID of the originating idea from Idea Generator or Research Library
  editorialDevelopment?: EditorialDevelopment; // Editorial development workflow (Idea -> Angles -> Direction -> Brief)
  outlineStructure?: OutlineStructureType; // Applied structure type (essay, standard_article, guide, custom)
  outlineRationale?: string; // Editorial rationale for this outline progression
  outlineMetadata?: OutlineStudioMetadata; // Additional Outline Studio metadata
  editingNotes?: ArticleEditingNote[]; // Anchored voice & written editing notes (separate from article HTML)
  cloudRevision?: number; // Server-grounded revision number (1, 2, 3...)
  baseCloudRevision?: number; // Cloud revision this local state was based on (0 if never synced)
  hasUnsyncedLocalSave?: boolean; // True when explicitly saved locally while signed out or cloud save failed
  lastSyncedAt?: string;
  lastSyncedByUid?: string;
  _isDeleted?: boolean;
  deletedAt?: string;
}

export interface DiffProposal {
  id: string;
  scopeDescription: string;
  actionLabel?: string;
  targetText: string;
  proposedText: string;
  explanation: string;
  modelUsed?: ModelId;
  range?: {
    start: number;
    end: number;
  };
  mode?: 'replace_selection' | 'insert' | 'replace_all';
}

export interface AIActionRequest {
  action: string;
  actionType?: AIActionType;
  modelOverride?: ModelId;
  projectType: ProjectType;
  projectTitle: string;
  currentContent: string;
  selectedText?: string;
  scope: 'selection' | 'paragraph' | 'section' | 'all';
  customCommand?: string;
  globalInstructions: string[];
  projectInstructions: string;
  brief?: ProjectBrief;
  outline?: OutlineItem[];
  contentRules?: string[];
  writingControls?: WritingControls;
  aiSettings?: WritingControls;
  styleProfileId?: string;
  styleProfileName?: string;
  styleProfileInstructions?: string[];
  metadata?: Record<string, any>;
  relevantProduct?: GiftProduct | Partial<ProductCopyMetadata>;
  targetOutlineItem?: OutlineItem;
}
