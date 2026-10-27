import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyHyperlinkToHtml, insertSentenceAfterContext } from '../urlUtils';

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
  });
});
