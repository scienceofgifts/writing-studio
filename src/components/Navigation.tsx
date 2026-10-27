/**
 * Science of Gifts - Two-Tier Navigation Architecture
 * Tier 1: Primary Global Application Navbar (Dashboard, Workspaces, Library Dropdown, Settings)
 * Tier 2: Contextual Project Toolbar (Back link, Type pill, Project Title, Save status, Drawer controls)
 */

import React, { useState, useRef, useEffect } from 'react';
import { ProjectType, WritingProject, ActivePanel, ProjectSaveStatus } from '../types/project';
import {
  Compass,
  FileText,
  Gift,
  Tag,
  Sliders,
  CheckCircle2,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Plus,
  ChevronDown,
  LayoutDashboard,
  Menu,
  X,
  ListOrdered,
  Scale,
  Sparkles,
  BookOpen,
  Link2,
  ArrowLeft,
  Library,
  MoreHorizontal,
  ShieldCheck,
  ClipboardCheck,
  History,
  Lightbulb,
  Database,
  Save,
  Cloud,
} from 'lucide-react';
import { CloudSyncBar } from './CloudSyncBar';

interface NavigationProps {
  currentView:
    | 'dashboard'
    | 'workspace'
    | 'editorial_development'
    | 'settings'
    | 'style_reference'
    | 'internal_links'
    | 'idea_generator'
    | 'backup'
    | 'research';
  activeProject: WritingProject | null;
  saveStatus: ProjectSaveStatus;
  dashboardTab?: ProjectType | 'all';
  onManualSave?: () => void;
  onRetrySave?: () => void;
  onOpenConflictModal?: () => void;
  activePanel?: ActivePanel;
  onTogglePanel?: (panel: Exclude<ActivePanel, null>) => void;
  onNavigate: (
    view: 'dashboard' | 'settings' | 'style_reference' | 'internal_links' | 'idea_generator' | 'backup' | 'research',
    projectType?: ProjectType
  ) => void;
  onCreateProject: (type: ProjectType) => void;
  onOpenEditorialDevelopment?: () => void;
  onOpenArticleEditor?: () => void;
  onOpenBrief?: () => void;
  onOpenOutline?: () => void;
  onOpenRules?: () => void;
  onOpenStyle?: () => void;
  onOpenInstructions?: () => void;
  onOpenLinks?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentView,
  activeProject,
  saveStatus,
  dashboardTab = 'all',
  onManualSave,
  onRetrySave,
  onOpenConflictModal,
  activePanel = null,
  onTogglePanel,
  onNavigate,
  onCreateProject,
  onOpenEditorialDevelopment,
  onOpenArticleEditor,
  onOpenBrief,
  onOpenOutline,
  onOpenRules,
  onOpenStyle,
  onOpenInstructions,
  onOpenLinks,
}) => {
  const [isLibraryMenuOpen, setIsLibraryMenuOpen] = useState(false);
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isPanelsMenuOpen, setIsPanelsMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const libraryMenuRef = useRef<HTMLDivElement>(null);
  const newMenuRef = useRef<HTMLDivElement>(null);
  const panelsMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (libraryMenuRef.current && !libraryMenuRef.current.contains(e.target as Node)) {
        setIsLibraryMenuOpen(false);
      }
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
        setIsNewMenuOpen(false);
      }
      if (panelsMenuRef.current && !panelsMenuRef.current.contains(e.target as Node)) {
        setIsPanelsMenuOpen(false);
      }
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setIsMoreMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMoreMenuOpen(false);
        setIsLibraryMenuOpen(false);
        setIsNewMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handlePanelToggle = (panel: Exclude<ActivePanel, null>) => {
    if (onTogglePanel) {
      onTogglePanel(panel);
    } else {
      if (panel === 'brief') onOpenBrief?.();
      if (panel === 'outline') onOpenOutline?.();
      if (panel === 'rules') onOpenRules?.();
      if (panel === 'controls') onOpenStyle?.();
      if (panel === 'instructions') onOpenInstructions?.();
      if (panel === 'links') onOpenLinks?.();
    }
  };

  const isSavingInFlight = saveStatus === 'saving_local' || saveStatus === 'saving_cloud';

  const getSaveIndicator = () => {
    switch (saveStatus) {
      case 'unsaved':
        return (
          <div className="flex items-center gap-1.5 text-xs text-amber-800 select-none font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
            <span>Unsaved changes</span>
          </div>
        );
      case 'saving_local':
        return (
          <div className="flex items-center gap-1.5 text-xs text-[#736c61] select-none font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
            <span>Saving locally</span>
          </div>
        );
      case 'saved_local':
        return (
          <div
            className="flex items-center gap-1.5 text-xs text-[#5c5447] select-none font-medium"
            title="Saved to local storage on this device. Not synced to the cloud."
          >
            <span className="w-2 h-2 rounded-full bg-stone-500"></span>
            <span>Saved locally — not synced</span>
          </div>
        );
      case 'saving_cloud':
        return (
          <div className="flex items-center gap-1.5 text-xs text-indigo-800 select-none font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-700" />
            <span>Saving to cloud</span>
          </div>
        );
      case 'saved_cloud':
        return (
          <div
            className="flex items-center gap-1.5 text-xs text-emerald-800 select-none font-medium"
            title="Saved locally and confirmed in Cloud Firestore."
          >
            <Cloud className="w-3.5 h-3.5 text-emerald-700" />
            <span>Saved to cloud</span>
          </div>
        );
      case 'cloud_save_failed':
        return (
          <div className="flex items-center gap-2 text-xs text-rose-800 select-none font-semibold">
            <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
            <span>Cloud save failed</span>
            <button
              type="button"
              onClick={onRetrySave || onManualSave}
              className="px-1.5 py-0.5 rounded bg-rose-100 hover:bg-rose-200 text-rose-950 text-[11px] font-bold underline cursor-pointer"
              title="Retry saving to cloud"
            >
              Retry
            </button>
          </div>
        );
      case 'conflict':
        return (
          <button
            type="button"
            onClick={onOpenConflictModal}
            className="flex items-center gap-1.5 text-xs text-amber-950 bg-amber-100/80 hover:bg-amber-200 px-2 py-0.5 rounded select-none font-bold cursor-pointer"
            title="Cloud revision conflict detected. Click to review and resolve."
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-800 shrink-0" />
            <span>Conflict — changes need review</span>
          </button>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 text-xs text-[#5c5447] select-none font-medium">
            <span className="w-2 h-2 rounded-full bg-stone-500"></span>
            <span>Saved locally — not synced</span>
          </div>
        );
    }
  };

  const getBackLabel = () => {
    if (!activeProject) return 'Dashboard';
    switch (activeProject.type) {
      case 'article':
        return 'Articles';
      case 'gift_guide':
        return 'Gift Guides';
      case 'product_copy':
        return 'Product Copies';
      default:
        return 'Dashboard';
    }
  };


  const isLibraryActive =
    currentView === 'style_reference' || currentView === 'internal_links' || currentView === 'backup' || currentView === 'research';

  return (
    <div className="flex flex-col shrink-0 sticky top-0 z-30 shadow-xs">
      {/* ========================================================================= */}
      {/* TIER 1: PRIMARY APPLICATION NAVBAR (Global destinations only)             */}
      {/* ========================================================================= */}
      <header className="bg-[#f7f5ef] border-b border-[#e5dfd3] px-4 md:px-6 py-2.5 flex items-center justify-between gap-4">
        {/* Left: Masthead & Primary Application Links */}
        <div className="flex items-center gap-6">
          {/* Brand Masthead (Primary Dashboard / Home entry point) */}
          <div
            onClick={() => onNavigate('dashboard')}
            className="cursor-pointer group flex items-center gap-2.5 select-none"
            role="button"
            tabIndex={0}
            title="Science of Gifts - Return to Dashboard"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onNavigate('dashboard');
              }
            }}
          >
            <div className="w-8 h-8 rounded-lg bg-[#1e232a] text-[#f7f5ef] flex items-center justify-center font-display font-semibold text-sm shadow-xs group-hover:bg-[#2d3744] transition-colors">
              SG
            </div>
            <div>
              <div className="font-editorial text-lg font-bold tracking-tight text-[#1e232a] leading-none group-hover:text-amber-900 transition-colors">
                Science of Gifts
              </div>
              <div className="text-[10px] uppercase tracking-widest text-[#787166] font-semibold mt-0.5">
                Writing Studio
              </div>
            </div>
          </div>

          {/* Desktop Global Navigation Menu */}
          <nav className="hidden lg:flex items-center gap-1 text-xs font-medium">
            {/* 1. Articles */}
            <button
              type="button"
              onClick={() => onNavigate('dashboard', 'article')}
              className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                (currentView === 'dashboard' && dashboardTab === 'article') ||
                ((currentView === 'workspace' || currentView === 'editorial_development') && activeProject?.type === 'article')
                  ? 'bg-[#eae4d7] text-[#1e232a] font-semibold shadow-2xs'
                  : 'text-[#615a50] hover:text-[#1e232a] hover:bg-[#efebe2]'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-800" />
              <span>Articles</span>
            </button>

            {/* 2. Gift Guides */}
            <button
              type="button"
              onClick={() => onNavigate('dashboard', 'gift_guide')}
              className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                (currentView === 'dashboard' && dashboardTab === 'gift_guide') ||
                ((currentView === 'workspace' || currentView === 'editorial_development') && activeProject?.type === 'gift_guide')
                  ? 'bg-[#eae4d7] text-[#1e232a] font-semibold shadow-2xs'
                  : 'text-[#615a50] hover:text-[#1e232a] hover:bg-[#efebe2]'
              }`}
            >
              <Gift className="w-3.5 h-3.5 text-amber-800" />
              <span>Gift Guides</span>
            </button>

            {/* 3. Product Copies */}
            <button
              type="button"
              onClick={() => onNavigate('dashboard', 'product_copy')}
              className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                (currentView === 'dashboard' && dashboardTab === 'product_copy') ||
                ((currentView === 'workspace' || currentView === 'editorial_development') && activeProject?.type === 'product_copy')
                  ? 'bg-[#eae4d7] text-[#1e232a] font-semibold shadow-2xs'
                  : 'text-[#615a50] hover:text-[#1e232a] hover:bg-[#efebe2]'
              }`}
            >
              <Tag className="w-3.5 h-3.5 text-emerald-800" />
              <span>Product Copies</span>
            </button>

            {/* 4. Library Dropdown Menu (Style Reference, Internal Links, Research Library, Data & Backup) */}
            <div className="relative" ref={libraryMenuRef}>
              <button
                type="button"
                onClick={() => setIsLibraryMenuOpen(!isLibraryMenuOpen)}
                className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                  isLibraryActive
                    ? 'bg-[#eae4d7] text-[#1e232a] font-semibold shadow-2xs'
                    : 'text-[#615a50] hover:text-[#1e232a] hover:bg-[#efebe2]'
                }`}
              >
                <Library className="w-3.5 h-3.5 text-amber-900" />
                <span>Library</span>
                <ChevronDown className="w-3 h-3 text-[#787166]" />
              </button>

              {isLibraryMenuOpen && (
                <div className="absolute left-0 mt-1.5 w-56 bg-white border border-[#dcd6ca] rounded-xl shadow-xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8a8275] border-b border-[#f0ede6] mb-1">
                    Editorial Resources
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLibraryMenuOpen(false);
                      onNavigate('style_reference');
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-[#f6f3eb] flex items-center gap-2.5 ${
                      currentView === 'style_reference' ? 'bg-[#faf8f4] font-semibold text-[#1e232a]' : 'text-[#2b251d]'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 text-amber-900" />
                    <div>
                      <div className="leading-tight">Style Reference</div>
                      <div className="text-[10px] text-[#736c61]">Voice profiles & writing samples</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsLibraryMenuOpen(false);
                      onNavigate('internal_links');
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-[#f6f3eb] flex items-center gap-2.5 ${
                      currentView === 'internal_links' ? 'bg-[#faf8f4] font-semibold text-[#1e232a]' : 'text-[#2b251d]'
                    }`}
                  >
                    <Link2 className="w-4 h-4 text-blue-800" />
                    <div>
                      <div className="leading-tight">Internal Links</div>
                      <div className="text-[10px] text-[#736c61]">Publication link repository</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsLibraryMenuOpen(false);
                      onNavigate('research');
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-[#f6f3eb] flex items-center gap-2.5 ${
                      currentView === 'research' ? 'bg-[#faf8f4] font-semibold text-[#1e232a]' : 'text-[#2b251d]'
                    }`}
                  >
                    <BookOpen className="w-4 h-4 text-amber-900" />
                    <div>
                      <div className="leading-tight">Research Library</div>
                      <div className="text-[10px] text-[#736c61]">Empirical studies & claims</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsLibraryMenuOpen(false);
                      onNavigate('backup');
                    }}
                    className={`w-full px-3 py-2 text-left hover:bg-[#f6f3eb] flex items-center gap-2.5 ${
                      currentView === 'backup' ? 'bg-[#faf8f4] font-semibold text-[#1e232a]' : 'text-[#2b251d]'
                    }`}
                  >
                    <Database className="w-4 h-4 text-emerald-800" />
                    <div>
                      <div className="leading-tight">Data & Backup</div>
                      <div className="text-[10px] text-[#736c61]">Portable ZIP archives & restore</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* 5. Idea Generator */}
            <button
              type="button"
              onClick={() => onNavigate('idea_generator')}
              className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                currentView === 'idea_generator'
                  ? 'bg-[#eae4d7] text-[#1e232a] font-semibold shadow-2xs'
                  : 'text-[#615a50] hover:text-[#1e232a] hover:bg-[#efebe2]'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5 text-amber-700" />
              <span>Idea Generator</span>
            </button>

            {/* 6. Settings */}
            <button
              type="button"
              onClick={() => onNavigate('settings')}
              className={`px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1.5 ${
                currentView === 'settings'
                  ? 'bg-[#eae4d7] text-[#1e232a] font-semibold shadow-2xs'
                  : 'text-[#615a50] hover:text-[#1e232a] hover:bg-[#efebe2]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Right: Cloud Sync, New Draft Creation & Mobile Menu Button */}
        <div className="flex items-center gap-2.5">
          <CloudSyncBar />
          {/* Quick Create Dropdown */}
          <div className="relative" ref={newMenuRef}>
            <button
              type="button"
              onClick={() => setIsNewMenuOpen(!isNewMenuOpen)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs select-none"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Draft</span>
              <ChevronDown className="w-3 h-3 text-[#dcd6ca]" />
            </button>

            {isNewMenuOpen && (
              <div
                className="absolute right-0 mt-1.5 w-52 bg-white border border-[#dcd6ca] rounded-xl shadow-xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                onClick={() => setIsNewMenuOpen(false)}
              >
                <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8a8275] border-b border-[#f0ede6] mb-1">
                  Create Content
                </div>
                <button
                  type="button"
                  onClick={() => onCreateProject('article')}
                  className="w-full px-3 py-2 text-left hover:bg-[#f6f3eb] flex items-center gap-2.5 text-[#1e232a]"
                >
                  <FileText className="w-4 h-4 text-blue-700" />
                  <div>
                    <div className="font-semibold">Editorial Article</div>
                    <div className="text-[10px] text-[#736c61]">In-depth craft & gift essay</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onCreateProject('gift_guide')}
                  className="w-full px-3 py-2 text-left hover:bg-[#f6f3eb] flex items-center gap-2.5 text-[#1e232a]"
                >
                  <Gift className="w-4 h-4 text-amber-700" />
                  <div>
                    <div className="font-semibold">Curated Gift Guide</div>
                    <div className="text-[10px] text-[#736c61]">Structured product collection</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onCreateProject('product_copy')}
                  className="w-full px-3 py-2 text-left hover:bg-[#f6f3eb] flex items-center gap-2.5 text-[#1e232a]"
                >
                  <Tag className="w-4 h-4 text-emerald-700" />
                  <div>
                    <div className="font-semibold">Product Copy</div>
                    <div className="text-[10px] text-[#736c61]">Material & bench specifications</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-1.5 text-[#5c5447] hover:text-[#1e232a] rounded-md lg:hidden hover:bg-[#eae4d7]"
            title="Navigation Menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* TIER 2A: EDITORIAL DEVELOPMENT WORKSPACE TOOLBAR                          */}
      {/* ========================================================================= */}
      {currentView === 'editorial_development' && activeProject && (
        <div className="bg-[#ede8dc] border-b border-[#ded7ca] px-3 sm:px-4 md:px-6 py-2 animate-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-1.5 lg:gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => onNavigate('dashboard', activeProject.type)}
                className="text-xs font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded hover:bg-[#e2dcce] transition-colors"
                title={`Back to ${getBackLabel()}`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{getBackLabel()}</span>
              </button>

              <span className="text-[#c7bfaf] select-none shrink-0 hidden lg:inline">•</span>

              <div className="px-2 lg:px-2.5 py-0.5 bg-white/80 border border-[#dcd6ca] rounded-md shadow-2xs shrink-0 select-none">
                {getSaveIndicator()}
              </div>

              <button
                type="button"
                onClick={onManualSave}
                disabled={isSavingInFlight}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shrink-0 select-none cursor-pointer disabled:opacity-50 ${
                  saveStatus === 'unsaved' || saveStatus === 'cloud_save_failed'
                    ? 'bg-[#1e232a] text-white hover:bg-[#2d3744] shadow-2xs'
                    : 'bg-white/80 border border-[#dcd6ca] text-[#2b251d] hover:bg-white'
                }`}
                title="Save development progress and create version history entry (Ctrl/Cmd + S)"
              >
                <Save className={`w-3.5 h-3.5 ${saveStatus === 'unsaved' || saveStatus === 'cloud_save_failed' ? 'text-amber-300' : 'text-amber-800'}`} />
                <span>Save</span>
              </button>
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden px-1">
              <span className="text-[#c7bfaf] select-none shrink-0 hidden lg:inline">•</span>
              <span className="px-2 py-0.5 rounded bg-amber-100/90 border border-amber-300/80 text-[10px] font-bold uppercase tracking-wider text-amber-950 shrink-0 hidden sm:inline-flex items-center gap-1">
                <Compass className="w-3 h-3 text-amber-800" />
                Editorial Development
              </span>
              <span
                className="font-editorial text-sm font-bold text-[#1e232a] truncate min-w-0 flex-1"
                title={activeProject.title || 'Untitled Draft'}
              >
                {activeProject.title || 'Untitled Draft'}
              </span>
            </div>

            {onOpenArticleEditor && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onOpenArticleEditor}
                  className="px-2.5 py-1 rounded-md text-xs font-semibold text-[#1e232a] bg-white/90 hover:bg-white border border-[#dcd6ca] transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Switch to the Article Writing & Editing Workspace"
                >
                  <FileText className="w-3.5 h-3.5 text-blue-800" />
                  <span className="hidden sm:inline">Article Editor</span>
                  <span className="sm:hidden">Editor</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TIER 2B: CONTEXTUAL PROJECT TOOLBAR (Appears ONLY in Article/Guide Editor)*/}
      {/* ========================================================================= */}
      {currentView === 'workspace' && activeProject && (
        <div className="bg-[#ede8dc] border-b border-[#ded7ca] px-3 sm:px-4 md:px-6 py-2 animate-in slide-in-from-top-1 duration-150">
          {/* Mobile Tier 2 Layout (< 768px): Single compact row with Back link, Truncated Title, Save Status, and Tools bottom sheet trigger */}
          <div className="flex items-center justify-between gap-2 md:hidden min-w-0">
            <button
              type="button"
              onClick={() => onNavigate('dashboard', activeProject.type)}
              className="text-xs font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 shrink-0 px-2 py-1.5 rounded-md hover:bg-[#e2dcce] transition-colors min-h-[36px]"
              title={`Back to ${getBackLabel()}`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="text-xs">{getBackLabel()}</span>
            </button>

            {/* Title centered/truncated */}
            <span
              className="font-editorial text-sm font-bold text-[#1e232a] truncate min-w-0 flex-1 text-center px-1"
              title={activeProject.title || 'Untitled Draft'}
            >
              {activeProject.title || 'Untitled Draft'}
            </span>

            {/* Save Status & Save Button (Mobile) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="px-2 py-1 bg-white/90 border border-[#dcd6ca] rounded-md shadow-2xs shrink-0 select-none min-h-[32px] flex items-center text-xs">
                {getSaveIndicator()}
              </div>
              <button
                type="button"
                onClick={onManualSave}
                disabled={isSavingInFlight}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors inline-flex items-center gap-1 min-h-[32px] cursor-pointer disabled:opacity-50 ${
                  saveStatus === 'unsaved' || saveStatus === 'cloud_save_failed'
                    ? 'bg-[#1e232a] text-white hover:bg-[#2d3744] shadow-2xs'
                    : 'bg-white/90 border border-[#dcd6ca] text-[#2b251d] hover:bg-white'
                }`}
                title="Save changes and record version checkpoint (Ctrl/Cmd + S)"
              >
                <Save className="w-3.5 h-3.5 text-amber-500" />
                <span>Save</span>
              </button>
            </div>

            {/* Tools Bottom Sheet Trigger */}
            <div className="relative shrink-0" ref={panelsMenuRef}>
              <button
                type="button"
                onClick={() => setIsPanelsMenuOpen((prev) => !prev)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors inline-flex items-center gap-1 min-h-[36px] border cursor-pointer ${
                  activePanel !== null
                    ? 'bg-amber-100 border-amber-300 text-amber-950 font-bold'
                    : 'bg-white/90 border-[#dcd6ca] text-[#2b251d] hover:bg-white shadow-2xs'
                }`}
                title="Project Tools & Panels"
              >
                <MoreHorizontal className="w-4 h-4 text-amber-900" />
                <span>Tools</span>
                <ChevronDown className={`w-3 h-3 text-[#787166] transition-transform ${isPanelsMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Mobile Full-Width Bottom Sheet Menu (< 768px) */}
              {isPanelsMenuOpen && (
                <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:hidden animate-in fade-in duration-150">
                  <div
                    className="w-full bg-[#faf9f6] rounded-t-2xl border-t border-[#dcd6ca] shadow-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Header */}
                    <div className="px-4 py-3 bg-[#ede8dc] border-b border-[#dcd6ca] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-amber-900" />
                        <span className="font-editorial text-sm font-bold text-[#1e232a]">Project Tools & Panels</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsPanelsMenuOpen(false)}
                        className="p-1 rounded-md text-[#615a50] hover:text-[#1e232a] hover:bg-[#e2dcce]"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Scrollable Panel Destinations */}
                    <div className="p-4 space-y-4 overflow-y-auto text-xs flex-1 pb-safe">
                      {/* Section 1: Writing & Workflow */}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a8275] mb-2 px-1">
                          Writing & Workflow
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {activeProject.type === 'article' && onOpenEditorialDevelopment && (
                            <button
                              type="button"
                              onClick={() => {
                                setIsPanelsMenuOpen(false);
                                onOpenEditorialDevelopment();
                              }}
                              className="col-span-2 p-2.5 rounded-xl border bg-amber-50/80 border-amber-300 text-[#1e232a] hover:bg-amber-100 text-left flex items-start gap-2 transition-colors"
                            >
                              <Compass className="w-4 h-4 shrink-0 text-amber-800" />
                              <div>
                                <div className="font-semibold">Editorial Development Workspace</div>
                                <div className="text-[10px] text-[#736c61]">Idea, 5 Angles, Brief, Outline & Prompt</div>
                              </div>
                            </button>
                          )}

                          {activeProject.type !== 'article' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setIsPanelsMenuOpen(false);
                                  handlePanelToggle('outline');
                                }}
                                className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                                  activePanel === 'outline'
                                    ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                    : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                                }`}
                              >
                                <ListOrdered className={`w-4 h-4 shrink-0 ${activePanel === 'outline' ? 'text-blue-300' : 'text-blue-800'}`} />
                                <div>
                                  <div className="font-semibold">Outline</div>
                                  <div className={`text-[10px] ${activePanel === 'outline' ? 'text-blue-200' : 'text-[#736c61]'}`}>Content steps</div>
                                </div>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setIsPanelsMenuOpen(false);
                                  handlePanelToggle('draft_package');
                                }}
                                className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                                  activePanel === 'draft_package'
                                    ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                    : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                                }`}
                              >
                                <Sparkles className={`w-4 h-4 shrink-0 ${activePanel === 'draft_package' ? 'text-amber-300' : 'text-emerald-700'}`} />
                                <div>
                                  <div className="font-semibold">Draft Package</div>
                                  <div className={`text-[10px] ${activePanel === 'draft_package' ? 'text-amber-200' : 'text-[#736c61]'}`}>Export to LLM</div>
                                </div>
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setIsPanelsMenuOpen(false);
                              handlePanelToggle('brief');
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                              activePanel === 'brief'
                                ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <Sliders className={`w-4 h-4 shrink-0 ${activePanel === 'brief' ? 'text-amber-300' : 'text-amber-800'}`} />
                            <div>
                              <div className="font-semibold">Project Brief</div>
                              <div className={`text-[10px] ${activePanel === 'brief' ? 'text-amber-200' : 'text-[#736c61]'}`}>Goals & audience</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsPanelsMenuOpen(false);
                              handlePanelToggle('links');
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                              activePanel === 'links'
                                ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <Link2 className={`w-4 h-4 shrink-0 ${activePanel === 'links' ? 'text-blue-300' : 'text-blue-800'}`} />
                            <div>
                              <div className="font-semibold">Internal Links</div>
                              <div className={`text-[10px] ${activePanel === 'links' ? 'text-blue-200' : 'text-[#736c61]'}`}>Linking studio</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsPanelsMenuOpen(false);
                              handlePanelToggle('citations');
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                              activePanel === 'citations'
                                ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <BookOpen className={`w-4 h-4 shrink-0 ${activePanel === 'citations' ? 'text-amber-300' : 'text-amber-900'}`} />
                            <div>
                              <div className="font-semibold">Citation Studio</div>
                              <div className={`text-[10px] ${activePanel === 'citations' ? 'text-amber-200' : 'text-[#736c61]'}`}>In-text citations</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsPanelsMenuOpen(false);
                              handlePanelToggle('review');
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                              activePanel === 'review'
                                ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <ShieldCheck className={`w-4 h-4 shrink-0 ${activePanel === 'review' ? 'text-amber-300' : 'text-amber-700'}`} />
                            <div>
                              <div className="font-semibold">AI Review</div>
                              <div className={`text-[10px] ${activePanel === 'review' ? 'text-amber-200' : 'text-[#736c61]'}`}>Audit & critique</div>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Section 2: Controls & Rules */}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a8275] mb-2 px-1">
                          Controls & Governance
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsPanelsMenuOpen(false);
                              handlePanelToggle('controls');
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                              activePanel === 'controls'
                                ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <Sparkles className={`w-4 h-4 shrink-0 ${activePanel === 'controls' ? 'text-amber-300' : 'text-amber-700'}`} />
                            <div>
                              <div className="font-semibold">Writing Controls</div>
                              <div className={`text-[10px] ${activePanel === 'controls' ? 'text-amber-200' : 'text-[#736c61]'}`}>Tone & style</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsPanelsMenuOpen(false);
                              handlePanelToggle('rules');
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                              activePanel === 'rules'
                                ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <Scale className={`w-4 h-4 shrink-0 ${activePanel === 'rules' ? 'text-purple-300' : 'text-purple-700'}`} />
                            <div>
                              <div className="font-semibold">Content Rules</div>
                              <div className={`text-[10px] ${activePanel === 'rules' ? 'text-purple-200' : 'text-[#736c61]'}`}>Forbidden terms</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsPanelsMenuOpen(false);
                              handlePanelToggle('instructions');
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                              activePanel === 'instructions'
                                ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <FileText className={`w-4 h-4 shrink-0 ${activePanel === 'instructions' ? 'text-amber-300' : 'text-amber-700'}`} />
                            <div>
                              <div className="font-semibold">Instructions</div>
                              <div className={`text-[10px] ${activePanel === 'instructions' ? 'text-amber-200' : 'text-[#736c61]'}`}>Draft notes</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsPanelsMenuOpen(false);
                              handlePanelToggle('research');
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                              activePanel === 'research'
                                ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <BookOpen className={`w-4 h-4 shrink-0 ${activePanel === 'research' ? 'text-amber-300' : 'text-amber-700'}`} />
                            <div>
                              <div className="font-semibold">Research</div>
                              <div className={`text-[10px] ${activePanel === 'research' ? 'text-amber-200' : 'text-[#736c61]'}`}>Attached studies</div>
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Section 3: Quality & History */}
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a8275] mb-2 px-1">
                          Quality & History
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setIsPanelsMenuOpen(false);
                              handlePanelToggle('qc');
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                              activePanel === 'qc'
                                ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <ClipboardCheck className={`w-4 h-4 shrink-0 ${activePanel === 'qc' ? 'text-emerald-300' : 'text-emerald-700'}`} />
                            <div>
                              <div className="font-semibold">Quality Control</div>
                              <div className={`text-[10px] ${activePanel === 'qc' ? 'text-emerald-200' : 'text-[#736c61]'}`}>Readiness audit</div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setIsPanelsMenuOpen(false);
                              handlePanelToggle('history');
                            }}
                            className={`p-2.5 rounded-xl border text-left flex items-start gap-2 transition-colors ${
                              activePanel === 'history'
                                ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                                : 'bg-white border-[#dcd6ca] text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <History className={`w-4 h-4 shrink-0 ${activePanel === 'history' ? 'text-blue-300' : 'text-blue-700'}`} />
                            <div>
                              <div className="font-semibold">History</div>
                              <div className={`text-[10px] ${activePanel === 'history' ? 'text-blue-200' : 'text-[#736c61]'}`}>Version snapshots</div>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Desktop & Laptop Tier 2 Layout (>= 768px; mobile < 768px layout above is untouched) */}
          <div className="hidden md:flex items-center justify-between gap-2 lg:gap-3 min-w-0">
            {/* Left Fixed Controls: Back Link, Save Status, Explicit Save Button (shrink-0 so never obscured) */}
            <div className="flex items-center gap-1.5 lg:gap-2.5 shrink-0">
              {/* Back to Project Category in Dashboard */}
              <button
                type="button"
                onClick={() => onNavigate('dashboard', activeProject.type)}
                className="text-xs font-semibold text-[#5c5447] hover:text-[#1e232a] inline-flex items-center gap-1 shrink-0 px-2 py-1 rounded hover:bg-[#e2dcce] transition-colors"
                title={`Back to ${getBackLabel()}`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{getBackLabel()}</span>
              </button>

              <span className="text-[#c7bfaf] select-none shrink-0 hidden lg:inline">•</span>

              {/* Save Status Indicator */}
              <div className="px-2 lg:px-2.5 py-0.5 bg-white/80 border border-[#dcd6ca] rounded-md shadow-2xs shrink-0 select-none">
                {getSaveIndicator()}
              </div>

              {/* Explicit Manual Save Button */}
              <button
                type="button"
                onClick={onManualSave}
                disabled={isSavingInFlight}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors inline-flex items-center gap-1.5 shrink-0 select-none cursor-pointer disabled:opacity-50 ${
                  saveStatus === 'unsaved' || saveStatus === 'cloud_save_failed'
                    ? 'bg-[#1e232a] text-white hover:bg-[#2d3744] shadow-2xs'
                    : 'bg-white/80 border border-[#dcd6ca] text-[#2b251d] hover:bg-white'
                }`}
                title="Save article and create version history entry (Ctrl/Cmd + S)"
              >
                <Save className={`w-3.5 h-3.5 ${saveStatus === 'unsaved' || saveStatus === 'cloud_save_failed' ? 'text-amber-300' : 'text-amber-800'}`} />
                <span>Save</span>
              </button>
            </div>

            {/* Project Title: Visible where space permits, truncates gracefully without pushing or overlapping Save */}
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <span className="text-[#c7bfaf] select-none shrink-0 hidden lg:inline">•</span>
              <span
                className="font-editorial text-sm font-bold text-[#1e232a] truncate min-w-0 flex-1"
                title={activeProject.title || 'Untitled Draft'}
              >
                {activeProject.title || 'Untitled Draft'}
              </span>
            </div>

            {/* Right: Mutually Exclusive Project Drawer Controls */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-0.5 lg:gap-1 bg-white/60 p-0.5 rounded-lg border border-[#dcd6ca] text-xs font-medium text-[#4a443b]">
                {/* Secondary items inline only on wide desktop (2xl+); moved into More dropdown on narrower desktop/laptop */}
                {/* Brief */}
                <button
                  type="button"
                  onClick={() => handlePanelToggle('brief')}
                  className={`hidden 2xl:inline-flex px-2.5 py-1 rounded-md transition-colors items-center gap-1 select-none cursor-pointer ${
                    activePanel === 'brief'
                      ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                      : 'hover:bg-white hover:text-[#1e232a]'
                  }`}
                  title="Project Brief"
                >
                  <Compass
                    className={`w-3.5 h-3.5 ${
                      activePanel === 'brief' ? 'text-amber-300' : 'text-amber-800'
                    }`}
                  />
                  <span>Brief</span>
                </button>

                {/* Non-article projects keep Outline & Draft Package inline on 2xl+; Article projects use the dedicated Editorial Development Workspace */}
                {activeProject.type !== 'article' && (
                  <>
                    <button
                      type="button"
                      onClick={() => handlePanelToggle('outline')}
                      className={`hidden 2xl:inline-flex px-2.5 py-1 rounded-md transition-colors items-center gap-1 select-none cursor-pointer ${
                        activePanel === 'outline'
                          ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                          : 'hover:bg-white hover:text-[#1e232a]'
                      }`}
                      title="Content Outline"
                    >
                      <ListOrdered
                        className={`w-3.5 h-3.5 ${
                          activePanel === 'outline' ? 'text-blue-300' : 'text-blue-800'
                        }`}
                      />
                      <span>Outline</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handlePanelToggle('draft_package')}
                      className={`hidden 2xl:inline-flex px-2.5 py-1 rounded-md transition-colors items-center gap-1 select-none cursor-pointer ${
                        activePanel === 'draft_package'
                          ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                          : 'hover:bg-white hover:text-[#1e232a]'
                      }`}
                      title="Editorial Draft Package"
                    >
                      <Sparkles
                        className={`w-3.5 h-3.5 ${
                          activePanel === 'draft_package' ? 'text-amber-300' : 'text-emerald-700'
                        }`}
                      />
                      <span>Draft Package</span>
                    </button>
                  </>
                )}

                {/* Controls */}
                <button
                  type="button"
                  onClick={() => handlePanelToggle('controls')}
                  className={`hidden 2xl:inline-flex px-2.5 py-1 rounded-md transition-colors items-center gap-1 select-none cursor-pointer ${
                    activePanel === 'controls'
                      ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                      : 'hover:bg-white hover:text-[#1e232a]'
                  }`}
                  title="Writing Controls & Tone"
                >
                  <Sparkles
                    className={`w-3.5 h-3.5 ${
                      activePanel === 'controls' ? 'text-amber-300' : 'text-amber-700'
                    }`}
                  />
                  <span>Controls</span>
                </button>

                {/* Rules */}
                <button
                  type="button"
                  onClick={() => handlePanelToggle('rules')}
                  className={`hidden 2xl:inline-flex px-2.5 py-1 rounded-md transition-colors items-center gap-1 select-none cursor-pointer ${
                    activePanel === 'rules'
                      ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                      : 'hover:bg-white hover:text-[#1e232a]'
                  }`}
                  title="Content Rules & Hard Constraints"
                >
                  <Scale
                    className={`w-3.5 h-3.5 ${
                      activePanel === 'rules' ? 'text-purple-300' : 'text-purple-800'
                    }`}
                  />
                  <span>Rules</span>
                </button>

                {/* Instructions */}
                <button
                  type="button"
                  onClick={() => handlePanelToggle('instructions')}
                  className={`hidden 2xl:inline-flex px-2.5 py-1 rounded-md transition-colors items-center gap-1 select-none cursor-pointer ${
                    activePanel === 'instructions'
                      ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                      : 'hover:bg-white hover:text-[#1e232a]'
                  }`}
                  title="Project Instructions"
                >
                  <FileText
                    className={`w-3.5 h-3.5 ${
                      activePanel === 'instructions' ? 'text-amber-300' : 'text-amber-800'
                    }`}
                  />
                  <span>Instructions</span>
                </button>

                {/* Priority Item: Links (Always directly visible on >= 768px) */}
                <button
                  type="button"
                  onClick={() => handlePanelToggle('links')}
                  className={`px-2 lg:px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 select-none cursor-pointer ${
                    activePanel === 'links'
                      ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                      : 'hover:bg-white hover:text-[#1e232a]'
                  }`}
                  title="Editorial Internal Link Opportunities"
                >
                  <Link2
                    className={`w-3.5 h-3.5 ${
                      activePanel === 'links' ? 'text-blue-300' : 'text-blue-800'
                    }`}
                  />
                  <span>Links</span>
                </button>

                {/* Priority Item: Research (Always directly visible on >= 768px) */}
                <button
                  type="button"
                  onClick={() => handlePanelToggle('research')}
                  className={`px-2 lg:px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 select-none relative cursor-pointer ${
                    activePanel === 'research'
                      ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                      : 'hover:bg-white hover:text-[#1e232a]'
                  }`}
                  title="Attached Research Studies & Claims"
                >
                  <BookOpen
                    className={`w-3.5 h-3.5 ${
                      activePanel === 'research' ? 'text-amber-300' : 'text-amber-800'
                    }`}
                  />
                  <span>Research</span>
                  {activeProject.attachedStudyIds && activeProject.attachedStudyIds.length > 0 && (
                    <span
                      className={`px-1 py-0.2 rounded-full text-[10px] font-bold ${
                        activePanel === 'research'
                          ? 'bg-amber-800 text-amber-100'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}
                    >
                      {activeProject.attachedStudyIds.length}
                    </span>
                  )}
                </button>

                {/* Priority Item: Review (Always directly visible on >= 768px) */}
                <button
                  type="button"
                  onClick={() => handlePanelToggle('review')}
                  className={`px-2 lg:px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 select-none relative cursor-pointer ${
                    activePanel === 'review'
                      ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                      : 'hover:bg-white hover:text-[#1e232a]'
                  }`}
                  title="AI Editorial Review & Critique"
                >
                  <ShieldCheck
                    className={`w-3.5 h-3.5 ${
                      activePanel === 'review' ? 'text-amber-300' : 'text-amber-700'
                    }`}
                  />
                  <span>Review</span>
                  {activeProject.editorialReview &&
                    activeProject.editorialReview.findings.filter((f) => f.status === 'pending')
                      .length > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    )}
                </button>

                {/* Priority Item: Quality Control (Always directly visible on >= 768px) */}
                <button
                  type="button"
                  onClick={() => handlePanelToggle('qc')}
                  className={`px-2 lg:px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 select-none relative cursor-pointer ${
                    activePanel === 'qc'
                      ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                      : 'hover:bg-white hover:text-[#1e232a]'
                  }`}
                  title="Systematic Quality Control & Readiness Audit"
                >
                  <ClipboardCheck
                    className={`w-3.5 h-3.5 ${
                      activePanel === 'qc' ? 'text-emerald-300' : 'text-emerald-700'
                    }`}
                  />
                  <span>Quality</span>
                  {activeProject.qualityControl && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        activeProject.qualityControl.status === 'ready'
                          ? 'bg-emerald-500'
                          : activeProject.qualityControl.status === 'action_required'
                          ? 'bg-rose-500'
                          : 'bg-amber-500'
                      }`}
                    ></span>
                  )}
                </button>

                {/* Version History (Inline on 2xl+, inside More dropdown below 2xl) */}
                <button
                  type="button"
                  onClick={() => handlePanelToggle('history')}
                  className={`hidden 2xl:inline-flex px-2.5 py-1 rounded-md transition-colors items-center gap-1 select-none relative cursor-pointer ${
                    activePanel === 'history'
                      ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                      : 'hover:bg-white hover:text-[#1e232a]'
                  }`}
                  title="Version History & Revision Snapshots"
                >
                  <History
                    className={`w-3.5 h-3.5 ${
                      activePanel === 'history' ? 'text-indigo-300' : 'text-indigo-700'
                    }`}
                  />
                  <span>History</span>
                  {activeProject.versionHistory && activeProject.versionHistory.length > 0 && (
                    <span className="text-[10px] opacity-75 font-mono">
                      ({activeProject.versionHistory.length})
                    </span>
                  )}
                </button>

                {/* More Dropdown for Secondary Navigation Items on Laptop/Narrow Desktop (< 2xl) */}
                <div className="relative 2xl:hidden" ref={moreMenuRef}>
                  {(() => {
                    const isSecondaryActive =
                      activePanel === 'develop' ||
                      activePanel === 'brief' ||
                      activePanel === 'outline' ||
                      activePanel === 'draft_package' ||
                      activePanel === 'controls' ||
                      activePanel === 'rules' ||
                      activePanel === 'instructions' ||
                      activePanel === 'history';
                    return (
                      <button
                        type="button"
                        onClick={() => setIsMoreMenuOpen((prev) => !prev)}
                        aria-expanded={isMoreMenuOpen}
                        aria-haspopup="menu"
                        className={`px-2 lg:px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 select-none cursor-pointer ${
                          isSecondaryActive
                            ? 'bg-[#1e232a] text-white shadow-2xs font-semibold'
                            : isMoreMenuOpen
                            ? 'bg-white text-[#1e232a] shadow-2xs font-semibold'
                            : 'hover:bg-white hover:text-[#1e232a]'
                        }`}
                        title="More studio sections (Editorial Development, Brief, Controls, Rules, Instructions, History)"
                      >
                        <MoreHorizontal
                          className={`w-3.5 h-3.5 ${
                            isSecondaryActive ? 'text-amber-300' : 'text-[#5c5447]'
                          }`}
                        />
                        <span>More</span>
                        <ChevronDown
                          className={`w-3 h-3 transition-transform ${
                            isSecondaryActive ? 'text-amber-200' : 'text-[#787166]'
                          } ${isMoreMenuOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                    );
                  })()}

                  {isMoreMenuOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 mt-1.5 w-64 max-w-[calc(100vw-2rem)] bg-white border border-[#dcd6ca] rounded-xl shadow-xl py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100 max-h-[80vh] overflow-y-auto"
                    >
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#8a8275] border-b border-[#f0ede6] mb-1">
                        Studio Sections
                      </div>

                      {activeProject.type === 'article' && onOpenEditorialDevelopment && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsMoreMenuOpen(false);
                            onOpenEditorialDevelopment();
                          }}
                          className="w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer text-[#1e232a] bg-amber-50/60 hover:bg-amber-100/80 border-b border-[#f0ede6] mb-1"
                        >
                          <div className="flex items-center gap-2">
                            <Compass className="w-3.5 h-3.5 shrink-0 text-amber-800" />
                            <div>
                              <div className="font-semibold">Editorial Development</div>
                              <div className="text-[10px] text-[#736c61]">Angles, Brief, Outline & Prompt</div>
                            </div>
                          </div>
                        </button>
                      )}

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          handlePanelToggle('brief');
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          activePanel === 'brief'
                            ? 'bg-[#1e232a] text-white font-semibold'
                            : 'text-[#2b251d] hover:bg-[#f6f3eb]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Compass
                            className={`w-3.5 h-3.5 shrink-0 ${
                              activePanel === 'brief' ? 'text-amber-300' : 'text-amber-800'
                            }`}
                          />
                          <span>Brief</span>
                        </div>
                        {activePanel === 'brief' && (
                          <span className="text-[10px] text-amber-200 font-medium">Active</span>
                        )}
                      </button>

                      {activeProject.type !== 'article' && (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setIsMoreMenuOpen(false);
                              handlePanelToggle('outline');
                            }}
                            className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              activePanel === 'outline'
                                ? 'bg-[#1e232a] text-white font-semibold'
                                : 'text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <ListOrdered
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  activePanel === 'outline' ? 'text-blue-300' : 'text-blue-800'
                                }`}
                              />
                              <span>Outline</span>
                            </div>
                            {activeProject.outline && activeProject.outline.length > 0 && (
                              <span
                                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                                  activePanel === 'outline'
                                    ? 'bg-blue-800 text-blue-100'
                                    : 'bg-blue-50 text-blue-900 border border-blue-200'
                                }`}
                              >
                                {activeProject.outline.length}
                              </span>
                            )}
                          </button>

                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setIsMoreMenuOpen(false);
                              handlePanelToggle('draft_package');
                            }}
                            className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                              activePanel === 'draft_package'
                                ? 'bg-[#1e232a] text-white font-semibold'
                                : 'text-[#2b251d] hover:bg-[#f6f3eb]'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Sparkles
                                className={`w-3.5 h-3.5 shrink-0 ${
                                  activePanel === 'draft_package' ? 'text-amber-300' : 'text-emerald-700'
                                }`}
                              />
                              <span>Draft Package</span>
                            </div>
                            {activePanel === 'draft_package' && (
                              <span className="text-[10px] text-amber-200 font-medium">Active</span>
                            )}
                          </button>
                        </>
                      )}

                      <div className="border-t border-[#f0ede6] my-1"></div>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          handlePanelToggle('controls');
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          activePanel === 'controls'
                            ? 'bg-[#1e232a] text-white font-semibold'
                            : 'text-[#2b251d] hover:bg-[#f6f3eb]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Sparkles
                            className={`w-3.5 h-3.5 shrink-0 ${
                              activePanel === 'controls' ? 'text-amber-300' : 'text-amber-700'
                            }`}
                          />
                          <span>Controls</span>
                        </div>
                        {activePanel === 'controls' && (
                          <span className="text-[10px] text-amber-200 font-medium">Active</span>
                        )}
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          handlePanelToggle('rules');
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          activePanel === 'rules'
                            ? 'bg-[#1e232a] text-white font-semibold'
                            : 'text-[#2b251d] hover:bg-[#f6f3eb]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Scale
                            className={`w-3.5 h-3.5 shrink-0 ${
                              activePanel === 'rules' ? 'text-purple-300' : 'text-purple-800'
                            }`}
                          />
                          <span>Rules</span>
                        </div>
                        {activePanel === 'rules' && (
                          <span className="text-[10px] text-purple-200 font-medium">Active</span>
                        )}
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          handlePanelToggle('instructions');
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          activePanel === 'instructions'
                            ? 'bg-[#1e232a] text-white font-semibold'
                            : 'text-[#2b251d] hover:bg-[#f6f3eb]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <FileText
                            className={`w-3.5 h-3.5 shrink-0 ${
                              activePanel === 'instructions' ? 'text-amber-300' : 'text-amber-800'
                            }`}
                          />
                          <span>Instructions</span>
                        </div>
                        {activePanel === 'instructions' && (
                          <span className="text-[10px] text-amber-200 font-medium">Active</span>
                        )}
                      </button>

                      <div className="border-t border-[#f0ede6] my-1"></div>

                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsMoreMenuOpen(false);
                          handlePanelToggle('history');
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          activePanel === 'history'
                            ? 'bg-[#1e232a] text-white font-semibold'
                            : 'text-[#2b251d] hover:bg-[#f6f3eb]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <History
                            className={`w-3.5 h-3.5 shrink-0 ${
                              activePanel === 'history' ? 'text-indigo-300' : 'text-indigo-700'
                            }`}
                          />
                          <span>History</span>
                        </div>
                        {activeProject.versionHistory && activeProject.versionHistory.length > 0 && (
                          <span
                            className={`text-[10px] font-mono ${
                              activePanel === 'history' ? 'text-indigo-200' : 'text-[#736c61]'
                            }`}
                          >
                            ({activeProject.versionHistory.length})
                          </span>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MOBILE COLLAPSIBLE NAVIGATION DRAWER                                      */}
      {/* ========================================================================= */}
      {isMobileMenuOpen && (
        <div className="lg:hidden bg-[#f5f2ea] border-b border-[#e5dfd3] p-4 space-y-3 text-xs animate-in slide-in-from-top-2 duration-150 shadow-md">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a8275]">
            Global Destinations
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onNavigate('dashboard');
                setIsMobileMenuOpen(false);
              }}
              className={`min-h-[44px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                currentView === 'dashboard' && dashboardTab === 'all'
                  ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                  : 'bg-white border-[#dcd6ca] text-[#1e232a] hover:bg-[#ede8dc]'
              }`}
            >
              <LayoutDashboard className={`w-4 h-4 ${currentView === 'dashboard' && dashboardTab === 'all' ? 'text-amber-300' : 'text-[#5c5447]'}`} />
              <span>All Projects</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('dashboard', 'article');
                setIsMobileMenuOpen(false);
              }}
              className={`min-h-[44px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                (currentView === 'dashboard' && dashboardTab === 'article') ||
                ((currentView === 'workspace' || currentView === 'editorial_development') && activeProject?.type === 'article')
                  ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                  : 'bg-white border-[#dcd6ca] text-[#1e232a] hover:bg-[#ede8dc]'
              }`}
            >
              <FileText className={`w-4 h-4 ${(currentView === 'dashboard' && dashboardTab === 'article') || ((currentView === 'workspace' || currentView === 'editorial_development') && activeProject?.type === 'article') ? 'text-blue-300' : 'text-blue-800'}`} />
              <span>Articles</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('dashboard', 'gift_guide');
                setIsMobileMenuOpen(false);
              }}
              className={`min-h-[44px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                (currentView === 'dashboard' && dashboardTab === 'gift_guide') ||
                ((currentView === 'workspace' || currentView === 'editorial_development') && activeProject?.type === 'gift_guide')
                  ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                  : 'bg-white border-[#dcd6ca] text-[#1e232a] hover:bg-[#ede8dc]'
              }`}
            >
              <Gift className={`w-4 h-4 ${(currentView === 'dashboard' && dashboardTab === 'gift_guide') || ((currentView === 'workspace' || currentView === 'editorial_development') && activeProject?.type === 'gift_guide') ? 'text-amber-300' : 'text-amber-800'}`} />
              <span>Gift Guides</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('dashboard', 'product_copy');
                setIsMobileMenuOpen(false);
              }}
              className={`min-h-[44px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                (currentView === 'dashboard' && dashboardTab === 'product_copy') ||
                ((currentView === 'workspace' || currentView === 'editorial_development') && activeProject?.type === 'product_copy')
                  ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                  : 'bg-white border-[#dcd6ca] text-[#1e232a] hover:bg-[#ede8dc]'
              }`}
            >
              <Tag className={`w-4 h-4 ${(currentView === 'dashboard' && dashboardTab === 'product_copy') || ((currentView === 'workspace' || currentView === 'editorial_development') && activeProject?.type === 'product_copy') ? 'text-emerald-300' : 'text-emerald-800'}`} />
              <span>Product Copies</span>
            </button>
          </div>

          <div className="text-[10px] font-bold uppercase tracking-wider text-[#8a8275] pt-2 border-t border-[#e5dfd3]">
            Library & Settings
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onNavigate('research');
                setIsMobileMenuOpen(false);
              }}
              className={`min-h-[44px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                currentView === 'research'
                  ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                  : 'bg-white border-[#dcd6ca] text-[#1e232a] hover:bg-[#ede8dc]'
              }`}
            >
              <BookOpen className={`w-4 h-4 ${currentView === 'research' ? 'text-amber-300' : 'text-amber-800'}`} />
              <span>Research Library</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('style_reference');
                setIsMobileMenuOpen(false);
              }}
              className={`min-h-[44px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                currentView === 'style_reference'
                  ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                  : 'bg-white border-[#dcd6ca] text-[#1e232a] hover:bg-[#ede8dc]'
              }`}
            >
              <BookOpen className={`w-4 h-4 ${currentView === 'style_reference' ? 'text-amber-300' : 'text-amber-800'}`} />
              <span>Style Reference</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('internal_links');
                setIsMobileMenuOpen(false);
              }}
              className={`min-h-[44px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                currentView === 'internal_links'
                  ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                  : 'bg-white border-[#dcd6ca] text-[#1e232a] hover:bg-[#ede8dc]'
              }`}
            >
              <Link2 className={`w-4 h-4 ${currentView === 'internal_links' ? 'text-blue-300' : 'text-blue-800'}`} />
              <span>Internal Links</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('idea_generator');
                setIsMobileMenuOpen(false);
              }}
              className={`col-span-2 min-h-[44px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                currentView === 'idea_generator'
                  ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                  : 'bg-white border-[#dcd6ca] text-[#1e232a] hover:bg-[#ede8dc]'
              }`}
            >
              <Lightbulb className={`w-4 h-4 ${currentView === 'idea_generator' ? 'text-amber-300' : 'text-amber-700'}`} />
              <div className="flex-1">
                <div>Idea Generator & Shelf</div>
                <div className={`text-[10px] ${currentView === 'idea_generator' ? 'text-amber-200' : 'text-[#736c61]'}`}>Uncover high-intent article concepts</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('backup');
                setIsMobileMenuOpen(false);
              }}
              className={`col-span-2 min-h-[44px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                currentView === 'backup'
                  ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                  : 'bg-white border-[#dcd6ca] text-[#1e232a] hover:bg-[#ede8dc]'
              }`}
            >
              <Database className={`w-4 h-4 ${currentView === 'backup' ? 'text-emerald-300' : 'text-emerald-800'}`} />
              <div className="flex-1">
                <div>Data Persistence & Backup</div>
                <div className={`text-[10px] ${currentView === 'backup' ? 'text-emerald-200' : 'text-[#736c61]'}`}>Export portable ZIPs, restore & snapshots</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                onNavigate('settings');
                setIsMobileMenuOpen(false);
              }}
              className={`col-span-2 min-h-[44px] p-2.5 rounded-lg border text-left flex items-center gap-2.5 transition-colors ${
                currentView === 'settings'
                  ? 'bg-[#1e232a] text-white border-[#1e232a] font-semibold'
                  : 'bg-white border-[#dcd6ca] text-[#1e232a] hover:bg-[#ede8dc]'
              }`}
            >
              <Sliders className={`w-4 h-4 ${currentView === 'settings' ? 'text-amber-300' : 'text-[#5c5447]'}`} />
              <div className="flex-1">
                <div>Studio Settings & Constitution</div>
                <div className={`text-[10px] ${currentView === 'settings' ? 'text-amber-200' : 'text-[#736c61]'}`}>Global writing guidelines & model defaults</div>
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
