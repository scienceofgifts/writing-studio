import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Link,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { ResearchStudy } from '../../types/research';
import { researchService } from '../../services/researchService';
import { storage } from '../../services/storage';
import { toast } from '../../services/toastService';

interface AddResearchModalProps {
  isOpen: boolean;
  study?: ResearchStudy | null;
  onClose: () => void;
  onStudyCreated: (study: ResearchStudy) => void;
  onStudyUpdated?: (study: ResearchStudy) => void;
}

export const AddResearchModal: React.FC<AddResearchModalProps> = ({
  isOpen,
  study,
  onClose,
  onStudyCreated,
  onStudyUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'url' | 'pdf' | 'manual'>('url');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);

  // URL / DOI tab state
  const [urlInput, setUrlInput] = useState('');
  const [urlLookupError, setUrlLookupError] = useState<string | null>(null);
  const [urlPreviewReady, setUrlPreviewReady] = useState(false);

  // PDF tab state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfExtracting, setPdfExtracting] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [extractedTextPreview, setExtractedTextPreview] = useState<string>('');
  const [isScannedWarning, setIsScannedWarning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Common Form Fields
  const [title, setTitle] = useState('');
  const [authors, setAuthors] = useState('');
  const [publication, setPublication] = useState('');
  const [publicationYear, setPublicationYear] = useState('');
  const [doi, setDoi] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [abstract, setAbstract] = useState('');
  const [tags, setTags] = useState('Gifting Psychology, Material Permanence');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setUrlInput('');
    setUrlLookupError(null);
    setUrlPreviewReady(false);
    setSelectedFile(null);
    setPdfExtracting(false);
    setPdfError(null);
    setExtractedTextPreview('');
    setIsScannedWarning(false);
    setTitle('');
    setAuthors('');
    setPublication('');
    setPublicationYear('');
    setDoi('');
    setSourceUrl('');
    setAbstract('');
    setTags('Gifting Psychology, Material Permanence');
    setNotes('');
  };

  useEffect(() => {
    if (isOpen) {
      if (study) {
        setTitle(study.title || '');
        setAuthors(Array.isArray(study.authors) ? study.authors.join(', ') : '');
        setPublication(study.publication || '');
        setPublicationYear(String(study.publicationYear || ''));
        setDoi(study.doi || '');
        setSourceUrl(study.sourceUrl || '');
        setAbstract(study.abstract || '');
        setTags(Array.isArray(study.tags) ? study.tags.join(', ') : 'Gifting Psychology, Material Permanence');
        setNotes(study.notes || '');
        setUrlInput(study.sourceUrl || study.doi || '');
        setExtractedTextPreview(study.extractedText || '');
      } else {
        resetForm();
      }
    }
  }, [isOpen, study]);

  if (!isOpen) return null;

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // 1. DOI / URL Metadata Lookup
  const handleLookupUrl = async () => {
    if (!urlInput.trim()) return;
    setLookupLoading(true);
    setUrlLookupError(null);

    try {
      const result = await researchService.lookupMetadata(urlInput.trim());
      if (result.success) {
        setTitle(result.title || '');
        setAuthors(Array.isArray(result.authors) ? result.authors.join(', ') : '');
        setPublication(result.publication || '');
        setPublicationYear(String(result.publicationYear || ''));
        setDoi(result.doi || (urlInput.includes('10.') ? urlInput : ''));
        setSourceUrl(result.url || urlInput);
        setAbstract(result.abstract || '');
        setUrlPreviewReady(true);
        toast.success('Metadata Retrieved', 'Paper metadata loaded successfully. Verify before saving.');
      } else {
        setUrlLookupError(result.error || 'Could not retrieve metadata. Please enter details manually.');
        setUrlPreviewReady(true);
        if (urlInput.startsWith('http')) setSourceUrl(urlInput);
        else if (urlInput.includes('10.')) setDoi(urlInput);
      }
    } catch (err: any) {
      setUrlLookupError('Network error during lookup. You can still enter details manually.');
      setUrlPreviewReady(true);
    } finally {
      setLookupLoading(false);
    }
  };

  // 2. PDF Extraction
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setPdfError('Please select a valid PDF file.');
      return;
    }

    setSelectedFile(file);
    setPdfExtracting(true);
    setPdfError(null);
    setIsScannedWarning(false);

    // Heuristically pre-fill title from filename
    const cleanFileName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
    if (!title) {
      setTitle(cleanFileName.charAt(0).toUpperCase() + cleanFileName.slice(1));
    }

    try {
      const result = await researchService.extractPdf(file);
      if (result.success && result.text) {
        setExtractedTextPreview(result.text);
        if (result.isScannedOrEmpty) {
          setIsScannedWarning(true);
        } else {
          toast.success('Text Extracted', `Extracted text from ${file.name} (${result.numPages || 1} pages).`);
        }
      } else {
        setPdfError(result.error || 'Could not extract readable text. The document may be scanned or image-based.');
      }
    } catch (err: any) {
      setPdfError('Failed to process PDF file. You can still save the record manually.');
    } finally {
      setPdfExtracting(false);
    }
  };

  // Save Record
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Title Required', 'Please provide a study or paper title.');
      return;
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const studyId = study ? study.id : `study-${Date.now()}`;
      let fileId: string | undefined = study ? study.fileId : undefined;

      // If a PDF file was uploaded, store the research file in IndexedDB
      if (selectedFile) {
        fileId = `file-${Date.now()}`;
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(selectedFile);
        });
        const base64Content = await base64Promise;

        storage.saveResearchFile({
          id: fileId,
          studyId,
          fileName: selectedFile.name,
          fileType: selectedFile.type || 'application/pdf',
          fileSize: selectedFile.size,
          content: base64Content,
          extractedText: extractedTextPreview || undefined,
          uploadedAt: nowIso,
          updatedAt: nowIso,
        });
      }

      const authorsList = authors
        .split(/[,;\n]/)
        .map((a) => a.trim())
        .filter(Boolean);

      const tagsList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const updatedStudy: ResearchStudy = {
        ...(study || {}),
        id: studyId,
        title: title.trim(),
        authors: authorsList.length > 0 ? authorsList : ['Unspecified Authors'],
        publication: publication.trim() || undefined,
        publicationYear: publicationYear.trim() || undefined,
        doi: doi.trim() || undefined,
        sourceUrl: sourceUrl.trim() || undefined,
        abstract: abstract.trim() || undefined,
        tags: tagsList,
        dateAdded: study ? study.dateAdded : nowIso,
        analysisStatus: study ? study.analysisStatus : 'unanalyzed',
        notes: notes.trim() || undefined,
        fileId,
        fileName: selectedFile ? selectedFile.name : (study ? study.fileName : undefined),
        fileSize: selectedFile ? selectedFile.size : (study ? study.fileSize : undefined),
        extractedText: extractedTextPreview.trim() || (study ? study.extractedText : undefined),
        claims: study ? study.claims || [] : [],
        createdAt: study ? study.createdAt : nowIso,
        updatedAt: nowIso,
      };

      storage.saveResearchStudy(updatedStudy);
      if (study) {
        toast.success('Study Updated', `"${updatedStudy.title}" updated successfully.`);
        if (onStudyUpdated) onStudyUpdated(updatedStudy);
      } else {
        toast.success('Research Study Added', `"${updatedStudy.title}" added to the Research Library.`);
        onStudyCreated(updatedStudy);
      }
      handleClose();
    } catch (err: any) {
      console.error('Failed to save research study:', err);
      toast.error('Save Failed', 'Could not save the research study.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[#fcfbf9] border border-[#dcd6ca] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-[#1e232a]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#eae4d7] flex items-center justify-between bg-[#f7f4ed]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-900">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-[#1e232a] tracking-tight">
                {study ? 'Edit Research Study' : 'Add Research Study'}
              </h2>
              <p className="text-xs text-[#736c61]">
                {study ? 'Update academic metadata, source links, and editorial notes.' : 'Import papers, extract source text, and prepare editorial claims.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[#857d72] hover:text-[#1e232a] hover:bg-[#eae4d7] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Method Tabs */}
        <div className="flex border-b border-[#eae4d7] bg-[#faf8f4] px-6 pt-3 gap-2 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'url'
                ? 'border-amber-800 text-amber-950 font-semibold'
                : 'border-transparent text-[#736c61] hover:text-[#1e232a]'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>DOI / Article URL</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'pdf'
                ? 'border-amber-800 text-amber-950 font-semibold'
                : 'border-transparent text-[#736c61] hover:text-[#1e232a]'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload PDF Paper</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`pb-2.5 px-3 border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'manual'
                ? 'border-amber-800 text-amber-950 font-semibold'
                : 'border-transparent text-[#736c61] hover:text-[#1e232a]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Manual Entry</span>
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* TAB A: DOI / URL */}
          {activeTab === 'url' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-[#5e5548] leading-relaxed">
                Enter a <strong>DOI</strong> (e.g. <code>10.1016/j.matcult.2024.03.012</code>), <strong>PubMed URL</strong>, or academic publisher link. We query CrossRef and citation meta tags to fetch accurate academic metadata without fabricating details.
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#403a31]">DOI or Academic URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="e.g. 10.1016/j.matcult.2024.03.012 or https://doi.org/..."
                    className="flex-1 px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleLookupUrl();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleLookupUrl}
                    disabled={lookupLoading || !urlInput.trim()}
                    className="px-4 py-2 text-xs font-medium bg-[#1e232a] text-white rounded-lg hover:bg-[#343a42] disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                  >
                    {lookupLoading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Fetching...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>Lookup Metadata</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {urlLookupError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Lookup notice:</span> {urlLookupError}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB B: UPLOAD PDF */}
          {activeTab === 'pdf' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-[#334e68] leading-relaxed">
                Upload a research paper PDF. The original file is preserved in persistent IndexedDB storage, and searchable plain text is extracted for rigorous editorial analysis. Scanned image-only PDFs are clearly flagged.
              </div>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[#cfc8ba] hover:border-amber-700 rounded-xl p-6 text-center cursor-pointer transition-colors bg-[#faf8f4] hover:bg-white"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".pdf,application/pdf"
                  className="hidden"
                />
                <Upload className="w-7 h-7 mx-auto mb-2 text-[#736c61]" />
                <p className="text-xs font-medium text-[#1e232a]">
                  {selectedFile ? selectedFile.name : 'Click to select or drop research paper PDF'}
                </p>
                <p className="text-[11px] text-[#857d72] mt-0.5">
                  {selectedFile
                    ? `${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Click to replace`
                    : 'PDF documents up to 50MB supported'}
                </p>
              </div>

              {pdfExtracting && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-700 shrink-0" />
                  <span>Extracting text layer and analyzing document structure...</span>
                </div>
              )}

              {pdfError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Extraction notice:</span> {pdfError}
                  </div>
                </div>
              )}

              {isScannedWarning && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Notice:</span> This PDF appears to be a scanned image with no embedded text layer. You can still store it, but please enter the abstract and findings manually.
                  </div>
                </div>
              )}

              {extractedTextPreview && !isScannedWarning && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900">
                  <div className="flex items-center gap-1.5 font-semibold mb-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Text extracted successfully ({extractedTextPreview.length.toLocaleString()} characters)</span>
                  </div>
                  <p className="text-[11px] text-emerald-800 line-clamp-2 italic font-serif">
                    "{extractedTextPreview.slice(0, 180)}..."
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SHARED EDITABLE METADATA FORM */}
          <div className="pt-2 border-t border-[#eae4d7] space-y-3.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#8a8275]">
              Research Record Details
            </div>

            {/* Title */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#302a22]">
                Paper / Study Title <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. The Psychology of Material Permanence: How Tactile Artifacts Foster Emotional Longevity"
                className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
              />
            </div>

            {/* Authors & Year */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-semibold text-[#302a22]">Authors (comma separated)</label>
                <input
                  type="text"
                  value={authors}
                  onChange={(e) => setAuthors(e.target.value)}
                  placeholder="e.g. Dr. Arthur Campbell, Dr. Evelyn Vance"
                  className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#302a22]">Publication Year</label>
                <input
                  type="text"
                  value={publicationYear}
                  onChange={(e) => setPublicationYear(e.target.value)}
                  placeholder="e.g. 2024"
                  className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
                />
              </div>
            </div>

            {/* Publication / Journal */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#302a22]">Publication / Journal / Institution</label>
              <input
                type="text"
                value={publication}
                onChange={(e) => setPublication(e.target.value)}
                placeholder="e.g. Journal of Material Culture & Craft Psychology"
                className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
              />
            </div>

            {/* DOI and Source URL */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#302a22]">DOI (if available)</label>
                <input
                  type="text"
                  value={doi}
                  onChange={(e) => setDoi(e.target.value)}
                  placeholder="10.1016/j.matcult.2024.03.012"
                  className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#302a22]">Source URL</label>
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
                />
              </div>
            </div>

            {/* Abstract */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#302a22]">Abstract / Core Summary</label>
              <textarea
                rows={3}
                value={abstract}
                onChange={(e) => setAbstract(e.target.value)}
                placeholder="Abstract or direct excerpt summarizing research questions and empirical scope..."
                className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
              />
            </div>

            {/* Topics / Tags & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#302a22]">Topics / Tags (comma separated)</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="Gifting Psychology, Permanence, Tactile Rituals"
                  className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#302a22]">Editorial Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Preliminary thought on potential article application"
                  className="w-full px-3 py-2 text-xs bg-white border border-[#dcd6ca] rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-700/30 focus:border-amber-800"
                />
              </div>
            </div>
          </div>

          {/* Footer buttons inside form */}
          <div className="pt-3 border-t border-[#eae4d7] flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-medium text-[#615a50] hover:text-[#1e232a] hover:bg-[#eae4d7] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              className="px-5 py-2 text-xs font-medium bg-amber-900 text-white hover:bg-amber-950 rounded-lg shadow-xs disabled:opacity-50 flex items-center gap-1.5 transition-colors"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Record...</span>
                </>
              ) : (
                <span>{study ? 'Save Changes' : 'Save to Research Library'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
