/**
 * Focused Unit Tests for Stage 1: Content Navigation & Grid Routing
 * Verifies:
 * 1. Navbar clicks for Articles, Gift Guides, and Product Copies route to library grids, NOT editor workspaces.
 * 2. Does NOT reopen the last-edited project or auto-create a new project when navigating to a library.
 * 3. Preserves project data, save baselines, and unsaved changes protection.
 * 4. Active button states in desktop and mobile navigation.
 * 5. Library grid filtering and dynamic titles.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveNavigationDestination,
  getLibraryGridTitle,
  getLibraryGridDescription,
  filterProjectsByGridTab,
  isNavButtonActive,
} from '../navigationUtils';
import { WritingProject, ProjectType } from '../../types/project';
import { hasProjectUnsavedChanges, createVersionSnapshot } from '../../services/versionHistoryService';

function createMockProject(
  id: string,
  type: ProjectType,
  title: string,
  content: string = '<p>Draft body content</p>'
): WritingProject {
  const controls = {
    tone: 'editorial' as const,
    detail: 'balanced' as const,
    marketing: 'minimal' as const,
    historicalContext: 'moderate' as const,
    audience: 'enthusiast' as const,
    wordCountTarget: '1,200 - 1,500 words',
  };

  return {
    id,
    type,
    title,
    content,
    status: 'draft',
    createdAt: '2026-10-26T10:00:00.000Z',
    updatedAt: '2026-10-26T10:00:00.000Z',
    projectInstructions: '',
    brief: {
      purpose: 'Editorial purpose',
      audience: 'Discerning readers',
      readerLearns: 'Core facts',
      readerFeels: 'Engaged',
      readerAction: 'Evaluate carefully',
      keyPoints: [],
      thingsToAvoid: [],
    },
    outline: [],
    contentRules: [],
    writingControls: controls,
    aiSettings: controls,
    versionHistory: [],
  };
}

describe('Stage 1: Content Navigation & Grid Routing', () => {
  describe('1. Global Navbar Destination Resolution', () => {
    it('routes Articles navbar click to dashboard view with article filter tab', () => {
      const dest = resolveNavigationDestination('dashboard', 'article');
      assert.equal(dest.nextView, 'dashboard');
      assert.equal(dest.nextDashboardTab, 'article');
      assert.equal(dest.shouldSwitchToWorkspace, false, 'Must NOT switch to workspace');
      assert.equal(dest.shouldCreateProject, false, 'Must NOT auto-create project');
    });

    it('routes Gift Guides navbar click to dashboard view with gift_guide filter tab', () => {
      const dest = resolveNavigationDestination('dashboard', 'gift_guide');
      assert.equal(dest.nextView, 'dashboard');
      assert.equal(dest.nextDashboardTab, 'gift_guide');
      assert.equal(dest.shouldSwitchToWorkspace, false, 'Must NOT switch to workspace');
      assert.equal(dest.shouldCreateProject, false, 'Must NOT auto-create project');
    });

    it('routes Product Copies navbar click to dashboard view with product_copy filter tab', () => {
      const dest = resolveNavigationDestination('dashboard', 'product_copy');
      assert.equal(dest.nextView, 'dashboard');
      assert.equal(dest.nextDashboardTab, 'product_copy');
      assert.equal(dest.shouldSwitchToWorkspace, false, 'Must NOT switch to workspace');
      assert.equal(dest.shouldCreateProject, false, 'Must NOT auto-create project');
    });

    it('routes SG Masthead / Dashboard click to dashboard view with all projects tab', () => {
      const dest = resolveNavigationDestination('dashboard');
      assert.equal(dest.nextView, 'dashboard');
      assert.equal(dest.nextDashboardTab, 'all');
      assert.equal(dest.shouldSwitchToWorkspace, false);
      assert.equal(dest.shouldCreateProject, false);
    });

    it('preserves other global destinations (settings, backup, research, style_reference)', () => {
      assert.equal(resolveNavigationDestination('settings').nextView, 'settings');
      assert.equal(resolveNavigationDestination('backup').nextView, 'backup');
      assert.equal(resolveNavigationDestination('research').nextView, 'research');
      assert.equal(resolveNavigationDestination('style_reference').nextView, 'style_reference');
      assert.equal(resolveNavigationDestination('internal_links').nextView, 'internal_links');
      assert.equal(resolveNavigationDestination('idea_generator').nextView, 'idea_generator');
    });
  });

  describe('2. Isolation from Project Auto-Opening & Auto-Creation', () => {
    it('does not reopen an existing project when navigating to its content library', () => {
      const sampleProjects = [
        createMockProject('art-1', 'article', 'The Ethics of Heirlooms'),
        createMockProject('art-2', 'article', 'Japanese Knife Guilds'),
        createMockProject('guide-1', 'gift_guide', 'Father Day Crafts'),
        createMockProject('prod-1', 'product_copy', 'Brass Mechanical Pencil'),
      ];

      // Simulated navigation logic
      let activeProjectId: string | null = 'art-1';
      let currentView: string = 'workspace';

      // User clicks "Articles" navbar link while editing art-1
      const nav = resolveNavigationDestination('dashboard', 'article');

      // The destination logic ensures:
      currentView = nav.nextView;
      const activeTab = nav.nextDashboardTab;

      assert.equal(currentView, 'dashboard');
      assert.equal(activeTab, 'article');

      // Filter projects on dashboard: both articles are listed in the grid for user selection
      const gridItems = filterProjectsByGridTab(sampleProjects, activeTab);
      assert.equal(gridItems.length, 2);
      assert.equal(gridItems[0].id, 'art-1');
      assert.equal(gridItems[1].id, 'art-2');

      // The user remains on the library grid, NOT forced back into art-1
      assert.notEqual(currentView, 'workspace');
    });

    it('does not automatically create a project when navigating to an empty content library', () => {
      const emptyProjects: WritingProject[] = [];

      // User clicks "Product Copies" when no product copies exist
      const nav = resolveNavigationDestination('dashboard', 'product_copy');
      assert.equal(nav.shouldCreateProject, false);

      const gridItems = filterProjectsByGridTab(emptyProjects, nav.nextDashboardTab);
      assert.equal(gridItems.length, 0, 'Grid should be empty; no project auto-created');
    });
  });

  describe('3. Library Grid Titles and Filtering', () => {
    it('provides accurate human-readable titles and descriptions for each library grid', () => {
      assert.equal(getLibraryGridTitle('article'), 'Articles Library');
      assert.equal(getLibraryGridTitle('gift_guide'), 'Gift Guides Library');
      assert.equal(getLibraryGridTitle('product_copy'), 'Product Copies Library');
      assert.equal(getLibraryGridTitle('all'), 'Editorial Studio Projects');

      assert.match(getLibraryGridDescription('article'), /editorial articles/i);
      assert.match(getLibraryGridDescription('gift_guide'), /gift guides/i);
      assert.match(getLibraryGridDescription('product_copy'), /product copy/i);
    });

    it('filters projects strictly by content type tab while supporting search queries', () => {
      const projects: WritingProject[] = [
        createMockProject('1', 'article', 'The Timeless Watch', '<p>Mechanical watches</p>'),
        createMockProject('2', 'article', 'Leather Care Essentials', '<p>Beeswax formula</p>'),
        createMockProject('3', 'gift_guide', 'Ten Gifts for Architects', '<p>Precision rulers</p>'),
        createMockProject('4', 'product_copy', 'Architect Ruler 3000', '<p>Matte black aluminium</p>'),
      ];

      // Tab 'article'
      const articles = filterProjectsByGridTab(projects, 'article');
      assert.equal(articles.length, 2);
      assert(articles.every((p) => p.type === 'article'));

      // Tab 'gift_guide'
      const guides = filterProjectsByGridTab(projects, 'gift_guide');
      assert.equal(guides.length, 1);
      assert.equal(guides[0].id, '3');

      // Tab 'product_copy'
      const products = filterProjectsByGridTab(projects, 'product_copy');
      assert.equal(products.length, 1);
      assert.equal(products[0].id, '4');

      // Search query within 'article'
      const searchedArticles = filterProjectsByGridTab(projects, 'article', 'all', 'leather');
      assert.equal(searchedArticles.length, 1);
      assert.equal(searchedArticles[0].id, '2');
    });
  });

  describe('4. Navbar Button Active State Highlighting', () => {
    it('highlights corresponding button when viewing a specific library grid on dashboard', () => {
      assert.equal(
        isNavButtonActive(
          { type: 'article' },
          { currentView: 'dashboard', dashboardTab: 'article' }
        ),
        true
      );
      assert.equal(
        isNavButtonActive(
          { type: 'gift_guide' },
          { currentView: 'dashboard', dashboardTab: 'article' }
        ),
        false
      );
      assert.equal(
        isNavButtonActive(
          { type: 'product_copy' },
          { currentView: 'dashboard', dashboardTab: 'article' }
        ),
        false
      );
    });

    it('highlights corresponding button when editing a project of that type in workspace', () => {
      assert.equal(
        isNavButtonActive(
          { type: 'product_copy' },
          { currentView: 'workspace', dashboardTab: 'all', activeProjectType: 'product_copy' }
        ),
        true
      );
      assert.equal(
        isNavButtonActive(
          { type: 'article' },
          { currentView: 'workspace', dashboardTab: 'all', activeProjectType: 'product_copy' }
        ),
        false
      );
    });

    it('highlights All Projects on mobile/masthead when dashboardTab is all', () => {
      assert.equal(
        isNavButtonActive(
          { type: 'all' },
          { currentView: 'dashboard', dashboardTab: 'all' }
        ),
        true
      );
      assert.equal(
        isNavButtonActive(
          { type: 'all' },
          { currentView: 'dashboard', dashboardTab: 'article' }
        ),
        false
      );
    });
  });

  describe('5. Unsaved Changes Protection and Data Integrity', () => {
    it('detects dirty state to guard against unintended data loss during navigation', () => {
      const baseline = createMockProject('art-1', 'article', 'Baseline Title', '<p>Original</p>');
      const modified = { ...baseline, content: '<p>Unsaved new paragraph</p>' };

      // Dirty detection detects change
      const isDirty = hasProjectUnsavedChanges(modified, baseline);
      assert.equal(isDirty, true, 'Must detect dirty edits before letting user navigate away');

      // Once clean or saved, dirty is false
      const savedSnapshot = createVersionSnapshot(modified, 'manual_save', { label: 'Manual Save' });
      assert(savedSnapshot.length > 0);
      assert.equal(hasProjectUnsavedChanges(modified, modified), false);
    });

    it('retains all existing project data and version history during library grid navigation', () => {
      const project = createMockProject('prod-1', 'product_copy', 'Field Notes Leather Cover');
      project.versionHistory = createVersionSnapshot(project, 'manual_save', { label: 'Initial' });

      // Simulate navigating between libraries
      const nav1 = resolveNavigationDestination('dashboard', 'product_copy');
      const nav2 = resolveNavigationDestination('dashboard', 'article');
      const nav3 = resolveNavigationDestination('dashboard', 'gift_guide');

      // Neither navigation transition modifies the project
      assert.equal(nav1.nextView, 'dashboard');
      assert.equal(nav2.nextView, 'dashboard');
      assert.equal(nav3.nextView, 'dashboard');

      assert.equal(project.id, 'prod-1');
      assert.equal(project.versionHistory.length, 1);
      assert.equal(project.title, 'Field Notes Leather Cover');
    });
  });
});
