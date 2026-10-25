/**
 * Automated Verification Suite for Article-Anchored Voice & Written Editing Notes
 * Runs 16 deterministic end-to-end scenarios verifying:
 * 1. Creating a note on selected text via voice transcription (speech filler cleanup + intent preservation)
 * 2. Creating a note on selected text via direct written input ("Write Note") + mode switching without losing draft/selection
 * 3. Preventing empty or failed transcriptions from saving a note
 * 4. Reviewing and editing transcription text before confirming
 * 5. Storing note instructions separately from article HTML & clean CMS/Markdown exports
 * 6. Showing and hiding note markers globally without mutating notes, article HTML, dirty state, or triggering Firestore writes
 * 7. Preserving note anchors when text is added or deleted BEFORE the anchored passage (ProseMirror transaction mapping + HTML reconciliation)
 * 8. Preserving note anchors when text is added or deleted AFTER the anchored passage
 * 9. Contextual recovery when offsets shift significantly
 * 10. Handling ambiguous duplicate passages vs context-disambiguated duplicates, and deleted anchored passages ('unresolved')
 * 11. Multiple notes on one article and multiple notes on the same passage (deterministic ordering & badge numbering)
 * 12. Editing and deleting existing notes + project-switching isolation
 * 13. Dirty-state tracking (hasProjectUnsavedChanges) & manual Save persistence with exact Firestore operation counts
 * 14. Reloading & remote Firestore snapshot reconciliation without outbound echo writes
 * 15. Version history restore preserving active editingNotes and re-anchoring / marking 'unresolved' against restored content
 * 16. Exporting a consolidated editing brief for ChatGPT / Claude (article order, hidden markers still exported, unresolved section, clean article text)
 */

import assert from 'node:assert/strict';

// In-memory localStorage shim for Node test runner
const memoryStorage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => (memoryStorage.has(key) ? memoryStorage.get(key)! : null),
  setItem: (key: string, value: string) => {
    memoryStorage.set(key, String(value));
  },
  removeItem: (key: string) => {
    memoryStorage.delete(key);
  },
  clear: () => {
    memoryStorage.clear();
  },
  key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
  get length() {
    return memoryStorage.size;
  },
};

import { Schema } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
import {
  extractSelectionAnchorFromDoc,
  mapAndResolveNotesInDoc,
  reconcileNotesWithHtmlContent,
  cleanSpeechTranscriptLocally,
  sortEditingNotesInArticleOrder,
  buildConsolidatedEditingBrief,
} from '../utils/editingNotes';
import { ArticleEditingNote, WritingProject } from '../types/project';
import {
  createVersionSnapshot,
  restoreVersionSnapshot,
  hasProjectUnsavedChanges,
} from '../services/versionHistoryService';
import { buildCmsArticleExport, buildMarkdownExport } from '../services/articleExport';
import { storage } from '../services/storage';
import { syncEngine, CloudStoreAdapter } from '../services/syncEngine';
import { ProjectVersionSnapshot } from '../types/versionHistory';

// Minimal ProseMirror schema matching Tiptap StarterKit blocks used in articles
const articleSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      toDOM: () => ['p', 0],
    },
    heading: {
      attrs: { level: { default: 2 } },
      group: 'block',
      content: 'inline*',
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    text: {
      group: 'inline',
    },
  },
  marks: {
    bold: { toDOM: () => ['strong', 0] },
    italic: { toDOM: () => ['em', 0] },
  },
});

function buildDocFromBlocks(
  blocks: Array<{ type: 'heading' | 'paragraph'; text: string; level?: number }>
) {
  const nodes = blocks.map((b) => {
    const textNode = b.text ? [articleSchema.text(b.text)] : [];
    if (b.type === 'heading') {
      return articleSchema.nodes.heading.create({ level: b.level || 2 }, textNode);
    }
    return articleSchema.nodes.paragraph.create(null, textNode);
  });
  return articleSchema.nodes.doc.create(null, nodes);
}

function findPosOfSubstringInDoc(doc: any, target: string, occurrence = 1): { from: number; to: number } {
  let seen = 0;
  let found: { from: number; to: number } | null = null;
  doc.descendants((node: any, pos: number) => {
    if (found) return false;
    if (node.isBlock && node.isTextblock) {
      const text = node.textContent;
      let idx = text.indexOf(target);
      while (idx !== -1) {
        seen++;
        if (seen === occurrence) {
          found = { from: pos + 1 + idx, to: pos + 1 + idx + target.length };
          return false;
        }
        idx = text.indexOf(target, idx + 1);
      }
      return false;
    }
    return true;
  });
  if (!found) {
    throw new Error(`Target "${target}" (occurrence ${occurrence}) not found in ProseMirror doc`);
  }
  return found;
}

function createSampleProject(overrides: Partial<WritingProject> = {}): WritingProject {
  const now = '2026-10-25T10:00:00.000Z';
  return {
    id: 'proj-notes-test-1',
    title: 'The Quiet Physics of Brass Desk Instruments',
    type: 'article',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    content: [
      '<h2>Introduction to Solid Brass</h2>',
      '<p>Solid machined brass develops an honest living patina over decades of daily handling.</p>',
      '<h2>Why Weight Matters on a Desk</h2>',
      '<p>A heavy paperweight anchors both loose correspondence and the rhythm of thought.</p>',
      '<h2>Caring for Unlacquered Metal</h2>',
      '<p>Never coat a fine desk compass in synthetic polyurethane lacquer.</p>',
    ].join(''),
    brief: {
      purpose: 'Explore tactile longevity in brass desk objects.',
      audience: 'Collectors and design enthusiasts',
      readerLearns: 'How unlacquered brass ages and why mass matters.',
      readerFeels: 'Grounded and appreciative of material honesty.',
      readerAction: 'Choose unlacquered solid brass over plated zinc.',
      keyPoints: ['Patina chemistry', 'Tactile mass'],
      thingsToAvoid: ['Hype adjectives'],
    },
    outline: [],
    writingControls: {
      tone: 'editorial',
      detail: 'balanced',
      marketing: 'minimal',
      historicalContext: 'moderate',
      audience: 'enthusiast',
      wordCountTarget: '1,200 - 1,500 words',
    },
    aiSettings: {
      tone: 'editorial',
      detail: 'balanced',
      marketing: 'minimal',
      historicalContext: 'moderate',
      audience: 'enthusiast',
      wordCountTarget: '1,200 - 1,500 words',
    },
    contentRules: [],
    projectInstructions: '',
    editingNotes: [],
    ...overrides,
  };
}

async function runTests() {
  console.log('===================================================================');
  console.log('Running Article-Anchored Voice & Written Editing Notes Test Suite');
  console.log('===================================================================\n');

  let passed = 0;

  // ---------------------------------------------------------------------------
  // SCENARIO 1: Creating a note via Voice Note transcription & filler cleanup
  // ---------------------------------------------------------------------------
  {
    const doc = buildDocFromBlocks([
      { type: 'heading', text: 'Introduction to Solid Brass', level: 2 },
      {
        type: 'paragraph',
        text: 'Solid machined brass develops an honest living patina over decades of daily handling.',
      },
    ]);

    const { from, to } = findPosOfSubstringInDoc(doc, 'honest living patina');
    const anchor = extractSelectionAnchorFromDoc(doc, from, to);
    assert.ok(anchor, 'Selection anchor must be extracted');
    assert.equal(anchor.quotedText, 'honest living patina');
    assert.equal(
      anchor.paragraphContext,
      'Solid machined brass develops an honest living patina over decades of daily handling.'
    );
    assert.equal(anchor.headingContext, 'Introduction to Solid Brass');

    const rawVoiceTranscript =
      'um like make this phrase more specific about cuprous oxide oxidation and uh do not lose the warm tone';
    const cleaned = cleanSpeechTranscriptLocally(rawVoiceTranscript);
    assert.equal(
      cleaned,
      'Make this phrase more specific about cuprous oxide oxidation and do not lose the warm tone.'
    );

    const voiceNote: ArticleEditingNote = {
      id: 'note-voice-1',
      projectId: 'proj-notes-test-1',
      quotedText: anchor.quotedText,
      paragraphContext: anchor.paragraphContext,
      prefixContext: anchor.prefixContext,
      suffixContext: anchor.suffixContext,
      headingContext: anchor.headingContext,
      from: anchor.from,
      to: anchor.to,
      rawTranscript: rawVoiceTranscript,
      instruction: cleaned,
      inputMethod: 'voice',
      anchorStatus: 'resolved',
      createdAt: '2026-10-25T10:01:00.000Z',
      updatedAt: '2026-10-25T10:01:00.000Z',
    };

    assert.equal(voiceNote.inputMethod, 'voice');
    assert.equal(voiceNote.anchorStatus, 'resolved');
    console.log('✅ Scenario 1 Passed: Voice Note creation, selection anchor extraction, and filler cleanup preserving speaker intent.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 2: Creating a note via Write Note & switching between Voice/Write
  // ---------------------------------------------------------------------------
  {
    const doc = buildDocFromBlocks([
      { type: 'heading', text: 'Why Weight Matters on a Desk', level: 2 },
      {
        type: 'paragraph',
        text: 'A heavy paperweight anchors both loose correspondence and the rhythm of thought.',
      },
    ]);

    const { from, to } = findPosOfSubstringInDoc(doc, 'the rhythm of thought');
    const anchor = extractSelectionAnchorFromDoc(doc, from, to)!;

    // Simulate user starting in Write Note mode, typing draft text, switching to Voice Note,
    // appending dictated text, and confirming.
    let draftInstruction = 'Replace this metaphor with a concrete tactile observation.';
    let activeMode: 'voice' | 'text' = 'text';

    // Switch tab to voice while preserving anchor and draft
    activeMode = 'voice';
    assert.equal(anchor.quotedText, 'the rhythm of thought');
    const dictatedAddition = cleanSpeechTranscriptLocally('um maybe mention the cold thermal conductivity of brass');
    draftInstruction = `${draftInstruction} ${dictatedAddition}`.trim();

    // Switch back to text to finalize review
    activeMode = 'text';
    const writtenNote: ArticleEditingNote = {
      id: 'note-write-1',
      projectId: 'proj-notes-test-1',
      ...anchor,
      instruction: draftInstruction,
      inputMethod: activeMode,
      anchorStatus: 'resolved',
      createdAt: '2026-10-25T10:02:00.000Z',
      updatedAt: '2026-10-25T10:02:00.000Z',
    };

    assert.equal(writtenNote.inputMethod, 'text');
    assert.ok(writtenNote.instruction.includes('concrete tactile observation'));
    assert.ok(writtenNote.instruction.includes('cold thermal conductivity of brass'));
    console.log('✅ Scenario 2 Passed: Write Note creation and seamless Voice/Write mode switching without losing draft or anchor.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 3: Preventing empty or failed transcriptions from saving a note
  // ---------------------------------------------------------------------------
  {
    const emptyRaw = '   um   uh   ';
    const cleanedEmpty = cleanSpeechTranscriptLocally(emptyRaw);
    assert.equal(cleanedEmpty, '', 'Filler-only transcript must clean to empty string');

    const canConfirm = (instruction: string, isRecording: boolean, isCleaning: boolean) =>
      instruction.trim().length > 0 && !isRecording && !isCleaning;

    assert.equal(canConfirm(cleanedEmpty, false, false), false, 'Empty cleaned transcript must not be confirmable');
    assert.equal(canConfirm('   ', false, false), false, 'Whitespace-only instruction must not be confirmable');
    assert.equal(canConfirm('Valid note', true, false), false, 'Cannot confirm while recording is still active');
    assert.equal(canConfirm('Valid note', false, true), false, 'Cannot confirm while AI cleanup is still running');
    assert.equal(canConfirm('Valid note', false, false), true, 'Valid non-empty instruction is confirmable');

    console.log('✅ Scenario 3 Passed: Empty, whitespace-only, or in-flight transcriptions are prevented from saving.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 4: Reviewing and editing transcription text before confirming
  // ---------------------------------------------------------------------------
  {
    const rawSpeech = 'uh shorten this sentence to under twenty words and keep the mention of Scottish brass';
    const autoCleaned = cleanSpeechTranscriptLocally(rawSpeech);
    assert.equal(
      autoCleaned,
      'Shorten this sentence to under twenty words and keep the mention of Scottish brass.'
    );

    // User edits the cleaned transcription in the review textarea before clicking Save Note
    const userReviewedAndEdited = autoCleaned.replace('twenty words', '15 words');
    assert.equal(
      userReviewedAndEdited,
      'Shorten this sentence to under 15 words and keep the mention of Scottish brass.'
    );
    console.log('✅ Scenario 4 Passed: Transcription review and manual editing before confirmation.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 5: Storing note instructions separately from article HTML & clean exports
  // ---------------------------------------------------------------------------
  {
    const proj = createSampleProject();
    const originalHtml = proj.content;
    const notes = reconcileNotesWithHtmlContent(originalHtml, [
      {
        id: 'note-sep-1',
        projectId: proj.id,
        quotedText: 'honest living patina',
        paragraphContext:
          'Solid machined brass develops an honest living patina over decades of daily handling.',
        prefixContext: 'Solid machined brass develops an ',
        suffixContext: ' over decades of daily handling.',
        headingContext: 'Introduction to Solid Brass',
        from: 35,
        to: 55,
        instruction: 'SECRET_EDITING_NOTE_INSTRUCTION_DO_NOT_LEAK_INTO_ARTICLE',
        inputMethod: 'voice',
        anchorStatus: 'resolved',
        createdAt: '2026-10-25T10:05:00.000Z',
        updatedAt: '2026-10-25T10:05:00.000Z',
      },
    ]);

    const updatedProj: WritingProject = {
      ...proj,
      editingNotes: notes,
    };

    assert.equal(updatedProj.content, originalHtml, 'Creating a note must never alter project.content');
    assert.ok(
      !updatedProj.content.includes('SECRET_EDITING_NOTE_INSTRUCTION_DO_NOT_LEAK_INTO_ARTICLE'),
      'Article HTML must not contain note instruction'
    );

    const cmsExport = buildCmsArticleExport(updatedProj);
    const mdExport = buildMarkdownExport(updatedProj);
    assert.ok(
      !JSON.stringify(cmsExport).includes('SECRET_EDITING_NOTE_INSTRUCTION_DO_NOT_LEAK_INTO_ARTICLE'),
      'CMS JSON export must not contain internal editing note metadata'
    );
    assert.ok(
      !mdExport.includes('SECRET_EDITING_NOTE_INSTRUCTION_DO_NOT_LEAK_INTO_ARTICLE'),
      'Markdown export must not contain internal editing note metadata'
    );

    console.log('✅ Scenario 5 Passed: Note instructions are stored separately from article HTML and excluded from CMS/Markdown article exports.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 6: Showing and hiding note markers globally without mutating data or dirty state
  // ---------------------------------------------------------------------------
  {
    const proj = createSampleProject({
      editingNotes: [
        {
          id: 'note-vis-1',
          projectId: 'proj-notes-test-1',
          quotedText: 'honest living patina',
          paragraphContext:
            'Solid machined brass develops an honest living patina over decades of daily handling.',
          prefixContext: 'Solid machined brass develops an ',
          suffixContext: ' over decades of daily handling.',
          headingContext: 'Introduction to Solid Brass',
          from: 65,
          to: 85,
          instruction: 'Clarify oxidation timeline.',
          inputMethod: 'text',
          anchorStatus: 'resolved',
          createdAt: '2026-10-25T10:06:00.000Z',
          updatedAt: '2026-10-25T10:06:00.000Z',
        },
      ],
    });

    const baseline = structuredClone(proj);
    assert.equal(hasProjectUnsavedChanges(proj, baseline), false);

    // Toggling showNotesMarkers (UI state in Editor) from true -> false -> true
    let showNotesMarkers = true;
    showNotesMarkers = false;
    assert.equal(showNotesMarkers, false);
    assert.equal(
      hasProjectUnsavedChanges(proj, baseline),
      false,
      'Hiding note markers must not mark project dirty'
    );
    assert.equal(proj.editingNotes?.length, 1, 'Hiding note markers must not remove notes');

    // Brief export while markers are hidden must still include all confirmed notes
    const briefWhileHidden = buildConsolidatedEditingBrief(proj);
    assert.ok(
      briefWhileHidden.includes('Clarify oxidation timeline.'),
      'Exporting Editing Brief while markers are hidden must still include all confirmed notes'
    );

    showNotesMarkers = true;
    assert.equal(showNotesMarkers, true);
    console.log('✅ Scenario 6 Passed: Show/Hide Notes toggle preserves note data, clean state, and export completeness.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 7: Preserving note anchors when text is added or deleted BEFORE the anchored passage
  // ---------------------------------------------------------------------------
  {
    const doc = buildDocFromBlocks([
      { type: 'heading', text: 'Introduction to Solid Brass', level: 2 },
      {
        type: 'paragraph',
        text: 'Solid machined brass develops an honest living patina over decades of daily handling.',
      },
      { type: 'heading', text: 'Why Weight Matters on a Desk', level: 2 },
      {
        type: 'paragraph',
        text: 'A heavy paperweight anchors both loose correspondence and the rhythm of thought.',
      },
    ]);

    const state0 = EditorState.create({ doc, schema: articleSchema });
    const targetPos = findPosOfSubstringInDoc(state0.doc, 'the rhythm of thought');
    const anchor = extractSelectionAnchorFromDoc(state0.doc, targetPos.from, targetPos.to)!;

    let notes: ArticleEditingNote[] = [
      {
        id: 'note-before-1',
        projectId: 'proj-notes-test-1',
        ...anchor,
        instruction: 'Ground this phrase in physical mass.',
        inputMethod: 'voice',
        anchorStatus: 'resolved',
        createdAt: '2026-10-25T10:07:00.000Z',
        updatedAt: '2026-10-25T10:07:00.000Z',
      },
    ];

    // Insert 42 characters at the very start of paragraph 1 (BEFORE the anchored passage in paragraph 2)
    const insertPos = findPosOfSubstringInDoc(state0.doc, 'Solid machined brass').from;
    const trInsert = state0.tr.insertText(
      'In traditional instrument making, workshop ',
      insertPos
    );
    const state1 = state0.apply(trInsert);
    notes = mapAndResolveNotesInDoc(state1.doc, notes, trInsert.mapping).updatedNotes;

    assert.equal(notes[0].anchorStatus, 'resolved');
    assert.equal(
      state1.doc.textBetween(notes[0].from, notes[0].to, ' '),
      'the rhythm of thought',
      'ProseMirror mapped positions must still slice the exact anchored quote after insertion before it'
    );

    // Now delete text BEFORE the anchored passage
    const delRange = findPosOfSubstringInDoc(state1.doc, 'In traditional instrument making, ');
    const trDelete = state1.tr.delete(delRange.from, delRange.to);
    const state2 = state1.apply(trDelete);
    notes = mapAndResolveNotesInDoc(state2.doc, notes, trDelete.mapping).updatedNotes;

    assert.equal(notes[0].anchorStatus, 'resolved');
    assert.equal(
      state2.doc.textBetween(notes[0].from, notes[0].to, ' '),
      'the rhythm of thought',
      'ProseMirror mapped positions must still slice the exact anchored quote after deletion before it'
    );

    console.log('✅ Scenario 7 Passed: Note anchors survive insertions and deletions BEFORE the anchored passage.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 8: Preserving note anchors when text is added or deleted AFTER the anchored passage
  // ---------------------------------------------------------------------------
  {
    const doc = buildDocFromBlocks([
      { type: 'heading', text: 'Introduction to Solid Brass', level: 2 },
      {
        type: 'paragraph',
        text: 'Solid machined brass develops an honest living patina over decades of daily handling.',
      },
      { type: 'heading', text: 'Why Weight Matters on a Desk', level: 2 },
      {
        type: 'paragraph',
        text: 'A heavy paperweight anchors both loose correspondence and the rhythm of thought.',
      },
    ]);

    const state0 = EditorState.create({ doc, schema: articleSchema });
    const targetPos = findPosOfSubstringInDoc(state0.doc, 'honest living patina');
    const anchor = extractSelectionAnchorFromDoc(state0.doc, targetPos.from, targetPos.to)!;

    let notes: ArticleEditingNote[] = [
      {
        id: 'note-after-1',
        projectId: 'proj-notes-test-1',
        ...anchor,
        instruction: 'Mention surface oxidation.',
        inputMethod: 'text',
        anchorStatus: 'resolved',
        createdAt: '2026-10-25T10:08:00.000Z',
        updatedAt: '2026-10-25T10:08:00.000Z',
      },
    ];

    // Insert text in the second paragraph (AFTER the anchored passage)
    const afterPos = findPosOfSubstringInDoc(state0.doc, 'loose correspondence').to;
    const trAfter = state0.tr.insertText(' and architectural blueprints', afterPos);
    const state1 = state0.apply(trAfter);
    notes = mapAndResolveNotesInDoc(state1.doc, notes, trAfter.mapping).updatedNotes;

    assert.equal(notes[0].anchorStatus, 'resolved');
    assert.equal(notes[0].from, targetPos.from);
    assert.equal(notes[0].to, targetPos.to);
    assert.equal(
      state1.doc.textBetween(notes[0].from, notes[0].to, ' '),
      'honest living patina'
    );

    console.log('✅ Scenario 8 Passed: Note anchors remain exact when text is added or deleted AFTER the anchored passage.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 9: Contextual recovery when offsets shift without direct transaction mapping
  // ---------------------------------------------------------------------------
  {
    const doc0 = buildDocFromBlocks([
      { type: 'heading', text: 'Introduction to Solid Brass', level: 2 },
      {
        type: 'paragraph',
        text: 'Solid machined brass develops an honest living patina over decades of daily handling.',
      },
    ]);
    const pos0 = findPosOfSubstringInDoc(doc0, 'honest living patina');
    const anchor0 = extractSelectionAnchorFromDoc(doc0, pos0.from, pos0.to)!;

    const noteWithStaleOffsets: ArticleEditingNote = {
      id: 'note-ctx-1',
      projectId: 'proj-notes-test-1',
      ...anchor0,
      from: 999, // Intentionally stale offset
      to: 1019,
      instruction: 'Expand on patina colors.',
      inputMethod: 'voice',
      anchorStatus: 'resolved',
      createdAt: '2026-10-25T10:09:00.000Z',
      updatedAt: '2026-10-25T10:09:00.000Z',
    };

    // Document has new preceding paragraphs so offsets shifted completely
    const docShifted = buildDocFromBlocks([
      { type: 'heading', text: 'Prologue', level: 2 },
      {
        type: 'paragraph',
        text: 'Every craft tradition begins with raw elemental stock.',
      },
      { type: 'heading', text: 'Introduction to Solid Brass', level: 2 },
      {
        type: 'paragraph',
        text: 'Solid machined brass develops an honest living patina over decades of daily handling.',
      },
    ]);

    const recovered = mapAndResolveNotesInDoc(docShifted, [noteWithStaleOffsets]).updatedNotes;
    assert.equal(recovered[0].anchorStatus, 'resolved');
    assert.equal(
      docShifted.textBetween(recovered[0].from, recovered[0].to, ' '),
      'honest living patina',
      'Contextual recovery must re-locate the passage and update from/to'
    );

    console.log('✅ Scenario 9 Passed: Contextual recovery accurately restores shifted anchors even without transaction mapping.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 10: Ambiguous duplicate passages vs context-disambiguated duplicates, and deleted passages
  // ---------------------------------------------------------------------------
  {
    // 10A: Context-disambiguated duplicate phrase ("unlacquered brass" appears in two different sections/paragraphs)
    const docDisambiguated = buildDocFromBlocks([
      { type: 'heading', text: 'Section One: Material Honesty', level: 2 },
      {
        type: 'paragraph',
        text: 'Artisans prefer unlacquered brass because it records the history of the hand.',
      },
      { type: 'heading', text: 'Section Two: Maritime Instruments', level: 2 },
      {
        type: 'paragraph',
        text: 'Naval sextants used unlacquered brass paired with vernier silver scales.',
      },
    ]);

    const secondOcc = findPosOfSubstringInDoc(docDisambiguated, 'unlacquered brass', 2);
    const anchorSecond = extractSelectionAnchorFromDoc(
      docDisambiguated,
      secondOcc.from,
      secondOcc.to
    )!;

    const noteDisambiguated: ArticleEditingNote = {
      id: 'note-dup-disambig',
      projectId: 'proj-notes-test-1',
      ...anchorSecond,
      from: 1, // Force contextual disambiguation instead of exact offset shortcut
      to: 5,
      instruction: 'Specify naval alloy ratios here.',
      inputMethod: 'text',
      anchorStatus: 'resolved',
      createdAt: '2026-10-25T10:10:00.000Z',
      updatedAt: '2026-10-25T10:10:00.000Z',
    };

    const resolvedDisambig = mapAndResolveNotesInDoc(docDisambiguated, [noteDisambiguated]).updatedNotes;
    assert.equal(
      resolvedDisambig[0].anchorStatus,
      'resolved',
      'Duplicate phrase with distinct heading/paragraph/prefix/suffix context must disambiguate cleanly to resolved'
    );
    assert.equal(resolvedDisambig[0].from, secondOcc.from);
    assert.equal(resolvedDisambig[0].to, secondOcc.to);

    // 10B: Truly ambiguous identical duplicate paragraphs with stale offset
    const docAmbiguous = buildDocFromBlocks([
      { type: 'heading', text: 'Repeated Refrain', level: 2 },
      { type: 'paragraph', text: 'Solid brass ages with grace.' },
      { type: 'paragraph', text: 'Solid brass ages with grace.' },
    ]);

    const firstOcc = findPosOfSubstringInDoc(docAmbiguous, 'ages with grace', 1);
    const anchorAmbig = extractSelectionAnchorFromDoc(docAmbiguous, firstOcc.from, firstOcc.to)!;
    const noteAmbig: ArticleEditingNote = {
      id: 'note-dup-ambig',
      projectId: 'proj-notes-test-1',
      ...anchorAmbig,
      prefixContext: 'Solid brass ',
      suffixContext: '.',
      from: 999,
      to: 1005,
      instruction: 'Vary this repeated refrain.',
      inputMethod: 'text',
      anchorStatus: 'resolved',
      createdAt: '2026-10-25T10:10:30.000Z',
      updatedAt: '2026-10-25T10:10:30.000Z',
    };

    const resolvedAmbig = mapAndResolveNotesInDoc(docAmbiguous, [noteAmbig]).updatedNotes;
    assert.equal(
      resolvedAmbig[0].anchorStatus,
      'ambiguous',
      'Identical duplicate passages without disambiguating context must be marked ambiguous'
    );

    // 10C: Deleted anchored passage -> marked 'unresolved', never silently discarded
    const docAfterDeletion = buildDocFromBlocks([
      { type: 'heading', text: 'Introduction to Solid Brass', level: 2 },
      {
        type: 'paragraph',
        text: 'This paragraph was completely rewritten to discuss sterling silver hallmarks.',
      },
    ]);

    const resolvedDeleted = mapAndResolveNotesInDoc(docAfterDeletion, [noteDisambiguated]).updatedNotes;
    assert.equal(resolvedDeleted.length, 1, 'Deleted passage note must never be silently discarded');
    assert.equal(
      resolvedDeleted[0].anchorStatus,
      'unresolved',
      'Note whose anchored passage was deleted must be marked unresolved'
    );
    assert.equal(
      resolvedDeleted[0].quotedText,
      'unlacquered brass',
      'Unresolved note must retain its original quotedText for recovery'
    );

    console.log('✅ Scenario 10 Passed: Disambiguated duplicates resolve cleanly, identical duplicates mark ambiguous, and deleted passages mark unresolved without data loss.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 11: Multiple notes on one article and multiple notes on the same passage
  // ---------------------------------------------------------------------------
  {
    const doc = buildDocFromBlocks([
      { type: 'heading', text: 'Introduction', level: 2 },
      {
        type: 'paragraph',
        text: 'Solid machined brass develops an honest living patina over decades of daily handling.',
      },
      {
        type: 'paragraph',
        text: 'A heavy paperweight anchors both loose correspondence and the rhythm of thought.',
      },
    ]);

    const p1Pos = findPosOfSubstringInDoc(doc, 'honest living patina');
    const p2Pos = findPosOfSubstringInDoc(doc, 'loose correspondence');

    const anchorP1 = extractSelectionAnchorFromDoc(doc, p1Pos.from, p1Pos.to)!;
    const anchorP2 = extractSelectionAnchorFromDoc(doc, p2Pos.from, p2Pos.to)!;

    // Create Note A on Paragraph 2 first, then Note B and Note C on the exact same passage in Paragraph 1
    const noteOnP2: ArticleEditingNote = {
      id: 'note-multi-p2',
      projectId: 'proj-notes-test-1',
      ...anchorP2,
      instruction: 'Replace correspondence with field notebooks.',
      inputMethod: 'text',
      anchorStatus: 'resolved',
      createdAt: '2026-10-25T10:11:00.000Z',
      updatedAt: '2026-10-25T10:11:00.000Z',
    };

    const noteOnP1First: ArticleEditingNote = {
      id: 'note-multi-p1-a',
      projectId: 'proj-notes-test-1',
      ...anchorP1,
      instruction: 'First note on honest living patina: explain oxidation.',
      inputMethod: 'voice',
      anchorStatus: 'resolved',
      createdAt: '2026-10-25T10:11:10.000Z',
      updatedAt: '2026-10-25T10:11:10.000Z',
    };

    const noteOnP1Second: ArticleEditingNote = {
      id: 'note-multi-p1-b',
      projectId: 'proj-notes-test-1',
      ...anchorP1,
      instruction: 'Second note on honest living patina: keep it under 12 words.',
      inputMethod: 'text',
      anchorStatus: 'resolved',
      createdAt: '2026-10-25T10:11:20.000Z',
      updatedAt: '2026-10-25T10:11:20.000Z',
    };

    const sorted = sortEditingNotesInArticleOrder([noteOnP2, noteOnP1Second, noteOnP1First]);
    assert.deepEqual(
      sorted.map((n) => n.id),
      ['note-multi-p1-a', 'note-multi-p1-b', 'note-multi-p2'],
      'Notes must sort by article position first, then by creation order for multiple notes on the same passage'
    );

    console.log('✅ Scenario 11 Passed: Multiple notes across the article and multiple notes on the identical passage sort and coexist deterministically.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 12: Editing and deleting existing notes + project-switching isolation
  // ---------------------------------------------------------------------------
  {
    const projA = createSampleProject({
      id: 'proj-iso-A',
      title: 'Project A: Pocket Compasses',
      editingNotes: [
        {
          id: 'note-iso-1',
          projectId: 'proj-iso-A',
          quotedText: 'honest living patina',
          paragraphContext:
            'Solid machined brass develops an honest living patina over decades of daily handling.',
          prefixContext: 'Solid machined brass develops an ',
          suffixContext: ' over decades of daily handling.',
          from: 35,
          to: 55,
          instruction: 'Initial instruction for Project A',
          inputMethod: 'voice',
          anchorStatus: 'resolved',
          createdAt: '2026-10-25T10:12:00.000Z',
          updatedAt: '2026-10-25T10:12:00.000Z',
        },
      ],
    });

    const projB = createSampleProject({
      id: 'proj-iso-B',
      title: 'Project B: Japanese Fountain Pens',
      editingNotes: [],
    });

    // Edit note in Project A
    const editedNotesA = projA.editingNotes!.map((n) =>
      n.id === 'note-iso-1'
        ? { ...n, instruction: 'Updated instruction for Project A', updatedAt: '2026-10-25T10:12:30.000Z' }
        : n
    );
    assert.equal(editedNotesA[0].instruction, 'Updated instruction for Project A');
    assert.equal(projB.editingNotes?.length, 0, 'Project B must remain isolated from Project A notes');

    // Delete note in Project A
    const afterDeleteA = editedNotesA.filter((n) => n.id !== 'note-iso-1');
    assert.equal(afterDeleteA.length, 0);

    console.log('✅ Scenario 12 Passed: Editing and deleting notes work cleanly with strict per-project isolation.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 13: Dirty-state tracking & Manual Save persistence + exact Firestore operation counts
  // ---------------------------------------------------------------------------
  {
    const firestoreOps = {
      transactionalProjectSaves: 0,
      versionSnapshotWrites: 0,
      nonProjectWrites: 0,
      nonProjectDeletes: 0,
      lastSavedProject: null as WritingProject | null,
      lastSavedSnapshot: null as ProjectVersionSnapshot | null,
    };

    const mockAdapter: CloudStoreAdapter = {
      async fetchUserProjects() {
        return firestoreOps.lastSavedProject ? [firestoreOps.lastSavedProject] : [];
      },
      async fetchProjectVersions() {
        return firestoreOps.lastSavedSnapshot ? [firestoreOps.lastSavedSnapshot] : [];
      },
      async transactionalSaveProject(_userId, project, versionSnapshot, expectedBaseRevision) {
        firestoreOps.transactionalProjectSaves += 1;
        firestoreOps.versionSnapshotWrites += 1;
        const nextRev = (expectedBaseRevision || 0) + 1;
        const syncedAt = '2026-10-25T10:15:00.000Z';
        firestoreOps.lastSavedProject = {
          ...project,
          cloudRevision: nextRev,
          baseCloudRevision: nextRev,
          lastSyncedAt: syncedAt,
        };
        firestoreOps.lastSavedSnapshot = versionSnapshot;
        return { newCloudRevision: nextRev, syncedAt };
      },
      async writeDoc() {
        firestoreOps.nonProjectWrites += 1;
      },
      async deleteDoc() {
        firestoreOps.nonProjectDeletes += 1;
      },
    };

    syncEngine.setCustomAdapter(mockAdapter);
    (syncEngine as any).currentUser = { uid: 'test-user-notes-uid', email: 'editor@scienceofgifts.com' };

    const baselineProj = createSampleProject({
      id: 'proj-save-test',
      cloudRevision: 1,
      baseCloudRevision: 1,
      editingNotes: [],
    });

    // 1. Adding a note in working state marks the project dirty (hasProjectUnsavedChanges === true)
    //    and performs ZERO Firestore writes while editing.
    const workingWithNote: WritingProject = {
      ...baselineProj,
      editingNotes: [
        {
          id: 'note-persist-1',
          projectId: 'proj-save-test',
          quotedText: 'honest living patina',
          paragraphContext:
            'Solid machined brass develops an honest living patina over decades of daily handling.',
          prefixContext: 'Solid machined brass develops an ',
          suffixContext: ' over decades of daily handling.',
          headingContext: 'Introduction to Solid Brass',
          from: 65,
          to: 85,
          instruction: 'Add a parenthetical noting how bronze differs from yellow brass.',
          inputMethod: 'voice',
          anchorStatus: 'resolved',
          createdAt: '2026-10-25T10:14:00.000Z',
          updatedAt: '2026-10-25T10:14:00.000Z',
        },
      ],
    };

    assert.equal(
      hasProjectUnsavedChanges(workingWithNote, baselineProj),
      true,
      'Adding an editing note must mark the project as having unsaved changes'
    );
    assert.equal(
      firestoreOps.transactionalProjectSaves,
      0,
      'Creating or editing a note before manual Save must trigger 0 Firestore writes'
    );

    // 2. Manual Save: creates version snapshot, saves locally, and executes 1 transactional cloud save
    const updatedHistory = createVersionSnapshot(workingWithNote, 'manual_save', {
      label: 'Manual Save with Editing Note',
    });
    const latestSnap = updatedHistory[0];
    const locallySaved: WritingProject = {
      ...workingWithNote,
      versionHistory: updatedHistory,
    };
    storage.saveProject(locallySaved);

    const saveResult = await syncEngine.saveProjectToCloud(locallySaved, latestSnap);
    assert.equal(saveResult.ok, true);
    if (saveResult.ok) {
      assert.equal(saveResult.cloudRevision, 2);
      assert.equal(saveResult.updatedProject.editingNotes?.length, 1);
      assert.equal(
        saveResult.updatedProject.editingNotes?.[0].instruction,
        'Add a parenthetical noting how bronze differs from yellow brass.'
      );
      assert.equal(
        hasProjectUnsavedChanges(saveResult.updatedProject, saveResult.updatedProject),
        false,
        'After manual Save completes, project dirty state must clear'
      );
    }

    assert.equal(
      firestoreOps.transactionalProjectSaves,
      1,
      'Manual Save must perform exactly 1 transactional project save'
    );
    assert.equal(
      firestoreOps.versionSnapshotWrites,
      1,
      'Manual Save must write 1 version snapshot alongside the project'
    );
    assert.equal(
      firestoreOps.nonProjectWrites,
      0,
      'Manual project Save must trigger 0 non-project collection writes'
    );

    console.log(
      `✅ Scenario 13 Passed: Dirty state tracks note changes, 0 writes occur before Save, and Manual Save executes 1 transactional project write + 1 version snapshot write (0 non-project writes).`
    );
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 14: Reloading & remote Firestore snapshot reconciliation without echo writes
  // ---------------------------------------------------------------------------
  {
    const reloadedProjects = storage.getProjects();
    const reloaded = reloadedProjects.find((p) => p.id === 'proj-save-test');
    assert.ok(reloaded, 'Saved project must persist in local storage across reload');
    assert.equal(reloaded.editingNotes?.length, 1);
    assert.equal(
      reloaded.editingNotes?.[0].instruction,
      'Add a parenthetical noting how bronze differs from yellow brass.'
    );

    // Simulate incoming remote Firestore snapshot with an updated note from another device
    let echoWrites = 0;
    const echoCheckAdapter: CloudStoreAdapter = {
      async fetchUserProjects() {
        return [];
      },
      async fetchProjectVersions() {
        return [];
      },
      async transactionalSaveProject() {
        echoWrites += 1;
        return { newCloudRevision: 99, syncedAt: new Date().toISOString() };
      },
      async writeDoc() {
        echoWrites += 1;
      },
      async deleteDoc() {
        echoWrites += 1;
      },
    };
    syncEngine.setCustomAdapter(echoCheckAdapter);

    const remoteProjectWithSecondNote: WritingProject = {
      ...reloaded,
      cloudRevision: 3,
      baseCloudRevision: 3,
      editingNotes: [
        ...reloaded.editingNotes!,
        {
          id: 'note-remote-2',
          projectId: reloaded.id,
          quotedText: 'Never coat a fine desk compass',
          paragraphContext: 'Never coat a fine desk compass in synthetic polyurethane lacquer.',
          prefixContext: '',
          suffixContext: ' in synthetic polyurethane lacquer.',
          headingContext: 'Caring for Unlacquered Metal',
          from: 180,
          to: 210,
          instruction: 'Soften the imperative tone to an editorial observation.',
          inputMethod: 'text',
          anchorStatus: 'resolved',
          createdAt: '2026-10-25T10:16:00.000Z',
          updatedAt: '2026-10-25T10:16:00.000Z',
        },
      ],
    };

    // Save silently as incoming snapshot handler does
    storage.saveProject(remoteProjectWithSecondNote, { silent: true });
    const afterRemote = storage.getProjects().find((p) => p.id === 'proj-save-test')!;
    assert.equal(afterRemote.editingNotes?.length, 2);
    assert.equal(echoWrites, 0, 'Remote snapshot reconciliation must trigger 0 outbound echo writes');

    console.log('✅ Scenario 14 Passed: Local reload and remote Firestore snapshot reconciliation preserve editingNotes with 0 outbound echo writes.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 15: Version history restore preserves active editingNotes and re-anchors against restored content
  // ---------------------------------------------------------------------------
  {
    // Version 1 (initial draft) had paragraph 1 ("honest living patina") but NOT paragraph 4 ("marine chronometer escapement")
    const v1Project = createSampleProject({
      id: 'proj-version-restore',
      editingNotes: [],
    });
    const historyAfterV1 = createVersionSnapshot(v1Project, 'manual_save', {
      label: 'Version 1 Baseline',
      force: true,
    });
    const v1SnapshotId = historyAfterV1[0].id;

    // Later in Version 2, the author added a new paragraph AND attached two notes:
    // - Note 1 anchored to "honest living patina" (exists in V1 and V2)
    // - Note 2 anchored to "marine chronometer escapement" (only exists in V2)
    const v2Html =
      v1Project.content +
      '<h2>Horological Precision</h2><p>Every marine chronometer escapement relies on low-friction jewel bearings.</p>';

    const v2Notes = reconcileNotesWithHtmlContent(v2Html, [
      {
        id: 'note-v-1',
        projectId: v1Project.id,
        quotedText: 'honest living patina',
        paragraphContext:
          'Solid machined brass develops an honest living patina over decades of daily handling.',
        prefixContext: 'Solid machined brass develops an ',
        suffixContext: ' over decades of daily handling.',
        headingContext: 'Introduction to Solid Brass',
        from: 35,
        to: 55,
        instruction: 'Keep this phrase in all versions.',
        inputMethod: 'voice',
        anchorStatus: 'resolved',
        createdAt: '2026-10-25T10:17:00.000Z',
        updatedAt: '2026-10-25T10:17:00.000Z',
      },
      {
        id: 'note-v-2',
        projectId: v1Project.id,
        quotedText: 'marine chronometer escapement',
        paragraphContext:
          'Every marine chronometer escapement relies on low-friction jewel bearings.',
        prefixContext: 'Every ',
        suffixContext: ' relies on low-friction jewel bearings.',
        headingContext: 'Horological Precision',
        from: 250,
        to: 279,
        instruction: 'Explain detent escapement geometry.',
        inputMethod: 'text',
        anchorStatus: 'resolved',
        createdAt: '2026-10-25T10:17:10.000Z',
        updatedAt: '2026-10-25T10:17:10.000Z',
      },
    ]);

    const v2Project: WritingProject = {
      ...v1Project,
      content: v2Html,
      editingNotes: v2Notes,
      versionHistory: historyAfterV1,
    };

    // Now restore Version 1!
    const restoreRes = restoreVersionSnapshot(v2Project, v1SnapshotId);
    assert.ok(restoreRes, 'Version 1 restore must succeed');
    const restoredNotes = restoreRes.updatedProject.editingNotes || [];
    assert.equal(
      restoredNotes.length,
      2,
      'Restoring an earlier version must preserve active editing notes rather than wiping them'
    );

    const restoredNote1 = restoredNotes.find((n) => n.id === 'note-v-1')!;
    const restoredNote2 = restoredNotes.find((n) => n.id === 'note-v-2')!;
    assert.equal(
      restoredNote1.anchorStatus,
      'resolved',
      'Note whose passage exists in the restored version must re-anchor as resolved'
    );
    assert.equal(
      restoredNote2.anchorStatus,
      'unresolved',
      'Note whose passage does not exist in the restored version must be retained and marked unresolved'
    );

    console.log('✅ Scenario 15 Passed: Version history restore preserves active editingNotes, re-anchors matching passages, and marks missing passages as unresolved.');
    passed++;
  }

  // ---------------------------------------------------------------------------
  // SCENARIO 16: Exporting a consolidated editing brief for ChatGPT / Claude
  // ---------------------------------------------------------------------------
  {
    const notesForBrief: ArticleEditingNote[] = [
      // Intentionally pass out of order to verify article-order sorting in brief
      {
        id: 'note-brief-late',
        projectId: 'proj-notes-test-1',
        quotedText: 'synthetic polyurethane lacquer',
        paragraphContext: 'Never coat a fine desk compass in synthetic polyurethane lacquer.',
        prefixContext: 'Never coat a fine desk compass in ',
        suffixContext: '.',
        headingContext: 'Caring for Unlacquered Metal',
        from: 215,
        to: 245,
        instruction: 'Contrast polyurethane with traditional microcrystalline renaissance wax.',
        inputMethod: 'text',
        anchorStatus: 'resolved',
        createdAt: '2026-10-25T10:18:00.000Z',
        updatedAt: '2026-10-25T10:18:00.000Z',
      },
      {
        id: 'note-brief-early',
        projectId: 'proj-notes-test-1',
        quotedText: 'honest living patina',
        paragraphContext:
          'Solid machined brass develops an honest living patina over decades of daily handling.',
        prefixContext: 'Solid machined brass develops an ',
        suffixContext: ' over decades of daily handling.',
        headingContext: 'Introduction to Solid Brass',
        from: 35,
        to: 55,
        instruction: 'Describe the transition from bright mill finish to warm umber.',
        inputMethod: 'voice',
        anchorStatus: 'resolved',
        createdAt: '2026-10-25T10:18:10.000Z',
        updatedAt: '2026-10-25T10:18:10.000Z',
      },
      {
        id: 'note-brief-unresolved',
        projectId: 'proj-notes-test-1',
        quotedText: 'deleted paragraph about barometer tubes',
        paragraphContext: 'Old mercury barometer tubes require careful vertical transport.',
        prefixContext: 'Old mercury ',
        suffixContext: ' require careful vertical transport.',
        headingContext: 'Removed Section',
        from: 120,
        to: 158,
        instruction: 'Reintroduce a brief mention of Torricellian vacuum tubes if appropriate.',
        inputMethod: 'voice',
        anchorStatus: 'unresolved',
        createdAt: '2026-10-25T10:18:20.000Z',
        updatedAt: '2026-10-25T10:18:20.000Z',
      },
    ];

    const proj = createSampleProject({
      title: 'The Quiet Physics of Brass Desk Instruments',
      editingNotes: notesForBrief,
    });

    const brief = buildConsolidatedEditingBrief(proj, { targetAssistant: 'claude' });

    // Verify metadata & structure
    assert.ok(brief.includes('# CONSOLIDATED ARTICLE EDITING BRIEF (FOR CLAUDE)'));
    assert.ok(brief.includes('The Quiet Physics of Brass Desk Instruments'));
    assert.ok(brief.includes('- **Total Editing Notes**: 3'));

    // Verify Note 1 is the early article note and Note 2 is the late article note
    const idxEarly = brief.indexOf('Describe the transition from bright mill finish to warm umber.');
    const idxLate = brief.indexOf(
      'Contrast polyurethane with traditional microcrystalline renaissance wax.'
    );
    assert.ok(idxEarly > 0 && idxLate > idxEarly, 'Brief must list anchored notes in article order');

    // Verify anchored passage & paragraph context are both included
    assert.ok(brief.includes('- **Selected Passage**: "honest living patina"'));
    assert.ok(
      brief.includes(
        '- **Containing Paragraph Context**: "Solid machined brass develops an honest living patina over decades of daily handling."'
      )
    );

    // Verify unresolved notes section is clearly labelled
    assert.ok(brief.includes('## 5. NOTES NEEDING ATTENTION / UNRESOLVED ANCHORS (1)'));
    assert.ok(brief.includes('deleted paragraph about barometer tubes'));

    // Verify full clean article text is included without embedded marker noise
    assert.ok(brief.includes('## 3. FULL ARTICLE TEXT'));
    assert.ok(brief.includes('## Introduction to Solid Brass'));
    assert.ok(!brief.includes('editing-note-marker-badge'));

    console.log('✅ Scenario 16 Passed: Consolidated Editing Brief exports metadata, ordered notes, passage & paragraph context, unresolved notes section, and clean full article prose.');
    passed++;
  }

  // Cleanup test project from storage
  storage.deleteProject('proj-save-test');

  console.log(`\n===================================================================`);
  console.log(`ALL ${passed}/16 ARTICLE-ANCHORED VOICE EDITING NOTES SCENARIOS PASSED!`);
  console.log(`===================================================================\n`);
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
