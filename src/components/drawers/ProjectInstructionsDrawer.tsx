/**
 * Science of Gifts - Project Instructions Drawer (Requirement #8)
 * Dedicated, separate area for project-specific editorial guidance.
 * Applies strictly to the current project (visually distinct from Global Instructions).
 */

import React from 'react';
import { FileEdit, X, HelpCircle, Sparkles, BookOpen } from 'lucide-react';

interface ProjectInstructionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectTitle: string;
  instructions: string;
  onChange: (updatedInstructions: string) => void;
}

export const ProjectInstructionsDrawer: React.FC<ProjectInstructionsDrawerProps> = ({
  isOpen,
  onClose,
  projectTitle,
  instructions = '',
  onChange,
}) => {
  if (!isOpen) return null;

  const exampleIdeas = [
    'Focus particularly on the psychological relief of giving an object meant to last.',
    'Keep historical context concise and accessible; prioritize practical everyday ergonomics.',
    'Emphasize the sensory contrast between cold machined steel and warm oiled leather.',
    'Maintain a lighter, self-effacing tone without sacrificing connoisseur credibility.',
  ];

  return (
    <div className="max-md:fixed max-md:inset-0 max-md:z-50 max-md:w-full w-full md:w-[440px] lg:w-[480px] shrink-0 h-full bg-[#faf9f6] md:border-l border-[#dcd6ca] flex flex-col overflow-hidden animate-in slide-in-from-right-1 duration-150 z-30">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-[#e5dfd3] bg-[#f5f2ea] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-md bg-stone-100 border border-stone-300 flex items-center justify-center text-stone-800 shrink-0">
            <FileEdit className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-editorial text-lg font-semibold text-[#1e232a] truncate">
              Project Instructions
            </h3>
            <p className="text-xs text-[#736c61] truncate">
              Specific guidance for &quot;{projectTitle || 'this project'}&quot;
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-[#736c61] hover:text-[#2d333b] rounded-lg hover:bg-[#e8e2d5] transition-colors shrink-0"
          title="Close Project Instructions"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Distinction notice */}
      <div className="px-5 py-2.5 bg-emerald-50/70 border-b border-emerald-200/60 flex items-start gap-2 text-xs text-emerald-950">
        <HelpCircle className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
        <span>
          <strong>Layer 2 — Editorial Brief & Controls:</strong> These directives guide the specific angle and purpose of this piece. They operate beneath the universal House Constitution (Layer 1) and cannot contradict it.
        </span>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5 text-sm">
        <div>
          <label className="block text-xs font-semibold text-[#443d34] uppercase tracking-wider mb-2">
            Editorial Guidance for this Piece
          </label>
          <textarea
            rows={8}
            value={instructions}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Describe the distinct angle, pacing, or focus for this project... (e.g. 'Focus on the tactile ritual of manual winding and why mechanical tools feel grounding in a screen-saturated era.')"
            className="w-full p-3.5 text-xs rounded-xl border border-[#dcd6ca] bg-white focus:outline-hidden focus:ring-1 focus:ring-amber-500 text-[#1e232a] leading-relaxed font-sans shadow-2xs"
          />
        </div>

        {/* Suggestion prompts */}
        <div className="pt-3 border-t border-[#e8e2d5]">
          <span className="block text-[11px] font-semibold text-[#736c61] uppercase tracking-wider mb-2.5">
            Example Directives
          </span>
          <div className="space-y-2">
            {exampleIdeas.map((idea, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  const prefix = instructions.trim() ? instructions.trim() + '\n\n' : '';
                  onChange(prefix + idea);
                }}
                className="w-full text-left p-2.5 rounded-lg border border-[#e5dfd3] bg-white hover:bg-[#f9f7f2] hover:border-[#dcd6ca] transition-all text-xs text-[#3d362e] flex items-start gap-2 group shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-700 mt-0.5 shrink-0 group-hover:scale-110 transition-transform" />
                <span className="leading-snug">{idea}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
