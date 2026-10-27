/**
 * Science of Gifts - Product Copy Studio (Stage 2: Product Input, Context Profiles, and Epistemic Analysis)
 * Organizes Product Copy into four clear workflow sections:
 * 1. Product Setup — saved context profiles, mockup image upload & compression, optional URL, and 3 editable epistemic sections (Verified Facts, Visible Observations, Editorial Inferences)
 * 2. Editorial Direction — positioning and creative-angle fields
 * 3. Writing Brief — structured copy fields, external writing prompt, and collapsed SEO/variants metadata
 * 4. Edit Copy — shared rich-text <Editor> with passage-anchored notes, revision brief export, and internal links
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  WritingProject,
  ProductCopyMetadata,
  ProductPositioning,
  ProductCopyVariants,
  ProductContextProfile,
  ProductMockupImage,
  ProductVerifiedFacts,
  ProductVisibleObservations,
  ProductEditorialInferences,
  ProductEpistemicAnalysis,
  ProductAngleRole,
  ProductBriefLengthPreset,
  ProductCopySectionId,
  ProductBriefConfiguration,
  ProductRecipientPersona,
  ProductAudienceMismatch,
  DiffProposal,
  ActivePanel,
} from '../../types/project';
import { Editor } from '../Editor';
import { geminiService } from '../../services/geminiClient';
import {
  analyzeProductResearch,
  generateProductCreativeDirection,
} from '../../services/productResearchService';
import {
  mergeCreativeDirectionIntoMeta,
  applySelectedTitleToMeta,
  applyProductAngleRoleToMeta,
  applyRecipientPersonaToPositioning,
  applyAudienceMismatchToPositioning,
  buildProductExternalWritingPrompt,
  PRODUCT_COPY_SECTIONS_CATALOG,
  DEFAULT_PRODUCT_BRIEF_SECTIONS,
  BRIEF_LENGTH_PRESET_DESCRIPTIONS,
  resolveProductBriefConfig,
  validateProductDraftWordCount,
} from '../../utils/productCreativeDirectionUtils';
import {
  processUploadedMockupFile,
  setPrimaryMockupImage,
  removeMockupImage,
  MAX_MOCKUP_IMAGES_PER_PRODUCT,
} from '../../utils/productImageUtils';
import { ensureSemanticHtml } from '../../utils/richText';
import {
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Package,
  Compass,
  Type,
  ArrowRight,
  ArrowLeft,
  Copy,
  Check,
  Globe,
  Wand2,
  Cpu,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  SearchCheck,
  FileText,
  ChevronDown,
  Upload,
  Image as ImageIcon,
  Star,
  Trash2,
  Bookmark,
  Plus,
  Edit3,
  RefreshCw,
  Eye,
  Lightbulb,
  Users,
  Target,
  Ban,
} from 'lucide-react';
import { ModelId } from '../../types/models';
import { ALL_MODELS, getModelDefinition } from '../../services/modelRegistry';
import { storage } from '../../services/storage';

interface ProductCopyWorkspaceProps {
  project: WritingProject;
  editorRef?: React.MutableRefObject<any>;
  activePanel?: ActivePanel;
  onTogglePanel?: (panel: Exclude<ActivePanel, null>) => void;
  onChange: (updatedProject: WritingProject) => void;
  onRequestProposal: (proposal: DiffProposal) => void;
}

export type ProductCopyWorkflowStep = 'setup' | 'direction' | 'brief' | 'edit';

const WORKFLOW_STEPS: Array<{
  id: ProductCopyWorkflowStep;
  stepNumber: number;
  label: string;
  shortDesc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'setup',
    stepNumber: 1,
    label: 'Product Setup',
    shortDesc: 'Profiles, Mockup & Analysis',
    icon: Package,
  },
  {
    id: 'direction',
    stepNumber: 2,
    label: 'Editorial Direction',
    shortDesc: 'Positioning & Angles',
    icon: Compass,
  },
  {
    id: 'brief',
    stepNumber: 3,
    label: 'Writing Brief',
    shortDesc: 'Copy Fields & Prompt',
    icon: Type,
  },
  {
    id: 'edit',
    stepNumber: 4,
    label: 'Edit Copy',
    shortDesc: 'Studio Editor & Notes',
    icon: FileText,
  },
];

export const ProductCopyWorkspace: React.FC<ProductCopyWorkspaceProps> = ({
  project,
  editorRef,
  onTogglePanel,
  onChange,
  onRequestProposal,
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [activeStep, setActiveStep] = useState<ProductCopyWorkflowStep>('setup');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Saved Product Context Profiles State
  const [contextProfiles, setContextProfiles] = useState<ProductContextProfile[]>(() =>
    storage.getProductContextProfiles()
  );
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<{
    name: string;
    intendedRecipient: string;
    giftGuideOrOccasion: string;
    targetAudience: string;
    contextNotes: string;
    isDefault: boolean;
  }>({
    name: '',
    intendedRecipient: '',
    giftGuideOrOccasion: '',
    targetAudience: '',
    contextNotes: '',
    isDefault: false,
  });
  const [pendingProfileToApply, setPendingProfileToApply] = useState<ProductContextProfile | null>(
    null
  );

  // Mockup Image Upload State
  const mockupFileInputRef = useRef<HTMLInputElement | null>(null);
  const [isCompressingImage, setIsCompressingImage] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  // AI Product Research & Autofill State
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false);
  const [researchStatusMsg, setResearchStatusMsg] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);
  const [pendingFactSuggestions, setPendingFactSuggestions] = useState<
    Partial<Record<keyof ProductCopyMetadata, string>> | null
  >(null);
  const [canonicalUrlSuggestion, setCanonicalUrlSuggestion] = useState<string | null>(null);

  const defaultPositioning: ProductPositioning = {
    whatMakesItInteresting: '',
    whyWouldSomeoneWantIt: '',
    suitedRecipient: '',
    whatToEmphasize: '',
    whatToAvoid: '',
    keySellingAngle: '',
    emotionalAngle: '',
    historicalAngle: '',
  };

  const defaultVerifiedFacts: ProductVerifiedFacts = {
    sourceUrl: '',
    canonicalUrl: '',
    price: '',
    materials: '',
    dimensions: '',
    colors: '',
    features: '',
    variants: '',
    additionalSpecs: '',
    verificationNotes: '',
    unverifiedFields: [],
    fieldStatus: {},
  };

  const defaultVisibleObservations: ProductVisibleObservations = {
    visibleText: '',
    designAndImagery: '',
    garmentOrObjectStyle: '',
    visibleColors: '',
    visualDetails: '',
  };

  const defaultEditorialInferences: ProductEditorialInferences = {
    designConcept: '',
    historicalOrCulturalContext: '',
    recipientResonance: '',
    editorialCaution: '',
  };

  const rawMeta: Partial<ProductCopyMetadata> = project.productCopyMeta || {};
  const meta: ProductCopyMetadata = {
    productName: project.title,
    productType: '',
    productUrl: '',
    imageUrl: '',
    rawProductInfo: '',
    designDescription: '',
    designConcept: '',
    historicalContext: '',
    materials: '',
    features: '',
    dimensions: '',
    colors: '',
    intendedRecipient: '',
    targetAudience: '',
    giftGuideOrOccasion: '',
    contextNotes: '',
    price: '',
    variantsSpec: '',
    productNotes: '',
    additionalFacts: '',
    productTitle: project.title,
    headline: '',
    standfirst: '',
    description: '',
    bestFor: '',
    keyFeaturesBullets: [],
    historicalAngleCopy: '',
    materialsCraftNote: '',
    callToAction: '',
    shortCopySocial: '',
    ecommerceBullets: [],
    variants: {
      formalEditorial: '',
      emotionalStorytelling: '',
      conciseConversion: '',
      technicalHistorical: '',
    },
    slug: '',
    seoTitle: '',
    metaDescription: '',
    primaryKeyword: '',
    secondaryKeywords: [],
    ...rawMeta,
    mockupImages: Array.isArray(rawMeta.mockupImages) ? rawMeta.mockupImages : [],
    positioning:
      typeof rawMeta.positioning === 'object' && rawMeta.positioning !== null
        ? { ...defaultPositioning, ...rawMeta.positioning }
        : defaultPositioning,
  };

  const epistemic: ProductEpistemicAnalysis = meta.epistemicAnalysis || {
    analysisMode:
      meta.productUrl && (meta.mockupImages?.length || 0) > 0
        ? 'url_and_image'
        : (meta.mockupImages?.length || 0) > 0
        ? 'image_only'
        : 'url_only',
    analyzedAt: meta.lastAnalyzedAt || '',
    verifiedFacts: {
      ...defaultVerifiedFacts,
      sourceUrl: meta.productUrl || '',
      price: meta.price || '',
      materials: meta.materials || '',
      dimensions: meta.dimensions || '',
      colors: meta.colors || '',
      features: meta.features || '',
      variants: meta.variantsSpec || '',
      additionalSpecs: meta.additionalFacts || '',
    },
    visibleObservations: {
      ...defaultVisibleObservations,
      designAndImagery: meta.designDescription || '',
    },
    editorialInferences: {
      ...defaultEditorialInferences,
      designConcept: meta.designConcept || '',
      historicalOrCulturalContext: meta.historicalContext || '',
      recipientResonance: meta.bestFor || '',
    },
  };

  const mockupImages = meta.mockupImages || [];
  const hasUrlInput = Boolean(meta.productUrl && meta.productUrl.trim());
  const hasMockupInput = mockupImages.length > 0;
  const canRunAnalysis = hasUrlInput || hasMockupInput;

  const analyzeButtonLabel = useMemo(() => {
    if (isAnalyzingProduct) return 'Analyzing Product...';
    if (hasUrlInput && hasMockupInput) return 'Analyze URL & Mockup';
    if (hasMockupInput) return 'Analyze Mockup Only';
    return 'Analyze URL Only';
  }, [isAnalyzingProduct, hasUrlInput, hasMockupInput]);

  const handleUpdateMeta = (field: keyof ProductCopyMetadata, value: any) => {
    onChange({
      ...project,
      title: field === 'productName' && value ? value : project.title,
      productCopyMeta: {
        ...meta,
        [field]: value,
      },
    });
  };

  const handleUpdatePositioning = (field: keyof ProductPositioning, value: string) => {
    handleUpdateMeta('positioning', {
      ...(meta.positioning || {}),
      [field]: value,
    });
  };

  const handleUpdateVariants = (variantKey: keyof ProductCopyVariants, text: string) => {
    handleUpdateMeta('variants', {
      ...(meta.variants || {}),
      [variantKey]: text,
    });
  };

  // Update Verified Facts and keep corresponding top-level compatibility fields synchronized
  const handleUpdateVerifiedFact = (field: keyof ProductVerifiedFacts, value: string) => {
    const nextVf: ProductVerifiedFacts = {
      ...epistemic.verifiedFacts,
      [field]: value,
      fieldStatus: {
        ...(epistemic.verifiedFacts.fieldStatus || {}),
        ...(field === 'price' ||
        field === 'materials' ||
        field === 'dimensions' ||
        field === 'colors' ||
        field === 'features' ||
        field === 'variants'
          ? { [field]: value.trim() ? 'manual_entry' : 'unverified' }
          : {}),
      },
    };

    const nextEpistemic: ProductEpistemicAnalysis = {
      ...epistemic,
      verifiedFacts: nextVf,
    };

    const topLevelSync: Partial<ProductCopyMetadata> = {
      epistemicAnalysis: nextEpistemic,
    };
    if (field === 'price') topLevelSync.price = value;
    if (field === 'materials') topLevelSync.materials = value;
    if (field === 'dimensions') topLevelSync.dimensions = value;
    if (field === 'colors') topLevelSync.colors = value;
    if (field === 'features') topLevelSync.features = value;
    if (field === 'variants') topLevelSync.variantsSpec = value;
    if (field === 'additionalSpecs') topLevelSync.additionalFacts = value;

    onChange({
      ...project,
      productCopyMeta: {
        ...meta,
        ...topLevelSync,
      },
    });
  };

  // Update Visible Observations
  const handleUpdateVisibleObservation = (
    field: keyof ProductVisibleObservations,
    value: string
  ) => {
    const nextVo: ProductVisibleObservations = {
      ...epistemic.visibleObservations,
      [field]: value,
    };
    const nextEpistemic: ProductEpistemicAnalysis = {
      ...epistemic,
      visibleObservations: nextVo,
    };
    onChange({
      ...project,
      productCopyMeta: {
        ...meta,
        designDescription:
          field === 'designAndImagery' ? value : meta.designDescription,
        epistemicAnalysis: nextEpistemic,
      },
    });
  };

  // Update Editorial Inferences
  const handleUpdateEditorialInference = (
    field: keyof ProductEditorialInferences,
    value: string
  ) => {
    const nextEi: ProductEditorialInferences = {
      ...epistemic.editorialInferences,
      [field]: value,
    };
    const nextEpistemic: ProductEpistemicAnalysis = {
      ...epistemic,
      editorialInferences: nextEi,
    };
    const topLevelSync: Partial<ProductCopyMetadata> = {
      epistemicAnalysis: nextEpistemic,
    };
    if (field === 'designConcept') topLevelSync.designConcept = value;
    if (field === 'historicalOrCulturalContext') topLevelSync.historicalContext = value;

    onChange({
      ...project,
      productCopyMeta: {
        ...meta,
        ...topLevelSync,
      },
    });
  };

  // =========================================================================
  // SAVED PRODUCT CONTEXT PROFILES HANDLERS
  // =========================================================================
  const refreshProfilesList = () => {
    setContextProfiles(storage.getProductContextProfiles());
  };

  const applyProfileToProject = (
    profile: ProductContextProfile,
    mode: 'empty_only' | 'overwrite_all'
  ) => {
    const nextMeta: ProductCopyMetadata = {
      ...meta,
      contextProfileId: profile.id,
      intendedRecipient:
        mode === 'overwrite_all' || !meta.intendedRecipient?.trim()
          ? profile.intendedRecipient
          : meta.intendedRecipient,
      giftGuideOrOccasion:
        mode === 'overwrite_all' || !meta.giftGuideOrOccasion?.trim()
          ? profile.giftGuideOrOccasion
          : meta.giftGuideOrOccasion,
      targetAudience:
        mode === 'overwrite_all' || !meta.targetAudience?.trim()
          ? profile.targetAudience
          : meta.targetAudience,
      contextNotes:
        mode === 'overwrite_all' || !meta.contextNotes?.trim()
          ? profile.contextNotes
          : meta.contextNotes,
    };

    onChange({
      ...project,
      productCopyMeta: nextMeta,
    });
    setPendingProfileToApply(null);
  };

  const handleSelectContextProfile = (profileId: string) => {
    if (!profileId) {
      handleUpdateMeta('contextProfileId', undefined);
      setPendingProfileToApply(null);
      return;
    }

    const found = contextProfiles.find((p) => p.id === profileId);
    if (!found) return;

    const hasConflict =
      (Boolean(meta.intendedRecipient?.trim()) &&
        meta.intendedRecipient?.trim() !== found.intendedRecipient.trim()) ||
      (Boolean(meta.giftGuideOrOccasion?.trim()) &&
        meta.giftGuideOrOccasion?.trim() !== found.giftGuideOrOccasion.trim()) ||
      (Boolean(meta.targetAudience?.trim()) &&
        meta.targetAudience?.trim() !== found.targetAudience.trim()) ||
      (Boolean(meta.contextNotes?.trim()) &&
        meta.contextNotes?.trim() !== found.contextNotes.trim());

    if (hasConflict) {
      setPendingProfileToApply(found);
    } else {
      applyProfileToProject(found, 'overwrite_all');
    }
  };

  const handleOpenNewProfileEditor = () => {
    setEditingProfileId(null);
    setProfileForm({
      name: '',
      intendedRecipient: meta.intendedRecipient || '',
      giftGuideOrOccasion: meta.giftGuideOrOccasion || '',
      targetAudience: meta.targetAudience || '',
      contextNotes: meta.contextNotes || '',
      isDefault: false,
    });
    setIsProfileEditorOpen(true);
  };

  const handleOpenEditProfileEditor = (profile: ProductContextProfile) => {
    setEditingProfileId(profile.id);
    setProfileForm({
      name: profile.name,
      intendedRecipient: profile.intendedRecipient,
      giftGuideOrOccasion: profile.giftGuideOrOccasion,
      targetAudience: profile.targetAudience,
      contextNotes: profile.contextNotes,
      isDefault: Boolean(profile.isDefault),
    });
    setIsProfileEditorOpen(true);
  };

  const handleSaveProfileForm = () => {
    if (!profileForm.name.trim()) return;
    const saved = storage.saveProductContextProfile({
      id: editingProfileId || undefined,
      name: profileForm.name.trim(),
      intendedRecipient: profileForm.intendedRecipient.trim(),
      giftGuideOrOccasion: profileForm.giftGuideOrOccasion.trim(),
      targetAudience: profileForm.targetAudience.trim(),
      contextNotes: profileForm.contextNotes.trim(),
      isDefault: profileForm.isDefault,
    });
    refreshProfilesList();
    setIsProfileEditorOpen(false);
    setEditingProfileId(null);
    handleSelectContextProfile(saved.id);
  };

  const handleDeleteProfile = (profileId: string) => {
    storage.deleteProductContextProfile(profileId);
    refreshProfilesList();
    if (meta.contextProfileId === profileId) {
      handleUpdateMeta('contextProfileId', undefined);
    }
    if (editingProfileId === profileId) {
      setIsProfileEditorOpen(false);
      setEditingProfileId(null);
    }
  };

  const handleToggleDefaultProfile = (profile: ProductContextProfile) => {
    const nextDefaultId = profile.isDefault ? null : profile.id;
    storage.setDefaultProductContextProfile(nextDefaultId);
    refreshProfilesList();
  };

  // =========================================================================
  // MOCKUP IMAGE UPLOAD, COMPRESSION & PRIMARY IMAGE HANDLERS
  // =========================================================================
  const handleMockupFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setImageUploadError(null);
    const currentImages = [...mockupImages];
    const remainingSlots = MAX_MOCKUP_IMAGES_PER_PRODUCT - currentImages.length;

    if (remainingSlots <= 0) {
      setImageUploadError(
        `Maximum of ${MAX_MOCKUP_IMAGES_PER_PRODUCT} mockup images reached. Remove an image to upload another.`
      );
      e.target.value = '';
      return;
    }

    const filesToProcess = Array.from(fileList).slice(0, remainingSlots);
    setIsCompressingImage(true);

    try {
      const processed: ProductMockupImage[] = [];
      for (let i = 0; i < filesToProcess.length; i++) {
        const shouldBePrimary = currentImages.length === 0 && i === 0;
        const imgRecord = await processUploadedMockupFile(filesToProcess[i], shouldBePrimary);
        if (imgRecord.id && imgRecord.dataUrl) {
          storage.setProductMockupAsset(imgRecord.id, imgRecord.dataUrl);
        }
        processed.push(imgRecord);
      }

      const nextList = [...currentImages, ...processed];
      handleUpdateMeta('mockupImages', nextList);
    } catch (err: any) {
      setImageUploadError(err?.message || 'Failed to process uploaded mockup image.');
    } finally {
      setIsCompressingImage(false);
      e.target.value = '';
    }
  };

  const handleSetPrimaryMockup = (imageId: string) => {
    const updated = setPrimaryMockupImage(mockupImages, imageId);
    handleUpdateMeta('mockupImages', updated);
  };

  const handleRemoveMockup = (imageId: string) => {
    storage.deleteProductMockupAsset(imageId);
    const updated = removeMockupImage(mockupImages, imageId);
    handleUpdateMeta('mockupImages', updated);
  };

  // =========================================================================
  // AI PRODUCT RESEARCH & MULTIMODAL ANALYSIS HANDLER
  // =========================================================================
  const handleFetchAndAnalyzeProduct = async () => {
    if (!canRunAnalysis) {
      setResearchStatusMsg({
        text: 'Please provide a product URL, upload at least one mockup image, or both to analyze.',
        isError: true,
      });
      return;
    }

    setIsAnalyzingProduct(true);
    const modeDesc =
      hasUrlInput && hasMockupInput
        ? 'Fetching product URL specifications and analyzing uploaded mockup image(s)...'
        : hasMockupInput
        ? 'Analyzing uploaded mockup image(s) for visible design details and editorial positioning...'
        : 'Fetching product URL specifications and running AI product research...';
    setResearchStatusMsg({ text: modeDesc });

    try {
      const res = await analyzeProductResearch(meta.productUrl || '', project.modelOverride, undefined, {
        mockupImages: mockupImages
          .filter((img) => Boolean(img.dataUrl))
          .map((img) => ({
            id: img.id,
            name: img.name,
            mimeType: img.mimeType,
            dataUrl: img.dataUrl!,
            isPrimary: img.isPrimary,
          })),
        productContext: {
          intendedRecipient: meta.intendedRecipient,
          giftGuideOrOccasion: meta.giftGuideOrOccasion,
          targetAudience: meta.targetAudience,
          contextNotes: meta.contextNotes,
        },
      });

      if (!res.ok || !res.metadata) {
        setResearchStatusMsg({
          text:
            res.error || 'Unable to complete product analysis. Manual editing remains available.',
          isError: true,
        });
        return;
      }

      const m = res.metadata;
      const nowIso = new Date().toISOString();
      const directUpdates: Partial<ProductCopyMetadata> = {
        lastAnalyzedAt: nowIso,
      };
      const newSuggestions: Partial<Record<keyof ProductCopyMetadata, string>> = {};

      // Merge epistemicAnalysis non-destructively (preserving any existing user-edited fields in each section)
      const incomingVf = m.verifiedFacts || defaultVerifiedFacts;
      const incomingVo = m.visibleObservations || defaultVisibleObservations;
      const incomingEi = m.editorialInferences || defaultEditorialInferences;

      const mergedVf: ProductVerifiedFacts = {
        ...epistemic.verifiedFacts,
        sourceUrl: incomingVf.sourceUrl || epistemic.verifiedFacts.sourceUrl || meta.productUrl || '',
        canonicalUrl: incomingVf.canonicalUrl || epistemic.verifiedFacts.canonicalUrl || '',
        price: epistemic.verifiedFacts.price?.trim()
          ? epistemic.verifiedFacts.price
          : incomingVf.price || '',
        materials: epistemic.verifiedFacts.materials?.trim()
          ? epistemic.verifiedFacts.materials
          : incomingVf.materials || '',
        dimensions: epistemic.verifiedFacts.dimensions?.trim()
          ? epistemic.verifiedFacts.dimensions
          : incomingVf.dimensions || '',
        colors: epistemic.verifiedFacts.colors?.trim()
          ? epistemic.verifiedFacts.colors
          : incomingVf.colors || '',
        features: epistemic.verifiedFacts.features?.trim()
          ? epistemic.verifiedFacts.features
          : incomingVf.features || '',
        variants: epistemic.verifiedFacts.variants?.trim()
          ? epistemic.verifiedFacts.variants
          : incomingVf.variants || '',
        additionalSpecs: epistemic.verifiedFacts.additionalSpecs?.trim()
          ? epistemic.verifiedFacts.additionalSpecs
          : incomingVf.additionalSpecs || '',
        verificationNotes: incomingVf.verificationNotes || epistemic.verifiedFacts.verificationNotes,
        unverifiedFields: incomingVf.unverifiedFields || [],
        fieldStatus: incomingVf.fieldStatus || {},
      };

      const mergedVo: ProductVisibleObservations = {
        visibleText: epistemic.visibleObservations.visibleText?.trim()
          ? epistemic.visibleObservations.visibleText
          : incomingVo.visibleText || '',
        designAndImagery: epistemic.visibleObservations.designAndImagery?.trim()
          ? epistemic.visibleObservations.designAndImagery
          : incomingVo.designAndImagery || '',
        garmentOrObjectStyle: epistemic.visibleObservations.garmentOrObjectStyle?.trim()
          ? epistemic.visibleObservations.garmentOrObjectStyle
          : incomingVo.garmentOrObjectStyle || '',
        visibleColors: epistemic.visibleObservations.visibleColors?.trim()
          ? epistemic.visibleObservations.visibleColors
          : incomingVo.visibleColors || '',
        visualDetails: epistemic.visibleObservations.visualDetails?.trim()
          ? epistemic.visibleObservations.visualDetails
          : incomingVo.visualDetails || '',
      };

      const mergedEi: ProductEditorialInferences = {
        designConcept: epistemic.editorialInferences.designConcept?.trim()
          ? epistemic.editorialInferences.designConcept
          : incomingEi.designConcept || '',
        historicalOrCulturalContext:
          epistemic.editorialInferences.historicalOrCulturalContext?.trim()
            ? epistemic.editorialInferences.historicalOrCulturalContext
            : incomingEi.historicalOrCulturalContext || '',
        recipientResonance: epistemic.editorialInferences.recipientResonance?.trim()
          ? epistemic.editorialInferences.recipientResonance
          : incomingEi.recipientResonance || '',
        editorialCaution: epistemic.editorialInferences.editorialCaution?.trim()
          ? epistemic.editorialInferences.editorialCaution
          : incomingEi.editorialCaution || '',
      };

      directUpdates.epistemicAnalysis = {
        analysisMode: m.analysisMode || (hasUrlInput && hasMockupInput ? 'url_and_image' : hasMockupInput ? 'image_only' : 'url_only'),
        analyzedAt: nowIso,
        modelUsed: res.modelUsed,
        verifiedFacts: mergedVf,
        visibleObservations: mergedVo,
        editorialInferences: mergedEi,
      };

      const isDefaultTitle =
        !meta.productName ||
        meta.productName.trim() === '' ||
        meta.productName.trim() === 'Untitled Product Copy';

      const fieldsToMap: Array<{ key: keyof ProductCopyMetadata; fetchedValue?: string }> = [
        { key: 'productName', fetchedValue: m.productName },
        { key: 'productType', fetchedValue: m.productType },
        { key: 'imageUrl', fetchedValue: m.imageUrl },
        { key: 'price', fetchedValue: mergedVf.price },
        { key: 'materials', fetchedValue: mergedVf.materials },
        { key: 'features', fetchedValue: mergedVf.features },
        { key: 'dimensions', fetchedValue: mergedVf.dimensions },
        { key: 'colors', fetchedValue: mergedVf.colors },
        { key: 'variantsSpec', fetchedValue: mergedVf.variants },
        { key: 'designDescription', fetchedValue: mergedVo.designAndImagery },
        { key: 'designConcept', fetchedValue: mergedEi.designConcept },
        { key: 'historicalContext', fetchedValue: mergedEi.historicalOrCulturalContext },
        { key: 'intendedRecipient', fetchedValue: m.intendedRecipient },
        { key: 'targetAudience', fetchedValue: m.targetAudience },
        { key: 'additionalFacts', fetchedValue: mergedVf.additionalSpecs },
        { key: 'rawProductInfo', fetchedValue: m.rawProductInfo },
      ];

      let filledCount = 0;
      let suggestionCount = 0;

      fieldsToMap.forEach(({ key, fetchedValue }) => {
        if (!fetchedValue || !fetchedValue.trim()) return;
        const cleanVal = fetchedValue.trim();
        const currentVal = (meta[key] || '').toString().trim();

        if (!currentVal || (key === 'productName' && isDefaultTitle)) {
          // Auto-fill empty fields directly
          (directUpdates as any)[key] = cleanVal;
          filledCount++;
        } else if (currentVal !== cleanVal) {
          // Non-destructive suggestion for populated fields
          (newSuggestions as any)[key] = cleanVal;
          suggestionCount++;
        }
      });

      if (
        m.canonicalUrl &&
        m.canonicalUrl.trim() &&
        meta.productUrl &&
        m.canonicalUrl.trim().toLowerCase() !== meta.productUrl.trim().toLowerCase()
      ) {
        setCanonicalUrlSuggestion(m.canonicalUrl.trim());
      } else {
        setCanonicalUrlSuggestion(null);
      }

      onChange({
        ...project,
        title: directUpdates.productName || project.title,
        productCopyMeta: {
          ...meta,
          ...directUpdates,
        } as ProductCopyMetadata,
      });

      if (Object.keys(newSuggestions).length > 0) {
        setPendingFactSuggestions(newSuggestions);
      } else {
        setPendingFactSuggestions(null);
      }

      const modeLabel =
        m.analysisMode === 'url_and_image'
          ? 'URL + Mockup analysis'
          : m.analysisMode === 'image_only'
          ? 'Mockup-only visual analysis'
          : 'URL analysis';

      let msg = '';
      if (filledCount > 0 && suggestionCount > 0) {
        msg = `${modeLabel} complete! Populated ${filledCount} empty field(s). ${suggestionCount} populated field(s) have non-destructive suggestions below.`;
      } else if (filledCount > 0) {
        msg = `${modeLabel} complete! Populated ${filledCount} field(s) across Verified Facts, Visible Observations, and Editorial Inferences.`;
      } else if (suggestionCount > 0) {
        msg = `${modeLabel} complete! Found ${suggestionCount} suggested update(s) for populated fields below.`;
      } else {
        msg = `${modeLabel} complete. Review Verified Facts, Visible Observations, and Editorial Inferences below.`;
      }

      setResearchStatusMsg({ text: msg, isError: false });
    } catch (err: any) {
      setResearchStatusMsg({
        text: err?.message || 'Product research analysis failed.',
        isError: true,
      });
    } finally {
      setIsAnalyzingProduct(false);
    }
  };

  const handleApplyFactSuggestion = (key: keyof ProductCopyMetadata) => {
    if (!pendingFactSuggestions || !pendingFactSuggestions[key]) return;
    const val = pendingFactSuggestions[key]!;
    handleUpdateMeta(key, val);

    const next = { ...pendingFactSuggestions };
    delete next[key];
    setPendingFactSuggestions(Object.keys(next).length > 0 ? next : null);
  };

  const handleDismissFactSuggestion = (key: keyof ProductCopyMetadata) => {
    if (!pendingFactSuggestions) return;
    const next = { ...pendingFactSuggestions };
    delete next[key];
    setPendingFactSuggestions(Object.keys(next).length > 0 ? next : null);
  };

  const handleApplyAllFactSuggestions = () => {
    if (!pendingFactSuggestions) return;
    onChange({
      ...project,
      productCopyMeta: {
        ...meta,
        ...pendingFactSuggestions,
      } as ProductCopyMetadata,
    });
    setPendingFactSuggestions(null);
  };

  const handleDismissAllFactSuggestions = () => {
    setPendingFactSuggestions(null);
  };

  // AI Action Dispatcher for Product Copy (proposes changes via DiffReviewModal without overwriting)
  const handleExecuteAiAction = async (
    action: string,
    customCommand?: string,
    scope: any = 'selection'
  ) => {
    setIsLoading(true);
    try {
      const res = await geminiService.executeAction(project, action, {
        selectedText: scope === 'selection' ? selectedText : undefined,
        scope,
        customCommand,
        relevantProduct: meta,
        modelOverride: project.modelOverride,
        actionType: 'product_copy',
      });

      if (res.ok && res.proposedText) {
        onRequestProposal({
          id: `prop-${Date.now()}`,
          scopeDescription:
            scope === 'selection' && selectedText
              ? `Selected text (${selectedText.split(/\s+/).filter(Boolean).length} words)`
              : action.replace(/_/g, ' '),
          targetText: scope === 'selection' ? selectedText : project.content,
          proposedText: res.proposedText,
          explanation: res.explanation || 'Refined product copy according to editorial guidelines.',
          range: scope === 'selection' ? selectionRange : undefined,
        });
      }
    } catch (err: any) {
      setResearchStatusMsg({
        text: err?.message || 'AI editorial action failed.',
        isError: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // AI Full Copy Generation (uses non-destructive DiffProposal modal and respects selected sections & word count)
  const handleGenerateFullCopy = async () => {
    setIsLoading(true);
    try {
      const briefCfg = resolveProductBriefConfig(meta, project.writingControls?.wordCountTarget);
      const selectedSectionLabels = PRODUCT_COPY_SECTIONS_CATALOG.filter((s) =>
        briefCfg.selectedSections.includes(s.id)
      ).map((s) => `${s.label} (${s.promptDirective})`);
      const excludedSectionLabels = PRODUCT_COPY_SECTIONS_CATALOG.filter(
        (s) => !briefCfg.selectedSections.includes(s.id)
      ).map((s) => `${s.label} (${s.omissionDirective})`);

      const specDirective = briefCfg.includeTechnicalSpecs
        ? 'Include a concise Technical Specifications section using ONLY verified facts.'
        : 'Do NOT repeat materials, dimensions, insulation performance, care/washing instructions, or compliance details already displayed elsewhere on the product page. Focus on design, humor, appeal, intended recipient, and gift rationale.';

      const wordCountDirective = briefCfg.headlineCountsTowardWordCount
        ? `Target Word Count: ${briefCfg.targetWordCount} words total (${briefCfg.minWords}–${briefCfg.maxWords} words acceptable, including headline and standfirst).`
        : `Target Word Count: ${briefCfg.targetWordCount} words for the MAIN BODY paragraphs (${briefCfg.minWords}–${briefCfg.maxWords} words acceptable; headline and standfirst do NOT count toward the ${briefCfg.targetWordCount}-word target).`;

      const res = await geminiService.executeAction(project, 'generate_product_copy', {
        relevantProduct: meta,
        modelOverride: project.modelOverride,
        actionType: 'product_copy',
        customCommand: [
          'Write original editorial product copy from a distinctive point of view (interpret the design and recipient appeal rather than inventorying visible mockup elements or parroting vendor prose).',
          wordCountDirective,
          specDirective,
          `Include ONLY these selected sections: ${selectedSectionLabels.join(' | ')}.`,
          excludedSectionLabels.length > 0
            ? `Explicitly OMIT these unselected sections: ${excludedSectionLabels.join(' | ')}.`
            : '',
          'Avoid overexplaining the joke, generic disclaimers, compliance claims, or washing instructions.',
        ]
          .filter(Boolean)
          .join(' '),
      });

      if (res.ok && res.proposedText) {
        onRequestProposal({
          id: `prop-full-copy-${Date.now()}`,
          scopeDescription: `Full Product Copy (${briefCfg.targetWordCount}w target, ${briefCfg.selectedSections.length} sections)`,
          targetText: project.content,
          proposedText: res.proposedText,
          modelUsed: res.modelUsed,
          explanation:
            res.explanation ||
            `Constructed editorial product copy targeting ${briefCfg.targetWordCount} words (${briefCfg.minWords}–${briefCfg.maxWords}w) across ${briefCfg.selectedSections.length} selected section(s).`,
        });
      }
    } catch (err: any) {
      setResearchStatusMsg({
        text: err?.message || 'Failed to generate full copy proposal.',
        isError: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Generate Single Structured Field
  const handleGenerateSingleField = async (
    field:
      | 'headline'
      | 'standfirst'
      | 'description'
      | 'bestFor'
      | 'historicalAngleCopy'
      | 'materialsCraftNote'
      | 'callToAction'
      | 'shortCopySocial'
      | 'seoTitle'
      | 'metaDescription'
  ) => {
    setIsLoading(true);
    try {
      const actionMap: Record<string, string> = {
        headline: 'create_headline',
        standfirst: 'create_standfirst',
        description: 'generate_product_copy',
        bestFor: 'create_best_for',
        historicalAngleCopy: 'add_product_historical_context',
        materialsCraftNote: 'create_materials_note',
        callToAction: 'create_cta',
        shortCopySocial: 'create_social_copy',
        seoTitle: 'create_seo_title',
        metaDescription: 'create_meta_description',
      };

      const action = actionMap[field] || 'generate_product_copy';
      const res = await geminiService.executeAction(project, action, {
        relevantProduct: meta,
        modelOverride: project.modelOverride,
        actionType: 'product_copy',
      });

      if (res.ok && res.proposedText) {
        const cleaned = res.proposedText.replace(/^["']|["']$/g, '').trim();
        handleUpdateMeta(field, cleaned);
      }
    } catch (err: any) {
      setResearchStatusMsg({
        text: err?.message || `Failed to generate ${field}.`,
        isError: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Generate Multi-Variants (preserved for legacy/optional use inside Writing Brief collapsed section)
  const handleGenerateVariants = async () => {
    setIsLoading(true);
    try {
      const variantsList: Array<{ key: keyof ProductCopyVariants; prompt: string }> = [
        {
          key: 'formalEditorial',
          prompt:
            'Write formal, elevated editorial copy suited for a print journal or luxury monograph. Focus on craftsmanship, provenance, and quiet restraint.',
        },
        {
          key: 'emotionalStorytelling',
          prompt:
            'Write narrative storytelling copy evoking tactile rituals, heritage, and the feeling of owning an enduring object.',
        },
        {
          key: 'conciseConversion',
          prompt:
            'Write crisp, punchy, conversion-focused product description suitable for a fast-reading web showcase without vulgar hype.',
        },
        {
          key: 'technicalHistorical',
          prompt:
            'Write technical and historical detail copy emphasizing materials, gauge, dimensions, SELVEDGE/alloy details, and tool lineage.',
        },
      ];

      const newVariants: ProductCopyVariants = { ...meta.variants };

      for (const v of variantsList) {
        const res = await geminiService.executeAction(project, 'generate_product_copy', {
          relevantProduct: meta,
          customCommand: v.prompt,
          modelOverride: project.modelOverride,
          actionType: 'product_copy',
        });
        if (res.ok && res.proposedText) {
          newVariants[v.key] = res.proposedText;
        }
      }

      handleUpdateMeta('variants', newVariants);
    } catch (err: any) {
      setResearchStatusMsg({
        text: err?.message || 'Failed to generate style variants.',
        isError: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyText = (key: string, text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // =========================================================================
  // STAGE 3: EDITORIAL DIRECTION STUDIO & SAFE EDITOR IMPORT STATE / HANDLERS
  // =========================================================================
  const [isGeneratingDirection, setIsGeneratingDirection] = useState(false);
  const [generatingScope, setGeneratingScope] = useState<'all' | 'titles_only' | 'angles_only'>('all');
  const [editorDirectionGuidance, setEditorDirectionGuidance] = useState('');
  const [creativeDirectionStatusMsg, setCreativeDirectionStatusMsg] = useState<{
    text: string;
    isError?: boolean;
  } | null>(null);
  const [externalDraftPasteText, setExternalDraftPasteText] = useState('');
  const [editorImportNotice, setEditorImportNotice] = useState<string | null>(null);

  const handleGenerateEditorialDirection = async (
    targetScope: 'all' | 'titles_only' | 'angles_only' = 'all'
  ) => {
    setIsGeneratingDirection(true);
    setGeneratingScope(targetScope);
    const scopeLabel =
      targetScope === 'titles_only'
        ? 'Regenerating 6+ distinct editorial title options...'
        : targetScope === 'angles_only'
        ? 'Regenerating 4–5 strategic positioning angles...'
        : 'Generating coordinated Audience Psychology, 4–5 Positioning Angles, and 6+ Editorial Title Options...';
    setCreativeDirectionStatusMsg({ text: scopeLabel, isError: false });

    try {
      const res = await generateProductCreativeDirection({
        productName: meta.productName || project.title,
        productType: meta.productType,
        productUrl: meta.productUrl,
        rawProductInfo: meta.rawProductInfo,
        epistemicAnalysis: epistemic,
        productContext: {
          intendedRecipient: meta.intendedRecipient,
          giftGuideOrOccasion: meta.giftGuideOrOccasion,
          targetAudience: meta.targetAudience,
          contextNotes: meta.contextNotes,
        },
        currentPositioning: meta.positioning,
        editorCustomGuidance: editorDirectionGuidance.trim() || undefined,
        regenerateTarget: targetScope,
        mockupImages: mockupImages
          .filter((img) => Boolean(img.dataUrl))
          .map((img) => ({
            id: img.id,
            name: img.name,
            mimeType: img.mimeType,
            dataUrl: img.dataUrl!,
            isPrimary: img.isPrimary,
          })),
        modelOverride: project.modelOverride,
      });

      if (!res.ok || !res.creativeDirection) {
        setCreativeDirectionStatusMsg({
          text:
            res.error ||
            'Unable to generate Editorial Direction right now. Your existing fields remain untouched.',
          isError: true,
        });
        return;
      }

      const nextMeta = mergeCreativeDirectionIntoMeta(
        {
          ...meta,
          epistemicAnalysis: epistemic,
        },
        res.creativeDirection,
        targetScope
      );

      onChange({
        ...project,
        productCopyMeta: nextMeta,
      });

      const titleCount = nextMeta.creativeDirection?.titleOptions?.length || 0;
      const angleCount = nextMeta.creativeDirection?.positioningAngles?.length || 0;
      const personaCount =
        nextMeta.creativeDirection?.audienceAnalysis?.primaryPersonas?.length || 0;

      const summaryText =
        targetScope === 'titles_only'
          ? `Generated ${titleCount} distinct editorial title options (${res.modelUsed || 'AI'}). Click "Use Headline + Deck" or "Use Headline Only" on any card to apply.`
          : targetScope === 'angles_only'
          ? `Generated ${angleCount} positioning angles (${res.modelUsed || 'AI'}). Assign "Primary Angle", "Secondary", or "Avoid" on any card to update your positioning.`
          : `Editorial Direction ready (${res.modelUsed || 'AI'}): ${personaCount} recipient persona(s), ${angleCount} positioning angles, and ${titleCount} title options generated. Nothing was overwritten automatically—select the options you want below.`;

      setCreativeDirectionStatusMsg({
        text: summaryText,
        isError: false,
      });
    } catch (err: any) {
      setCreativeDirectionStatusMsg({
        text: err?.message || 'Failed to generate Editorial Direction.',
        isError: true,
      });
    } finally {
      setIsGeneratingDirection(false);
    }
  };

  const handleSelectTitleOption = (titleId: string, applyStandfirst: boolean) => {
    const nextMeta = applySelectedTitleToMeta(meta, titleId, { applyStandfirst });
    onChange({
      ...project,
      productCopyMeta: nextMeta,
    });
    const chosen = nextMeta.creativeDirection?.titleOptions?.find((t) => t.id === titleId);
    if (chosen) {
      setCreativeDirectionStatusMsg({
        text: applyStandfirst
          ? `Applied "${chosen.title}" to Headline and its companion Standfirst to your Writing Brief.`
          : `Applied "${chosen.title}" to Headline (existing Standfirst preserved).`,
        isError: false,
      });
    }
  };

  const handleAssignAngleRole = (angleId: string, role: ProductAngleRole) => {
    const nextMeta = applyProductAngleRoleToMeta(meta, angleId, role);
    onChange({
      ...project,
      productCopyMeta: nextMeta,
    });
  };

  const handleApplyPersonaToRecipient = (persona: ProductRecipientPersona) => {
    const nextMeta = applyRecipientPersonaToPositioning(meta, persona.id);
    onChange({
      ...project,
      productCopyMeta: nextMeta,
    });
    setCreativeDirectionStatusMsg({
      text: `Applied persona "${persona.name}" to Suited Recipient Profile in your positioning fields.`,
      isError: false,
    });
  };

  const handleApplyMismatchToAvoid = (mismatch: ProductAudienceMismatch) => {
    const nextMeta = applyAudienceMismatchToPositioning(meta, mismatch.id);
    onChange({
      ...project,
      productCopyMeta: nextMeta,
    });
    setCreativeDirectionStatusMsg({
      text: `Added mismatch caution ("${mismatch.whoShouldSkip}") to What to Avoid.`,
      isError: false,
    });
  };

  const resolvedBriefConfig = useMemo(() => {
    return resolveProductBriefConfig(meta, project.writingControls?.wordCountTarget);
  }, [meta, project.writingControls?.wordCountTarget]);

  const handleUpdateBriefConfig = (updates: Partial<ProductBriefConfiguration>) => {
    const currentCfg: ProductBriefConfiguration = meta.briefConfig || {};
    onChange({
      ...project,
      productCopyMeta: {
        ...meta,
        briefConfig: {
          selectedSections: currentCfg.selectedSections || resolvedBriefConfig.selectedSections,
          targetWordCount: currentCfg.targetWordCount ?? resolvedBriefConfig.targetWordCount,
          wordCountTolerancePercent:
            currentCfg.wordCountTolerancePercent ?? resolvedBriefConfig.wordCountTolerancePercent,
          headlineCountsTowardWordCount:
            currentCfg.headlineCountsTowardWordCount ??
            resolvedBriefConfig.headlineCountsTowardWordCount,
          allowNarrativeSpecMention:
            currentCfg.allowNarrativeSpecMention ?? resolvedBriefConfig.allowNarrativeSpecMention,
          ...updates,
        },
      },
    });
  };

  const handleToggleBriefSection = (sectionId: ProductCopySectionId) => {
    const current = resolvedBriefConfig.selectedSections;
    const isSelected = current.includes(sectionId);
    let next: ProductCopySectionId[];
    if (isSelected) {
      // Prevent unchecking the very last section
      if (current.length <= 1) return;
      next = current.filter((id) => id !== sectionId);
    } else {
      // Preserve catalog ordering
      const nextSet = new Set<ProductCopySectionId>([...current, sectionId]);
      next = PRODUCT_COPY_SECTIONS_CATALOG.map((s) => s.id).filter((id) => nextSet.has(id));
    }
    handleUpdateBriefConfig({ selectedSections: next });
  };

  const handleResetDefaultBriefSections = () => {
    handleUpdateBriefConfig({
      selectedSections: [...DEFAULT_PRODUCT_BRIEF_SECTIONS],
      headlineCountsTowardWordCount: false,
      allowNarrativeSpecMention: true,
    });
  };

  const handleUpdateBriefLengthPreset = (preset: ProductBriefLengthPreset) => {
    const presetSpec =
      BRIEF_LENGTH_PRESET_DESCRIPTIONS[preset] ||
      BRIEF_LENGTH_PRESET_DESCRIPTIONS.standard_editorial;
    const currentCfg: ProductBriefConfiguration = meta.briefConfig || {};
    onChange({
      ...project,
      productCopyMeta: {
        ...meta,
        briefLengthPreset: preset,
        briefConfig: {
          selectedSections: currentCfg.selectedSections || resolvedBriefConfig.selectedSections,
          targetWordCount: presetSpec.defaultTargetWords,
          wordCountTolerancePercent:
            currentCfg.wordCountTolerancePercent ?? resolvedBriefConfig.wordCountTolerancePercent,
          headlineCountsTowardWordCount:
            currentCfg.headlineCountsTowardWordCount ??
            resolvedBriefConfig.headlineCountsTowardWordCount,
          allowNarrativeSpecMention:
            currentCfg.allowNarrativeSpecMention ?? resolvedBriefConfig.allowNarrativeSpecMention,
        },
      },
    });
  };

  // Assemble HTML snippet from either pasted external prose or structured copy fields
  const buildStructuredCopyHtmlDraft = (): string => {
    const blocks: string[] = [];
    if (resolvedBriefConfig.includeHeadlineAndStandfirst) {
      if (meta.headline?.trim()) {
        blocks.push(`<h2>${meta.headline.trim()}</h2>`);
      }
      if (meta.standfirst?.trim()) {
        blocks.push(`<p><em>${meta.standfirst.trim()}</em></p>`);
      }
    }
    if (meta.description?.trim()) {
      const paras = meta.description
        .trim()
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      paras.forEach((p) => blocks.push(`<p>${p}</p>`));
    }
    if (
      resolvedBriefConfig.selectedSections.includes('recipient_and_gift_rationale') &&
      meta.bestFor?.trim()
    ) {
      blocks.push(`<p><strong>Best Suited For:</strong> ${meta.bestFor.trim()}</p>`);
    }
    if (resolvedBriefConfig.includeTechnicalSpecs && meta.materialsCraftNote?.trim()) {
      blocks.push(`<p><strong>Materials &amp; Craft:</strong> ${meta.materialsCraftNote.trim()}</p>`);
    }
    if (
      resolvedBriefConfig.selectedSections.includes('humor_and_cultural_context') &&
      meta.historicalAngleCopy?.trim()
    ) {
      blocks.push(`<p><strong>Context &amp; Lineage:</strong> ${meta.historicalAngleCopy.trim()}</p>`);
    }
    if (meta.callToAction?.trim()) {
      blocks.push(`<p><em>${meta.callToAction.trim()}</em></p>`);
    }
    return blocks.join('\n');
  };

  const formatPlainTextOrMarkdownToHtml = (rawText: string): string => {
    const trimmed = rawText.trim();
    if (!trimmed) return '';
    if (/<(p|h1|h2|h3|ul|ol|div|blockquote)\b/i.test(trimmed)) {
      return ensureSemanticHtml(trimmed);
    }
    const paragraphs = trimmed
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        if (block.startsWith('### ')) return `<h3>${block.slice(4).trim()}</h3>`;
        if (block.startsWith('## ')) return `<h2>${block.slice(3).trim()}</h2>`;
        if (block.startsWith('# ')) return `<h2>${block.slice(2).trim()}</h2>`;
        const inlineFormatted = block
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>');
        return `<p>${inlineFormatted}</p>`;
      });
    return ensureSemanticHtml(paragraphs.join('\n'));
  };

  const handleSendTextToEditor = (
    rawSourceHtmlOrText: string,
    mode: 'insert_if_empty' | 'append' | 'diff_modal',
    sourceLabel: string
  ) => {
    const formattedHtml = formatPlainTextOrMarkdownToHtml(rawSourceHtmlOrText);
    if (!formattedHtml.trim()) return;

    const currentContent = (project.content || '').trim();
    const isCurrentEditorEmpty =
      !currentContent ||
      currentContent === '<p></p>' ||
      currentContent.replace(/<[^>]+>/g, '').trim() === '';

    if (mode === 'diff_modal') {
      onRequestProposal({
        id: `prop-import-${Date.now()}`,
        scopeDescription: `${sourceLabel} (Safe Diff Review)`,
        targetText: project.content,
        proposedText: formattedHtml,
        explanation: `Review ${sourceLabel.toLowerCase()} before replacing editor content.`,
      });
      return;
    }

    if (mode === 'insert_if_empty' && isCurrentEditorEmpty) {
      onChange({
        ...project,
        content: formattedHtml,
        updatedAt: new Date().toISOString(),
      });
      setEditorImportNotice(`Inserted ${sourceLabel} into the Studio Editor.`);
      setActiveStep('edit');
      return;
    }

    // Safe Append: preserves existing Editor HTML and all passage-anchored Written/Voice editingNotes
    const combinedHtml = isCurrentEditorEmpty
      ? formattedHtml
      : ensureSemanticHtml(`${project.content}\n<hr />\n${formattedHtml}`);
    onChange({
      ...project,
      content: combinedHtml,
      updatedAt: new Date().toISOString(),
    });
    setEditorImportNotice(
      `Appended ${sourceLabel} to the end of the Studio Editor (existing copy and passage notes preserved).`
    );
    setActiveStep('edit');
  };

  // Assemble External Writing Prompt from ProductCopyMetadata, Epistemic Sections, and Stage 3 Creative Direction
  const externalWritingPrompt = useMemo(() => {
    return buildProductExternalWritingPrompt({
      projectTitle: project.title,
      meta: {
        ...meta,
        epistemicAnalysis: epistemic,
      },
      wordCountTarget: project.writingControls?.wordCountTarget,
    });
  }, [
    meta,
    epistemic,
    project.title,
    project.writingControls?.wordCountTarget,
  ]);

  // Live Word-Count Validation for Pasted External Draft (Step 3) and Studio Editor (Step 4)
  const pastedDraftValidation = useMemo(() => {
    return validateProductDraftWordCount(externalDraftPasteText, resolvedBriefConfig, {
      explicitHeadline: meta.headline,
      explicitStandfirst: meta.standfirst,
    });
  }, [externalDraftPasteText, resolvedBriefConfig, meta.headline, meta.standfirst]);

  const editorDraftValidation = useMemo(() => {
    return validateProductDraftWordCount(project.content || '', resolvedBriefConfig, {
      explicitHeadline: meta.headline,
      explicitStandfirst: meta.standfirst,
    });
  }, [project.content, resolvedBriefConfig, meta.headline, meta.standfirst]);

  const renderFactSuggestionPill = (
    key: keyof ProductCopyMetadata,
    label: string,
    isFact = true
  ) => {
    if (!pendingFactSuggestions || !pendingFactSuggestions[key]) return null;
    const val = pendingFactSuggestions[key]!;

    return (
      <div className="mt-1.5 p-2 bg-amber-50/90 border border-amber-200/90 rounded-lg text-xs space-y-1 animate-in fade-in duration-100">
        <div className="flex items-center justify-between text-[11px] font-semibold text-amber-950">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-700" />
            <span>
              Suggested {label} ({isFact ? 'Verified Source Fact' : 'AI Editorial Analysis'}):
            </span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleApplyFactSuggestion(key)}
              className="px-2 py-0.5 bg-amber-900 text-white hover:bg-amber-950 rounded text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer shadow-2xs"
            >
              <Check className="w-3 h-3" />
              <span>Apply</span>
            </button>
            <button
              type="button"
              onClick={() => handleDismissFactSuggestion(key)}
              className="px-1.5 py-0.5 text-amber-800 hover:text-amber-950 text-[10px] font-medium cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
        <p className="text-[11px] text-amber-900 leading-relaxed italic bg-white/70 p-1.5 rounded border border-amber-200/50 break-words">
          "{val}"
        </p>
      </div>
    );
  };

  const renderVerificationStatusBadge = (
    field: 'price' | 'materials' | 'dimensions' | 'colors' | 'features' | 'variants',
    currentValue?: string
  ) => {
    const status = epistemic.verifiedFacts.fieldStatus?.[field];
    const hasValue = Boolean(currentValue && currentValue.trim());

    if (status === 'verified_from_url' && hasValue) {
      return (
        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-200 text-[10px] font-semibold inline-flex items-center gap-1">
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700" />
          Verified from URL
        </span>
      );
    }
    if (status === 'manual_entry' || hasValue) {
      return (
        <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-medium">
          Manual / User Entered
        </span>
      );
    }
    if (!hasUrlInput) {
      return (
        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-medium">
          No URL Provided — Unverified
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 text-[10px] font-medium">
        Could not verify from URL
      </span>
    );
  };

  return (
    <div
      className={
        activeStep === 'edit'
          ? 'flex-1 flex flex-col bg-[#faf9f6] overflow-hidden'
          : 'flex-1 flex flex-col bg-[#faf9f6] overflow-y-auto'
      }
    >
      {/* SCROLLABLE PRODUCT IDENTITY HEADER (Scrolls away naturally in Steps 1–3; hidden in Step 4 Edit to maximize canvas room) */}
      {activeStep !== 'edit' && (
        <div className="px-3 sm:px-6 pt-2.5 pb-2 bg-[#f6f3eb] border-b border-[#ebe5d8]">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <input
                type="text"
                value={project.title}
                onChange={(e) => {
                  onChange({
                    ...project,
                    title: e.target.value,
                    productCopyMeta: {
                      ...meta,
                      productName: e.target.value,
                    },
                  });
                }}
                placeholder="Product Name..."
                className="w-full min-w-0 font-editorial text-lg sm:text-xl font-bold text-[#1e232a] bg-transparent focus:outline-hidden border-b border-transparent focus:border-emerald-600 py-0.5 truncate"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5c5447] shrink-0">
              <input
                type="text"
                value={meta.productType}
                onChange={(e) => handleUpdateMeta('productType', e.target.value)}
                placeholder="Category / Type (e.g. Heavyweight Hoodie, Ceramic Mug)"
                className="bg-white/70 px-2 py-0.5 rounded border border-[#dcd6ca] focus:outline-hidden focus:border-emerald-500 text-xs text-[#5c5447] w-44 sm:w-52"
              />
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={meta.productUrl}
                  onChange={(e) => handleUpdateMeta('productUrl', e.target.value)}
                  placeholder="Optional Product URL (https://...)"
                  className="bg-white/70 px-2 py-0.5 rounded border border-[#dcd6ca] focus:outline-hidden focus:border-emerald-500 text-xs font-mono text-[#736c61] w-44 sm:w-56"
                />
                <button
                  type="button"
                  disabled={isAnalyzingProduct || !canRunAnalysis}
                  onClick={handleFetchAndAnalyzeProduct}
                  className="px-2 py-0.5 text-[11px] font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-colors shadow-2xs"
                  title="Analyze product mockup image(s) and/or optional product URL"
                >
                  {isAnalyzingProduct ? (
                    <Loader2 className="w-3 h-3 animate-spin text-amber-800" />
                  ) : (
                    <SearchCheck className="w-3 h-3 text-amber-800" />
                  )}
                  <span>{analyzeButtonLabel}</span>
                </button>

                {meta.productUrl && (
                  <a
                    href={meta.productUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#8c8477] hover:text-[#1e232a]"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMPACT SINGLE-ROW STICKY WORKFLOW BAR (~40px) */}
      <header className="sticky top-0 z-20 px-3 sm:px-6 py-1.5 bg-[#f6f3eb]/95 backdrop-blur-xs border-b border-[#e5dfd3] shrink-0">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-2 shrink-0">
            {activeStep === 'edit' && (
              <span
                className="font-editorial font-bold text-xs text-[#1e232a] truncate max-w-36 sm:max-w-48 pr-2 border-r border-[#dcd6ca]"
                title={project.title}
              >
                {project.title || 'Untitled Product'}
              </span>
            )}

            {/* 4-Step Workflow Navigation */}
            <nav
              aria-label="Product Copy Workflow"
              className="flex items-center bg-[#e8e2d5] p-0.5 rounded-lg text-xs font-medium text-[#4a443b] shrink-0"
            >
              {WORKFLOW_STEPS.map((step) => {
                const Icon = step.icon;
                const isActive = activeStep === step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setActiveStep(step.id)}
                    className={`px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-white shadow-2xs text-[#1e232a] font-semibold'
                        : 'hover:text-[#1e232a]'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full text-[10px] font-bold inline-flex items-center justify-center ${
                        isActive
                          ? 'bg-[#1e232a] text-white'
                          : 'bg-[#d8d0c1] text-[#4a443b]'
                      }`}
                    >
                      {step.stepNumber}
                    </span>
                    <Icon className="w-3 h-3 hidden md:inline" />
                    <span className="text-[11px]">{step.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Compact Action & Model Strip on the Same Row */}
          <div className="flex items-center gap-1.5 shrink-0 text-xs">
            <button
              type="button"
              disabled={isLoading}
              onClick={handleGenerateFullCopy}
              className="px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 inline-flex items-center gap-1 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
              title="Propose a full draft via the non-destructive diff review modal"
            >
              <Sparkles className="w-3 h-3 text-amber-700" />
              <span className="hidden sm:inline">Generate Full Copy Proposal</span>
              <span className="sm:hidden">Generate Copy</span>
            </button>

            <button
              type="button"
              onClick={() => (onTogglePanel ? onTogglePanel('review') : undefined)}
              className="px-2 py-1 rounded-md text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 inline-flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
              title="Open AI Editorial Review Panel"
            >
              <ShieldCheck className="w-3 h-3 text-amber-700" />
              <span className="hidden lg:inline">Editorial Review</span>
            </button>

            {/* AI Model Selector */}
            <div className="flex items-center gap-1 bg-white border border-[#dcd6ca] px-2 py-0.5 rounded-md shadow-2xs text-xs">
              <Cpu className="w-3 h-3 text-indigo-700" />
              <select
                aria-label="Product Copy AI Model"
                value={project.modelOverride || ''}
                onChange={(e) => {
                  onChange({
                    ...project,
                    modelOverride: (e.target.value as ModelId) || undefined,
                    updatedAt: new Date().toISOString(),
                  });
                }}
                className="bg-transparent text-[11px] font-semibold text-[#1e232a] focus:outline-hidden cursor-pointer max-w-36 truncate"
                title={
                  project.modelOverride
                    ? `Project Override: ${getModelDefinition(project.modelOverride).displayName}`
                    : `Product Studio Default: ${getModelDefinition('gemini-3.6-flash').displayName}`
                }
              >
                <option value="">
                  Default ({getModelDefinition('gemini-3.6-flash').displayName})
                </option>
                {ALL_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN WORKFLOW BODY */}
      <div className={activeStep === 'edit' ? 'flex-1 flex overflow-hidden' : 'flex-1 flex flex-col'}>
        {/* ===================================================================
            SECTION 1: PRODUCT SETUP
            Saved Context Profiles, Mockup Upload, Optional URL & Epistemic Analysis
           =================================================================== */}
        {activeStep === 'setup' && (
          <div className="p-5 sm:p-6 max-w-4xl mx-auto w-full space-y-6 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e5dfd3] pb-3">
              <div>
                <h3 className="font-editorial text-xl font-bold text-[#1e232a]">
                  1. Product Setup & Epistemic Analysis
                </h3>
                <p className="text-xs text-[#736c61] mt-0.5">
                  Apply a saved context profile, upload product mockup image(s), optionally enter a Fourthwall/product URL, and review Verified Facts, Visible Observations, and Editorial Inferences.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveStep('direction')}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg inline-flex items-center gap-1.5 cursor-pointer shrink-0 self-start sm:self-auto"
              >
                <span>Next: Editorial Direction</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ===============================================================
                1A. SAVED PRODUCT CONTEXT PROFILES
               =============================================================== */}
            <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0ece3] pb-2.5">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-emerald-800 shrink-0" />
                  <div>
                    <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                      Saved Product Context Profiles
                    </h4>
                    <p className="text-[11px] text-[#736c61]">
                      Reuse recipient, gift guide/occasion, target audience, and editorial tone notes across products.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    aria-label="Select Product Context Profile"
                    value={meta.contextProfileId || ''}
                    onChange={(e) => handleSelectContextProfile(e.target.value)}
                    className="p-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf8f4] text-xs font-medium text-[#1e232a]"
                  >
                    <option value="">— Select Context Profile —</option>
                    {contextProfiles.map((prof) => (
                      <option key={prof.id} value={prof.id}>
                        {prof.name}
                        {prof.isDefault ? ' (Default)' : ''}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={handleOpenNewProfileEditor}
                    className="px-2.5 py-1.5 rounded-lg bg-[#f3efe6] hover:bg-[#e8e2d5] text-[#1e232a] font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Profile</span>
                  </button>
                </div>
              </div>

              {/* Overwrite Confirmation Banner when applying profile over existing data */}
              {pendingProfileToApply && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                  <div className="text-amber-950">
                    <strong>Apply "{pendingProfileToApply.name}"?</strong> Some recipient or audience fields already contain text.
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => applyProfileToProject(pendingProfileToApply, 'empty_only')}
                      className="px-2.5 py-1 rounded-md bg-white border border-amber-300 text-amber-950 hover:bg-amber-100 font-semibold cursor-pointer"
                    >
                      Fill Empty Fields Only
                    </button>
                    <button
                      type="button"
                      onClick={() => applyProfileToProject(pendingProfileToApply, 'overwrite_all')}
                      className="px-2.5 py-1 rounded-md bg-amber-900 text-white hover:bg-amber-950 font-semibold cursor-pointer"
                    >
                      Replace Context Fields
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingProfileToApply(null)}
                      className="px-2 py-1 text-amber-800 hover:text-amber-950 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Saved Profile Pills (Edit / Set Default / Delete) */}
              {contextProfiles.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {contextProfiles.map((prof) => {
                    const isSelected = meta.contextProfileId === prof.id;
                    return (
                      <div
                        key={prof.id}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] inline-flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                            : 'bg-[#faf8f4] border-[#e5dfd3] text-[#4a443b]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectContextProfile(prof.id)}
                          className="cursor-pointer hover:underline"
                        >
                          {prof.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleDefaultProfile(prof)}
                          title={prof.isDefault ? 'Default Profile (click to unset)' : 'Set as Default Profile'}
                          className={`p-0.5 rounded cursor-pointer ${
                            prof.isDefault
                              ? 'text-amber-600'
                              : 'text-stone-400 hover:text-amber-600'
                          }`}
                        >
                          <Star
                            className="w-3 h-3"
                            fill={prof.isDefault ? 'currentColor' : 'none'}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditProfileEditor(prof)}
                          title="Edit Profile"
                          className="p-0.5 text-stone-500 hover:text-stone-800 cursor-pointer"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProfile(prof.id)}
                          title="Delete Profile"
                          className="p-0.5 text-stone-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Inline Create / Edit Profile Form */}
              {isProfileEditorOpen && (
                <div className="p-4 bg-[#f7f4ec] border border-[#dcd6ca] rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="font-bold text-xs text-[#1e232a]">
                      {editingProfileId ? 'Edit Product Context Profile' : 'Create Product Context Profile'}
                    </h5>
                    <button
                      type="button"
                      onClick={() => setIsProfileEditorOpen(false)}
                      className="text-stone-500 hover:text-stone-800 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-[#5c5447] mb-1">Profile Name *</label>
                      <input
                        type="text"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        placeholder="e.g. Science & Lab Gift Guide"
                        className="w-full p-2 rounded-md border border-[#dcd6ca] bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#5c5447] mb-1">
                        Gift Guide or Occasion
                      </label>
                      <input
                        type="text"
                        value={profileForm.giftGuideOrOccasion}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, giftGuideOrOccasion: e.target.value })
                        }
                        placeholder="e.g. Physics & Laboratory Collection"
                        className="w-full p-2 rounded-md border border-[#dcd6ca] bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#5c5447] mb-1">
                        Intended Recipient
                      </label>
                      <input
                        type="text"
                        value={profileForm.intendedRecipient}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, intendedRecipient: e.target.value })
                        }
                        placeholder="e.g. Research scientists, educators, lab mentors"
                        className="w-full p-2 rounded-md border border-[#dcd6ca] bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#5c5447] mb-1">
                        Target Audience
                      </label>
                      <input
                        type="text"
                        value={profileForm.targetAudience}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, targetAudience: e.target.value })
                        }
                        placeholder="e.g. Readers who appreciate precision and dry scientific wit"
                        className="w-full p-2 rounded-md border border-[#dcd6ca] bg-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-semibold text-[#5c5447] mb-1">
                      Editorial Context & Tone Notes
                    </label>
                    <textarea
                      rows={2}
                      value={profileForm.contextNotes}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, contextNotes: e.target.value })
                      }
                      placeholder="Standing guidance for products using this profile..."
                      className="w-full p-2 rounded-md border border-[#dcd6ca] bg-white"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <label className="inline-flex items-center gap-2 text-xs text-[#4a443b] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={profileForm.isDefault}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, isDefault: e.target.checked })
                        }
                      />
                      <span>Set as default profile for new Product Copy projects</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsProfileEditorOpen(false)}
                        className="px-3 py-1.5 rounded-lg border border-[#dcd6ca] bg-white text-[#4a443b] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!profileForm.name.trim()}
                        onClick={handleSaveProfileForm}
                        className="px-3.5 py-1.5 rounded-lg bg-[#1e232a] text-white font-semibold disabled:opacity-50 cursor-pointer"
                      >
                        Save Profile
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Active Project Context Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#f0ece3]">
                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Intended Recipient
                  </label>
                  <input
                    type="text"
                    value={meta.intendedRecipient || ''}
                    onChange={(e) => handleUpdateMeta('intendedRecipient', e.target.value)}
                    placeholder="e.g. Map collectors, history teachers, field architects"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('intendedRecipient', 'Intended Recipient', false)}
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Gift Guide or Occasion
                  </label>
                  <input
                    type="text"
                    value={meta.giftGuideOrOccasion || ''}
                    onChange={(e) => handleUpdateMeta('giftGuideOrOccasion', e.target.value)}
                    placeholder="e.g. History Buffs Gift Guide, Academic Appreciation"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Target Audience
                  </label>
                  <input
                    type="text"
                    value={meta.targetAudience || ''}
                    onChange={(e) => handleUpdateMeta('targetAudience', e.target.value)}
                    placeholder="e.g. Discerning enthusiasts who value durability over trends"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('targetAudience', 'Target Audience', false)}
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Editorial Context & Tone Notes
                  </label>
                  <input
                    type="text"
                    value={meta.contextNotes || ''}
                    onChange={(e) => handleUpdateMeta('contextNotes', e.target.value)}
                    placeholder="e.g. Emphasize archival typography and understated academic wit"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* ===============================================================
                1B. PRODUCT MOCKUP UPLOAD, OPTIONAL URL & MULTIMODAL ANALYSIS
               =============================================================== */}
            <div className="p-5 bg-gradient-to-br from-amber-50/90 to-amber-100/40 border border-amber-300/80 rounded-2xl shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-3">
                <div className="flex items-center gap-2 text-amber-950 font-semibold text-sm">
                  <Sparkles className="w-5 h-5 text-amber-700 shrink-0" />
                  <div>
                    <h4 className="font-editorial font-bold text-base text-amber-950">
                      Product Input: Mockup Image(s) & Optional Product URL
                    </h4>
                    <p className="text-xs text-amber-900 font-normal">
                      Upload one or more mockup images and/or provide a Fourthwall/product URL. Analysis separates Verified Facts, Visible Observations, and Editorial Inferences.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isAnalyzingProduct || !canRunAnalysis}
                  onClick={handleFetchAndAnalyzeProduct}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-900 hover:bg-amber-950 rounded-xl transition-colors inline-flex items-center gap-2 shadow-xs shrink-0 cursor-pointer disabled:opacity-50"
                >
                  {isAnalyzingProduct ? (
                    <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                  ) : (
                    <SearchCheck className="w-4 h-4 text-amber-300" />
                  )}
                  <span>{analyzeButtonLabel}</span>
                </button>
              </div>

              {/* Product Identity & Optional URL Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white/80 p-3.5 rounded-xl border border-amber-200/80">
                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Product Name</label>
                  <input
                    type="text"
                    value={meta.productName}
                    onChange={(e) => handleUpdateMeta('productName', e.target.value)}
                    placeholder="e.g. Viking Norse Mythology Hoodie"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-white"
                  />
                  {renderFactSuggestionPill('productName', 'Product Name', true)}
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Product Category / Type
                  </label>
                  <input
                    type="text"
                    value={meta.productType}
                    onChange={(e) => handleUpdateMeta('productType', e.target.value)}
                    placeholder="e.g. Heavyweight Hoodie, Ceramic Mug"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-white"
                  />
                  {renderFactSuggestionPill('productType', 'Product Category', true)}
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Product URL <span className="font-normal text-[#8c8477]">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={meta.productUrl}
                    onChange={(e) => handleUpdateMeta('productUrl', e.target.value)}
                    placeholder="https://... (leave blank for mockup-only)"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-white font-mono"
                  />
                  {renderFactSuggestionPill('productUrl', 'Product URL', true)}
                </div>
              </div>

              {/* Mockup Image Upload & Gallery */}
              <div className="bg-white/85 p-4 rounded-xl border border-amber-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-amber-800" />
                    <div>
                      <span className="font-bold text-xs text-[#1e232a]">
                        Product Mockup Images ({mockupImages.length}/{MAX_MOCKUP_IMAGES_PER_PRODUCT})
                      </span>
                      <p className="text-[11px] text-[#736c61]">
                        Client-side compressed for safe storage; stripped from historical version snapshots. Select a Primary Image for visual focus.
                      </p>
                    </div>
                  </div>

                  <div>
                    <input
                      ref={mockupFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      onChange={handleMockupFilesSelected}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={
                        isCompressingImage || mockupImages.length >= MAX_MOCKUP_IMAGES_PER_PRODUCT
                      }
                      onClick={() => mockupFileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-[#1e232a] hover:bg-[#2d3440] text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isCompressingImage ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Upload className="w-3.5 h-3.5" />
                      )}
                      <span>{isCompressingImage ? 'Compressing...' : 'Upload Mockup Image(s)'}</span>
                    </button>
                  </div>
                </div>

                {imageUploadError && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs flex items-center justify-between">
                    <span>{imageUploadError}</span>
                    <button
                      type="button"
                      onClick={() => setImageUploadError(null)}
                      className="text-rose-700 hover:text-rose-950"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {mockupImages.length === 0 ? (
                  <div className="p-6 border-2 border-dashed border-[#dcd6ca] rounded-xl text-center text-[#736c61]">
                    <p className="font-medium text-xs text-[#4a443b]">
                      No mockup images uploaded yet.
                    </p>
                    <p className="text-[11px] mt-0.5">
                      Upload PNG, JPEG, WebP, or GIF product mockups to analyze visible text, graphic motifs, colors, and garment/object style.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {mockupImages.map((img) => {
                      const kbSize = img.compressedSizeBytes
                        ? `${Math.max(1, Math.round(img.compressedSizeBytes / 1024))} KB`
                        : '';
                      return (
                        <div
                          key={img.id}
                          className={`rounded-xl border p-2 bg-white flex flex-col justify-between gap-2 ${
                            img.isPrimary
                              ? 'border-amber-600 ring-2 ring-amber-400/50'
                              : 'border-[#e5dfd3]'
                          }`}
                        >
                          <div className="relative aspect-square rounded-lg bg-[#f6f3eb] overflow-hidden flex items-center justify-center">
                            {img.dataUrl ? (
                              <img
                                src={img.dataUrl}
                                alt={img.name}
                                className="max-w-full max-h-full object-contain"
                              />
                            ) : (
                              <span className="text-[11px] text-[#8c8477]">Mockup Stored</span>
                            )}
                            {img.isPrimary && (
                              <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-amber-900 text-white text-[10px] font-bold inline-flex items-center gap-1 shadow-xs">
                                <Star className="w-2.5 h-2.5" fill="currentColor" />
                                Primary
                              </span>
                            )}
                          </div>

                          <div className="space-y-1">
                            <div className="truncate font-semibold text-[11px] text-[#1e232a]">
                              {img.name}
                            </div>
                            <div className="text-[10px] text-[#736c61] flex items-center justify-between">
                              <span>
                                {img.width && img.height ? `${img.width}×${img.height}` : img.mimeType}
                              </span>
                              {kbSize && <span>{kbSize}</span>}
                            </div>
                            <div className="flex items-center justify-between gap-1 pt-1 border-t border-[#f0ece3]">
                              {!img.isPrimary ? (
                                <button
                                  type="button"
                                  onClick={() => handleSetPrimaryMockup(img.id)}
                                  className="px-2 py-0.5 rounded bg-[#f3efe6] hover:bg-amber-100 text-[#4a443b] hover:text-amber-950 text-[10px] font-semibold cursor-pointer"
                                >
                                  Set Primary
                                </button>
                              ) : (
                                <span className="text-[10px] font-semibold text-amber-800">
                                  Primary Image
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveMockup(img.id)}
                                className="p-1 text-stone-400 hover:text-rose-600 cursor-pointer"
                                title="Remove mockup image"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Analysis Status, Retry & Suggestion Banners */}
              {researchStatusMsg && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 animate-in fade-in duration-150 ${
                    researchStatusMsg.isError
                      ? 'bg-rose-50 text-rose-900 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-950 border border-emerald-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {researchStatusMsg.isError ? (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <span className="break-words">{researchStatusMsg.text}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {researchStatusMsg.isError && canRunAnalysis && (
                      <button
                        type="button"
                        disabled={isAnalyzingProduct}
                        onClick={handleFetchAndAnalyzeProduct}
                        className="px-2.5 py-1 rounded-lg bg-rose-800 text-white hover:bg-rose-950 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setResearchStatusMsg(null)}
                      className="p-0.5 text-stone-500 hover:text-stone-800 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {pendingFactSuggestions && Object.keys(pendingFactSuggestions).length > 0 && (
                <div className="p-3 bg-amber-100/90 border border-amber-300 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-950 min-w-0 font-medium">
                    <Sparkles className="w-4 h-4 text-amber-800 shrink-0" />
                    <span className="truncate">
                      Product Analysis found{' '}
                      <strong>{Object.keys(pendingFactSuggestions).length}</strong> suggested
                      updates for already-populated fields below.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleApplyAllFactSuggestions}
                      className="px-3 py-1 text-xs font-bold text-white bg-amber-900 hover:bg-amber-950 rounded-lg transition-colors cursor-pointer shadow-2xs"
                    >
                      Apply All
                    </button>
                    <button
                      type="button"
                      onClick={handleDismissAllFactSuggestions}
                      className="px-2 py-1 text-xs font-medium text-amber-900 hover:text-amber-950 cursor-pointer"
                    >
                      Dismiss All
                    </button>
                  </div>
                </div>
              )}

              {canonicalUrlSuggestion && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-950 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate text-[11px]">
                      Canonical Product URL:{' '}
                      <code className="font-mono">{canonicalUrlSuggestion}</code>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateMeta('productUrl', canonicalUrlSuggestion);
                        setCanonicalUrlSuggestion(null);
                      }}
                      className="px-2 py-0.5 bg-emerald-800 text-white hover:bg-emerald-950 rounded text-[10px] font-bold cursor-pointer"
                    >
                      Use Canonical
                    </button>
                    <button
                      type="button"
                      onClick={() => setCanonicalUrlSuggestion(null)}
                      className="px-1.5 py-0.5 text-emerald-800 hover:text-emerald-950 text-[10px] font-medium cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ===============================================================
                1C. EPISTEMIC SECTION 1: VERIFIED FACTS (SOURCED FROM URL)
               =============================================================== */}
            <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0ece3] pb-2.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <div>
                    <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                      A. Verified Facts (Sourced Product Specifications)
                    </h4>
                    <p className="text-[11px] text-[#736c61]">
                      Strictly grounded in the product page URL or manual specification sheets. Never inferred from mockup images.
                    </p>
                  </div>
                </div>
                {epistemic.verifiedFacts.sourceUrl ? (
                  <a
                    href={epistemic.verifiedFacts.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-medium inline-flex items-center gap-1 hover:bg-emerald-100"
                  >
                    <Globe className="w-3 h-3" />
                    <span className="truncate max-w-[220px]">
                      Source: {epistemic.verifiedFacts.sourceUrl}
                    </span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ) : (
                  <span className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium">
                    No Source URL Provided — Enter Specs Manually if Known
                  </span>
                )}
              </div>

              {epistemic.verifiedFacts.verificationNotes && (
                <div className="p-2.5 rounded-lg bg-[#faf8f4] border border-[#e5dfd3] text-[11px] text-[#5c5447]">
                  <strong>Verification Status:</strong> {epistemic.verifiedFacts.verificationNotes}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#5c5447]">Price</label>
                    {renderVerificationStatusBadge(
                      'price',
                      epistemic.verifiedFacts.price || meta.price
                    )}
                  </div>
                  <input
                    type="text"
                    value={epistemic.verifiedFacts.price ?? meta.price ?? ''}
                    onChange={(e) => handleUpdateVerifiedFact('price', e.target.value)}
                    placeholder="e.g. $54.00 USD (leave blank if unknown)"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('price', 'Price', true)}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#5c5447]">Available Variants / Sizes</label>
                    {renderVerificationStatusBadge(
                      'variants',
                      epistemic.verifiedFacts.variants || meta.variantsSpec
                    )}
                  </div>
                  <input
                    type="text"
                    value={epistemic.verifiedFacts.variants ?? meta.variantsSpec ?? ''}
                    onChange={(e) => handleUpdateVerifiedFact('variants', e.target.value)}
                    placeholder="e.g. S, M, L, XL, 2XL or 11oz / 15oz"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('variantsSpec', 'Variants', true)}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#5c5447]">Materials & Provenance</label>
                    {renderVerificationStatusBadge(
                      'materials',
                      epistemic.verifiedFacts.materials || meta.materials
                    )}
                  </div>
                  <input
                    type="text"
                    value={epistemic.verifiedFacts.materials ?? meta.materials ?? ''}
                    onChange={(e) => handleUpdateVerifiedFact('materials', e.target.value)}
                    placeholder="e.g. 80% ringspun cotton / 20% polyester fleece, 9.5 oz/yd²"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('materials', 'Materials', true)}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#5c5447]">Physical Features</label>
                    {renderVerificationStatusBadge(
                      'features',
                      epistemic.verifiedFacts.features || meta.features
                    )}
                  </div>
                  <input
                    type="text"
                    value={epistemic.verifiedFacts.features ?? meta.features ?? ''}
                    onChange={(e) => handleUpdateVerifiedFact('features', e.target.value)}
                    placeholder="e.g. Double-needle stitching, jersey-lined hood, metal grommets"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('features', 'Physical Features', true)}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#5c5447]">Dimensions & Weight</label>
                    {renderVerificationStatusBadge(
                      'dimensions',
                      epistemic.verifiedFacts.dimensions || meta.dimensions
                    )}
                  </div>
                  <input
                    type="text"
                    value={epistemic.verifiedFacts.dimensions ?? meta.dimensions ?? ''}
                    onChange={(e) => handleUpdateVerifiedFact('dimensions', e.target.value)}
                    placeholder="e.g. 38mm diameter, 11.5mm thickness, 140g"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('dimensions', 'Dimensions', true)}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#5c5447]">Listed Colors & Finishes</label>
                    {renderVerificationStatusBadge(
                      'colors',
                      epistemic.verifiedFacts.colors || meta.colors
                    )}
                  </div>
                  <input
                    type="text"
                    value={epistemic.verifiedFacts.colors ?? meta.colors ?? ''}
                    onChange={(e) => handleUpdateVerifiedFact('colors', e.target.value)}
                    placeholder="e.g. Vintage Black, Navy, Bone"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('colors', 'Colors & Finishes', true)}
                </div>
              </div>

              <div className="pt-2 border-t border-[#f0ece3] space-y-3">
                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Additional Verified Specifications
                  </label>
                  <textarea
                    rows={2}
                    value={epistemic.verifiedFacts.additionalSpecs ?? meta.additionalFacts ?? ''}
                    onChange={(e) => handleUpdateVerifiedFact('additionalSpecs', e.target.value)}
                    placeholder="Care instructions, print method, origin, or other verified product facts..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('additionalFacts', 'Additional Facts', true)}
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Raw Manufacturer Specification Notes (Verbatim Source Material)
                  </label>
                  <textarea
                    rows={3}
                    value={meta.rawProductInfo}
                    onChange={(e) => handleUpdateMeta('rawProductInfo', e.target.value)}
                    placeholder="Paste verbatim manufacturer spec sheets, alloy designations, or Fourthwall product page details..."
                    className="w-full text-xs p-2.5 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white font-mono text-[#1e232a] leading-relaxed"
                  />
                  {renderFactSuggestionPill('rawProductInfo', 'Raw Spec Notes', true)}
                </div>
              </div>
            </div>

            {/* ===============================================================
                1D. EPISTEMIC SECTION 2: VISIBLE OBSERVATIONS (FROM MOCKUP)
               =============================================================== */}
            <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0ece3] pb-2.5">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-700 shrink-0" />
                  <div>
                    <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                      B. Visible Observations (From Product Mockup)
                    </h4>
                    <p className="text-[11px] text-[#736c61]">
                      Details directly visible in the uploaded mockup image(s): printed text, graphic motifs, colors, and silhouette.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-900 text-[10px] font-semibold">
                  Visual Observation Only
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Visible Text & Inscriptions
                  </label>
                  <textarea
                    rows={2}
                    value={epistemic.visibleObservations.visibleText || ''}
                    onChange={(e) =>
                      handleUpdateVisibleObservation('visibleText', e.target.value)
                    }
                    placeholder="Exact words, dates, formulas, or captions visible on the mockup..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Graphic Design & Imagery
                  </label>
                  <textarea
                    rows={2}
                    value={epistemic.visibleObservations.designAndImagery || ''}
                    onChange={(e) =>
                      handleUpdateVisibleObservation('designAndImagery', e.target.value)
                    }
                    placeholder="Illustrations, linework, diagrams, symbols, and layout visible in the image..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('designDescription', 'Visible Design', false)}
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Garment or Object Style
                  </label>
                  <input
                    type="text"
                    value={epistemic.visibleObservations.garmentOrObjectStyle || ''}
                    onChange={(e) =>
                      handleUpdateVisibleObservation('garmentOrObjectStyle', e.target.value)
                    }
                    placeholder="e.g. Heavyweight pullover hoodie, 15oz ceramic mug, unframed archival print"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Visible Colors & Contrast
                  </label>
                  <input
                    type="text"
                    value={epistemic.visibleObservations.visibleColors || ''}
                    onChange={(e) =>
                      handleUpdateVisibleObservation('visibleColors', e.target.value)
                    }
                    placeholder="e.g. Charcoal garment base with parchment-cream line art"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#5c5447] mb-1">
                  Additional Visual Details & Placement
                </label>
                <input
                  type="text"
                  value={epistemic.visibleObservations.visualDetails || ''}
                  onChange={(e) =>
                    handleUpdateVisibleObservation('visualDetails', e.target.value)
                  }
                  placeholder="e.g. Centered chest graphic, distressed woodcut texture, serif specimen labels"
                  className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                />
              </div>
            </div>

            {/* ===============================================================
                1E. EPISTEMIC SECTION 3: EDITORIAL INFERENCES (HYPOTHESES)
               =============================================================== */}
            <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0ece3] pb-2.5">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-700 shrink-0" />
                  <div>
                    <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                      C. Editorial Inferences (Positioning & Contextual Hypotheses)
                    </h4>
                    <p className="text-[11px] text-[#736c61]">
                      AI-suggested conceptual framing, cultural/historical associations, and recipient relevance. Never treated as hard product specs.
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-semibold">
                  Editorial Inference — Not a Sourced Fact
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Design Concept & Aesthetic Framing
                  </label>
                  <textarea
                    rows={2}
                    value={epistemic.editorialInferences.designConcept ?? meta.designConcept ?? ''}
                    onChange={(e) =>
                      handleUpdateEditorialInference('designConcept', e.target.value)
                    }
                    placeholder="Core aesthetic philosophy or visual thesis..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('designConcept', 'Design Concept', false)}
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Historical / Scientific / Cultural Context
                  </label>
                  <textarea
                    rows={2}
                    value={
                      epistemic.editorialInferences.historicalOrCulturalContext ??
                      meta.historicalContext ??
                      ''
                    }
                    onChange={(e) =>
                      handleUpdateEditorialInference('historicalOrCulturalContext', e.target.value)
                    }
                    placeholder="Historical era inspiration, scientific diagram lineage, or cultural motif..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                  {renderFactSuggestionPill('historicalContext', 'Historical Context', false)}
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Recipient Resonance & Fit Hypothesis
                  </label>
                  <textarea
                    rows={2}
                    value={epistemic.editorialInferences.recipientResonance || ''}
                    onChange={(e) =>
                      handleUpdateEditorialInference('recipientResonance', e.target.value)
                    }
                    placeholder="Why this design or object resonates with the intended recipient and occasion..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Editorial Caution & Unverified Claims to Avoid
                  </label>
                  <textarea
                    rows={2}
                    value={epistemic.editorialInferences.editorialCaution || ''}
                    onChange={(e) =>
                      handleUpdateEditorialInference('editorialCaution', e.target.value)
                    }
                    placeholder="Remind writers which specs remain unverified and should not be asserted as fact..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setActiveStep('direction')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Continue to Editorial Direction</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================
            SECTION 2: EDITORIAL DIRECTION
            Coordinated Audience Psychology, 4–5 Positioning Angles, 6+ Editorial Titles & Editable Positioning
           =================================================================== */}
        {activeStep === 'direction' && (
          <div className="p-5 sm:p-6 max-w-4xl mx-auto w-full space-y-6 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e5dfd3] pb-3">
              <div>
                <h3 className="font-editorial text-xl font-bold text-[#1e232a]">
                  2. Editorial Direction & Creative Studio
                </h3>
                <p className="text-xs text-[#736c61] mt-0.5">
                  Generate recipient personas, buyer motivations, audience mismatches, 4–5 strategic positioning angles, and 6+ distinct editorial title options from your reviewed facts and observations.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveStep('setup')}
                  className="px-3 py-1.5 text-xs font-semibold text-[#4a443b] bg-[#e8e2d5] hover:bg-[#dcd4c4] rounded-lg inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Product Setup</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep('brief')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Next: Writing Brief</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ===============================================================
                2A. EDITORIAL DIRECTION GENERATION CONTROL BAR
               =============================================================== */}
            <div className="p-5 bg-gradient-to-br from-amber-50/95 to-amber-100/40 border border-amber-300/80 rounded-2xl shadow-sm space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-amber-200/80 pb-3">
                <div className="flex items-start gap-2.5 text-amber-950">
                  <Compass className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-editorial font-bold text-base text-amber-950">
                      Generate Editorial Direction (Personas, 4–5 Angles & 6+ Titles)
                    </h4>
                    <p className="text-xs text-amber-900 font-normal">
                      Uses your reviewed Verified Facts, Visible Observations, and Context Profile. Generation never overwrites your active Headline, Standfirst, or Positioning fields—click a card below to apply it.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isGeneratingDirection}
                    onClick={() => handleGenerateEditorialDirection('all')}
                    className="px-4 py-2 text-xs font-bold text-white bg-amber-900 hover:bg-amber-950 rounded-xl transition-colors inline-flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingDirection && generatingScope === 'all' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-amber-300" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-amber-300" />
                    )}
                    <span>
                      {isGeneratingDirection && generatingScope === 'all'
                        ? 'Generating Editorial Direction...'
                        : meta.creativeDirection?.generatedAt
                        ? 'Regenerate All Direction'
                        : 'Generate Editorial Direction'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isGeneratingDirection}
                    onClick={() => handleGenerateEditorialDirection('titles_only')}
                    className="px-3 py-2 text-xs font-semibold text-amber-950 bg-white hover:bg-amber-50 border border-amber-300 rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Regenerate 6+ distinct editorial title options without changing angles or personas"
                  >
                    {isGeneratingDirection && generatingScope === 'titles_only' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-800" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-amber-800" />
                    )}
                    <span>Regenerate Titles (6+)</span>
                  </button>

                  <button
                    type="button"
                    disabled={isGeneratingDirection}
                    onClick={() => handleGenerateEditorialDirection('angles_only')}
                    className="px-3 py-2 text-xs font-semibold text-amber-950 bg-white hover:bg-amber-50 border border-amber-300 rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Regenerate 4–5 positioning angles without changing title options"
                  >
                    {isGeneratingDirection && generatingScope === 'angles_only' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-800" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5 text-amber-800" />
                    )}
                    <span>Regenerate Angles</span>
                  </button>
                </div>
              </div>

              <div className="bg-white/85 p-3.5 rounded-xl border border-amber-200/80 space-y-2">
                <label className="block font-semibold text-[#5c5447]">
                  Optional Editor Guidance for Creative Direction
                </label>
                <input
                  type="text"
                  value={editorDirectionGuidance}
                  onChange={(e) => setEditorDirectionGuidance(e.target.value)}
                  placeholder="e.g. Lean into dry academic humor and tactile workshop heritage; avoid generic Viking cliches..."
                  className="w-full p-2 rounded-md border border-[#dcd6ca] bg-white text-xs"
                />
              </div>

              {creativeDirectionStatusMsg && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center justify-between gap-2 ${
                    creativeDirectionStatusMsg.isError
                      ? 'bg-rose-50 text-rose-900 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-950 border border-emerald-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {creativeDirectionStatusMsg.isError ? (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <span className="break-words">{creativeDirectionStatusMsg.text}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreativeDirectionStatusMsg(null)}
                    className="p-0.5 text-stone-500 hover:text-stone-800 shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* ===============================================================
                2B. AUDIENCE & GIFT PSYCHOLOGY STUDIO
               =============================================================== */}
            {meta.creativeDirection?.audienceAnalysis && (
              <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0ece3] pb-2.5">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-800 shrink-0" />
                    <div>
                      <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                        A. Audience & Gift Psychology (Personas, Motivations & Mismatches)
                      </h4>
                      <p className="text-[11px] text-[#736c61]">
                        Distinguishes who receives the object, why a gift-buyer chooses it, and which mismatched angles to avoid.
                      </p>
                    </div>
                  </div>
                  {meta.creativeDirection.modelUsed && (
                    <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-900 text-[10px] font-semibold">
                      Model: {meta.creativeDirection.modelUsed}
                    </span>
                  )}
                </div>

                {/* Primary Recipient Personas */}
                {meta.creativeDirection.audienceAnalysis.primaryPersonas.length > 0 && (
                  <div className="space-y-2.5">
                    <h5 className="font-editorial font-bold text-xs uppercase tracking-wider text-[#443d34]">
                      Primary Recipient Personas
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {meta.creativeDirection.audienceAnalysis.primaryPersonas.map((persona) => {
                        const isPersonaApplied = (
                          meta.creativeDirection?.selectedPersonaIds || []
                        ).includes(persona.id);
                        return (
                          <div
                            key={persona.id}
                            className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 ${
                              isPersonaApplied
                                ? 'bg-emerald-50/70 border-emerald-400'
                                : 'bg-[#faf8f4] border-[#e5dfd3]'
                            }`}
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-editorial font-bold text-sm text-[#1e232a]">
                                  {persona.name}
                                </span>
                                {isPersonaApplied && (
                                  <span className="px-2 py-0.5 rounded bg-emerald-800 text-white text-[10px] font-bold shrink-0">
                                    Applied
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[#4a443b] leading-relaxed">
                                {persona.profileSummary}
                              </p>
                              <div className="text-[11px] text-[#5c5447] space-y-1 pt-1 border-t border-[#ece7dc]">
                                <div>
                                  <strong className="text-[#1e232a]">Why it resonates:</strong>{' '}
                                  {persona.whyItResonates}
                                </div>
                                <div>
                                  <strong className="text-[#1e232a]">Context of use:</strong>{' '}
                                  {persona.contextOfUse}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => handleApplyPersonaToRecipient(persona)}
                                className="px-2.5 py-1 rounded-md bg-[#1e232a] hover:bg-[#2d3440] text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Check className="w-3 h-3" />
                                <span>Apply to Suited Recipient</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Gift-Buyer Motivations vs. Recipient Perspective */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-2">
                    <h5 className="font-editorial font-bold text-xs text-emerald-950">
                      Gift-Buyer Motivations (Why the Giver Buys It)
                    </h5>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-emerald-950">
                      {meta.creativeDirection.audienceAnalysis.buyerMotivations.map(
                        (m, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {m}
                          </li>
                        )
                      )}
                    </ul>
                  </div>

                  <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200/80 space-y-2">
                    <h5 className="font-editorial font-bold text-xs text-indigo-950">
                      Recipient Perspective (What It Feels Like to Receive)
                    </h5>
                    <p className="text-xs text-indigo-950 leading-relaxed">
                      {meta.creativeDirection.audienceAnalysis.recipientPerspective}
                    </p>
                    {meta.creativeDirection.audienceAnalysis.secondaryAudiences.length > 0 && (
                      <div className="pt-2 border-t border-indigo-200/60 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900">
                          Secondary Audiences:
                        </span>
                        {meta.creativeDirection.audienceAnalysis.secondaryAudiences.map((sa) => (
                          <div key={sa.id} className="text-[11px] text-indigo-950">
                            <strong>{sa.audience}:</strong> {sa.whyItFits}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Audience Mismatches & Editorial Cautions */}
                {meta.creativeDirection.audienceAnalysis.audienceMismatches.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="font-editorial font-bold text-xs uppercase tracking-wider text-rose-900 flex items-center gap-1.5">
                      <Ban className="w-3.5 h-3.5 text-rose-700" />
                      <span>Audience Mismatches & Copy Pitfalls to Avoid</span>
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {meta.creativeDirection.audienceAnalysis.audienceMismatches.map((mm) => (
                        <div
                          key={mm.id}
                          className="p-3 rounded-xl bg-rose-50/60 border border-rose-200/80 flex flex-col justify-between gap-2"
                        >
                          <div className="space-y-1">
                            <div className="font-bold text-xs text-rose-950">
                              Not for: {mm.whoShouldSkip}
                            </div>
                            <p className="text-[11px] text-rose-900 leading-relaxed">
                              <strong>Why it mismatches:</strong> {mm.whyItMismatches}
                            </p>
                            <p className="text-[11px] text-rose-950 leading-relaxed">
                              <strong>Copy caution:</strong> {mm.copyCaution}
                            </p>
                          </div>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleApplyMismatchToAvoid(mm)}
                              className="px-2.5 py-1 rounded-md bg-white hover:bg-rose-100 border border-rose-300 text-rose-950 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3 text-rose-700" />
                              <span>Add to "What to Avoid"</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {meta.creativeDirection.editorialCautions?.length > 0 && (
                      <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-950 space-y-1">
                        <strong className="block text-xs">Editorial Guardrails:</strong>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {meta.creativeDirection.editorialCautions.map((c, idx) => (
                            <li key={idx}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ===============================================================
                2C. POSITIONING ANGLES STUDIO (4–5 STRATEGIC ANGLES)
               =============================================================== */}
            {meta.creativeDirection?.positioningAngles &&
              meta.creativeDirection.positioningAngles.length > 0 && (
                <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0ece3] pb-2.5">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-emerald-800 shrink-0" />
                      <div>
                        <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                          B. Positioning Angles Studio ({meta.creativeDirection.positioningAngles.length} Strategic Angles)
                        </h4>
                        <p className="text-[11px] text-[#736c61]">
                          Assign a <strong>Primary Angle</strong>, optional <strong>Secondary Angles</strong>, or mark an angle to <strong>Avoid</strong>. Explicit selection updates your Positioning synthesis below.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {meta.creativeDirection.positioningAngles.map((angle) => {
                      const role: ProductAngleRole = angle.role || 'unassigned';
                      const isPrimary =
                        role === 'primary' ||
                        meta.creativeDirection?.selectedPrimaryAngleId === angle.id;
                      const isSecondary =
                        role === 'secondary' ||
                        (meta.creativeDirection?.selectedSecondaryAngleIds || []).includes(
                          angle.id
                        );
                      const isAvoid =
                        role === 'do_not_use' ||
                        (meta.creativeDirection?.excludedAngleIds || []).includes(angle.id);

                      return (
                        <div
                          key={angle.id}
                          className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition-colors ${
                            isPrimary
                              ? 'bg-emerald-50/70 border-emerald-500 ring-2 ring-emerald-400/40'
                              : isSecondary
                              ? 'bg-indigo-50/50 border-indigo-300'
                              : isAvoid
                              ? 'bg-rose-50/50 border-rose-300 opacity-85'
                              : 'bg-[#faf8f4] border-[#e5dfd3]'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h5 className="font-editorial font-bold text-sm text-[#1e232a]">
                                  {angle.title}
                                </h5>
                                <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-white border border-[#dcd6ca] text-[10px] font-semibold text-[#5c5447]">
                                  {angle.archetype}
                                </span>
                              </div>

                              {isPrimary && (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-800 text-white text-[10px] font-bold shrink-0">
                                  Primary Angle
                                </span>
                              )}
                              {isSecondary && (
                                <span className="px-2 py-0.5 rounded-md bg-indigo-800 text-white text-[10px] font-bold shrink-0">
                                  Secondary Angle
                                </span>
                              )}
                              {isAvoid && (
                                <span className="px-2 py-0.5 rounded-md bg-rose-800 text-white text-[10px] font-bold shrink-0">
                                  Excluded / Avoid
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-[#1e232a] font-medium leading-relaxed">
                              {angle.coreHook}
                            </p>

                            <div className="text-[11px] text-[#5c5447] space-y-1 pt-1.5 border-t border-[#eae4d8]">
                              <div>
                                <strong className="text-[#1e232a]">Grounding evidence:</strong>{' '}
                                {angle.supportingEvidence}
                              </div>
                              <div>
                                <strong className="text-emerald-900">Emphasize:</strong>{' '}
                                {angle.whatToEmphasize}
                              </div>
                              <div>
                                <strong className="text-rose-900">Risk / Avoid:</strong>{' '}
                                {angle.risksAndWhatToAvoid}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#eae4d8]">
                            <button
                              type="button"
                              onClick={() =>
                                handleAssignAngleRole(
                                  angle.id,
                                  isPrimary ? 'unassigned' : 'primary'
                                )
                              }
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                                isPrimary
                                  ? 'bg-emerald-900 text-white'
                                  : 'bg-white hover:bg-emerald-50 border border-[#dcd6ca] text-[#1e232a]'
                              }`}
                            >
                              {isPrimary ? 'Primary Selected' : 'Set Primary Angle'}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleAssignAngleRole(
                                  angle.id,
                                  isSecondary ? 'unassigned' : 'secondary'
                                )
                              }
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                                isSecondary
                                  ? 'bg-indigo-900 text-white'
                                  : 'bg-white hover:bg-indigo-50 border border-[#dcd6ca] text-[#1e232a]'
                              }`}
                            >
                              {isSecondary ? 'Secondary Selected' : 'Secondary'}
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleAssignAngleRole(
                                  angle.id,
                                  isAvoid ? 'unassigned' : 'do_not_use'
                                )
                              }
                              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer ${
                                isAvoid
                                  ? 'bg-rose-900 text-white'
                                  : 'bg-white hover:bg-rose-50 border border-[#dcd6ca] text-rose-900'
                              }`}
                            >
                              {isAvoid ? 'Marked to Avoid' : 'Avoid'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* ===============================================================
                2D. EDITORIAL TITLE STUDIO (6–8 DISTINCT TITLE OPTIONS + RECOMMENDATION)
               =============================================================== */}
            {meta.creativeDirection?.titleOptions &&
              meta.creativeDirection.titleOptions.length > 0 && (
                <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0ece3] pb-2.5">
                    <div className="flex items-center gap-2">
                      <Type className="w-4 h-4 text-amber-800 shrink-0" />
                      <div>
                        <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                          C. Editorial Title Studio ({meta.creativeDirection.titleOptions.length} Distinct Options)
                        </h4>
                        <p className="text-[11px] text-[#736c61]">
                          Prioritizes clear product category identification, natural phrasing, search intent, and gift appeal. Click <strong>Use Headline + Deck</strong> or <strong>Use Headline Only</strong> to apply.
                        </p>
                      </div>
                    </div>
                    {meta.headline && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-[11px]">
                        Active Headline: <strong>{meta.headline}</strong>
                      </span>
                    )}
                  </div>

                  {/* Recommended Title Banner */}
                  {(() => {
                    const recTitle =
                      meta.creativeDirection.titleOptions.find(
                        (t) =>
                          t.id === meta.creativeDirection?.recommendedTitleId || t.isRecommended
                      ) || meta.creativeDirection.titleOptions[0];
                    if (!recTitle) return null;
                    return (
                      <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-emerald-800 text-white text-[10px] font-bold uppercase tracking-wider">
                              Recommended Overall Title
                            </span>
                            <span className="font-editorial font-bold text-sm text-[#1e232a]">
                              {recTitle.title}
                            </span>
                          </div>
                          {meta.creativeDirection.recommendedTitleRationale && (
                            <p className="text-[11px] text-emerald-950 leading-relaxed">
                              {meta.creativeDirection.recommendedTitleRationale}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSelectTitleOption(recTitle.id, true)}
                            className="px-2.5 py-1 rounded-md bg-emerald-900 hover:bg-emerald-950 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            Use Recommended + Deck
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectTitleOption(recTitle.id, false)}
                            className="px-2.5 py-1 rounded-md bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-950 text-[11px] font-semibold cursor-pointer"
                          >
                            Headline Only
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {meta.creativeDirection.titleOptions.map((opt, idx) => {
                      const isSelected =
                        meta.creativeDirection?.selectedPrimaryTitleId === opt.id ||
                        (Boolean(meta.headline?.trim()) &&
                          meta.headline?.trim() === opt.title.trim());
                      const isRecommended =
                        opt.isRecommended ||
                        meta.creativeDirection?.recommendedTitleId === opt.id;
                      const roleLabel =
                        opt.titleRole === 'editorial_headline'
                          ? 'Editorial / Guide Headline'
                          : opt.titleRole === 'search_and_gift'
                          ? 'Search & Gift Intent'
                          : opt.titleRole === 'domain_specificity'
                          ? 'Domain-Specific Product Title'
                          : 'Storefront Product Title';

                      return (
                        <div
                          key={opt.id}
                          className={`p-4 rounded-xl border flex flex-col justify-between gap-3 transition-colors ${
                            isSelected
                              ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-400/40'
                              : isRecommended
                              ? 'bg-emerald-50/30 border-emerald-300'
                              : 'bg-[#faf8f4] border-[#e5dfd3]'
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="px-2 py-0.5 rounded bg-white border border-[#dcd6ca] text-[10px] font-bold text-[#5c5447]">
                                  #{idx + 1} • {opt.styleArchetype}
                                </span>
                                <span className="px-1.5 py-0.5 rounded bg-[#efeae0] text-[10px] font-medium text-[#4a443b]">
                                  {roleLabel}
                                </span>
                                {isRecommended && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-800 text-white text-[10px] font-bold">
                                    Recommended
                                  </span>
                                )}
                              </div>
                              {isSelected && (
                                <span className="px-2 py-0.5 rounded-md bg-amber-900 text-white text-[10px] font-bold inline-flex items-center gap-1">
                                  <Check className="w-2.5 h-2.5" />
                                  Selected Title
                                </span>
                              )}
                            </div>

                            <h5 className="font-editorial font-bold text-base text-[#1e232a] leading-snug">
                              {opt.title}
                            </h5>

                            {opt.standfirst && (
                              <p className="italic text-xs text-[#4a443b] leading-relaxed bg-white/80 p-2 rounded-lg border border-[#ece7dc]">
                                {opt.standfirst}
                              </p>
                            )}

                            <div className="text-[11px] text-[#5c5447] space-y-1 pt-1">
                              {opt.searchIntent && (
                                <div>
                                  <strong className="text-[#1e232a]">Search &amp; Buyer Intent:</strong>{' '}
                                  {opt.searchIntent}
                                </div>
                              )}
                              <div>
                                <strong className="text-[#1e232a]">Audience Appeal:</strong>{' '}
                                {opt.intendedAppeal}
                              </div>
                              <div>
                                <strong className="text-[#1e232a]">Strategy:</strong>{' '}
                                {opt.rationale}
                              </div>
                              {opt.targetKeywords && opt.targetKeywords.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                  <strong className="text-[10px] text-[#1e232a]">Keywords:</strong>
                                  {opt.targetKeywords.map((kw, kIdx) => (
                                    <span
                                      key={`${opt.id}-kw-${kIdx}`}
                                      className="px-1.5 py-0.5 rounded bg-white border border-[#e2dcd0] text-[10px] text-[#4a443b]"
                                    >
                                      {kw}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                                <div className="p-1.5 rounded bg-emerald-50/70 border border-emerald-200/70 text-[10px] text-emerald-950">
                                  <strong>Strength:</strong> {opt.strengths}
                                </div>
                                <div className="p-1.5 rounded bg-amber-50/70 border border-amber-200/70 text-[10px] text-amber-950">
                                  <strong>Tradeoff:</strong> {opt.weaknesses}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-2 border-t border-[#eae4d8]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleSelectTitleOption(opt.id, true)}
                                className="px-2.5 py-1 rounded-md bg-[#1e232a] hover:bg-[#2d3440] text-white text-[11px] font-semibold cursor-pointer"
                              >
                                Use Headline + Deck
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectTitleOption(opt.id, false)}
                                className="px-2.5 py-1 rounded-md bg-white hover:bg-amber-50 border border-[#dcd6ca] text-[#1e232a] text-[11px] font-semibold cursor-pointer"
                              >
                                Use Headline Only
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleCopyText(`title-${opt.id}`, opt.title)}
                              className="px-2 py-1 text-[10px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 cursor-pointer"
                            >
                              {copiedKey === `title-${opt.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                              <span>{copiedKey === `title-${opt.id}` ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            {/* ===============================================================
                2E. EDITABLE POSITIONING SYNTHESIS (8 LIVE FIELDS)
               =============================================================== */}
            <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
              <div className="border-b border-[#f0ece3] pb-2.5">
                <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                  Active Positioning & Creative Synthesis (Editable)
                </h4>
                <p className="text-[11px] text-[#736c61]">
                  Selecting personas or positioning angles above populates these fields non-destructively. You can also edit any field directly.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Key Selling Angle
                  </label>
                  <input
                    type="text"
                    value={meta.positioning?.keySellingAngle || ''}
                    onChange={(e) => handleUpdatePositioning('keySellingAngle', e.target.value)}
                    placeholder="e.g. An unkillable field tool built for decades of hard use"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Suited Recipient Profile
                  </label>
                  <input
                    type="text"
                    value={meta.positioning?.suitedRecipient || ''}
                    onChange={(e) => handleUpdatePositioning('suitedRecipient', e.target.value)}
                    placeholder="e.g. The quiet perfectionist who cares about screw threading"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    What makes this product interesting?
                  </label>
                  <textarea
                    rows={3}
                    value={meta.positioning?.whatMakesItInteresting || ''}
                    onChange={(e) => handleUpdatePositioning('whatMakesItInteresting', e.target.value)}
                    placeholder="Unique craft technique, historical quirk, or rare utility..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Why would someone want it?
                  </label>
                  <textarea
                    rows={3}
                    value={meta.positioning?.whyWouldSomeoneWantIt || ''}
                    onChange={(e) => handleUpdatePositioning('whyWouldSomeoneWantIt', e.target.value)}
                    placeholder="Ritual satisfaction, lifelong durability, tactile presence..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    What should the copy EMPHASIZE?
                  </label>
                  <textarea
                    rows={2}
                    value={meta.positioning?.whatToEmphasize || ''}
                    onChange={(e) => handleUpdatePositioning('whatToEmphasize', e.target.value)}
                    placeholder="e.g. Heavy brass patina, hand-stitched welt, bench origin"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    What should the copy AVOID?
                  </label>
                  <textarea
                    rows={2}
                    value={meta.positioning?.whatToAvoid || ''}
                    onChange={(e) => handleUpdatePositioning('whatToAvoid', e.target.value)}
                    placeholder="e.g. Mentioning luxury pricing, fashion trends, or tech buzzwords"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Emotional Angle (Optional)
                  </label>
                  <input
                    type="text"
                    value={meta.positioning?.emotionalAngle || ''}
                    onChange={(e) => handleUpdatePositioning('emotionalAngle', e.target.value)}
                    placeholder="e.g. Nostalgia for field notebooks and tactile paper"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">
                    Historical / Heritage Angle (Optional)
                  </label>
                  <input
                    type="text"
                    value={meta.positioning?.historicalAngle || ''}
                    onChange={(e) => handleUpdatePositioning('historicalAngle', e.target.value)}
                    placeholder="e.g. Rooted in 1920s naval navigational gear"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setActiveStep('setup')}
                className="px-3.5 py-2 text-xs font-semibold text-[#4a443b] bg-[#e8e2d5] hover:bg-[#dcd4c4] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Product Setup</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStep('brief')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Continue to Writing Brief</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================
            SECTION 3: WRITING BRIEF
            External writing prompt with length presets, structured copy fields, safe editor import, and collapsed SEO/variants
           =================================================================== */}
        {activeStep === 'brief' && (
          <div className="p-5 sm:p-6 max-w-4xl mx-auto w-full space-y-6 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e5dfd3] pb-3">
              <div>
                <h3 className="font-editorial text-xl font-bold text-[#1e232a]">
                  3. Writing Brief & Copy Assembly
                </h3>
                <p className="text-xs text-[#736c61] mt-0.5">
                  Copy the de-biased writing prompt for ChatGPT / Claude, refine structured copy fields, or send your draft safely into the Studio Editor.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveStep('direction')}
                  className="px-3 py-1.5 text-xs font-semibold text-[#4a443b] bg-[#e8e2d5] hover:bg-[#dcd4c4] rounded-lg inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Editorial Direction</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveStep('edit')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Next: Edit Copy</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* External Writing Prompt Card with Selectable Sections & Word-Count Enforcement */}
            <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#f0ece3] pb-3">
                <div>
                  <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                    External Writing Prompt &amp; Section Blueprint (ChatGPT / Claude)
                  </h4>
                  <p className="text-[11px] text-[#736c61]">
                    Choose which sections to include, set your target word count, and copy a ready-to-run editorial prompt that suppresses redundant product-page specs.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <select
                    aria-label="Brief Length Preset"
                    value={meta.briefLengthPreset || 'standard_editorial'}
                    onChange={(e) =>
                      handleUpdateBriefLengthPreset(e.target.value as ProductBriefLengthPreset)
                    }
                    className="p-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf8f4] text-xs font-semibold text-[#1e232a]"
                  >
                    <option value="concise_fourthwall">Concise Storefront (~140 words)</option>
                    <option value="standard_editorial">Standard Editorial (~180 words)</option>
                    <option value="object_monograph">Deep Object Monograph (~350 words)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleCopyText('external_prompt', externalWritingPrompt)}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    {copiedKey === 'external_prompt' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {copiedKey === 'external_prompt' ? 'Prompt Copied!' : 'Copy Writing Prompt'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Word-Count Target & Counting Rules Bar */}
              <div className="p-3.5 rounded-lg bg-[#faf8f4] border border-[#e5dfd3] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="product-target-word-count"
                      className="text-xs font-bold text-[#1e232a]"
                    >
                      Target Word Count:
                    </label>
                    <input
                      id="product-target-word-count"
                      type="number"
                      min={60}
                      max={1200}
                      step={10}
                      value={resolvedBriefConfig.targetWordCount}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        if (!Number.isNaN(parsed)) {
                          handleUpdateBriefConfig({
                            targetWordCount: Math.max(60, Math.min(1200, parsed)),
                          });
                        }
                      }}
                      className="w-20 px-2 py-1 rounded-md border border-[#dcd6ca] bg-white text-xs font-bold text-[#1e232a]"
                    />
                    <span className="text-[11px] font-semibold text-[#5c5447]">
                      words (Acceptable range: {resolvedBriefConfig.minWords}–{resolvedBriefConfig.maxWords} words)
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-[#3b352c]">
                    <input
                      type="checkbox"
                      checked={resolvedBriefConfig.headlineCountsTowardWordCount}
                      onChange={(e) =>
                        handleUpdateBriefConfig({
                          headlineCountsTowardWordCount: e.target.checked,
                        })
                      }
                      className="rounded border-[#dcd6ca] text-amber-800 focus:ring-amber-700"
                    />
                    <span className="text-[11px] font-medium">
                      Count headline &amp; standfirst toward word target (off = main body only)
                    </span>
                  </label>
                </div>
              </div>

              {/* Selectable Sections Checklist */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-[#1e232a]">
                      Sections to Include in Copy ({resolvedBriefConfig.selectedSections.length} of{' '}
                      {PRODUCT_COPY_SECTIONS_CATALOG.length} selected)
                    </span>
                    <span className="ml-2 text-[11px] text-[#736c61]">
                      Unselected sections are explicitly excluded from the generated prompt.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetDefaultBriefSections}
                    className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 cursor-pointer"
                  >
                    Reset Recommended Sections
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {PRODUCT_COPY_SECTIONS_CATALOG.map((section) => {
                    const isChecked = resolvedBriefConfig.selectedSections.includes(section.id);
                    const isTechSpecs = section.id === 'technical_specifications';
                    return (
                      <label
                        key={section.id}
                        className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-start gap-2.5 ${
                          isChecked
                            ? isTechSpecs
                              ? 'bg-amber-50/70 border-amber-300 text-[#1e232a]'
                              : 'bg-[#f7f4ec] border-[#cfc7b8] text-[#1e232a]'
                            : 'bg-white border-[#ebe6dc] text-[#736c61] hover:border-[#dcd6ca]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleBriefSection(section.id)}
                          className="mt-0.5 rounded border-[#dcd6ca] text-amber-800 focus:ring-amber-700"
                        />
                        <div className="space-y-0.5 text-xs">
                          <div className="font-bold flex items-center gap-1.5">
                            <span>{section.label}</span>
                            {isTechSpecs && !isChecked && (
                              <span className="px-1.5 py-0.2 text-[10px] font-semibold rounded bg-stone-200 text-stone-700">
                                Off by default
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] leading-snug text-[#6e675c]">
                            {section.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {!resolvedBriefConfig.includeTechnicalSpecs && (
                  <div className="px-3 py-2 rounded-lg bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-950">
                    <span>
                      <strong>Spec Restraint Active:</strong> Dimensions, fabric percentages, insulation performance, care instructions, and compliance notes will be suppressed so the copy focuses on design, humor, and gift appeal.
                    </span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer font-semibold shrink-0">
                      <input
                        type="checkbox"
                        checked={resolvedBriefConfig.allowNarrativeSpecMention}
                        onChange={(e) =>
                          handleUpdateBriefConfig({
                            allowNarrativeSpecMention: e.target.checked,
                          })
                        }
                        className="rounded border-emerald-400 text-emerald-800"
                      />
                      <span>Allow brief narrative material mention if relevant</span>
                    </label>
                  </div>
                )}
              </div>

              <textarea
                readOnly
                rows={11}
                value={externalWritingPrompt}
                className="w-full p-3 font-mono text-[11px] leading-relaxed rounded-lg border border-[#dcd6ca] bg-[#faf9f6] text-[#1e232a] focus:outline-hidden"
              />
            </div>

            {/* Safe Import / Send to Studio Editor Panel with Live Word-Count Validation */}
            <div className="p-5 bg-[#f7f4ec] border border-[#dcd6ca] rounded-xl space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#e5dfd3] pb-2.5">
                <div>
                  <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                    Validate &amp; Send Copy into Studio Editor (Step 4)
                  </h4>
                  <p className="text-[11px] text-[#736c61]">
                    Paste external prose from ChatGPT/Claude below to verify its word count against your {resolvedBriefConfig.targetWordCount}-word target before sending it into the Studio Editor.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={!buildStructuredCopyHtmlDraft().trim()}
                    onClick={() =>
                      handleSendTextToEditor(
                        buildStructuredCopyHtmlDraft(),
                        'append',
                        'Structured Copy Fields'
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-amber-50 border border-[#dcd6ca] text-[#1e232a] font-semibold text-[11px] cursor-pointer disabled:opacity-50"
                  >
                    Send Structured Fields to Editor (Append)
                  </button>
                  <button
                    type="button"
                    disabled={!buildStructuredCopyHtmlDraft().trim()}
                    onClick={() =>
                      handleSendTextToEditor(
                        buildStructuredCopyHtmlDraft(),
                        'diff_modal',
                        'Structured Copy Fields'
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-amber-900 hover:bg-amber-950 text-white font-semibold text-[11px] cursor-pointer disabled:opacity-50"
                  >
                    Review Structured Fields in Diff Modal
                  </button>
                </div>
              </div>

              <textarea
                rows={4}
                value={externalDraftPasteText}
                onChange={(e) => setExternalDraftPasteText(e.target.value)}
                placeholder="Paste external draft prose from ChatGPT or Claude here to validate word count and send it into the shared Studio Editor..."
                className="w-full p-2.5 rounded-lg border border-[#dcd6ca] bg-white text-xs leading-relaxed"
              />

              {externalDraftPasteText.trim() && (
                <div
                  className={`p-2.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    pastedDraftValidation.status === 'within_target'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-amber-50 border-amber-300 text-amber-950'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="font-bold">
                      {pastedDraftValidation.summaryMessage}
                    </div>
                    <div className="text-[11px] opacity-85">
                      Main body: <strong>{pastedDraftValidation.mainBodyWords} words</strong> · Headline &amp; standfirst: <strong>{pastedDraftValidation.headlineAndStandfirstWords} words</strong> · Total: <strong>{pastedDraftValidation.totalWords} words</strong> (Target: {pastedDraftValidation.targetWords}w, acceptable {pastedDraftValidation.minWords}–{pastedDraftValidation.maxWords}w)
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                      pastedDraftValidation.status === 'within_target'
                        ? 'bg-emerald-200 text-emerald-950'
                        : 'bg-amber-200 text-amber-950'
                    }`}
                  >
                    {pastedDraftValidation.status === 'within_target'
                      ? 'On Target'
                      : pastedDraftValidation.status === 'under_target'
                      ? 'Under Target'
                      : 'Over Target'}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={!externalDraftPasteText.trim()}
                  onClick={() =>
                    handleSendTextToEditor(
                      externalDraftPasteText,
                      'insert_if_empty',
                      'Pasted External Draft'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-stone-100 border border-[#dcd6ca] text-[#1e232a] font-semibold text-xs cursor-pointer disabled:opacity-50"
                >
                  Insert / Append to Editor
                </button>
                <button
                  type="button"
                  disabled={!externalDraftPasteText.trim()}
                  onClick={() =>
                    handleSendTextToEditor(
                      externalDraftPasteText,
                      'diff_modal',
                      'Pasted External Draft'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-[#1e232a] hover:bg-[#2d3440] text-white font-semibold text-xs cursor-pointer disabled:opacity-50"
                >
                  Review in Diff Modal
                </button>
              </div>
            </div>

            {/* Existing Structured Copy Fields */}
            <div className="space-y-4">
              <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                Structured Copy Fields
              </h4>

              {/* Headline */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#1e232a]">Headline</label>
                  <div className="flex items-center gap-3">
                    {meta.headline && (
                      <button
                        type="button"
                        onClick={() => handleCopyText('headline', meta.headline || '')}
                        className="text-[11px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'headline' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'headline' ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleGenerateSingleField('headline')}
                      className="text-xs font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      <span>Generate Headline</span>
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={meta.headline || ''}
                  onChange={(e) => handleUpdateMeta('headline', e.target.value)}
                  placeholder="e.g. The Dalvey Voyager: An Heirloom Pocket Compass Built for Life's Journeys"
                  className="w-full p-2 font-editorial text-sm font-semibold rounded border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                />
              </div>

              {/* Standfirst */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#1e232a]">Deck / Standfirst</label>
                  <div className="flex items-center gap-3">
                    {meta.standfirst && (
                      <button
                        type="button"
                        onClick={() => handleCopyText('standfirst', meta.standfirst || '')}
                        className="text-[11px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'standfirst' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'standfirst' ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleGenerateSingleField('standfirst')}
                      className="text-xs font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      <span>Generate Standfirst</span>
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={meta.standfirst || ''}
                  onChange={(e) => handleUpdateMeta('standfirst', e.target.value)}
                  placeholder="e.g. Machined Scottish brass instrument with liquid-damped sapphire capsule..."
                  className="w-full p-2 italic text-xs rounded border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                />
              </div>

              {/* Description */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#1e232a]">Product Prose Description (Structured Field)</label>
                  <div className="flex items-center gap-3">
                    {meta.description && (
                      <button
                        type="button"
                        onClick={() => handleCopyText('description', meta.description || '')}
                        className="text-[11px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'description' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'description' ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleGenerateSingleField('description')}
                      className="text-xs font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      <span>Generate Description</span>
                    </button>
                  </div>
                </div>
                <textarea
                  rows={5}
                  value={meta.description || ''}
                  onChange={(e) => handleUpdateMeta('description', e.target.value)}
                  placeholder="Detailed product prose..."
                  className="w-full p-2 font-editorial text-xs leading-relaxed rounded border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                />
              </div>

              {/* Best For */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[#1e232a]">Best Suited For</label>
                  <div className="flex items-center gap-3">
                    {meta.bestFor && (
                      <button
                        type="button"
                        onClick={() => handleCopyText('bestFor', meta.bestFor || '')}
                        className="text-[11px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedKey === 'bestFor' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedKey === 'bestFor' ? 'Copied' : 'Copy'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleGenerateSingleField('bestFor')}
                      className="text-xs font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3 text-amber-600" />
                      <span>Generate Best For</span>
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={meta.bestFor || ''}
                  onChange={(e) => handleUpdateMeta('bestFor', e.target.value)}
                  placeholder="e.g. The hiker, cartographer, or desk enthusiast who prizes precision instruments."
                  className="w-full p-2 text-xs rounded border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                />
              </div>
            </div>

            {/* Collapsed SEO & Legacy Variants Section (Preserves all existing metadata without cluttering primary flow) */}
            <details className="group bg-white border border-[#e5dfd3] rounded-xl shadow-2xs overflow-hidden">
              <summary className="px-5 py-3.5 cursor-pointer list-none flex items-center justify-between font-editorial font-bold text-sm text-[#1e232a] bg-[#f8f6f0] hover:bg-[#f2efe6]">
                <span className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#5c5447]" />
                  <span>SEO Metadata & Legacy Style Variants</span>
                </span>
                <ChevronDown className="w-4 h-4 text-[#5c5447] transition-transform group-open:rotate-180" />
              </summary>

              <div className="p-5 space-y-6 border-t border-[#e5dfd3]">
                {/* SEO Metadata Fields */}
                <div className="space-y-3">
                  <h5 className="font-editorial font-bold text-xs uppercase tracking-wider text-[#443d34]">
                    Product Page SEO Metadata
                  </h5>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-[#5c5447]">SEO Page Title</label>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleGenerateSingleField('seoTitle')}
                        className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>Generate SEO Title</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={meta.seoTitle || ''}
                      onChange={(e) => handleUpdateMeta('seoTitle', e.target.value)}
                      placeholder="e.g. Dalvey Voyager Pocket Compass | Science of Gifts"
                      className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-[#5c5447]">Meta Description</label>
                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleGenerateSingleField('metaDescription')}
                        className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        <span>Generate Meta Description</span>
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      value={meta.metaDescription || ''}
                      onChange={(e) => handleUpdateMeta('metaDescription', e.target.value)}
                      placeholder="e.g. Discover the Dalvey Voyager pocket compass. Machined from solid Scottish brass..."
                      className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-[#5c5447] mb-1">URL Slug</label>
                      <input
                        type="text"
                        value={meta.slug || ''}
                        onChange={(e) => handleUpdateMeta('slug', e.target.value)}
                        placeholder="e.g. dalvey-voyager-pocket-compass"
                        className="w-full p-2 font-mono text-xs rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-[#5c5447] mb-1">Primary Target Keyword</label>
                      <input
                        type="text"
                        value={meta.primaryKeyword || ''}
                        onChange={(e) => handleUpdateMeta('primaryKeyword', e.target.value)}
                        placeholder="e.g. brass pocket compass"
                        className="w-full p-2 text-xs rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Additional Legacy Copy Fields */}
                <div className="pt-4 border-t border-[#f0ece3] space-y-3">
                  <h5 className="font-editorial font-bold text-xs uppercase tracking-wider text-[#443d34]">
                    Additional Copy Notes (Materials, Heritage, Call to Action, Social)
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-[#5c5447] mb-1">Materials & Craft Note</label>
                      <textarea
                        rows={2}
                        value={meta.materialsCraftNote || ''}
                        onChange={(e) => handleUpdateMeta('materialsCraftNote', e.target.value)}
                        className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#5c5447] mb-1">Historical Angle Copy</label>
                      <textarea
                        rows={2}
                        value={meta.historicalAngleCopy || ''}
                        onChange={(e) => handleUpdateMeta('historicalAngleCopy', e.target.value)}
                        className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#5c5447] mb-1">Call to Action</label>
                      <input
                        type="text"
                        value={meta.callToAction || ''}
                        onChange={(e) => handleUpdateMeta('callToAction', e.target.value)}
                        className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#5c5447] mb-1">Short Social Copy</label>
                      <input
                        type="text"
                        value={meta.shortCopySocial || ''}
                        onChange={(e) => handleUpdateMeta('shortCopySocial', e.target.value)}
                        className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Multi-Variant Copy Fields */}
                <div className="pt-4 border-t border-[#f0ece3] space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="font-editorial font-bold text-xs uppercase tracking-wider text-[#443d34]">
                      Style Variants (4)
                    </h5>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={handleGenerateVariants}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                      ) : (
                        <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                      )}
                      <span>Generate 4 Style Variants</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#1e232a]">1. Formal Editorial Monograph</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText('formal', meta.variants?.formalEditorial || '')}
                          className="text-[10px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'formal' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'formal' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={meta.variants?.formalEditorial || ''}
                        onChange={(e) => handleUpdateVariants('formalEditorial', e.target.value)}
                        className="w-full p-2 font-editorial text-xs leading-relaxed rounded border border-[#dcd6ca] bg-white"
                      />
                    </div>

                    <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#1e232a]">2. Emotional Storytelling & Ritual</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText('emotional', meta.variants?.emotionalStorytelling || '')}
                          className="text-[10px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'emotional' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'emotional' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={meta.variants?.emotionalStorytelling || ''}
                        onChange={(e) => handleUpdateVariants('emotionalStorytelling', e.target.value)}
                        className="w-full p-2 font-editorial text-xs leading-relaxed rounded border border-[#dcd6ca] bg-white"
                      />
                    </div>

                    <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#1e232a]">3. Concise Conversion Web Copy</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText('concise', meta.variants?.conciseConversion || '')}
                          className="text-[10px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'concise' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'concise' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={meta.variants?.conciseConversion || ''}
                        onChange={(e) => handleUpdateVariants('conciseConversion', e.target.value)}
                        className="w-full p-2 font-editorial text-xs leading-relaxed rounded border border-[#dcd6ca] bg-white"
                      />
                    </div>

                    <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-[#1e232a]">4. Technical & Tool Lineage</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText('technical', meta.variants?.technicalHistorical || '')}
                          className="text-[10px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedKey === 'technical' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedKey === 'technical' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <textarea
                        rows={4}
                        value={meta.variants?.technicalHistorical || ''}
                        onChange={(e) => handleUpdateVariants('technicalHistorical', e.target.value)}
                        className="w-full p-2 font-editorial text-xs leading-relaxed rounded border border-[#dcd6ca] bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </details>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setActiveStep('direction')}
                className="px-3.5 py-2 text-xs font-semibold text-[#4a443b] bg-[#e8e2d5] hover:bg-[#dcd4c4] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Editorial Direction</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveStep('edit')}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Continue to Edit Copy</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ===================================================================
            SECTION 4: EDIT COPY
            Shared Rich-Text <Editor> with passage-anchored notes, brief export & links
           =================================================================== */}
        {activeStep === 'edit' && (
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            <div className="px-4 sm:px-6 py-2 bg-[#faf8f4] border-b border-[#e5dfd3] flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <div className="flex flex-wrap items-center gap-2 text-[#5c5447]">
                <span className="font-semibold text-[#1e232a]">4. Edit Copy:</span>
                <span>
                  Paste or write your product copy below, attach passage-anchored Written or Voice Notes, export an Editing Brief, and insert Internal Links.
                </span>
                {editorDraftValidation.status !== 'empty' && (
                  <span
                    title={editorDraftValidation.summaryMessage}
                    className={`px-2 py-0.5 rounded-md font-semibold text-[11px] border ${
                      editorDraftValidation.status === 'within_target'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : 'bg-amber-50 border-amber-300 text-amber-900'
                    }`}
                  >
                    {editorDraftValidation.countedWords} / {editorDraftValidation.targetWords}w{' '}
                    {editorDraftValidation.headlineCountsTowardWordCount
                      ? '(total)'
                      : '(main body)'}{' '}
                    · Range {editorDraftValidation.minWords}–{editorDraftValidation.maxWords}w
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {buildStructuredCopyHtmlDraft().trim() && (
                  <button
                    type="button"
                    onClick={() =>
                      handleSendTextToEditor(
                        buildStructuredCopyHtmlDraft(),
                        'append',
                        'Structured Copy Fields'
                      )
                    }
                    className="px-2.5 py-1 text-[11px] font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Append Structured Copy Fields</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveStep('brief')}
                  className="px-2.5 py-1 text-[11px] font-semibold text-[#4a443b] bg-[#e8e2d5] hover:bg-[#dcd4c4] rounded-md inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-3 h-3" />
                  <span>Back to Writing Brief</span>
                </button>
              </div>
            </div>

            {editorImportNotice && (
              <div className="px-4 sm:px-6 py-1.5 bg-emerald-50 border-b border-emerald-200 text-emerald-950 text-xs flex items-center justify-between">
                <span>{editorImportNotice}</span>
                <button
                  type="button"
                  onClick={() => setEditorImportNotice(null)}
                  className="text-emerald-800 hover:text-emerald-950 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              <Editor
                projectId={project.id}
                project={project}
                content={project.content}
                editingNotes={project.editingNotes || []}
                editorRef={editorRef}
                onChange={(newContent) =>
                  onChange({
                    ...project,
                    content: ensureSemanticHtml(newContent),
                  })
                }
                onChangeWithNotes={(newContent, updatedNotes) =>
                  onChange({
                    ...project,
                    content: ensureSemanticHtml(newContent),
                    editingNotes: updatedNotes,
                    updatedAt: new Date().toISOString(),
                  })
                }
                onEditingNotesChange={(updatedNotes) =>
                  onChange({
                    ...project,
                    editingNotes: updatedNotes,
                    updatedAt: new Date().toISOString(),
                  })
                }
                onSelectionChange={(text, range) => {
                  setSelectedText(text);
                  setSelectionRange(range);
                }}
                onExplicitAiAction={(action, text, range) => {
                  setSelectedText(text);
                  setSelectionRange(range);
                  handleExecuteAiAction(action, undefined, text ? 'selection' : 'all');
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
