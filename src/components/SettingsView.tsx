/**
 * Science of Gifts - Settings View (Requirement #12 & Phase 10)
 * Global Writing Instructions, AI Model Management, Appearance, and Keyboard Shortcuts.
 */

import React, { useState } from 'react';
import { GlobalInstruction } from '../types/project';
import { storage, DEFAULT_GLOBAL_INSTRUCTIONS } from '../services/storage';
import { ThemeId, THEMES_REGISTRY, applyTheme } from '../theme/tokens';
import { ModelId } from '../types/models';
import { ALL_MODELS, MODEL_REGISTRY, getModelDefinition } from '../services/modelRegistry';
import {
  Sliders,
  ShieldAlert,
  CheckCircle2,
  Plus,
  Trash2,
  RotateCcw,
  BookOpen,
  Sparkles,
  HelpCircle,
  Palette,
  Bot,
  Cpu,
  Check,
  Keyboard,
  Command,
  Database,
} from 'lucide-react';
import { ConfirmationModal } from './ConfirmationModal';

interface SettingsViewProps {
  onBackToStudio: () => void;
  onNavigateToBackup?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onBackToStudio, onNavigateToBackup }) => {
  const [instructions, setInstructions] = useState<GlobalInstruction[]>(() =>
    storage.getGlobalInstructions()
  );
  const [activeTheme, setActiveTheme] = useState<ThemeId>(() => storage.getTheme());
  const [globalModel, setGlobalModel] = useState<ModelId>(() => storage.getGlobalModel());
  const [newText, setNewText] = useState('');
  const [newCategory, setNewCategory] = useState<GlobalInstruction['category']>('style');
  const [isSavedNotice, setIsSavedNotice] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  const handleSelectGlobalModel = (modelId: ModelId) => {
    setGlobalModel(modelId);
    storage.setGlobalModel(modelId);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  const handleSelectTheme = (themeId: ThemeId) => {
    setActiveTheme(themeId);
    storage.setTheme(themeId);
    applyTheme(themeId);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  const saveUpdated = (updated: GlobalInstruction[]) => {
    setInstructions(updated);
    storage.saveGlobalInstructions(updated);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  const handleToggle = (id: string) => {
    const updated = instructions.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i));
    saveUpdated(updated);
  };

  const handleAddInstruction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    const newItem: GlobalInstruction = {
      id: `gi-${Date.now()}`,
      text: newText.trim(),
      category: newCategory,
      enabled: true,
    };
    saveUpdated([...instructions, newItem]);
    setNewText('');
  };

  const handleDelete = (id: string) => {
    storage.deleteGlobalInstruction(id);
    setInstructions(storage.getGlobalInstructions());
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  const handleResetDefaults = () => {
    const reset = storage.resetGlobalInstructions();
    setInstructions(reset);
    setShowResetModal(false);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 2000);
  };

  const getCategoryBadge = (category: GlobalInstruction['category']) => {
    switch (category) {
      case 'voice':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">Voice & Tone</span>;
      case 'constraint':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-50 text-rose-900 border border-rose-200">Hard Constraint</span>;
      case 'factuality':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-900 border border-blue-200">Factual Integrity</span>;
      case 'style':
        return <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-stone-100 text-stone-800 border border-stone-200">Style Rhythm</span>;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 md:p-10 max-w-4xl mx-auto w-full space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="border-b border-[#e5dfd3] pb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="font-editorial text-2xl md:text-3xl font-bold text-[#1e232a]">
            Studio Settings & House Constitution
          </h1>
          <p className="text-xs md:text-sm text-[#6e685f] mt-1.5 leading-relaxed max-w-2xl">
            Configure default intelligence models, global writing guidelines, visual themes, and productivity shortcuts.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isSavedNotice && (
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 font-medium animate-in fade-in">
              Changes Saved
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="px-3 py-1.5 text-xs text-[#736c61] hover:text-[#1e232a] bg-white border border-[#dcd6ca] rounded-lg hover:bg-[#ede8dc] transition-colors inline-flex items-center gap-1.5 shadow-2xs min-h-[36px]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Rules to Defaults</span>
          </button>
        </div>
      </div>

      {/* Philosophy Callout */}
      <div className="p-4 bg-[#f6f3eb] border border-[#e5dfd3] rounded-xl flex items-start gap-3.5 text-xs text-[#443d34]">
        <BookOpen className="w-5 h-5 text-amber-800 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-semibold text-[#1e232a]">Science of Gifts Editorial Philosophy</h4>
          <p className="mt-1 leading-relaxed text-[#5c5447]">
            Human, specific, editorial, conversational, knowledgeable, and occasionally witty. Free from generic AI filler, forbidden from using em dashes, and strictly bound to raw factual notes.
          </p>
        </div>
      </div>

      {/* Data & Backup Quick Center */}
      <div className="p-4 sm:p-5 bg-white border border-[#e5dfd3] rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200 shrink-0">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-editorial text-base font-bold text-[#1e232a] flex items-center gap-2">
              <span>Data Persistence, Portable Backups & Snapshots</span>
              <span className="text-[10px] font-sans px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold uppercase">
                IndexedDB Active
              </span>
            </h3>
            <p className="text-xs text-[#736c61] mt-0.5 leading-relaxed">
              Export self-contained ZIP packages, restore with conflict resolution, and manage automatic local safety snapshots.
            </p>
          </div>
        </div>
        {onNavigateToBackup && (
          <button
            type="button"
            onClick={onNavigateToBackup}
            className="px-4 py-2 text-xs bg-[#1e232a] text-[#faf9f6] hover:bg-[#2d3744] rounded-xl font-semibold transition-colors shrink-0 shadow-2xs inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
          >
            <span>Open Data & Backup</span>
            <span>&rarr;</span>
          </button>
        )}
      </div>

      {/* Section 1: AI & Model Management */}
      <div className="p-4 sm:p-6 bg-white border border-[#e5dfd3] rounded-2xl shadow-xs space-y-5">
        <div className="border-b border-[#e5dfd3] pb-3 flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-lg font-bold text-[#1e232a] flex items-center gap-2">
              <Cpu className="w-4 h-4 text-indigo-800" />
              <span>AI & Model Architecture</span>
            </h2>
            <p className="text-xs text-[#736c61]">
              Central model registry and default Gemini intelligence configuration
            </p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold">
            Central Model Registry
          </span>
        </div>

        {/* Default AI Model Selector */}
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#5c5447]">
              Default AI Model
            </label>
            <p className="text-xs text-[#736c61] leading-relaxed">
              Default model used for new AI actions unless a project or individual action specifies another model.
            </p>
          </div>

          <div className="max-w-md">
            <select
              value={globalModel}
              onChange={(e) => handleSelectGlobalModel(e.target.value as ModelId)}
              className="w-full text-xs font-semibold px-3.5 py-2.5 bg-[#faf9f6] border border-[#dcd6ca] rounded-xl text-[#1e232a] focus:outline-hidden focus:border-[#1e232a] focus:bg-white shadow-2xs cursor-pointer"
            >
              {ALL_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.displayName} ({model.tier}) - {model.tagline}
                </option>
              ))}
            </select>
          </div>

          {/* Active Model Summary Card */}
          {(() => {
            const def = getModelDefinition(globalModel);
            return (
              <div className="p-4 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-editorial text-sm font-bold text-[#1e232a]">
                      {def.displayName}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-200 text-stone-800 font-medium">
                      {def.tier}
                    </span>
                  </div>
                  <span className="text-[11px] text-emerald-800 font-medium flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" /> Active Global Default
                  </span>
                </div>
                <p className="text-[#5c5447] text-[11px] leading-relaxed">
                  {def.description}
                </p>
                <div className="pt-2 border-t border-[#ede8dc] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#736c61]">
                  <span><strong>Speed:</strong> {def.capabilities.speedRating}</span>
                  <span><strong>Context:</strong> {(def.capabilities.contextWindowTokens / 1024).toLocaleString()}k tokens</span>
                  <span><strong>Best for:</strong> {def.recommendedUseNotes}</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Section 2: Global Writing Rules */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-[#6e685f] uppercase tracking-wider px-1">
          <span>Active House Rules ({instructions.filter((i) => i.enabled).length} of {instructions.length} Active)</span>
        </div>

        <div className="space-y-2.5">
          {instructions.map((item) => (
            <div
              key={item.id}
              className={`p-4 rounded-xl border transition-all flex items-start justify-between gap-4 ${
                item.enabled
                  ? 'bg-white border-[#dcd6ca] shadow-2xs'
                  : 'bg-[#f4f1ea] border-[#e5dfd3] opacity-60'
              }`}
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    onChange={() => handleToggle(item.id)}
                    className="w-4 h-4 rounded-sm text-amber-800 focus:ring-amber-500 cursor-pointer"
                  />
                  {getCategoryBadge(item.category)}
                </div>
                <p className={`text-xs leading-relaxed pl-6 ${item.enabled ? 'text-[#1e232a]' : 'text-[#736c61] line-through'}`}>
                  {item.text}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                className="text-[#8c8477] hover:text-rose-600 p-1 rounded-md hover:bg-rose-50 transition-colors"
                title="Delete rule"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add Custom Instruction Form */}
      <div className="p-5 bg-white border border-[#e5dfd3] rounded-xl shadow-xs space-y-3">
        <h3 className="font-editorial text-base font-bold text-[#1e232a]">
          Add Global House Instruction
        </h3>
        <form onSubmit={handleAddInstruction} className="space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as any)}
              className="text-xs px-3 py-2 rounded-lg border border-[#dcd6ca] bg-[#faf8f4] text-[#2d333b] focus:outline-hidden"
            >
              <option value="style">Style Rhythm</option>
              <option value="voice">Voice & Tone</option>
              <option value="constraint">Hard Constraint</option>
              <option value="factuality">Factual Integrity</option>
            </select>

            <input
              type="text"
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="e.g. Prefer short, punchy paragraphs; avoid repeating the word 'aesthetic'..."
              className="flex-1 text-xs px-3 py-2 rounded-lg border border-[#dcd6ca] bg-[#faf8f4] focus:outline-hidden focus:bg-white text-[#1e232a]"
            />

            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2e3743] rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Instruction
            </button>
          </div>
        </form>
      </div>

      {/* Section 3: Appearance & Themes */}
      <div className="p-4 sm:p-6 bg-white border border-[#e5dfd3] rounded-2xl shadow-xs space-y-5">
        <div className="border-b border-[#e5dfd3] pb-3 flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-lg font-bold text-[#1e232a] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-800" />
              <span>Appearance & Design Tokens</span>
            </h2>
            <p className="text-xs text-[#736c61]">
              Centralized visual identity and typography role management
            </p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold">
            Token System
          </span>
        </div>

        {/* Theme Selector */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-bold uppercase tracking-wider text-[#5c5447]">
              Active Visual Theme
            </label>
            <span className="text-[11px] text-[#736c61]">
              Controlled through centralized CSS variables
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.values(THEMES_REGISTRY).map((theme) => {
              const isActive = activeTheme === theme.id;
              return (
                <div
                  key={theme.id}
                  onClick={() => handleSelectTheme(theme.id)}
                  className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between space-y-2.5 ${
                    isActive
                      ? 'bg-white border-[#1e232a] shadow-sm ring-1 ring-[#1e232a]'
                      : 'bg-[#faf9f6] border-[#e5dfd3] hover:bg-white hover:border-[#cfc6b6]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-editorial text-sm font-bold text-[#1e232a]">
                        {theme.name}
                      </span>
                      {isActive && (
                        <span className="text-[9px] px-2 py-0.5 rounded-md bg-[#1e232a] text-white font-bold uppercase tracking-wider">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#736c61] leading-relaxed">
                      {theme.description}
                    </p>
                  </div>

                  {/* Swatches preview */}
                  <div className="flex items-center gap-1.5 pt-1 border-t border-[#ede7db]">
                    <span
                      className="w-4 h-4 rounded-full border border-black/10 shadow-2xs"
                      style={{ backgroundColor: theme.colors.appBackground }}
                      title={`App Background: ${theme.colors.appBackground}`}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-black/10 shadow-2xs"
                      style={{ backgroundColor: theme.colors.surfaceSecondary }}
                      title={`Surface: ${theme.colors.surfaceSecondary}`}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-black/10 shadow-2xs"
                      style={{ backgroundColor: theme.colors.border }}
                      title={`Border: ${theme.colors.border}`}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-black/10 shadow-2xs"
                      style={{ backgroundColor: theme.colors.textPrimary }}
                      title={`Text: ${theme.colors.textPrimary}`}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-black/10 shadow-2xs"
                      style={{ backgroundColor: theme.colors.accentPrimary }}
                      title={`Accent: ${theme.colors.accentPrimary}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 4: Keyboard Shortcuts Reference (Part D) */}
      <div className="p-4 sm:p-6 bg-white border border-[#e5dfd3] rounded-2xl shadow-xs space-y-5">
        <div className="border-b border-[#e5dfd3] pb-3 flex items-center justify-between">
          <div>
            <h2 className="font-editorial text-lg font-bold text-[#1e232a] flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-amber-800" />
              <span>Keyboard Shortcuts</span>
            </h2>
            <p className="text-xs text-[#736c61]">
              Fast editorial navigation and writing shortcuts
            </p>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 border border-stone-200 font-bold">
            Command Center
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl flex items-center justify-between">
            <span className="text-[#5c5447]">Save Document immediately</span>
            <kbd className="px-2 py-1 bg-white border border-[#dcd6ca] rounded-md font-mono text-[11px] font-semibold text-[#1e232a] shadow-2xs">
              Ctrl / ⌘ + S
            </kbd>
          </div>

          <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl flex items-center justify-between">
            <span className="text-[#5c5447]">Find in Document</span>
            <kbd className="px-2 py-1 bg-white border border-[#dcd6ca] rounded-md font-mono text-[11px] font-semibold text-[#1e232a] shadow-2xs">
              Ctrl / ⌘ + F
            </kbd>
          </div>

          <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl flex items-center justify-between">
            <span className="text-[#5c5447]">Insert / Edit Link</span>
            <kbd className="px-2 py-1 bg-white border border-[#dcd6ca] rounded-md font-mono text-[11px] font-semibold text-[#1e232a] shadow-2xs">
              Ctrl / ⌘ + K
            </kbd>
          </div>

          <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl flex items-center justify-between">
            <span className="text-[#5c5447]">Close active Panel / Search / Modal</span>
            <kbd className="px-2 py-1 bg-white border border-[#dcd6ca] rounded-md font-mono text-[11px] font-semibold text-[#1e232a] shadow-2xs">
              Escape
            </kbd>
          </div>

          <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl flex items-center justify-between">
            <span className="text-[#5c5447]">Undo formatting / typing</span>
            <kbd className="px-2 py-1 bg-white border border-[#dcd6ca] rounded-md font-mono text-[11px] font-semibold text-[#1e232a] shadow-2xs">
              Ctrl / ⌘ + Z
            </kbd>
          </div>

          <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl flex items-center justify-between">
            <span className="text-[#5c5447]">Redo change</span>
            <kbd className="px-2 py-1 bg-white border border-[#dcd6ca] rounded-md font-mono text-[11px] font-semibold text-[#1e232a] shadow-2xs">
              Ctrl / ⌘ + Shift + Z
            </kbd>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <ConfirmationModal
          isOpen={true}
          title="Reset Global Instructions?"
          message="This will restore the Science of Gifts default house rules, replacing any custom modifications you have made."
          confirmLabel="Reset Rules"
          cancelLabel="Cancel"
          isDestructive={false}
          onConfirm={handleResetDefaults}
          onCancel={() => setShowResetModal(false)}
        />
      )}
    </div>
  );
};
