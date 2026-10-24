/**
 * Science of Gifts - Content Rules Drawer (Requirement #6)
 * Separate section for hard constraints (distinguished from softer Writing Controls).
 * Allows rules to be: Added, Edited, Removed, and Toggled.
 */

import React, { useState } from 'react';
import { ContentRule } from '../../types/project';
import {
  Scale,
  X,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  AlertCircle,
  Edit2,
  Check,
} from 'lucide-react';

interface ContentRulesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  rules: ContentRule[];
  onChange: (updatedRules: ContentRule[]) => void;
}

export const ContentRulesDrawer: React.FC<ContentRulesDrawerProps> = ({
  isOpen,
  onClose,
  rules = [],
  onChange,
}) => {
  const [newRuleText, setNewRuleText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  if (!isOpen) return null;

  const handleToggle = (id: string) => {
    onChange(
      rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  };

  const handleAddRule = (textToAdd?: string) => {
    const text = (textToAdd || newRuleText).trim();
    if (!text) return;

    // Check duplicate
    if (rules.some((r) => r.rule.toLowerCase() === text.toLowerCase())) {
      setNewRuleText('');
      return;
    }

    const newRule: ContentRule = {
      id: `rule-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      rule: text,
      enabled: true,
      isCustom: true,
    };
    onChange([...rules, newRule]);
    setNewRuleText('');
  };

  const handleDeleteRule = (id: string) => {
    onChange(rules.filter((r) => r.id !== id));
  };

  const handleStartEdit = (rule: ContentRule) => {
    setEditingId(rule.id);
    setEditingText(rule.rule);
  };

  const handleSaveEdit = (id: string) => {
    if (!editingText.trim()) return;
    onChange(
      rules.map((r) => (r.id === id ? { ...r, rule: editingText.trim() } : r))
    );
    setEditingId(null);
    setEditingText('');
  };

  const examplePresets = [
    'Do not use em dashes',
    'Use British spelling',
    'Do not mention prices',
    'Do not use bullet points',
    'Do not use bold in body copy',
    'Do not invent product specifications',
    'Avoid marketing clichés',
    'Keep historical claims accurate',
    'Do not repeat the same phrase',
    'Maximum 1,500 words',
  ];

  return (
    <div className="max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full w-full md:w-[440px] lg:w-[480px] shrink-0 h-full bg-[#faf9f6] md:border-l border-[#dcd6ca] flex flex-col overflow-hidden animate-in slide-in-from-right-1 duration-150 z-30">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-[#e5dfd3] bg-[#f5f2ea] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-stone-100 border border-stone-300 flex items-center justify-center text-stone-800 shrink-0">
            <Scale className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-editorial text-lg font-semibold text-[#1e232a] truncate">Content Rules</h3>
            <p className="text-xs text-[#736c61] truncate">Hard constraints strictly enforced by AI</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#736c61] hover:text-[#2d333b] rounded-lg hover:bg-[#e8e2d5] transition-colors shrink-0"
          title="Close Content Rules"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Info notice */}
      <div className="px-5 py-2.5 bg-amber-50/70 border-b border-amber-200/60 flex items-start gap-2 text-xs text-amber-900">
        <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <span>
          <strong>Inviolable Guardrails:</strong> Part of the House Constitution layer. The AI treats these as mandatory negative constraints with highest editorial authority.
        </span>
      </div>

      {/* Rule List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
        <div className="flex items-center justify-between text-xs text-[#6e685f] mb-1 font-medium">
          <span>Active Rules ({rules.filter((r) => r.enabled).length}/{rules.length})</span>
          <span className="text-[11px]">Click checkbox to toggle</span>
        </div>

        {rules.map((item) => (
          <div
            key={item.id}
            className={`p-3 rounded-lg border transition-all flex items-start justify-between gap-3 ${
              item.enabled
                ? 'bg-white border-[#dcd6ca] shadow-2xs'
                : 'bg-[#f4f1ea] border-[#e8e4db] opacity-60'
            }`}
          >
            <div className="flex items-start gap-2.5 flex-1">
              <button
                type="button"
                onClick={() => handleToggle(item.id)}
                className="mt-0.5 text-[#1e232a] focus:outline-hidden"
                title={item.enabled ? 'Disable rule' : 'Enable rule'}
              >
                {item.enabled ? (
                  <CheckSquare className="w-4 h-4 text-amber-700 shrink-0" />
                ) : (
                  <Square className="w-4 h-4 text-[#8c8477] shrink-0" />
                )}
              </button>

              {editingId === item.id ? (
                <div className="flex-1 flex items-center gap-1.5">
                  <input
                    type="text"
                    value={editingText}
                    autoFocus
                    onChange={(e) => setEditingText(e.target.value)}
                    className="flex-1 px-2 py-1 text-xs rounded-md border border-amber-400 focus:outline-hidden bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(item.id)}
                    className="p-1 bg-[#1e232a] text-white rounded-md text-xs"
                    title="Save rule"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="p-1 text-[#736c61] hover:text-[#1e232a] text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span
                  onClick={() => handleToggle(item.id)}
                  className={`text-xs cursor-pointer select-none leading-relaxed ${
                    item.enabled ? 'text-[#1e232a] font-medium' : 'text-[#736c61] line-through'
                  }`}
                >
                  {item.rule}
                </span>
              )}
            </div>

            {editingId !== item.id && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleStartEdit(item)}
                  className="p-1 text-[#8c8477] hover:text-[#1e232a] transition-colors rounded-sm hover:bg-[#f4f1ea]"
                  title="Edit rule"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteRule(item.id)}
                  className="p-1 text-[#8c8477] hover:text-rose-600 transition-colors rounded-sm hover:bg-rose-50"
                  title="Remove rule"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Add custom rule form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddRule();
          }}
          className="pt-4 border-t border-[#e8e2d5] space-y-2"
        >
          <label className="block text-xs font-semibold text-[#443d34] uppercase tracking-wider">
            Add New Rule
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRuleText}
              onChange={(e) => setNewRuleText(e.target.value)}
              placeholder="e.g. Do not use bullet points in body copy"
              className="flex-1 px-3 py-2 text-xs rounded-lg border border-[#dcd6ca] bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500"
            />
            <button
              type="submit"
              disabled={!newRuleText.trim()}
              className="px-3.5 py-2 bg-[#1e232a] text-white text-xs font-semibold rounded-lg hover:bg-[#2d3744] disabled:opacity-30 transition-colors inline-flex items-center gap-1 shadow-2xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </form>

        {/* Quick presets */}
        <div className="pt-3 border-t border-[#e8e2d5]">
          <span className="block text-[11px] font-semibold text-[#736c61] uppercase tracking-wider mb-2">
            Suggested Constraints
          </span>
          <div className="flex flex-wrap gap-1.5">
            {examplePresets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleAddRule(preset)}
                className="px-2 py-1 text-[11px] bg-white border border-[#ded8cc] text-[#4a443b] hover:bg-[#ede8dc] hover:text-[#1e232a] rounded-md transition-colors inline-flex items-center gap-1 shadow-2xs"
              >
                <Plus className="w-3 h-3 text-amber-700" />
                <span>{preset}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
