import React, { useState } from 'react';
import {
  X,
  Lightbulb,
  Sparkles,
  Loader2,
  CheckCircle2,
  ArrowRight,
  BookOpen,
  Filter,
} from 'lucide-react';
import { ResearchStudy, PotentialArticleIdea } from '../../types/research';
import { researchService } from '../../services/researchService';
import { EditorialIdea } from '../../types/ideaGenerator';
import { toast } from '../../services/toastService';

interface ResearchIdeasModalProps {
  isOpen: boolean;
  onClose: () => void;
  studies: ResearchStudy[];
  onUseIdea: (idea: EditorialIdea, targetAudience?: string) => void;
}

export const ResearchIdeasModal: React.FC<ResearchIdeasModalProps> = ({
  isOpen,
  onClose,
  studies,
  onUseIdea,
}) => {
  const [selectedStudyIds, setSelectedStudyIds] = useState<string[]>(() =>
    studies.slice(0, 3).map((s) => s.id)
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedIdeas, setGeneratedIdeas] = useState<PotentialArticleIdea[]>([]);

  if (!isOpen) return null;

  const toggleStudy = (id: string) => {
    setSelectedStudyIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    const chosenStudies = studies.filter((s) => selectedStudyIds.includes(s.id));
    if (chosenStudies.length === 0) {
      toast.error('Selection Required', 'Please select at least one study to inspire ideas.');
      return;
    }

    setIsGenerating(true);
    try {
      const ideas = await researchService.generateIdeasFromResearch(chosenStudies);
      setGeneratedIdeas(ideas);
      toast.success('Concepts Formulated', `Generated ${ideas.length} article concepts grounded in empirical findings.`);
    } catch (err) {
      toast.error('Generation Failed', 'Could not generate research ideas. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectIdea = (idea: PotentialArticleIdea) => {
    const editorialIdea: EditorialIdea = {
      id: `idea-${Date.now()}`,
      title: idea.title,
      angle: idea.angle,
      whyInteresting: idea.whyInteresting || 'Arises from rigorous empirical research.',
      searchIntent: idea.searchIntent || 'Psychological & Cultural Gifting Insight',
    };
    onUseIdea(editorialIdea, 'Discerning gifters & readers');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#fcfbf9] border border-[#dcd6ca] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-[#1e232a]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#eae4d7] flex items-center justify-between bg-[#f7f4ed]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-900">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-[#1e232a] tracking-tight">
                Generate Ideas from Research
              </h2>
              <p className="text-xs text-[#736c61]">
                Synthesize empirical findings, limitations, and tensions into compelling article concepts.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#857d72] hover:text-[#1e232a] hover:bg-[#eae4d7] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Studies Selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[#736c61]">
                Select Source Studies ({selectedStudyIds.length} of {studies.length} selected)
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedStudyIds(studies.map((s) => s.id))}
                  className="text-amber-900 hover:underline"
                >
                  Select All
                </button>
                <span className="text-[#dcd6ca]">•</span>
                <button
                  type="button"
                  onClick={() => setSelectedStudyIds([])}
                  className="text-[#736c61] hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border border-[#eae4d7] rounded-xl bg-[#faf8f4]">
              {studies.map((study) => {
                const isSelected = selectedStudyIds.includes(study.id);
                return (
                  <div
                    key={study.id}
                    onClick={() => toggleStudy(study.id)}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-2.5 select-none ${
                      isSelected
                        ? 'border-amber-700 bg-amber-50/70 shadow-2xs'
                        : 'border-[#eae4d7] bg-white hover:border-[#cfc8ba]'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="mt-0.5 rounded text-amber-900 focus:ring-amber-800"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-[#1e232a] truncate font-serif">
                        {study.title}
                      </div>
                      <div className="text-[11px] text-[#736c61] truncate">
                        {study.authors?.[0] || 'Unknown author'} ({study.publicationYear || 'n.d.'})
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Trigger */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-[#f5f1e8] border border-[#e3dcce]">
            <div className="text-xs text-[#5e5548]">
              The AI will explore legitimate tensions, unhurried angles, and recipient psychology without shallow keyword stuffing.
            </div>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || selectedStudyIds.length === 0}
              className="px-4 py-2 text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5 shrink-0 transition-colors"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing Ideas...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Generate Article Concepts</span>
                </>
              )}
            </button>
          </div>

          {/* Generated Ideas Cards */}
          {generatedIdeas.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="text-xs font-bold uppercase tracking-wider text-[#736c61]">
                Formulated Article Concepts ({generatedIdeas.length})
              </div>

              <div className="space-y-3">
                {generatedIdeas.map((idea, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-[#dcd6ca] bg-white hover:border-amber-700/80 hover:shadow-md transition-all group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                            {idea.searchIntent || 'Editorial Insight'}
                          </span>
                        </div>
                        <h4 className="text-sm font-serif font-bold text-[#1e232a] group-hover:text-amber-950">
                          {idea.title}
                        </h4>
                        <p className="text-xs text-[#4a4237] leading-relaxed">
                          <strong>Angle:</strong> {idea.angle}
                        </p>
                        {idea.whyInteresting && (
                          <p className="text-xs text-[#736c61]">
                            <strong>Why interesting:</strong> {idea.whyInteresting}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSelectIdea(idea)}
                        className="px-3.5 py-2 text-xs font-semibold bg-[#1e232a] hover:bg-amber-900 text-white rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs"
                      >
                        <span>Use This Idea</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#eae4d7] flex justify-end bg-[#faf8f4]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-[#615a50] hover:text-[#1e232a] hover:bg-[#eae4d7] rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
