/**
 * Science of Gifts - Unsaved Changes Confirmation Modal (Requirement 3)
 * Protects unsaved work during internal app navigation and project switching
 * with explicit options: "Save and leave", "Discard changes", and "Stay".
 */

import React, { useEffect } from 'react';
import { AlertTriangle, Save, Trash2, X, Loader2 } from 'lucide-react';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  projectTitle?: string;
  isSaving: boolean;
  onSaveAndLeave: () => void;
  onDiscardAndLeave: () => void;
  onStay: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  projectTitle,
  isSaving,
  onSaveAndLeave,
  onDiscardAndLeave,
  onStay,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onStay();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSaving, onStay]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-changes-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-2xs animate-fade-in"
    >
      <div
        className="w-full max-w-md bg-[#faf9f6] border border-[#dcd6ca] rounded-2xl shadow-2xl p-5 sm:p-6 space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="unsaved-changes-dialog-title"
              className="font-editorial text-lg font-bold text-[#1e232a]"
            >
              Unsaved Changes
            </h3>
            <p className="text-xs text-[#5c5447] mt-1.5 leading-relaxed">
              You have unsaved edits in{' '}
              <span className="font-semibold text-[#1e232a]">
                &ldquo;{projectTitle || 'Untitled Draft'}&rdquo;
              </span>
              . Would you like to save your changes before leaving?
            </p>
          </div>
          <button
            type="button"
            onClick={onStay}
            disabled={isSaving}
            aria-label="Stay on page"
            className="p-1 text-[#8c8477] hover:text-[#1e232a] rounded-lg hover:bg-[#ede8dc] disabled:opacity-40 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-3 border-t border-[#e5dfd3]">
          <button
            type="button"
            onClick={onStay}
            disabled={isSaving}
            className="px-3.5 py-2 min-h-[38px] text-xs font-semibold text-[#4a443b] bg-white border border-[#dcd6ca] hover:bg-[#ede8dc] rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
          >
            Stay
          </button>
          <button
            type="button"
            onClick={onDiscardAndLeave}
            disabled={isSaving}
            className="px-3.5 py-2 min-h-[38px] text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Discard changes</span>
          </button>
          <button
            type="button"
            onClick={onSaveAndLeave}
            disabled={isSaving}
            className="px-4 py-2 min-h-[38px] text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg transition-colors shadow-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 text-amber-300" />
                <span>Save and leave</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
