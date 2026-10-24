/**
 * Science of Gifts - Backup & Recovery Engine
 * Creates versioned, self-contained, portable ZIP backup packages.
 * Validates archives before modifying local state, resolves conflicts deterministically,
 * and manages local safety snapshots in IndexedDB.
 */

import JSZip from 'jszip';
import {
  BackupManifest,
  BackupDatabaseExport,
  BackupValidationResult,
  ConflictResolutionStrategy,
  ImportExecutionResult,
  LocalSnapshotRecord,
  CURRENT_BACKUP_VERSION,
  APP_VERSION,
  BACKUP_FORMAT_IDENTIFIER,
} from '../types/backup';
import { storage } from './storage';
import { indexedDBService, STORES } from './indexedDB';
import { WritingProject } from '../types/project';
import { StyleProfile } from '../types/styleReference';
import { InternalLink } from '../types/internalLink';
import { ResearchStudy, ResearchClaim, ResearchFile } from '../types/research';

export class BackupService {
  /**
   * Collects all current studio data across stores into a normalized database export.
   */
  public async collectCurrentData(): Promise<BackupDatabaseExport> {
    const projects = storage.getProjects();
    const styleProfiles = storage.getStyleProfiles();
    const internalLinks = storage.getInternalLinks();
    const globalInstructions = storage.getGlobalInstructions();
    const savedIdeas = storage.getSavedIdeas();
    const researchStudies = storage.getResearchStudies();
    const researchClaims = storage.getResearchClaims();
    const researchFiles = storage.getResearchFiles();
    const snapshots = await this.getLocalSnapshots();

    const settings = {
      theme: storage.getTheme(),
      globalModel: storage.getGlobalModel(),
      activeProjectId: storage.getActiveProjectId(),
      linkCategories: storage.getLinkCategories(),
      lastBackupTimestamp: storage.getLastBackupTimestamp(),
    };

    return {
      projects,
      styleProfiles,
      internalLinks,
      globalInstructions,
      researchStudies,
      researchClaims,
      researchFiles,
      savedIdeas,
      settings,
      snapshots,
    };
  }

  /**
   * Generates a portable, versioned ZIP backup containing manifest,
   * structured database JSON exports, and associated research files.
   */
  public async exportFullBackup(userNote?: string): Promise<{ blob: Blob; filename: string; manifest: BackupManifest }> {
    const data = await this.collectCurrentData();
    const zip = new JSZip();

    const manifest: BackupManifest = {
      backupVersion: CURRENT_BACKUP_VERSION,
      appVersion: APP_VERSION,
      format: BACKUP_FORMAT_IDENTIFIER,
      appName: 'Science of Gifts Writing Studio',
      createdAt: new Date().toISOString(),
      description: 'Full portable self-contained archive of Writing Studio projects, research, and settings.',
      generator: 'Writing Studio Portable Backup Engine v1.0',
      entityCounts: {
        projects: data.projects.length,
        styleProfiles: data.styleProfiles.length,
        internalLinks: data.internalLinks.length,
        globalInstructions: data.globalInstructions.length,
        researchStudies: data.researchStudies.length,
        researchClaims: data.researchClaims.length,
        researchFiles: data.researchFiles.length,
        savedIdeas: data.savedIdeas.length,
        snapshots: data.snapshots.length,
      },
      compatibility: {
        minSupportedVersion: '1.0.0',
      },
      metadata: {
        userNote: userNote || undefined,
      },
    };

    // 1. Root Manifest
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    // 2. Structured Database Export Folder
    const dbFolder = zip.folder('database');
    if (dbFolder) {
      dbFolder.file('projects.json', JSON.stringify(data.projects, null, 2));
      dbFolder.file('style_profiles.json', JSON.stringify(data.styleProfiles, null, 2));
      dbFolder.file('internal_links.json', JSON.stringify(data.internalLinks, null, 2));
      dbFolder.file('global_instructions.json', JSON.stringify(data.globalInstructions, null, 2));
      dbFolder.file('research_studies.json', JSON.stringify(data.researchStudies, null, 2));
      dbFolder.file('research_claims.json', JSON.stringify(data.researchClaims, null, 2));
      dbFolder.file('research_files.json', JSON.stringify(data.researchFiles, null, 2));
      dbFolder.file('saved_ideas.json', JSON.stringify(data.savedIdeas, null, 2));
      dbFolder.file('settings.json', JSON.stringify(data.settings, null, 2));
      dbFolder.file('snapshots.json', JSON.stringify(data.snapshots, null, 2));
    }

    // 3. Associated Files / Assets Folder
    const filesFolder = zip.folder('files');
    if (filesFolder && data.researchFiles.length > 0) {
      for (const file of data.researchFiles) {
        const safeName = `${file.id}_${file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        filesFolder.file(safeName, file.content);
      }
    }

    // Generate ZIP blob
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const filename = `science-of-gifts-backup-${nowStr}.zip`;

    // Record last backup timestamp
    const nowIso = new Date().toISOString();
    storage.setLastBackupTimestamp(nowIso);

    return { blob, filename, manifest };
  }

  /**
   * Helper to trigger native browser file download of a backup ZIP
   */
  public triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /**
   * Inspects and validates an uploaded backup ZIP package before making ANY changes.
   * Identifies manifest version, schema health, entity counts, and exact data conflicts.
   */
  public async validateBackupFile(file: File | Blob): Promise<BackupValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const zip = await JSZip.loadAsync(file);

      // 1. Verify manifest.json
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) {
        return {
          isValid: false,
          errors: ['Invalid backup package: missing required "manifest.json" file.'],
          warnings: [],
          manifest: null,
          parsedData: null,
          conflicts: { projects: [], styleProfiles: [], internalLinks: [], researchStudies: [] },
          hasConflicts: false,
        };
      }

      let manifest: BackupManifest;
      try {
        const manifestText = await manifestFile.async('text');
        manifest = JSON.parse(manifestText);
      } catch (err: any) {
        return {
          isValid: false,
          errors: [`Failed to parse "manifest.json": ${err?.message || 'Invalid JSON format'}`],
          warnings: [],
          manifest: null,
          parsedData: null,
          conflicts: { projects: [], styleProfiles: [], internalLinks: [], researchStudies: [] },
          hasConflicts: false,
        };
      }

      // Format check
      if (!manifest.backupVersion) {
        errors.push('Manifest is missing "backupVersion" identifier.');
      }

      // 2. Read database JSON files
      const readDbFile = async <T>(path: string, fallback: T): Promise<T> => {
        const entry = zip.file(path) || zip.file(`database/${path}`);
        if (!entry) return fallback;
        try {
          const txt = await entry.async('text');
          return JSON.parse(txt);
        } catch (e: any) {
          warnings.push(`Could not parse ${path}: ${e.message}`);
          return fallback;
        }
      };

      const projects = await readDbFile<WritingProject[]>('projects.json', []);
      const styleProfiles = await readDbFile<StyleProfile[]>('style_profiles.json', []);
      const internalLinks = await readDbFile<InternalLink[]>('internal_links.json', []);
      const globalInstructions = await readDbFile<any[]>('global_instructions.json', []);
      const researchStudies = await readDbFile<ResearchStudy[]>('research_studies.json', []);
      const researchClaims = await readDbFile<ResearchClaim[]>('research_claims.json', []);
      const researchFiles = await readDbFile<ResearchFile[]>('research_files.json', []);
      const savedIdeas = await readDbFile<any[]>('saved_ideas.json', []);
      const settings = await readDbFile<Record<string, any>>('settings.json', {});
      const snapshots = await readDbFile<LocalSnapshotRecord[]>('snapshots.json', []);

      if (!Array.isArray(projects)) {
        errors.push('Extracted "projects.json" is not a valid list of projects.');
      }

      const parsedData: BackupDatabaseExport = {
        projects: Array.isArray(projects) ? projects : [],
        styleProfiles: Array.isArray(styleProfiles) ? styleProfiles : [],
        internalLinks: Array.isArray(internalLinks) ? internalLinks : [],
        globalInstructions: Array.isArray(globalInstructions) ? globalInstructions : [],
        researchStudies: Array.isArray(researchStudies) ? researchStudies : [],
        researchClaims: Array.isArray(researchClaims) ? researchClaims : [],
        researchFiles: Array.isArray(researchFiles) ? researchFiles : [],
        savedIdeas: Array.isArray(savedIdeas) ? savedIdeas : [],
        settings: settings || {},
        snapshots: Array.isArray(snapshots) ? snapshots : [],
      };

      // 3. Conflict Analysis against current state
      const currentProjects = storage.getProjects();
      const currentProfiles = storage.getStyleProfiles();
      const currentLinks = storage.getInternalLinks();
      const currentStudies = storage.getResearchStudies();

      const projectConflicts: BackupValidationResult['conflicts']['projects'] = [];
      for (const incoming of parsedData.projects) {
        const idMatch = currentProjects.find((cp) => cp.id === incoming.id);
        const titleMatch = currentProjects.find(
          (cp) => cp.title.trim().toLowerCase() === incoming.title.trim().toLowerCase()
        );
        if (idMatch) {
          projectConflicts.push({ existing: idMatch, incoming, conflictType: 'id_match' });
        } else if (titleMatch) {
          projectConflicts.push({ existing: titleMatch, incoming, conflictType: 'title_match' });
        }
      }

      const profileConflicts: BackupValidationResult['conflicts']['styleProfiles'] = [];
      for (const incoming of parsedData.styleProfiles) {
        const match = currentProfiles.find(
          (cp) => cp.id === incoming.id || cp.name.toLowerCase() === incoming.name.toLowerCase()
        );
        if (match) {
          profileConflicts.push({ existing: match, incoming, conflictType: 'id_match' });
        }
      }

      const linkConflicts: BackupValidationResult['conflicts']['internalLinks'] = [];
      for (const incoming of parsedData.internalLinks) {
        const match = currentLinks.find((cl) => cl.id === incoming.id || cl.url === incoming.url);
        if (match) {
          linkConflicts.push({ existing: match, incoming, conflictType: 'id_match' });
        }
      }

      const studyConflicts: BackupValidationResult['conflicts']['researchStudies'] = [];
      for (const incoming of parsedData.researchStudies) {
        const match = currentStudies.find(
          (cs) => cs.id === incoming.id || cs.title.toLowerCase() === incoming.title.toLowerCase()
        );
        if (match) {
          studyConflicts.push({ existing: match, incoming, conflictType: 'id_match' });
        }
      }

      const hasConflicts =
        projectConflicts.length > 0 ||
        profileConflicts.length > 0 ||
        linkConflicts.length > 0 ||
        studyConflicts.length > 0;

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        manifest,
        parsedData,
        conflicts: {
          projects: projectConflicts,
          styleProfiles: profileConflicts,
          internalLinks: linkConflicts,
          researchStudies: studyConflicts,
        },
        hasConflicts,
      };
    } catch (err: any) {
      return {
        isValid: false,
        errors: [`Invalid archive format or corrupted ZIP: ${err?.message || 'Cannot open file'}`],
        warnings: [],
        manifest: null,
        parsedData: null,
        conflicts: { projects: [], styleProfiles: [], internalLinks: [], researchStudies: [] },
        hasConflicts: false,
      };
    }
  }

  /**
   * Executes backup import according to chosen conflict resolution strategy:
   * - 'replace': Clears current database and replaces completely with backup
   * - 'merge': Preserves current database; incoming items with duplicate IDs or titles receive new IDs
   * - 'separate_workspace': Preserves current data; prefixes incoming project titles with archive timestamp
   */
  public async executeImport(
    validationResult: BackupValidationResult,
    strategy: ConflictResolutionStrategy
  ): Promise<ImportExecutionResult> {
    if (!validationResult.isValid || !validationResult.parsedData) {
      throw new Error('Cannot import an invalid or unverified backup.');
    }

    // Safety measure: take an automatic local snapshot before applying import
    await this.createLocalSnapshot('Pre-import safety snapshot', 'auto');

    const incoming = validationResult.parsedData;
    const nowIso = new Date().toISOString();
    const dateTag = nowIso.slice(0, 10);

    let finalProjects: WritingProject[] = [];
    let finalProfiles: StyleProfile[] = [];
    let finalLinks: InternalLink[] = [];
    let finalInstructions = incoming.globalInstructions;
    let finalStudies: ResearchStudy[] = [];
    let finalClaims: ResearchClaim[] = [];
    let finalFiles: ResearchFile[] = [];
    let finalIdeas = incoming.savedIdeas;

    if (strategy === 'replace') {
      // 1. REVISION STRATEGY: Full Replace
      await Promise.all([
        indexedDBService.clear(STORES.PROJECTS),
        indexedDBService.clear(STORES.STYLE_PROFILES),
        indexedDBService.clear(STORES.INTERNAL_LINKS),
        indexedDBService.clear(STORES.RESEARCH_STUDIES),
        indexedDBService.clear(STORES.RESEARCH_CLAIMS),
        indexedDBService.clear(STORES.RESEARCH_FILES),
        indexedDBService.clear(STORES.SAVED_IDEAS),
      ]);
      finalProjects = incoming.projects;
      finalProfiles = incoming.styleProfiles;
      finalLinks = incoming.internalLinks;
      finalInstructions = incoming.globalInstructions;
      finalStudies = incoming.researchStudies;
      finalClaims = incoming.researchClaims;
      finalFiles = incoming.researchFiles;
      finalIdeas = incoming.savedIdeas;
    } else if (strategy === 'merge') {
      // 2. REVISION STRATEGY: Merge & Deduplicate
      const currentProjects = storage.getProjects();
      const existingProjectIds = new Set(currentProjects.map((p) => p.id));
      const existingProjectTitles = new Set(currentProjects.map((p) => p.title.toLowerCase().trim()));

      const processedIncomingProjects = incoming.projects.map((proj) => {
        if (existingProjectIds.has(proj.id) || existingProjectTitles.has(proj.title.toLowerCase().trim())) {
          return {
            ...proj,
            id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            title: `${proj.title} [Imported]`,
            updatedAt: nowIso,
          };
        }
        return proj;
      });

      finalProjects = [...currentProjects, ...processedIncomingProjects];

      // Style profiles merge
      const currentProfiles = storage.getStyleProfiles();
      const existingProfileIds = new Set(currentProfiles.map((p) => p.id));
      const processedIncomingProfiles = incoming.styleProfiles.map((prof) => {
        if (existingProfileIds.has(prof.id)) {
          return {
            ...prof,
            id: `sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: `${prof.name} (Imported)`,
          };
        }
        return prof;
      });
      finalProfiles = [...currentProfiles, ...processedIncomingProfiles];

      // Internal links merge
      const currentLinks = storage.getInternalLinks();
      const existingUrls = new Set(currentLinks.map((l) => l.url.toLowerCase()));
      const newLinks = incoming.internalLinks.filter((l) => !existingUrls.has(l.url.toLowerCase()));
      finalLinks = [...currentLinks, ...newLinks];

      // Research studies merge
      const currentStudies = storage.getResearchStudies();
      const existingStudyIds = new Set(currentStudies.map((s) => s.id));
      const processedStudies = incoming.researchStudies.map((s) => {
        if (existingStudyIds.has(s.id)) {
          return {
            ...s,
            id: `study-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            title: `${s.title} [Imported]`,
          };
        }
        return s;
      });
      finalStudies = [...currentStudies, ...processedStudies];

      // Claims and files
      finalClaims = [...storage.getResearchClaims(), ...incoming.researchClaims];
      finalFiles = [...storage.getResearchFiles(), ...incoming.researchFiles];
      finalIdeas = [...storage.getSavedIdeas(), ...incoming.savedIdeas];
    } else if (strategy === 'separate_workspace') {
      // 3. REVISION STRATEGY: Separate Workspace with Prefix
      const currentProjects = storage.getProjects();
      const processedIncomingProjects = incoming.projects.map((proj) => ({
        ...proj,
        id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: `[Archive ${dateTag}] ${proj.title}`,
        updatedAt: nowIso,
      }));

      finalProjects = [...currentProjects, ...processedIncomingProjects];
      finalProfiles = [...storage.getStyleProfiles(), ...incoming.styleProfiles];
      finalLinks = [...storage.getInternalLinks(), ...incoming.internalLinks];
      finalStudies = [...storage.getResearchStudies(), ...incoming.researchStudies];
      finalClaims = [...storage.getResearchClaims(), ...incoming.researchClaims];
      finalFiles = [...storage.getResearchFiles(), ...incoming.researchFiles];
      finalIdeas = [...storage.getSavedIdeas(), ...incoming.savedIdeas];
    }

    // Persist all data through storage (which synchronizes with IndexedDB)
    storage.saveProjects(finalProjects);
    storage.saveStyleProfiles(finalProfiles);
    storage.saveInternalLinks(finalLinks);
    if (finalInstructions && finalInstructions.length > 0) {
      storage.saveGlobalInstructions(finalInstructions);
    }
    storage.saveResearchStudies(finalStudies);
    storage.saveResearchClaims(finalClaims);
    storage.saveResearchFiles(finalFiles);
    storage.saveSavedIdeas(finalIdeas);

    // Update settings if available in replace mode
    if (strategy === 'replace' && incoming.settings) {
      if (incoming.settings.theme) storage.setTheme(incoming.settings.theme);
      if (incoming.settings.globalModel) storage.setGlobalModel(incoming.settings.globalModel);
    }

    const importedCounts = {
      projects: incoming.projects.length,
      styleProfiles: incoming.styleProfiles.length,
      internalLinks: incoming.internalLinks.length,
      globalInstructions: incoming.globalInstructions.length,
      researchStudies: incoming.researchStudies.length,
      researchClaims: incoming.researchClaims.length,
      researchFiles: incoming.researchFiles.length,
      savedIdeas: incoming.savedIdeas.length,
    };

    return {
      success: true,
      message: `Successfully imported backup using "${strategy}" strategy.`,
      strategyUsed: strategy,
      importedCounts,
      timestamp: nowIso,
    };
  }

  // =========================================================================
  // AUTOMATIC LOCAL SNAPSHOTS ENGINE (IndexedDB safety net)
  // =========================================================================

  /**
   * Creates an automatic or manual local snapshot stored in IndexedDB.
   */
  public async createLocalSnapshot(
    label = 'Manual Snapshot',
    trigger: 'auto' | 'manual' = 'manual'
  ): Promise<LocalSnapshotRecord> {
    const data = await this.collectCurrentData();
    const dataJson = JSON.stringify(data);
    const sizeBytes = new Blob([dataJson]).size;

    const snapshot: LocalSnapshotRecord = {
      id: `snap-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      label,
      trigger,
      projectCount: data.projects.length,
      sizeBytes,
      data,
    };

    await indexedDBService.put(STORES.LOCAL_SNAPSHOTS, snapshot);

    // Keep snapshot table bounded to the 15 most recent snapshots to prevent bloat
    const all = await this.getLocalSnapshots();
    if (all.length > 15) {
      const sorted = [...all].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      const toDelete = sorted.slice(15);
      for (const oldSnap of toDelete) {
        await indexedDBService.delete(STORES.LOCAL_SNAPSHOTS, oldSnap.id);
      }
    }

    return snapshot;
  }

  public async getLocalSnapshots(): Promise<LocalSnapshotRecord[]> {
    const list = await indexedDBService.getAll<LocalSnapshotRecord>(STORES.LOCAL_SNAPSHOTS);
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public async deleteLocalSnapshot(snapshotId: string): Promise<void> {
    await indexedDBService.delete(STORES.LOCAL_SNAPSHOTS, snapshotId);
  }

  public async restoreFromLocalSnapshot(snapshotId: string): Promise<boolean> {
    const snap = await indexedDBService.get<LocalSnapshotRecord>(STORES.LOCAL_SNAPSHOTS, snapshotId);
    if (!snap || !snap.data) {
      throw new Error('Snapshot not found in IndexedDB.');
    }

    // Safety measure: take automatic snapshot of current before restoring
    await this.createLocalSnapshot('Pre-restore safety snapshot', 'auto');

    const { data } = snap;
    await Promise.all([
      indexedDBService.clear(STORES.PROJECTS),
      indexedDBService.clear(STORES.STYLE_PROFILES),
      indexedDBService.clear(STORES.INTERNAL_LINKS),
      indexedDBService.clear(STORES.RESEARCH_STUDIES),
      indexedDBService.clear(STORES.RESEARCH_CLAIMS),
      indexedDBService.clear(STORES.RESEARCH_FILES),
      indexedDBService.clear(STORES.SAVED_IDEAS),
    ]);

    storage.saveProjects(data.projects || []);
    storage.saveStyleProfiles(data.styleProfiles || []);
    storage.saveInternalLinks(data.internalLinks || []);
    if (data.globalInstructions) {
      storage.saveGlobalInstructions(data.globalInstructions);
    }
    if (data.researchStudies) {
      storage.saveResearchStudies(data.researchStudies);
    }
    if (data.researchClaims) {
      storage.saveResearchClaims(data.researchClaims);
    }
    if (data.researchFiles) {
      storage.saveResearchFiles(data.researchFiles);
    }
    if (data.savedIdeas) {
      storage.saveSavedIdeas(data.savedIdeas);
    }

    return true;
  }
}

export const backupService = new BackupService();
