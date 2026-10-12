/**
 * Science of Gifts - Internal Link Modal (Phase 4)
 * Modal for adding and editing reusable Science of Gifts internal link records.
 * Enforces clean URLs (no tracking parameters), validation, and category management.
 */

import React, { useState } from 'react';
import { InternalLink } from '../../types/internalLink';
import {
  isValidUrl,
  hasTrackingParameters,
  cleanTrackingParameters,
} from '../../utils/urlUtils';
import {
  X,
  Link2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Plus,
  Compass,
} from 'lucide-react';

interface LinkModalProps {
  link?: InternalLink | null;
  categories: string[];
  onSave: (link: InternalLink) => void;
  onAddCategory: (category: string) => void;
  onClose: () => void;
}

export const LinkModal: React.FC<LinkModalProps> = ({
  link,
  categories,
  onSave,
  onAddCategory,
  onClose,
}) => {
  const [title, setTitle] = useState(link?.title || '');
  const [url, setUrl] = useState(link?.url || '');
  const [topic, setTopic] = useState(link?.topic || '');
  const [description, setDescription] = useState(link?.description || '');
  const [preferredAnchor, setPreferredAnchor] = useState(link?.preferredAnchor || '');
  const [notes, setNotes] = useState(link?.notes || '');
  const [category, setCategory] = useState(link?.category || categories[0] || 'General');
  const [active, setActive] = useState(link?.active !== undefined ? link.active : true);

  // Inline category creation
  const [isAddingNewCat, setIsAddingNewCat] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');

  const [error, setError] = useState('');

  const isTracking = hasTrackingParameters(url);

  const handleCleanUrl = () => {
    setUrl(cleanTrackingParameters(url));
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatInput.trim()) return;
    const trimmed = newCatInput.trim();
    onAddCategory(trimmed);
    setCategory(trimmed);
    setNewCatInput('');
    setIsAddingNewCat(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Please provide an article title.');
      return;
    }

    if (!url.trim()) {
      setError('Please provide the destination URL.');
      return;
    }

    let finalUrl = url.trim();
    // Prepend https:// if protocol is missing
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    if (!isValidUrl(finalUrl)) {
      setError('Please provide a valid HTTP or HTTPS URL.');
      return;
    }

    // Clean tracking parameters automatically on save
    finalUrl = cleanTrackingParameters(finalUrl);

    if (!topic.trim()) {
      setError('Please specify the topic or subject domain of this article.');
      return;
    }

    if (!description.trim()) {
      setError('Please provide a short description of what this article covers.');
      return;
    }

    const savedLink: InternalLink = {
      id: link?.id || `link-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: title.trim(),
      url: finalUrl,
      topic: topic.trim(),
      description: description.trim(),
      preferredAnchor: preferredAnchor.trim() || undefined,
      notes: notes.trim() || undefined,
      category: category || 'General',
      active,
      createdAt: link?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(savedLink);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1e232a]/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-[#faf9f6] border border-[#dcd6ca] rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#f5f2ea] border-b border-[#e5dfd3] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-900 shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-editorial text-lg font-bold text-[#1e232a] truncate">
                {link ? 'Edit Internal Link' : 'Add Internal Link Record'}
              </h2>
              <p className="text-xs text-[#736c61] truncate">
                Science of Gifts publication record for contextual AI linking
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-sm">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447] mb-1">
              Article Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Why People Prefer Gifts They Can Display"
              className="w-full px-3 py-2 text-sm bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 shadow-2xs"
            />
          </div>

          {/* URL & Clean URL Warning */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447]">
                Destination URL *
              </label>
              {isTracking && (
                <button
                  type="button"
                  onClick={handleCleanUrl}
                  className="text-xs font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-amber-700" />
                  <span>Clean Tracking Params</span>
                </button>
              )}
            </div>

            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.scienceofgifts.com/article-slug/"
              className="w-full px-3 py-2 text-sm font-mono text-xs bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 shadow-2xs"
            />

            {isTracking && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[11px] flex items-center justify-between">
                <span>URL contains tracking parameters (utm_*, ref, etc.). Clean before saving for pristine publication.</span>
                <button
                  type="button"
                  onClick={handleCleanUrl}
                  className="px-2 py-0.5 bg-amber-800 text-white rounded text-[10px] font-bold"
                >
                  Clean Now
                </button>
              </div>
            )}
          </div>

          {/* Category & Topic Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447]">
                  Category *
                </label>
                {!isAddingNewCat && (
                  <button
                    type="button"
                    onClick={() => setIsAddingNewCat(true)}
                    className="text-[11px] text-amber-800 hover:underline inline-flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New Category</span>
                  </button>
                )}
              </div>

              {isAddingNewCat ? (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newCatInput}
                    onChange={(e) => setNewCatInput(e.target.value)}
                    placeholder="Category name..."
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-[#dcd6ca] rounded-md text-[#1e232a]"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    className="px-2.5 py-1.5 bg-[#1e232a] text-white text-xs font-semibold rounded-md"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingNewCat(false)}
                    className="px-2 py-1.5 text-xs text-[#736c61]"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] focus:outline-hidden focus:border-amber-600 shadow-2xs cursor-pointer font-medium"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447] mb-1">
                Topic / Subject Domain *
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Gift psychology / displayable gifts"
                className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 shadow-2xs"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447] mb-1">
              Short Description *
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explains why recipients often value gifts they can visibly incorporate into their environment..."
              className="w-full px-3 py-2 text-xs leading-relaxed bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 shadow-2xs resize-none"
            />
          </div>

          {/* Preferred Anchor Text & Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447] mb-1">
                Preferred Anchor Text (Optional Suggestion)
              </label>
              <input
                type="text"
                value={preferredAnchor}
                onChange={(e) => setPreferredAnchor(e.target.value)}
                placeholder="e.g. why people prefer gifts they can display"
                className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 shadow-2xs"
              />
              <p className="text-[10px] text-[#736c61] mt-0.5">
                AI treats this as a guideline, adapting natural phrasing for sentence flow.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447] mb-1">
                Editorial Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Useful when discussing decorative or displayable gifts"
                className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 shadow-2xs"
              />
            </div>
          </div>

          {/* Active Status Toggle */}
          <div className="pt-2 border-t border-[#ede7db] flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-[#1e232a]">Active in AI Library</div>
              <p className="text-[11px] text-[#736c61]">
                When active, the AI can suggest linking to this article during "Find Link Opportunities".
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-[#dcd6ca] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#c8c0b2] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-700"></div>
            </label>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-[#e5dfd3] flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 min-h-[38px] text-xs font-medium text-[#5c5447] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 min-h-[38px] text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg transition-colors shadow-2xs inline-flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{link ? 'Save Changes' : 'Save Internal Link'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
