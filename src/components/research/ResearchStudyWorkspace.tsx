import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Sparkles,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Check,
  Loader2,
  ShieldAlert,
  Lightbulb,
  ArrowRight,
  HelpCircle,
  Clock,
  Filter,
} from 'lucide-react';
import {
  ResearchStudy,
  StudyAnalysis,
  ResearchClaim,
  ClaimType,
  ClaimConfidence,
  PotentialArticleIdea,
} from '../../types/research';
import { researchService } from '../../services/researchService';
import { storage } from '../../services/storage';
import { toast } from '../../services/toastService';
import { ModelId } from '../../types/models';
import { EditorialIdea } from '../../types/ideaGenerator';

interface ResearchStudyWorkspaceProps {
  study: ResearchStudy;
  onBack: () => void;
  onUpdateStudy: (updated: ResearchStudy) => void;
  onDeleteStudy: (studyId: string) => void;
  onUseIdea: (idea: EditorialIdea, targetAudience?: string) => void;
}

export const ResearchStudyWorkspace: React.FC<ResearchStudyWorkspaceProps> = ({
  study,
  onBack,
  onUpdateStudy,
  onDeleteStudy,
  onUseIdea,
}) => {
  const [activeTab, setActiveTab] = useState<'source' | 'analysis' | 'claims' | 'notes'>('analysis');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelId>(storage.getGlobalModel());
  const [copiedText, setCopiedText] = useState(false);

  // Notes state
  const [notesText, setNotesText] = useState(study.notes || '');

  // Add/Edit Claim Modal state
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [claimFormText, setClaimFormText] = useState('');
  const [claimFormType, setClaimFormType] = useState<ClaimType>('source_fact');
  const [claimFormSupported, setClaimFormSupported] = useState('');
  const [claimFormContext, setClaimFormContext] = useState('');
  const [claimFormConfidence, setClaimFormConfidence] = useState<ClaimConfidence>('high');
  const [claimFormLimitation, setClaimFormLimitation] = useState('');
  const [claimFormReference, setClaimFormReference] = useState('');

  // Explicit Analyze Study Action
  const handleAnalyzeStudy = async () => {
    setIsAnalyzing(true);
    try {
      const result = await researchService.analyzeStudy(study, selectedModel);
      const nowIso = new Date().toISOString();

      const updatedStudy: ResearchStudy = {
        ...study,
        analysisStatus: 'analyzed',
        dateAnalyzed: nowIso,
        analysis: result.analysis,
        claims: [
          ...(study.claims || []).filter((c) => !result.claims.some((rc) => rc.id === c.id)),
          ...result.claims,
        ],
        updatedAt: nowIso,
      };

      // Save to storage & IndexedDB
      storage.saveResearchStudy(updatedStudy);
      onUpdateStudy(updatedStudy);
      setActiveTab('analysis');
      toast.success('Study Analyzed', 'Rigorous editorial analysis and structured claims formulated.');
    } catch (err: any) {
      console.error('Study analysis error:', err);
      toast.error('Analysis Failed', 'Could not complete academic study analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Notes auto-save on blur
  const handleSaveNotes = () => {
    if (notesText !== study.notes) {
      const updated: ResearchStudy = {
        ...study,
        notes: notesText,
        updatedAt: new Date().toISOString(),
      };
      storage.saveResearchStudy(updated);
      onUpdateStudy(updated);
      toast.success('Notes Saved', 'Editorial notes updated.');
    }
  };

  // Open Claim Form
  const handleOpenAddClaim = () => {
    setEditingClaimId(null);
    setClaimFormText('');
    setClaimFormType('source_fact');
    setClaimFormSupported('');
    setClaimFormContext('');
    setClaimFormConfidence('high');
    setClaimFormLimitation('');
    setClaimFormReference(`${study.authors?.[0] || 'Author'} (${study.publicationYear || 'Year'})`);
    setIsClaimModalOpen(true);
  };

  const handleOpenEditClaim = (claim: ResearchClaim) => {
    setEditingClaimId(claim.id);
    setClaimFormText(claim.claimText);
    setClaimFormType(claim.claimType);
    setClaimFormSupported(claim.supportedBySource);
    setClaimFormContext(claim.context || '');
    setClaimFormConfidence(claim.confidence);
    setClaimFormLimitation(claim.relevantLimitation || '');
    setClaimFormReference(claim.sourceReference || '');
    setIsClaimModalOpen(true);
  };

  const handleSaveClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimFormText.trim()) return;

    const nowIso = new Date().toISOString();
    let updatedClaims: ResearchClaim[] = [...(study.claims || [])];

    if (editingClaimId) {
      updatedClaims = updatedClaims.map((c) =>
        c.id === editingClaimId
          ? {
              ...c,
              claimText: claimFormText.trim(),
              claimType: claimFormType,
              supportedBySource: claimFormSupported.trim() || 'Verified in paper text',
              context: claimFormContext.trim() || undefined,
              confidence: claimFormConfidence,
              relevantLimitation: claimFormLimitation.trim() || undefined,
              sourceReference: claimFormReference.trim() || undefined,
              updatedAt: nowIso,
            }
          : c
      );
    } else {
      const newClaim: ResearchClaim = {
        id: `claim-${Date.now()}`,
        studyId: study.id,
        studyTitle: study.title,
        claimText: claimFormText.trim(),
        claimType: claimFormType,
        supportedBySource: claimFormSupported.trim() || 'Verified in paper text',
        context: claimFormContext.trim() || undefined,
        confidence: claimFormConfidence,
        relevantLimitation: claimFormLimitation.trim() || undefined,
        sourceReference: claimFormReference.trim() || undefined,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      updatedClaims.push(newClaim);
    }

    const updatedStudy: ResearchStudy = {
      ...study,
      claims: updatedClaims,
      updatedAt: nowIso,
    };

    storage.saveResearchStudy(updatedStudy);
    onUpdateStudy(updatedStudy);
    setIsClaimModalOpen(false);
    toast.success('Claim Saved', 'Structured claim updated successfully.');
  };

  const handleDeleteClaim = (claimId: string) => {
    const updatedClaims = (study.claims || []).filter((c) => c.id !== claimId);
    const updatedStudy: ResearchStudy = {
      ...study,
      claims: updatedClaims,
      updatedAt: new Date().toISOString(),
    };
    storage.saveResearchStudy(updatedStudy);
    onUpdateStudy(updatedStudy);
    toast.success('Claim Removed', 'Claim removed from study repository.');
  };

  const handleCopySourceText = () => {
    if (!study.extractedText) return;
    navigator.clipboard.writeText(study.extractedText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
    toast.success('Copied', 'Source text copied to clipboard.');
  };

  const getClaimTypeBadge = (type: ClaimType) => {
    switch (type) {
      case 'source_fact':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-900 border border-blue-200">
            Source Fact
          </span>
        );
      case 'editorial_interpretation':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-900 border border-purple-200">
            Editorial Interpretation
          </span>
        );
      case 'writing_suggestion':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-200">
            Writing Suggestion
          </span>
        );
    }
  };

  const getConfidenceBadge = (confidence: ClaimConfidence) => {
    switch (confidence) {
      case 'high':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
            High Confidence
          </span>
        );
      case 'moderate':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
            Moderate Confidence
          </span>
        );
      case 'preliminary':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-800 border border-rose-200">
            Preliminary Finding
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#faf9f6] overflow-hidden text-[#1e232a]">
      {/* Top Breadcrumb & Action Bar */}
      <div className="px-6 py-3.5 border-b border-[#eae4d7] bg-[#f7f4ed] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-lg text-[#615a50] hover:text-[#1e232a] hover:bg-[#eae4d7] transition-colors flex items-center gap-1 text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Research Library</span>
          </button>
          <span className="text-[#dcd6ca]">/</span>
          <span className="text-xs font-serif font-bold text-[#1e232a] truncate max-w-md">
            {study.title}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Analyze Study Button */}
          <button
            type="button"
            onClick={handleAnalyzeStudy}
            disabled={isAnalyzing}
            className="px-3.5 py-1.5 text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white rounded-lg shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Analyzing Study...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>{study.analysis ? 'Re-Analyze Study' : 'Analyze Study'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Are you sure you want to delete "${study.title}" from the Research Library?`)) {
                onDeleteStudy(study.id);
              }
            }}
            className="p-1.5 rounded-lg text-[#857d72] hover:text-rose-700 hover:bg-rose-50 transition-colors"
            title="Delete Study"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Study Metadata Header Card */}
      <div className="px-6 py-4 bg-white border-b border-[#eae4d7] shrink-0">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="space-y-1.5 max-w-4xl">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  study.analysisStatus === 'analyzed'
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                    : 'bg-amber-100 text-amber-900 border border-amber-200'
                }`}
              >
                {study.analysisStatus === 'analyzed' ? 'Analyzed' : 'Unanalyzed'}
              </span>

              {study.publication && (
                <span className="text-xs text-[#736c61] font-medium">
                  {study.publication}
                </span>
              )}

              {study.publicationYear && (
                <span className="text-xs text-[#8a8275]">({study.publicationYear})</span>
              )}

              {study.doi && (
                <a
                  href={study.doi.startsWith('http') ? study.doi : `https://doi.org/${study.doi}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-800 hover:underline flex items-center gap-1"
                >
                  <span>DOI: {study.doi}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <h1 className="text-xl font-serif font-bold text-[#1e232a] leading-tight">
              {study.title}
            </h1>

            <div className="text-xs text-[#524b40] flex items-center gap-2 flex-wrap">
              <span className="font-medium">Authors:</span>
              <span>
                {Array.isArray(study.authors) && study.authors.length > 0
                  ? study.authors.join(', ')
                  : 'Unspecified'}
              </span>
            </div>

            {study.tags && study.tags.length > 0 && (
              <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                {study.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-0.5 rounded text-[11px] bg-[#f5f1e8] text-[#5e5548] border border-[#e3dcce]"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Workspace Navigation Tabs: SOURCE | ANALYSIS | CLAIMS | NOTES */}
        <div className="flex border-b border-[#eae4d7] mt-5 -mb-4 gap-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('source')}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'source'
                ? 'border-amber-900 text-amber-950'
                : 'border-transparent text-[#736c61] hover:text-[#1e232a]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>SOURCE</span>
            {study.extractedText && (
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('analysis')}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'analysis'
                ? 'border-amber-900 text-amber-950'
                : 'border-transparent text-[#736c61] hover:text-[#1e232a]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-700" />
            <span>ANALYSIS</span>
            {study.analysis && (
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800">
                Ready
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('claims')}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'claims'
                ? 'border-amber-900 text-amber-950'
                : 'border-transparent text-[#736c61] hover:text-[#1e232a]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>CLAIMS</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-[#ebe6db] text-[#5e5548]">
              {study.claims?.length || 0}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notes')}
            className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'notes'
                ? 'border-amber-900 text-amber-950'
                : 'border-transparent text-[#736c61] hover:text-[#1e232a]'
            }`}
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>NOTES</span>
          </button>
        </div>
      </div>

      {/* Main Tab Workspace Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* TAB 1: SOURCE */}
        {activeTab === 'source' && (
          <div className="max-w-4xl space-y-6">
            {/* Paper Overview Box */}
            <div className="p-5 rounded-2xl bg-white border border-[#dcd6ca] shadow-2xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#736c61]">
                Academic Publication Record
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-semibold text-[#403a31]">Journal / Publisher:</span>{' '}
                  <span className="text-[#615a50]">{study.publication || 'Not provided'}</span>
                </div>
                <div>
                  <span className="font-semibold text-[#403a31]">Year:</span>{' '}
                  <span className="text-[#615a50]">{study.publicationYear || 'Not provided'}</span>
                </div>
                <div>
                  <span className="font-semibold text-[#403a31]">DOI:</span>{' '}
                  <span className="text-[#615a50]">{study.doi || 'None'}</span>
                </div>
                <div>
                  <span className="font-semibold text-[#403a31]">Source Link:</span>{' '}
                  {study.sourceUrl ? (
                    <a
                      href={study.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-800 hover:underline inline-flex items-center gap-1"
                    >
                      <span>Visit Publisher Page</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-[#857d72]">None</span>
                  )}
                </div>
              </div>

              {/* Original File */}
              {study.fileName && (
                <div className="pt-3 border-t border-[#eae4d7] flex items-center justify-between text-xs text-[#524b40]">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-800" />
                    <span>Preserved File: <strong>{study.fileName}</strong></span>
                    {study.fileSize && (
                      <span className="text-[#857d72]">({(study.fileSize / (1024 * 1024)).toFixed(2)} MB)</span>
                    )}
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Stored in IndexedDB
                  </span>
                </div>
              )}
            </div>

            {/* Abstract */}
            <div className="p-5 rounded-2xl bg-white border border-[#dcd6ca] shadow-2xs space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#736c61]">
                Abstract / Executive Summary
              </h3>
              {study.abstract ? (
                <p className="text-xs text-[#2b251d] font-serif leading-relaxed whitespace-pre-line">
                  {study.abstract}
                </p>
              ) : (
                <p className="text-xs text-[#857d72] italic">
                  No abstract provided for this paper.
                </p>
              )}
            </div>

            {/* Extracted Source Text (Read-Only) */}
            <div className="p-5 rounded-2xl bg-white border border-[#dcd6ca] shadow-2xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#736c61]">
                    Extracted Source Text (Read-Only)
                  </h3>
                  <p className="text-[11px] text-[#857d72]">
                    Verbatim source text preserved without modification for empirical verification.
                  </p>
                </div>
                {study.extractedText && (
                  <button
                    type="button"
                    onClick={handleCopySourceText}
                    className="px-2.5 py-1 text-xs text-[#524b40] hover:text-[#1e232a] bg-[#f5f1e8] hover:bg-[#eae4d7] rounded-md transition-colors flex items-center gap-1.5"
                  >
                    {copiedText ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {study.extractedText ? (
                <div className="p-4 rounded-xl bg-[#faf8f4] border border-[#eae4d7] font-mono text-[11px] text-[#403a31] leading-relaxed max-h-96 overflow-y-auto whitespace-pre-wrap select-text">
                  {study.extractedText}
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-dashed border-[#cfc8ba] text-center text-xs text-[#736c61] bg-[#faf8f4]">
                  No extracted text available. Upload a PDF paper in the Add Research modal to extract text.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: ANALYSIS */}
        {activeTab === 'analysis' && (
          <div className="max-w-4xl space-y-6">
            {!study.analysis ? (
              /* Unanalyzed State with Call to Action */
              <div className="p-8 rounded-2xl bg-white border border-[#dcd6ca] text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center mx-auto shadow-2xs">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h3 className="text-base font-serif font-bold text-[#1e232a]">Study Not Yet Analyzed</h3>
                  <p className="text-xs text-[#736c61] leading-relaxed">
                    AI analysis is explicit and never run automatically. Click below to analyze the research question, findings, distinctions, and legitimate editorial applications.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAnalyzeStudy}
                  disabled={isAnalyzing}
                  className="px-6 py-2.5 text-xs font-semibold bg-amber-900 hover:bg-amber-950 text-white rounded-xl shadow-xs transition-colors inline-flex items-center gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Formulating Analysis...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>Analyze Study Now</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* Structured Analysis Display */
              <div className="space-y-5">
                {/* 1. What Was Studied */}
                <div className="p-5 rounded-2xl bg-white border border-[#dcd6ca] shadow-2xs space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1e232a]">
                      What Was Studied
                    </h3>
                  </div>
                  <p className="text-xs text-[#2b251d] font-serif leading-relaxed">
                    {study.analysis.whatWasStudied}
                  </p>
                </div>

                {/* 2. What The Study Found */}
                <div className="p-5 rounded-2xl bg-white border border-[#dcd6ca] shadow-2xs space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#1e232a]">
                      What The Study Found
                    </h3>
                  </div>
                  <ul className="space-y-2 text-xs text-[#2b251d]">
                    {study.analysis.whatTheStudyFound.map((finding, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 3. What It Means */}
                <div className="p-5 rounded-2xl bg-amber-50/60 border border-amber-200/80 shadow-2xs space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-700"></span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-950">
                      What It Means (Editorial Significance)
                    </h3>
                  </div>
                  <p className="text-xs text-[#403a31] leading-relaxed">
                    {study.analysis.whatItMeans}
                  </p>
                </div>

                {/* 4. What It Does Not Establish (Scientific Integrity) */}
                <div className="p-5 rounded-2xl bg-rose-50/60 border border-rose-200/80 shadow-2xs space-y-2.5">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-700" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-rose-950">
                      What It Does Not Establish (Crucial Caveats)
                    </h3>
                  </div>
                  <ul className="space-y-2 text-xs text-rose-900">
                    {study.analysis.whatItDoesNotEstablish.map((caveat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="font-bold text-rose-700 shrink-0">•</span>
                        <span className="leading-relaxed">{caveat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 5. Methodology & Limitations */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 rounded-2xl bg-white border border-[#dcd6ca] shadow-2xs space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#736c61]">
                      Methodology
                    </h3>
                    <p className="text-xs text-[#403a31] leading-relaxed">
                      {study.analysis.methodology || 'Methodological details from source abstract.'}
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-white border border-[#dcd6ca] shadow-2xs space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#736c61]">
                      Limitations
                    </h3>
                    <ul className="space-y-1.5 text-xs text-[#524b40]">
                      {study.analysis.limitations.map((lim, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-[#857d72] shrink-0">-</span>
                          <span>{lim}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* 6. Editorial Use */}
                <div className="p-5 rounded-2xl bg-white border border-[#dcd6ca] shadow-2xs space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#736c61]">
                    Legitimate Editorial Use in Articles
                  </h3>
                  <ul className="space-y-2 text-xs text-[#2b251d]">
                    {study.analysis.editorialUse.map((use, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-800 shrink-0 mt-1.5"></span>
                        <span className="leading-relaxed">{use}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 7. Potential Article Ideas */}
                {study.analysis.potentialArticleIdeas && study.analysis.potentialArticleIdeas.length > 0 && (
                  <div className="p-5 rounded-2xl bg-[#f7f4ed] border border-[#e3dcce] shadow-2xs space-y-3">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-800" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#1e232a]">
                        Potential Article Ideas Arising from this Research
                      </h3>
                    </div>

                    <div className="space-y-3">
                      {study.analysis.potentialArticleIdeas.map((idea, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-white border border-[#dcd6ca] flex items-start justify-between gap-3"
                        >
                          <div className="space-y-1 flex-1">
                            <h4 className="text-xs font-serif font-bold text-[#1e232a]">
                              {idea.title}
                            </h4>
                            <p className="text-xs text-[#615a50] leading-relaxed">
                              {idea.angle}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onUseIdea(
                                {
                                  id: `idea-${Date.now()}-${idx}`,
                                  title: idea.title,
                                  angle: idea.angle,
                                  whyInteresting: idea.whyInteresting || 'Backed by empirical findings.',
                                  searchIntent: idea.searchIntent || 'Psychological Insight',
                                },
                                'Discerning gifters'
                              );
                            }}
                            className="px-3 py-1.5 text-xs font-semibold bg-[#1e232a] hover:bg-amber-900 text-white rounded-lg transition-colors flex items-center gap-1 shrink-0"
                          >
                            <span>Use This Idea</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CLAIMS */}
        {activeTab === 'claims' && (
          <div className="max-w-4xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-serif font-bold text-[#1e232a]">
                  Structured Research Claims ({study.claims?.length || 0})
                </h3>
                <p className="text-xs text-[#736c61]">
                  Granular claims categorized into Source Facts, Editorial Interpretations, and Writing Suggestions.
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenAddClaim}
                className="px-3 py-1.5 text-xs font-semibold bg-[#1e232a] hover:bg-[#343a42] text-white rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Claim</span>
              </button>
            </div>

            {(!study.claims || study.claims.length === 0) ? (
              <div className="p-8 rounded-2xl bg-white border border-[#dcd6ca] text-center space-y-2">
                <FileText className="w-8 h-8 text-[#857d72] mx-auto" />
                <p className="text-xs font-medium text-[#1e232a]">No claims registered yet</p>
                <p className="text-xs text-[#736c61]">
                  Analyze the study with AI to extract claims, or add custom claims manually.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {study.claims.map((claim) => (
                  <div
                    key={claim.id}
                    className="p-4 rounded-xl bg-white border border-[#dcd6ca] hover:border-[#cfc8ba] shadow-2xs space-y-2.5 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getClaimTypeBadge(claim.claimType)}
                        {getConfidenceBadge(claim.confidence)}
                        {claim.sourceReference && (
                          <span className="text-[11px] text-[#736c61]">
                            Ref: {claim.sourceReference}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditClaim(claim)}
                          className="p-1 text-[#857d72] hover:text-[#1e232a] hover:bg-[#eae4d7] rounded transition-colors"
                          title="Edit Claim"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClaim(claim.id)}
                          className="p-1 text-[#857d72] hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                          title="Delete Claim"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <p className="text-xs font-serif font-semibold text-[#1e232a] leading-relaxed">
                      "{claim.claimText}"
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-[#f0ede6]">
                      <div>
                        <span className="font-semibold text-[#5e5548]">Supported by:</span>{' '}
                        <span className="text-[#403a31]">{claim.supportedBySource}</span>
                      </div>
                      {claim.relevantLimitation && (
                        <div>
                          <span className="font-semibold text-rose-800">Limitation:</span>{' '}
                          <span className="text-rose-900">{claim.relevantLimitation}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: NOTES */}
        {activeTab === 'notes' && (
          <div className="max-w-4xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-serif font-bold text-[#1e232a]">Editorial Working Notes</h3>
                <p className="text-xs text-[#736c61]">
                  Record your impressions, potential article angles, or recipient observations.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveNotes}
                className="px-3.5 py-1.5 text-xs font-semibold bg-[#1e232a] hover:bg-[#343a42] text-white rounded-lg transition-colors"
              >
                Save Notes
              </button>
            </div>

            <textarea
              rows={12}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              onBlur={handleSaveNotes}
              placeholder="Record custom editorial insights, questions for future inquiry, or how this study should be cited..."
              className="w-full p-4 text-xs font-serif leading-relaxed bg-white border border-[#dcd6ca] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
            />
          </div>
        )}
      </div>

      {/* Claim Modal (Add / Edit) */}
      {isClaimModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="bg-[#fcfbf9] border border-[#dcd6ca] rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#eae4d7] pb-3">
              <h3 className="text-sm font-serif font-bold text-[#1e232a]">
                {editingClaimId ? 'Edit Research Claim' : 'Add Research Claim'}
              </h3>
              <button
                type="button"
                onClick={() => setIsClaimModalOpen(false)}
                className="p-1 rounded text-[#857d72] hover:text-[#1e232a]"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClaim} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-[#403a31]">Claim Text</label>
                <textarea
                  rows={2}
                  required
                  value={claimFormText}
                  onChange={(e) => setClaimFormText(e.target.value)}
                  placeholder="The specific statement or observation..."
                  className="w-full p-2 bg-white border border-[#dcd6ca] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-[#403a31]">Claim Category</label>
                  <select
                    value={claimFormType}
                    onChange={(e) => setClaimFormType(e.target.value as ClaimType)}
                    className="w-full p-2 bg-white border border-[#dcd6ca] rounded-lg"
                  >
                    <option value="source_fact">Source Fact (Empirical Data)</option>
                    <option value="editorial_interpretation">Editorial Interpretation</option>
                    <option value="writing_suggestion">Writing Suggestion</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-[#403a31]">Confidence Level</label>
                  <select
                    value={claimFormConfidence}
                    onChange={(e) => setClaimFormConfidence(e.target.value as ClaimConfidence)}
                    className="w-full p-2 bg-white border border-[#dcd6ca] rounded-lg"
                  >
                    <option value="high">High Confidence</option>
                    <option value="moderate">Moderate Confidence</option>
                    <option value="preliminary">Preliminary Finding</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#403a31]">What Source Actually Supports</label>
                <input
                  type="text"
                  value={claimFormSupported}
                  onChange={(e) => setClaimFormSupported(e.target.value)}
                  placeholder="e.g. Longitudinal survey tracking across 36 months"
                  className="w-full p-2 bg-white border border-[#dcd6ca] rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#403a31]">Relevant Limitation / Qualifier</label>
                <input
                  type="text"
                  value={claimFormLimitation}
                  onChange={(e) => setClaimFormLimitation(e.target.value)}
                  placeholder="e.g. Sample confined to domestic instruments; does not measure commercial tools"
                  className="w-full p-2 bg-white border border-[#dcd6ca] rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-[#403a31]">Source Reference</label>
                <input
                  type="text"
                  value={claimFormReference}
                  onChange={(e) => setClaimFormReference(e.target.value)}
                  placeholder="e.g. Campbell & Vance (2024), Findings"
                  className="w-full p-2 bg-white border border-[#dcd6ca] rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-[#eae4d7] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsClaimModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-[#736c61]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold bg-amber-900 text-white rounded-lg hover:bg-amber-950"
                >
                  Save Claim
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
