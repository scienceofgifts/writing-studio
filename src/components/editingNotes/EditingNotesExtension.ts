/**
 * Science of Gifts - Tiptap / ProseMirror Editing Notes Decoration Extension
 * Renders unobtrusive inline passage highlights and accessible marker badges
 * using ProseMirror Decorations so note markers NEVER pollute `editor.getHTML()`
 * or exported article content.
 */

import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { ArticleEditingNote } from '../../types/project';
import { sortEditingNotesInArticleOrder } from '../../utils/editingNotes';

export const editingNotesPluginKey = new PluginKey('sogEditingNotesDecorations');

export interface EditingNotesPluginState {
  notes: ArticleEditingNote[];
  showNotes: boolean;
  activeNoteId: string | null;
  lockedSelection: { from: number; to: number } | null;
}

export interface EditingNotesExtensionOptions {
  getState: () => EditingNotesPluginState;
  onSelectNote: (noteId: string, anchorRect: DOMRect) => void;
}

export const EditingNotesExtension = Extension.create<EditingNotesExtensionOptions>({
  name: 'editingNotesDecorations',

  addOptions() {
    return {
      getState: () => ({
        notes: [],
        showNotes: true,
        activeNoteId: null,
        lockedSelection: null,
      }),
      onSelectNote: () => {},
    };
  },

  addProseMirrorPlugins() {
    const extensionOptions = this.options;

    return [
      new Plugin({
        key: editingNotesPluginKey,
        state: {
          init() {
            return {};
          },
          apply(tr, prev) {
            if (tr.getMeta(editingNotesPluginKey)) {
              return {};
            }
            return prev;
          },
        },
        props: {
          decorations(state) {
            const { notes, showNotes, activeNoteId, lockedSelection } =
              extensionOptions.getState();
            const decorations: Decoration[] = [];
            const docSize = state.doc.content.size;

            // 1. Render locked selection highlight while user is recording/writing a note in the modal
            if (
              lockedSelection &&
              lockedSelection.from >= 0 &&
              lockedSelection.to > lockedSelection.from &&
              lockedSelection.to <= docSize
            ) {
              decorations.push(
                Decoration.inline(lockedSelection.from, lockedSelection.to, {
                  class: 'editing-note-selection-lock',
                })
              );
            }

            // 2. If global note visibility toggle is off, hide all note markers cleanly
            if (!showNotes || !Array.isArray(notes) || notes.length === 0) {
              return DecorationSet.create(state.doc, decorations);
            }

            const orderedNotes = sortEditingNotesInArticleOrder(notes);

            orderedNotes.forEach((note, index) => {
              if (note.anchorStatus === 'unresolved') {
                return;
              }

              const from = Math.max(0, Math.min(note.from, docSize));
              const to = Math.max(from, Math.min(note.to, docSize));
              if (from >= to) return;

              const noteNumber = index + 1;
              const isActive = activeNoteId === note.id;
              const isAmbiguous = note.anchorStatus === 'ambiguous';

              // Subtle inline passage highlight
              const inlineClass = [
                'editing-note-passage-highlight',
                isActive ? 'editing-note-passage-active' : '',
                isAmbiguous ? 'editing-note-passage-ambiguous' : '',
              ]
                .filter(Boolean)
                .join(' ');

              decorations.push(
                Decoration.inline(from, to, {
                  class: inlineClass,
                  'data-editing-note-passage': note.id,
                })
              );

              // Accessible inline marker badge adjacent to passage end
              const widget = Decoration.widget(
                to,
                () => {
                  const btn = document.createElement('button');
                  btn.type = 'button';
                  btn.tabIndex = 0;
                  btn.setAttribute('role', 'button');
                  btn.setAttribute('data-editing-note-marker', note.id);
                  btn.setAttribute('contenteditable', 'false');
                  btn.setAttribute(
                    'aria-label',
                    `Editing Note #${noteNumber}${
                      isAmbiguous ? ' (Ambiguous anchor)' : ''
                    }: ${note.instruction}`
                  );
                  btn.title = `Note #${noteNumber}${
                    isAmbiguous ? ' (Multiple matches — click to review)' : ''
                  }: ${note.instruction}`;

                  btn.className = [
                    'editing-note-marker-badge',
                    isActive ? 'editing-note-marker-active' : '',
                    isAmbiguous ? 'editing-note-marker-ambiguous' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');

                  const iconSymbol = note.inputMethod === 'voice' ? '🎙' : '✎';
                  const statusDot = isAmbiguous ? '!' : '';
                  btn.innerHTML = `<span class="editing-note-marker-icon" aria-hidden="true">${iconSymbol}</span><span class="editing-note-marker-num">${noteNumber}${statusDot}</span>`;

                  const handleActivate = (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = btn.getBoundingClientRect();
                    extensionOptions.onSelectNote(note.id, rect);
                  };

                  btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  });
                  btn.addEventListener('click', handleActivate);
                  btn.addEventListener('keydown', (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleActivate(e);
                    }
                  });

                  return btn;
                },
                {
                  side: 1,
                  key: `editing-note-marker-${note.id}-${noteNumber}-${isActive ? 'act' : 'idl'}-${note.anchorStatus}`,
                }
              );

              decorations.push(widget);
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
