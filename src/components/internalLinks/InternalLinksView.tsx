/**
 * Science of Gifts - Internal Links Library Studio (Phase 4)
 * Repository of reusable Science of Gifts articles for contextual AI internal linking.
 */

import React, { useState } from 'react';
import { InternalLink } from '../../types/internalLink';
import { storage } from '../../services/storage';
import { LinkModal } from './LinkModal';
import {
  cleanTrackingParameters,
  hasTrackingParameters,
} from '../../utils/urlUtils';
import {
  Link2,
  Plus,
  Search,
  Trash2,
  Edit3,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Layers,
  FolderPlus,
  Filter,
  ArrowRight,
  Sliders,
  HelpCircle,
} from 'lucide-react';

import { ConfirmationModal } from '../ConfirmationModal';
import { toast } from '../../services/toastService';

interface InternalLinksViewProps {
  onBackToStudio?: () => void;
}

export const InternalLinksView: React.FC<InternalLinksViewProps> = ({ onBackToStudio }) => {
  const [links, setLinks] = useState<InternalLink[]>(() => storage.getInternalLinks());
  const [categories, setCategories] = useState<string[]>(() => storage.getLinkCategories());

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<InternalLink | null>(null);
  const [linkToDelete, setLinkToDelete] = useState<InternalLink | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  // Category management inline
  const [isManagingCategories, setIsManagingCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const handleSaveLink = (saved: InternalLink) => {
    const existingIndex = links.findIndex((l) => l.id === saved.id);
    let updated: InternalLink[];
    if (existingIndex >= 0) {
      updated = [...links];
      updated[existingIndex] = saved;
    } else {
      updated = [saved, ...links];
    }
    setLinks(updated);
    storage.saveInternalLinks(updated);
    setIsModalOpen(false);
    setEditingLink(null);
    toast.success('Link Saved', `"${saved.title}" is in the library.`);
  };

  const confirmDeleteLink = () => {
    if (!linkToDelete) return;
    const updated = links.filter((l) => l.id !== linkToDelete.id);
    setLinks(updated);
    storage.saveInternalLinks(updated);
    toast.info('Link Removed', `"${linkToDelete.title}" was deleted.`);
    setLinkToDelete(null);
  };

  const handleToggleActive = (id: string) => {
    const updated = links.map((l) => (l.id === id ? { ...l, active: !l.active, updatedAt: new Date().toISOString() } : l));
    setLinks(updated);
    storage.saveInternalLinks(updated);
    toast.info('Link Updated', 'Status changed.');
  };

  const handleCleanLinkUrl = (id: string) => {
    const updated = links.map((l) => {
      if (l.id === id) {
        return {
          ...l,
          url: cleanTrackingParameters(l.url),
          updatedAt: new Date().toISOString(),
        };
      }
      return l;
    });
    setLinks(updated);
    storage.saveInternalLinks(updated);
    toast.success('URL Cleaned', 'Tracking parameters removed.');
  };

  const handleAddCategory = (catName: string) => {
    const trimmed = catName.trim();
    if (!trimmed || categories.includes(trimmed)) return;
    storage.addLinkCategory(trimmed);
    setCategories(storage.getLinkCategories());
    setNewCategoryName('');
    toast.success('Category Added', `Added "${trimmed}".`);
  };

  const confirmDeleteCategory = () => {
    if (!categoryToDelete) return;
    storage.deleteLinkCategory(categoryToDelete);
    setCategories(storage.getLinkCategories());
    const updated = links.map((l) => (l.category === categoryToDelete ? { ...l, category: 'General' } : l));
    setLinks(updated);
    storage.saveInternalLinks(updated);
    if (selectedCategory === categoryToDelete) {
      setSelectedCategory('all');
    }
    toast.info('Category Removed', `Deleted category "${categoryToDelete}".`);
    setCategoryToDelete(null);
  };

  // Filtered links
  const filteredLinks = links.filter((link) => {
    const matchesSearch =
      !searchQuery.trim() ||
      link.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (link.preferredAnchor && link.preferredAnchor.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (link.notes && link.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = selectedCategory === 'all' || link.category === selectedCategory;

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && link.active) ||
      (statusFilter === 'inactive' && !link.active);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const activeCount = links.filter((l) => l.active).length;

  return (
    <div className="flex-1 flex flex-col bg-[#faf9f6] overflow-hidden">
      {/* Top Masthead Header */}
      <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#f6f3eb] border-b border-[#e5dfd3] shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-bold uppercase tracking-wider">
              Phase 4 Architecture
            </span>
            <h1 className="font-editorial text-2xl font-bold text-[#1e232a]">
              Internal Link Library
            </h1>
          </div>
          <p className="text-xs text-[#6e685f] mt-0.5">
            Publication repository of Science of Gifts articles. AI evaluates these records during "Find Link Opportunities".
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setEditingLink(null);
              setIsModalOpen(true);
            }}
            className="px-3.5 py-1.5 min-h-[36px] text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Internal Link</span>
          </button>

          {onBackToStudio && (
            <button
              type="button"
              onClick={onBackToStudio}
              className="px-3 py-1.5 min-h-[36px] text-xs font-semibold text-[#1e232a] bg-white border border-[#dcd6ca] rounded-lg hover:bg-[#ede8dc] transition-colors shadow-2xs"
            >
              Back to Studio
            </button>
          )}
        </div>
      </div>

      {/* Philosophy Banner */}
      <div className="px-4 sm:px-6 py-2.5 bg-amber-50/70 border-b border-amber-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-950">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-amber-800 shrink-0" />
          <span>
            <strong>Editorial Linking Principle:</strong> Links are recommended only when they provide genuine value to the reader. The AI never forces keyword stuffing or automatic injection.
          </span>
        </div>
        <span className="text-[11px] font-semibold text-amber-900 shrink-0">
          {activeCount} of {links.length} Active in AI Scope
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-4 sm:space-y-6 max-w-6xl mx-auto w-full">
        {/* Search & Filter Toolbar */}
        <div className="bg-white border border-[#e5dfd3] rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#8c8477] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search links by title, topic, description, URL, or anchor..."
                className="w-full pl-9 pr-3.5 py-2 text-xs bg-[#faf9f6] border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 shadow-2xs"
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs px-3 py-2 bg-[#faf9f6] border border-[#dcd6ca] rounded-lg text-[#1e232a] focus:outline-hidden cursor-pointer font-medium"
              >
                <option value="all">All Categories ({categories.length})</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="text-xs px-3 py-2 bg-[#faf9f6] border border-[#dcd6ca] rounded-lg text-[#1e232a] focus:outline-hidden cursor-pointer font-medium"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
              </select>

              <button
                type="button"
                onClick={() => setIsManagingCategories(!isManagingCategories)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center gap-1.5 ${
                  isManagingCategories
                    ? 'bg-[#1e232a] text-white border-[#1e232a]'
                    : 'bg-[#faf9f6] text-[#5c5447] border-[#dcd6ca] hover:bg-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Categories</span>
              </button>
            </div>
          </div>

          {/* Category Management Drawer/Section */}
          {isManagingCategories && (
            <div className="pt-3 border-t border-[#ede7db] space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1e232a] uppercase tracking-wider">
                  Manage Categories
                </span>
                <span className="text-[11px] text-[#736c61]">
                  Categories organize library records for targeted editorial filtering
                </span>
              </div>

              {/* Categories list */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {categories.map((cat) => {
                  const count = links.filter((l) => l.category === cat).length;
                  return (
                    <div
                      key={cat}
                      className="px-2.5 py-1 bg-[#f6f3eb] border border-[#dcd6ca] rounded-lg text-xs text-[#2d333b] flex items-center gap-2"
                    >
                      <span className="font-medium">{cat}</span>
                      {categories.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setCategoryToDelete(cat)}
                          className="text-[#8a8275] hover:text-rose-700"
                          title="Delete category"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* Add new category form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddCategory(newCategoryName);
                  }}
                  className="inline-flex items-center gap-1"
                >
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="New category..."
                    className="px-2.5 py-1 text-xs bg-[#faf9f6] border border-[#dcd6ca] rounded-md text-[#1e232a] focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 bg-[#1e232a] text-white text-xs font-semibold rounded-md hover:bg-[#2d3744]"
                  >
                    Add
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Links Grid */}
        {filteredLinks.length === 0 ? (
          <div className="p-12 border border-dashed border-[#dcd6ca] rounded-2xl text-center bg-white/50 space-y-3">
            <Link2 className="w-8 h-8 text-[#a8a194] mx-auto" />
            <div>
              <h3 className="font-editorial text-base font-bold text-[#1e232a]">
                {searchQuery || selectedCategory !== 'all' || statusFilter !== 'all'
                  ? 'No matching internal links found'
                  : 'No internal links in library'}
              </h3>
              <p className="text-xs text-[#736c61] max-w-md mx-auto mt-1">
                {searchQuery || selectedCategory !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your search query or filters.'
                  : 'Add Science of Gifts article records so the AI can evaluate contextual linking opportunities.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingLink(null);
                setIsModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Internal Link Now</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredLinks.map((link) => {
              const hasTracking = hasTrackingParameters(link.url);
              return (
                <div
                  key={link.id}
                  className={`bg-white border rounded-xl p-5 shadow-2xs flex flex-col justify-between space-y-3.5 transition-all ${
                    link.active
                      ? 'border-[#e5dfd3] hover:border-[#cfc6b6]'
                      : 'border-[#e5dfd3] bg-[#f9f8f5] opacity-70'
                  }`}
                >
                  <div className="space-y-2.5">
                    {/* Top Row: Category badge & Active Toggle */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                        {link.category}
                      </span>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${link.active ? 'text-emerald-700' : 'text-[#8a8275]'}`}>
                          {link.active ? 'Active' : 'Disabled'}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={link.active}
                            onChange={() => handleToggleActive(link.id)}
                            className="sr-only peer"
                          />
                          <div className="w-8 h-4 bg-[#dcd6ca] peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#c8c0b2] after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-700"></div>
                        </label>
                      </div>
                    </div>

                    {/* Title & URL */}
                    <div>
                      <h3 className="font-editorial text-base font-bold text-[#1e232a] leading-tight">
                        {link.title}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-[#6e685f] break-all">
                        <span className="truncate">{link.url}</span>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#736c61] hover:text-amber-800 shrink-0"
                          title="Open URL in new tab"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* Tracking warning if present */}
                    {hasTracking && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-900 flex items-center justify-between">
                        <span>URL has tracking parameters.</span>
                        <button
                          type="button"
                          onClick={() => handleCleanLinkUrl(link.id)}
                          className="px-2 py-0.5 bg-amber-800 text-white rounded font-bold"
                        >
                          Clean
                        </button>
                      </div>
                    )}

                    {/* Topic & Description */}
                    <div className="space-y-1 text-xs">
                      <div className="text-[11px] text-[#5c5447] font-medium">
                        <strong className="text-[#1e232a]">Topic:</strong> {link.topic}
                      </div>
                      <p className="text-[#4a443b] leading-relaxed line-clamp-2">
                        {link.description}
                      </p>
                    </div>

                    {/* Preferred Anchor / Notes */}
                    {(link.preferredAnchor || link.notes) && (
                      <div className="p-2.5 bg-[#faf9f6] border border-[#f0ece1] rounded-lg text-[11px] space-y-1">
                        {link.preferredAnchor && (
                          <div className="text-[#5c5447]">
                            <strong className="text-[#1e232a]">Anchor Suggestion:</strong> "{link.preferredAnchor}"
                          </div>
                        )}
                        {link.notes && (
                          <div className="text-[#736c61] italic line-clamp-1">
                            Note: {link.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Footer Actions */}
                  <div className="pt-2 border-t border-[#f0ece1] flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLink(link);
                        setIsModalOpen(true);
                      }}
                      className="p-1.5 text-[#5c5447] hover:text-[#1e232a] rounded-md hover:bg-[#f6f3eb] transition-colors"
                      title="Edit internal link"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkToDelete(link)}
                      className="p-1.5 text-[#8a8275] hover:text-rose-700 rounded-md hover:bg-rose-50 transition-colors"
                      title="Delete internal link"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Link Modal */}
      {isModalOpen && (
        <LinkModal
          link={editingLink}
          categories={categories}
          onSave={handleSaveLink}
          onAddCategory={handleAddCategory}
          onClose={() => {
            setIsModalOpen(false);
            setEditingLink(null);
          }}
        />
      )}

      {/* Delete Link Confirmation */}
      {linkToDelete && (
        <ConfirmationModal
          isOpen={true}
          title={`Delete "${linkToDelete.title}"?`}
          message="This will remove the internal link from your publication repository. It will no longer be suggested by the AI."
          confirmLabel="Delete Link"
          cancelLabel="Cancel"
          isDestructive={true}
          onConfirm={confirmDeleteLink}
          onCancel={() => setLinkToDelete(null)}
        />
      )}

      {/* Delete Category Confirmation */}
      {categoryToDelete && (
        <ConfirmationModal
          isOpen={true}
          title={`Delete Category "${categoryToDelete}"?`}
          message="Existing links in this category will be automatically reassigned to the General category."
          confirmLabel="Delete Category"
          cancelLabel="Cancel"
          isDestructive={false}
          onConfirm={confirmDeleteCategory}
          onCancel={() => setCategoryToDelete(null)}
        />
      )}
    </div>
  );
};
