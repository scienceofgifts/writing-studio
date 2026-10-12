/**
 * Science of Gifts - Specialized Product Copy Studio (Phase 6)
 * Separates structured product facts, editorial positioning, dedicated copy fields,
 * multi-variant generations, and SEO metadata while syncing directly with the rich-text editor.
 */

import React, { useState } from 'react';
import {
  WritingProject,
  ProductCopyMetadata,
  ProductPositioning,
  ProductCopyVariants,
  DiffProposal,
  ActivePanel,
} from '../../types/project';
import { Editor } from '../Editor';
import { AiCommandBar } from '../AiCommandBar';
import { geminiService } from '../../services/geminiClient';
import { ensureSemanticHtml } from '../../utils/richText';
import {
  Tag,
  Sparkles,
  Search,
  ExternalLink,
  ShieldCheck,
  Layers,
  FileCheck,
  Package,
  Compass,
  Type,
  List,
  History,
  Hammer,
  ArrowRight,
  Sparkle,
  Copy,
  Check,
  Globe,
  Sliders,
  Maximize2,
  Wand2,
  BookOpen,
  Eye,
  Info,
  Cpu,
  Send,
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

export const ProductCopyWorkspace: React.FC<ProductCopyWorkspaceProps> = ({
  project,
  editorRef,
  activePanel,
  onTogglePanel,
  onChange,
  onRequestProposal,
}) => {
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'canvas' | 'facts' | 'positioning' | 'copy_fields' | 'variants' | 'seo'>('canvas');
  const [copiedVariant, setCopiedVariant] = useState<string | null>(null);

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
    productNotes: '',
    additionalFacts: '',
    positioning: {
      whatMakesItInteresting: '',
      whyWouldSomeoneWantIt: '',
      suitedRecipient: '',
      whatToEmphasize: '',
      whatToAvoid: '',
      keySellingAngle: '',
      emotionalAngle: '',
      historicalAngle: '',
    },
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
    ...(project.productCopyMeta || {}),
  };

  const handleUpdateMeta = (field: keyof ProductCopyMetadata, value: any) => {
    onChange({
      ...project,
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

  // AI Action Dispatcher for Product Copy
  const handleExecuteAiAction = async (action: string, customCommand?: string, scope: any = 'selection') => {
    setIsLoading(true);
    try {
      const res = await geminiService.executeAction(project, action, {
        selectedText: scope === 'selection' ? selectedText : undefined,
        scope,
        customCommand,
        relevantProduct: meta,
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
    } finally {
      setIsLoading(false);
    }
  };

  // AI Full Copy Generation
  const handleGenerateFullCopy = async () => {
    setIsLoading(true);
    try {
      const res = await geminiService.executeAction(project, 'generate_product_copy', {
        relevantProduct: meta,
        customCommand:
          'Create complete grounded product copy. Provide a captivating headline, italic standfirst, detailed description, Best For recommendation, key features, materials note, and call to action based strictly on the raw specifications.',
      });

      if (res.ok && res.proposedText) {
        onRequestProposal({
          id: `prop-full-copy-${Date.now()}`,
          scopeDescription: 'Full Product Copy Generation',
          targetText: project.content,
          proposedText: res.proposedText,
          modelUsed: res.modelUsed,
          explanation:
            res.explanation || 'Constructed grounded editorial product copy honoring all factual specifications.',
        });
      }
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
      });

      if (res.ok && res.proposedText) {
        const cleaned = res.proposedText.replace(/^["']|["']$/g, '').trim();
        handleUpdateMeta(field, cleaned);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Generate Multi-Variants
  const handleGenerateVariants = async () => {
    setIsLoading(true);
    try {
      const variantsList: Array<{ key: keyof ProductCopyVariants; prompt: string }> = [
        {
          key: 'formalEditorial',
          prompt: 'Write formal, elevated editorial copy suited for a print journal or luxury monograph. Focus on craftsmanship, provenance, and quiet restraint.',
        },
        {
          key: 'emotionalStorytelling',
          prompt: 'Write narrative storytelling copy evoking tactile rituals, heritage, and the feeling of owning an enduring object.',
        },
        {
          key: 'conciseConversion',
          prompt: 'Write crisp, punchy, conversion-focused product description suitable for a fast-reading web showcase without vulgar hype.',
        },
        {
          key: 'technicalHistorical',
          prompt: 'Write technical and historical detail copy emphasizing materials, gauge, dimensions, SELVEDGE/alloy details, and tool lineage.',
        },
      ];

      const newVariants: ProductCopyVariants = { ...meta.variants };

      for (const v of variantsList) {
        const res = await geminiService.executeAction(project, 'generate_product_copy', {
          relevantProduct: meta,
          customCommand: v.prompt,
        });
        if (res.ok && res.proposedText) {
          newVariants[v.key] = res.proposedText;
        }
      }

      handleUpdateMeta('variants', newVariants);
      setActiveTab('variants');
    } finally {
      setIsLoading(false);
    }
  };

  // Compile Structured Copy Fields into Rich-Text Editor Canvas
  const handleCompileToEditor = (overrideHtml?: string) => {
    if (overrideHtml) {
      onChange({
        ...project,
        content: ensureSemanticHtml(overrideHtml),
      });
      setActiveTab('canvas');
      return;
    }

    let formatted = `<h2>${meta.headline || meta.productTitle || project.title}</h2>`;
    if (meta.standfirst) {
      formatted += `<p><em>${meta.standfirst}</em></p>`;
    }
    if (meta.description) {
      formatted += `\n<p>${meta.description}</p>`;
    }
    if (meta.bestFor) {
      formatted += `\n<p><strong>Best Suited For:</strong> ${meta.bestFor}</p>`;
    }
    if (meta.materialsCraftNote || meta.materials) {
      formatted += `\n<h3>Materials & Bench Craftsmanship</h3><p>${meta.materialsCraftNote || meta.materials}</p>`;
    }
    if (meta.historicalAngleCopy || meta.historicalContext) {
      formatted += `\n<h3>Historical & Tool Heritage</h3><p>${meta.historicalAngleCopy || meta.historicalContext}</p>`;
    }
    if (meta.callToAction) {
      formatted += `\n<p><strong>${meta.callToAction}</strong></p>`;
    }

    onChange({
      ...project,
      content: ensureSemanticHtml(formatted),
    });
    setActiveTab('canvas');
  };

  // Helper to copy text to clipboard
  const handleCopyText = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedVariant(key);
    setTimeout(() => setCopiedVariant(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#faf9f6] overflow-hidden">
      {/* HEADER BAR */}
      <header className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-[#f6f3eb] border-b border-[#e5dfd3] shrink-0 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={project.title}
              onChange={(e) => {
                onChange({ ...project, title: e.target.value });
                handleUpdateMeta('productName', e.target.value);
              }}
              placeholder="Product Name..."
              className="w-full min-w-0 font-editorial text-xl md:text-2xl font-bold text-[#1e232a] bg-transparent focus:outline-hidden border-b border-transparent focus:border-emerald-600 py-0.5 truncate"
            />

            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs text-[#5c5447]">
              <input
                type="text"
                value={meta.productType}
                onChange={(e) => handleUpdateMeta('productType', e.target.value)}
                placeholder="Category / Type (e.g. Field Watch, Canvas Duffel)"
                className="bg-transparent focus:outline-hidden border-b border-transparent focus:border-emerald-400 py-0.5 text-xs text-[#5c5447]"
              />
              <span className="text-[#dcd6ca]">•</span>
              <input
                type="text"
                value={meta.productUrl}
                onChange={(e) => handleUpdateMeta('productUrl', e.target.value)}
                placeholder="Product URL (https://...)"
                className="bg-transparent focus:outline-hidden border-b border-transparent focus:border-emerald-400 py-0.5 text-xs font-mono text-[#736c61]"
              />
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

          {/* View Mode Switcher Tabs */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <div className="flex bg-[#e8e2d5] p-0.5 rounded-lg text-xs font-medium text-[#4a443b] overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => setActiveTab('canvas')}
                className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  activeTab === 'canvas'
                    ? 'bg-white shadow-2xs text-[#1e232a] font-semibold'
                    : 'hover:text-[#1e232a]'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Interactive Canvas</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('facts')}
                className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  activeTab === 'facts'
                    ? 'bg-white shadow-2xs text-[#1e232a] font-semibold'
                    : 'hover:text-[#1e232a]'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Product Facts</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('positioning')}
                className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  activeTab === 'positioning'
                    ? 'bg-white shadow-2xs text-[#1e232a] font-semibold'
                    : 'hover:text-[#1e232a]'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Positioning</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('copy_fields')}
                className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  activeTab === 'copy_fields'
                    ? 'bg-white shadow-2xs text-[#1e232a] font-semibold'
                    : 'hover:text-[#1e232a]'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                <span>Copy Fields</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('variants')}
                className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  activeTab === 'variants'
                    ? 'bg-white shadow-2xs text-[#1e232a] font-semibold'
                    : 'hover:text-[#1e232a]'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5 text-amber-700" />
                <span>Multi-Variants</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('seo')}
                className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  activeTab === 'seo'
                    ? 'bg-white shadow-2xs text-[#1e232a] font-semibold'
                    : 'hover:text-[#1e232a]'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>SEO</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Action Strip */}
        <div className="pt-2 border-t border-[#ede7db] flex items-center justify-between gap-3 text-xs overflow-x-auto">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447]">
              AI Generation:
            </span>
            <button
              type="button"
              disabled={isLoading}
              onClick={handleGenerateFullCopy}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 inline-flex items-center gap-1 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3 text-amber-700" />
              <span>Generate Full Copy</span>
            </button>

            <button
              type="button"
              disabled={isLoading}
              onClick={handleGenerateVariants}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-950 inline-flex items-center gap-1 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Wand2 className="w-3 h-3 text-emerald-700" />
              <span>Generate 4 Style Variants</span>
            </button>

            <button
              type="button"
              onClick={() => (onTogglePanel ? onTogglePanel('review') : undefined)}
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 inline-flex items-center gap-1 transition-colors shadow-2xs"
              title="Open AI Editorial Review Panel"
            >
              <ShieldCheck className="w-3 h-3 text-amber-700" />
              <span>Editorial Review</span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* AI Model Selector (Phase 9) */}
            <div className="flex items-center gap-1.5 bg-white border border-[#dcd6ca] px-2 py-0.5 rounded-md shadow-2xs text-xs">
              <Cpu className="w-3 h-3 text-indigo-700" />
              <span className="text-[10px] font-semibold text-[#7d7568] uppercase tracking-wider hidden md:inline">
                Model:
              </span>
              <select
                value={project.modelOverride || ''}
                onChange={(e) => {
                  onChange({
                    ...project,
                    modelOverride: (e.target.value as ModelId) || undefined,
                    updatedAt: new Date().toISOString(),
                  });
                }}
                className="bg-transparent text-[11px] font-semibold text-[#1e232a] focus:outline-hidden cursor-pointer"
                title={
                  project.modelOverride
                    ? `Project Override: ${getModelDefinition(project.modelOverride).displayName}`
                    : `Global Default: ${getModelDefinition(storage.getGlobalModel()).displayName}`
                }
              >
                <option value="">Default ({getModelDefinition(storage.getGlobalModel()).displayName})</option>
                {ALL_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => handleCompileToEditor()}
              className="px-3 py-1 rounded-md text-[11px] font-semibold bg-[#1e232a] text-white hover:bg-[#2d3440] inline-flex items-center gap-1.5 shadow-2xs transition-colors shrink-0"
            >
              <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Assemble into Canvas</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT BODY */}
      <div className="flex-1 flex overflow-hidden">
        {/* TAB 1: INTERACTIVE CANVAS (EDITOR + FACTS/COPY SIDEBAR) */}
        {activeTab === 'canvas' && (
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Specs & Copy Quick Panel */}
            <div className="w-full md:w-80 lg:w-96 max-h-56 md:max-h-none border-b md:border-b-0 md:border-r border-[#e5dfd3] bg-[#fcfbfa] flex flex-col shrink-0 overflow-y-auto p-4 space-y-5 text-xs">
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-amber-950 font-semibold text-[11px]">
                  <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Factual Source Discipline</span>
                </div>
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  Structured product facts serve as source truth. AI will never invent measurements, origins, or material specs.
                </p>
              </div>

              {/* Raw Facts Summary Card */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-[#f0ece3] pb-2">
                  <h4 className="font-editorial font-bold text-sm text-[#1e232a]">
                    Structured Facts
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActiveTab('facts')}
                    className="text-[10px] font-semibold text-amber-800 hover:underline"
                  >
                    Edit All Facts →
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#736c61] block mb-1">
                    Raw Specification Notes
                  </label>
                  <textarea
                    rows={3}
                    value={meta.rawProductInfo}
                    onChange={(e) => handleUpdateMeta('rawProductInfo', e.target.value)}
                    placeholder="Paste raw manufacturer details..."
                    className="w-full text-xs p-2 rounded border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white"
                  />
                </div>

                <div className="space-y-1.5 text-[11px]">
                  <div>
                    <span className="font-semibold text-[#443d34]">Materials: </span>
                    <span className="text-[#6e685f]">{meta.materials || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-[#443d34]">Features: </span>
                    <span className="text-[#6e685f]">{meta.features || 'Not specified'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-[#443d34]">Heritage: </span>
                    <span className="text-[#6e685f]">{meta.historicalContext || 'Not specified'}</span>
                  </div>
                </div>
              </div>

              {/* Copy Fields Quick Panel */}
              <div className="p-4 bg-white border border-emerald-200/90 rounded-xl shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-[#f0ece3] pb-2">
                  <h4 className="font-editorial font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                    Structured Copy Preview
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActiveTab('copy_fields')}
                    className="text-[10px] font-semibold text-emerald-800 hover:underline"
                  >
                    All Fields →
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#736c61] block mb-0.5">
                    Headline
                  </label>
                  <input
                    type="text"
                    value={meta.headline || ''}
                    onChange={(e) => handleUpdateMeta('headline', e.target.value)}
                    placeholder="Headline..."
                    className="w-full text-xs font-editorial font-semibold p-1.5 rounded border border-[#dcd6ca] bg-[#faf9f6]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#736c61] block mb-0.5">
                    Standfirst
                  </label>
                  <input
                    type="text"
                    value={meta.standfirst || ''}
                    onChange={(e) => handleUpdateMeta('standfirst', e.target.value)}
                    placeholder="Standfirst..."
                    className="w-full text-xs italic p-1.5 rounded border border-[#dcd6ca] bg-[#faf9f6]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-[#736c61] block mb-0.5">
                    Best Suited For
                  </label>
                  <input
                    type="text"
                    value={meta.bestFor || ''}
                    onChange={(e) => handleUpdateMeta('bestFor', e.target.value)}
                    placeholder="Best for..."
                    className="w-full text-xs p-1.5 rounded border border-[#dcd6ca] bg-[#faf9f6]"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleCompileToEditor()}
                  className="w-full py-2 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Assemble Fields into Canvas</span>
                </button>
              </div>
            </div>

            {/* Center Rich-Text Editor Canvas */}
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              <Editor
                content={project.content}
                editorRef={editorRef}
                onChange={(newContent) =>
                  onChange({
                    ...project,
                    content: ensureSemanticHtml(newContent),
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

        {/* TAB 2: PRODUCT INFORMATION (FACTS) */}
        {activeTab === 'facts' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6 text-xs">
            <div className="border-b border-[#e5dfd3] pb-3">
              <h3 className="font-editorial text-xl font-bold text-[#1e232a]">
                Product Specifications & Fact Inventory
              </h3>
              <p className="text-xs text-[#736c61] mt-0.5">
                The AI treats empty fields as unknown. It will never invent missing specifications or details.
              </p>
            </div>

            {/* Verbatim Raw Info Box */}
            <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-3">
              <label className="block font-bold text-xs uppercase tracking-wider text-[#443d34]">
                Raw Manufacturer Specification Notes (Verbatim Source Material)
              </label>
              <textarea
                rows={5}
                value={meta.rawProductInfo}
                onChange={(e) => handleUpdateMeta('rawProductInfo', e.target.value)}
                placeholder="Paste verbatim manufacturer spec sheets, caliber details, alloy designations, or maker catalog notes..."
                className="w-full text-xs p-3 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden font-mono text-[#1e232a] leading-relaxed"
              />
            </div>

            {/* Structured Fact Grid */}
            <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
              <h4 className="font-editorial font-bold text-sm text-[#1e232a] border-b border-[#f0ece3] pb-2">
                Physical & Design Attributes
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Product Name</label>
                  <input
                    type="text"
                    value={meta.productName}
                    onChange={(e) => handleUpdateMeta('productName', e.target.value)}
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Product Type / Category</label>
                  <input
                    type="text"
                    value={meta.productType}
                    onChange={(e) => handleUpdateMeta('productType', e.target.value)}
                    placeholder="e.g. Mechanical Chronograph, Leather Folio"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Product URL</label>
                  <input
                    type="text"
                    value={meta.productUrl}
                    onChange={(e) => handleUpdateMeta('productUrl', e.target.value)}
                    placeholder="https://..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Image URL or Reference</label>
                  <input
                    type="text"
                    value={meta.imageUrl || ''}
                    onChange={(e) => handleUpdateMeta('imageUrl', e.target.value)}
                    placeholder="https://... image link"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Materials & Provenance</label>
                  <input
                    type="text"
                    value={meta.materials || ''}
                    onChange={(e) => handleUpdateMeta('materials', e.target.value)}
                    placeholder="e.g. Horween Chromexcel leather, Japanese brass hardware"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Physical Features</label>
                  <input
                    type="text"
                    value={meta.features || ''}
                    onChange={(e) => handleUpdateMeta('features', e.target.value)}
                    placeholder="e.g. YKK brass zips, padded compartment, weather-sealed"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Dimensions & Weight</label>
                  <input
                    type="text"
                    value={meta.dimensions || ''}
                    onChange={(e) => handleUpdateMeta('dimensions', e.target.value)}
                    placeholder="e.g. 38mm diameter, 11.5mm thickness, 140g"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Colors & Finishes</label>
                  <input
                    type="text"
                    value={meta.colors || ''}
                    onChange={(e) => handleUpdateMeta('colors', e.target.value)}
                    placeholder="e.g. Matte Olive Drab, Burnished Tan, Raw Brass"
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-[#f0ece3] space-y-3">
                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Design Concept & Aesthetics</label>
                  <textarea
                    rows={2}
                    value={meta.designConcept || ''}
                    onChange={(e) => handleUpdateMeta('designConcept', e.target.value)}
                    placeholder="Core aesthetic philosophy or visual language..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Historical / Cultural Context</label>
                  <textarea
                    rows={2}
                    value={meta.historicalContext || ''}
                    onChange={(e) => handleUpdateMeta('historicalContext', e.target.value)}
                    placeholder="Tool heritage, historical era inspiration, or maker lineage..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-[#5c5447] mb-1">Intended Recipient</label>
                    <input
                      type="text"
                      value={meta.intendedRecipient || ''}
                      onChange={(e) => handleUpdateMeta('intendedRecipient', e.target.value)}
                      placeholder="e.g. Map collectors, field architects, writers"
                      className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-[#5c5447] mb-1">Target Audience</label>
                    <input
                      type="text"
                      value={meta.targetAudience || ''}
                      onChange={(e) => handleUpdateMeta('targetAudience', e.target.value)}
                      placeholder="e.g. Discerning enthusiasts who value durability over trends"
                      className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Additional Factual Notes</label>
                  <textarea
                    rows={2}
                    value={meta.additionalFacts || ''}
                    onChange={(e) => handleUpdateMeta('additionalFacts', e.target.value)}
                    placeholder="Any remaining verifiable factual claims..."
                    className="w-full p-2 rounded-md border border-[#dcd6ca] bg-[#faf8f4] focus:bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PRODUCT POSITIONING */}
        {activeTab === 'positioning' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6 text-xs">
            <div className="border-b border-[#e5dfd3] pb-3">
              <h3 className="font-editorial text-xl font-bold text-[#1e232a]">
                Editorial Product Positioning & Angles
              </h3>
              <p className="text-xs text-[#736c61] mt-0.5">
                Define how the product should be framed, emphasized, and positioned without altering factual specifications.
              </p>
            </div>

            <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          </div>
        )}

        {/* TAB 4: COPY FIELDS */}
        {activeTab === 'copy_fields' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6 text-xs">
            <div className="flex items-center justify-between border-b border-[#e5dfd3] pb-3">
              <div>
                <h3 className="font-editorial text-xl font-bold text-[#1e232a]">
                  Dedicated Copy Fields
                </h3>
                <p className="text-xs text-[#736c61] mt-0.5">
                  Generate or refine individual editorial copy components anchored in factual specifications.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleCompileToEditor()}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg shadow-2xs inline-flex items-center gap-1.5"
              >
                <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Assemble into Canvas</span>
              </button>
            </div>

            <div className="space-y-4">
              {/* Headline */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[11px] uppercase tracking-wider text-[#443d34]">
                    Headline
                  </label>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleGenerateSingleField('headline')}
                    className="text-[10px] text-amber-800 hover:text-amber-950 font-semibold inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto Generate</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={meta.headline || ''}
                  onChange={(e) => handleUpdateMeta('headline', e.target.value)}
                  placeholder="e.g. A Field Bag That Improves With Every Rainstorm"
                  className="w-full font-editorial text-base font-bold p-2.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white"
                />
              </div>

              {/* Standfirst */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[11px] uppercase tracking-wider text-[#443d34]">
                    Standfirst
                  </label>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleGenerateSingleField('standfirst')}
                    className="text-[10px] text-amber-800 hover:text-amber-950 font-semibold inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto Generate</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={meta.standfirst || ''}
                  onChange={(e) => handleUpdateMeta('standfirst', e.target.value)}
                  placeholder="e.g. Hand-peened copper rivets and 18-ounce waxed duck canvas built for decades of rain..."
                  className="w-full italic text-xs p-2.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white text-[#4a443b]"
                />
              </div>

              {/* Main Product Description */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[11px] uppercase tracking-wider text-[#443d34]">
                    Main Product Description (150 - 200 words)
                  </label>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleGenerateSingleField('description')}
                    className="text-[10px] text-amber-800 hover:text-amber-950 font-semibold inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto Generate</span>
                  </button>
                </div>
                <textarea
                  rows={5}
                  value={meta.description || ''}
                  onChange={(e) => handleUpdateMeta('description', e.target.value)}
                  placeholder="Unhurried, observant editorial narrative describing material feel and daily utility..."
                  className="w-full font-editorial text-sm p-3 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white leading-relaxed"
                />
              </div>

              {/* Best For */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[11px] uppercase tracking-wider text-[#443d34]">
                    Best Suited For
                  </label>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleGenerateSingleField('bestFor')}
                    className="text-[10px] text-amber-800 hover:text-amber-950 font-semibold inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto Generate</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={meta.bestFor || ''}
                  onChange={(e) => handleUpdateMeta('bestFor', e.target.value)}
                  placeholder="e.g. Carrying field notebooks through damp autumn commutes."
                  className="w-full text-xs p-2.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white"
                />
              </div>

              {/* Materials & Craftsmanship Note */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[11px] uppercase tracking-wider text-[#443d34]">
                    Materials & Craftsmanship Note
                  </label>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleGenerateSingleField('materialsCraftNote')}
                    className="text-[10px] text-amber-800 hover:text-amber-950 font-semibold inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto Generate</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={meta.materialsCraftNote || ''}
                  onChange={(e) => handleUpdateMeta('materialsCraftNote', e.target.value)}
                  placeholder="Bench details, alloy specs, or hand-finishing observations..."
                  className="w-full text-xs p-2.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white"
                />
              </div>

              {/* Call to Action */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[11px] uppercase tracking-wider text-[#443d34]">
                    Call to Action
                  </label>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleGenerateSingleField('callToAction')}
                    className="text-[10px] text-amber-800 hover:text-amber-950 font-semibold inline-flex items-center gap-1"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto Generate</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={meta.callToAction || ''}
                  onChange={(e) => handleUpdateMeta('callToAction', e.target.value)}
                  placeholder="e.g. Available directly from the maker's workshop in Sheffield."
                  className="w-full text-xs p-2.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white font-medium text-[#1e232a]"
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: MULTI-VARIANT COPY STUDIO */}
        {activeTab === 'variants' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6 text-xs">
            <div className="flex items-center justify-between border-b border-[#e5dfd3] pb-3">
              <div>
                <h3 className="font-editorial text-xl font-bold text-[#1e232a]">
                  Multi-Variant Copy Studio
                </h3>
                <p className="text-xs text-[#736c61] mt-0.5">
                  Generate 4 distinct positioning styles simultaneously. Pick and send your favorite directly to the editor canvas.
                </p>
              </div>

              <button
                type="button"
                disabled={isLoading}
                onClick={handleGenerateVariants}
                className="px-3.5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-2xs inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Wand2 className="w-4 h-4 text-emerald-700" />
                <span>{isLoading ? 'Drafting Variants...' : 'Generate All 4 Variants'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Variant 1: Formal / Editorial */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between border-b border-[#f0ece3] pb-2 mb-2">
                    <span className="font-editorial font-bold text-sm text-[#1e232a] flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-amber-800" />
                      1. Formal / Editorial
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                      Journal Style
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={meta.variants?.formalEditorial || ''}
                    onChange={(e) => handleUpdateVariants('formalEditorial', e.target.value)}
                    placeholder="Formal, elevated editorial prose..."
                    className="w-full text-xs font-editorial p-2.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white leading-relaxed"
                  />
                </div>

                {meta.variants?.formalEditorial && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#f0ece3]">
                    <button
                      type="button"
                      onClick={() => handleCopyText('formal', meta.variants?.formalEditorial || '')}
                      className="text-[11px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1"
                    >
                      {copiedVariant === 'formal' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedVariant === 'formal' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCompileToEditor(meta.variants?.formalEditorial)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-md inline-flex items-center gap-1 shadow-2xs"
                    >
                      <Send className="w-3 h-3 text-amber-300" />
                      <span>Use in Canvas</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Variant 2: Emotional / Storytelling */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between border-b border-[#f0ece3] pb-2 mb-2">
                    <span className="font-editorial font-bold text-sm text-[#1e232a] flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-800" />
                      2. Emotional / Storytelling
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-900 border border-purple-200">
                      Evocative
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={meta.variants?.emotionalStorytelling || ''}
                    onChange={(e) => handleUpdateVariants('emotionalStorytelling', e.target.value)}
                    placeholder="Evocative storytelling copy highlighting tactile rituals..."
                    className="w-full text-xs font-editorial p-2.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white leading-relaxed"
                  />
                </div>

                {meta.variants?.emotionalStorytelling && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#f0ece3]">
                    <button
                      type="button"
                      onClick={() => handleCopyText('emotional', meta.variants?.emotionalStorytelling || '')}
                      className="text-[11px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1"
                    >
                      {copiedVariant === 'emotional' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedVariant === 'emotional' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCompileToEditor(meta.variants?.emotionalStorytelling)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-md inline-flex items-center gap-1 shadow-2xs"
                    >
                      <Send className="w-3 h-3 text-purple-300" />
                      <span>Use in Canvas</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Variant 3: Concise / Conversion-focused */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between border-b border-[#f0ece3] pb-2 mb-2">
                    <span className="font-editorial font-bold text-sm text-[#1e232a] flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-emerald-800" />
                      3. Concise / Conversion
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-900 border border-emerald-200">
                      E-Commerce
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={meta.variants?.conciseConversion || ''}
                    onChange={(e) => handleUpdateVariants('conciseConversion', e.target.value)}
                    placeholder="Crisp, direct conversion description..."
                    className="w-full text-xs font-editorial p-2.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white leading-relaxed"
                  />
                </div>

                {meta.variants?.conciseConversion && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#f0ece3]">
                    <button
                      type="button"
                      onClick={() => handleCopyText('concise', meta.variants?.conciseConversion || '')}
                      className="text-[11px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1"
                    >
                      {copiedVariant === 'concise' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedVariant === 'concise' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCompileToEditor(meta.variants?.conciseConversion)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-md inline-flex items-center gap-1 shadow-2xs"
                    >
                      <Send className="w-3 h-3 text-emerald-300" />
                      <span>Use in Canvas</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Variant 4: Technical / Historical Detail */}
              <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between border-b border-[#f0ece3] pb-2 mb-2">
                    <span className="font-editorial font-bold text-sm text-[#1e232a] flex items-center gap-1.5">
                      <Hammer className="w-4 h-4 text-blue-800" />
                      4. Technical / Historical
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                      Bench Spec
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    value={meta.variants?.technicalHistorical || ''}
                    onChange={(e) => handleUpdateVariants('technicalHistorical', e.target.value)}
                    placeholder="Technical material specs and tool lineage..."
                    className="w-full text-xs font-editorial p-2.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white leading-relaxed"
                  />
                </div>

                {meta.variants?.technicalHistorical && (
                  <div className="flex items-center justify-between pt-2 border-t border-[#f0ece3]">
                    <button
                      type="button"
                      onClick={() => handleCopyText('technical', meta.variants?.technicalHistorical || '')}
                      className="text-[11px] font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1"
                    >
                      {copiedVariant === 'technical' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedVariant === 'technical' ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCompileToEditor(meta.variants?.technicalHistorical)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-md inline-flex items-center gap-1 shadow-2xs"
                    >
                      <Send className="w-3 h-3 text-blue-300" />
                      <span>Use in Canvas</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: SEO METADATA */}
        {activeTab === 'seo' && (
          <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6 text-xs">
            <div className="border-b border-[#e5dfd3] pb-3">
              <h3 className="font-editorial text-xl font-bold text-[#1e232a]">
                SEO Metadata & E-Commerce Handles
              </h3>
              <p className="text-xs text-[#736c61] mt-0.5">
                Optimize search performance and URL slugs without compromising editorial voice.
              </p>
            </div>

            <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[#5c5447]">SEO Title Tag</label>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleGenerateSingleField('seoTitle')}
                      className="text-[10px] text-amber-800 hover:text-amber-950 font-semibold inline-flex items-center gap-0.5"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>Auto Generate</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={meta.seoTitle || ''}
                    onChange={(e) => handleUpdateMeta('seoTitle', e.target.value)}
                    placeholder="SEO title tag under 60 chars..."
                    className="w-full p-2.5 rounded-md border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white"
                  />
                  <div className="text-[10px] text-[#736c61] mt-1">
                    {(meta.seoTitle || '').length} / 60 characters
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">URL Slug / Handle</label>
                  <input
                    type="text"
                    value={meta.slug || ''}
                    onChange={(e) => handleUpdateMeta('slug', e.target.value)}
                    placeholder="waxed-canvas-field-bag"
                    className="w-full p-2.5 rounded-md border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-[#5c5447]">Meta Description</label>
                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleGenerateSingleField('metaDescription')}
                    className="text-[10px] text-amber-800 hover:text-amber-950 font-semibold inline-flex items-center gap-0.5"
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Auto Generate</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={meta.metaDescription || ''}
                  onChange={(e) => handleUpdateMeta('metaDescription', e.target.value)}
                  placeholder="Meta description under 160 characters..."
                  className="w-full p-2.5 rounded-md border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white"
                />
                <div className="text-[10px] text-[#736c61] mt-1">
                  {(meta.metaDescription || '').length} / 160 characters
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[#f0ece3]">
                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Primary Target Keyword</label>
                  <input
                    type="text"
                    value={meta.primaryKeyword || ''}
                    onChange={(e) => handleUpdateMeta('primaryKeyword', e.target.value)}
                    placeholder="e.g. waxed canvas field bag"
                    className="w-full p-2.5 rounded-md border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[#5c5447] mb-1">Secondary Keywords (comma separated)</label>
                  <input
                    type="text"
                    value={(meta.secondaryKeywords || []).join(', ')}
                    onChange={(e) =>
                      handleUpdateMeta(
                        'secondaryKeywords',
                        e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                      )
                    }
                    placeholder="e.g. brass hardware bag, heavy paraffin duck canvas"
                    className="w-full p-2.5 rounded-md border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* AI COMMAND BAR */}
      <AiCommandBar
        selectedText={selectedText}
        isLoading={isLoading}
        onExecuteCommand={(command, scope) =>
          handleExecuteAiAction('custom_command', command, scope)
        }
      />
    </div>
  );
};
