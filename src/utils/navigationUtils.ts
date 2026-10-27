/**
 * Science of Gifts - Content Navigation & Grid Routing Utilities
 * Stage 1: Pure functional helpers for global navigation, library grid filtering, and view state transitions.
 */

import { ProjectType, WritingProject, ProjectStatus } from '../types/project';
import { extractPlainTextFromHtml } from './richText';

export type AppNavView =
  | 'dashboard'
  | 'settings'
  | 'style_reference'
  | 'internal_links'
  | 'idea_generator'
  | 'backup'
  | 'research';

export type AppView =
  | 'dashboard'
  | 'workspace'
  | 'editorial_development'
  | 'settings'
  | 'style_reference'
  | 'internal_links'
  | 'idea_generator'
  | 'backup'
  | 'research';

export interface NavigationTransitionResult {
  nextView: AppView;
  nextDashboardTab: ProjectType | 'all';
  /**
   * Under Stage 1 specifications, navigating to a library grid MUST NOT switch to workspace
   * or auto-open the last-edited project.
   */
  shouldSwitchToWorkspace: false;
  /**
   * Under Stage 1 specifications, navigating to a library grid MUST NOT auto-create a project.
   */
  shouldCreateProject: false;
}

/**
 * Resolves destination view and dashboard tab for global navigation clicks.
 * Guarantees that Articles, Gift Guides, and Product Copies always route to their respective
 * library grids on the dashboard, never auto-opening an existing project or creating a new one.
 */
export function resolveNavigationDestination(
  view: AppNavView,
  projectType?: ProjectType
): NavigationTransitionResult {
  if (view === 'dashboard') {
    return {
      nextView: 'dashboard',
      nextDashboardTab: projectType || 'all',
      shouldSwitchToWorkspace: false,
      shouldCreateProject: false,
    };
  }

  return {
    nextView: view,
    nextDashboardTab: 'all',
    shouldSwitchToWorkspace: false,
    shouldCreateProject: false,
  };
}

/**
 * Returns human-readable library grid title based on active tab.
 */
export function getLibraryGridTitle(tab: ProjectType | 'all'): string {
  switch (tab) {
    case 'article':
      return 'Articles Library';
    case 'gift_guide':
      return 'Gift Guides Library';
    case 'product_copy':
      return 'Product Copies Library';
    default:
      return 'Editorial Studio Projects';
  }
}

/**
 * Returns descriptive subtitle for active library grid.
 */
export function getLibraryGridDescription(tab: ProjectType | 'all'): string {
  switch (tab) {
    case 'article':
      return 'Browse, draft, and refine in-depth editorial articles, investigative analyses, and essays.';
    case 'gift_guide':
      return 'Curate and edit high-intent gift guides, product recommendations, and recipient collections.';
    case 'product_copy':
      return 'Craft and review verified product copy proposals, creative angles, and buyer narratives.';
    default:
      return 'Discerning workspace for human, specific, unhurried articles, curated gift guides, and factual product narratives.';
  }
}

/**
 * Pure filter function for Dashboard project grid.
 */
export function filterProjectsByGridTab(
  projects: WritingProject[],
  tab: ProjectType | 'all',
  filterStatus: ProjectStatus | 'all' = 'all',
  searchQuery: string = ''
): WritingProject[] {
  return projects.filter((p) => {
    if (tab !== 'all' && p.type !== tab) return false;
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const plainBody = extractPlainTextFromHtml(p.content).toLowerCase();
      const matchTitle = (p.title || '').toLowerCase().includes(q);
      const matchContent = plainBody.includes(q);
      const matchInstructions = (p.projectInstructions || '').toLowerCase().includes(q);
      return matchTitle || matchContent || matchInstructions;
    }
    return true;
  });
}

/**
 * Determines whether a navbar item is considered active.
 */
export function isNavButtonActive(
  target: { type: ProjectType | 'all' },
  state: {
    currentView: AppView;
    dashboardTab: ProjectType | 'all';
    activeProjectType?: ProjectType | null;
  }
): boolean {
  if (target.type === 'all') {
    return state.currentView === 'dashboard' && state.dashboardTab === 'all';
  }

  // Active if currently in dashboard on that tab
  if (state.currentView === 'dashboard' && state.dashboardTab === target.type) {
    return true;
  }

  // Or if currently inside an active editor workspace of that project type
  if (
    (state.currentView === 'workspace' || state.currentView === 'editorial_development') &&
    state.activeProjectType === target.type
  ) {
    return true;
  }

  return false;
}
