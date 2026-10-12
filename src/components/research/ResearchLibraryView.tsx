import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Lightbulb,
  FileText,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Database,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import { ResearchStudy } from '../../types/research';
import { storage } from '../../services/storage';
import { AddResearchModal } from './AddResearchModal';
import { ResearchIdeasModal } from './ResearchIdeasModal';
import { EditorialIdea } from '../../types/ideaGenerator';

interface ResearchLibraryViewProps {
  onOpenStudy: (studyId: string) => void;
  onBackToStudio: () => void;
  onUseIdea: (idea: EditorialIdea, targetAudience?: string) => void;
}

export const ResearchLibraryView: React.FC<ResearchLibraryViewProps> = ({
  onOpenStudy,
  onBackToStudio,
  onUseIdea,
}) => {
  const [studies, setStudies] = useState<ResearchStudy[]>(() => storage.getResearchStudies());
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'analyzed' | 'unanalyzed'>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'dateAdded_desc' | 'dateAdded_asc' | 'year_desc' | 'title_asc'>('dateAdded_desc');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isIdeasModalOpen, setIsIdeasModalOpen] = useState(false);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    studies.forEach((s) => {
      (s.tags || []).forEach((t) => set.add(t));
    });
    return Array.from(set).sort();
  }, [studies]);

  // Filter & Sort
  const filteredStudies = useMemo(() => {
    return studies
      .filter((study) => {
        // Status filter
        if (statusFilter === 'analyzed' && study.analysisStatus !== 'analyzed') return false;
        if (statusFilter === 'unanalyzed' && study.analysisStatus === 'analyzed') return false;

        // Tag filter
        if (selectedTag !== 'all' && !(study.tags || []).includes(selectedTag)) return false;

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = (study.title || '').toLowerCase().includes(q);
          const matchAuthors = (study.authors || []).some((a) => a.toLowerCase().includes(q));
          const matchPub = (study.publication || '').toLowerCase().includes(q);
          const matchTags = (study.tags || []).some((t) => t.toLowerCase().includes(q));
          const matchAbstract = (study.abstract || '').toLowerCase().includes(q);
          if (!matchTitle && !matchAuthors && !matchPub && !matchTags && !matchAbstract) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'dateAdded_desc') {
          return new Date(b.dateAdded || b.createdAt).getTime() - new Date(a.dateAdded || a.createdAt).getTime();
        }
        if (sortBy === 'dateAdded_asc') {
          return new Date(a.dateAdded || a.createdAt).getTime() - new Date(b.dateAdded || b.createdAt).getTime();
        }
        if (sortBy === 'year_desc') {
          const yA = parseInt(String(a.publicationYear || 0), 10) || 0;
          const yB = parseInt(String(b.publicationYear || 0), 10) || 0;
          return yB - yA;
        }
        if (sortBy === 'title_asc') {
          return (a.title || '').localeCompare(b.title || '');
        }
        return 0;
      });
  }, [studies, searchQuery, statusFilter, selectedTag, sortBy]);

  const handleStudyCreated = (newStudy: ResearchStudy) => {
    setStudies(storage.getResearchStudies());
    onOpenStudy(newStudy.id);
  };

  const totalClaimsCount = useMemo(() => {
    return studies.reduce((acc, s) => acc + (s.claims?.length || 0), 0);
  }, [studies]);

  const analyzedCount = useMemo(() => {
    return studies.filter((s) => s.analysisStatus === 'analyzed').length;
  }, [studies]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#faf9f6] overflow-hidden text-[#1e232a]">
      {/* Top Header */}
      <div className="px-6 py-4 border-b border-[#eae4d7] bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToStudio}
            className="p-1.5 rounded-lg text-[#615a50] hover:text-[#1e232a] hover:bg-[#eae4d7] transition-colors flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Studio</span>
          </button>
          <div className="h-4 w-px bg-[#eae4d7] hidden sm:block" />
          <div>
            <h1 className="text-lg font-serif font-bold text-[#1e232a] flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-900" />
              <span>Research Library</span>
            </h1>
            <p className="text-xs text-[#736c61]">
              Empirical studies, verified findings, and structured editorial claims for Science of Gifts.
            </p>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsIdeasModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold bg-[#faf8f4] hover:bg-[#f0ede6] text-[#2b251d] border border-[#dcd6ca] rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
          >
            <Lightbulb className="w-3.5 h-3.5 text-amber-700" />
            <span>Generate Ideas from Research</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Research</span>
          </button>
        </div>
      </div>

      {/* Metrics Banner */}
      <div className="px-6 py-2.5 bg-[#f7f4ed] border-b border-[#eae4d7] flex items-center gap-6 text-xs text-[#524b40] shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[#1e232a]">{studies.length}</span>
          <span>Total Studies</span>
        </div>
        <div className="h-3 w-px bg-[#dcd6ca]" />
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-emerald-800">{analyzedCount}</span>
          <span>Analyzed Papers</span>
        </div>
        <div className="h-3 w-px bg-[#dcd6ca]" />
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-blue-800">{totalClaimsCount}</span>
          <span>Structured Claims</span>
        </div>
        <div className="h-3 w-px bg-[#dcd6ca]" />
        <div className="flex items-center gap-1.5 text-[#736c61]">
          <Database className="w-3 h-3 text-emerald-700" />
          <span>Local IndexedDB Persistence Active</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="px-6 py-3 bg-[#faf9f6] border-b border-[#eae4d7] flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="w-3.5 h-3.5 text-[#857d72] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search papers by title, author, journal, abstract, tags..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 text-xs">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1.5 bg-white border border-[#dcd6ca] rounded-lg text-[#3b342a] focus:outline-hidden"
          >
            <option value="all">All Statuses</option>
            <option value="analyzed">Analyzed Only</option>
            <option value="unanalyzed">Unanalyzed Only</option>
          </select>

          {/* Tag Filter */}
          {allTags.length > 0 && (
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-[#dcd6ca] rounded-lg text-[#3b342a] focus:outline-hidden max-w-[150px] truncate"
            >
              <option value="all">All Topics</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          )}

          {/* Sort By */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-2.5 py-1.5 bg-white border border-[#dcd6ca] rounded-lg text-[#3b342a] focus:outline-hidden"
          >
            <option value="dateAdded_desc">Newest Added</option>
            <option value="dateAdded_asc">Oldest Added</option>
            <option value="year_desc">Publication Year</option>
            <option value="title_asc">Title (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Studies Grid / List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredStudies.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-white border border-[#eae4d7] max-w-xl mx-auto space-y-3">
            <BookOpen className="w-10 h-10 text-[#a8a194] mx-auto" />
            <h3 className="text-base font-serif font-bold text-[#1e232a]">
              {studies.length === 0 ? 'Your Research Library is Empty' : 'No Research Matches Your Filter'}
            </h3>
            <p className="text-xs text-[#736c61] leading-relaxed">
              {studies.length === 0
                ? 'Import scientific papers via DOI, PubMed URL, journal link, or PDF to extract reliable claims and build research-backed outlines.'
                : 'Try adjusting your search query or filter settings to view your stored research studies.'}
            </p>
            {studies.length === 0 ? (
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="mt-2 px-4 py-2 text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white rounded-lg shadow-xs inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Your First Study</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setSelectedTag('all');
                }}
                className="mt-2 px-3.5 py-1.5 text-xs font-semibold text-amber-900 hover:underline"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStudies.map((study) => (
              <div
                key={study.id}
                onClick={() => onOpenStudy(study.id)}
                className="bg-white border border-[#dcd6ca] hover:border-amber-800/80 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group text-left"
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                        study.analysisStatus === 'analyzed'
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                      }`}
                    >
                      {study.analysisStatus === 'analyzed' ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          <span>Analyzed</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3 h-3 text-amber-700" />
                          <span>Unanalyzed</span>
                        </>
                      )}
                    </span>

                    <span className="text-[11px] text-[#736c61]">
                      {study.publicationYear || (study.publicationDate ? study.publicationDate.slice(0, 4) : '')}
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-serif font-bold text-[#1e232a] group-hover:text-amber-950 line-clamp-2 leading-snug">
                    {study.title}
                  </h3>

                  {/* Authors & Publication */}
                  <div className="text-xs text-[#615a50] space-y-0.5">
                    <div className="truncate font-medium">
                      {Array.isArray(study.authors) && study.authors.length > 0
                        ? study.authors.join(', ')
                        : 'Unspecified authors'}
                    </div>
                    {study.publication && (
                      <div className="text-[11px] text-[#8a8275] truncate italic">
                        {study.publication}
                      </div>
                    )}
                  </div>

                  {/* Abstract preview */}
                  {study.abstract && (
                    <p className="text-xs text-[#524b40] line-clamp-2 leading-relaxed font-serif">
                      {study.abstract}
                    </p>
                  )}

                  {/* Tags */}
                  {study.tags && study.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {study.tags.slice(0, 3).map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-[#f5f1e8] text-[#5e5548] border border-[#e3dcce]"
                        >
                          #{tag}
                        </span>
                      ))}
                      {study.tags.length > 3 && (
                        <span className="text-[10px] text-[#8a8275]">
                          +{study.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="pt-4 mt-4 border-t border-[#f0ede6] flex items-center justify-between text-xs text-[#736c61]">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px]">
                      <FileText className="w-3 h-3 text-blue-800" />
                      <span>{study.claims?.length || 0} Claims</span>
                    </span>
                    {study.extractedText && (
                      <span className="text-[10px] font-medium text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        PDF Text
                      </span>
                    )}
                  </div>

                  <span className="flex items-center gap-0.5 text-amber-900 font-semibold group-hover:translate-x-0.5 transition-transform">
                    <span>Open</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Research Modal */}
      <AddResearchModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onStudyCreated={handleStudyCreated}
      />

      {/* Research to Ideas Modal */}
      <ResearchIdeasModal
        isOpen={isIdeasModalOpen}
        onClose={() => setIsIdeasModalOpen(false)}
        studies={studies}
        onUseIdea={onUseIdea}
      />
    </div>
  );
};
