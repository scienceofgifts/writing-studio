/**
 * Science of Gifts - Internal Link Modal (Phase 4 & Automatic Metadata Fetching)
 * Modal for adding and editing reusable Science of Gifts internal link records.
 * Supports manual entry as well as secure automatic article metadata fetching from URLs.
 * Enforces clean URLs (no tracking parameters), validation, and category management.
 */

import React, { useState } from 'react';
import { InternalLink } from '../../types/internalLink';
import {
  isValidUrl,
  hasTrackingParameters,
  cleanTrackingParameters,
} from '../../utils/urlUtils';
import { fetchLinkMetadata } from '../../services/linkMetadataService';
import {
  X,
  Link2,
  AlertCircle,
  Sparkles,
  ShieldCheck,
  Plus,
  Globe,
  Loader2,
  CheckCircle2,
  ArrowRight,
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
  const [url, setUrl] = useState(link?.url || '');
  const [title, setTitle] = useState(link?.title || '');
  const [topic, setTopic] = useState(link?.topic || '');
  const [description, setDescription] = useState(link?.description || '');
  const [preferredAnchor, setPreferredAnchor] = useState(link?.preferredAnchor || '');
  const [notes, setNotes] = useState(link?.notes || '');
  const [category, setCategory] = useState(link?.category || categories[0] || 'General');
  const [active, setActive] = useState(link?.active !== undefined ? link.active : true);

  // Automatic metadata fetch state
  const [isFetching, setIsFetching] = useState(false);
  const [fetchMessage, setFetchMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Overwrite protection: suggestions for fields that already have user content
  const [pendingSuggestions, setPendingSuggestions] = useState<Record<string, string> | null>(null);
  const [canonicalSuggestion, setCanonicalSuggestion] = useState<string | null>(null);

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

  /**
   * Automatic URL metadata fetch handler with overwrite protection
   */
  const handleFetchDetails = async () => {
    if (!url.trim()) {
      setError('Please enter a destination URL to fetch details for.');
      return;
    }

    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = `https://${targetUrl}`;
      setUrl(targetUrl);
    }

    if (!isValidUrl(targetUrl)) {
      setError('Please enter a valid HTTP or HTTPS URL before fetching.');
      return;
    }

    setError('');
    setFetchMessage(null);
    setIsFetching(true);

    try {
      const res = await fetchLinkMetadata(targetUrl, categories);
      if (!res.ok || !res.metadata) {
        setFetchMessage({
          type: 'error',
          text: res.error || 'Failed to retrieve article details. You can still fill in the form manually.',
        });
        return;
      }

      const meta = res.metadata;
      const newSuggestions: Record<string, string> = {};
      let autoPopulatedCount = 0;

      // 1. Title
      if (meta.title) {
        if (!title.trim()) {
          setTitle(meta.title);
          autoPopulatedCount++;
        } else if (meta.title.trim() !== title.trim()) {
          newSuggestions['title'] = meta.title.trim();
        }
      }

      // 2. Short Description
      if (meta.description) {
        if (!description.trim()) {
          setDescription(meta.description);
          autoPopulatedCount++;
        } else if (meta.description.trim() !== description.trim()) {
          newSuggestions['description'] = meta.description.trim();
        }
      }

      // 3. Topic / Subject Domain
      if (meta.topic) {
        if (!topic.trim()) {
          setTopic(meta.topic);
          autoPopulatedCount++;
        } else if (meta.topic.trim() !== topic.trim()) {
          newSuggestions['topic'] = meta.topic.trim();
        }
      }

      // 4. Category
      if (meta.category && categories.includes(meta.category)) {
        if (category === 'General' || category === categories[0]) {
          setCategory(meta.category);
          autoPopulatedCount++;
        } else if (meta.category !== category) {
          newSuggestions['category'] = meta.category;
        }
      }

      // 5. Preferred Anchor Text
      if (meta.preferredAnchor) {
        if (!preferredAnchor.trim()) {
          setPreferredAnchor(meta.preferredAnchor);
          autoPopulatedCount++;
        } else if (meta.preferredAnchor.trim() !== preferredAnchor.trim()) {
          newSuggestions['preferredAnchor'] = meta.preferredAnchor.trim();
        }
      }

      // 6. Editorial Notes
      if (meta.notes) {
        if (!notes.trim()) {
          setNotes(meta.notes);
          autoPopulatedCount++;
        } else if (meta.notes.trim() !== notes.trim()) {
          newSuggestions['notes'] = meta.notes.trim();
        }
      }

      // Canonical URL suggestion
      if (meta.canonicalUrl && meta.canonicalUrl.trim() !== targetUrl) {
        setCanonicalSuggestion(meta.canonicalUrl.trim());
      } else {
        setCanonicalSuggestion(null);
      }

      const suggestionCount = Object.keys(newSuggestions).length;
      if (suggestionCount > 0) {
        setPendingSuggestions(newSuggestions);
        setFetchMessage({
          type: 'info',
          text: `AI research complete. ${autoPopulatedCount > 0 ? `${autoPopulatedCount} field(s) populated directly. ` : ''}${suggestionCount} field(s) have new suggestions ready to review below.`,
        });
      } else if (autoPopulatedCount > 0) {
        setPendingSuggestions(null);
        setFetchMessage({
          type: 'success',
          text: `Retrieved article metadata and populated ${autoPopulatedCount} field(s) with AI research synthesis.`,
        });
      } else {
        setPendingSuggestions(null);
        setFetchMessage({
          type: 'success',
          text: 'Article research complete. All fields are up to date.',
        });
      }
    } catch (err: any) {
      setFetchMessage({
        type: 'error',
        text: err?.message || 'Error occurred while contacting the server.',
      });
    } finally {
      setIsFetching(false);
    }
  };

  const applySingleSuggestion = (field: string) => {
    if (!pendingSuggestions || !pendingSuggestions[field]) return;
    const val = pendingSuggestions[field];
    if (field === 'title') setTitle(val);
    else if (field === 'description') setDescription(val);
    else if (field === 'topic') setTopic(val);
    else if (field === 'category') setCategory(val);
    else if (field === 'preferredAnchor') setPreferredAnchor(val);
    else if (field === 'notes') setNotes(val);

    const updated = { ...pendingSuggestions };
    delete updated[field];
    setPendingSuggestions(Object.keys(updated).length > 0 ? updated : null);
  };

  const dismissSingleSuggestion = (field: string) => {
    if (!pendingSuggestions) return;
    const updated = { ...pendingSuggestions };
    delete updated[field];
    setPendingSuggestions(Object.keys(updated).length > 0 ? updated : null);
  };

  const applyAllSuggestions = () => {
    if (!pendingSuggestions) return;
    if (pendingSuggestions.title) setTitle(pendingSuggestions.title);
    if (pendingSuggestions.description) setDescription(pendingSuggestions.description);
    if (pendingSuggestions.topic) setTopic(pendingSuggestions.topic);
    if (pendingSuggestions.category) setCategory(pendingSuggestions.category);
    if (pendingSuggestions.preferredAnchor) setPreferredAnchor(pendingSuggestions.preferredAnchor);
    if (pendingSuggestions.notes) setNotes(pendingSuggestions.notes);

    setPendingSuggestions(null);
    setFetchMessage({ type: 'success', text: 'All suggestions applied to the form.' });
  };

  const dismissAllSuggestions = () => {
    setPendingSuggestions(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!url.trim()) {
      setError('Please provide the destination URL.');
      return;
    }

    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    if (!isValidUrl(finalUrl)) {
      setError('Please provide a valid HTTP or HTTPS URL.');
      return;
    }

    finalUrl = cleanTrackingParameters(finalUrl);

    if (!title.trim()) {
      setError('Please provide an article title.');
      return;
    }

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
            className="p-1.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-[#736c61] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7] transition-colors shrink-0 cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-sm">
          {/* Main Error */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Fetch Feedback Banner */}
          {fetchMessage && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 border ${
                fetchMessage.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : fetchMessage.type === 'info'
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {fetchMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                ) : fetchMessage.type === 'info' ? (
                  <Sparkles className="w-4 h-4 text-amber-700 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                )}
                <span className="truncate">{fetchMessage.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setFetchMessage(null)}
                className="p-1 text-current opacity-70 hover:opacity-100 rounded cursor-pointer"
                title="Dismiss message"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Bulk Apply Banner when pending suggestions exist */}
          {pendingSuggestions && Object.keys(pendingSuggestions).length > 0 && (
            <div className="p-3 bg-amber-100/70 border border-amber-300/80 rounded-xl flex items-center justify-between gap-3 text-xs animate-in fade-in">
              <div className="flex items-center gap-2 text-amber-950 min-w-0">
                <Sparkles className="w-4 h-4 text-amber-800 shrink-0" />
                <span className="truncate">
                  Retrieved metadata: <strong>{Object.keys(pendingSuggestions).length} field suggestion(s)</strong> available for existing content.
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={applyAllSuggestions}
                  className="px-2.5 py-1 bg-amber-800 hover:bg-amber-900 text-white font-semibold rounded-md text-xs transition-colors shadow-2xs cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Apply All</span>
                </button>
                <button
                  type="button"
                  onClick={dismissAllSuggestions}
                  className="px-2 py-1 text-[#5c5447] hover:text-[#1e232a] text-xs font-medium cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Destination URL & Fetch Details Action */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447]">
                Destination URL *
              </label>
              <div className="flex items-center gap-2">
                {isTracking && (
                  <button
                    type="button"
                    onClick={handleCleanUrl}
                    className="text-xs font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-amber-700" />
                    <span>Clean Params</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleFetchDetails}
                  disabled={isFetching || !url.trim()}
                  className="px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                  title="Fetch article title, description, and metadata automatically from this URL"
                >
                  {isFetching ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-800" />
                      <span>Fetching Details...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5 text-amber-800" />
                      <span>Fetch Details</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.scienceofgifts.com/article-slug/"
              className="w-full px-3 py-2 text-sm font-mono text-xs bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 shadow-2xs"
            />

            {/* Tracking Warning */}
            {isTracking && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-[11px] flex items-center justify-between">
                <span>URL contains tracking parameters (utm_*, ref, etc.). Clean before saving for pristine publication.</span>
                <button
                  type="button"
                  onClick={handleCleanUrl}
                  className="px-2 py-0.5 bg-amber-800 text-white rounded text-[10px] font-bold cursor-pointer"
                >
                  Clean Now
                </button>
              </div>
            )}

            {/* Canonical URL Suggestion Pill */}
            {canonicalSuggestion && (
              <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-950 flex items-center justify-between gap-2 animate-in fade-in">
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-emerald-900">Canonical URL detected: </span>
                  <span className="font-mono text-[11px] text-emerald-800">{canonicalSuggestion}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setUrl(canonicalSuggestion);
                      setCanonicalSuggestion(null);
                    }}
                    className="px-2 py-0.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    Use Canonical
                  </button>
                  <button
                    type="button"
                    onClick={() => setCanonicalSuggestion(null)}
                    className="px-1.5 py-0.5 text-emerald-800 hover:text-emerald-950 text-[11px] font-medium cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Article Title */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5c5447]">
                Article Title *
              </label>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Why People Prefer Gifts They Can Display"
              className="w-full px-3 py-2 text-sm bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-600 shadow-2xs"
            />
            {pendingSuggestions?.title && (
              <div className="mt-1.5 p-2 bg-amber-50/90 border border-amber-200 rounded-md text-xs text-[#3d372e] flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-amber-900">Fetched Suggestion: </span>
                  <span className="text-[#3b3429] font-medium">"{pendingSuggestions.title}"</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => applySingleSuggestion('title')}
                    className="px-2 py-0.5 bg-amber-800 hover:bg-amber-900 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissSingleSuggestion('title')}
                    className="px-1.5 py-0.5 text-[#736c61] hover:text-[#1e232a] text-[11px] font-medium cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
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
                    className="text-[11px] text-amber-800 hover:underline inline-flex items-center gap-0.5 cursor-pointer"
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
                    className="px-2.5 py-1.5 bg-[#1e232a] text-white text-xs font-semibold rounded-md cursor-pointer"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingNewCat(false)}
                    className="px-2 py-1.5 text-xs text-[#736c61] cursor-pointer"
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

              {pendingSuggestions?.category && (
                <div className="mt-1.5 p-2 bg-amber-50/90 border border-amber-200 rounded-md text-xs text-[#3d372e] flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-amber-900">Suggested: </span>
                    <span className="text-[#3b3429] font-medium">{pendingSuggestions.category}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => applySingleSuggestion('category')}
                      className="px-2 py-0.5 bg-amber-800 hover:bg-amber-900 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissSingleSuggestion('category')}
                      className="px-1.5 py-0.5 text-[#736c61] hover:text-[#1e232a] text-[11px] font-medium cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
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
              {pendingSuggestions?.topic && (
                <div className="mt-1.5 p-2 bg-amber-50/90 border border-amber-200 rounded-md text-xs text-[#3d372e] flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-amber-900">Suggested: </span>
                    <span className="text-[#3b3429] font-medium">"{pendingSuggestions.topic}"</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => applySingleSuggestion('topic')}
                      className="px-2 py-0.5 bg-amber-800 hover:bg-amber-900 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissSingleSuggestion('topic')}
                      className="px-1.5 py-0.5 text-[#736c61] hover:text-[#1e232a] text-[11px] font-medium cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Short Description */}
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
            {pendingSuggestions?.description && (
              <div className="mt-1.5 p-2 bg-amber-50/90 border border-amber-200 rounded-md text-xs text-[#3d372e] flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-amber-900">Suggested: </span>
                  <span className="text-[#3b3429] italic">"{pendingSuggestions.description}"</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => applySingleSuggestion('description')}
                    className="px-2 py-0.5 bg-amber-800 hover:bg-amber-900 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissSingleSuggestion('description')}
                    className="px-1.5 py-0.5 text-[#736c61] hover:text-[#1e232a] text-[11px] font-medium cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
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
              {pendingSuggestions?.preferredAnchor && (
                <div className="mt-1.5 p-2 bg-amber-50/90 border border-amber-200 rounded-md text-xs text-[#3d372e] flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-amber-900">Suggested: </span>
                    <span className="text-[#3b3429] font-medium">"{pendingSuggestions.preferredAnchor}"</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => applySingleSuggestion('preferredAnchor')}
                      className="px-2 py-0.5 bg-amber-800 hover:bg-amber-900 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissSingleSuggestion('preferredAnchor')}
                      className="px-1.5 py-0.5 text-[#736c61] hover:text-[#1e232a] text-[11px] font-medium cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
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
              {pendingSuggestions?.notes && (
                <div className="mt-1.5 p-2 bg-amber-50/90 border border-amber-200 rounded-md text-xs text-[#3d372e] flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-amber-900">Suggested: </span>
                    <span className="text-[#3b3429] font-medium">"{pendingSuggestions.notes}"</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => applySingleSuggestion('notes')}
                      className="px-2 py-0.5 bg-amber-800 hover:bg-amber-900 text-white rounded text-[11px] font-semibold transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissSingleSuggestion('notes')}
                      className="px-1.5 py-0.5 text-[#736c61] hover:text-[#1e232a] text-[11px] font-medium cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
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
              className="px-4 py-2 min-h-[38px] text-xs font-medium text-[#5c5447] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 min-h-[38px] text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg transition-colors shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
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
