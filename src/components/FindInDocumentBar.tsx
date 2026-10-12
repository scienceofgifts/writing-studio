/**
 * Science of Gifts - In-Document Search Bar (Phase 10, Part E)
 * Searches structured rich text and highlights matching segments in the active editor/workspace.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';

interface FindInDocumentBarProps {
  isOpen: boolean;
  onClose: () => void;
  onSearchChange?: (query: string) => void;
  totalMatches?: number;
  currentMatchIndex?: number;
  onNextMatch?: () => void;
  onPrevMatch?: () => void;
}

export const FindInDocumentBar: React.FC<FindInDocumentBarProps> = ({
  isOpen,
  onClose,
  onSearchChange,
  totalMatches = 0,
  currentMatchIndex = 0,
  onNextMatch,
  onPrevMatch,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      setQuery('');
      if (onSearchChange) onSearchChange('');
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (onSearchChange) {
      onSearchChange(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        onPrevMatch?.();
      } else {
        onNextMatch?.();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="search"
      aria-label="Find in document"
      className="bg-white border border-[#dcd6ca] rounded-xl shadow-md p-2 flex items-center gap-2 max-w-sm w-full animate-fade-in z-30"
    >
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Find in document..."
          className="w-full text-xs pl-7 pr-16 py-1.5 rounded-lg border border-[#dcd6ca] bg-[#faf8f4] focus:outline-hidden focus:bg-white text-[#1e232a]"
        />
        <Search className="w-3.5 h-3.5 text-[#8c8477] absolute left-2 top-2" />
        {query.trim() && (
          <span className="absolute right-2 top-1.5 text-[10px] text-[#736c61] font-mono">
            {totalMatches > 0
              ? `${currentMatchIndex + 1} of ${totalMatches}`
              : '0 matches'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onPrevMatch}
          disabled={totalMatches === 0}
          aria-label="Previous match (Shift+Enter)"
          title="Previous match (Shift+Enter)"
          className="p-1 text-[#5c5447] hover:text-[#1e232a] disabled:opacity-30 rounded-md hover:bg-[#f6f3eb]"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onNextMatch}
          disabled={totalMatches === 0}
          aria-label="Next match (Enter)"
          title="Next match (Enter)"
          className="p-1 text-[#5c5447] hover:text-[#1e232a] disabled:opacity-30 rounded-md hover:bg-[#f6f3eb]"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-[#e5dfd3] mx-0.5" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close search (Escape)"
          title="Close search (Escape)"
          className="p-1 text-[#8c8477] hover:text-[#1e232a] rounded-md hover:bg-[#f6f3eb]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
