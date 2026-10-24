/**
 * Science of Gifts - Style Reference Studio (Phase 3)
 * Analyzes writing samples and extracts practical, reusable writer instructions.
 */

import React, { useState } from 'react';
import {
  StyleProfile,
  WritingSample,
  StyleCharacteristic,
  StyleAnalysis,
} from '../../types/styleReference';
import { storage } from '../../services/storage';
import { geminiService } from '../../services/geminiClient';
import { SampleModal } from './SampleModal';
import {
  Compass,
  FileText,
  Plus,
  Trash2,
  Sparkles,
  BookOpen,
  Edit3,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  RotateCcw,
  Save,
  HelpCircle,
  Eye,
  Sliders,
  ShieldCheck,
} from 'lucide-react';
import { ConfirmationModal } from '../ConfirmationModal';
import { toast } from '../../services/toastService';

interface StyleReferenceViewProps {
  onBackToStudio?: () => void;
  onApplyProfileToActiveProject?: (profileId: string) => void;
  activeProjectTitle?: string;
  activeProjectProfileId?: string;
}

export const StyleReferenceView: React.FC<StyleReferenceViewProps> = ({
  onBackToStudio,
  onApplyProfileToActiveProject,
  activeProjectTitle,
  activeProjectProfileId,
}) => {
  const [profiles, setProfiles] = useState<StyleProfile[]>(() => storage.getStyleProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => {
    const list = storage.getStyleProfiles();
    return list.length > 0 ? list[0].id : '';
  });

  // State for sample modal
  const [isSampleModalOpen, setIsSampleModalOpen] = useState(false);
  const [editingSample, setEditingSample] = useState<WritingSample | null>(null);

  // State for profile editing
  const [isEditingProfileMeta, setIsEditingProfileMeta] = useState(false);
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileDescInput, setProfileDescInput] = useState('');

  // New instruction input
  const [newInstructionText, setNewInstructionText] = useState('');

  // Regeneration confirmation warning modal
  const [isRegenerateConfirmOpen, setIsRegenerateConfirmOpen] = useState(false);

  // Loading states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');
  const [saveToast, setSaveToast] = useState(false);

  // New profile creation inline
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDesc, setNewProfileDesc] = useState('');

  // Delete confirmation states
  const [profileToDelete, setProfileToDelete] = useState<StyleProfile | null>(null);
  const [sampleToDelete, setSampleToDelete] = useState<WritingSample | null>(null);

  const currentProfile = profiles.find((p) => p.id === selectedProfileId) || profiles[0] || null;

  const showSaveSuccess = () => {
    toast.success('Saved', 'Style reference updated.');
  };

  const handleUpdateCurrentProfile = (updated: StyleProfile) => {
    setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    storage.saveStyleProfile(updated);
    showSaveSuccess();
  };

  // Create new profile
  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;

    const newProfile: StyleProfile = {
      id: `sp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: newProfileName.trim(),
      description: newProfileDesc.trim() || 'Custom writing style profile',
      samples: [],
      generatedInstructions: [],
      userEditedInstructions: [],
      hasUserEdited: false,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedList = [...profiles, newProfile];
    setProfiles(updatedList);
    storage.saveStyleProfiles(updatedList);
    setSelectedProfileId(newProfile.id);
    setIsCreatingProfile(false);
    setNewProfileName('');
    setNewProfileDesc('');
    toast.success('Style Profile Created', `Created profile "${newProfile.name}".`);
  };

  // Confirm delete profile
  const confirmDeleteProfile = () => {
    if (!profileToDelete) return;
    storage.deleteStyleProfile(profileToDelete.id);
    const remaining = profiles.filter((p) => p.id !== profileToDelete.id);
    setProfiles(remaining);
    setSelectedProfileId(remaining[0]?.id || '');
    toast.info('Profile Deleted', `Deleted "${profileToDelete.name}".`);
    setProfileToDelete(null);
  };

  // Add / Edit sample
  const handleSaveSample = (sample: WritingSample) => {
    if (!currentProfile) return;
    const existingIndex = currentProfile.samples.findIndex((s) => s.id === sample.id);
    let updatedSamples = [...currentProfile.samples];
    if (existingIndex >= 0) {
      updatedSamples[existingIndex] = sample;
    } else {
      updatedSamples.push(sample);
    }

    const updatedProfile: StyleProfile = {
      ...currentProfile,
      samples: updatedSamples,
      updatedAt: new Date().toISOString(),
    };
    handleUpdateCurrentProfile(updatedProfile);
    setIsSampleModalOpen(false);
    setEditingSample(null);
    toast.success('Sample Saved', `"${sample.title}" added to profile.`);
  };

  // Confirm delete sample
  const confirmDeleteSample = () => {
    if (!currentProfile || !sampleToDelete) return;
    const updatedSamples = currentProfile.samples.filter((s) => s.id !== sampleToDelete.id);
    const updatedProfile: StyleProfile = {
      ...currentProfile,
      samples: updatedSamples,
      updatedAt: new Date().toISOString(),
    };
    handleUpdateCurrentProfile(updatedProfile);
    toast.info('Sample Removed', `Removed sample "${sampleToDelete.title}".`);
    setSampleToDelete(null);
  };

  // Analyze single or all samples
  const handleAnalyze = async (samplesToAnalyze: WritingSample[]) => {
    if (!currentProfile || samplesToAnalyze.length === 0) return;

    setIsAnalyzing(true);
    setAnalysisError('');

    try {
      const res = await geminiService.analyzeStyle(samplesToAnalyze, currentProfile.name);
      if (res.ok) {
        const newAnalysis: StyleAnalysis = {
          id: `analysis-${Date.now()}`,
          sampleIds: samplesToAnalyze.map((s) => s.id),
          sampleCount: samplesToAnalyze.length,
          analyzedAt: new Date().toISOString(),
          summary: res.summary,
          characteristics: res.characteristics,
          commonCharacteristics: res.commonCharacteristics,
          sampleSpecificCharacteristics: res.sampleSpecificCharacteristics,
        };

        const updatedProfile: StyleProfile = {
          ...currentProfile,
          latestAnalysis: newAnalysis,
          generatedInstructions: res.reusableInstructions,
          // Preserve user edited instructions if previously customized unless empty
          userEditedInstructions:
            currentProfile.hasUserEdited && currentProfile.userEditedInstructions.length > 0
              ? currentProfile.userEditedInstructions
              : res.reusableInstructions,
          updatedAt: new Date().toISOString(),
        };

        handleUpdateCurrentProfile(updatedProfile);
      } else {
        setAnalysisError(res.error || 'Style analysis failed.');
      }
    } catch (err: any) {
      console.error('Style analysis failed:', err);
      setAnalysisError(err?.message || 'Failed to complete style analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Instructions management
  const activeInstructions =
    currentProfile?.userEditedInstructions && currentProfile.userEditedInstructions.length > 0
      ? currentProfile.userEditedInstructions
      : currentProfile?.generatedInstructions || [];

  const handleAddInstruction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newInstructionText.trim() || !currentProfile) return;
    const updatedInstructions = [...activeInstructions, newInstructionText.trim()];
    const updatedProfile: StyleProfile = {
      ...currentProfile,
      userEditedInstructions: updatedInstructions,
      hasUserEdited: true,
      updatedAt: new Date().toISOString(),
    };
    handleUpdateCurrentProfile(updatedProfile);
    setNewInstructionText('');
  };

  const handleEditInstruction = (index: number, newText: string) => {
    if (!currentProfile) return;
    const updated = [...activeInstructions];
    updated[index] = newText;
    const updatedProfile: StyleProfile = {
      ...currentProfile,
      userEditedInstructions: updated,
      hasUserEdited: true,
      updatedAt: new Date().toISOString(),
    };
    handleUpdateCurrentProfile(updatedProfile);
  };

  const handleDeleteInstruction = (index: number) => {
    if (!currentProfile) return;
    const updated = activeInstructions.filter((_, i) => i !== index);
    const updatedProfile: StyleProfile = {
      ...currentProfile,
      userEditedInstructions: updated,
      hasUserEdited: true,
      updatedAt: new Date().toISOString(),
    };
    handleUpdateCurrentProfile(updatedProfile);
  };

  // Re-translate / Regenerate Instructions from current analysis
  const executeRegenerateInstructions = () => {
    if (!currentProfile || !currentProfile.generatedInstructions) return;
    const updatedProfile: StyleProfile = {
      ...currentProfile,
      userEditedInstructions: [...currentProfile.generatedInstructions],
      hasUserEdited: false,
      updatedAt: new Date().toISOString(),
    };
    handleUpdateCurrentProfile(updatedProfile);
    setIsRegenerateConfirmOpen(false);
  };

  const handleRequestRegenerateInstructions = () => {
    if (currentProfile?.hasUserEdited) {
      setIsRegenerateConfirmOpen(true);
    } else {
      executeRegenerateInstructions();
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#faf9f6] overflow-hidden">
      {/* Top Header */}
      <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#f6f3eb] border-b border-[#e5dfd3] shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold uppercase tracking-wider">
              Phase 3 Intelligence
            </span>
            <h1 className="font-editorial text-2xl font-bold text-[#1e232a]">
              Writing Style Reference Studio
            </h1>
          </div>
          <p className="text-xs text-[#6e685f] mt-0.5">
            Extract structural cadence, rhythm, and material specificity from reference prose into reusable writer instructions.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {saveToast && (
            <span className="text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-300 font-medium animate-in fade-in flex items-center gap-1 shadow-2xs">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
              Saved
            </span>
          )}

          {onBackToStudio && (
            <button
              type="button"
              onClick={onBackToStudio}
              className="px-3 py-1.5 text-xs font-semibold text-[#1e232a] bg-white border border-[#dcd6ca] rounded-lg hover:bg-[#ede8dc] transition-colors shadow-2xs min-h-[36px]"
            >
              Back to Studio
            </button>
          )}
        </div>
      </div>

      {/* Main Split Layout: Profiles Drawer / Selected Profile Workspace */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side: Style Profiles List */}
        <aside className="w-full md:w-72 lg:w-80 max-h-48 md:max-h-none bg-[#f7f5ef] border-b md:border-b-0 md:border-r border-[#e5dfd3] flex flex-col shrink-0 overflow-hidden">
          <div className="p-3.5 border-b border-[#e5dfd3] flex items-center justify-between bg-[#f0ece1]">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5c5447]">
              Style Profiles ({profiles.length})
            </span>
            <button
              type="button"
              onClick={() => setIsCreatingProfile(true)}
              className="px-2 py-1 text-xs font-semibold text-[#1e232a] bg-white border border-[#dcd6ca] rounded-md hover:bg-[#f6f3eb] transition-colors inline-flex items-center gap-1 shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5 text-amber-800" />
              <span>New</span>
            </button>
          </div>

          {/* New Profile Inline Form */}
          {isCreatingProfile && (
            <form onSubmit={handleCreateProfile} className="p-3.5 bg-white border-b border-[#e5dfd3] space-y-2 animate-in fade-in">
              <div className="text-xs font-bold text-[#1e232a]">Create Style Profile</div>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Profile Name (e.g. Documentary Style)..."
                className="w-full px-2.5 py-1.5 text-xs bg-[#faf9f6] border border-[#dcd6ca] rounded-md text-[#1e232a] focus:outline-hidden focus:border-amber-600"
                autoFocus
              />
              <input
                type="text"
                value={newProfileDesc}
                onChange={(e) => setNewProfileDesc(e.target.value)}
                placeholder="Description / Context..."
                className="w-full px-2.5 py-1.5 text-xs bg-[#faf9f6] border border-[#dcd6ca] rounded-md text-[#1e232a] focus:outline-hidden focus:border-amber-600"
              />
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreatingProfile(false)}
                  className="px-2.5 py-1 text-[11px] font-medium text-[#736c61] hover:text-[#1e232a]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 text-[11px] font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-md"
                >
                  Create
                </button>
              </div>
            </form>
          )}

          {/* Profiles Scroll Area */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
            {profiles.map((profile) => {
              const isSelected = profile.id === selectedProfileId;
              const isAppliedToActiveProject = activeProjectProfileId === profile.id;
              const sampleCount = profile.samples?.length || 0;
              const instructionCount =
                (profile.userEditedInstructions && profile.userEditedInstructions.length > 0
                  ? profile.userEditedInstructions.length
                  : profile.generatedInstructions?.length) || 0;

              return (
                <div
                  key={profile.id}
                  onClick={() => setSelectedProfileId(profile.id)}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-white border-[#1e232a] shadow-sm'
                      : 'bg-white/60 border-[#e5dfd3] hover:bg-white text-[#4a443b]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <h3 className="font-editorial text-sm font-bold text-[#1e232a] leading-snug">
                      {profile.name}
                    </h3>
                    {isAppliedToActiveProject && (
                      <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 text-[9px] font-bold">
                        In Use
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#736c61] line-clamp-2 mt-1 leading-relaxed">
                    {profile.description}
                  </p>
                  <div className="flex items-center gap-2 mt-2.5 text-[10px] text-[#8a8275] font-medium">
                    <span className="inline-flex items-center gap-1">
                      <FileText className="w-3 h-3 text-amber-700" />
                      {sampleCount} {sampleCount === 1 ? 'sample' : 'samples'}
                    </span>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-blue-700" />
                      {instructionCount} directives
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Side: Selected Profile Content & Extractions */}
        {currentProfile ? (
          <main className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 max-w-5xl">
            {/* Profile Overview Card */}
            <div className="bg-white border border-[#e5dfd3] rounded-2xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex-1">
                  {isEditingProfileMeta ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={profileNameInput}
                        onChange={(e) => setProfileNameInput(e.target.value)}
                        className="w-full font-editorial text-2xl font-bold px-3 py-1 bg-[#faf9f6] border border-[#dcd6ca] rounded-lg text-[#1e232a]"
                      />
                      <input
                        type="text"
                        value={profileDescInput}
                        onChange={(e) => setProfileDescInput(e.target.value)}
                        className="w-full text-xs px-3 py-1.5 bg-[#faf9f6] border border-[#dcd6ca] rounded-lg text-[#5c5447]"
                      />
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (!profileNameInput.trim()) return;
                            handleUpdateCurrentProfile({
                              ...currentProfile,
                              name: profileNameInput.trim(),
                              description: profileDescInput.trim(),
                            });
                            setIsEditingProfileMeta(false);
                          }}
                          className="px-3 py-1 text-xs font-semibold text-white bg-[#1e232a] rounded-md"
                        >
                          Save Changes
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingProfileMeta(false)}
                          className="px-3 py-1 text-xs font-medium text-[#736c61]"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h2 className="font-editorial text-2xl font-bold text-[#1e232a]">
                          {currentProfile.name}
                        </h2>
                        <button
                          type="button"
                          onClick={() => {
                            setProfileNameInput(currentProfile.name);
                            setProfileDescInput(currentProfile.description);
                            setIsEditingProfileMeta(true);
                          }}
                          className="p-1 text-[#736c61] hover:text-[#1e232a] rounded-md hover:bg-[#f6f3eb]"
                          title="Edit profile name & description"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs text-[#6e685f] mt-1 leading-relaxed">
                        {currentProfile.description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Profile Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  {onApplyProfileToActiveProject && (
                    <button
                      type="button"
                      onClick={() => onApplyProfileToActiveProject(currentProfile.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center gap-1.5 shadow-2xs ${
                        activeProjectProfileId === currentProfile.id
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                          : 'bg-white text-[#1e232a] border-[#dcd6ca] hover:bg-[#ede8dc]'
                      }`}
                      title={activeProjectTitle ? `Apply to current draft: "${activeProjectTitle}"` : 'Apply to active draft'}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>{activeProjectProfileId === currentProfile.id ? 'Applied to Draft' : 'Apply to Current Draft'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (profiles.length <= 1) {
                        toast.warning('Cannot Delete', 'You must have at least one style profile in the studio.');
                        return;
                      }
                      setProfileToDelete(currentProfile);
                    }}
                    className="p-2 text-[#736c61] hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors border border-transparent hover:border-rose-200"
                    title="Delete style profile"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Notice Banner */}
              <div className="p-3 bg-[#f7f5ef] border border-[#e5dfd3] rounded-xl flex items-start gap-2.5 text-xs text-[#5c5447]">
                <HelpCircle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" />
                <span>
                  <strong>Style Reference Philosophy:</strong> Samples are analyzed to discern <em>how</em> the writing functions (sentence rhythm, cadence, material specificity). Gemini is strictly instructed never to copy phrases or content from your samples.
                </span>
              </div>
            </div>

            {/* Error Message If Any */}
            {analysisError && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-center justify-between">
                <span>{analysisError}</span>
                <button
                  type="button"
                  onClick={() => setAnalysisError('')}
                  className="font-bold text-rose-800 underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* SECTION 1: WRITING SAMPLES (Requirement #9 & #13) */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e5dfd3] pb-3">
                <div>
                  <h3 className="font-editorial text-lg font-bold text-[#1e232a] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-800" />
                    <span>Writing Samples ({currentProfile.samples.length})</span>
                  </h3>
                  <p className="text-xs text-[#736c61]">
                    Normal editorial prose reference material (articles, essays, field notes)
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {currentProfile.samples.length >= 2 && (
                    <button
                      type="button"
                      onClick={() => handleAnalyze(currentProfile.samples)}
                      disabled={isAnalyzing}
                      className="px-3.5 py-1.5 text-xs font-semibold text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                      <span>{isAnalyzing ? 'Analyzing All...' : 'Analyze All Samples'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setEditingSample(null);
                      setIsSampleModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg transition-colors inline-flex items-center gap-1 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Writing Sample</span>
                  </button>
                </div>
              </div>

              {/* Samples Grid */}
              {currentProfile.samples.length === 0 ? (
                <div className="p-8 border border-dashed border-[#dcd6ca] rounded-2xl text-center bg-white/50 space-y-3">
                  <FileText className="w-8 h-8 text-[#a8a194] mx-auto" />
                  <div>
                    <h4 className="font-editorial text-base font-bold text-[#1e232a]">No writing samples added yet</h4>
                    <p className="text-xs text-[#736c61] max-w-md mx-auto mt-1">
                      Add one or more representative excerpts of published prose that illustrate your target editorial style.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSample(null);
                      setIsSampleModalOpen(true);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Sample Now</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {currentProfile.samples.map((sample, idx) => {
                    const wordCount = sample.content.split(/\s+/).filter(Boolean).length;
                    return (
                      <div
                        key={sample.id}
                        className="bg-white border border-[#e5dfd3] rounded-xl p-5 shadow-2xs flex flex-col justify-between space-y-3 group hover:border-[#cfc6b6] transition-colors"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                                Sample #{idx + 1}
                              </span>
                              <h4 className="font-editorial text-base font-bold text-[#1e232a] leading-tight">
                                {sample.title}
                              </h4>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-[#f6f3eb] text-[#615a50] font-semibold">
                              {wordCount} words
                            </span>
                          </div>

                          {sample.sourceDescription && (
                            <p className="text-[11px] text-[#736c61] italic line-clamp-1">
                              {sample.sourceDescription}
                            </p>
                          )}

                          <p className="font-editorial text-xs text-[#3a352c] leading-relaxed line-clamp-4 bg-[#faf9f6] p-3 rounded-lg border border-[#f0ece1]">
                            {sample.content}
                          </p>
                        </div>

                        {/* Sample Card Footer Actions */}
                        <div className="pt-2 border-t border-[#f0ece1] flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => handleAnalyze([sample])}
                            disabled={isAnalyzing}
                            className="px-2.5 py-1 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors inline-flex items-center gap-1 disabled:opacity-50"
                            title="Analyze this individual sample"
                          >
                            <Sparkles className="w-3 h-3 text-amber-700" />
                            <span>Analyze Style</span>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSample(sample);
                                setIsSampleModalOpen(true);
                              }}
                              className="p-1 text-[#736c61] hover:text-[#1e232a] rounded-md hover:bg-[#f0ece1]"
                              title="Edit sample"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSampleToDelete(sample)}
                              className="p-1 text-[#736c61] hover:text-rose-700 rounded-md hover:bg-rose-50"
                              title="Delete sample"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION 2: STYLE CHARACTERISTICS ANALYSIS (Requirement #10 & #13) */}
            {currentProfile.latestAnalysis && (
              <div className="bg-white border border-[#e5dfd3] rounded-2xl p-6 shadow-2xs space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e5dfd3] pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-amber-800" />
                      <h3 className="font-editorial text-lg font-bold text-[#1e232a]">
                        Extracted Style Characteristics
                      </h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-[#5c5447] font-semibold">
                        Grounded in {currentProfile.latestAnalysis.sampleCount}{' '}
                        {currentProfile.latestAnalysis.sampleCount === 1 ? 'sample' : 'samples'}
                      </span>
                    </div>
                    <p className="text-xs text-[#736c61] mt-0.5">
                      Structured analysis of sentence length, cadence, material specificity, and editorial tone.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAnalyze(currentProfile.samples)}
                    disabled={isAnalyzing}
                    className="px-3 py-1.5 text-xs font-semibold text-[#1e232a] bg-[#faf9f6] border border-[#dcd6ca] rounded-lg hover:bg-[#ede8dc] transition-colors inline-flex items-center gap-1 shadow-2xs disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#736c61]" />
                    <span>Re-Analyze</span>
                  </button>
                </div>

                {/* Analysis Summary */}
                {currentProfile.latestAnalysis.summary && (
                  <div className="p-3.5 bg-amber-50/50 border border-amber-200/60 rounded-xl text-xs text-amber-950 font-medium leading-relaxed">
                    <strong>Editorial Summary:</strong> {currentProfile.latestAnalysis.summary}
                  </div>
                )}

                {/* Multi-sample distinction: COMMON vs SAMPLE-SPECIFIC */}
                {currentProfile.latestAnalysis.sampleCount > 1 && currentProfile.latestAnalysis.commonCharacteristics && (
                  <div className="space-y-4">
                    {/* Common Characteristics */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-900">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Common Characteristics (Consistent Across All Samples)</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {currentProfile.latestAnalysis.commonCharacteristics.map((char, i) => (
                          <div key={i} className="p-3 bg-[#faf9f6] border border-emerald-200/70 rounded-xl text-xs space-y-1">
                            <span className="font-semibold text-emerald-950 uppercase tracking-wider text-[10px]">
                              {char.category}
                            </span>
                            <p className="text-[#2d333b] leading-relaxed">{char.observation}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Sample Specific Characteristics */}
                    {currentProfile.latestAnalysis.sampleSpecificCharacteristics && currentProfile.latestAnalysis.sampleSpecificCharacteristics.length > 0 && (
                      <div className="space-y-2.5 pt-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#736c61]">
                          <Layers className="w-3.5 h-3.5 text-stone-600" />
                          <span>Sample-Specific or Context-Dependent Characteristics</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {currentProfile.latestAnalysis.sampleSpecificCharacteristics.map((char, i) => (
                            <div key={i} className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs space-y-1">
                              <span className="font-semibold text-[#5c5447] uppercase tracking-wider text-[10px]">
                                {char.category}
                              </span>
                              <p className="text-[#615a50] leading-relaxed">{char.observation}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Single Sample Characteristics List */}
                {currentProfile.latestAnalysis.sampleCount <= 1 && currentProfile.latestAnalysis.characteristics && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {currentProfile.latestAnalysis.characteristics.map((char, i) => (
                      <div key={i} className="p-3.5 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-900 uppercase tracking-wider text-[10px]">
                            {char.category}
                          </span>
                        </div>
                        <p className="text-[#1e232a] font-medium leading-relaxed">{char.observation}</p>
                        {char.evidence && (
                          <p className="text-[11px] text-[#736c61] italic bg-white p-2 rounded-md border border-[#ede7db]">
                            "{char.evidence}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SECTION 3: REUSABLE STYLE INSTRUCTIONS (Requirement #11, #12, #18) */}
            <div className="bg-white border border-[#e5dfd3] rounded-2xl p-6 shadow-2xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#e5dfd3] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-800" />
                    <h3 className="font-editorial text-lg font-bold text-[#1e232a]">
                      Reusable Style Directives ({activeInstructions.length})
                    </h3>
                    {currentProfile.hasUserEdited && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
                        User Modified
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#736c61] mt-0.5">
                    Concise instructions supplied to Gemini during draft generation and rewriting. You have final authority.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRequestRegenerateInstructions}
                    className="px-3 py-1.5 text-xs font-semibold text-[#1e232a] bg-[#faf9f6] border border-[#dcd6ca] rounded-lg hover:bg-[#ede8dc] transition-colors inline-flex items-center gap-1 shadow-2xs"
                    title="Translate instructions again from the style analysis"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-800" />
                    <span>Reset to AI Suggestions</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleUpdateCurrentProfile(currentProfile)}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Profile</span>
                  </button>
                </div>
              </div>

              {/* Directives List */}
              <div className="space-y-2.5">
                {activeInstructions.map((instruction, index) => (
                  <div
                    key={index}
                    className="p-3 bg-[#faf9f6] border border-[#e5dfd3] rounded-xl flex items-start justify-between gap-3 group focus-within:border-amber-600 focus-within:ring-1 focus-within:ring-amber-600 transition-colors"
                  >
                    <div className="flex items-start gap-2.5 flex-1">
                      <span className="w-5 h-5 rounded-full bg-stone-200 text-[#5c5447] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                        {index + 1}
                      </span>
                      <textarea
                        rows={2}
                        value={instruction}
                        onChange={(e) => handleEditInstruction(index, e.target.value)}
                        className="flex-1 text-xs text-[#1e232a] font-medium bg-transparent border-0 p-0 focus:outline-hidden resize-none leading-relaxed"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteInstruction(index)}
                      className="p-1 text-[#8a8275] hover:text-rose-700 rounded-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Remove this directive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Custom Directive */}
              <form onSubmit={handleAddInstruction} className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={newInstructionText}
                  onChange={(e) => setNewInstructionText(e.target.value)}
                  placeholder="Add a new custom style directive (e.g. 'Use unhurried cadence with tactile analogies')..."
                  className="flex-1 px-3.5 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg text-[#1e232a] placeholder-[#9c9589] focus:outline-hidden focus:border-amber-600 shadow-2xs"
                />
                <button
                  type="submit"
                  disabled={!newInstructionText.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#1e232a] hover:bg-[#2d3744] rounded-lg transition-colors shadow-2xs disabled:opacity-50 inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Directive</span>
                </button>
              </form>
            </div>
          </main>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-center text-[#736c61]">
            <p className="text-sm">Select a style profile or create a new one to begin.</p>
          </div>
        )}
      </div>

      {/* Sample Creation / Edit Modal */}
      {isSampleModalOpen && (
        <SampleModal
          sample={editingSample}
          onSave={handleSaveSample}
          onClose={() => {
            setIsSampleModalOpen(false);
            setEditingSample(null);
          }}
        />
      )}

      {/* Regeneration Confirmation Warning Modal (Requirement #12) */}
      {isRegenerateConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-[#1e232a]/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[#faf9f6] border border-[#dcd6ca] rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-900 shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-800" />
              </div>
              <div>
                <h3 className="font-editorial text-lg font-bold text-[#1e232a]">
                  Replace Custom Directives?
                </h3>
                <p className="text-xs text-[#5c5447] mt-1 leading-relaxed">
                  You have manually edited the style directives for <strong>{currentProfile?.name}</strong>. Resetting to the AI suggestions will overwrite your custom modifications.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-[#e5dfd3] flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsRegenerateConfirmOpen(false)}
                className="px-3.5 py-2 font-medium text-[#5c5447] hover:text-[#1e232a] rounded-lg hover:bg-[#eae4d7]"
              >
                Keep My Edits
              </button>
              <button
                type="button"
                onClick={executeRegenerateInstructions}
                className="px-4 py-2 font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded-lg shadow-2xs"
              >
                Overwrite with AI Suggestions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Profile Confirmation */}
      {profileToDelete && (
        <ConfirmationModal
          isOpen={true}
          title={`Delete Profile "${profileToDelete.name}"?`}
          message="This permanently deletes this style profile and all of its reference writing samples."
          confirmLabel="Delete Profile"
          cancelLabel="Cancel"
          isDestructive={true}
          onConfirm={confirmDeleteProfile}
          onCancel={() => setProfileToDelete(null)}
        />
      )}

      {/* Delete Sample Confirmation */}
      {sampleToDelete && (
        <ConfirmationModal
          isOpen={true}
          title={`Delete Sample "${sampleToDelete.title}"?`}
          message="This removes the sample from this style profile. Existing generated instructions will remain until re-analyzed."
          confirmLabel="Delete Sample"
          cancelLabel="Cancel"
          isDestructive={true}
          onConfirm={confirmDeleteSample}
          onCancel={() => setSampleToDelete(null)}
        />
      )}
    </div>
  );
};
