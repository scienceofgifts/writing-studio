/**
 * Science of Gifts - Sample Modal
 * Modal for creating and editing writing samples without markdown.
 */

import React, { useState } from 'react';
import { WritingSample } from '../../types/styleReference';
import { X, FileText, Compass, AlertCircle } from 'lucide-react';

interface SampleModalProps {
  sample?: WritingSample | null;
  onSave: (sample: WritingSample) => void;
  onClose: () => void;
}

export const SampleModal: React.FC<SampleModalProps> = ({ sample, onSave, onClose }) => {
  const [title, setTitle] = useState(sample?.title || '');
  const [sourceDescription, setSourceDescription] = useState(sample?.sourceDescription || '');
  const [content, setContent] = useState(sample?.content || '');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a descriptive title for this writing sample.');
      return;
    }
    if (!content.trim()) {
      setError('Please provide the prose content for this writing sample.');
      return;
    }

    const saved: WritingSample = {
      id: sample?.id || `samp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim(),
      sourceDescription: sourceDescription.trim() || undefined,
      content: content.trim(),
      createdAt: sample?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(saved);
  };

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 bg-[#1e232a]/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[#faf9f6] border border-[#dcd6ca] rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4.5 bg-[#f5f2ea] border-b border-[#e5dfd3] flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-900 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-editorial text-lg font-bold text-[#1e232a] truncate">
                {sample ? 'Edit Writing Sample' : 'Add Reference Writing Sample'}
              </h2>
              <p className="text-xs text-[#736c61] truncate">
                High-quality reference prose to analyze for style characteristics
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-[#736c61] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7] transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-4.5 text-sm">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Sample Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447] mb-1.5">
              Sample Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError('');
              }}
              placeholder="e.g. The Case for Mechanical Objects"
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 shadow-2xs"
            />
          </div>

          {/* Source / Publication Context */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447] mb-1.5">
              Source / Context (Optional)
            </label>
            <input
              type="text"
              value={sourceDescription}
              onChange={(e) => setSourceDescription(e.target.value)}
              placeholder="e.g. Science of Gifts Issue IV, Essay on Tactile Permanence"
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 shadow-2xs"
            />
          </div>

          {/* Prose Content */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447]">
                Reference Prose Content *
              </label>
              <span className="text-[11px] text-[#736c61]">
                {wordCount} words
              </span>
            </div>
            <textarea
              rows={10}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (error) setError('');
              }}
              placeholder="Paste or type normal editorial prose here (100–1,000 words recommended). Do not use Markdown syntax..."
              className="w-full px-3.5 py-2.5 font-editorial text-sm leading-relaxed bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 shadow-2xs resize-y"
            />
            <p className="text-[11px] text-[#736c61] mt-1">
              Provide authentic editorial prose. The AI will analyze how this is written (rhythm, sentence structure, specificity) without copying the actual sentences.
            </p>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[#e5dfd3] flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 min-h-[38px] text-xs font-semibold text-[#5c5447] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 min-h-[38px] text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg transition-colors shadow-xs"
            >
              {sample ? 'Update Sample' : 'Save Sample'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
