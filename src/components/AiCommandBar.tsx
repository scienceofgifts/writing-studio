/**
 * Science of Gifts - AI Command Bar (Requirement #10)
 * Allows freeform editorial commands with granular scope control.
 */

import React, { useState } from 'react';
import { Sparkles, ArrowRight, CornerDownLeft, Target, AlertTriangle } from 'lucide-react';

interface AiCommandBarProps {
  selectedText?: string;
  onExecuteCommand: (command: string, scope: 'selection' | 'paragraph' | 'section' | 'all') => void;
  isLoading: boolean;
}

export const AiCommandBar: React.FC<AiCommandBarProps> = ({
  selectedText = '',
  onExecuteCommand,
  isLoading,
}) => {
  const [command, setCommand] = useState('');
  const [scope, setScope] = useState<'selection' | 'paragraph' | 'section' | 'all'>(
    selectedText ? 'selection' : 'all'
  );

  // Sync scope when selection changes
  React.useEffect(() => {
    if (selectedText) {
      setScope('selection');
    }
  }, [selectedText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isLoading) return;
    onExecuteCommand(command.trim(), scope);
    setCommand('');
  };

  const quickPills = [
    'Make this less salesy',
    'Remove generic filler',
    'Tighten prose & improve flow',
    'Add tangible material detail',
    'Deepen historical context',
    'Make more conversational & witty',
  ];

  const handlePillClick = (pillText: string) => {
    onExecuteCommand(pillText, scope);
  };

  return (
    <div className="bg-[#f5f2ea] border-t border-[#e2dcd0] px-3 sm:px-4 py-2.5 sm:py-3 shrink-0">
      <div className="max-w-4xl mx-auto space-y-2">
        {/* Form bar */}
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Scope Selector */}
          <div className="relative shrink-0">
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as any)}
              className="w-full sm:w-auto text-xs font-semibold bg-white border border-[#dcd6ca] text-[#2d333b] py-2 pl-2.5 pr-7 rounded-lg appearance-none cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-amber-500 shadow-2xs"
            >
              {selectedText ? (
                <option value="selection">Selected Text ({selectedText.split(/\s+/).filter(Boolean).length}w)</option>
              ) : null}
              <option value="paragraph">Current Paragraph</option>
              <option value="section">Current Section</option>
              <option value="all">Entire Document</option>
            </select>
            <Target className="w-3.5 h-3.5 text-[#736c61] absolute right-2 top-2.5 pointer-events-none" />
          </div>

          {/* Input field */}
          <div className="relative flex-1">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              disabled={isLoading}
              placeholder={
                selectedText
                  ? 'Tell the AI what to change in the selected text... (e.g. "Make this more observant")'
                  : 'Tell the AI what to write or refine... (e.g. "Improve flow and strip marketing clichés")'
              }
              className="w-full text-xs bg-white border border-[#dcd6ca] rounded-lg py-2 pl-9 pr-10 text-[#1e232a] placeholder-[#8c8477] focus:outline-hidden focus:ring-1 focus:ring-amber-500 shadow-2xs"
            />
            <Sparkles className="w-4 h-4 text-amber-700 absolute left-3 top-2.5" />
            <button
              type="submit"
              disabled={!command.trim() || isLoading}
              className="absolute right-1.5 top-1.5 p-1 bg-[#1e232a] text-white rounded-md hover:bg-[#2d333b] disabled:opacity-30 disabled:hover:bg-[#1e232a] transition-colors"
              title="Execute command"
            >
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>

        {/* Quick action chips & scope advisory */}
        <div className="flex items-center justify-between gap-3 text-[11px] overflow-x-auto pb-0.5">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[#8c8477] font-medium hidden sm:inline">Suggestions:</span>
            {quickPills.slice(0, 4).map((pill) => (
              <button
                key={pill}
                type="button"
                disabled={isLoading}
                onClick={() => handlePillClick(pill)}
                className="px-2 py-0.5 rounded-md bg-white border border-[#ded8cc] text-[#4a443b] hover:bg-[#eee8db] hover:text-[#1e232a] transition-colors disabled:opacity-50 shrink-0"
              >
                {pill}
              </button>
            ))}
          </div>

          {scope === 'all' && (
            <div className="flex items-center gap-1 text-[11px] text-amber-900 bg-amber-100/60 px-2 py-0.5 rounded-sm shrink-0">
              <AlertTriangle className="w-3 h-3 text-amber-700" />
              <span>Full doc scope</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
