/**
 * Science of Gifts - Data Backup & Recovery Types
 * Defines portable, versioned backup manifests, database export schemas,
 * conflict resolution models, and local snapshots.
 */

import { WritingProject, GlobalInstruction } from './project';
import { StyleProfile } from './styleReference';
import { InternalLink } from './internalLink';
import { ResearchStudy, ResearchClaim, ResearchFile } from './research';
import { SavedEditorialIdea } from './ideaGenerator';

export const CURRENT_BACKUP_VERSION = '1.0.0';
export const APP_VERSION = '1.0.0';
export const BACKUP_FORMAT_IDENTIFIER = 'sog_portable_backup_v1';

export interface BackupEntityCounts {
  projects: number;
  styleProfiles: number;
  internalLinks: number;
  globalInstructions: number;
  researchStudies: number;
  researchClaims: number;
  researchFiles: number;
  savedIdeas: number;
  snapshots: number;
}

export interface BackupManifest {
  backupVersion: string;
  appVersion: string;
  format: string;
  appName: string;
  createdAt: string;
  description: string;
  generator: string;
  entityCounts: BackupEntityCounts;
  compatibility: {
    minSupportedVersion: string;
  };
  metadata?: {
    totalSizeBytes?: number;
    userNote?: string;
  };
}

export interface BackupDatabaseExport {
  projects: WritingProject[];
  styleProfiles: StyleProfile[];
  internalLinks: InternalLink[];
  globalInstructions: GlobalInstruction[];
  researchStudies: ResearchStudy[];
  researchClaims: ResearchClaim[];
  researchFiles: ResearchFile[];
  savedIdeas: SavedEditorialIdea[];
  settings: Record<string, any>;
  snapshots: LocalSnapshotRecord[];
}

export type ConflictResolutionStrategy =
  | 'merge'                // Keep existing; assign new IDs / suffix "[Imported]" to conflicts
  | 'replace'              // Destructive: completely overwrite local database with backup
  | 'separate_workspace';  // Prefix all incoming projects with "[Imported Archive YYYY-MM-DD]"

export interface BackupConflictItem<T> {
  existing: T;
  incoming: T;
  conflictType: 'id_match' | 'title_match';
}

export interface BackupValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  manifest: BackupManifest | null;
  parsedData: BackupDatabaseExport | null;
  conflicts: {
    projects: BackupConflictItem<WritingProject>[];
    styleProfiles: BackupConflictItem<StyleProfile>[];
    internalLinks: BackupConflictItem<InternalLink>[];
    researchStudies: BackupConflictItem<ResearchStudy>[];
  };
  hasConflicts: boolean;
}

export interface LocalSnapshotRecord {
  id: string;
  timestamp: string;
  label: string;
  trigger: 'auto' | 'manual';
  projectCount: number;
  sizeBytes: number;
  data: BackupDatabaseExport;
}

export interface ImportExecutionResult {
  success: boolean;
  message: string;
  strategyUsed: ConflictResolutionStrategy;
  importedCounts: {
    projects: number;
    styleProfiles: number;
    internalLinks: number;
    globalInstructions: number;
    researchStudies: number;
    researchClaims: number;
    researchFiles: number;
    savedIdeas: number;
  };
  timestamp: string;
  error?: string;
}
