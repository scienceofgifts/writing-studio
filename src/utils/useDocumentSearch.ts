/**
 * Science of Gifts - In-Document Text Search Hook (Phase 10, Part E)
 * Finds text occurrences in document DOM containers without modifying rich text HTML.
 */

import { useState, useCallback, useEffect } from 'react';

export function useDocumentSearch(containerRef: React.RefObject<HTMLElement | null>) {
  const [query, setQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matches, setMatches] = useState<Range[]>([]);

  const clearHighlights = useCallback(() => {
    // Remove custom search highlight markers if any exist
    if (!containerRef.current) return;
    const existing = containerRef.current.querySelectorAll('.sg-search-highlight, .sg-search-active');
    existing.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });
  }, [containerRef]);

  const performSearch = useCallback(
    (searchQuery: string) => {
      setQuery(searchQuery);
      clearHighlights();

      if (!searchQuery.trim() || !containerRef.current) {
        setMatchCount(0);
        setCurrentIndex(0);
        setMatches([]);
        return;
      }

      const container = containerRef.current;
      const textNodes: Text[] = [];
      const walk = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      let node: Node | null;
      while ((node = walk.nextNode())) {
        if (node.nodeValue && node.nodeValue.trim().length > 0) {
          textNodes.push(node as Text);
        }
      }

      const lowerQuery = searchQuery.toLowerCase();
      const foundRanges: Range[] = [];

      textNodes.forEach((textNode) => {
        const text = textNode.nodeValue || '';
        const lowerText = text.toLowerCase();
        let startIndex = 0;
        let index: number;

        while ((index = lowerText.indexOf(lowerQuery, startIndex)) !== -1) {
          const range = document.createRange();
          range.setStart(textNode, index);
          range.setEnd(textNode, index + searchQuery.length);
          foundRanges.push(range);
          startIndex = index + searchQuery.length;
        }
      });

      setMatchCount(foundRanges.length);
      setCurrentIndex(0);
      setMatches(foundRanges);

      if (foundRanges.length > 0) {
        // Scroll first match into view
        const firstEl = foundRanges[0].startContainer.parentElement;
        if (firstEl) {
          firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    },
    [containerRef, clearHighlights]
  );

  const nextMatch = useCallback(() => {
    if (matchCount === 0) return;
    const next = (currentIndex + 1) % matchCount;
    setCurrentIndex(next);
    const range = matches[next];
    if (range) {
      const el = range.startContainer.parentElement;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex, matchCount, matches]);

  const prevMatch = useCallback(() => {
    if (matchCount === 0) return;
    const prev = (currentIndex - 1 + matchCount) % matchCount;
    setCurrentIndex(prev);
    const range = matches[prev];
    if (range) {
      const el = range.startContainer.parentElement;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex, matchCount, matches]);

  return {
    query,
    matchCount,
    currentIndex,
    performSearch,
    nextMatch,
    prevMatch,
    clearHighlights,
  };
}
