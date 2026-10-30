import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyHyperlinkToHtml, insertSentenceAfterContext, reviseSentenceInHtml, validateInternalLinkUrl } from '../urlUtils';

describe('Internal Linking Utilities', () => {
  describe('applyHyperlinkToHtml', () => {
    it('matches anchor text across HTML tags', () => {
      const html = '<p>This is a <strong>strong</strong> match.</p>';
      const anchor = 'strong match';
      const url = 'https://example.com';
      
      const { updatedHtml, applied } = applyHyperlinkToHtml(html, anchor, url);
      
      assert.equal(applied, true);
      // URL cleaner adds trailing slash for root domain
      assert.ok(updatedHtml.includes('<a href="https://example.com/"'));
      // Should wrap the <strong> tag because it's part of the anchor
      assert.equal(updatedHtml, '<p>This is a <a href="https://example.com/" target="_blank" rel="noopener noreferrer"><strong>strong</strong> match</a>.</p>');
    });

    it('matches anchor text with HTML entities and whitespace normalization', () => {
      const html = '<p>Match&nbsp;this text.</p>';
      const anchor = 'Match this text';
      const url = 'https://example.com';
      
      const { updatedHtml, applied } = applyHyperlinkToHtml(html, anchor, url);
      
      assert.equal(applied, true);
      assert.ok(updatedHtml.includes('Match&nbsp;this text'));
    });

    it('respects targetPassage for specific matching', () => {
      const html = '<p>First occurrence. Second occurrence.</p>';
      const anchor = 'occurrence';
      const targetPassage = 'Second occurrence';
      const url = 'https://example.com';
      
      const { updatedHtml, applied } = applyHyperlinkToHtml(html, anchor, url, targetPassage);
      
      assert.equal(applied, true);
      const parts = updatedHtml.split('<a');
      assert.equal(parts.length, 2);
      assert.ok(updatedHtml.includes('First occurrence. Second <a'));
    });

    it('prevents duplicate links (idempotency)', () => {
      const html = '<p>Already has <a href="https://example.com/">link</a>.</p>';
      const anchor = 'link';
      const url = 'https://example.com';
      
      const { applied } = applyHyperlinkToHtml(html, anchor, url);
      assert.equal(applied, false);
    });

    it('does not link if already inside another <a> tag', () => {
      const html = '<p><a href="https://other.com/">Inside <strong>strong</strong> link</a></p>';
      const anchor = 'strong link';
      const url = 'https://example.com';
      
      const { applied } = applyHyperlinkToHtml(html, anchor, url);
      assert.equal(applied, false);
    });
  });

  describe('insertSentenceAfterContext', () => {
    it('inserts a new sentence after a context sentence within a paragraph', () => {
      const html = '<p>This is the context. This is the end.</p>';
      const context = 'This is the context.';
      const newSentence = 'This is a new linkable sentence.';
      const anchor = 'linkable sentence';
      const url = 'https://example.com';
      
      const { updatedHtml, applied } = insertSentenceAfterContext(html, context, newSentence, url, anchor);
      
      assert.equal(applied, true);
      assert.ok(updatedHtml.includes('This is the context. This is a new <a href="https://example.com/"'));
      assert.ok(updatedHtml.includes('linkable sentence</a>. This is the end.'));
    });

    it('inserts before the closing paragraph tag', () => {
      const html = '<p>Context sentence.</p>';
      const context = 'Context sentence.';
      const newSentence = 'New sentence.';
      const anchor = 'New sentence';
      const url = 'https://example.com';
      
      const { updatedHtml, applied } = insertSentenceAfterContext(html, context, newSentence, url, anchor);
      
      assert.equal(applied, true);
      assert.equal(updatedHtml, '<p>Context sentence. <a href="https://example.com/" target="_blank" rel="noopener noreferrer">New sentence</a>.</p>');
    });

    it('handles HTML-agnostic context matching', () => {
      const html = '<p>Context <em>sentence</em>.</p>';
      const context = 'Context sentence.';
      const newSentence = 'New sentence.';
      const anchor = 'New sentence';
      const url = 'https://example.com';
      
      const { updatedHtml, applied } = insertSentenceAfterContext(html, context, newSentence, url, anchor);
      
      assert.equal(applied, true);
      assert.ok(updatedHtml.includes('Context <em>sentence</em>. <a'));
    });

    it('rejects ambiguous context sentences', () => {
      const html = '<p>Duplicate. Duplicate.</p>';
      const context = 'Duplicate.';
      const newSentence = 'New.';
      const { applied } = insertSentenceAfterContext(html, context, newSentence, 'https://example.com', 'New');
      assert.equal(applied, false);
    });

    it('prevents duplicate inserted sentences (idempotency)', () => {
      const html = '<p>Context sentence. <a href="https://example.com/" target="_blank" rel="noopener noreferrer">New sentence</a>.</p>';
      const context = 'Context sentence.';
      const newSentence = 'New sentence.';
      const anchor = 'New sentence';
      const url = 'https://example.com';

      const { applied } = insertSentenceAfterContext(html, context, newSentence, url, anchor);
      assert.equal(applied, false, 'Should not insert the same sentence/URL pair twice');
    });
  });

  describe('reviseSentenceInHtml', () => {
    it('replaces original passage with a revised version and applies the link', () => {
      const html = '<p>Original clumsy sentence.</p>';
      const original = 'Original clumsy sentence.';
      const revised = 'A refined, elegant sentence.';
      const anchor = 'elegant sentence';
      const url = 'https://example.com';

      const { updatedHtml, applied } = reviseSentenceInHtml(html, original, revised, url, anchor);

      assert.equal(applied, true);
      assert.equal(updatedHtml, '<p>A refined, <a href="https://example.com/" target="_blank" rel="noopener noreferrer">elegant sentence</a>.</p>');
    });

    it('preserves surrounding blocks when replacing', () => {
      const html = '<div><p>Lead-in.</p><p>Original passage.</p></div>';
      const original = 'Original passage.';
      const revised = 'Revised passage.';
      const anchor = 'Revised';
      const url = 'https://example.com';

      const { updatedHtml, applied } = reviseSentenceInHtml(html, original, revised, url, anchor);

      assert.equal(applied, true);
      assert.ok(updatedHtml.includes('<div><p>Lead-in.</p><p><a href="https://example.com/" target="_blank" rel="noopener noreferrer">Revised</a> passage.</p></div>'));
    });

    it('handles HTML-agnostic matching for the original passage', () => {
      const html = '<p>This is a <strong>tough</strong> match.</p>';
      const original = 'This is a tough match.';
      const revised = 'This is a simple link.';
      const anchor = 'simple link';
      const url = 'https://example.com';

      const { updatedHtml, applied } = reviseSentenceInHtml(html, original, revised, url, anchor);

      assert.equal(applied, true);
      assert.equal(updatedHtml, '<p>This is a <a href="https://example.com/" target="_blank" rel="noopener noreferrer">simple link</a>.</p>');
    });

    it('prevents duplicate revisions (idempotency)', () => {
      const html = '<p><a href="https://example.com/">Revised sentence</a>.</p>';
      const original = 'Old sentence.';
      const revised = 'Revised sentence.';
      const anchor = 'Revised sentence';
      const url = 'https://example.com';

      const { applied } = reviseSentenceInHtml(html, original, revised, url, anchor);
      assert.equal(applied, false);
    });

    it('matches passage case-insensitively (Regression)', () => {
      const html = '<p>The Science of Gifts is a great resource.</p>';
      const original = 'the science of gifts';
      const revised = 'The Science of Gifts';
      const anchor = 'Science of Gifts';
      const url = 'https://example.com';

      const { updatedHtml, applied } = reviseSentenceInHtml(html, original, revised, url, anchor);
      assert.equal(applied, true, 'Should match case-insensitively');
      assert.ok(updatedHtml.includes('<a href="https://example.com/"'));
    });
  });

  describe('Robust Matching (Regression Suite)', () => {
    it('matches across different terminal punctuation', () => {
      const html = '<p>This is a sentence.</p>';
      const anchor = 'sentence';
      const url = 'https://example.com';
      const passage = 'This is a sentence!'; // AI adds '!'
      
      const { applied } = applyHyperlinkToHtml(html, anchor, url, passage);
      assert.equal(applied, true, 'Should match even if AI added/changed terminal punctuation');
    });

    it('matches across collapsed whitespace', () => {
      const html = '<p>Multiple    spaces   here.</p>';
      const anchor = 'spaces';
      const url = 'https://example.com';
      const passage = 'Multiple spaces here.'; // AI returns normalized spaces
      
      const { applied } = applyHyperlinkToHtml(html, anchor, url, passage);
      assert.equal(applied, true, 'Should match even if whitespace is differently collapsed');
    });
  });

  describe('validateInternalLinkUrl (Regression Suite)', () => {
    const availableLinks = [
      { id: 'link-1', url: 'https://scienceofgifts.com/blog/best-pocket-knives', title: 'Best Pocket Knives' },
      { id: 'link-2', url: 'https://scienceofgifts.com/shop/brass-compass', title: 'Brass Compass' }
    ];

    it('returns validated URL for exact match', () => {
      const suggested = 'https://scienceofgifts.com/blog/best-pocket-knives';
      const { validatedUrl, wasCorrected } = validateInternalLinkUrl(suggested, 'link-1', availableLinks);
      
      assert.equal(validatedUrl, availableLinks[0].url);
      assert.equal(wasCorrected, false);
    });

    it('returns validated URL for normalized match (case/slashes)', () => {
      const suggested = 'https://scienceofgifts.com/blog/best-pocket-knives/';
      const { validatedUrl, wasCorrected } = validateInternalLinkUrl(suggested, 'link-1', availableLinks);
      
      assert.equal(validatedUrl, availableLinks[0].url);
      assert.equal(wasCorrected, false);
    });

    it('corrects hallucinated URL via ID match', () => {
      const hallucinated = '/articles/best-pocket-knives'; // Hallucinated prefix
      const { validatedUrl, wasCorrected } = validateInternalLinkUrl(hallucinated, 'link-1', availableLinks);
      
      assert.equal(validatedUrl, availableLinks[0].url);
      assert.equal(wasCorrected, true);
    });

    it('returns null for unknown URL and ID', () => {
      const unknown = 'https://other.com/unknown';
      const { validatedUrl } = validateInternalLinkUrl(unknown, 'link-unknown', availableLinks);
      
      assert.equal(validatedUrl, null);
    });
  });
});
