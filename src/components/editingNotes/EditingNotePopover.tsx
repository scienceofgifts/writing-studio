/**
 * Science of Gifts - Compact Editing Note Popover
 * Opens when clicking or tapping an inline note marker badge (or selecting from the notes bar).
 * Displays the anchored passage, anchor status, instruction, and Edit / Re-anchor / Delete (with confirmation) actions.
 */

import React, { useState } from 'react';
import { ArticleEditingNote } from '../../types/project';
import {
  Mic,
  PenLine,
  Trash2,
  Edit3,
  X,
  AlertTriangle,
  CheckCircle2,
  Crosshair,
  Quote,
} from 'lucide-react';

interface EditingNotePopoverProps {
  note: ArticleEditingNote | null;
  noteNumber: number;
  hasActiveSelection?: boolean;
  onEdit: (note: ArticleEditingNote) => void;
  onDelete: (noteId: string) => void;
  onReanchorToSelection?: (note: ArticleEditingNote) => void;
  onClose: () => void;
}

export const EditingNotePopover: React.FC<EditingNotePopoverProps> = ({
  note,
  noteNumber,
  hasActiveSelection,
  onEdit,
  onDelete,
  onReanchorToSelection,
  onClose,
}) => {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!note) return null;

  return (
    <div
      className="bg-white border border-[#dcd6ca] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-100"
      role="dialog"
      aria-label={`Editing Note #${noteNumber}`}
    >
      {/* Header */}
      <div className="px-3.5 py-2.5 bg-[#f5f2ea] border-b border-[#e5dfd3] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-950 font-bold text-[11px] inline-flex items-center gap-1 shrink-0">
            {note.inputMethod === 'voice' ? (
              <Mic className="w-3 h-3 text-amber-800" />
            ) : (
              <PenLine className="w-3 h-3 text-amber-800" />
            )}
            <span>Note #{noteNumber}</span>
          </span>

          {note.anchorStatus === 'resolved' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Anchored</span>
            </span>
          )}

          {note.anchorStatus === 'ambiguous' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-md">
              <AlertTriangle className="w-3 h-3 text-amber-700" />
              <span>Ambiguous Match</span>
            </span>
          )}

          {note.anchorStatus === 'unresolved' && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-900 bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded-md">
              <AlertTriangle className="w-3 h-3 text-rose-700" />
              <span>Needs Attention</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-1 text-[#736c61] hover:text-[#1e232a] rounded-md hover:bg-[#e8e2d5] transition-colors cursor-pointer"
          title="Close note popover"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3.5 space-y-3">
        {/* Status Explanation for Ambiguous or Unresolved */}
        {note.anchorStatus === 'ambiguous' && (
          <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950">
            This passage appears multiple times in the article with similar context. It is included in your exported brief with surrounding context.
          </div>
        )}

        {note.anchorStatus === 'unresolved' && (
          <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-950">
            The original anchored passage was edited or removed in the draft. Your note is preserved and will be included in the exported brief under &ldquo;Needs Attention&rdquo;.
          </div>
        )}

        {/* Anchored Passage Quote */}
        <div className="p-2.5 rounded-xl bg-[#faf9f6] border border-[#e5dfd3] space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
            <span className="inline-flex items-center gap-1">
              <Quote className="w-3 h-3 text-amber-800" />
              <span>
                {note.anchorStatus === 'unresolved' ? 'Original Passage' : 'Anchored Passage'}
              </span>
            </span>
            {note.headingContext && (
              <span className="truncate max-w-[180px]" title={note.headingContext}>
                {note.headingContext}
              </span>
            )}
          </div>
          <blockquote className="font-editorial text-xs text-[#1e232a] italic border-l-2 border-amber-600 pl-2 py-0.5 max-h-20 overflow-y-auto">
            &ldquo;{note.quotedText}&rdquo;
          </blockquote>
        </div>

        {/* Instruction */}
        <div className="space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
            Editing Instruction
          </div>
          <div className="p-2.5 rounded-xl bg-amber-50/50 border border-amber-200/80 text-xs sm:text-sm text-[#1e232a] leading-relaxed whitespace-pre-wrap">
            {note.instruction}
          </div>
        </div>

        {/* Actions Footer */}
        {!confirmingDelete ? (
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#f0ece3]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onEdit(note)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#1e232a] bg-[#f5f2ea] hover:bg-[#e8e2d5] border border-[#dcd6ca] transition-colors inline-flex items-center gap-1 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-800" />
                <span>Edit Note</span>
              </button>

              {(note.anchorStatus === 'unresolved' || note.anchorStatus === 'ambiguous') &&
                hasActiveSelection &&
                onReanchorToSelection && (
                  <button
                    type="button"
                    onClick={() => onReanchorToSelection(note)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 transition-colors inline-flex items-center gap-1 cursor-pointer"
                    title="Attach this note to the currently selected text in the editor"
                  >
                    <Crosshair className="w-3.5 h-3.5 text-amber-800" />
                    <span>Re-anchor to Selection</span>
                  </button>
                )}
            </div>

            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-700 hover:text-rose-900 hover:bg-rose-50 transition-colors inline-flex items-center gap-1 cursor-pointer"
              title="Delete this editing note"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2 animate-in fade-in duration-100">
            <span className="text-[11px] font-semibold text-rose-950">
              Delete Note #{noteNumber} permanently?
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium text-[#5c5447] bg-white border border-[#dcd6ca] hover:bg-[#f5f2ea] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onDelete(note.id)}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
