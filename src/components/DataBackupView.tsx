/**
 * Science of Gifts - Data Persistence & Backup Management View
 * Local-First IndexedDB Durable Storage, Portable Versioned ZIP Backups,
 * Conflict-Safe Package Validation, and Automatic Local Snapshots.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Upload,
  Database,
  HardDrive,
  ShieldCheck,
  AlertTriangle,
  Clock,
  RefreshCw,
  FileArchive,
  CheckCircle2,
  Trash2,
  RotateCcw,
  Sparkles,
  Plus,
  Layers,
  Info,
  Check,
  AlertCircle,
  FileCheck,
  ArrowLeft,
  Calendar,
  Lock,
} from 'lucide-react';
import { storage } from '../services/storage';
import { backupService } from '../services/backupService';
import { indexedDBService, STORES } from '../services/indexedDB';
import {
  BackupManifest,
  BackupValidationResult,
  ConflictResolutionStrategy,
  ImportExecutionResult,
  LocalSnapshotRecord,
  CURRENT_BACKUP_VERSION,
} from '../types/backup';
import { ConfirmationModal } from './ConfirmationModal';
import { toast } from '../services/toastService';

interface DataBackupViewProps {
  onBackToStudio: () => void;
}

export const DataBackupView: React.FC<DataBackupViewProps> = ({ onBackToStudio }) => {
  // Current storage data counts
  const [stats, setStats] = useState({
    projects: 0,
    styleProfiles: 0,
    internalLinks: 0,
    globalInstructions: 0,
    researchStudies: 0,
    researchClaims: 0,
    researchFiles: 0,
    savedIdeas: 0,
  });

  const [lastBackupTimestamp, setLastBackupTimestamp] = useState<string | null>(() =>
    storage.getLastBackupTimestamp()
  );
  const [snapshots, setSnapshots] = useState<LocalSnapshotRecord[]>([]);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);

  // Export State
  const [exportNote, setExportNote] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // Import State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null);
  const [selectedStrategy, setSelectedStrategy] = useState<ConflictResolutionStrategy>('merge');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportExecutionResult | null>(null);

  // Modals & Warnings
  const [showReplaceWarningModal, setShowReplaceWarningModal] = useState(false);
  const [snapshotToRestore, setSnapshotToRestore] = useState<LocalSnapshotRecord | null>(null);
  const [manualSnapshotLabel, setManualSnapshotLabel] = useState('');
  const [showManualSnapshotModal, setShowManualSnapshotModal] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);

  // Health Test State
  const [isTestingStorage, setIsTestingStorage] = useState(false);
  const [storageHealthStatus, setStorageHealthStatus] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshStats = () => {
    setStats({
      projects: storage.getProjects().length,
      styleProfiles: storage.getStyleProfiles().length,
      internalLinks: storage.getInternalLinks().length,
      globalInstructions: storage.getGlobalInstructions().length,
      researchStudies: storage.getResearchStudies().length,
      researchClaims: storage.getResearchClaims().length,
      researchFiles: storage.getResearchFiles().length,
      savedIdeas: storage.getSavedIdeas().length,
    });
    setLastBackupTimestamp(storage.getLastBackupTimestamp());
  };

  const loadSnapshots = async () => {
    setIsLoadingSnapshots(true);
    try {
      const list = await backupService.getLocalSnapshots();
      setSnapshots(list);
    } catch (err) {
      console.warn('Failed to load snapshots:', err);
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  useEffect(() => {
    refreshStats();
    loadSnapshots();
    const unsub = storage.subscribe(() => {
      refreshStats();
    });
    return unsub;
  }, []);

  // Format relative timestamp
  const formatTimeAgo = (iso: string | null) => {
    if (!iso) return 'Never backed up';
    try {
      const date = new Date(iso);
      const diffMs = Date.now() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min ago`;
      if (diffHours < 24) return `${diffHours} hr${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  // Full Portable ZIP Export
  const handleExportBackup = async () => {
    setIsExporting(true);
    setExportSuccessMessage(null);
    try {
      const { blob, filename, manifest } = await backupService.exportFullBackup(
        exportNote.trim() || undefined
      );
      backupService.triggerDownload(blob, filename);

      const nowIso = new Date().toISOString();
      setLastBackupTimestamp(nowIso);
      setExportSuccessMessage(
        `Successfully exported "${filename}" (${manifest.entityCounts.projects} projects, ${manifest.entityCounts.researchStudies} research studies).`
      );
      setExportNote('');
      toast.success('Backup Package Created', `Downloaded ${filename}`);
      refreshStats();
      loadSnapshots();
    } catch (err: any) {
      console.error('Export error:', err);
      toast.error('Backup Export Failed', err?.message || 'Could not package database files.');
    } finally {
      setIsExporting(false);
    }
  };

  // File Selection & Pre-Import Validation
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setImportResult(null);
    setIsValidating(true);
    try {
      const result = await backupService.validateBackupFile(file);
      setValidationResult(result);
      if (result.isValid) {
        toast.info(
          'Archive Verified',
          `Found ${result.parsedData?.projects.length || 0} projects in archive.`
        );
      } else {
        toast.error('Archive Verification Failed', result.errors[0] || 'Invalid file format.');
      }
    } catch (err: any) {
      console.error('Validation error:', err);
      toast.error('Validation Error', err?.message || 'Failed to inspect backup package.');
    } finally {
      setIsValidating(false);
    }
  };

  // Confirm and Execute Import
  const handleInitiateImport = () => {
    if (!validationResult || !validationResult.isValid) return;

    if (selectedStrategy === 'replace') {
      setShowReplaceWarningModal(true);
    } else {
      executeImportDirectly(selectedStrategy);
    }
  };

  const executeImportDirectly = async (strategy: ConflictResolutionStrategy) => {
    if (!validationResult) return;
    setIsImporting(true);
    try {
      const result = await backupService.executeImport(validationResult, strategy);
      setImportResult(result);
      refreshStats();
      await loadSnapshots();
      toast.success('Backup Restored', result.message);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSelectedFile(null);
      setValidationResult(null);
    } catch (err: any) {
      console.error('Import error:', err);
      toast.error('Import Failed', err?.message || 'Error occurred while applying backup.');
    } finally {
      setIsImporting(false);
      setShowReplaceWarningModal(false);
    }
  };

  // Manual Snapshot Creation
  const handleCreateManualSnapshot = async () => {
    setIsCreatingSnapshot(true);
    try {
      const label = manualSnapshotLabel.trim() || 'Manual Snapshot';
      await backupService.createLocalSnapshot(label, 'manual');
      await loadSnapshots();
      setShowManualSnapshotModal(false);
      setManualSnapshotLabel('');
      toast.success('Snapshot Saved', `Created IndexedDB snapshot: "${label}"`);
    } catch (err: any) {
      toast.error('Snapshot Failed', err?.message || 'Could not save local snapshot.');
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  // Restore Snapshot
  const handleConfirmRestoreSnapshot = async () => {
    if (!snapshotToRestore) return;
    try {
      await backupService.restoreFromLocalSnapshot(snapshotToRestore.id);
      refreshStats();
      await loadSnapshots();
      toast.success('Snapshot Restored', `Restored to "${snapshotToRestore.label}".`);
      setSnapshotToRestore(null);
    } catch (err: any) {
      toast.error('Restore Failed', err?.message || 'Could not restore snapshot.');
    }
  };

  // Delete Snapshot
  const handleDeleteSnapshot = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await backupService.deleteLocalSnapshot(id);
      await loadSnapshots();
      toast.info('Snapshot Deleted', 'Local snapshot removed from IndexedDB.');
    } catch (err: any) {
      toast.error('Delete Failed', err?.message || 'Could not delete snapshot.');
    }
  };

  // Health Test
  const handleTestDatabaseHealth = async () => {
    setIsTestingStorage(true);
    setStorageHealthStatus(null);
    try {
      if (!indexedDBService.checkAvailability()) {
        setStorageHealthStatus('IndexedDB is not supported in this browser environment.');
        return;
      }
      const pCount = await indexedDBService.count(STORES.PROJECTS);
      const sCount = await indexedDBService.count(STORES.STYLE_PROFILES);
      const rCount = await indexedDBService.count(STORES.RESEARCH_STUDIES);
      const snapCount = await indexedDBService.count(STORES.LOCAL_SNAPSHOTS);

      setStorageHealthStatus(
        `All IndexedDB Object Stores healthy: ${pCount} projects, ${sCount} style profiles, ${rCount} research studies, and ${snapCount} safety snapshots verified in durable storage.`
      );
    } catch (err: any) {
      setStorageHealthStatus(`IndexedDB health test reported an error: ${err?.message}`);
    } finally {
      setIsTestingStorage(false);
    }
  };

  const isBackupStale =
    !lastBackupTimestamp ||
    Date.now() - new Date(lastBackupTimestamp).getTime() > 1000 * 60 * 60 * 24 * 7;

  return (
    <div className="flex-1 overflow-y-auto bg-[#faf9f6] p-4 sm:p-6 md:p-10 max-w-6xl mx-auto w-full space-y-6 sm:space-y-8">
      {/* Top Header */}
      <div className="border-b border-[#e5dfd3] pb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <button
              type="button"
              onClick={onBackToStudio}
              className="text-xs text-[#736c61] hover:text-[#1e232a] inline-flex items-center gap-1 font-semibold group cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Studio</span>
            </button>
            <span className="text-[#c7bfb1]">•</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
              Local-First Persistence
            </span>
          </div>
          <h1 className="font-editorial text-2xl md:text-3xl font-bold text-[#1e232a]">
            Data Persistence & Backup Management
          </h1>
          <p className="text-xs md:text-sm text-[#6e685f] mt-1.5 leading-relaxed max-w-3xl">
            Self-contained, portable ZIP backup archives, conflict-safe pre-validation, and high-capacity
            IndexedDB persistence to ensure all user data survives browser restarts and page refreshes.
          </p>
        </div>

        {/* Engine Status Badges */}
        <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>IndexedDB: Active & Persistent</span>
          </div>
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${
              isBackupStale
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-stone-50 border-stone-200 text-[#443d34]'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-stone-500" />
            <span>Last Full Backup: {formatTimeAgo(lastBackupTimestamp)}</span>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="p-3 bg-white border border-[#e5dfd3] rounded-xl text-center shadow-2xs">
          <div className="text-lg font-bold text-[#1e232a] font-editorial">{stats.projects}</div>
          <div className="text-[11px] text-[#736c61] uppercase tracking-wider font-semibold">Projects</div>
        </div>
        <div className="p-3 bg-white border border-[#e5dfd3] rounded-xl text-center shadow-2xs">
          <div className="text-lg font-bold text-[#1e232a] font-editorial">{stats.styleProfiles}</div>
          <div className="text-[11px] text-[#736c61] uppercase tracking-wider font-semibold">Style Profiles</div>
        </div>
        <div className="p-3 bg-white border border-[#e5dfd3] rounded-xl text-center shadow-2xs">
          <div className="text-lg font-bold text-[#1e232a] font-editorial">{stats.internalLinks}</div>
          <div className="text-[11px] text-[#736c61] uppercase tracking-wider font-semibold">Internal Links</div>
        </div>
        <div className="p-3 bg-white border border-[#e5dfd3] rounded-xl text-center shadow-2xs">
          <div className="text-lg font-bold text-[#1e232a] font-editorial">{stats.researchStudies}</div>
          <div className="text-[11px] text-[#736c61] uppercase tracking-wider font-semibold">Studies</div>
        </div>
        <div className="p-3 bg-white border border-[#e5dfd3] rounded-xl text-center shadow-2xs">
          <div className="text-lg font-bold text-[#1e232a] font-editorial">{stats.researchClaims}</div>
          <div className="text-[11px] text-[#736c61] uppercase tracking-wider font-semibold">Claims</div>
        </div>
        <div className="p-3 bg-white border border-[#e5dfd3] rounded-xl text-center shadow-2xs">
          <div className="text-lg font-bold text-[#1e232a] font-editorial">{stats.researchFiles}</div>
          <div className="text-[11px] text-[#736c61] uppercase tracking-wider font-semibold">Files</div>
        </div>
        <div className="p-3 bg-white border border-[#e5dfd3] rounded-xl text-center shadow-2xs">
          <div className="text-lg font-bold text-[#1e232a] font-editorial">{stats.savedIdeas}</div>
          <div className="text-[11px] text-[#736c61] uppercase tracking-wider font-semibold">Saved Ideas</div>
        </div>
        <div className="p-3 bg-white border border-[#e5dfd3] rounded-xl text-center shadow-2xs">
          <div className="text-lg font-bold text-[#1e232a] font-editorial">{snapshots.length}</div>
          <div className="text-[11px] text-[#736c61] uppercase tracking-wider font-semibold">Snapshots</div>
        </div>
      </div>

      {/* Main Dual-Action Grid: Export & Import */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PANEL A: EXPORT FULL BACKUP */}
        <div className="p-5 sm:p-6 bg-white border border-[#e5dfd3] rounded-2xl shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#e5dfd3] pb-3">
              <div className="flex items-center gap-2">
                <Download className="w-5 h-5 text-amber-800" />
                <h2 className="font-editorial text-lg font-bold text-[#1e232a]">Export Full Backup</h2>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-stone-100 text-stone-800 border border-stone-200 font-bold uppercase tracking-wider">
                ZIP Package
              </span>
            </div>

            <p className="text-xs text-[#6e685f] leading-relaxed">
              Creates a versioned, portable, self-contained ZIP archive containing your entire studio:
              all projects with outlines and drafts, custom editorial instructions, house rules, style profiles,
              internal links repository, scientific research studies, claims, attached files, and application settings.
            </p>

            {/* Included Assets Preview */}
            <div className="p-3.5 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl text-xs space-y-2">
              <div className="font-semibold text-[#1e232a] flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-emerald-800" />
                <span>Archive Contents:</span>
              </div>
              <ul className="grid grid-cols-2 gap-1.5 text-[11px] text-[#5c5447]">
                <li className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-700" /> Manifest & Version v{CURRENT_BACKUP_VERSION}
                </li>
                <li className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-700" /> {stats.projects} Writing Projects
                </li>
                <li className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-700" /> {stats.styleProfiles} Style Profiles
                </li>
                <li className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-700" /> {stats.internalLinks} Internal Links
                </li>
                <li className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-700" /> {stats.researchStudies} Research Studies
                </li>
                <li className="flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-700" /> {stats.researchFiles} Raw Source Files
                </li>
              </ul>
            </div>

            {/* Optional User Note */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5c5447]">
                Optional Backup Label / Note
              </label>
              <input
                type="text"
                value={exportNote}
                onChange={(e) => setExportNote(e.target.value)}
                placeholder="e.g. Pre-Q4 Editorial Freeze or Full Clean Export"
                className="w-full text-xs px-3.5 py-2.5 bg-[#faf9f6] border border-[#dcd6ca] rounded-xl text-[#1e232a] focus:outline-hidden focus:border-[#1e232a] focus:bg-white transition-all shadow-2xs"
              />
            </div>

            {exportSuccessMessage && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <span>{exportSuccessMessage}</span>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isExporting}
              className="w-full px-4 py-3 bg-[#1e232a] hover:bg-[#2d3744] text-[#faf9f6] rounded-xl font-medium text-xs transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Packaging & Compressing Archive...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-amber-400" />
                  <span>Download Full Backup (.zip)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* PANEL B: IMPORT FULL BACKUP */}
        <div className="p-5 sm:p-6 bg-white border border-[#e5dfd3] rounded-2xl shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#e5dfd3] pb-3">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-blue-800" />
                <h2 className="font-editorial text-lg font-bold text-[#1e232a]">Import Full Backup</h2>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 font-bold uppercase tracking-wider">
                Pre-Validated
              </span>
            </div>

            <p className="text-xs text-[#6e685f] leading-relaxed">
              Upload a previously exported ZIP backup package. The studio validates the archive structure,
              inspects version compatibility, analyzes conflicts with your current data, and lets you choose
              between merge, separate workspace, or replacement before applying any changes.
            </p>

            {/* File Picker Zone */}
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                onChange={handleFileChange}
                className="hidden"
                id="backup-file-input"
              />
              <label
                htmlFor="backup-file-input"
                className={`w-full p-4 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                  selectedFile
                    ? 'border-blue-400 bg-blue-50/40 text-blue-950'
                    : 'border-[#dcd6ca] bg-[#faf9f6] hover:bg-[#f6f3eb] text-[#5c5447]'
                }`}
              >
                <FileArchive className="w-6 h-6 text-blue-700" />
                <div className="text-center">
                  <div className="text-xs font-semibold">
                    {selectedFile ? selectedFile.name : 'Select or drag & drop backup (.zip)'}
                  </div>
                  <div className="text-[10px] text-[#736c61]">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB archive loaded`
                      : 'Must be a valid Science of Gifts portable backup'}
                  </div>
                </div>
              </label>
            </div>

            {/* Validation Loading */}
            {isValidating && (
              <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl text-xs text-[#736c61] flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Inspecting and validating backup package...</span>
              </div>
            )}

            {/* Validation Feedback & Conflict Strategy */}
            {validationResult && (
              <div className="space-y-3 animate-in fade-in">
                {validationResult.isValid ? (
                  <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-emerald-950 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                        Valid Archive Package
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold">
                        Format v{validationResult.manifest?.backupVersion}
                      </span>
                    </div>

                    <div className="text-[11px] text-emerald-900 grid grid-cols-2 gap-1 pt-1 border-t border-emerald-200/60">
                      <div>Projects: {validationResult.parsedData?.projects.length || 0}</div>
                      <div>Profiles: {validationResult.parsedData?.styleProfiles.length || 0}</div>
                      <div>Links: {validationResult.parsedData?.internalLinks.length || 0}</div>
                      <div>Studies: {validationResult.parsedData?.researchStudies.length || 0}</div>
                    </div>

                    {validationResult.hasConflicts && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 flex items-start gap-1.5 mt-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <strong>{validationResult.conflicts.projects.length} project conflict(s)</strong> detected with matching IDs or titles. Choose your resolution strategy below.
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5 text-xs text-rose-900">
                    <div className="font-semibold flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-rose-700" />
                      Archive Validation Errors
                    </div>
                    <ul className="list-disc list-inside text-[11px] space-y-0.5 text-rose-800">
                      {validationResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Strategy Selection */}
                {validationResult.isValid && (
                  <div className="space-y-2 pt-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#5c5447]">
                      Conflict Resolution Strategy
                    </label>
                    <div className="space-y-2">
                      <label
                        className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer text-xs transition-colors ${
                          selectedStrategy === 'merge'
                            ? 'bg-amber-50/60 border-amber-300 text-amber-950 font-medium'
                            : 'bg-[#faf9f6] border-[#dcd6ca] text-[#5c5447] hover:bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="conflict_strategy"
                          checked={selectedStrategy === 'merge'}
                          onChange={() => setSelectedStrategy('merge')}
                          className="mt-0.5 cursor-pointer text-amber-800"
                        />
                        <div>
                          <div className="font-semibold text-[#1e232a]">Merge & Deduplicate (Recommended)</div>
                          <div className="text-[11px] text-[#736c61]">
                            Preserves existing projects. Conflicting items receive new IDs and "[Imported]" suffix so nothing is lost.
                          </div>
                        </div>
                      </label>

                      <label
                        className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer text-xs transition-colors ${
                          selectedStrategy === 'separate_workspace'
                            ? 'bg-blue-50/60 border-blue-300 text-blue-950 font-medium'
                            : 'bg-[#faf9f6] border-[#dcd6ca] text-[#5c5447] hover:bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="conflict_strategy"
                          checked={selectedStrategy === 'separate_workspace'}
                          onChange={() => setSelectedStrategy('separate_workspace')}
                          className="mt-0.5 cursor-pointer text-blue-800"
                        />
                        <div>
                          <div className="font-semibold text-[#1e232a]">Separate Workspace / Archive Tag</div>
                          <div className="text-[11px] text-[#736c61]">
                            Preserves existing data. Prefixes all imported projects with "[Archive YYYY-MM-DD]" for clear separation.
                          </div>
                        </div>
                      </label>

                      <label
                        className={`p-2.5 rounded-xl border flex items-start gap-2.5 cursor-pointer text-xs transition-colors ${
                          selectedStrategy === 'replace'
                            ? 'bg-rose-50/60 border-rose-300 text-rose-950 font-medium'
                            : 'bg-[#faf9f6] border-[#dcd6ca] text-[#5c5447] hover:bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="conflict_strategy"
                          checked={selectedStrategy === 'replace'}
                          onChange={() => setSelectedStrategy('replace')}
                          className="mt-0.5 cursor-pointer text-rose-800"
                        />
                        <div>
                          <div className="font-semibold text-rose-900 flex items-center gap-1.5">
                            <span>Replace Entire Database</span>
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-200 text-rose-950 font-bold uppercase">
                              Destructive
                            </span>
                          </div>
                          <div className="text-[11px] text-rose-800">
                            Clears current studio projects and replaces with archive. An emergency safety snapshot is created automatically first.
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {importResult && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">{importResult.message}</div>
                      <div className="text-[11px] text-emerald-800 mt-0.5">
                        Imported {importResult.importedCounts.projects} projects, {importResult.importedCounts.styleProfiles} style profiles, {importResult.importedCounts.researchStudies} research studies.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={handleInitiateImport}
              disabled={isImporting || !validationResult || !validationResult.isValid}
              className={`w-full px-4 py-3 rounded-xl font-medium text-xs transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                selectedStrategy === 'replace'
                  ? 'bg-rose-800 hover:bg-rose-900 text-white'
                  : 'bg-[#1e232a] hover:bg-[#2d3744] text-[#faf9f6]'
              }`}
            >
              {isImporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Applying and restoring archive...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>
                    {selectedStrategy === 'replace'
                      ? 'Confirm & Replace Studio Database'
                      : 'Apply & Restore Archive'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* SECTION 3: AUTOMATIC LOCAL SNAPSHOTS (INDEXEDDB SAFETY NET) */}
      <div className="p-5 sm:p-6 bg-white border border-[#e5dfd3] rounded-2xl shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e5dfd3] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-indigo-900" />
              <h2 className="font-editorial text-lg font-bold text-[#1e232a]">
                Automatic Local Snapshots (IndexedDB)
              </h2>
            </div>
            <p className="text-xs text-[#6e685f] mt-1">
              Internal browser safety snapshots taken automatically prior to imports or on demand.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowManualSnapshotModal(true)}
            className="px-3.5 py-2 text-xs bg-stone-100 hover:bg-stone-200 text-[#1e232a] font-semibold border border-stone-300 rounded-xl transition-colors inline-flex items-center gap-1.5 shadow-2xs self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-900" />
            <span>Create Manual Snapshot</span>
          </button>
        </div>

        {/* Clear Distinction Educational Banner */}
        <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-950">
          <Info className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong>Important Safety Notice:</strong> Local snapshots reside inside your browser’s IndexedDB storage.
            They provide instant undo safety nets within this browser, but they are{' '}
            <strong>NOT a substitute for downloading portable .zip backup files</strong> to your computer or cloud drive.
          </div>
        </div>

        {/* Snapshots Table / List */}
        {isLoadingSnapshots ? (
          <div className="p-8 text-center text-xs text-[#736c61] flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-700" />
            <span>Loading snapshots from IndexedDB...</span>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="p-8 text-center bg-[#faf9f6] border border-dashed border-[#dcd6ca] rounded-xl text-xs text-[#736c61]">
            No local snapshots created yet. Snapshots will be recorded automatically prior to imports, or you can create one above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#e5dfd3] text-[11px] text-[#736c61] font-semibold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Snapshot Label</th>
                  <th className="py-2.5 px-3">Trigger</th>
                  <th className="py-2.5 px-3">Projects</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ede6]">
                {snapshots.map((snap) => (
                  <tr key={snap.id} className="hover:bg-[#faf9f6] transition-colors">
                    <td className="py-3 px-3 font-medium text-[#1e232a] flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-stone-400" />
                      <span>{snap.label}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase tracking-wider ${
                          snap.trigger === 'auto'
                            ? 'bg-amber-50 text-amber-900 border border-amber-200'
                            : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                        }`}
                      >
                        {snap.trigger === 'auto' ? 'Automatic' : 'Manual'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-[#5c5447]">{snap.projectCount}</td>
                    <td className="py-3 px-3 text-[#5c5447]">
                      {(snap.sizeBytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3 px-3 text-[#736c61]">{formatTimeAgo(snap.timestamp)}</td>
                    <td className="py-3 px-3 text-right space-x-1.5">
                      <button
                        type="button"
                        onClick={() => setSnapshotToRestore(snap)}
                        className="px-2.5 py-1 text-[11px] text-[#1e232a] hover:bg-[#eae4d7] bg-[#f5f1e8] rounded-md border border-[#dcd6ca] transition-colors font-medium inline-flex items-center gap-1 cursor-pointer"
                        title="Restore studio state to this snapshot"
                      >
                        <RotateCcw className="w-3 h-3 text-amber-800" />
                        <span>Restore</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteSnapshot(snap.id, e)}
                        className="p-1 text-stone-400 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        title="Delete snapshot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 4: STORAGE HEALTH & MAINTENANCE */}
      <div className="p-5 sm:p-6 bg-white border border-[#e5dfd3] rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e5dfd3] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-800" />
              <h3 className="font-editorial text-base font-bold text-[#1e232a]">
                IndexedDB Storage Health & Durability
              </h3>
            </div>
            <p className="text-xs text-[#6e685f]">
              Verifies object store connectivity and browser storage quota status.
            </p>
          </div>

          <button
            type="button"
            onClick={handleTestDatabaseHealth}
            disabled={isTestingStorage}
            className="px-3 py-1.5 text-xs text-[#1e232a] bg-[#faf9f6] hover:bg-[#ede8dc] border border-[#dcd6ca] rounded-lg transition-colors font-medium inline-flex items-center gap-1.5 shadow-2xs self-start sm:self-auto cursor-pointer"
          >
            {isTestingStorage ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-700" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
            )}
            <span>Verify Storage Durability</span>
          </button>
        </div>

        {storageHealthStatus && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>{storageHealthStatus}</span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl space-y-0.5">
            <div className="text-[10px] text-[#736c61] uppercase font-bold">Store: projects</div>
            <div className="font-semibold text-[#1e232a]">{stats.projects} records</div>
          </div>
          <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl space-y-0.5">
            <div className="text-[10px] text-[#736c61] uppercase font-bold">Store: research_studies</div>
            <div className="font-semibold text-[#1e232a]">{stats.researchStudies} records</div>
          </div>
          <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl space-y-0.5">
            <div className="text-[10px] text-[#736c61] uppercase font-bold">Store: style_profiles</div>
            <div className="font-semibold text-[#1e232a]">{stats.styleProfiles} records</div>
          </div>
          <div className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl space-y-0.5">
            <div className="text-[10px] text-[#736c61] uppercase font-bold">Store: local_snapshots</div>
            <div className="font-semibold text-[#1e232a]">{snapshots.length} records</div>
          </div>
        </div>
      </div>

      {/* CONFIRMATION MODAL: REPLACE ENTIRE DATABASE */}
      {showReplaceWarningModal && (
        <ConfirmationModal
          isOpen={true}
          title="Replace Entire Studio Database?"
          message={`Warning: This destructive operation will clear all existing local projects and replace them with the ${
            validationResult?.parsedData?.projects.length || 0
          } projects from the archive.\n\nAn emergency safety snapshot will be automatically saved to IndexedDB before replacing, but local changes made since this backup will be removed.`}
          confirmLabel="Yes, Replace Local Database"
          cancelLabel="Cancel"
          isDestructive={true}
          onConfirm={() => executeImportDirectly('replace')}
          onCancel={() => setShowReplaceWarningModal(false)}
        />
      )}

      {/* CONFIRMATION MODAL: RESTORE SNAPSHOT */}
      {snapshotToRestore && (
        <ConfirmationModal
          isOpen={true}
          title={`Restore Snapshot: "${snapshotToRestore.label}"?`}
          message={`This will revert your current writing studio to the snapshot recorded on ${new Date(
            snapshotToRestore.timestamp
          ).toLocaleString()}.\n\nA safety snapshot of your current state will be created automatically before reverting.`}
          confirmLabel="Revert to Snapshot"
          cancelLabel="Cancel"
          isDestructive={false}
          onConfirm={handleConfirmRestoreSnapshot}
          onCancel={() => setSnapshotToRestore(null)}
        />
      )}

      {/* MODAL: CREATE MANUAL SNAPSHOT */}
      {showManualSnapshotModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#e5dfd3] space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2 border-b border-[#e5dfd3] pb-3">
              <HardDrive className="w-5 h-5 text-indigo-900" />
              <h3 className="font-editorial text-lg font-bold text-[#1e232a]">
                Create Manual Safety Snapshot
              </h3>
            </div>

            <p className="text-xs text-[#6e685f] leading-relaxed">
              Saves a point-in-time snapshot of all current projects, studies, style profiles, and rules
              directly into your browser's IndexedDB.
            </p>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#5c5447]">
                Snapshot Label
              </label>
              <input
                type="text"
                value={manualSnapshotLabel}
                onChange={(e) => setManualSnapshotLabel(e.target.value)}
                placeholder="e.g. Prior to rewriting gift guide introduction"
                className="w-full text-xs px-3.5 py-2.5 bg-[#faf9f6] border border-[#dcd6ca] rounded-xl text-[#1e232a] focus:outline-hidden focus:border-[#1e232a] focus:bg-white transition-all shadow-2xs"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e5dfd3]">
              <button
                type="button"
                onClick={() => {
                  setShowManualSnapshotModal(false);
                  setManualSnapshotLabel('');
                }}
                className="px-3.5 py-2 text-xs font-medium text-[#736c61] hover:text-[#1e232a] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateManualSnapshot}
                disabled={isCreatingSnapshot}
                className="px-4 py-2 text-xs font-semibold bg-[#1e232a] text-[#faf9f6] hover:bg-[#2d3744] rounded-xl transition-colors cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isCreatingSnapshot ? 'Saving Snapshot...' : 'Save Snapshot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
