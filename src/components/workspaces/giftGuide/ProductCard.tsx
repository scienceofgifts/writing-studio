/**
 * Science of Gifts - Gift Guide Product Card (Phase 5)
 * Structured product record with compact collapsed state and rich expanded fields.
 * Includes drag/move/duplicate/delete/generate actions and duplicate detection.
 */

import React, { useState } from 'react';
import { GiftProduct, ProductSectionFormat } from '../../../types/giftGuide';
import { cleanTrackingParameters } from '../../../utils/urlUtils';
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
  Hammer,
  HelpCircle,
  Eye,
  CheckCircle2,
  AlertCircle,
  Plus,
  Loader2,
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
}) => {
  const [activeTab, setActiveTab] = useState<'fields' | 'copy'>('fields');
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);

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

  return (
    <div
      className={`rounded-xl border transition-all duration-200 ${
        isExpanded
          ? 'bg-white border-[#c9c1b3] shadow-md ring-1 ring-amber-400/30'
          : 'bg-[#faf9f6] hover:bg-white border-[#e5dfd3] shadow-2xs'
      }`}
    >
      {/* COLLAPSED HEADER CARD */}
      <div className="p-3.5 flex items-center justify-between gap-3">
        {/* Left: Position & Basic Info */}
        <div
          onClick={onToggleExpand}
          className="flex-1 flex items-center gap-3 cursor-pointer select-none min-w-0"
        >
          <div className="w-6 h-6 rounded-md bg-[#ede7dc] text-[#5c5447] text-xs font-bold font-mono flex items-center justify-center shrink-0">
            #{index + 1}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-editorial text-sm font-bold text-[#1e232a] truncate">
                {product.name || 'Untitled Product'}
              </h4>
              {product.productType && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#f0ede6] text-[#5c5447] border border-[#e2dcce] shrink-0">
                  {product.productType}
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-[11px] text-[#736c61] mt-0.5 truncate">
              {product.summary ? (
                <span className="truncate max-w-[280px]">{product.summary}</span>
              ) : (
                <span className="italic text-[#a8a194]">Click to add specs & details</span>
              )}
            </div>
          </div>
        </div>

        {/* Right: Status & Quick Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isDuplicateUrl && (
            <span
              title="Duplicate URL detected in this guide"
              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5"
            >
              <AlertCircle className="w-3 h-3 text-amber-700" />
              <span>Duplicate URL</span>
            </span>
          )}

          {hasCopy ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Drafted</span>
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[10px] text-[#8a8275] bg-[#f2eee5]">
              {filledFieldsCount}/6 Specs
            </span>
          )}

          {/* Quick AI Generate Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGenerateSection(product);
            }}
            title="Generate Product Section with AI"
            className="p-1.5 text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200/80 rounded-lg transition-colors inline-flex items-center gap-1 text-[11px] font-semibold shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">Generate</span>
          </button>

          {/* Reorder Buttons */}
          <div className="flex items-center border border-[#e5dfd3] rounded-lg bg-white overflow-hidden">
            <button
              type="button"
              disabled={index === 0}
              onClick={(e) => {
                e.stopPropagation();
                onMove('up');
              }}
              title="Move Up"
              className="p-1 text-[#736c61] hover:text-[#1e232a] hover:bg-[#f5f2ea] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={index === totalCount - 1}
              onClick={(e) => {
                e.stopPropagation();
                onMove('down');
              }}
              title="Move Down"
              className="p-1 text-[#736c61] hover:text-[#1e232a] hover:bg-[#f5f2ea] disabled:opacity-30 disabled:hover:bg-transparent transition-colors border-l border-[#e5dfd3]"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Expand Toggle */}
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-1.5 text-[#736c61] hover:text-[#1e232a] rounded-lg hover:bg-[#ede7dc] transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand full product fields'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* EXPANDED EDITING PANEL */}
      {isExpanded && (
        <div className="p-4 border-t border-[#ede7db] bg-white space-y-4 animate-in fade-in duration-150">
          {/* Top Actions & Sub-Tabs */}
          <div className="flex items-center justify-between gap-3 border-b border-[#f0ece3] pb-3">
            <div className="flex bg-[#f2eee5] p-0.5 rounded-lg text-xs font-medium text-[#5c5447]">
              <button
                type="button"
                onClick={() => setActiveTab('fields')}
                className={`px-3 py-1 rounded-md transition-colors ${
                  activeTab === 'fields' ? 'bg-white text-[#1e232a] shadow-2xs' : 'hover:text-[#1e232a]'
                }`}
              >
                Structured Product Data
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('copy')}
                className={`px-3 py-1 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  activeTab === 'copy' ? 'bg-white text-[#1e232a] shadow-2xs' : 'hover:text-[#1e232a]'
                }`}
              >
                <span>Editorial Copy</span>
                {hasCopy && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </button>
            </div>

            {/* AI Action Trigger Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsAiMenuOpen(!isAiMenuOpen)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Product AI Actions</span>
                <ChevronDown className="w-3 h-3 text-stone-300" />
              </button>

              {isAiMenuOpen && (
                <div className="absolute right-0 mt-1 w-64 bg-white border border-[#dcd6ca] rounded-xl shadow-xl z-30 py-1 text-xs divide-y divide-[#f0ece3] animate-in fade-in zoom-in-95">
                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAiMenuOpen(false);
                        onGenerateSection(product);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-[#faf8f4] rounded-lg flex flex-col transition-colors"
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
                      className="w-full px-3 py-2 text-left hover:bg-[#faf8f4] rounded-lg flex flex-col transition-colors"
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
                      className="w-full px-3 py-1.5 text-left hover:bg-[#faf8f4] rounded-lg flex items-center justify-between text-[#2b251d]"
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
                      className="w-full px-3 py-1.5 text-left hover:bg-[#faf8f4] rounded-lg flex items-center justify-between text-[#2b251d]"
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
                      className="w-full px-3 py-1.5 text-left hover:bg-[#faf8f4] rounded-lg flex items-center justify-between text-[#2b251d]"
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
                      className="w-full px-3 py-1.5 text-left hover:bg-[#faf8f4] rounded-lg flex items-center justify-between text-[#2b251d]"
                    >
                      <span>Deepen Historical / Craft Context</span>
                      <Clock className="w-3 h-3 text-stone-400" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TAB 1: STRUCTURED FIELDS */}
          {activeTab === 'fields' && (
            <div className="space-y-3.5 text-xs">
              {/* Row 1: Name, Type, URL */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
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
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                    Product Type
                  </label>
                  <input
                    type="text"
                    value={product.productType || ''}
                    onChange={(e) => onChange({ productType: e.target.value })}
                    placeholder="e.g. Navigational Instrument / Watch / Mug"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                    Product Clean URL
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={product.url}
                      onChange={(e) => onChange({ url: e.target.value })}
                      onBlur={handleUrlBlur}
                      placeholder="https://shop.scienceofgifts.com/products/..."
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 font-mono text-[11px]"
                    />
                    {product.url && (
                      <a
                        href={product.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-[#736c61] hover:text-amber-800 bg-[#f5f2ea] rounded-lg border border-[#dcd6ca]"
                        title="Open product link"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Row 2: Short Summary */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                  Short Product Summary
                </label>
                <input
                  type="text"
                  value={product.summary || ''}
                  onChange={(e) => onChange({ summary: e.target.value })}
                  placeholder="e.g. Machined Scottish brass instrument with liquid-damped sapphire capsule."
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600"
                />
              </div>

              {/* Row 3: Materials & Physical Details & Historical Context */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1 flex items-center justify-between">
                    <span>Physical / Material Details</span>
                    <span className="text-[9px] text-[#8a8275] font-normal">Factual specifications</span>
                  </label>
                  <textarea
                    rows={2}
                    value={product.materialDetails || ''}
                    onChange={(e) => onChange({ materialDetails: e.target.value })}
                    placeholder="e.g. Solid turned mirror-polished brass, stainless steel latch, synthetic sapphire jewel, 70mm diameter."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 resize-none text-[11px] leading-relaxed"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1 flex items-center justify-between">
                    <span>Historical Context & Lineage</span>
                    <span className="text-[9px] text-[#8a8275] font-normal">Provenance & tradition</span>
                  </label>
                  <textarea
                    rows={2}
                    value={product.historicalContext || ''}
                    onChange={(e) => onChange({ historicalContext: e.target.value })}
                    placeholder="e.g. Patterned after 1920s Royal Navy pocket navigation compasses used for open-sea navigation."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 resize-none text-[11px] leading-relaxed"
                  />
                </div>
              </div>

              {/* Row 4: Why It Fits & Best For */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                    Why It Fits This Guide
                  </label>
                  <input
                    type="text"
                    value={product.whyItFits || ''}
                    onChange={(e) => onChange({ whyItFits: e.target.value })}
                    placeholder="e.g. Provides genuine analog heft and mechanical connection to geography."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                    Best For (Recipient / Use Case)
                  </label>
                  <input
                    type="text"
                    value={product.bestFor || ''}
                    onChange={(e) => onChange({ bestFor: e.target.value })}
                    placeholder="e.g. The hiker, cartographer, or desk enthusiast who prizes precision instruments."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 text-[11px]"
                  />
                </div>
              </div>

              {/* Row 5: Design Details & Buyer Considerations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#5c5447] mb-1">
                    Buyer Considerations & Caveats
                  </label>
                  <input
                    type="text"
                    value={product.buyerConsiderations || ''}
                    onChange={(e) => onChange({ buyerConsiderations: e.target.value })}
                    placeholder="e.g. Substantially heavier than plastic trail compasses; designed for heirloom carry."
                    className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 text-[11px]"
                  />
                </div>
              </div>

              {/* Row 6: Product-Specific Editorial Instructions */}
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
                    className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Insert into Main Draft</span>
                  </button>
                )}
              </div>

              <textarea
                rows={6}
                value={product.generatedCopy || ''}
                onChange={(e) => onChange({ generatedCopy: e.target.value })}
                placeholder="Editorial prose for this product entry. Click 'Generate' to draft with AI based on your structured specifications..."
                className="w-full p-3 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 font-editorial text-xs leading-relaxed"
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
                  Preserved in structured project state
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
                className="px-2.5 py-1 text-xs font-medium text-[#5c5447] hover:text-[#1e232a] hover:bg-[#f5f2ea] rounded-md transition-colors inline-flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>Duplicate Product</span>
              </button>

              <button
                type="button"
                onClick={onDelete}
                className="px-2.5 py-1 text-xs font-medium text-rose-700 hover:text-rose-900 hover:bg-rose-50 rounded-md transition-colors inline-flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleExpand}
              className="text-xs font-semibold text-[#5c5447] hover:text-[#1e232a]"
            >
              Done Editing
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
