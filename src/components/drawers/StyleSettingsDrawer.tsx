/**
 * Science of Gifts - Writing Controls Drawer (Requirement #5)
 * Distinct editorial controls that actively modulate future AI output:
 * - Tone of Voice
 * - Detail Depth
 * - Marketing Intensity
 * - Historical Context Depth
 * - Target Audience
 * - Word Count Target Range
 * Does not modify existing writing automatically.
 */

import React from 'react';
import {
  WritingControls,
  ToneSetting,
  DetailSetting,
  MarketingSetting,
  HistoricalSetting,
  AudienceSetting,
} from '../../types/project';
import { storage } from '../../services/storage';
import { ModelId } from '../../types/models';
import { ALL_MODELS, MODEL_REGISTRY, getModelDefinition } from '../../services/modelRegistry';
import { Sliders, X, Sparkles, HelpCircle, Compass, Target, BookOpen, Cpu, Check, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

interface StyleSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: WritingControls;
  onChange: (updatedSettings: WritingControls) => void;
  styleProfileId?: string;
  onStyleProfileChange?: (id: string | undefined) => void;
  modelOverride?: ModelId;
  onModelOverrideChange?: (model: ModelId | undefined) => void;
}

export const StyleSettingsDrawer: React.FC<StyleSettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onChange,
  styleProfileId,
  onStyleProfileChange,
  modelOverride,
  onModelOverrideChange,
}) => {
  const [isSelectingModel, setIsSelectingModel] = React.useState(false);
  if (!isOpen) return null;

  const current: WritingControls = {
    tone: settings.tone || 'editorial',
    detail: settings.detail || 'balanced',
    marketing: settings.marketing || 'minimal',
    historicalContext: settings.historicalContext || 'moderate',
    audience: settings.audience || 'enthusiast',
    wordCountTarget: settings.wordCountTarget || '1,200 - 1,500 words',
  };

  const updateSetting = <K extends keyof WritingControls>(key: K, value: WritingControls[K]) => {
    onChange({
      ...current,
      [key]: value,
    });
  };

  const tones: { id: ToneSetting; label: string; desc: string }[] = [
    { id: 'editorial', label: 'Editorial (Default)', desc: 'Civilized, authoritative, classic essayist voice.' },
    { id: 'conversational', label: 'Conversational', desc: 'Intimate, warm, speaking as a trusted connoisseur friend.' },
    { id: 'informative', label: 'Informative', desc: 'Clear, direct, grounded in practical utility and specs.' },
    { id: 'sophisticated', label: 'Sophisticated', desc: 'Literary, evocative, connoisseur appreciation.' },
    { id: 'witty', label: 'Witty', desc: 'Dry, perceptive humor with understated irony.' },
    { id: 'neutral', label: 'Neutral', desc: 'Impartial, clean, unadorned prose.' },
  ];

  const details: { id: DetailSetting; label: string; desc: string }[] = [
    { id: 'concise', label: 'Concise', desc: 'Economical, crisp, zero unnecessary ornament.' },
    { id: 'balanced', label: 'Balanced', desc: 'Even blend of observation, specs, and rhythm.' },
    { id: 'detailed', label: 'Detailed', desc: 'Exhaustive examination of tactile and craft nuance.' },
  ];

  const marketingLevels: { id: MarketingSetting; label: string; desc: string }[] = [
    { id: 'minimal', label: 'Minimal (House Standard)', desc: 'Zero commercial pushiness; quiet object critique.' },
    { id: 'moderate', label: 'Moderate', desc: 'Subtle buyer encouragement without promotional shouting.' },
    { id: 'strong', label: 'Strong', desc: 'Explicit shopping guidance and persuasive buying cues.' },
  ];

  const historicalLevels: { id: HistoricalSetting; label: string; desc: string }[] = [
    { id: 'none', label: 'None', desc: 'Contemporary focus only.' },
    { id: 'light', label: 'Light', desc: 'Brief nod to provenance or tradition.' },
    { id: 'moderate', label: 'Moderate', desc: 'Contextualizes the object within design history.' },
    { id: 'deep', label: 'Deep', desc: 'Extensive exploration of wartime, trade, or craft lineage.' },
  ];

  const audiences: { id: AudienceSetting; label: string; desc: string }[] = [
    { id: 'general', label: 'General', desc: 'Accessible to all thoughtful gift seekers.' },
    { id: 'enthusiast', label: 'Enthusiast', desc: 'Curious readers who appreciate craft, origins, and materials.' },
    { id: 'expert', label: 'Expert', desc: 'Connoisseurs demanding exact technical and historical fidelity.' },
  ];

  const wordCountPresets = [
    '600 - 800 words',
    '1,000 - 1,200 words',
    '1,200 - 1,500 words',
    '1,800 - 2,200 words',
    '2,500+ words',
  ];

  return (
    <div className="max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full w-full md:w-[440px] lg:w-[480px] shrink-0 h-full bg-[#faf9f6] md:border-l border-[#dcd6ca] flex flex-col overflow-hidden animate-in slide-in-from-right-1 duration-150 z-30">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-[#e5dfd3] bg-[#f5f2ea] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-stone-100 border border-stone-300 flex items-center justify-center text-stone-800 shrink-0">
            <Sliders className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-editorial text-lg font-semibold text-[#1e232a] truncate">Writing Controls</h3>
            <p className="text-xs text-[#736c61] truncate">Directs future AI generation and editing</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#736c61] hover:text-[#2d333b] rounded-lg hover:bg-[#e8e2d5] transition-colors shrink-0"
          title="Close Writing Controls"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 py-2.5 bg-blue-50/70 border-b border-blue-200/60 flex items-start gap-2 text-xs text-blue-900">
        <HelpCircle className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <span>
          These controls influence future AI actions. They do <strong>not</strong> automatically rewrite existing text.
        </span>
      </div>

      {/* Settings Form */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6 text-sm">
        {/* Project AI Model Selector (Phase 9) */}
        {(() => {
          const globalDefaultId = storage.getGlobalModel();
          const activeModelId = modelOverride || globalDefaultId;
          const activeDef = getModelDefinition(activeModelId);
          const globalDef = getModelDefinition(globalDefaultId);
          const isOverridden = Boolean(modelOverride);

          const modelGuidance: Record<ModelId, string> = {
            'gemini-3.8-flash': 'Best for complex editorial writing, major rewrites and review.',
            'gemini-3.7-flash': 'Strong general-purpose editorial model.',
            'gemini-3.6-flash': 'Balanced model for general writing tasks.',
            'gemini-3.5-flash': 'General-purpose model for routine writing.',
            'gemini-3.5-flash-lite': 'Fast model for routine, high-volume tasks.',
            'gemini-3.1-flash-lite': 'Fastest/lightweight model for simple operations.',
          };

          return (
            <div className="p-4 bg-white border border-[#dcd6ca] rounded-xl shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-4 h-4 text-indigo-700" />
                  <label className="text-xs font-bold text-[#1e232a] uppercase tracking-wider">
                    AI Model
                  </label>
                </div>
                {isOverridden ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold">
                    Project Override
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200 font-medium">
                    Using Global Default
                  </span>
                )}
              </div>

              {/* Active Model Display */}
              <div className="flex items-start justify-between gap-3 p-3 bg-[#faf9f6] rounded-lg border border-[#e8e4db]">
                <div className="space-y-1">
                  <div className="font-editorial text-sm font-bold text-[#1e232a] flex items-center gap-1.5">
                    <span>{activeDef.displayName}</span>
                    <span className="text-[10px] font-sans font-normal text-[#736c61]">
                      ({activeDef.tier})
                    </span>
                  </div>
                  <p className="text-[11px] text-[#5c5447] leading-relaxed">
                    {modelGuidance[activeModelId] || activeDef.description}
                  </p>
                  <p className="text-[10px] text-[#8c8477]">
                    {isOverridden
                      ? `Global default is ${globalDef.displayName}`
                      : 'Inherited from Global Settings'}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsSelectingModel(!isSelectingModel)}
                    className="px-2.5 py-1 text-xs font-semibold text-[#1e232a] bg-white hover:bg-[#ede8dc] border border-[#dcd6ca] rounded-md transition-colors shadow-2xs inline-flex items-center gap-1"
                  >
                    <span>{isSelectingModel ? 'Close' : 'Change'}</span>
                    {isSelectingModel ? (
                      <ChevronUp className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                  </button>

                  {isOverridden && onModelOverrideChange && (
                    <button
                      type="button"
                      onClick={() => {
                        onModelOverrideChange(undefined);
                        setIsSelectingModel(false);
                      }}
                      className="text-[10px] text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-0.5 font-medium"
                      title="Reset to global default model"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Use global default</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Expandable Model Selection List */}
              {isSelectingModel && onModelOverrideChange && (
                <div className="pt-2 border-t border-[#ede8dc] space-y-2 animate-in fade-in duration-150">
                  <div className="text-[11px] font-semibold text-[#6e685f]">
                    Select model for this project:
                  </div>
                  <div className="space-y-1.5">
                    {ALL_MODELS.map((m) => {
                      const isSelected = activeModelId === m.id;
                      const isGlobal = globalDefaultId === m.id;
                      return (
                        <div
                          key={m.id}
                          onClick={() => {
                            if (m.id === globalDefaultId) {
                              onModelOverrideChange(undefined);
                            } else {
                              onModelOverrideChange(m.id);
                            }
                            setIsSelectingModel(false);
                          }}
                          className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-indigo-50/60 border-indigo-300 ring-1 ring-indigo-400 shadow-2xs'
                              : 'bg-[#faf8f4] border-[#e8e4db] hover:bg-white hover:border-[#d0c8b8]'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold text-[#1e232a]">
                                {m.displayName}
                              </span>
                              {isGlobal && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-sm bg-stone-200 text-stone-800 font-medium">
                                  Default
                                </span>
                              )}
                            </div>
                            {isSelected && (
                              <span className="text-[10px] font-bold text-indigo-800 flex items-center gap-0.5">
                                <Check className="w-3 h-3 text-indigo-600" /> Active
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[#5c5447] mt-0.5 leading-tight">
                            {modelGuidance[m.id] || m.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Style Profile Selector (Phase 3 Requirement #15 & #17) */}
        {onStyleProfileChange && (
          <div className="p-3.5 bg-amber-50/60 border border-amber-200/70 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-amber-800" />
              <label className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                Writing Style Profile Reference
              </label>
            </div>
            <p className="text-[11px] text-[#6e685f] leading-relaxed">
              Supplies Gemini with reusable rhythm directives extracted from reference prose. Content Rules always take priority.
            </p>
            <select
              value={styleProfileId || ''}
              onChange={(e) => onStyleProfileChange(e.target.value || undefined)}
              className="w-full text-xs font-semibold px-3 py-2 bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] focus:outline-hidden focus:border-amber-600 shadow-2xs cursor-pointer"
            >
              <option value="">None (Standard House Style)</option>
              {storage.getStyleProfiles().map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Tone */}
        <div>
          <label className="block text-xs font-semibold text-[#443d34] uppercase tracking-wider mb-2">
            Tone of Voice
          </label>
          <div className="space-y-1.5">
            {tones.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => updateSetting('tone', t.id)}
                className={`w-full p-2.5 text-left rounded-lg border transition-all ${
                  current.tone === t.id
                    ? 'bg-white border-[#1e232a] shadow-xs ring-1 ring-[#1e232a]'
                    : 'bg-[#faf8f4] border-[#e8e4db] hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1e232a]">{t.label}</span>
                  {current.tone === t.id && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  )}
                </div>
                <p className="text-[11px] text-[#736c61] mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Target Audience */}
        <div className="pt-2 border-t border-[#e8e2d5]">
          <label className="block text-xs font-semibold text-[#443d34] uppercase tracking-wider mb-2">
            Target Audience
          </label>
          <div className="space-y-1.5">
            {audiences.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => updateSetting('audience', a.id)}
                className={`w-full p-2.5 text-left rounded-lg border transition-all ${
                  current.audience === a.id
                    ? 'bg-white border-[#1e232a] shadow-xs ring-1 ring-[#1e232a]'
                    : 'bg-[#faf8f4] border-[#e8e4db] hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1e232a]">{a.label}</span>
                  {current.audience === a.id && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  )}
                </div>
                <p className="text-[11px] text-[#736c61] mt-0.5">{a.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Word Count Target */}
        <div className="pt-2 border-t border-[#e8e2d5]">
          <label className="block text-xs font-semibold text-[#443d34] uppercase tracking-wider mb-1.5">
            Word Count Target / Range
          </label>
          <div className="relative mb-2">
            <input
              type="text"
              value={current.wordCountTarget}
              onChange={(e) => updateSetting('wordCountTarget', e.target.value)}
              placeholder="e.g. 1,200 - 1,500 words"
              className="w-full px-3 py-2 text-xs rounded-lg border border-[#dcd6ca] bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500 text-[#1e232a]"
            />
            <Target className="w-4 h-4 text-[#8c8477] absolute right-2.5 top-2.5" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {wordCountPresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => updateSetting('wordCountTarget', preset)}
                className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${
                  current.wordCountTarget === preset
                    ? 'bg-[#1e232a] text-white border-[#1e232a]'
                    : 'bg-white border-[#e5dfd3] text-[#4a443b] hover:bg-[#ede8dc]'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Detail Depth */}
        <div className="pt-2 border-t border-[#e8e2d5]">
          <label className="block text-xs font-semibold text-[#443d34] uppercase tracking-wider mb-2">
            Detail Depth
          </label>
          <div className="grid grid-cols-3 gap-2">
            {details.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => updateSetting('detail', d.id)}
                className={`p-2 text-center rounded-lg border text-xs font-medium transition-all ${
                  current.detail === d.id
                    ? 'bg-[#1e232a] text-white border-[#1e232a] shadow-xs'
                    : 'bg-[#faf8f4] border-[#e8e4db] text-[#4a443b] hover:bg-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Historical Context */}
        <div className="pt-2 border-t border-[#e8e2d5]">
          <label className="block text-xs font-semibold text-[#443d34] uppercase tracking-wider mb-2">
            Historical Context Depth
          </label>
          <div className="grid grid-cols-2 gap-2">
            {historicalLevels.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => updateSetting('historicalContext', h.id)}
                className={`p-2 text-left rounded-lg border text-xs transition-all ${
                  current.historicalContext === h.id
                    ? 'bg-white border-[#1e232a] ring-1 ring-[#1e232a]'
                    : 'bg-[#faf8f4] border-[#e8e4db] text-[#4a443b] hover:bg-white'
                }`}
              >
                <div className="font-semibold text-[#1e232a]">{h.label}</div>
                <div className="text-[10px] text-[#736c61] mt-0.5">{h.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Marketing Restraint */}
        <div className="pt-2 border-t border-[#e8e2d5]">
          <label className="block text-xs font-semibold text-[#443d34] uppercase tracking-wider mb-2">
            Marketing Intensity
          </label>
          <div className="space-y-1.5">
            {marketingLevels.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => updateSetting('marketing', m.id)}
                className={`w-full p-2.5 text-left rounded-lg border transition-all ${
                  current.marketing === m.id
                    ? 'bg-white border-[#1e232a] ring-1 ring-[#1e232a]'
                    : 'bg-[#faf8f4] border-[#e8e4db] hover:bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#1e232a]">{m.label}</span>
                  {current.marketing === m.id && (
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                  )}
                </div>
                <p className="text-[11px] text-[#736c61] mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
