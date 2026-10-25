/**
 * Science of Gifts - Editorial Writing Studio
 * Main Application Shell (Manual Saving, Automatic Version History & Cloud-Authoritative Sync)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  WritingProject,
  ProjectType,
  ProjectStatus,
  ProjectSaveStatus,
  ProjectConflictInfo,
  DiffProposal,
  OutlineItem,
  ActivePanel,
  ReviewFinding,
  EditorialReviewResult,
  QCResult,
  QCFinding,
} from './types/project';
import { VersionType } from './types/versionHistory';
import { storage } from './services/storage';
import { syncEngine } from './services/syncEngine';
import { geminiService } from './services/geminiClient';
import { toast } from './services/toastService';
import { ToastContainer } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FindInDocumentBar } from './components/FindInDocumentBar';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { ArticleWorkspace } from './components/workspaces/ArticleWorkspace';
import { GiftGuideWorkspace } from './components/workspaces/GiftGuideWorkspace';
import { ProductCopyWorkspace } from './components/workspaces/ProductCopyWorkspace';
import { SettingsView } from './components/SettingsView';
import { DiffReviewModal } from './components/DiffReviewModal';
import { UnsavedChangesModal } from './components/UnsavedChangesModal';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { ProjectBriefDrawer } from './components/drawers/ProjectBriefDrawer';
import { EditorialDevelopmentDrawer } from './components/drawers/EditorialDevelopmentDrawer';
import { ContentOutlineDrawer } from './components/drawers/ContentOutlineDrawer';
import { DraftPackageDrawer } from './components/drawers/DraftPackageDrawer';
import { ContentRulesDrawer } from './components/drawers/ContentRulesDrawer';
import { StyleSettingsDrawer } from './components/drawers/StyleSettingsDrawer';
import { ProjectInstructionsDrawer } from './components/drawers/ProjectInstructionsDrawer';
import { StyleReferenceView } from './components/styleReference/StyleReferenceView';
import { InternalLinksView } from './components/internalLinks/InternalLinksView';
import { LinkOpportunitiesDrawer } from './components/drawers/LinkOpportunitiesDrawer';
import { EditorialIntelligenceDrawer } from './components/drawers/EditorialIntelligenceDrawer';
import { VersionHistoryDrawer } from './components/drawers/VersionHistoryDrawer';
import { LinkOpportunity } from './types/internalLink';
import {
  createVersionSnapshot,
  restoreVersionSnapshot,
  hasProjectUnsavedChanges,
  mergeVersionHistories,
} from './services/versionHistoryService';
import { ensureSemanticHtml } from './utils/richText';
import { reconcileNotesWithHtmlContent } from './utils/editingNotes';
import { applyHyperlinkToHtml, isValidUrl, isUrlAlreadyInDocument } from './utils/urlUtils';
import { applyTheme } from './theme/tokens';
import { useDocumentSearch } from './utils/useDocumentSearch';
import { IdeaGeneratorView } from './components/IdeaGeneratorView';
import { EditorialIdea } from './types/ideaGenerator';
import { DataBackupView } from './components/DataBackupView';
import { ResearchLibraryView } from './components/research/ResearchLibraryView';
import { ResearchStudyWorkspace } from './components/research/ResearchStudyWorkspace';
import { ResearchDrawer } from './components/drawers/ResearchDrawer';
import { CitationStudioDrawer } from './components/drawers/CitationStudioDrawer';

type AppView =
  | 'dashboard'
  | 'workspace'
  | 'settings'
  | 'style_reference'
  | 'internal_links'
  | 'idea_generator'
  | 'backup'
  | 'research';

export default function App() {
  const [projects, setProjects] = useState<WritingProject[]>(() => storage.getProjects());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => storage.getActiveProjectId());
  const [currentView, setCurrentView] = useState<AppView>('dashboard');
  const [activeResearchStudyId, setActiveResearchStudyId] = useState<string | null>(null);
  const [isFindOpen, setIsFindOpen] = useState(false);

  // References for synchronous state inspection during async save/sync operations
  const projectsRef = useRef<WritingProject[]>(projects);
  projectsRef.current = projects;

  const activeProjectIdRef = useRef<string | null>(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  // Map of projectId -> last saved baseline project snapshot
  const savedBaselinesRef = useRef<Map<string, WritingProject>>(
    new Map(storage.getProjects().map((p) => [p.id, p]))
  );

  // Map of projectId -> active cloud conflict info
  const conflictsByProjectRef = useRef<Map<string, ProjectConflictInfo>>(new Map());
  const [activeConflict, setActiveConflict] = useState<ProjectConflictInfo | null>(null);
  const [isResolvingConflict, setIsResolvingConflict] = useState(false);

  // Compute baseline save status for a saved project
  const computeBaselineSaveStatus = useCallback((project: WritingProject | undefined | null): ProjectSaveStatus => {
    if (!project) return 'saved_local';
    if (conflictsByProjectRef.current.has(project.id)) {
      return 'conflict';
    }
    const syncInfo = syncEngine.getStatusInfo();
    if (project.cloudRevision && !project.hasUnsyncedLocalSave && syncInfo.user) {
      return 'saved_cloud';
    }
    return 'saved_local';
  }, []);

  const [saveStatus, setSaveStatus] = useState<ProjectSaveStatus>(() => {
    const initialId = storage.getActiveProjectId();
    const initialProj = storage.getProjects().find((p) => p.id === initialId);
    return computeBaselineSaveStatus(initialProj);
  });

  // Unsaved navigation protection modal state
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);

  // Concurrency guard for Save clicks
  const isSavingInFlightRef = useRef(false);
  const activeSavePromiseRef = useRef<Promise<{ ok: boolean; status: ProjectSaveStatus }> | null>(null);

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;

  // Provide active editor state to syncEngine so login/snapshot reconciliation never discards in-memory edits
  useEffect(() => {
    syncEngine.setActiveEditorStateProvider(() => {
      const currentId = activeProjectIdRef.current;
      const working = projectsRef.current.find((p) => p.id === currentId) || null;
      const baseline = currentId ? savedBaselinesRef.current.get(currentId) : undefined;
      return {
        projectId: currentId,
        workingProject: working,
        hasUnsavedChanges: hasProjectUnsavedChanges(working, baseline),
      };
    });
    return () => {
      syncEngine.setActiveEditorStateProvider(null);
    };
  }, []);

  // Initialize theme, IndexedDB, and syncEngine listeners on mount
  useEffect(() => {
    applyTheme(storage.getTheme());

    storage.init().then(() => {
      const loaded = storage.getProjects();
      loaded.forEach((p) => {
        if (!savedBaselinesRef.current.has(p.id)) {
          savedBaselinesRef.current.set(p.id, p);
        }
      });
      setProjects((prev) => {
        const currentId = activeProjectIdRef.current;
        const currentWorking = prev.find((p) => p.id === currentId);
        const currentBaseline = currentId ? savedBaselinesRef.current.get(currentId) : undefined;
        const isCurrentDirty = hasProjectUnsavedChanges(currentWorking, currentBaseline);

        return loaded.map((p) => {
          if (isCurrentDirty && currentWorking && p.id === currentWorking.id) {
            return currentWorking;
          }
          savedBaselinesRef.current.set(p.id, p);
          return p;
        });
      });
    });

    // Listen for conflict events from syncEngine
    const unsubConflict = syncEngine.onConflict((conflict) => {
      conflictsByProjectRef.current.set(conflict.projectId, conflict);
      if (activeProjectIdRef.current === conflict.projectId) {
        setSaveStatus('conflict');
        setActiveConflict(conflict);
      }
    });

    // Listen for reconciled projects from syncEngine (e.g. after sign-in or remote snapshot)
    const unsubReconciled = syncEngine.onReconciledProjects((reconciledList) => {
      const currentId = activeProjectIdRef.current;
      const currentWorking = projectsRef.current.find((p) => p.id === currentId);
      const currentBaseline = currentId ? savedBaselinesRef.current.get(currentId) : undefined;
      const isCurrentDirty = hasProjectUnsavedChanges(currentWorking, currentBaseline);

      // Update saved baselines for all reconciled projects
      reconciledList.forEach((p) => {
        savedBaselinesRef.current.set(p.id, p);
      });

      setProjects(
        reconciledList.map((p) => {
          // Never overwrite unsaved in-memory edits in the active editor
          if (isCurrentDirty && currentWorking && p.id === currentWorking.id) {
            return {
              ...currentWorking,
              baseCloudRevision: p.cloudRevision ?? currentWorking.baseCloudRevision,
              versionHistory: mergeVersionHistories(
                currentWorking.versionHistory,
                p.versionHistory
              ),
            };
          }
          if (p.id === currentId) {
            window.dispatchEvent(
              new CustomEvent('sog:restore-editor-content', {
                detail: { content: p.content, projectId: p.id },
              })
            );
          }
          return p;
        })
      );

      // Update status indicator for active project
      if (currentId) {
        if (conflictsByProjectRef.current.has(currentId)) {
          setSaveStatus('conflict');
        } else if (isCurrentDirty) {
          setSaveStatus('unsaved');
        } else {
          const updatedActive = reconciledList.find((p) => p.id === currentId);
          setSaveStatus(computeBaselineSaveStatus(updatedActive));
        }
      }
    });

    // Listen for auth/sync status changes to update saved_local vs saved_cloud indicator
    const unsubSyncStatus = syncEngine.subscribe(() => {
      const currentId = activeProjectIdRef.current;
      if (!currentId || isSavingInFlightRef.current) return;
      const currentWorking = projectsRef.current.find((p) => p.id === currentId);
      const currentBaseline = savedBaselinesRef.current.get(currentId);
      if (conflictsByProjectRef.current.has(currentId)) {
        setSaveStatus('conflict');
      } else if (hasProjectUnsavedChanges(currentWorking, currentBaseline)) {
        setSaveStatus('unsaved');
      } else {
        setSaveStatus((prev) =>
          prev === 'cloud_save_failed' ? prev : computeBaselineSaveStatus(currentBaseline)
        );
      }
    });

    return () => {
      unsubConflict();
      unsubReconciled();
      unsubSyncStatus();
    };
  }, [computeBaselineSaveStatus]);

  // Single source of truth for mutually exclusive writing panels
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [diffProposal, setDiffProposal] = useState<DiffProposal | null>(null);
  const [savedSelectedText, setSavedSelectedText] = useState<string>('');

  const handleTogglePanel = useCallback((panel: Exclude<ActivePanel, null>) => {
    if (panel === 'review') {
      if (editorRef.current) {
        try {
          const { from, to } = editorRef.current.state.selection;
          const text = editorRef.current.state.doc.textBetween(from, to, ' ').trim();
          if (text) {
            setSavedSelectedText(text);
          }
        } catch (e) {
          console.warn('Could not capture selection on panel toggle:', e);
        }
      }
    }
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);

  const handleClosePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  // Editor instance reference & Workspace container reference for in-document search
  const editorRef = useRef<any>(null);
  const workspaceContainerRef = useRef<HTMLDivElement>(null);

  const {
    matchCount: searchMatchCount,
    currentIndex: searchMatchIndex,
    performSearch,
    nextMatch,
    prevMatch,
    clearHighlights,
  } = useDocumentSearch(workspaceContainerRef);

  // Persist active project ID and update saveStatus when switching projects
  useEffect(() => {
    storage.setActiveProjectId(activeProjectId);
    if (activeProjectId) {
      const working = projectsRef.current.find((p) => p.id === activeProjectId);
      const baseline = savedBaselinesRef.current.get(activeProjectId);
      if (conflictsByProjectRef.current.has(activeProjectId)) {
        setSaveStatus('conflict');
      } else if (hasProjectUnsavedChanges(working, baseline)) {
        setSaveStatus('unsaved');
      } else {
        setSaveStatus(computeBaselineSaveStatus(baseline || working));
      }
    }
  }, [activeProjectId, computeBaselineSaveStatus]);

  // =========================================================================
  // REQUIREMENT 1: IN-MEMORY EDITING WITHOUT AUTOMATIC PERSISTENCE
  // =========================================================================
  const handleUpdateActiveProject = useCallback(
    (updatedProject: WritingProject) => {
      // Update only in-memory React state — NEVER write to localStorage, IndexedDB, or Firestore on edit
      setProjects((prev) => {
        const next = prev.map((p) => (p.id === updatedProject.id ? updatedProject : p));
        projectsRef.current = next;
        return next;
      });

      const baseline = savedBaselinesRef.current.get(updatedProject.id);
      const isDirty = hasProjectUnsavedChanges(updatedProject, baseline);

      if (conflictsByProjectRef.current.has(updatedProject.id)) {
        setSaveStatus('conflict');
      } else if (isDirty) {
        setSaveStatus('unsaved');
      } else {
        setSaveStatus(computeBaselineSaveStatus(baseline));
      }
    },
    [computeBaselineSaveStatus]
  );

  // =========================================================================
  // REQUIREMENT 2, 5, 6, 7: EXPLICIT MANUAL SAVE + VERSION HISTORY + CLOUD SYNC
  // =========================================================================
  const handleManualSave = useCallback(
    async (options?: {
      projectOverride?: WritingProject;
      forceOverwriteRevision?: number;
      customVersionLabel?: string;
      versionType?: VersionType;
    }): Promise<{ ok: boolean; status: ProjectSaveStatus }> => {
      if (isSavingInFlightRef.current && activeSavePromiseRef.current) {
        return activeSavePromiseRef.current;
      }

      const targetProject =
        options?.projectOverride ||
        projectsRef.current.find((p) => p.id === activeProjectIdRef.current) ||
        null;

      if (!targetProject) {
        return { ok: false, status: 'saved_local' };
      }

      const executeSave = async (): Promise<{ ok: boolean; status: ProjectSaveStatus }> => {
        isSavingInFlightRef.current = true;
        try {
          const projectId = targetProject.id;
          const baseline = savedBaselinesRef.current.get(projectId);
          const isDirty = hasProjectUnsavedChanges(targetProject, baseline);
          const syncInfo = syncEngine.getStatusInfo();

          // If nothing changed and already saved_cloud (and not resolving a conflict), avoid duplicate history
          if (
            !isDirty &&
            options?.forceOverwriteRevision === undefined &&
            !options?.customVersionLabel &&
            targetProject.cloudRevision &&
            !targetProject.hasUnsyncedLocalSave &&
            syncInfo.user
          ) {
            setSaveStatus('saved_cloud');
            toast.info('Already Saved', `"${targetProject.title || 'Untitled'}" is already saved to the cloud.`);
            return { ok: true, status: 'saved_cloud' };
          }

          setSaveStatus('saving_local');
          const nowIso = new Date().toISOString();

          // Create version-history entry only when content/metadata changed from last saved baseline,
          // or when no version history exists yet, or when an explicit label/restore is provided.
          let updatedHistory = mergeVersionHistories(
            targetProject.versionHistory,
            storage.getProjectVersions(projectId)
          );

          if (isDirty || updatedHistory.length === 0 || options?.customVersionLabel) {
            const projectWithHistory: WritingProject = {
              ...targetProject,
              content: ensureSemanticHtml(targetProject.content),
              versionHistory: updatedHistory,
            };
            updatedHistory = createVersionSnapshot(
              projectWithHistory,
              options?.versionType || 'manual_save',
              {
                force: true,
                label: options?.customVersionLabel,
              }
            );
            storage.saveProjectVersions(projectId, updatedHistory);
          }

          const latestVersionSnapshot = updatedHistory[0];
          const baseCloudRev =
            options?.forceOverwriteRevision !== undefined
              ? options.forceOverwriteRevision
              : baseline?.baseCloudRevision ??
                targetProject.baseCloudRevision ??
                baseline?.cloudRevision ??
                targetProject.cloudRevision ??
                0;

          const locallySavedProject: WritingProject = {
            ...targetProject,
            content: ensureSemanticHtml(targetProject.content),
            versionHistory: updatedHistory,
            baseCloudRevision: baseCloudRev,
            hasUnsyncedLocalSave: true,
            updatedAt: nowIso,
          };

          // Persist locally to localStorage & IndexedDB
          storage.saveProject(locallySavedProject, { silent: true });
          savedBaselinesRef.current.set(projectId, locallySavedProject);

          // Update in-memory project state (preserving any new typing if user edited during save)
          setProjects((prev) => {
            const next = prev.map((p) => {
              if (p.id !== projectId) return p;
              const typedDuringSave = hasProjectUnsavedChanges(p, locallySavedProject);
              if (typedDuringSave) {
                return {
                  ...p,
                  versionHistory: updatedHistory,
                  baseCloudRevision: baseCloudRev,
                  hasUnsyncedLocalSave: true,
                };
              }
              return locallySavedProject;
            });
            projectsRef.current = next;
            return next;
          });

          // If signed out, report local save without claiming cloud synchronization
          if (!syncInfo.user) {
            const latestWorking = projectsRef.current.find((p) => p.id === projectId);
            const stillClean = !hasProjectUnsavedChanges(latestWorking, locallySavedProject);
            const finalLocalStatus: ProjectSaveStatus = stillClean ? 'saved_local' : 'unsaved';
            setSaveStatus(finalLocalStatus);
            toast.success(
              'Saved locally — not synced',
              `"${locallySavedProject.title || 'Untitled'}" saved locally (Version ${latestVersionSnapshot.versionNumber}).`
            );
            return { ok: true, status: finalLocalStatus };
          }

          // When authenticated, upload saved revision & version history to Firestore transactionally
          setSaveStatus('saving_cloud');
          const cloudRes = await syncEngine.saveProjectToCloud(
            locallySavedProject,
            latestVersionSnapshot,
            { forceOverwriteRevision: options?.forceOverwriteRevision }
          );

          if (cloudRes.ok && cloudRes.status === 'saved_cloud') {
            const confirmedProject = cloudRes.updatedProject;
            savedBaselinesRef.current.set(projectId, confirmedProject);
            conflictsByProjectRef.current.delete(projectId);
            setActiveConflict((cur) => (cur?.projectId === projectId ? null : cur));

            const latestWorking = projectsRef.current.find((p) => p.id === projectId);
            const stillClean = !hasProjectUnsavedChanges(latestWorking, confirmedProject);

            setProjects((prev) => {
              const next = prev.map((p) => {
                if (p.id !== projectId) return p;
                if (!stillClean) {
                  return {
                    ...p,
                    cloudRevision: confirmedProject.cloudRevision,
                    baseCloudRevision: confirmedProject.baseCloudRevision,
                    hasUnsyncedLocalSave: false,
                    lastSyncedAt: confirmedProject.lastSyncedAt,
                    lastSyncedByUid: confirmedProject.lastSyncedByUid,
                    versionHistory: confirmedProject.versionHistory,
                  };
                }
                return confirmedProject;
              });
              projectsRef.current = next;
              return next;
            });

            const nextStatus: ProjectSaveStatus = stillClean ? 'saved_cloud' : 'unsaved';
            setSaveStatus(nextStatus);
            toast.success(
              'Saved to cloud',
              `"${confirmedProject.title || 'Untitled'}" saved to cloud (Revision #${cloudRes.cloudRevision}).`
            );
            return { ok: true, status: nextStatus };
          }

          if (cloudRes.status === 'conflict') {
            conflictsByProjectRef.current.set(projectId, cloudRes.conflict);
            setActiveConflict(cloudRes.conflict);
            setSaveStatus('conflict');
            toast.warning(
              'Conflict — changes need review',
              `Cloud has Revision #${cloudRes.conflict.remoteRevision}. Your local changes are preserved.`
            );
            return { ok: false, status: 'conflict' };
          }

          // Cloud save failed (e.g. network error) — local save is preserved
          setSaveStatus('cloud_save_failed');
          toast.error(
            'Cloud save failed',
            cloudRes.error || 'Saved locally, but cloud upload failed. Click Retry to try again.'
          );
          return { ok: false, status: 'cloud_save_failed' };
        } catch (err: any) {
          console.error('Manual save error:', err);
          setSaveStatus('cloud_save_failed');
          toast.error('Save failed', err?.message || 'Could not complete save operation.');
          return { ok: false, status: 'cloud_save_failed' };
        } finally {
          isSavingInFlightRef.current = false;
          activeSavePromiseRef.current = null;
        }
      };

      const promise = executeSave();
      activeSavePromiseRef.current = promise;
      return promise;
    },
    []
  );

  // Retry cloud save
  const handleRetrySave = useCallback(() => {
    handleManualSave();
  }, [handleManualSave]);

  // =========================================================================
  // REQUIREMENT 3: PROTECT UNSAVED WORK WHEN LEAVING OR SWITCHING
  // =========================================================================
  const hasActiveUnsavedWork = useCallback((): boolean => {
    if (currentView !== 'workspace' || !activeProjectIdRef.current) return false;
    const currentWorking = projectsRef.current.find((p) => p.id === activeProjectIdRef.current);
    const baseline = savedBaselinesRef.current.get(activeProjectIdRef.current);
    return hasProjectUnsavedChanges(currentWorking, baseline);
  }, [currentView]);

  const executeWithUnsavedGuard = useCallback(
    (navigationAction: () => void) => {
      if (hasActiveUnsavedWork()) {
        pendingNavigationRef.current = navigationAction;
        setIsUnsavedModalOpen(true);
      } else {
        navigationAction();
      }
    },
    [hasActiveUnsavedWork]
  );

  const handleSaveAndLeave = useCallback(async () => {
    const res = await handleManualSave();
    // Only navigate away if the save succeeded (saved_local when signed out, or saved_cloud when signed in)
    if (res.ok && (res.status === 'saved_local' || res.status === 'saved_cloud')) {
      setIsUnsavedModalOpen(false);
      const nav = pendingNavigationRef.current;
      pendingNavigationRef.current = null;
      if (nav) nav();
    } else {
      // Close unsaved modal so user can see conflict modal or retry error without losing work
      setIsUnsavedModalOpen(false);
      pendingNavigationRef.current = null;
    }
  }, [handleManualSave]);

  const handleDiscardAndLeave = useCallback(() => {
    const currentId = activeProjectIdRef.current;
    if (currentId) {
      const baseline = savedBaselinesRef.current.get(currentId);
      if (baseline) {
        setProjects((prev) => {
          const next = prev.map((p) => (p.id === currentId ? baseline : p));
          projectsRef.current = next;
          return next;
        });
        if (editorRef.current) {
          editorRef.current.commands.setContent(baseline.content, { emitUpdate: false });
        }
        window.dispatchEvent(
          new CustomEvent('sog:restore-editor-content', {
            detail: { content: baseline.content, projectId: baseline.id },
          })
        );
        setSaveStatus(computeBaselineSaveStatus(baseline));
      }
    }
    setIsUnsavedModalOpen(false);
    const nav = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    if (nav) nav();
  }, [computeBaselineSaveStatus]);

  const handleStayOnPage = useCallback(() => {
    setIsUnsavedModalOpen(false);
    pendingNavigationRef.current = null;
  }, []);

  // Native browser beforeunload warning when unsaved changes exist
  useEffect(() => {
    const isDirty =
      saveStatus === 'unsaved' ||
      saveStatus === 'saving_local' ||
      saveStatus === 'saving_cloud' ||
      hasActiveUnsavedWork();

    if (!isDirty) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus, projects, hasActiveUnsavedWork]);

  // =========================================================================
  // REQUIREMENT 5 & 7: CONFLICT RESOLUTION HANDLERS
  // =========================================================================
  const handleAdoptCloudConflict = useCallback((conflict: ProjectConflictInfo) => {
    setIsResolvingConflict(true);
    try {
      // 1. Archive local working state into independent version history so nothing is lost
      const recoveryHistory = createVersionSnapshot(conflict.localProject, 'manual_save', {
        force: true,
        label: `Unmerged Local Edits (Saved Before Reloading Cloud Rev #${conflict.remoteRevision})`,
      });
      storage.saveProjectVersions(conflict.projectId, recoveryHistory);

      // 2. Merge all version histories onto the authoritative cloud project
      const mergedHistory = mergeVersionHistories(
        conflict.remoteProject.versionHistory,
        recoveryHistory
      );

      const adoptedProject: WritingProject = {
        ...conflict.remoteProject,
        cloudRevision: conflict.remoteRevision,
        baseCloudRevision: conflict.remoteRevision,
        hasUnsyncedLocalSave: false,
        versionHistory: mergedHistory,
      };

      storage.saveProject(adoptedProject, { silent: true });
      savedBaselinesRef.current.set(conflict.projectId, adoptedProject);
      conflictsByProjectRef.current.delete(conflict.projectId);

      setProjects((prev) => {
        const next = prev.map((p) => (p.id === conflict.projectId ? adoptedProject : p));
        projectsRef.current = next;
        return next;
      });

      if (editorRef.current && activeProjectIdRef.current === conflict.projectId) {
        editorRef.current.commands.setContent(adoptedProject.content, { emitUpdate: false });
      }
      window.dispatchEvent(
        new CustomEvent('sog:restore-editor-content', {
          detail: { content: adoptedProject.content, projectId: adoptedProject.id },
        })
      );

      setActiveConflict(null);
      setSaveStatus('saved_cloud');
      toast.success(
        'Cloud Version Reloaded',
        `Adopted Cloud Revision #${conflict.remoteRevision}. Your previous local edits are preserved in Version History.`
      );
    } finally {
      setIsResolvingConflict(false);
    }
  }, []);

  const handleKeepSeparateCopyConflict = useCallback((conflict: ProjectConflictInfo) => {
    setIsResolvingConflict(true);
    try {
      const nowIso = new Date().toISOString();
      const copyId = `proj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const copyTitle = `${conflict.localProject.title || 'Untitled'} (Local Copy)`;

      const copyHistory = createVersionSnapshot(
        { ...conflict.localProject, id: copyId, title: copyTitle },
        'manual_save',
        {
          force: true,
          label: `Forked from Cloud Conflict (Base Rev #${conflict.baseRevision})`,
        }
      );

      const separateCopy: WritingProject = {
        ...conflict.localProject,
        id: copyId,
        title: copyTitle,
        createdAt: nowIso,
        updatedAt: nowIso,
        cloudRevision: undefined,
        baseCloudRevision: 0,
        hasUnsyncedLocalSave: true,
        versionHistory: copyHistory,
      };

      // Adopt the cloud version on the original project ID
      const adoptedCloud: WritingProject = {
        ...conflict.remoteProject,
        cloudRevision: conflict.remoteRevision,
        baseCloudRevision: conflict.remoteRevision,
        hasUnsyncedLocalSave: false,
        versionHistory: mergeVersionHistories(
          conflict.remoteProject.versionHistory,
          storage.getProjectVersions(conflict.projectId)
        ),
      };

      storage.saveProject(adoptedCloud, { silent: true });
      storage.saveProject(separateCopy, { silent: true });
      savedBaselinesRef.current.set(adoptedCloud.id, adoptedCloud);
      savedBaselinesRef.current.set(separateCopy.id, separateCopy);
      conflictsByProjectRef.current.delete(conflict.projectId);

      setProjects((prev) => {
        const updated = prev.map((p) => (p.id === adoptedCloud.id ? adoptedCloud : p));
        const next = [separateCopy, ...updated];
        projectsRef.current = next;
        return next;
      });

      setActiveConflict(null);
      setActiveProjectId(separateCopy.id);
      setSaveStatus('saved_local');
      toast.success(
        'Saved as Separate Copy',
        `Created "${copyTitle}" with your local edits and kept Cloud Revision #${conflict.remoteRevision} on the original.`
      );
    } finally {
      setIsResolvingConflict(false);
    }
  }, []);

  const handleOverwriteCloudConflict = useCallback(
    async (conflict: ProjectConflictInfo) => {
      setIsResolvingConflict(true);
      try {
        // Archive the displaced cloud version in local version history first so it remains recoverable
        const cloudSnapshotHistory = createVersionSnapshot(conflict.remoteProject, 'manual_save', {
          force: true,
          label: `Cloud Revision #${conflict.remoteRevision} (Archived Before Conflict Overwrite)`,
        });
        storage.saveProjectVersions(conflict.projectId, cloudSnapshotHistory);

        const mergedHistory = mergeVersionHistories(
          conflict.localProject.versionHistory,
          cloudSnapshotHistory
        );

        const projectToOverwrite: WritingProject = {
          ...conflict.localProject,
          versionHistory: mergedHistory,
          baseCloudRevision: conflict.remoteRevision,
        };

        await handleManualSave({
          projectOverride: projectToOverwrite,
          forceOverwriteRevision: conflict.remoteRevision,
          customVersionLabel: `Resolved Conflict (Overwrote Cloud Rev #${conflict.remoteRevision})`,
        });
      } finally {
        setIsResolvingConflict(false);
      }
    },
    [handleManualSave]
  );

  // =========================================================================
  // REQUIREMENT 8 (#10): CONCURRENCY-SAFE VERSION RESTORE
  // =========================================================================
  const handleRestoreProjectVersion = useCallback(
    async (targetVersionId: string) => {
      const currentProj = projectsRef.current.find((p) => p.id === activeProjectIdRef.current);
      if (!currentProj) return;

      const fullHistory = mergeVersionHistories(
        currentProj.versionHistory,
        storage.getProjectVersions(currentProj.id)
      );
      const result = restoreVersionSnapshot(
        { ...currentProj, versionHistory: fullHistory },
        targetVersionId
      );
      if (!result) return;

      const restoredProject: WritingProject = {
        ...result.updatedProject,
        baseCloudRevision:
          savedBaselinesRef.current.get(currentProj.id)?.baseCloudRevision ??
          currentProj.baseCloudRevision ??
          currentProj.cloudRevision ??
          0,
      };

      // Update editor canvas
      if (editorRef.current) {
        editorRef.current.commands.setContent(restoredProject.content, { emitUpdate: false });
      }
      window.dispatchEvent(
        new CustomEvent('sog:restore-editor-content', {
          detail: { content: restoredProject.content, projectId: restoredProject.id },
        })
      );

      // Save all checkpoints to independent store
      storage.saveProjectVersions(restoredProject.id, restoredProject.versionHistory || []);

      // Run concurrency-safe manual save (checks cloudRevision in transaction so restore cannot silently overwrite a newer cloud revision)
      const saveRes = await handleManualSave({
        projectOverride: restoredProject,
        customVersionLabel: `Restored Version ${result.restoredVersion.versionNumber}`,
        versionType: 'restored_version',
      });

      if (saveRes.ok) {
        toast.success(
          'Version Restored',
          `Restored Version ${result.restoredVersion.versionNumber} and recorded recovery checkpoints.`
        );
      }
    },
    [handleManualSave]
  );

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + S -> Manual Save
      if (isCmdOrCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
      }

      // Cmd/Ctrl + F -> Find in Document (only in workspace)
      if (isCmdOrCtrl && e.key.toLowerCase() === 'f' && currentView === 'workspace') {
        e.preventDefault();
        setIsFindOpen((prev) => !prev);
      }

      // Escape -> Close search or active drawer or diff modal
      if (e.key === 'Escape') {
        if (isFindOpen) {
          setIsFindOpen(false);
          clearHighlights();
        } else if (diffProposal) {
          setDiffProposal(null);
        } else if (activePanel) {
          setActivePanel(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave, currentView, isFindOpen, clearHighlights, diffProposal, activePanel]);

  // Project Creation (Guarded for unsaved changes)
  const handleCreateProject = useCallback(
    (type: ProjectType) => {
      executeWithUnsavedGuard(() => {
        const created = storage.createProject(type);
        savedBaselinesRef.current.set(created.id, created);
        const updatedList = storage.getProjects();
        setProjects(updatedList);
        projectsRef.current = updatedList;
        setActiveProjectId(created.id);
        setActivePanel(null);
        setSaveStatus('saved_local');
        setCurrentView('workspace');
        toast.success('Project Created', `Started new ${type.replace('_', ' ')} (saved locally).`);
      });
    },
    [executeWithUnsavedGuard]
  );

  // Use Generated Editorial Idea -> Creates new Article project (Guarded for unsaved changes)
  const handleUseIdea = useCallback(
    (idea: EditorialIdea, targetAudience?: string) => {
      executeWithUnsavedGuard(() => {
        const created = storage.createProject('article', idea.title, {
          brief: {
            purpose: idea.whyInteresting,
            audience: targetAudience || 'Discerning gifters & readers',
            readerLearns: idea.angle,
            readerFeels:
              'Engaged, thoughtful, and relieved to find recommendations written by an authentic human connoisseur.',
            readerAction: 'Gain an authentic understanding beyond commercial clichés.',
            keyPoints: [
              `Editorial Premise: ${idea.angle}`,
              `Why It's Engaging: ${idea.whyInteresting}`,
              idea.searchIntent
                ? `Search Intent: ${idea.searchIntent}`
                : 'Focus on recipient psychology and craft nuance',
            ],
            thingsToAvoid: [
              'Generic product listicles',
              'Superficial keyword repetition',
              'Vague praise without material detail',
            ],
          },
          articleMeta: {
            slug: idea.title
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)/g, ''),
            seoTitle: `${idea.title} | Science of Gifts`,
            metaDescription:
              idea.angle.length > 155 ? `${idea.angle.slice(0, 152)}...` : idea.angle,
            standfirst: idea.angle,
            targetKeyword: '',
            secondaryKeywords: [],
            audience: targetAudience || 'Discerning gifters & readers',
            searchIntent: idea.searchIntent || 'Editorial insight & advice',
          },
          editorialDevelopment: {
            originalIdea: idea,
            angles: [],
            direction: {
              briefMentionAngleIds: [],
              doNotUseAngleIds: [],
              editorsDirection: '',
            },
            status: 'idea',
          },
          lastAIRequest: {
            id: `ai-req-${Date.now()}`,
            modelUsed: 'gemini-3.6-flash',
            modelDisplayName: 'Gemini 3.6 Flash',
            action: 'idea_generation',
            actionType: 'idea_generation',
            timestamp: new Date().toISOString(),
            status: 'completed',
          },
        });
        savedBaselinesRef.current.set(created.id, created);
        const updatedList = storage.getProjects();
        setProjects(updatedList);
        projectsRef.current = updatedList;
        setActiveProjectId(created.id);
        setActivePanel('develop');
        setSaveStatus('saved_local');
        setCurrentView('workspace');
        toast.success('Article Draft Created', `Loaded "${idea.title}" into Article Studio.`);
      });
    },
    [executeWithUnsavedGuard]
  );

  // Open existing project (Guarded for unsaved changes)
  const handleOpenProject = useCallback(
    (id: string) => {
      executeWithUnsavedGuard(() => {
        setActiveProjectId(id);
        setActivePanel(null);
        setCurrentView('workspace');
      });
    },
    [executeWithUnsavedGuard]
  );

  // Delete project
  const handleDeleteProject = (id: string) => {
    const found = projects.find((p) => p.id === id);
    storage.deleteProject(id);
    savedBaselinesRef.current.delete(id);
    conflictsByProjectRef.current.delete(id);
    const updatedList = storage.getProjects();
    setProjects(updatedList);
    projectsRef.current = updatedList;
    if (activeProjectId === id) {
      setActiveProjectId(null);
      setActivePanel(null);
      setCurrentView('dashboard');
    }
    toast.info('Project Deleted', `"${found?.title || 'Project'}" has been removed.`);
  };

  // Rename project on Dashboard
  const handleRenameProject = (id: string, newTitle: string) => {
    const updated = storage.renameProject(id, newTitle);
    if (updated) {
      savedBaselinesRef.current.set(id, updated);
    }
    const updatedList = storage.getProjects();
    setProjects(updatedList);
    projectsRef.current = updatedList;
    toast.info('Title Updated', `Renamed to "${newTitle}".`);
  };

  // Duplicate project on Dashboard
  const handleDuplicateProject = (project: WritingProject) => {
    const copyTitle = `Copy of ${project.title || 'Untitled Draft'}`;
    const duplicated: WritingProject = {
      ...project,
      id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title: copyTitle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      cloudRevision: undefined,
      baseCloudRevision: 0,
      hasUnsyncedLocalSave: true,
      versionHistory: createVersionSnapshot(
        { ...project, title: copyTitle },
        'manual_save',
        { label: `Initial duplicate from "${project.title}"`, force: true }
      ),
    };
    storage.saveProject(duplicated);
    savedBaselinesRef.current.set(duplicated.id, duplicated);
    const updatedList = storage.getProjects();
    setProjects(updatedList);
    projectsRef.current = updatedList;
    toast.success('Project Duplicated', `Created "${copyTitle}".`);
  };

  // Update Status on Dashboard
  const handleUpdateStatus = (id: string, status: ProjectStatus) => {
    const updated = storage.updateProjectStatus(id, status);
    if (updated) {
      savedBaselinesRef.current.set(id, updated);
      const updatedList = storage.getProjects();
      setProjects(updatedList);
      projectsRef.current = updatedList;
      toast.info('Status Changed', `Project is now marked as ${status.replace('_', ' ')}.`);
    }
  };

  // Draft a specific section from Outline with AI
  const handleDraftSectionFromOutline = async (section: OutlineItem) => {
    if (!activeProject) return;
    try {
      const res = await geminiService.executeAction(activeProject, 'generate_section', {
        targetOutlineItem: section,
        scope: 'section',
      });
      if (res.ok && res.proposedText) {
        setDiffProposal({
          id: `prop-sec-${section.id}`,
          scopeDescription: `Outline Section: "${section.title}"`,
          targetText: '',
          proposedText: res.proposedText,
          explanation: res.explanation || `Drafted section based on "${section.title}".`,
          mode: 'insert',
        });
      }
    } catch (err) {
      console.error('Error drafting section:', err);
      toast.error('Drafting Failed', 'Could not generate outline section.');
    }
  };

  // Apply AI Diff Proposal
  const handleAcceptProposal = (proposal: DiffProposal) => {
    if (!activeProject) return;

    const historyWithCheckpoint = createVersionSnapshot(activeProject, 'before_ai_edit', {
      label: proposal.actionLabel || 'Before AI Edit',
    });

    if (
      editorRef.current &&
      proposal.range &&
      proposal.range.start !== undefined &&
      proposal.range.end !== undefined &&
      proposal.range.start !== proposal.range.end
    ) {
      try {
        editorRef.current
          .chain()
          .focus()
          .setTextSelection({ from: proposal.range.start, to: proposal.range.end })
          .insertContent(ensureSemanticHtml(proposal.proposedText))
          .run();

        const updatedHtml = editorRef.current.getHTML();
        handleUpdateActiveProject({
          ...activeProject,
          content: updatedHtml,
          editingNotes: activeProject.editingNotes?.length
            ? reconcileNotesWithHtmlContent(updatedHtml, activeProject.editingNotes)
            : activeProject.editingNotes,
          updatedAt: new Date().toISOString(),
          versionHistory: historyWithCheckpoint,
        });
        setDiffProposal(null);
        toast.success('AI Edit Applied', 'Prose updated in editor. Click Save to commit.');
        return;
      } catch (e) {
        console.warn('ProseMirror selection replacement failed, falling back to string replace:', e);
      }
    }

    let newContent = activeProject.content;
    if (proposal.mode === 'insert') {
      newContent = `${activeProject.content}<p>${ensureSemanticHtml(proposal.proposedText)}</p>`;
    } else if (proposal.targetText && activeProject.content.includes(proposal.targetText)) {
      newContent = activeProject.content.replace(
        proposal.targetText,
        ensureSemanticHtml(proposal.proposedText)
      );
    } else {
      newContent = `${activeProject.content}\n${ensureSemanticHtml(proposal.proposedText)}`;
    }

    if (editorRef.current) {
      editorRef.current.commands.setContent(newContent, { emitUpdate: false });
    }
    window.dispatchEvent(
      new CustomEvent('sog:restore-editor-content', {
        detail: { content: newContent, projectId: activeProject.id },
      })
    );

    handleUpdateActiveProject({
      ...activeProject,
      content: newContent,
      editingNotes: activeProject.editingNotes?.length
        ? reconcileNotesWithHtmlContent(newContent, activeProject.editingNotes)
        : activeProject.editingNotes,
      updatedAt: new Date().toISOString(),
      versionHistory: historyWithCheckpoint,
    });
    setDiffProposal(null);
    toast.success('AI Edit Applied', 'Prose updated in editor. Click Save to commit.');
  };

  // Internal link opportunity acceptance
  const handleAcceptLinkOpportunity = (opp: LinkOpportunity) => {
    if (!activeProject) return;

    if (!isValidUrl(opp.linkUrl)) {
      toast.error('Invalid URL', `Destination URL "${opp.linkUrl}" is invalid.`);
      return;
    }

    if (isUrlAlreadyInDocument(opp.linkUrl, activeProject.content)) {
      toast.error(
        'Duplicate Link Prevented',
        `Destination "${opp.linkTitle}" (${opp.linkUrl}) is already linked in this article.`
      );
      return;
    }

    const res = applyHyperlinkToHtml(
      activeProject.content,
      opp.suggestedAnchor,
      opp.linkUrl,
      opp.targetPassage
    );

    if (!res.applied || !isUrlAlreadyInDocument(opp.linkUrl, res.updatedHtml)) {
      toast.error(
        'Insertion Not Applied',
        `Could not locate the passage or anchor "${opp.suggestedAnchor}" in the current draft. Please verify the draft text.`
      );
      return;
    }

    const historyWithCheckpoint = createVersionSnapshot(activeProject, 'before_ai_edit', {
      label: `Link: ${opp.linkTitle}`,
    });

    const updatedOpportunities = (activeProject.linkOpportunities || []).map((o) =>
      o.id === opp.id ? { ...o, status: 'accepted' as const } : o
    );

    if (editorRef.current) {
      editorRef.current.commands.setContent(res.updatedHtml, { emitUpdate: false });
    }
    window.dispatchEvent(
      new CustomEvent('sog:restore-editor-content', {
        detail: { content: res.updatedHtml, projectId: activeProject.id },
      })
    );

    handleUpdateActiveProject({
      ...activeProject,
      content: res.updatedHtml,
      editingNotes: activeProject.editingNotes?.length
        ? reconcileNotesWithHtmlContent(res.updatedHtml, activeProject.editingNotes)
        : activeProject.editingNotes,
      linkOpportunities: updatedOpportunities,
      versionHistory: historyWithCheckpoint,
    });
    toast.success('Internal Link Inserted', `Linked "${opp.suggestedAnchor}" to ${opp.linkTitle}.`);
  };

  const handleAcceptAllLinkOpportunities = (opps: LinkOpportunity[]) => {
    if (!activeProject || opps.length === 0) return;

    let currentHtml = activeProject.content;
    const insertedIds: string[] = [];
    const skippedItems: string[] = [];

    opps.forEach((opp) => {
      if (!isValidUrl(opp.linkUrl)) {
        skippedItems.push(`Invalid URL: ${opp.linkTitle}`);
        return;
      }
      if (isUrlAlreadyInDocument(opp.linkUrl, currentHtml)) {
        skippedItems.push(`Already linked: ${opp.linkTitle}`);
        return;
      }
      const res = applyHyperlinkToHtml(
        currentHtml,
        opp.suggestedAnchor,
        opp.linkUrl,
        opp.targetPassage
      );
      if (res.applied && isUrlAlreadyInDocument(opp.linkUrl, res.updatedHtml)) {
        currentHtml = res.updatedHtml;
        insertedIds.push(opp.id);
      } else {
        skippedItems.push(`Passage not matched: ${opp.suggestedAnchor}`);
      }
    });

    if (insertedIds.length === 0) {
      toast.error(
        'Insertion Failed',
        skippedItems.length > 0 ? skippedItems.join('; ') : 'Could not insert recommendations.'
      );
      return;
    }

    const historyWithCheckpoint = createVersionSnapshot(activeProject, 'before_ai_edit', {
      label: `Bulk Inserted ${insertedIds.length} Internal Links`,
    });

    const updatedOpportunities = (activeProject.linkOpportunities || []).map((o) =>
      insertedIds.includes(o.id) ? { ...o, status: 'accepted' as const } : o
    );

    if (editorRef.current) {
      editorRef.current.commands.setContent(currentHtml, { emitUpdate: false });
    }
    window.dispatchEvent(
      new CustomEvent('sog:restore-editor-content', {
        detail: { content: currentHtml, projectId: activeProject.id },
      })
    );

    handleUpdateActiveProject({
      ...activeProject,
      content: currentHtml,
      editingNotes: activeProject.editingNotes?.length
        ? reconcileNotesWithHtmlContent(currentHtml, activeProject.editingNotes)
        : activeProject.editingNotes,
      linkOpportunities: updatedOpportunities,
      versionHistory: historyWithCheckpoint,
    });

    if (insertedIds.length === opps.length) {
      toast.success('Internal Links Inserted', `Applied ${insertedIds.length} link opportunities.`);
    } else {
      toast.warning(
        'Partial Insertion',
        `Applied ${insertedIds.length} of ${opps.length} links. (${skippedItems.length} skipped)`
      );
    }
  };

  const handleRejectLinkOpportunity = (oppId: string) => {
    if (!activeProject) return;
    const updatedOpportunities = (activeProject.linkOpportunities || []).map((o) =>
      o.id === oppId ? { ...o, status: 'rejected' as const } : o
    );
    handleUpdateActiveProject({
      ...activeProject,
      linkOpportunities: updatedOpportunities,
    });
  };

  const handleRestoreLinkOpportunity = (oppId: string) => {
    if (!activeProject) return;
    const updatedOpportunities = (activeProject.linkOpportunities || []).map((o) =>
      o.id === oppId ? { ...o, status: 'pending' as const } : o
    );
    handleUpdateActiveProject({
      ...activeProject,
      linkOpportunities: updatedOpportunities,
    });
    toast.success('Recommendation Restored', 'Returned to active recommendations.');
  };

  const handleRejectAllLinkOpportunities = () => {
    if (!activeProject) return;
    const updatedOpportunities = (activeProject.linkOpportunities || []).map((o) => ({
      ...o,
      status: 'rejected' as const,
    }));
    handleUpdateActiveProject({
      ...activeProject,
      linkOpportunities: updatedOpportunities,
    });
  };

  // Phase 7: Accept Single Review Finding
  const handleAcceptReviewFinding = (finding: ReviewFinding) => {
    if (!activeProject || !finding.proposedText) return;
    const historyWithCheckpoint = createVersionSnapshot(activeProject, 'before_ai_edit', {
      label: `Editorial Fix: ${finding.category}`,
    });

    let newContent = activeProject.content;
    if (finding.originalText && activeProject.content.includes(finding.originalText)) {
      newContent = activeProject.content.replace(
        finding.originalText,
        ensureSemanticHtml(finding.proposedText)
      );
    } else {
      newContent = `${activeProject.content}\n${ensureSemanticHtml(finding.proposedText)}`;
    }

    const updatedReview: EditorialReviewResult = activeProject.editorialReview
      ? {
          ...activeProject.editorialReview,
          findings: activeProject.editorialReview.findings.map((f) =>
            f.id === finding.id ? { ...f, status: 'accepted' as const } : f
          ),
        }
      : {
          id: `rev-${Date.now()}`,
          reviewedAt: new Date().toISOString(),
          scope: 'all',
          qualitativeSummary: '',
          counts: { critical: 0, important: 0, minor: 0, suggestion: 1 },
          findings: [{ ...finding, status: 'accepted' }],
          mode: 'full',
        };

    if (editorRef.current) {
      editorRef.current.commands.setContent(newContent, { emitUpdate: false });
    }
    window.dispatchEvent(
      new CustomEvent('sog:restore-editor-content', {
        detail: { content: newContent, projectId: activeProject.id },
      })
    );

    handleUpdateActiveProject({
      ...activeProject,
      content: newContent,
      editingNotes: activeProject.editingNotes?.length
        ? reconcileNotesWithHtmlContent(newContent, activeProject.editingNotes)
        : activeProject.editingNotes,
      editorialReview: updatedReview,
      versionHistory: historyWithCheckpoint,
    });
    toast.success('Editorial Fix Applied', 'Finding applied in editor. Click Save to commit.');
  };

  // Accept All Pending Review Findings
  const handleAcceptAllReviewFindings = (pendingFindings: ReviewFinding[]) => {
    if (!activeProject || !activeProject.editorialReview) return;
    const historyWithCheckpoint = createVersionSnapshot(activeProject, 'before_ai_edit', {
      label: `Accept All (${pendingFindings.length} Review Findings)`,
    });

    let currentHtml = activeProject.content;
    pendingFindings.forEach((f) => {
      if (f.proposedText && f.originalText && currentHtml.includes(f.originalText)) {
        currentHtml = currentHtml.replace(f.originalText, ensureSemanticHtml(f.proposedText));
      }
    });

    const updatedReview: EditorialReviewResult = {
      ...activeProject.editorialReview,
      findings: activeProject.editorialReview.findings.map((f) =>
        pendingFindings.some((p) => p.id === f.id) ? { ...f, status: 'accepted' as const } : f
      ),
    };

    if (editorRef.current) {
      editorRef.current.commands.setContent(currentHtml, { emitUpdate: false });
    }
    window.dispatchEvent(
      new CustomEvent('sog:restore-editor-content', {
        detail: { content: currentHtml, projectId: activeProject.id },
      })
    );

    handleUpdateActiveProject({
      ...activeProject,
      content: currentHtml,
      editingNotes: activeProject.editingNotes?.length
        ? reconcileNotesWithHtmlContent(currentHtml, activeProject.editingNotes)
        : activeProject.editingNotes,
      editorialReview: updatedReview,
      versionHistory: historyWithCheckpoint,
    });
    toast.success('All Findings Applied', `Applied ${pendingFindings.length} editorial suggestions.`);
  };

  const handleRejectReviewFinding = (findingId: string) => {
    if (!activeProject || !activeProject.editorialReview) return;
    const updatedReview: EditorialReviewResult = {
      ...activeProject.editorialReview,
      findings: activeProject.editorialReview.findings.map((f) =>
        f.id === findingId ? { ...f, status: 'rejected' as const } : f
      ),
    };
    handleUpdateActiveProject({
      ...activeProject,
      editorialReview: updatedReview,
    });
  };

  const handleRejectAllReviewFindings = () => {
    if (!activeProject || !activeProject.editorialReview) return;
    const updatedReview: EditorialReviewResult = {
      ...activeProject.editorialReview,
      findings: activeProject.editorialReview.findings.map((f) => ({
        ...f,
        status: 'rejected' as const,
      })),
    };
    handleUpdateActiveProject({
      ...activeProject,
      editorialReview: updatedReview,
    });
  };

  const handleUpdateReview = (reviewResult: EditorialReviewResult) => {
    if (!activeProject) return;
    handleUpdateActiveProject({
      ...activeProject,
      editorialReview: reviewResult,
    });
  };

  // Phase 8: Quality Control handlers
  const handleUpdateQC = (qcResult: QCResult) => {
    if (!activeProject) return;
    handleUpdateActiveProject({
      ...activeProject,
      qualityControl: qcResult,
    });
  };

  const handleApplyQCFix = (finding: QCFinding) => {
    if (!activeProject || !finding.proposedText) return;
    const historyWithCheckpoint = createVersionSnapshot(activeProject, 'before_qc', {
      label: `QC Fix: ${finding.title}`,
    });

    let newContent = activeProject.content;
    if (finding.targetText && activeProject.content.includes(finding.targetText)) {
      newContent = activeProject.content.replace(
        finding.targetText,
        ensureSemanticHtml(finding.proposedText)
      );
    } else {
      newContent = `${activeProject.content}\n${ensureSemanticHtml(finding.proposedText)}`;
    }

    const updatedQC: QCResult = activeProject.qualityControl
      ? {
          ...activeProject.qualityControl,
          findings: activeProject.qualityControl.findings.map((f) =>
            f.id === finding.id ? { ...f, targetText: undefined } : f
          ),
        }
      : {
          id: `qc-${Date.now()}`,
          runAt: new Date().toISOString(),
          documentLengthAtRun: activeProject.content.length,
          status: 'ready',
          summary: '',
          counts: { critical: 0, warning: 0, suggestion: 0 },
          findings: [finding],
          categoryChecks: [],
        };

    if (editorRef.current) {
      editorRef.current.commands.setContent(newContent, { emitUpdate: false });
    }
    window.dispatchEvent(
      new CustomEvent('sog:restore-editor-content', {
        detail: { content: newContent, projectId: activeProject.id },
      })
    );

    handleUpdateActiveProject({
      ...activeProject,
      content: newContent,
      editingNotes: activeProject.editingNotes?.length
        ? reconcileNotesWithHtmlContent(newContent, activeProject.editingNotes)
        : activeProject.editingNotes,
      qualityControl: updatedQC,
      versionHistory: historyWithCheckpoint,
    });
    toast.success('QC Fix Applied', `Resolved: ${finding.title}.`);
  };

  const getSelectedText = () => {
    if (editorRef.current) {
      try {
        const { from, to } = editorRef.current.state.selection;
        const liveText = editorRef.current.state.doc.textBetween(from, to, ' ').trim();
        if (liveText) {
          return liveText;
        }
      } catch (e) {
        console.warn('Failed to extract selection from editorRef:', e);
      }
    }
    return savedSelectedText;
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#faf9f6] text-[#1e232a] font-ui antialiased selection:bg-amber-100 selection:text-amber-950">
      {/* Toast Notifications */}
      <ToastContainer />

      {/* Two-Level Global Navigation & Project Toolbar */}
      <Navigation
        currentView={currentView}
        activeProject={activeProject}
        saveStatus={saveStatus}
        onManualSave={() => handleManualSave()}
        onRetrySave={handleRetrySave}
        onOpenConflictModal={() => {
          if (activeProject) {
            const c = conflictsByProjectRef.current.get(activeProject.id);
            if (c) setActiveConflict(c);
          }
        }}
        activePanel={activePanel}
        onTogglePanel={handleTogglePanel}
        onNavigate={(view, projectType) => {
          executeWithUnsavedGuard(() => {
            setActivePanel(null);
            if (view === 'dashboard') {
              if (projectType) {
                const existing = projectsRef.current.find((p) => p.type === projectType);
                if (existing) {
                  setActiveProjectId(existing.id);
                  setCurrentView('workspace');
                  return;
                } else {
                  const created = storage.createProject(projectType);
                  savedBaselinesRef.current.set(created.id, created);
                  const updatedList = storage.getProjects();
                  setProjects(updatedList);
                  projectsRef.current = updatedList;
                  setActiveProjectId(created.id);
                  setSaveStatus('saved_local');
                  setCurrentView('workspace');
                  return;
                }
              }
              setCurrentView('dashboard');
            } else if (view === 'idea_generator') {
              setCurrentView('idea_generator');
            } else if (view === 'research') {
              setActiveResearchStudyId(null);
              setCurrentView('research');
            } else if (view === 'style_reference') {
              setCurrentView('style_reference');
            } else if (view === 'internal_links') {
              setCurrentView('internal_links');
            } else if (view === 'backup') {
              setCurrentView('backup');
            } else {
              setCurrentView('settings');
            }
          });
        }}
        onCreateProject={handleCreateProject}
      />

      {/* In-Document Search Floating Bar */}
      {currentView === 'workspace' && isFindOpen && (
        <div className="fixed top-24 sm:top-20 right-3 sm:right-6 left-3 sm:left-auto max-w-sm z-40 animate-fade-in">
          <FindInDocumentBar
            isOpen={isFindOpen}
            onClose={() => {
              setIsFindOpen(false);
              clearHighlights();
            }}
            onSearchChange={(q) => performSearch(q)}
            totalMatches={searchMatchCount}
            currentMatchIndex={searchMatchIndex}
            onNextMatch={nextMatch}
            onPrevMatch={prevMatch}
          />
        </div>
      )}

      {/* Workspace Area: Main Content + Right Side Panel */}
      <div className="flex-1 flex overflow-hidden min-h-0 relative">
        <main
          className="flex-1 min-w-0 flex flex-col overflow-hidden relative"
          ref={workspaceContainerRef}
        >
          <ErrorBoundary onReset={() => setProjects(storage.getProjects())}>
            {currentView === 'dashboard' && (
              <Dashboard
                projects={projects}
                onOpenProject={handleOpenProject}
                onCreateProject={handleCreateProject}
                onDeleteProject={handleDeleteProject}
                onDuplicateProject={handleDuplicateProject}
                onUpdateStatus={handleUpdateStatus}
                onRenameProject={handleRenameProject}
                onOpenIdeaGenerator={() => setCurrentView('idea_generator')}
              />
            )}

            {currentView === 'idea_generator' && (
              <IdeaGeneratorView
                onUseIdea={handleUseIdea}
                onBackToStudio={() => setCurrentView(activeProjectId ? 'workspace' : 'dashboard')}
              />
            )}

            {/* Research Library (Top-Level Area & Workspace) */}
            {currentView === 'research' && !activeResearchStudyId && (
              <ResearchLibraryView
                onOpenStudy={(studyId) => setActiveResearchStudyId(studyId)}
                onBackToStudio={() => setCurrentView(activeProjectId ? 'workspace' : 'dashboard')}
                onUseIdea={handleUseIdea}
              />
            )}

            {currentView === 'research' && activeResearchStudyId && (
              <ResearchStudyWorkspace
                study={
                  storage.getResearchStudy(activeResearchStudyId) ||
                  storage.getResearchStudies()[0]
                }
                onBack={() => setActiveResearchStudyId(null)}
                onUpdateStudy={() => {
                  // study saved in persistent storage
                }}
                onDeleteStudy={(studyId) => {
                  storage.deleteResearchStudy(studyId);
                  setActiveResearchStudyId(null);
                  toast.success('Study Deleted', 'Removed study from Research Library.');
                }}
                onUseIdea={handleUseIdea}
              />
            )}

            {currentView === 'backup' && (
              <DataBackupView
                onBackToStudio={() => setCurrentView(activeProjectId ? 'workspace' : 'dashboard')}
              />
            )}

            {currentView === 'settings' && (
              <SettingsView
                onBackToStudio={() => setCurrentView(activeProjectId ? 'workspace' : 'dashboard')}
                onNavigateToBackup={() => setCurrentView('backup')}
              />
            )}

            {currentView === 'style_reference' && (
              <StyleReferenceView
                onBackToStudio={() => setCurrentView(activeProjectId ? 'workspace' : 'dashboard')}
                activeProjectTitle={activeProject?.title}
                activeProjectProfileId={activeProject?.styleProfileId}
                onApplyProfileToActiveProject={(profileId) => {
                  if (activeProject) {
                    handleUpdateActiveProject({
                      ...activeProject,
                      styleProfileId: profileId,
                    });
                  }
                }}
              />
            )}

            {currentView === 'internal_links' && (
              <InternalLinksView
                onBackToStudio={() => setCurrentView(activeProjectId ? 'workspace' : 'dashboard')}
              />
            )}

            {/* Phase 5: Specialized Gift Guide Studio */}
            {currentView === 'workspace' &&
              activeProject &&
              activeProject.type === 'gift_guide' && (
                <GiftGuideWorkspace
                  project={activeProject}
                  editorRef={editorRef}
                  activePanel={activePanel}
                  onTogglePanel={handleTogglePanel}
                  onChange={handleUpdateActiveProject}
                  onRequestProposal={(prop) => setDiffProposal(prop)}
                />
              )}

            {/* Phase 6: Specialized Product Copy Studio */}
            {currentView === 'workspace' &&
              activeProject &&
              activeProject.type === 'product_copy' && (
                <ProductCopyWorkspace
                  project={activeProject}
                  editorRef={editorRef}
                  activePanel={activePanel}
                  onTogglePanel={handleTogglePanel}
                  onChange={handleUpdateActiveProject}
                  onRequestProposal={(prop) => setDiffProposal(prop)}
                />
              )}

            {/* Phase 2: Article Workspace */}
            {currentView === 'workspace' && activeProject && activeProject.type === 'article' && (
              <ArticleWorkspace
                project={activeProject}
                editorRef={editorRef}
                activePanel={activePanel}
                onTogglePanel={handleTogglePanel}
                onOpenOutline={() => setActivePanel('outline')}
                onOpenBrief={() => setActivePanel('brief')}
                onOpenDraftPackage={() => setActivePanel('draft_package')}
                onChange={handleUpdateActiveProject}
                onRequestProposal={(prop) => setDiffProposal(prop)}
              />
            )}
          </ErrorBoundary>
        </main>

        {/* Side Panels - Mutually Exclusive Accordion / Drawer System (Exactly 0 or 1 open) */}
        {currentView === 'workspace' && activeProject && activePanel === 'develop' && (
          <EditorialDevelopmentDrawer
            isOpen={true}
            onClose={handleClosePanel}
            project={activeProject}
            onChange={handleUpdateActiveProject}
            onOpenOutline={() => setActivePanel('outline')}
          />
        )}

        {currentView === 'workspace' && activeProject && activePanel === 'brief' && (
          <ProjectBriefDrawer
            isOpen={true}
            onClose={handleClosePanel}
            brief={activeProject.brief}
            onChange={(updatedBrief) =>
              handleUpdateActiveProject({ ...activeProject, brief: updatedBrief })
            }
            onOpenDevelop={
              activeProject.type === 'article' ? () => setActivePanel('develop') : undefined
            }
          />
        )}

        {currentView === 'workspace' && activeProject && activePanel === 'outline' && (
          <ContentOutlineDrawer
            isOpen={true}
            onClose={handleClosePanel}
            project={activeProject}
            outline={activeProject.outline}
            onChange={(updatedOutline) =>
              handleUpdateActiveProject({ ...activeProject, outline: updatedOutline })
            }
            onUpdateProject={handleUpdateActiveProject}
            onDraftSection={handleDraftSectionFromOutline}
            onOpenDevelop={() => setActivePanel('develop')}
            onOpenDraftPackage={() => setActivePanel('draft_package')}
          />
        )}

        {currentView === 'workspace' && activeProject && activePanel === 'draft_package' && (
          <DraftPackageDrawer
            isOpen={true}
            onClose={handleClosePanel}
            project={activeProject}
            onUpdateProject={handleUpdateActiveProject}
            onOpenOutline={() => setActivePanel('outline')}
            onOpenDevelop={() => setActivePanel('develop')}
          />
        )}

        {currentView === 'workspace' && activeProject && activePanel === 'rules' && (
          <ContentRulesDrawer
            isOpen={true}
            onClose={handleClosePanel}
            rules={activeProject.contentRules}
            onChange={(updatedRules) =>
              handleUpdateActiveProject({ ...activeProject, contentRules: updatedRules })
            }
          />
        )}

        {currentView === 'workspace' && activeProject && activePanel === 'controls' && (
          <StyleSettingsDrawer
            isOpen={true}
            onClose={handleClosePanel}
            settings={activeProject.writingControls}
            styleProfileId={activeProject.styleProfileId}
            modelOverride={activeProject.modelOverride}
            onModelOverrideChange={(newModel) =>
              handleUpdateActiveProject({
                ...activeProject,
                modelOverride: newModel,
              })
            }
            onStyleProfileChange={(newProfileId) =>
              handleUpdateActiveProject({
                ...activeProject,
                styleProfileId: newProfileId,
              })
            }
            onChange={(updatedSettings) =>
              handleUpdateActiveProject({
                ...activeProject,
                writingControls: updatedSettings,
                aiSettings: updatedSettings,
              })
            }
          />
        )}

        {currentView === 'workspace' && activeProject && activePanel === 'instructions' && (
          <ProjectInstructionsDrawer
            isOpen={true}
            onClose={handleClosePanel}
            projectTitle={activeProject.title}
            instructions={activeProject.projectInstructions}
            onChange={(updatedInstructions) =>
              handleUpdateActiveProject({
                ...activeProject,
                projectInstructions: updatedInstructions,
              })
            }
          />
        )}

        {currentView === 'workspace' && activeProject && activePanel === 'links' && (
          <LinkOpportunitiesDrawer
            isOpen={true}
            onClose={handleClosePanel}
            project={activeProject}
            editorRef={editorRef}
            onUpdateOpportunities={(opps) =>
              handleUpdateActiveProject({
                ...activeProject,
                linkOpportunities: opps,
              })
            }
            onAcceptOpportunity={handleAcceptLinkOpportunity}
            onAcceptAllOpportunities={handleAcceptAllLinkOpportunities}
            onRejectOpportunity={handleRejectLinkOpportunity}
            onRestoreOpportunity={handleRestoreLinkOpportunity}
            onRejectAllOpportunities={handleRejectAllLinkOpportunities}
          />
        )}

        {/* Editorial Intelligence Drawer */}
        {currentView === 'workspace' &&
          activeProject &&
          (activePanel === 'review' || activePanel === 'qc') && (
            <EditorialIntelligenceDrawer
              isOpen={true}
              onClose={handleClosePanel}
              project={activeProject}
              selectedText={getSelectedText()}
              defaultTab={activePanel === 'qc' ? 'qc' : 'review'}
              onUpdateReview={handleUpdateReview}
              onAcceptFinding={handleAcceptReviewFinding}
              onAcceptAllFindings={handleAcceptAllReviewFindings}
              onRejectFinding={handleRejectReviewFinding}
              onRejectAllFindings={handleRejectAllReviewFindings}
              onUpdateQC={handleUpdateQC}
              onRequestProposal={(prop) => setDiffProposal(prop)}
              onApplyFix={handleApplyQCFix}
              onOpenCitationStudio={() => setActivePanel('citations')}
            />
          )}

        {currentView === 'workspace' && activeProject && activePanel === 'history' && (
          <VersionHistoryDrawer
            isOpen={true}
            onClose={handleClosePanel}
            project={activeProject}
            onUpdateProject={handleUpdateActiveProject}
            onRestoreVersion={handleRestoreProjectVersion}
          />
        )}

        {/* Research Drawer */}
        {currentView === 'workspace' && activeProject && activePanel === 'research' && (
          <ResearchDrawer
            isOpen={true}
            onClose={handleClosePanel}
            project={activeProject}
            onUpdateProject={handleUpdateActiveProject}
            onNavigateToResearchLibrary={() =>
              executeWithUnsavedGuard(() => setCurrentView('research'))
            }
            onOpenCitationStudio={() => setActivePanel('citations')}
          />
        )}

        {/* Citation Studio Drawer */}
        {currentView === 'workspace' && activeProject && activePanel === 'citations' && (
          <CitationStudioDrawer
            isOpen={true}
            onClose={handleClosePanel}
            project={activeProject}
            onUpdateProject={handleUpdateActiveProject}
            editorRef={editorRef}
            onNavigateToResearchLibrary={() =>
              executeWithUnsavedGuard(() => setCurrentView('research'))
            }
          />
        )}
      </div>

      {/* Unsaved Changes Navigation Protection Modal (Requirement 3) */}
      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        projectTitle={activeProject?.title}
        isSaving={saveStatus === 'saving_local' || saveStatus === 'saving_cloud'}
        onSaveAndLeave={handleSaveAndLeave}
        onDiscardAndLeave={handleDiscardAndLeave}
        onStay={handleStayOnPage}
      />

      {/* Cloud Revision Conflict Resolution Modal (Requirement 5 & 7) */}
      <ConflictResolutionModal
        conflict={activeConflict}
        isResolving={isResolvingConflict}
        onAdoptCloud={handleAdoptCloudConflict}
        onKeepSeparateCopy={handleKeepSeparateCopyConflict}
        onOverwriteCloud={handleOverwriteCloudConflict}
        onClose={() => setActiveConflict(null)}
      />

      {/* AI Diff Proposal Review Modal */}
      <DiffReviewModal
        proposal={diffProposal}
        onAccept={handleAcceptProposal}
        onReject={() => setDiffProposal(null)}
      />
    </div>
  );
}
