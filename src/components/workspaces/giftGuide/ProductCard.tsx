/**
 * Science of Gifts - Gift Guide Product Card (Phase 5 & Intelligent AI Product Research)
 * Structured product record with clear vertical hierarchy and responsive layout.
 * Eliminates horizontal crowding: Title, status badges, reorder controls, and generate actions
 * are placed in dedicated layout tiers so no elements overlap.
 * Features intelligent AI-assisted product research, page content analysis, and guide-context
 * synthesis with non-destructive suggestion protection for existing user edits.
 * Uses React Portal for AI Actions menu to guarantee unclipped viewport positioning.
 */

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { GiftProduct } from '../../../types/giftGuide';
import { cleanTrackingParameters } from '../../../utils/urlUtils';
import { analyzeProductResearch, ProductResearchGuideContext } from '../../../services/productResearchService';
import {
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  Sparkles,
  ExternalLink,
  Tag,
  FileText,
  Clock,
  HelpCircle,
  CheckCircle2,
  AlertCircle,
  Plus,
  Globe,
  Loader2,
  Check,
  X,
  ShieldCheck,
} from 'lucide-react';

interface ProductCardProps {
  product: GiftProduct;
  index: number;
  totalCount: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onChange: (updated: Partial<GiftProduct>) => void;
  onMove: (direction: 'up' | 'down') => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onGenerateSection: (product: GiftProduct) => void;
  onExecuteProductAiAction: (product: GiftProduct, action: string, customCommand?: string) => void;
  onInsertIntoDraft: (product: GiftProduct) => void;
  isDuplicateUrl?: boolean;
  guideContext?: ProductResearchGuideContext;
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  index,
  totalCount,
  isExpanded,
  onToggleExpand,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
  onGenerateSection,
  onExecuteProductAiAction,
  onInsertIntoDraft,
  isDuplicateUrl = false,
  guideContext,
}) => {
  const [activeTab, setActiveTab] = useState<'fields' | 'copy'>('fields');
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const [aiMenuCoords, setAiMenuCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Intelligent Product Research State
  const [isAnalyzingProduct, setIsAnalyzingProduct] = useState(false);
  const [researchStatusMsg, setResearchStatusMsg] = useState<{ text: string; isError?: boolean } | null>(null);
  const [pendingSuggestions, setPendingSuggestions] = useState<Partial<Record<keyof GiftProduct, string>> | null>(null);
  const [canonicalSuggestion, setCanonicalSuggestion] = useState<string | null>(null);

  const hasCopy = Boolean(product.generatedCopy && product.generatedCopy.trim());
  const filledFieldsCount = [
    product.url,
    product.summary,
    product.materialDetails,
    product.historicalContext,
    product.whyItFits,
    product.bestFor,
  ].filter(Boolean).length;

  const handleUrlBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw) {
      const cleaned = cleanTrackingParameters(raw);
      if (cleaned !== raw) {
        onChange({ url: cleaned });
      }
    }
  };

  const handleFetchAndAnalyzeProduct = async () => {
    if (!product.url || !product.url.trim()) {
      setResearchStatusMsg({ text: 'Please enter or paste a valid product URL first.', isError: true });
      return;
    }

    setIsAnalyzingProduct(true);
    setResearchStatusMsg({ text: 'Retrieving product page and synthesizing AI editorial analysis for this guide...' });

    try {
      const res = await analyzeProductResearch(product.url, undefined, guideContext);
      if (!res.ok || !res.metadata) {
        setResearchStatusMsg({
          text: res.error || 'Unable to retrieve details from this product page. Manual entry remains available.',
          isError: true,
        });
        return;
      }

      const m = res.metadata;
      const directUpdates: Partial<GiftProduct> = {};
      const newSuggestions: Partial<Record<keyof GiftProduct, string>> = {};

      const fieldsToMap: Array<{ key: keyof GiftProduct; fetchedValue?: string }> = [
        { key: 'name', fetchedValue: m.productName },
        { key: 'productType', fetchedValue: m.productType },
        { key: 'summary', fetchedValue: m.rawProductInfo || m.materials ? `${m.rawProductInfo || ''}` : undefined },
        { key: 'materialDetails', fetchedValue: m.materials || (m.features ? `Features: ${m.features}` : undefined) },
        { key: 'designDetails', fetchedValue: m.designConcept },
        { key: 'historicalContext', fetchedValue: m.historicalContext },
        { key: 'whyItFits', fetchedValue: m.whyItFits },
        { key: 'bestFor', fetchedValue: m.bestFor || m.intendedRecipient },
        { key: 'buyerConsiderations', fetchedValue: m.buyerConsiderations || m.additionalFacts },
        { key: 'rawInfo', fetchedValue: m.rawProductInfo },
      ];

      let filledCount = 0;
      let suggestionCount = 0;

      fieldsToMap.forEach(({ key, fetchedValue }) => {
        if (!fetchedValue || !fetchedValue.trim()) return;
        const cleanVal = fetchedValue.trim();
        const currentVal = (product[key] || '').toString().trim();

        if (!currentVal) {
          // Auto-fill empty fields directly
          directUpdates[key] = cleanVal;
          filledCount++;
        } else if (currentVal !== cleanVal) {
          // Field already has user content -> suggest non-destructively
          newSuggestions[key] = cleanVal;
          suggestionCount++;
        }
      });

      if (m.imageUrl && !product.imageUrl) {
        directUpdates.imageUrl = m.imageUrl;
      }

      // Canonical URL check
      if (m.canonicalUrl && m.canonicalUrl.trim() && m.canonicalUrl.trim().toLowerCase() !== product.url.trim().toLowerCase()) {
        setCanonicalSuggestion(m.canonicalUrl.trim());
      } else {
        setCanonicalSuggestion(null);
      }

      // Apply direct updates
      if (Object.keys(directUpdates).length > 0) {
        onChange(directUpdates);
      }

      // Set pending suggestions
      if (Object.keys(newSuggestions).length > 0) {
        setPendingSuggestions(newSuggestions);
      } else {
        setPendingSuggestions(null);
      }

      let msg = '';
      if (filledCount > 0 && suggestionCount > 0) {
        msg = `AI research complete: Populated ${filledCount} empty field(s). ${suggestionCount} field(s) have pending suggestions below.`;
      } else if (filledCount > 0) {
        msg = `AI research complete: Populated ${filledCount} field(s) with verified specs and guide-specific synthesis.`;
      } else if (suggestionCount > 0) {
        msg = `Found ${suggestionCount} suggested update(s) for populated fields below.`;
      } else {
        msg = `AI product research complete. All fields are up to date.`;
      }

      setResearchStatusMsg({ text: msg, isError: false });
    } catch (err: any) {
      setResearchStatusMsg({
        text: err?.message || 'Failed to analyze product details.',
        isError: true,
      });
    } finally {
      setIsAnalyzingProduct(false);
    }
  };

  const handleApplySuggestion = (key: keyof GiftProduct) => {
    if (!pendingSuggestions || !pendingSuggestions[key]) return;
    const val = pendingSuggestions[key]!;
    onChange({ [key]: val });

    const next = { ...pendingSuggestions };
    delete next[key];
    setPendingSuggestions(Object.keys(next).length > 0 ? next : null);
  };

  const handleDismissSuggestion = (key: keyof GiftProduct) => {
    if (!pendingSuggestions) return;
    const next = { ...pendingSuggestions };
    delete next[key];
    setPendingSuggestions(Object.keys(next).length > 0 ? next : null);
  };

  const handleApplyAllSuggestions = () => {
    if (!pendingSuggestions) return;
    onChange(pendingSuggestions);
    setPendingSuggestions(null);
  };

  const handleDismissAllSuggestions = () => {
    setPendingSuggestions(null);
  };

  const toggleAiMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAiMenuOpen && aiButtonRef.current) {
      const rect = aiButtonRef.current.getBoundingClientRect();
      const menuWidth = 256;
      const padding = 12;

      let top = rect.bottom + 6;
      const estimatedHeight = 280;
      if (top + estimatedHeight > window.innerHeight - padding) {
        top = Math.max(padding, rect.top - estimatedHeight - 6);
      }

      let left = rect.right - menuWidth;
      if (left < padding) {
        left = Math.max(padding, rect.left);
      }
      if (left + menuWidth > window.innerWidth - padding) {
        left = Math.max(padding, window.innerWidth - menuWidth - padding);
      }

      setAiMenuCoords({ top, left });
      setIsAiMenuOpen(true);
    } else {
      setIsAiMenuOpen(false);
    }
  };

  useEffect(() => {
    if (!isAiMenuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        aiButtonRef.current &&
        !aiButtonRef.current.contains(e.target as Node) &&
        !(e.target as Element).closest('.ai-actions-portal-menu')
      ) {
        setIsAiMenuOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsAiMenuOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAiMenuOpen(false);
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAiMenuOpen]);

  const renderFieldSuggestionPill = (key: keyof GiftProduct, label: string, isSourceFact = false) => {
    if (!pendingSuggestions || !pendingSuggestions[key]) return null;
    const val = pendingSuggestions[key]!;

    return (
      <div className="mt-1.5 p-2 bg-amber-50/90 border border-amber-200/90 rounded-lg text-xs space-y-1 animate-in fade-in duration-100">
        <div className="flex items-center justify-between text-[11px] font-semibold text-amber-950">
          <div className="flex items-center gap-1.5 min-w-0">
            <span>Suggested {label}:</span>
            {isSourceFact ? (
              <span className="px-1 py-0.2 rounded text-[9px] font-mono bg-stone-200/80 text-stone-800 border border-stone-300">
                Verified Source Spec
              </span>
            ) : (
              <span className="px-1 py-0.2 rounded text-[9px] font-mono bg-amber-200/80 text-amber-900 border border-amber-300">
                AI Guide Synthesis
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <button
              type="button"
              onClick={() => handleApplySuggestion(key)}
              className="px-2 py-0.5 bg-amber-900 text-white hover:bg-amber-950 rounded text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer shadow-2xs"
            >
              <Check className="w-3 h-3" />
              <span>Apply</span>
            </button>
            <button
              type="button"
              onClick={() => handleDismissSuggestion(key)}
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

  return (
    <div
      className={`rounded-xl border transition-all duration-200 overflow-hidden ${
        isExpanded
          ? 'bg-white border-[#c9c1b3] shadow-md ring-1 ring-amber-400/30'
          : 'bg-[#faf9f6] hover:bg-white border-[#e5dfd3] shadow-2xs'
      }`}
    >
      {/* ============================================================== */}
      {/* PRODUCT CARD HEADER (Structured Multi-Tier Hierarchy)        */}
      {/* ============================================================== */}
      <div
        onClick={onToggleExpand}
        className="p-3 cursor-pointer select-none transition-colors group space-y-2"
      >
        {/* TIER 1: Product Number, Title, Type & Header Controls */}
        <div className="flex items-start justify-between gap-2.5">
          {/* Identity: Number Badge + Title + Type Tag */}
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <div className="w-5 h-5 rounded-md bg-[#ede7dc] text-[#5c5447] text-[11px] font-bold font-mono flex items-center justify-center shrink-0 mt-0.5">
              #{index + 1}
            </div>

            <div className="min-w-0 flex-1">
              <h4
                className="font-editorial text-sm font-bold text-[#1e232a] leading-snug line-clamp-2 break-words group-hover:text-amber-950 transition-colors"
                title={product.name || 'Untitled Product'}
              >
                {product.name || 'Untitled Product'}
              </h4>

              {product.productType && (
                <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f0ede6] text-[#5c5447] border border-[#e2dcce] truncate max-w-full">
                  {product.productType}
                </span>
              )}
            </div>
          </div>

          {/* Controls: Reorder Up/Down + Expand/Collapse Chevron */}
          <div
            className="flex items-center gap-1 shrink-0 ml-1"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Reorder Buttons */}
            <div className="flex items-center border border-[#e5dfd3] rounded-md bg-white overflow-hidden shadow-2xs">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => onMove('up')}
                title="Move product up in guide sequence"
                className="p-1 text-[#736c61] hover:text-[#1e232a] hover:bg-[#f5f2ea] disabled:opacity-25 disabled:hover:bg-transparent transition-colors cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={index === totalCount - 1}
                onClick={() => onMove('down')}
                title="Move product down in guide sequence"
                className="p-1 text-[#736c61] hover:text-[#1e232a] hover:bg-[#f5f2ea] disabled:opacity-25 disabled:hover:bg-transparent transition-colors border-l border-[#e5dfd3] cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Expand / Collapse Button */}
            <button
              type="button"
              onClick={onToggleExpand}
              className="p-1 text-[#736c61] hover:text-[#1e232a] rounded-md hover:bg-[#ede7dc] transition-colors cursor-pointer"
              title={isExpanded ? 'Collapse product card' : 'Expand full product specifications'}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* TIER 2: Summary Snippet */}
        {product.summary ? (
          <p
            className="text-[11px] text-[#736c61] leading-relaxed line-clamp-1 pl-[28px]"
            title={product.summary}
          >
            {product.summary}
          </p>
        ) : !isExpanded ? (
          <p className="text-[10px] italic text-[#a8a194] pl-[28px]">
            Click to research specifications & craft details
          </p>
        ) : null}

        {/* TIER 3: Status Badges & Quick AI Generate Action */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#ede7dc]/70">
          {/* Status Badges */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {isDuplicateUrl && (
              <span
                title="Duplicate URL detected in this guide"
                className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5 shrink-0"
              >
                <AlertCircle className="w-3 h-3 text-amber-700" />
                <span>Duplicate</span>
              </span>
            )}

            {hasCopy ? (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1 shrink-0">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>Drafted</span>
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium text-[#7a7266] bg-[#f0ede6] border border-[#e2dcce] shrink-0">
                {filledFieldsCount}/6 Specs
              </span>
            )}
          </div>

          {/* Quick Generate Action */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGenerateSection(product);
            }}
            title={hasCopy ? 'Regenerate product section with AI' : 'Generate product section with AI'}
            className="px-2 py-1 text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300/80 rounded-md transition-colors inline-flex items-center gap-1 text-[11px] font-semibold shadow-2xs shrink-0 cursor-pointer ml-auto"
          >
            <Sparkles className="w-3 h-3 text-amber-700" />
            <span>{hasCopy ? 'Regenerate' : 'Generate'}</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* EXPANDED EDITING PANEL                                         */}
      {/* ============================================================== */}
      {isExpanded && (
        <div className="p-3.5 border-t border-[#ede7db] bg-white space-y-3.5 animate-in fade-in duration-150">
          {/* Top Actions & Sub-Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#f0ece3] pb-3">
            <div className="flex bg-[#f2eee5] p-0.5 rounded-lg text-xs font-medium text-[#5c5447]">
              <button
                type="button"
                onClick={() => setActiveTab('fields')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  activeTab === 'fields'
                    ? 'bg-white text-[#1e232a] font-semibold shadow-2xs'
                    : 'hover:text-[#1e232a]'
                }`}
              >
                Specs & Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('copy')}
                className={`px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  activeTab === 'copy'
                    ? 'bg-white text-[#1e232a] font-semibold shadow-2xs'
                    : 'hover:text-[#1e232a]'
                }`}
              >
                <span>Editorial Copy</span>
                {hasCopy && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </button>
            </div>

            {/* AI Action Trigger Dropdown */}
            <div className="relative">
              <button
                ref={aiButtonRef}
                type="button"
                onClick={toggleAiMenu}
                className="px-2.5 py-1 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>AI Actions</span>
                <ChevronDown className="w-3 h-3 text-stone-300" />
              </button>
            </div>
          </div>

          {/* TAB 1: STRUCTURED FIELDS (Clean Stacked Layout) */}
          {activeTab === 'fields' && (
            <div className="space-y-3.5 text-xs">
              {/* PENDING SUGGESTIONS BANNERS */}
              {pendingSuggestions && Object.keys(pendingSuggestions).length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-300/80 rounded-xl flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 text-amber-950 min-w-0">
                    <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
                    <span className="truncate">
                      AI research found suggestions for <strong>{Object.keys(pendingSuggestions).length}</strong> populated field(s).
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleApplyAllSuggestions}
                      className="px-2.5 py-1 text-xs font-bold text-white bg-amber-900 hover:bg-amber-950 rounded-lg transition-colors shadow-2xs cursor-pointer"
                    >
                      Apply All
                    </button>
                    <button
                      type="button"
                      onClick={handleDismissAllSuggestions}
                      className="px-2 py-1 text-xs font-medium text-amber-800 hover:text-amber-950 cursor-pointer"
                    >
                      Dismiss All
                    </button>
                  </div>
                </div>
              )}

              {/* CANONICAL SUGGESTION PILL */}
              {canonicalSuggestion && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-950 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate text-[11px]">
                      Canonical URL: <code className="font-mono">{canonicalSuggestion}</code>
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onChange({ url: canonicalSuggestion });
                        setCanonicalSuggestion(null);
                      }}
                      className="px-2 py-0.5 bg-emerald-800 text-white hover:bg-emerald-950 rounded text-[10px] font-bold cursor-pointer"
                    >
                      Use Canonical
                    </button>
                    <button
                      type="button"
                      onClick={() => setCanonicalSuggestion(null)}
                      className="px-1.5 py-0.5 text-emerald-800 hover:text-emerald-950 text-[10px] font-medium cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {/* PRODUCT CLEAN URL & FETCH & ANALYZE ACTION */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                  Product Clean URL *
                </label>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                  <input
                    type="text"
                    value={product.url}
                    onChange={(e) => onChange({ url: e.target.value })}
                    onBlur={handleUrlBlur}
                    placeholder="https://shop.scienceofgifts.com/products/..."
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 font-mono text-[11px]"
                  />

                  {/* FETCH & ANALYZE PRODUCT BUTTON */}
                  <button
                    type="button"
                    disabled={isAnalyzingProduct || !product.url || !product.url.trim()}
                    onClick={handleFetchAndAnalyzeProduct}
                    className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs shrink-0 disabled:opacity-50 cursor-pointer"
                    title="Retrieve product page content and run AI research analysis tailored to this gift guide"
                  >
                    {isAnalyzingProduct ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    )}
                    <span>{isAnalyzingProduct ? 'Analyzing...' : 'Fetch & Analyze Product'}</span>
                  </button>

                  {product.url && (
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-[#736c61] hover:text-amber-800 bg-[#f5f2ea] rounded-lg border border-[#dcd6ca] shrink-0"
                      title="Open product link in new tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>

                {/* FETCH STATUS / ERROR MESSAGE */}
                {researchStatusMsg && (
                  <div
                    className={`mt-1.5 p-2 rounded-lg text-[11px] leading-relaxed flex items-center justify-between gap-2 ${
                      researchStatusMsg.isError
                        ? 'bg-rose-50 text-rose-900 border border-rose-200'
                        : 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {researchStatusMsg.isError ? (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      )}
                      <span className="truncate">{researchStatusMsg.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setResearchStatusMsg(null)}
                      className="p-0.5 text-stone-500 hover:text-stone-800 shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>

              {/* PRODUCT NAME */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                  Product Name *
                </label>
                <input
                  type="text"
                  value={product.name}
                  onChange={(e) => onChange({ name: e.target.value })}
                  placeholder="e.g. Dalvey Voyager Pocket Compass"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 font-editorial text-sm font-semibold"
                />
                {renderFieldSuggestionPill('name', 'Product Name', true)}
              </div>

              {/* PRODUCT TYPE / CATEGORY */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                  Product Type / Category
                </label>
                <input
                  type="text"
                  value={product.productType || ''}
                  onChange={(e) => onChange({ productType: e.target.value })}
                  placeholder="e.g. Navigational Instrument / Watch / Desk Tool"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 text-xs"
                />
                {renderFieldSuggestionPill('productType', 'Product Type', true)}
              </div>

              {/* SHORT PRODUCT SUMMARY */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                  Short Product Summary
                </label>
                <input
                  type="text"
                  value={product.summary || ''}
                  onChange={(e) => onChange({ summary: e.target.value })}
                  placeholder="e.g. Machined Scottish brass instrument with liquid-damped sapphire capsule."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 text-xs"
                />
                {renderFieldSuggestionPill('summary', 'Summary', true)}
              </div>

              {/* PHYSICAL / MATERIAL DETAILS */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1 flex items-center justify-between">
                  <span>Physical & Material Details</span>
                  <span className="text-[9px] text-[#8a8275] font-normal font-mono">Verified Source Facts</span>
                </label>
                <textarea
                  rows={2}
                  value={product.materialDetails || ''}
                  onChange={(e) => onChange({ materialDetails: e.target.value })}
                  placeholder="e.g. Solid turned mirror-polished brass, stainless steel latch, synthetic sapphire jewel, 70mm diameter."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 resize-none text-[11px] leading-relaxed"
                />
                {renderFieldSuggestionPill('materialDetails', 'Material Specs', true)}
              </div>

              {/* HISTORICAL CONTEXT */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1 flex items-center justify-between">
                  <span>Historical Context & Lineage</span>
                  <span className="text-[9px] text-[#8a8275] font-normal font-mono">Provenance & tradition</span>
                </label>
                <textarea
                  rows={2}
                  value={product.historicalContext || ''}
                  onChange={(e) => onChange({ historicalContext: e.target.value })}
                  placeholder="e.g. Patterned after 1920s Royal Navy pocket navigation compasses used for open-sea navigation."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 resize-none text-[11px] leading-relaxed"
                />
                {renderFieldSuggestionPill('historicalContext', 'Historical Context')}
              </div>

              {/* WHY IT FITS THIS GUIDE */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1 flex items-center justify-between">
                  <span>Why It Fits This Guide</span>
                  <span className="text-[9px] text-amber-800 font-normal font-mono">AI Guide Synthesis</span>
                </label>
                <input
                  type="text"
                  value={product.whyItFits || ''}
                  onChange={(e) => onChange({ whyItFits: e.target.value })}
                  placeholder="e.g. Provides genuine analog heft and mechanical connection to geography."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 text-[11px]"
                />
                {renderFieldSuggestionPill('whyItFits', 'Why It Fits')}
              </div>

              {/* BEST FOR */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1 flex items-center justify-between">
                  <span>Best For (Recipient / Use Case)</span>
                  <span className="text-[9px] text-amber-800 font-normal font-mono">AI Guide Synthesis</span>
                </label>
                <input
                  type="text"
                  value={product.bestFor || ''}
                  onChange={(e) => onChange({ bestFor: e.target.value })}
                  placeholder="e.g. The hiker, cartographer, or desk enthusiast who prizes precision instruments."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 text-[11px]"
                />
                {renderFieldSuggestionPill('bestFor', 'Best For')}
              </div>

              {/* DESIGN & SENSORY DETAILS */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                  Design & Sensory Details
                </label>
                <input
                  type="text"
                  value={product.designDetails || ''}
                  onChange={(e) => onChange({ designDetails: e.target.value })}
                  placeholder="e.g. Heavy push-button lid snaps open with crisp pocket-watch click."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 text-[11px]"
                />
                {renderFieldSuggestionPill('designDetails', 'Design Details')}
              </div>

              {/* BUYER CONSIDERATIONS */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1 flex items-center justify-between">
                  <span>Buyer Considerations & Caveats</span>
                  <span className="text-[9px] text-[#8a8275] font-normal font-mono">Factual Guidance</span>
                </label>
                <input
                  type="text"
                  value={product.buyerConsiderations || ''}
                  onChange={(e) => onChange({ buyerConsiderations: e.target.value })}
                  placeholder="e.g. Substantially heavier than plastic trail compasses; designed for heirloom carry."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 text-[11px]"
                />
                {renderFieldSuggestionPill('buyerConsiderations', 'Buyer Considerations')}
              </div>

              {/* PRODUCT-SPECIFIC EDITORIAL DIRECTION */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                  Product-Specific Editorial Direction
                </label>
                <input
                  type="text"
                  value={product.productInstructions || ''}
                  onChange={(e) => onChange({ productInstructions: e.target.value })}
                  placeholder="e.g. Emphasize why the jewel movement grounds the owner during stressful days."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 text-[11px]"
                />
                {renderFieldSuggestionPill('productInstructions', 'Editorial Direction')}
              </div>
            </div>
          )}

          {/* TAB 2: GENERATED EDITORIAL COPY */}
          {activeTab === 'copy' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447]">
                  Product Section Editorial Prose
                </span>
                {hasCopy && (
                  <button
                    type="button"
                    onClick={() => onInsertIntoDraft(product)}
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Insert into Draft</span>
                  </button>
                )}
              </div>

              <textarea
                rows={6}
                value={product.generatedCopy || ''}
                onChange={(e) => onChange({ generatedCopy: e.target.value })}
                placeholder="Editorial prose for this product entry. Click 'Generate' to draft with AI based on your structured specifications..."
                className="w-full p-2.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 font-editorial text-xs leading-relaxed"
              />

              <div className="flex items-center justify-between pt-1 text-[11px] text-[#736c61]">
                <span>
                  Word count:{' '}
                  {product.generatedCopy
                    ? product.generatedCopy.split(/\s+/).filter(Boolean).length
                    : 0}{' '}
                  words
                </span>
                <span className="text-[10px] text-[#a8a194] italic">
                  Preserved in project state
                </span>
              </div>
            </div>
          )}

          {/* Card Footer Actions */}
          <div className="pt-3 border-t border-[#f0ece3] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDuplicate}
                className="px-2.5 py-1 text-xs font-medium text-[#5c5447] hover:text-[#1e232a] hover:bg-[#f5f2ea] rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>Duplicate</span>
              </button>

              <button
                type="button"
                onClick={onDelete}
                className="px-2.5 py-1 text-xs font-medium text-rose-700 hover:text-rose-900 hover:bg-rose-50 rounded-md transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleExpand}
              className="text-xs font-semibold text-[#5c5447] hover:text-[#1e232a] cursor-pointer"
            >
              Done Editing
            </button>
          </div>
        </div>
      )}

      {/* PORTAL AI ACTIONS MENU */}
      {isAiMenuOpen &&
        createPortal(
          <div
            className="ai-actions-portal-menu fixed z-50 w-64 bg-white border border-[#dcd6ca] rounded-xl shadow-xl py-1 text-xs divide-y divide-[#f0ece3] animate-in fade-in zoom-in-95 max-h-[80vh] overflow-y-auto"
            style={{
              top: `${aiMenuCoords.top}px`,
              left: `${aiMenuCoords.left}px`,
            }}
          >
            <div className="p-1">
              <button
                type="button"
                onClick={() => {
                  setIsAiMenuOpen(false);
                  onGenerateSection(product);
                }}
                className="w-full px-3 py-2 text-left hover:bg-[#faf8f4] rounded-lg flex flex-col transition-colors cursor-pointer"
              >
                <strong className="text-[#1e232a]">Generate Full Section</strong>
                <span className="text-[10px] text-[#736c61]">
                  Creates refined entry using specs, position & guide context
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAiMenuOpen(false);
                  onExecuteProductAiAction(product, 'rewrite_product_section');
                }}
                className="w-full px-3 py-2 text-left hover:bg-[#faf8f4] rounded-lg flex flex-col transition-colors cursor-pointer"
              >
                <strong className="text-[#1e232a]">Rewrite Product Section</strong>
                <span className="text-[10px] text-[#736c61]">
                  Fresh phrasing and rhythm honoring provided specs
                </span>
              </button>
            </div>

            <div className="p-1">
              <button
                type="button"
                onClick={() => {
                  setIsAiMenuOpen(false);
                  onExecuteProductAiAction(product, 'generate_best_for');
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-[#faf8f4] rounded-lg flex items-center justify-between text-[#2b251d] cursor-pointer"
              >
                <span>Generate "Best For"</span>
                <Tag className="w-3 h-3 text-stone-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAiMenuOpen(false);
                  onExecuteProductAiAction(product, 'generate_product_buyer_advice');
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-[#faf8f4] rounded-lg flex items-center justify-between text-[#2b251d] cursor-pointer"
              >
                <span>Generate Buyer Considerations</span>
                <HelpCircle className="w-3 h-3 text-stone-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAiMenuOpen(false);
                  onExecuteProductAiAction(product, 'make_product_concise');
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-[#faf8f4] rounded-lg flex items-center justify-between text-[#2b251d] cursor-pointer"
              >
                <span>Make More Concise</span>
                <FileText className="w-3 h-3 text-stone-400" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAiMenuOpen(false);
                  onExecuteProductAiAction(product, 'add_product_historical_context');
                }}
                className="w-full px-3 py-1.5 text-left hover:bg-[#faf8f4] rounded-lg flex items-center justify-between text-[#2b251d] cursor-pointer"
              >
                <span>Deepen Historical / Craft Context</span>
                <Clock className="w-3 h-3 text-stone-400" />
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
