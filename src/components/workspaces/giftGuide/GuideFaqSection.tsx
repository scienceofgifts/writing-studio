/**
 * Science of Gifts - Guide FAQ Section Manager (Phase 5)
 * Structured FAQ questions and answers with reordering, manual editing, and AI answer generation.
 */

import React, { useState } from 'react';
import { GuideFAQItem } from '../../../types/giftGuide';
import {
  HelpCircle,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react';

interface GuideFaqSectionProps {
  faqList: GuideFAQItem[];
  onChange: (updated: GuideFAQItem[]) => void;
  onGenerateFaq: () => void;
  onInsertIntoDraft: (html: string) => void;
}

export const GuideFaqSection: React.FC<GuideFaqSectionProps> = ({
  faqList,
  onChange,
  onGenerateFaq,
  onInsertIntoDraft,
}) => {
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [isAddingOpen, setIsAddingOpen] = useState(false);

  const handleAddFaq = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim()) return;
    const newItem: GuideFAQItem = {
      id: `faq-${Date.now()}`,
      question: newQuestion.trim(),
      answer: newAnswer.trim(),
    };
    onChange([...faqList, newItem]);
    setNewQuestion('');
    setNewAnswer('');
    setIsAddingOpen(false);
  };

  const handleUpdateItem = (id: string, updates: Partial<GuideFAQItem>) => {
    const updated = faqList.map((item) => (item.id === id ? { ...item, ...updates } : item));
    onChange(updated);
  };

  const handleDeleteItem = (id: string) => {
    onChange(faqList.filter((item) => item.id !== id));
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= faqList.length) return;
    const nextList = [...faqList];
    const temp = nextList[index];
    nextList[index] = nextList[targetIdx];
    nextList[targetIdx] = temp;
    onChange(nextList);
  };

  const handleInsertFaqToDraft = () => {
    if (faqList.length === 0) return;
    const faqHtml = `<h2>Frequently Asked Questions</h2>${faqList
      .map(
        (item) =>
          `<p><strong>Q: ${item.question}</strong><br/>${item.answer || 'Answer pending...'}</p>`
      )
      .join('\n')}`;
    onInsertIntoDraft(faqHtml);
  };

  return (
    <div className="p-4 bg-white border border-[#e5dfd3] rounded-xl shadow-2xs space-y-4 text-xs">
      <div className="flex items-center justify-between border-b border-[#f0ece3] pb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-800 flex items-center justify-center font-bold">
            <HelpCircle className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="font-editorial text-sm font-bold text-[#1e232a]">
              Frequently Asked Questions ({faqList.length})
            </h4>
            <p className="text-[11px] text-[#736c61]">
              Grounded, non-spam FAQs answering genuine recipient and buyer questions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGenerateFaq}
            className="px-2.5 py-1.5 text-xs font-semibold text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300/80 rounded-lg transition-colors inline-flex items-center gap-1 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Generate FAQs</span>
          </button>

          {faqList.length > 0 && (
            <button
              type="button"
              onClick={handleInsertFaqToDraft}
              className="px-2.5 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors inline-flex items-center gap-1 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Insert into Draft</span>
            </button>
          )}
        </div>
      </div>

      {/* FAQ List */}
      <div className="space-y-3">
        {faqList.map((item, idx) => (
          <div
            key={item.id}
            className="p-3 bg-[#faf9f6] border border-[#e8e2d5] rounded-lg space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="w-5 h-5 rounded-full bg-[#ede7dc] text-[#5c5447] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <div className="flex-1 space-y-1.5">
                <input
                  type="text"
                  value={item.question}
                  onChange={(e) => handleUpdateItem(item.id, { question: e.target.value })}
                  placeholder="Question..."
                  className="w-full px-2 py-1 font-semibold text-[#1e232a] bg-white border border-[#dcd6ca] rounded-md focus:outline-hidden focus:border-amber-600"
                />
                <textarea
                  rows={2}
                  value={item.answer}
                  onChange={(e) => handleUpdateItem(item.id, { answer: e.target.value })}
                  placeholder="Answer..."
                  className="w-full px-2 py-1 text-[11px] text-[#423d33] bg-white border border-[#dcd6ca] rounded-md focus:outline-hidden focus:border-amber-600 resize-none leading-relaxed"
                />
              </div>

              {/* Controls */}
              <div className="flex flex-col gap-1 shrink-0">
                <div className="flex items-center border border-[#e5dfd3] rounded bg-white overflow-hidden">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMove(idx, 'up')}
                    className="p-1 text-[#736c61] hover:text-[#1e232a] disabled:opacity-30"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === faqList.length - 1}
                    onClick={() => handleMove(idx, 'down')}
                    className="p-1 text-[#736c61] hover:text-[#1e232a] disabled:opacity-30 border-l border-[#e5dfd3]"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteItem(item.id)}
                  className="p-1 text-rose-700 hover:text-rose-900 rounded hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Add New Question Form */}
        {isAddingOpen ? (
          <form
            onSubmit={handleAddFaq}
            className="p-3 bg-white border-2 border-dashed border-[#dcd6ca] rounded-lg space-y-2 animate-in fade-in"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5c5447]">
              New FAQ Item
            </span>
            <input
              type="text"
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="e.g. How should archival prints be framed?"
              className="w-full px-2.5 py-1.5 rounded-md border border-[#dcd6ca] focus:outline-hidden focus:border-amber-600"
              autoFocus
            />
            <textarea
              rows={2}
              value={newAnswer}
              onChange={(e) => setNewAnswer(e.target.value)}
              placeholder="Authoritative answer..."
              className="w-full px-2.5 py-1.5 rounded-md border border-[#dcd6ca] focus:outline-hidden focus:border-amber-600 resize-none text-[11px]"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsAddingOpen(false)}
                className="px-2.5 py-1 text-xs text-[#736c61] hover:text-[#1e232a]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newQuestion.trim()}
                className="px-3 py-1 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3440] rounded-md disabled:opacity-40"
              >
                Save FAQ
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setIsAddingOpen(true)}
            className="w-full py-2 border border-dashed border-[#dcd6ca] hover:border-amber-500 rounded-lg text-xs font-semibold text-[#5c5447] hover:text-[#1e232a] hover:bg-[#faf9f6] transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add FAQ Question</span>
          </button>
        )}
      </div>
    </div>
  );
};
