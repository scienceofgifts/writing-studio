/**
 * Science of Gifts - Guide Information & Settings Drawer (Phase 5)
 * Mutually exclusive drawer for managing overall guide metadata, audience, collection URL, and structural preferences.
 */

import React from 'react';
import { GiftGuideMetadata, ProductSectionFormat } from '../../../types/giftGuide';
import { cleanTrackingParameters } from '../../../utils/urlUtils';
import {
  Sliders,
  X,
  Sparkles,
  ExternalLink,
  HelpCircle,
  BookOpen,
  Tag,
  Search,
  CheckCircle2,
} from 'lucide-react';

interface GuideInfoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  meta: GiftGuideMetadata;
  projectTitle: string;
  onUpdateTitle: (title: string) => void;
  onUpdateMeta: (field: keyof GiftGuideMetadata, value: any) => void;
}

export const GuideInfoDrawer: React.FC<GuideInfoDrawerProps> = ({
  isOpen,
  onClose,
  meta,
  projectTitle,
  onUpdateTitle,
  onUpdateMeta,
}) => {
  if (!isOpen) return null;

  const settings = meta.settings || {
    sectionFormat: 'standard' as ProductSectionFormat,
    showBestFor: true,
    showBuyerAdvice: true,
    showFaq: true,
    showConclusion: true,
    numberProducts: true,
    includeCollectionLink: true,
    desiredSectionLength: '120 - 160 words',
  };

  const handleUpdateSettings = (field: string, value: any) => {
    onUpdateMeta('settings', {
      ...settings,
      [field]: value,
    });
  };

  const handleCollectionUrlBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw) {
      const cleaned = cleanTrackingParameters(raw);
      if (cleaned !== raw) {
        onUpdateMeta('collectionUrl', cleaned);
      }
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg bg-[#faf9f6] border-l border-[#dcd6ca] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-5 border-b border-[#e5dfd3] bg-[#f5f2ea] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-900">
            <Sliders className="w-4 h-4 text-amber-800" />
          </div>
          <div>
            <h3 className="font-editorial text-lg font-semibold text-[#1e232a]">
              Guide Information & Settings
            </h3>
            <p className="text-xs text-[#736c61]">
              Curatorial scope, audience context, and formatting rules
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-[#736c61] hover:text-[#2d333b] rounded-md hover:bg-[#e8e2d5] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 text-xs">
        {/* SECTION 1: CORE GUIDE INFORMATION */}
        <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-3.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447] block border-b border-[#f0ece3] pb-2">
            Curatorial Guide Overview
          </span>

          <div>
            <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
              Guide Headline / Title
            </label>
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => onUpdateTitle(e.target.value)}
              placeholder="e.g. 10 Gifts for WW2 History Buffs"
              className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 font-editorial text-sm font-semibold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
              Standfirst / Short Premise
            </label>
            <textarea
              rows={2}
              value={meta.standfirst || ''}
              onChange={(e) => onUpdateMeta('standfirst', e.target.value)}
              placeholder="e.g. For people who find poetry in contour intervals, hachures, and the tactile weight of archival rag paper."
              className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 resize-none leading-relaxed"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
                Primary Topic
              </label>
              <input
                type="text"
                value={meta.primaryTopic || ''}
                onChange={(e) => onUpdateMeta('primaryTopic', e.target.value)}
                placeholder="e.g. WW2 gifts / Cartography"
                className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
                Occasion / Theme / Niche
              </label>
              <input
                type="text"
                value={meta.occasionOrNiche || ''}
                onChange={(e) => onUpdateMeta('occasionOrNiche', e.target.value)}
                placeholder="e.g. Military History / Birthday"
                className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
              Target Audience
            </label>
            <input
              type="text"
              value={meta.audience || ''}
              onChange={(e) => onUpdateMeta('audience', e.target.value)}
              placeholder="e.g. People shopping for someone deeply interested in WW2 history or aviation"
              className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
              Primary Search Intent / Target Keyword
            </label>
            <input
              type="text"
              value={meta.searchIntent || meta.targetKeyword || ''}
              onChange={(e) => {
                onUpdateMeta('searchIntent', e.target.value);
                onUpdateMeta('targetKeyword', e.target.value);
              }}
              placeholder="e.g. Discerning, non-gimmicky gift ideas for history buffs"
              className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
              Shop Collection URL (Cleaned)
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={meta.collectionUrl || ''}
                onChange={(e) => onUpdateMeta('collectionUrl', e.target.value)}
                onBlur={handleCollectionUrlBlur}
                placeholder="https://shop.scienceofgifts.com/collections/world-war-ii-gifts"
                className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 font-mono text-[11px]"
              />
              {meta.collectionUrl && (
                <a
                  href={meta.collectionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-[#736c61] hover:text-amber-800 bg-[#f5f2ea] rounded-lg border border-[#dcd6ca]"
                  title="Open collection link"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
              Additional Guide Instructions
            </label>
            <textarea
              rows={2}
              value={meta.additionalInstructions || ''}
              onChange={(e) => onUpdateMeta('additionalInstructions', e.target.value)}
              placeholder="e.g. Focus on commemorative significance and physical durability; avoid battle trivialization."
              className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden focus:border-amber-600 resize-none leading-relaxed"
            />
          </div>
        </div>

        {/* SECTION 2: GUIDE-LEVEL FORMATTING SETTINGS */}
        <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447] block border-b border-[#f0ece3] pb-2">
            Editorial Structure & AI Formatting Rules
          </span>

          {/* Section Format Preference */}
          <div>
            <label className="block text-[11px] font-semibold text-[#5c5447] mb-1.5">
              Product Section Format Preference
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                {
                  id: 'standard',
                  title: 'Standard Editorial',
                  desc: 'Heading → Editorial Description → Why It Fits → Best For',
                },
                {
                  id: 'craft_focus',
                  title: 'Craft & Material Focus',
                  desc: 'Heading → Materials & Craft → Editorial Description → Best For',
                },
                {
                  id: 'historical_focus',
                  title: 'Historical Focus',
                  desc: 'Heading → Historical Context → Editorial Description → Buyer Advice',
                },
                {
                  id: 'concise',
                  title: 'Concise & Tight',
                  desc: 'Heading → Crisp Observation & Best For',
                },
              ].map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => handleUpdateSettings('sectionFormat', fmt.id)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    settings.sectionFormat === fmt.id
                      ? 'bg-amber-50/80 border-amber-500 ring-1 ring-amber-500/30 text-[#1e232a]'
                      : 'bg-[#faf9f6] border-[#e5dfd3] hover:bg-white text-[#5c5447]'
                  }`}
                >
                  <strong className="block text-xs text-[#1e232a]">{fmt.title}</strong>
                  <span className="text-[10px] text-[#736c61] leading-tight block mt-0.5">
                    {fmt.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Desired Section Length */}
          <div>
            <label className="block text-[11px] font-semibold text-[#5c5447] mb-1">
              Desired Product Section Word Length
            </label>
            <select
              value={settings.desiredSectionLength}
              onChange={(e) => handleUpdateSettings('desiredSectionLength', e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf9f6] focus:bg-white focus:outline-hidden"
            >
              <option value="90 - 120 words">Short & Crisp (90 - 120 words)</option>
              <option value="120 - 160 words">Standard Editorial (120 - 160 words)</option>
              <option value="160 - 200 words">Deep & Detailed (160 - 200 words)</option>
            </select>
          </div>

          {/* Optional Section Toggles */}
          <div className="space-y-2.5 pt-2 border-t border-[#f0ece3]">
            <span className="text-[11px] font-semibold text-[#5c5447] block">
              Optional Guide Sections
            </span>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.showBestFor}
                onChange={(e) => handleUpdateSettings('showBestFor', e.target.checked)}
                className="w-4 h-4 rounded text-amber-800 focus:ring-amber-500"
              />
              <span className="text-xs text-[#2b251d]">Include "Best For" in product entries</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.showBuyerAdvice}
                onChange={(e) => handleUpdateSettings('showBuyerAdvice', e.target.checked)}
                className="w-4 h-4 rounded text-amber-800 focus:ring-amber-500"
              />
              <span className="text-xs text-[#2b251d]">Include Dedicated "Buyer Advice" Section</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.showFaq}
                onChange={(e) => handleUpdateSettings('showFaq', e.target.checked)}
                className="w-4 h-4 rounded text-amber-800 focus:ring-amber-500"
              />
              <span className="text-xs text-[#2b251d]">Include "Frequently Asked Questions" (FAQ)</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.showConclusion}
                onChange={(e) => handleUpdateSettings('showConclusion', e.target.checked)}
                className="w-4 h-4 rounded text-amber-800 focus:ring-amber-500"
              />
              <span className="text-xs text-[#2b251d]">Include Final Editorial Conclusion</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.numberProducts}
                onChange={(e) => handleUpdateSettings('numberProducts', e.target.checked)}
                className="w-4 h-4 rounded text-amber-800 focus:ring-amber-500"
              />
              <span className="text-xs text-[#2b251d]">Number Product Headings (e.g. "1. Product Name")</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.includeCollectionLink}
                onChange={(e) => handleUpdateSettings('includeCollectionLink', e.target.checked)}
                className="w-4 h-4 rounded text-amber-800 focus:ring-amber-500"
              />
              <span className="text-xs text-[#2b251d]">Integrate Collection Hyperlink in Prose</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
