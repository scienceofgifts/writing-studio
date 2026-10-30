/**
 * Science of Gifts - Cloud-Authoritative Synchronization Engine
 * Implements:
 * - Manual-only project saving (no automatic blanket uploads of projects)
 * - Safe initial login reconciliation (cloud version takes precedence over stale local data)
 * - Transactional server-grounded revision concurrency protection (prevents stale cloud writes)
 * - Atomic dual-persistence of project document and independent version history subcollection
 * - Conflict detection and recovery callbacks
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
  getDoc,
  runTransaction,
} from 'firebase/firestore';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType, signInWithGoogle, signOutUser } from './firebase';
import { storage, StorageChangeDetail } from './storage';
import { WritingProject, ProjectConflictInfo } from '../types/project';
import { ProjectVersionSnapshot } from '../types/versionHistory';
import { hasProjectUnsavedChanges, mergeVersionHistories } from './versionHistoryService';
import { StyleProfile } from '../types/styleReference';
import { InternalLink } from '../types/internalLink';
import { ResearchStudy, ResearchClaim } from '../types/research';
import { SavedEditorialIdea } from '../types/ideaGenerator';
import { GlobalInstruction } from '../types/project';

export type SyncStatus = 'signed_out' | 'syncing' | 'synced' | 'offline' | 'error';

export interface SyncStatusInfo {
  status: SyncStatus;
  user: User | null;
  lastSyncedAt: string | null;
  errorMessage: string | null;
  isOnline: boolean;
}

export type CloudSaveResult =
  | {
      ok: true;
      status: 'saved_cloud';
      cloudRevision: number;
      syncedAt: string;
      updatedProject: WritingProject;
    }
  | {
      ok: false;
      status: 'conflict';
      conflict: ProjectConflictInfo;
    }
  | {
      ok: false;
      status: 'cloud_save_failed';
      error: string;
    };

export interface ActiveEditorState {
  projectId: string | null;
  workingProject: WritingProject | null;
  hasUnsavedChanges: boolean;
}

/**
 * Injectable cloud store adapter interface for deterministic multi-device runtime verification
 * while defaulting to real Firebase Firestore in production.
 */
export interface CloudStoreAdapter {
  fetchUserProjects(userId: string): Promise<WritingProject[]>;
  fetchProjectVersions(userId: string, projectId: string): Promise<ProjectVersionSnapshot[]>;
  transactionalSaveProject(
    userId: string,
    project: WritingProject,
    versionSnapshot: ProjectVersionSnapshot,
    expectedBaseRevision: number
  ): Promise<{ newCloudRevision: number; syncedAt: string }>;
  writeDoc?(userId: string, collectionName: string, docId: string, data: any): Promise<void>;
  deleteDoc?(userId: string, collectionName: string, docId: string): Promise<void>;
}

export class StaleRevisionConflictError extends Error {
  public remoteProject: WritingProject;
  public remoteRevision: number;
  public baseRevision: number;

  constructor(remoteProject: WritingProject, remoteRevision: number, baseRevision: number, message?: string) {
    super(
      message ||
        `Cloud revision conflict: editor was based on revision #${baseRevision}, but cloud is at revision #${remoteRevision}.`
    );
    this.name = 'StaleRevisionConflictError';
    this.remoteProject = remoteProject;
    this.remoteRevision = remoteRevision;
    this.baseRevision = baseRevision;
  }
}

const MAX_EMBEDDED_CLOUD_VERSIONS = 15;

class SyncEngine {
  private currentUser: User | null = null;
  private status: SyncStatus = 'signed_out';
  private lastSyncedAt: string | null = null;
  private errorMessage: string | null = null;
  private isOnline: boolean =
    typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
      ? navigator.onLine
      : true;

  private isApplyingRemote: boolean = false;
  private isInitialReconciliationComplete: boolean = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private activeUnsubscribers: Unsubscribe[] = [];
  private listeners: Set<(info: SyncStatusInfo) => void> = new Set();
  private conflictListeners: Set<(conflict: ProjectConflictInfo) => void> = new Set();
  private projectUpdateListeners: Set<(reconciledProjects: WritingProject[]) => void> = new Set();
  private activeEditorStateProvider: (() => ActiveEditorState) | null = null;
  private storageUnsubscribe: (() => void) | null = null;

  // Track specific changed non-project documents for fine-grained sync
  private pendingNonProjectChanges = new Map<string, StorageChangeDetail>();

  // Optional adapter and simulated network failure flag for runtime testing
  private customAdapter: CloudStoreAdapter | null = null;
  private simulateNetworkFailure: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
    }

    // Monitor Firebase Authentication
    try {
      onAuthStateChanged(auth, (user) => {
        this.handleAuthChange(user);
      });
    } catch (e) {
      console.warn('Firebase Auth listener setup notice:', e);
    }

    // Subscribe ONLY to non-project storage edits (projects use explicit manual save)
    setTimeout(() => {
      try {
        if (typeof storage !== 'undefined' && typeof storage.subscribe === 'function') {
          this.storageUnsubscribe = storage.subscribe((source, details) => {
            if (source === 'non_project') {
              this.handleNonProjectLocalEdit(details);
            }
          });
        }
      } catch (e) {
        console.warn('Storage subscription notice:', e);
      }
    }, 100);
  }

  // ==========================================
  // PUBLIC EVENT SUBSCRIBERS & HOOKS
  // ==========================================
  public subscribe(callback: (info: SyncStatusInfo) => void): () => void {
    this.listeners.add(callback);
    callback(this.getStatusInfo());
    return () => this.listeners.delete(callback);
  }

  public onConflict(callback: (conflict: ProjectConflictInfo) => void): () => void {
    this.conflictListeners.add(callback);
    return () => this.conflictListeners.delete(callback);
  }

  public onReconciledProjects(callback: (projects: WritingProject[]) => void): () => void {
    this.projectUpdateListeners.add(callback);
    return () => this.projectUpdateListeners.delete(callback);
  }

  public setActiveEditorStateProvider(provider: (() => ActiveEditorState) | null): void {
    this.activeEditorStateProvider = provider;
  }

  public setCustomAdapter(adapter: CloudStoreAdapter | null): void {
    this.customAdapter = adapter;
  }

  public setSimulateNetworkFailure(simulate: boolean): void {
    this.simulateNetworkFailure = simulate;
  }

  public setTestUser(user: User | null): void {
    this.currentUser = user;
    this.status = user ? 'synced' : 'signed_out';
    this.notifyStatusChange();
  }

  public getStatusInfo(): SyncStatusInfo {
    return {
      status: this.status,
      user: this.currentUser,
      lastSyncedAt: this.lastSyncedAt,
      errorMessage: this.errorMessage,
      isOnline: this.isOnline,
    };
  }

  private notifyStatusChange(): void {
    const info = this.getStatusInfo();
    this.listeners.forEach((fn) => {
      try {
        fn(info);
      } catch (err) {
        console.error('Sync listener error:', err);
      }
    });
  }

  private notifyConflict(conflict: ProjectConflictInfo): void {
    this.conflictListeners.forEach((fn) => {
      try {
        fn(conflict);
      } catch (err) {
        console.error('Conflict listener error:', err);
      }
    });
  }

  private notifyProjectsReconciled(projects: WritingProject[]): void {
    this.projectUpdateListeners.forEach((fn) => {
      try {
        fn(projects);
      } catch (err) {
        console.error('Project reconciliation listener error:', err);
      }
    });
  }

  // ==========================================
  // AUTHENTICATION & INITIALIZATION
  // ==========================================
  public async login(): Promise<User> {
    try {
      this.status = 'syncing';
      this.errorMessage = null;
      this.notifyStatusChange();
      const user = await signInWithGoogle();
      return user;
    } catch (err: any) {
      if (
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        this.status = 'signed_out';
        this.errorMessage = null;
        this.notifyStatusChange();
      } else if (err?.code === 'auth/popup-blocked') {
        this.status = 'signed_out';
        this.errorMessage = 'Sign-in popup was blocked by your browser. Please allow popups and try again.';
        this.notifyStatusChange();
      } else {
        this.status = 'error';
        this.errorMessage = err?.message || 'Failed to sign in with Google.';
        this.notifyStatusChange();
      }
      throw err;
    }
  }

  public async logout(): Promise<void> {
    try {
      this.detachSnapshotListeners();
      if (!this.customAdapter) {
        await signOutUser();
      }
      this.currentUser = null;
      this.isInitialReconciliationComplete = false;
      this.status = 'signed_out';
      this.notifyStatusChange();
    } catch (err: any) {
      console.error('Logout error:', err);
    }
  }

  public async handleAuthChange(user: User | null): Promise<void> {
    this.currentUser = user;
    this.isInitialReconciliationComplete = false;

    if (!user) {
      this.detachSnapshotListeners();
      this.status = 'signed_out';
      this.errorMessage = null;
      this.notifyStatusChange();
      return;
    }

    if (!this.isOnline || this.simulateNetworkFailure) {
      this.status = 'offline';
      this.notifyStatusChange();
      return;
    }

    try {
      this.status = 'syncing';
      this.errorMessage = null;
      this.notifyStatusChange();

      // Step 1: Perform safe initial reconciliation (Cloud takes precedence over stale local copies)
      await this.performInitialTwoWayMerge(user.uid);
      this.isInitialReconciliationComplete = true;

      // Step 2: Attach real-time snapshot listeners for remote changes
      if (!this.customAdapter) {
        this.attachSnapshotListeners(user.uid);
      }

      // Step 3: Flush any pending non-project changes queued prior to reconciliation
      if (this.pendingNonProjectChanges.size > 0) {
        await this.pushNonProjectChangesToFirestore();
      }

      this.status = 'synced';
      this.lastSyncedAt = new Date().toISOString();
      this.notifyStatusChange();
    } catch (err: any) {
      console.error('Initial sync error:', err);
      
      const errorStr = err?.message || String(err);
      if (errorStr.includes('token-service-api-has-not-been-used-in-project') || errorStr.includes('securetoken.googleapis.com')) {
        this.status = 'offline';
        this.errorMessage = 'Cloud Sync is disabled. The "Secure Token Service API" must be enabled in your Google Cloud Console for this project ID.';
      } else {
        this.status = 'error';
        this.errorMessage = err?.message || 'Failed to initialize cloud synchronization.';
      }
      this.notifyStatusChange();
    }
  }

  private handleNetworkChange(online: boolean): void {
    this.isOnline = online;
    if (!online) {
      this.status = 'offline';
      this.notifyStatusChange();
    } else if (this.currentUser) {
      this.retrySync();
    } else {
      this.status = 'signed_out';
      this.notifyStatusChange();
    }
  }

  public async retrySync(): Promise<void> {
    if (!this.currentUser) return;
    if (!this.isOnline || this.simulateNetworkFailure) {
      this.status = 'offline';
      this.notifyStatusChange();
      return;
    }

    try {
      this.status = 'syncing';
      this.errorMessage = null;
      this.notifyStatusChange();

      await this.performInitialTwoWayMerge(this.currentUser.uid);
      this.isInitialReconciliationComplete = true;
      if (!this.customAdapter) {
        this.attachSnapshotListeners(this.currentUser.uid);
      }

      // Flush any pending non-project changes on retry
      if (this.pendingNonProjectChanges.size > 0) {
        await this.pushNonProjectChangesToFirestore();
      }

      this.status = 'synced';
      this.lastSyncedAt = new Date().toISOString();
      this.notifyStatusChange();
    } catch (err: any) {
      this.status = 'error';
      this.errorMessage = err?.message || 'Cloud sync retry failed.';
      this.notifyStatusChange();
    }
  }

  // ==========================================
  // CONCURRENCY-SAFE TRANSACTIONAL CLOUD SAVE
  // ==========================================
  /**
   * Saves a single intentionally committed project and its version snapshot to Firestore
   * using a server-grounded revision check inside an atomic transaction.
   * Rejects stale writes if the cloud revision has advanced past expectedBaseRevision.
   */
  public async saveProjectToCloud(
    project: WritingProject,
    versionSnapshot: ProjectVersionSnapshot,
    options?: { forceOverwriteRevision?: number }
  ): Promise<CloudSaveResult> {
    if (!this.currentUser) {
      return {
        ok: false,
        status: 'cloud_save_failed',
        error: 'Not signed in to Cloud Sync.',
      };
    }

    if (!this.isOnline || this.simulateNetworkFailure) {
      this.status = 'error';
      this.errorMessage = 'Network unavailable during cloud save.';
      this.notifyStatusChange();
      return {
        ok: false,
        status: 'cloud_save_failed',
        error: 'Network connection failed while saving to cloud. Your changes are safely saved locally.',
      };
    }

    const userId = this.currentUser.uid;
    const expectedBaseRevision =
      options?.forceOverwriteRevision !== undefined
        ? options.forceOverwriteRevision
        : project.baseCloudRevision ?? 0;

    try {
      this.status = 'syncing';
      this.errorMessage = null;
      this.notifyStatusChange();

      let newCloudRevision = 1;
      let syncedAt = new Date().toISOString();

      if (this.customAdapter) {
        const res = await this.customAdapter.transactionalSaveProject(
          userId,
          project,
          versionSnapshot,
          expectedBaseRevision
        );
        newCloudRevision = res.newCloudRevision;
        syncedAt = res.syncedAt;
      } else {
        const projectRef = doc(db, 'users', userId, 'projects', project.id);
        const versionRef = doc(
          db,
          'users',
          userId,
          'projects',
          project.id,
          'versions',
          versionSnapshot.id
        );

        await runTransaction(db, async (transaction) => {
          const remoteSnap = await transaction.get(projectRef);

          let remoteRev = 0;
          if (remoteSnap.exists()) {
            const remoteData = remoteSnap.data() as WritingProject;
            if (!remoteData._isDeleted) {
              remoteRev =
                typeof remoteData.cloudRevision === 'number'
                  ? remoteData.cloudRevision
                  : remoteData.versionHistory?.[0]?.versionNumber || 1;

              if (remoteRev !== expectedBaseRevision) {
                throw new StaleRevisionConflictError(
                  {
                    ...remoteData,
                    cloudRevision: remoteRev,
                    baseCloudRevision: remoteRev,
                    hasUnsyncedLocalSave: false,
                  },
                  remoteRev,
                  expectedBaseRevision
                );
              }
            }
          }

          newCloudRevision = remoteRev + 1;
          syncedAt = new Date().toISOString();

          const fullHistory = mergeVersionHistories(
            [versionSnapshot, ...(project.versionHistory || [])],
            storage.getProjectVersions(project.id)
          );
          const boundedEmbeddedHistory = fullHistory.slice(0, MAX_EMBEDDED_CLOUD_VERSIONS);

          const projectPayload = JSON.parse(
            JSON.stringify(
              {
                ...project,
                _isDeleted: false,
                cloudRevision: newCloudRevision,
                baseCloudRevision: newCloudRevision,
                hasUnsyncedLocalSave: false,
                lastSyncedAt: syncedAt,
                lastSyncedByUid: userId,
                versionHistory: boundedEmbeddedHistory,
                updatedAt: syncedAt,
              },
              (_k, v) => (v === undefined ? null : v)
            )
          );
          projectPayload.syncedAt = serverTimestamp();

          const versionPayload = JSON.parse(
            JSON.stringify(
              {
                ...versionSnapshot,
                projectId: project.id,
                cloudRevision: newCloudRevision,
                syncedAt,
              },
              (_k, v) => (v === undefined ? null : v)
            )
          );

          transaction.set(projectRef, projectPayload);
          transaction.set(versionRef, versionPayload);
        });
      }

      const fullMergedHistory = mergeVersionHistories(
        [versionSnapshot, ...(project.versionHistory || [])],
        storage.getProjectVersions(project.id)
      );

      const confirmedProject: WritingProject = {
        ...project,
        _isDeleted: false,
        cloudRevision: newCloudRevision,
        baseCloudRevision: newCloudRevision,
        hasUnsyncedLocalSave: false,
        lastSyncedAt: syncedAt,
        lastSyncedByUid: userId,
        versionHistory: fullMergedHistory,
        updatedAt: syncedAt,
      };

      // Update local storage with cloud-confirmed revision metadata
      this.isApplyingRemote = true;
      try {
        storage.saveProject(confirmedProject, { silent: true });
      } finally {
        this.isApplyingRemote = false;
      }

      this.status = 'synced';
      this.lastSyncedAt = syncedAt;
      this.errorMessage = null;
      this.notifyStatusChange();

      return {
        ok: true,
        status: 'saved_cloud',
        cloudRevision: newCloudRevision,
        syncedAt,
        updatedProject: confirmedProject,
      };
    } catch (err: any) {
      if (err instanceof StaleRevisionConflictError) {
        // Preserve remote version history into local recovery store so nothing is lost
        if (err.remoteProject.versionHistory?.length) {
          storage.saveProjectVersions(project.id, err.remoteProject.versionHistory);
        }
        const conflict: ProjectConflictInfo = {
          projectId: project.id,
          localProject: project,
          remoteProject: err.remoteProject,
          baseRevision: err.baseRevision,
          remoteRevision: err.remoteRevision,
          detectedAt: new Date().toISOString(),
          reason: err.message,
        };
        this.status = 'synced';
        this.notifyStatusChange();
        this.notifyConflict(conflict);
        return {
          ok: false,
          status: 'conflict',
          conflict,
        };
      }

      console.error('Cloud save failed:', err);
      this.status = 'error';
      this.errorMessage = err?.message || 'Failed to save revision to cloud.';
      this.notifyStatusChange();
      return {
        ok: false,
        status: 'cloud_save_failed',
        error: err?.message || 'Failed to save revision to cloud.',
      };
    }
  }

  // ==========================================
  // SAFE INITIAL LOGIN & PROJECT RECONCILIATION
  // ==========================================
  /**
   * Reconciles cloud projects with local projects upon login or explicit sync.
   * - Completes authenticated remote read before any reconciliation.
   * - Cloud version takes precedence over stale local saved data.
   * - Never automatically uploads local-only projects or stale copies on login.
   * - Preserves unsaved in-memory edits and unsynced local saves without silent data loss.
   */
  public async reconcileProjectsOnLogin(userId: string): Promise<WritingProject[]> {
    if (this.simulateNetworkFailure || !this.isOnline) {
      throw new Error('Network unavailable: cannot complete authenticated cloud read.');
    }

    let remoteDocs: WritingProject[] = [];
    const path = `users/${userId}/projects`;

    if (this.customAdapter) {
      remoteDocs = await this.customAdapter.fetchUserProjects(userId);
    } else {
      try {
        const colRef = collection(db, 'users', userId, 'projects');
        let snapshot;
        try {
          snapshot = await getDocsFromServer(colRef);
        } catch (serverErr: any) {
          // If offline or server unreachable, do NOT fall back to an incomplete cache and pretend it's empty
          if (
            serverErr?.code === 'unavailable' ||
            serverErr?.message?.includes('offline') ||
            !this.isOnline
          ) {
            throw new Error('Cannot reach cloud server to verify latest revisions.');
          }
          snapshot = await getDocs(colRef);
        }
        remoteDocs = snapshot.docs.map((d) => d.data() as WritingProject);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, path);
        throw err;
      }
    }

    // Fetch independent version snapshots for remote projects if available
    for (const remoteProj of remoteDocs) {
      if (!remoteProj._isDeleted) {
        try {
          let remoteVersions: ProjectVersionSnapshot[] = [];
          if (this.customAdapter) {
            remoteVersions = await this.customAdapter.fetchProjectVersions(userId, remoteProj.id);
          } else {
            const verColRef = collection(db, 'users', userId, 'projects', remoteProj.id, 'versions');
            const verSnap = await getDocs(verColRef);
            remoteVersions = verSnap.docs.map((d) => d.data() as ProjectVersionSnapshot);
          }
          if (remoteVersions.length > 0) {
            remoteProj.versionHistory = mergeVersionHistories(
              remoteProj.versionHistory,
              remoteVersions
            );
          }
        } catch (verErr) {
          console.warn(`Could not fetch version subcollection for ${remoteProj.id}:`, verErr);
        }
      }
    }

    const remoteMap = new Map<string, WritingProject>();
    remoteDocs.forEach((docData) => {
      remoteMap.set(docData.id, docData);
    });

    const localItems = storage.getRawProjectsIncludingDeleted();
    const localMap = new Map<string, WritingProject>();
    localItems.forEach((item) => localMap.set(item.id, item));

    const activeEditor = this.activeEditorStateProvider ? this.activeEditorStateProvider() : null;
    const finalLocalList: WritingProject[] = [];
    const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

    // Collect normalized titles/slugs of active remote projects to guard against duplicate-title collisions
    const remoteTitles = new Set<string>(
      remoteDocs
        .filter((r) => !r._isDeleted && r.title)
        .map((r) => r.title.trim().toLowerCase())
    );

    for (const id of allIds) {
      const local = localMap.get(id);
      const remote = remoteMap.get(id);

      if (remote && !local) {
        // Exists only in Cloud -> Adopt Cloud version
        const remoteRev =
          typeof remote.cloudRevision === 'number'
            ? remote.cloudRevision
            : remote.versionHistory?.[0]?.versionNumber || 1;
        const adopted: WritingProject = {
          ...remote,
          cloudRevision: remoteRev,
          baseCloudRevision: remoteRev,
          hasUnsyncedLocalSave: false,
          lastSyncedByUid: userId,
        };
        if (adopted.versionHistory?.length) {
          storage.saveProjectVersions(adopted.id, adopted.versionHistory);
        }
        finalLocalList.push(adopted);
      } else if (remote && local) {
        // Exists in both Cloud and Local
        // Preserve local version history in the independent store before any reconciliation
        if (local.versionHistory?.length) {
          storage.saveProjectVersions(local.id, local.versionHistory);
        }
        if (remote.versionHistory?.length) {
          storage.saveProjectVersions(remote.id, remote.versionHistory);
        }

        const remoteRev =
          typeof remote.cloudRevision === 'number'
            ? remote.cloudRevision
            : remote.versionHistory?.[0]?.versionNumber || 1;
        const localBaseRev = local.baseCloudRevision ?? local.cloudRevision ?? 0;

        const mergedHistory = mergeVersionHistories(
          remote.versionHistory,
          storage.getProjectVersions(id)
        );

        const normalizedRemote: WritingProject = {
          ...remote,
          cloudRevision: remoteRev,
          baseCloudRevision: remoteRev,
          hasUnsyncedLocalSave: false,
          lastSyncedByUid: userId,
          versionHistory: mergedHistory,
        };

        if (remote._isDeleted) {
          if (local.hasUnsyncedLocalSave && !local._isDeleted) {
            // Keep local unsynced work rather than silently deleting it
            finalLocalList.push({
              ...local,
              baseCloudRevision: remoteRev,
              hasUnsyncedLocalSave: true,
              versionHistory: mergedHistory,
            });
          } else {
            finalLocalList.push(normalizedRemote);
          }
          continue;
        }

        // Check if user currently has unsaved in-memory edits on this project in the editor
        const hasActiveUnsavedEdits =
          activeEditor &&
          activeEditor.projectId === id &&
          activeEditor.hasUnsavedChanges &&
          activeEditor.workingProject;

        if (hasActiveUnsavedEdits && activeEditor?.workingProject) {
          // Update the stored baseline to the authoritative cloud version,
          // and if the cloud revision differs from the editor's baseline, notify conflict without discarding in-memory edits!
          finalLocalList.push(normalizedRemote);
          if (hasProjectUnsavedChanges(activeEditor.workingProject, normalizedRemote)) {
            this.notifyConflict({
              projectId: id,
              localProject: activeEditor.workingProject,
              remoteProject: normalizedRemote,
              baseRevision: localBaseRev,
              remoteRevision: remoteRev,
              detectedAt: new Date().toISOString(),
              reason: `Cloud has Revision #${remoteRev} while you have unsaved edits in the editor.`,
            });
          }
          continue;
        }

        // Check if local has an explicit unsynced local save made while signed out
        if (local.hasUnsyncedLocalSave && !local._isDeleted) {
          if (!hasProjectUnsavedChanges(local, normalizedRemote)) {
            // Content is identical -> adopt cloud version cleanly
            finalLocalList.push(normalizedRemote);
          } else {
            // Local has unsynced saved edits that differ from the authoritative cloud version!
            // Do NOT upload local automatically and do NOT silently discard either version.
            // Keep local in storage flagged for conflict review, and notify conflict.
            const conflictLocal: WritingProject = {
              ...local,
              versionHistory: mergedHistory,
            };
            finalLocalList.push(conflictLocal);
            this.notifyConflict({
              projectId: id,
              localProject: conflictLocal,
              remoteProject: normalizedRemote,
              baseRevision: localBaseRev,
              remoteRevision: remoteRev,
              detectedAt: new Date().toISOString(),
              reason: `Local unsynced changes conflict with Cloud Revision #${remoteRev}.`,
            });
          }
          continue;
        }

        // Otherwise, local is a stale saved copy (e.g. Version 4 vs Cloud Version 5, or seed copy).
        // Cloud is authoritative -> adopt normalizedRemote and NEVER upload stale local!
        finalLocalList.push(normalizedRemote);
      } else if (local && !remote) {
        // Exists ONLY locally -> NEVER automatically upload on login!
        if (local._isDeleted) {
          finalLocalList.push(local);
          continue;
        }

        // Preserve local draft as "Saved locally — not synced" until user explicitly saves it
        const titleCollision =
          local.title && remoteTitles.has(local.title.trim().toLowerCase());

        finalLocalList.push({
          ...local,
          cloudRevision: undefined,
          baseCloudRevision: 0,
          hasUnsyncedLocalSave: true,
          ...(titleCollision ? { lastSyncedByUid: undefined } : {}),
        });
      }
    }

    this.isApplyingRemote = true;
    try {
      storage.saveProjectsFromRemote(finalLocalList);
    } finally {
      this.isApplyingRemote = false;
    }

    this.notifyProjectsReconciled(finalLocalList.filter((p) => !p._isDeleted));
    return finalLocalList;
  }

  // ==========================================
  // NON-PROJECT COLLECTION SYNC
  // ==========================================
  public handleNonProjectLocalEdit(details?: StorageChangeDetail[]): void {
    if (this.isApplyingRemote) {
      return;
    }

    if (details && details.length > 0) {
      details.forEach((d) => {
        this.pendingNonProjectChanges.set(`${d.collection}:${d.docId}`, d);
      });
    }

    if (
      !this.currentUser ||
      !this.isOnline ||
      this.simulateNetworkFailure ||
      !this.isInitialReconciliationComplete ||
      (this.customAdapter && !this.customAdapter.writeDoc)
    ) {
      return;
    }

    if (this.pendingNonProjectChanges.size === 0) {
      return;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.pushNonProjectChangesToFirestore();
    }, 1200);
  }

  private async performInitialTwoWayMerge(userId: string): Promise<void> {
    // 1. Reconcile Writing Projects safely (Cloud authoritative, no auto-upload of local projects)
    await this.reconcileProjectsOnLogin(userId);

    if (this.customAdapter && !this.customAdapter.writeDoc) {
      return;
    }

    // 2. Style Profiles
    await this.mergeCollection<StyleProfile>(
      userId,
      'style_profiles',
      storage.getRawStyleProfilesIncludingDeleted(),
      (merged) => storage.saveStyleProfilesFromRemote(merged)
    );

    // 3. Internal Links
    await this.mergeCollection<InternalLink>(
      userId,
      'internal_links',
      storage.getRawInternalLinksIncludingDeleted(),
      (merged) => storage.saveInternalLinksFromRemote(merged)
    );

    // 4. Research Studies
    await this.mergeCollection<ResearchStudy>(
      userId,
      'research_studies',
      storage.getRawResearchStudiesIncludingDeleted(),
      (merged) => storage.saveResearchStudiesFromRemote(merged)
    );

    // 5. Research Claims
    await this.mergeCollection<ResearchClaim>(
      userId,
      'research_claims',
      storage.getRawResearchClaimsIncludingDeleted(),
      (merged) => storage.saveResearchClaimsFromRemote(merged)
    );

    // 6. Saved Editorial Ideas
    await this.mergeCollection<SavedEditorialIdea>(
      userId,
      'saved_ideas',
      storage.getRawSavedIdeasIncludingDeleted(),
      (merged) => storage.saveSavedIdeasFromRemote(merged)
    );

    // 7. Global Instructions
    await this.mergeCollection<GlobalInstruction>(
      userId,
      'global_instructions',
      storage.getRawGlobalInstructionsIncludingDeleted(),
      (merged) => storage.saveGlobalInstructionsFromRemote(merged)
    );

    // 8. Research Files
    await this.mergeCollection<any>(
      userId,
      'research_files',
      storage.getRawResearchFilesIncludingDeleted(),
      (merged) => storage.saveResearchFilesFromRemote(merged)
    );

    // 9. User Settings
    await this.mergeSettings(userId);
  }

  private async mergeCollection<T extends { id: string; updatedAt?: string; _isDeleted?: boolean }>(
    userId: string,
    collectionName: string,
    localItems: T[],
    saveLocalCallback: (items: T[]) => void
  ): Promise<void> {
    const path = `users/${userId}/${collectionName}`;
    let snapshot;
    try {
      snapshot = await getDocs(collection(db, 'users', userId, collectionName));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
      return;
    }

    const remoteMap = new Map<string, T>();
    snapshot.docs.forEach((docSnap) => {
      remoteMap.set(docSnap.id, docSnap.data() as T);
    });

    const localMap = new Map<string, T>();
    localItems.forEach((item) => localMap.set(item.id, item));

    const finalLocalList: T[] = [];
    const uploadTasks: Promise<void>[] = [];

    const allIds = new Set<string>([...localMap.keys(), ...remoteMap.keys()]);

    for (const id of allIds) {
      const local = localMap.get(id);
      const remote = remoteMap.get(id);

      if (local && !remote) {
        finalLocalList.push(local);
        uploadTasks.push(this.writeDocToFirestore(userId, collectionName, id, local));
      } else if (!local && remote) {
        finalLocalList.push(remote);
      } else if (local && remote) {
        if (local._isDeleted && !remote._isDeleted) {
          const localDeletedTime = new Date((local as any).deletedAt || local.updatedAt || 0).getTime();
          const remoteUpdatedTime = new Date(remote.updatedAt || 0).getTime();
          if (remoteUpdatedTime <= localDeletedTime) {
            finalLocalList.push(local);
            uploadTasks.push(this.writeDocToFirestore(userId, collectionName, id, local));
            continue;
          }
        }

        if (remote._isDeleted && !local._isDeleted) {
          const remoteDeletedTime = new Date((remote as any).deletedAt || remote.updatedAt || 0).getTime();
          const localUpdatedTime = new Date(local.updatedAt || 0).getTime();
          if (localUpdatedTime <= remoteDeletedTime) {
            finalLocalList.push(remote);
            continue;
          }
        }

        const localTime = new Date(local.updatedAt || (local as any).deletedAt || 0).getTime();
        const remoteTime = new Date(remote.updatedAt || (remote as any).deletedAt || 0).getTime();

        if (remoteTime >= localTime) {
          finalLocalList.push(remote);
        } else {
          finalLocalList.push(local);
          uploadTasks.push(this.writeDocToFirestore(userId, collectionName, id, local));
        }
      }
    }

    this.isApplyingRemote = true;
    try {
      saveLocalCallback(finalLocalList);
    } finally {
      this.isApplyingRemote = false;
    }

    if (uploadTasks.length > 0) {
      await Promise.all(uploadTasks);
    }
  }

  private async mergeSettings(userId: string): Promise<void> {
    const path = `users/${userId}/settings/user_settings`;
    try {
      const docSnap = await getDoc(doc(db, 'users', userId, 'settings', 'user_settings'));
      const localSettings = {
        activeProjectId: storage.getActiveProjectId(),
        activeTheme: storage.getTheme(),
        globalAiModel: storage.getGlobalModel(),
        updatedAt: new Date().toISOString(),
      };

      if (!docSnap.exists()) {
        await setDoc(doc(db, 'users', userId, 'settings', 'user_settings'), localSettings);
      } else {
        const remote = docSnap.data() as any;
        this.isApplyingRemote = true;
        try {
          storage.saveSettingsFromRemote({
            activeProjectId: remote.activeProjectId,
            activeTheme: remote.activeTheme,
            globalAiModel: remote.globalAiModel,
            lastBackupTimestamp: remote.lastBackupTimestamp,
          });
        } finally {
          this.isApplyingRemote = false;
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }

  // ==========================================
  // REAL-TIME INBOUND SNAPSHOT LISTENERS
  // ==========================================
  private attachSnapshotListeners(userId: string): void {
    this.detachSnapshotListeners();

    // 1. Dedicated Project listener with revision & unsaved-edit conflict protection
    const projectsColRef = collection(db, 'users', userId, 'projects');
    const unsubProjects = onSnapshot(
      projectsColRef,
      (snapshot) => {
        // Ignore local optimistic pending writes
        if (snapshot.metadata.hasPendingWrites) {
          return;
        }
        this.isApplyingRemote = true;
        try {
          const remoteDocs: WritingProject[] = snapshot.docs.map((d) => d.data() as WritingProject);
          const localList = storage.getRawProjectsIncludingDeleted();
          const localMap = new Map(localList.map((p) => [p.id, p]));
          const activeEditor = this.activeEditorStateProvider ? this.activeEditorStateProvider() : null;

          let changed = false;
          for (const remote of remoteDocs) {
            const remoteRev =
              typeof remote.cloudRevision === 'number'
                ? remote.cloudRevision
                : remote.versionHistory?.[0]?.versionNumber || 1;
            const local = localMap.get(remote.id);

            if (!local) {
              const adopted: WritingProject = {
                ...remote,
                cloudRevision: remoteRev,
                baseCloudRevision: remoteRev,
                hasUnsyncedLocalSave: false,
                lastSyncedByUid: userId,
              };
              localMap.set(remote.id, adopted);
              changed = true;
              continue;
            }

            const localBaseRev = local.baseCloudRevision ?? local.cloudRevision ?? 0;
            if (remoteRev > localBaseRev) {
              if (local.versionHistory?.length) {
                storage.saveProjectVersions(local.id, local.versionHistory);
              }
              const mergedHistory = mergeVersionHistories(
                remote.versionHistory,
                storage.getProjectVersions(remote.id)
              );
              const normalizedRemote: WritingProject = {
                ...remote,
                cloudRevision: remoteRev,
                baseCloudRevision: remoteRev,
                hasUnsyncedLocalSave: false,
                lastSyncedByUid: userId,
                versionHistory: mergedHistory,
              };

              const isBeingEditedUnsaved =
                activeEditor &&
                activeEditor.projectId === remote.id &&
                activeEditor.hasUnsavedChanges &&
                activeEditor.workingProject;

              if (isBeingEditedUnsaved && activeEditor?.workingProject) {
                localMap.set(remote.id, normalizedRemote);
                changed = true;
                this.notifyConflict({
                  projectId: remote.id,
                  localProject: activeEditor.workingProject,
                  remoteProject: normalizedRemote,
                  baseRevision: localBaseRev,
                  remoteRevision: remoteRev,
                  detectedAt: new Date().toISOString(),
                  reason: `Cloud Revision #${remoteRev} arrived while you have unsaved local changes.`,
                });
              } else if (local.hasUnsyncedLocalSave && hasProjectUnsavedChanges(local, normalizedRemote)) {
                this.notifyConflict({
                  projectId: remote.id,
                  localProject: local,
                  remoteProject: normalizedRemote,
                  baseRevision: localBaseRev,
                  remoteRevision: remoteRev,
                  detectedAt: new Date().toISOString(),
                  reason: `Cloud Revision #${remoteRev} conflicts with your unsynced local save.`,
                });
              } else {
                localMap.set(remote.id, normalizedRemote);
                changed = true;
              }
            }
          }

          if (changed) {
            const updatedList = Array.from(localMap.values());
            storage.saveProjectsFromRemote(updatedList);
            this.notifyProjectsReconciled(updatedList.filter((p) => !p._isDeleted));
          }

          this.lastSyncedAt = new Date().toISOString();
          this.status = 'synced';
          this.notifyStatusChange();
        } finally {
          this.isApplyingRemote = false;
        }
      },
      (err) => {
        console.error('Snapshot error on projects:', err);
        handleFirestoreError(err, OperationType.LIST, `users/${userId}/projects`);
      }
    );
    this.activeUnsubscribers.push(unsubProjects);

    // 2. Non-project collections
    const collectionsToListen = [
      { name: 'style_profiles', apply: (items: StyleProfile[]) => storage.saveStyleProfilesFromRemote(items) },
      { name: 'internal_links', apply: (items: InternalLink[]) => storage.saveInternalLinksFromRemote(items) },
      { name: 'research_studies', apply: (items: ResearchStudy[]) => storage.saveResearchStudiesFromRemote(items) },
      { name: 'research_claims', apply: (items: ResearchClaim[]) => storage.saveResearchClaimsFromRemote(items) },
      { name: 'saved_ideas', apply: (items: SavedEditorialIdea[]) => storage.saveSavedIdeasFromRemote(items) },
      { name: 'global_instructions', apply: (items: GlobalInstruction[]) => storage.saveGlobalInstructionsFromRemote(items) },
      { name: 'research_files', apply: (items: any[]) => storage.saveResearchFilesFromRemote(items) },
    ];

    collectionsToListen.forEach((colDef) => {
      const colRef = collection(db, 'users', userId, colDef.name);
      const unsub = onSnapshot(
        colRef,
        (snapshot) => {
          this.isApplyingRemote = true;
          try {
            const remoteDocs: any[] = snapshot.docs.map((d) => d.data());
            colDef.apply(remoteDocs);
            this.lastSyncedAt = new Date().toISOString();
            this.status = 'synced';
            this.notifyStatusChange();
          } finally {
            this.isApplyingRemote = false;
          }
        },
        (err) => {
          console.error(`Snapshot error on ${colDef.name}:`, err);
          handleFirestoreError(err, OperationType.LIST, `users/${userId}/${colDef.name}`);
        }
      );
      this.activeUnsubscribers.push(unsub);
    });

    // 3. Settings doc
    const settingsRef = doc(db, 'users', userId, 'settings', 'user_settings');
    const unsubSettings = onSnapshot(
      settingsRef,
      (docSnap) => {
        if (docSnap.exists()) {
          this.isApplyingRemote = true;
          try {
            const data = docSnap.data();
            storage.saveSettingsFromRemote({
              activeProjectId: data.activeProjectId,
              activeTheme: data.activeTheme,
              globalAiModel: data.globalAiModel,
              lastBackupTimestamp: data.lastBackupTimestamp,
            });
            this.lastSyncedAt = new Date().toISOString();
            this.status = 'synced';
            this.notifyStatusChange();
          } finally {
            this.isApplyingRemote = false;
          }
        }
      },
      (err) => {
        console.error('Snapshot error on settings:', err);
        handleFirestoreError(err, OperationType.GET, `users/${userId}/settings/user_settings`);
      }
    );
    this.activeUnsubscribers.push(unsubSettings);
  }

  private detachSnapshotListeners(): void {
    this.activeUnsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch (err) {
        console.warn('Unsubscribe error:', err);
      }
    });
    this.activeUnsubscribers = [];
  }

  // ==========================================
  // OUTBOUND WRITE ENGINE (NON-PROJECT ONLY)
  // ==========================================
  public async pushNonProjectChangesToFirestore(): Promise<void> {
    if (
      !this.currentUser ||
      !this.isOnline ||
      this.simulateNetworkFailure ||
      this.isApplyingRemote ||
      !this.isInitialReconciliationComplete ||
      (this.customAdapter && !this.customAdapter.writeDoc)
    ) {
      return;
    }

    if (this.pendingNonProjectChanges.size === 0) {
      return;
    }

    const userId = this.currentUser.uid;
    const changesToPush = Array.from(this.pendingNonProjectChanges.values());

    try {
      this.status = 'syncing';
      this.notifyStatusChange();

      const failedChanges: StorageChangeDetail[] = [];

      const tasks = changesToPush.map(async (change) => {
        try {
          if (change.action === 'delete' || change.data?._isDeleted) {
            await this.deleteRecord(change.collection, change.docId);
          } else {
            const dataToWrite =
              change.data || this.getNonProjectDocFromStorage(change.collection, change.docId);
            if (dataToWrite) {
              await this.writeDocToFirestore(userId, change.collection, change.docId, dataToWrite);
            }
          }
          this.pendingNonProjectChanges.delete(`${change.collection}:${change.docId}`);
        } catch (err) {
          console.error(`Failed to push document ${change.collection}/${change.docId}:`, err);
          failedChanges.push(change);
        }
      });

      await Promise.all(tasks);

      if (failedChanges.length > 0) {
        failedChanges.forEach((c) => {
          this.pendingNonProjectChanges.set(`${c.collection}:${c.docId}`, c);
        });
        this.status = 'error';
        this.errorMessage = `Failed to upload ${failedChanges.length} setting change(s).`;
        this.notifyStatusChange();
      } else {
        this.status = 'synced';
        this.lastSyncedAt = new Date().toISOString();
        this.errorMessage = null;
        this.notifyStatusChange();
      }
    } catch (err: any) {
      console.error('Push non-project changes error:', err);
      this.status = 'error';
      this.errorMessage = err?.message || 'Failed to upload library settings changes.';
      this.notifyStatusChange();
    }
  }

  private getNonProjectDocFromStorage(collectionName: string, docId: string): any {
    switch (collectionName) {
      case 'style_profiles':
        return storage.getRawStyleProfilesIncludingDeleted().find((p) => p.id === docId);
      case 'internal_links':
        return storage.getRawInternalLinksIncludingDeleted().find((l) => l.id === docId);
      case 'research_studies':
        return storage.getRawResearchStudiesIncludingDeleted().find((s) => s.id === docId);
      case 'research_claims':
        return storage.getRawResearchClaimsIncludingDeleted().find((c) => c.id === docId);
      case 'saved_ideas':
        return storage.getRawSavedIdeasIncludingDeleted().find((i) => i.id === docId);
      case 'global_instructions':
        return storage.getRawGlobalInstructionsIncludingDeleted().find((g) => g.id === docId);
      case 'settings':
        return {
          activeProjectId: storage.getActiveProjectId(),
          activeTheme: storage.getTheme(),
          globalAiModel: storage.getGlobalModel(),
          lastBackupTimestamp: storage.getLastBackupTimestamp(),
          updatedAt: new Date().toISOString(),
        };
      case 'research_files':
        return storage.getRawResearchFilesIncludingDeleted().find((f) => f.id === docId);
      default:
        return null;
    }
  }

  public async writeDocToFirestore(
    userId: string,
    collectionName: string,
    docId: string,
    data: any
  ): Promise<void> {
    if (this.customAdapter?.writeDoc) {
      await this.customAdapter.writeDoc(userId, collectionName, docId, data);
      return;
    }

    const docPath =
      collectionName === 'settings'
        ? `users/${userId}/settings/${docId}`
        : `users/${userId}/${collectionName}/${docId}`;
    try {
      const cleaned = JSON.parse(
        JSON.stringify(data, (_key, value) => (value === undefined ? null : value))
      );
      cleaned.syncedAt = serverTimestamp();

      const docRef =
        collectionName === 'settings'
          ? doc(db, 'users', userId, 'settings', docId)
          : doc(db, 'users', userId, collectionName, docId);

      await setDoc(docRef, cleaned, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, docPath);
      throw err;
    }
  }

  // ==========================================
  // SOFT DELETION TOMBSTONES
  // ==========================================
  public async deleteRecord(collectionName: string, docId: string): Promise<void> {
    if (!this.currentUser || !this.isOnline || this.simulateNetworkFailure) return;
    const userId = this.currentUser.uid;

    if (this.customAdapter?.deleteDoc) {
      await this.customAdapter.deleteDoc(userId, collectionName, docId);
      this.pendingNonProjectChanges.delete(`${collectionName}:${docId}`);
      return;
    }

    const path = `users/${userId}/${collectionName}/${docId}`;
    try {
      const tombstone = {
        id: docId,
        _isDeleted: true,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', userId, collectionName, docId), tombstone, { merge: true });
      this.pendingNonProjectChanges.delete(`${collectionName}:${docId}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
      throw err;
    }
  }

  public getPendingNonProjectChanges(): StorageChangeDetail[] {
    return Array.from(this.pendingNonProjectChanges.values());
  }

  public getPendingNonProjectChangesCount(): number {
    return this.pendingNonProjectChanges.size;
  }

  public clearPendingNonProjectChanges(): void {
    this.pendingNonProjectChanges.clear();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}

export const syncEngine = new SyncEngine();
