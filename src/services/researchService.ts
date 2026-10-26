/**
 * Science of Gifts - Research & Fact Engine Service
 * Handles metadata lookup, PDF text extraction, AI study analysis,
 * structured claims management, research-driven idea generation, and editorial packaging.
 * Explicitly surfaces all errors with visible toasts and throws (no silent fallback).
 */

import {
  ResearchStudy,
  StudyAnalysis,
  ResearchClaim,
  EditorialDraftPackage,
  PotentialArticleIdea,
} from '../types/research';
import { WritingProject, OutlineItem } from '../types/project';
import {
  CitationRecommendation,
  FindCitationsResponse,
  ResearchGap,
  CitationWorkflowType,
  CitationEvidenceType,
  CitationVerificationStatus,
  DraftResearchPassageResponse,
} from '../types/citation';
import {
  splitBodyAndReferences,
  extractCitationsFromHtml,
  verifyTargetPassageInHtml,
  isPassageCitedWithStudy,
  resolveStudySourceLink,
  mergeCitationRecommendations,
} from '../utils/citationUtils';
import { extractPlainTextFromHtml } from '../utils/richText';
import { resolveEffectiveModelId } from './modelRegistry';
import { storage } from './storage';
import { ModelId } from '../types/models';
import { getApiUrl } from './apiConfig';
import { toast } from './toastService';

export interface MetadataLookupResult {
  success: boolean;
  title?: string;
  authors?: string[];
  publication?: string;
  publicationYear?: string | number;
  doi?: string;
  url?: string;
  abstract?: string;
  error?: string;
}

export interface PdfExtractionResult {
  success: boolean;
  text?: string;
  numPages?: number;
  fileName?: string;
  fileSize?: number;
  isScannedOrEmpty?: boolean;
  error?: string;
}

export class ResearchService {
  /**
   * Retrieves academic metadata from a DOI, PubMed URL, journal URL, or publication link.
   */
  public async lookupMetadata(input: string): Promise<MetadataLookupResult> {
    const trimmed = input.trim();
    if (!trimmed) {
      toast.error('AI Request Failed', 'DOI or URL cannot be empty.');
      throw new Error('DOI or URL cannot be empty.');
    }

    try {
      const response = await fetch(getApiUrl('/api/research/lookup-metadata'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: trimmed }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMessage = errData.error || `Server returned ${response.status}`;
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      const data = await response.json();
      if (!data.success && !data.ok) {
        const errMessage = data.error || 'Failed to lookup metadata';
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      return data;
    } catch (err: any) {
      console.error('Metadata lookup failed:', err);
      toast.error('AI Request Failed', err?.message || 'Failed to lookup metadata.');
      throw err;
    }
  }

  /**
   * Uploads and extracts usable text from an academic research PDF.
   */
  public async extractPdf(file: File): Promise<PdfExtractionResult> {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);

      const response = await fetch(getApiUrl('/api/research/extract-pdf'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64: base64,
          fileName: file.name,
          fileSize: file.size,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMessage = errData.error || `Server returned ${response.status}`;
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      const data = await response.json();
      if (!data.success && !data.ok) {
        const errMessage = data.error || 'Failed to extract text from PDF';
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      return data;
    } catch (err: any) {
      console.error('PDF extraction failed:', err);
      toast.error('AI Request Failed', err?.message || 'Failed to extract text from PDF.');
      throw err;
    }
  }

  /**
   * Analyzes a research study using Gemini with strict editorial fact-integrity.
   * Produces structured analysis and creates traceable claims.
   */
  public async analyzeStudy(
    study: ResearchStudy,
    modelOverride?: ModelId
  ): Promise<{ analysis: StudyAnalysis; claims: ResearchClaim[] }> {
    const activeModel = modelOverride || storage.getGlobalModel();

    try {
      const response = await fetch(getApiUrl('/api/gemini/analyze-study'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          study,
          modelOverride: activeModel,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMessage = errData.error || `Server returned ${response.status}`;
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      const result = await response.json();
      if (!result.ok || !result.analysis) {
        const errMessage = result.error || 'Failed to analyze study.';
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      return {
        analysis: result.analysis,
        claims: result.claims || [],
      };
    } catch (err: any) {
      console.error('Error analyzing study:', err);
      toast.error('AI Request Failed', err?.message || 'Failed to analyze study.');
      throw err;
    }
  }

  /**
   * Generates high-intent article concepts from selected research studies.
   */
  public async generateIdeasFromResearch(
    studies: ResearchStudy[],
    modelOverride?: ModelId
  ): Promise<PotentialArticleIdea[]> {
    if (studies.length === 0) return [];
    const activeModel = modelOverride || storage.getGlobalModel();

    try {
      const response = await fetch(getApiUrl('/api/gemini/research-ideas'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studies,
          modelOverride: activeModel,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMessage = errData.error || `Server returned ${response.status}`;
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      const result = await response.json();
      if (!result.ok || !Array.isArray(result.ideas)) {
        const errMessage = result.error || 'Failed to generate ideas from research.';
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      return result.ideas;
    } catch (err: any) {
      console.error('Error generating ideas from research:', err);
      toast.error('AI Request Failed', err?.message || 'Failed to generate ideas from research.');
      throw err;
    }
  }

  /**
   * Generates a research-informed outline assigning studies to specific sections.
   */
  public async buildResearchOutline(
    project: WritingProject,
    attachedStudies: ResearchStudy[],
    selectedClaims: ResearchClaim[],
    modelOverride?: ModelId
  ): Promise<{ outline: OutlineItem[]; rationale: string }> {
    const activeModel = modelOverride || project.modelOverride || storage.getGlobalModel();

    try {
      const response = await fetch(getApiUrl('/api/gemini/research-outline'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project,
          attachedStudies,
          selectedClaims,
          modelOverride: activeModel,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMessage = errData.error || `Server returned ${response.status}`;
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      const result = await response.json();
      if (!result.ok || !Array.isArray(result.outline)) {
        const errMessage = result.error || 'Failed to build research outline.';
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      return {
        outline: result.outline,
        rationale: result.rationale || 'Built structured outline incorporating attached research.',
      };
    } catch (err: any) {
      console.error('Error building research outline:', err);
      toast.error('AI Request Failed', err?.message || 'Failed to build research outline.');
      throw err;
    }
  }

  /**
   * Prepares an exportable, self-contained Editorial Package ready for handoff or publishing.
   */
  public prepareEditorialPackage(
    project: WritingProject,
    attachedStudies: ResearchStudy[],
    claims: ResearchClaim[],
    internalLinks: any[] = []
  ): EditorialDraftPackage {
    const nowIso = new Date().toISOString();

    const sections = (project.outline || []).map((sec) => {
      const studiesForSection = (sec.assignedStudyIds || [])
        .map((id) => attachedStudies.find((s) => s.id === id))
        .filter(Boolean) as ResearchStudy[];

      return {
        title: sec.title,
        description: sec.description,
        notes: sec.notes,
        assignedStudies: studiesForSection.map((s) => ({
          id: s.id,
          title: s.title,
          citation: `${s.authors?.[0] || 'Unknown'} (${s.publicationYear || 'n.d.'})`,
        })),
      };
    });

    const researchPackage = attachedStudies.map((study) => {
      const studyClaims = claims.filter((c) => c.studyId === study.id);
      return {
        studyId: study.id,
        title: study.title,
        citation: `${study.authors?.[0] || 'Unknown'} (${study.publicationYear || 'n.d.'}), ${study.publication || ''}`,
        keyFindings: study.analysis?.whatTheStudyFound || study.keyFindings || [],
        supportedClaims: studyClaims.map((c) => ({
          text: c.claimText,
          type: c.claimType,
          confidence: c.confidence,
          limitation: c.relevantLimitation,
        })),
        limitations: study.analysis?.limitations || [],
        articleRelevance: study.analysis?.whatItMeans || study.summary || '',
      };
    });

    const cleanLinks = internalLinks.slice(0, 5).map((l) => ({
      targetTitle: l.title || l.anchorText,
      url: l.targetUrl || l.url,
      suggestedAnchor: l.anchorText || l.title,
      relevantSection: l.category || 'General',
      reason: l.context || 'Editorial link opportunity',
    }));

    let md = `# EDITORIAL DRAFT PACKAGE: ${project.title.toUpperCase()}\n\n`;
    md += `*Generated: ${new Date().toLocaleDateString()} | Science of Gifts Editorial Studio*\n\n`;
    md += `---\n\n`;

    md += `## 1. PROJECT BRIEF & STRATEGIC INTENT\n`;
    md += `- **Purpose**: ${project.brief?.purpose || 'Editorial exploration'}\n`;
    md += `- **Audience**: ${project.brief?.audience || 'Discerning readers'}\n`;
    md += `- **Target Reader Takeaway**: ${project.brief?.readerLearns || 'Material permanence & craft appreciation'}\n`;
    md += `- **Search Intent**: ${project.articleMeta?.searchIntent || 'Psychological & Cultural insight'}\n\n`;

    md += `## 2. RESEARCH-BACKED CONTENT OUTLINE\n`;
    sections.forEach((s, idx) => {
      md += `### ${idx + 1}. ${s.title}\n`;
      if (s.description) md += `*${s.description}*\n`;
      if (s.assignedStudies.length > 0) {
        md += `**Empirical Studies Assigned:**\n`;
        s.assignedStudies.forEach((as) => {
          md += `- ${as.title} (${as.citation})\n`;
        });
      }
      md += `\n`;
    });

    md += `## 3. RESEARCH REPOSITORY & VERIFIED CLAIMS\n`;
    researchPackage.forEach((r) => {
      md += `### Study: ${r.title}\n`;
      md += `*Citation: ${r.citation}*\n\n`;
      md += `**Key Findings:**\n`;
      r.keyFindings.forEach((kf) => (md += `- ${kf}\n`));
      md += `\n**Verified Editorial Claims:**\n`;
      r.supportedClaims.forEach((sc) => {
        md += `- [${sc.type.toUpperCase()}] "${sc.text}" (Confidence: ${sc.confidence})${sc.limitation ? ` *[Limitation: ${sc.limitation}]*` : ''}\n`;
      });
      md += `\n`;
    });

    md += `## 4. INTERNAL LINK RECOMMENDATIONS\n`;
    cleanLinks.forEach((l) => {
      md += `- **[${l.suggestedAnchor}](${l.url})**: ${l.targetTitle} (${l.reason})\n`;
    });

    return {
      generatedAt: nowIso,
      article: {
        title: project.title,
        type: project.type,
        searchIntent: project.articleMeta?.searchIntent || 'Editorial insight',
        audience: project.brief?.audience || 'Discerning readers',
        purpose: project.brief?.purpose,
        readerLearns: project.brief?.readerLearns,
        readerFeels: project.brief?.readerFeels,
        keyPoints: project.brief?.keyPoints,
        thingsToAvoid: project.brief?.thingsToAvoid,
      },
      outline: { sections },
      research: researchPackage,
      internalLinks: cleanLinks,
      editorialNotes: {
        pointsToEmphasize: ['Bench-made durability', 'Daily ritual engagement', 'Honest patina'],
        thingsToAvoid: ['Disposable gadgets', 'Superficial status branding', 'Gimmicky unboxing'],
        unresolvedQuestions: ['Multi-decade longitudinal attachment beyond 36 months'],
      },
      markdownExport: md,
    };
  }

  /**
   * Discovers empirical research citation opportunities in the article draft
   * and matches claims to studies in the Science of Gifts Research Library.
   */
  public async findCitationOpportunities(
    project: WritingProject,
    allStudies?: ResearchStudy[],
    options: { modelOverride?: ModelId } = {}
  ): Promise<FindCitationsResponse> {
    const studies = allStudies || storage.getResearchStudies();
    const effectiveModel = resolveEffectiveModelId({
      actionOverride: options.modelOverride,
      projectOverride: project.modelOverride,
      globalDefault: storage.getGlobalModel(),
    });

    const { bodyHtml } = splitBodyAndReferences(project.content || '');
    const plainDoc = extractPlainTextFromHtml(bodyHtml);

    if (!plainDoc || plainDoc.trim().length === 0) {
      return {
        ok: true,
        recommendations: [],
        gaps: [],
        rationale: 'Article is currently empty. Write or draft content to discover citation opportunities.',
      };
    }

    if (!studies || studies.length === 0) {
      return {
        ok: true,
        recommendations: [],
        gaps: [
          {
            claimInArticle: 'General draft content',
            topicNeeded: 'Gift psychology, material durability, recipient attachment',
            suggestion: 'Add empirical studies to the Research Library to enable in-text citations.',
          },
        ],
        rationale: 'No research studies found in the library. Upload or analyze studies first.',
      };
    }

    const existingCitations = extractCitationsFromHtml(project.content || '');
    const existingStudyIds = new Set(existingCitations.map((c) => c.studyId));

    try {
      const response = await fetch(getApiUrl('/api/gemini/find-citations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectTitle: project.title,
          documentContent: plainDoc,
          studies: studies.map((s) => ({
            id: s.id,
            title: s.title,
            authors: s.authors,
            publicationYear: s.publicationYear,
            publication: s.publication || s.sourceOrPublisher,
            doi: s.doi,
            url: s.sourceUrl || s.doiOrUrl,
            abstract: s.abstract || s.summary || '',
            claims: (s.claims || [])
              .filter((c) => !c._isDeleted)
              .map((c) => ({
                id: c.id,
                text: c.claimText,
                type: c.claimType,
                confidence: c.confidence,
                source: c.supportedBySource,
                limitation: c.relevantLimitation,
              })),
            keyFindings: s.analysis?.whatTheStudyFound || s.keyFindings || [],
            whatWasStudied: s.analysis?.whatWasStudied || '',
            whatItMeans: s.analysis?.whatItMeans || '',
            whatItDoesNotEstablish: s.analysis?.whatItDoesNotEstablish || [],
            limitations: s.analysis?.limitations || [],
            methodology: s.analysis?.methodology || s.methodology || '',
          })),
          existingCitedStudyIds: Array.from(existingStudyIds),
          model: effectiveModel,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMessage = errData.error || `Server returned ${response.status}`;
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      const data = await response.json();
      if (!data.ok || !Array.isArray(data.recommendations)) {
        const errMessage = data.error || 'Failed to find citation opportunities.';
        toast.error('AI Request Failed', errMessage);
        throw new Error(errMessage);
      }

      const validated = this.validateAndEnrichCitationRecommendations(
        data.recommendations,
        studies,
        project.content || '',
        existingStudyIds.size
      );

      // Deduplicate incoming recommendations and preserve any previously reviewed items on the project
      const merged = mergeCitationRecommendations(
        project.citationRecommendations || [],
        validated,
        project.content || ''
      );

      return {
        ok: true,
        recommendations: merged,
        gaps: data.gaps || [],
        rationale:
          data.rationale ||
          (validated.length === 0
            ? 'No existing sentences had direct empirical support from the Research Library.'
            : 'Completed evidence-first citation verification.'),
      };
    } catch (err: any) {
      console.error('Error finding citations:', err);
      toast.error('AI Request Failed', err?.message || 'Failed to find citations.');
      throw err;
    }
  }

  /**
   * Programmatically verifies and enriches raw AI citation recommendations against
   * the actual ResearchStudy library records and the current article HTML.
   * - Never silently defaults `isVerifiedMatch` to `true`.
   * - Never invents fallback findings or explanations when study evidence is missing.
   * - Separates Workflow A (`cite_existing`) from Workflow B (`draft_passage`).
   */
  validateAndEnrichCitationRecommendations(
    rawRecommendations: any[],
    studies: ResearchStudy[],
    htmlContent: string,
    existingCitedCount = 0
  ): CitationRecommendation[] {
    if (!Array.isArray(rawRecommendations) || rawRecommendations.length === 0) {
      return [];
    }

    const results: CitationRecommendation[] = [];

    rawRecommendations.forEach((rec: any, idx: number) => {
      if (!rec || !rec.studyId) return;

      // Must match a real study in the library
      const study = studies.find((s) => s.id === rec.studyId && !s._isDeleted);
      if (!study) return;

      const findings = [
        ...(study.analysis?.whatTheStudyFound || []),
        ...(study.keyFindings || []),
      ]
        .map((f) => String(f || '').trim())
        .filter(Boolean);

      const activeClaims = (study.claims || []).filter(
        (c) => !c._isDeleted && c.claimText && c.claimText.trim()
      );
      const sourceFactClaims = activeClaims.filter(
        (c) => c.claimType === 'source_fact' || c.claimType === 'editorial_interpretation'
      );
      const abstractOrSummary = String(
        study.abstract || study.summary || study.analysis?.whatWasStudied || ''
      ).trim();

      const studyLimitations = [
        ...(study.analysis?.limitations || []),
        ...(study.analysis?.whatItDoesNotEstablish || []),
        ...activeClaims.map((c) => c.relevantLimitation || '').filter(Boolean),
      ]
        .map((l) => String(l || '').trim())
        .filter(Boolean);

      const hasLibraryEvidence =
        findings.length > 0 || sourceFactClaims.length > 0 || abstractOrSummary.length > 20;

      const linkInfo = resolveStudySourceLink(study);
      const sourceIdentifier =
        linkInfo.url ||
        linkInfo.displayLabel ||
        'No direct DOI or external URL on file in Research Library';

      // Extract finding & supporting evidence without fabricating boilerplate
      const rawFinding = String(rec.relevantFinding || '').trim();
      const fallbackStudyFinding =
        findings[0] || sourceFactClaims[0]?.claimText || '';
      const relevantFinding = rawFinding || fallbackStudyFinding;

      let supportingEvidence = String(rec.supportingEvidence || '').trim();
      if (!supportingEvidence && hasLibraryEvidence) {
        const matchedClaim = activeClaims.find(
          (c) =>
            c.supportedBySource?.trim() &&
            (rawFinding
              ? c.claimText.toLowerCase().includes(rawFinding.slice(0, 25).toLowerCase())
              : true)
        );
        if (matchedClaim?.supportedBySource) {
          supportingEvidence = matchedClaim.supportedBySource.trim();
        } else if (findings.length > 0) {
          supportingEvidence = findings[0];
        } else if (sourceFactClaims.length > 0) {
          supportingEvidence = sourceFactClaims[0].claimText;
        } else if (abstractOrSummary) {
          supportingEvidence = abstractOrSummary.slice(0, 280);
        }
      }

      const limitationsOrQualifications =
        String(rec.limitationsOrQualifications || '').trim() ||
        studyLimitations[0] ||
        undefined;

      const rawTargetPassage = String(rec.targetPassage || '').trim();
      const rawProposedPassage = String(rec.proposedPassage || '').trim();

      // Determine workflowType ('cite_existing' vs 'draft_passage')
      const workflowType: CitationWorkflowType =
        rec.workflowType === 'draft_passage' || (!rawTargetPassage && Boolean(rawProposedPassage))
          ? 'draft_passage'
          : 'cite_existing';

      // Determine evidenceType
      const validEvidenceTypes = new Set<CitationEvidenceType>([
        'direct_empirical',
        'author_interpretation',
        'background_context',
        'editorial_suggestion',
      ]);
      const evidenceType: CitationEvidenceType = validEvidenceTypes.has(rec.evidenceType)
        ? rec.evidenceType
        : rec.isVerifiedMatch === true && rec.confidence === 'verified_empirical'
        ? 'direct_empirical'
        : workflowType === 'draft_passage'
        ? 'editorial_suggestion'
        : 'background_context';

      const confidence =
        rec.confidence === 'verified_empirical' ||
        rec.confidence === 'conceptual_support' ||
        rec.confidence === 'partial_limitation'
          ? rec.confidence
          : rec.isVerifiedMatch === true
          ? 'verified_empirical'
          : 'conceptual_support';

      let isVerifiedMatch = false;
      let isInsertionReady = false;
      let verificationStatus: CitationVerificationStatus = 'needs_review';
      let verificationNote: string | undefined = rec.verificationNote
        ? String(rec.verificationNote).trim()
        : undefined;

      if (workflowType === 'draft_passage') {
        isVerifiedMatch = false;
        isInsertionReady = false;
        if (!hasLibraryEvidence || !relevantFinding) {
          verificationStatus = 'insufficient_evidence';
          verificationNote =
            verificationNote ||
            'Insufficient evidence in the Research Library record to verify or draft a supported passage.';
        } else {
          verificationStatus = 'needs_review';
          verificationNote =
            verificationNote ||
            'This study is relevant to the article topic, but no existing sentence directly states its finding. Draft and approve a research-backed passage before citing.';
        }
      } else {
        // Workflow A: Cite an existing passage
        const passageCheck = verifyTargetPassageInHtml(htmlContent, rawTargetPassage);

        if (!hasLibraryEvidence || !relevantFinding || !supportingEvidence) {
          verificationStatus = 'insufficient_evidence';
          isVerifiedMatch = false;
          isInsertionReady = false;
          verificationNote =
            verificationNote ||
            'Insufficient evidence in the Research Library to verify that this study supports the passage.';
        } else if (passageCheck.status === 'not_found') {
          verificationStatus = 'unmatched_passage';
          isVerifiedMatch = false;
          isInsertionReady = false;
          verificationNote =
            passageCheck.reason ||
            'Target passage does not match any sentence in the current article text.';
        } else if (passageCheck.status === 'ambiguous') {
          verificationStatus = 'ambiguous_passage';
          isVerifiedMatch = false;
          isInsertionReady = false;
          verificationNote =
            passageCheck.reason ||
            'Target passage appears multiple times in the article and cannot be matched unambiguously.';
        } else if (
          rec.isVerifiedMatch !== true ||
          evidenceType === 'background_context' ||
          evidenceType === 'editorial_suggestion' ||
          confidence === 'partial_limitation'
        ) {
          verificationStatus = 'needs_review';
          isVerifiedMatch = false;
          isInsertionReady = false;
          verificationNote =
            verificationNote ||
            'Study provides general context or has notable limitations rather than direct empirical proof of this sentence. Verify carefully or draft a dedicated research-backed passage.';
        } else {
          verificationStatus = 'verified';
          isVerifiedMatch = true;
          isInsertionReady = true;
        }
      }

      const alreadyCitedOnPassage =
        workflowType === 'cite_existing' && rawTargetPassage
          ? isPassageCitedWithStudy(htmlContent, rawTargetPassage, study.id)
          : false;

      results.push({
        id: rec.id || `cit-opp-${Date.now()}-${idx}`,
        studyId: study.id,
        studyTitle: study.title || rec.studyTitle || 'Untitled Research Study',
        authors: study.authors || rec.authors || ['Research Archive'],
        publicationYear: study.publicationYear || rec.publicationYear,
        publication: study.publication || study.sourceOrPublisher,
        doi: linkInfo.doi || study.doi,
        url: linkInfo.url || study.sourceUrl || study.doiOrUrl,
        sourceIdentifier,
        workflowType,
        targetPassage: rawTargetPassage,
        targetSectionHeading: rec.targetSectionHeading ? String(rec.targetSectionHeading).trim() : undefined,
        anchorPassageContext: rec.anchorPassageContext ? String(rec.anchorPassageContext).trim() : undefined,
        proposedCitationNumber: rec.proposedCitationNumber || existingCitedCount + idx + 1,
        relevantFinding,
        supportingEvidence: supportingEvidence || undefined,
        limitationsOrQualifications,
        explanation: String(rec.explanation || '').trim(),
        confidence,
        evidenceType,
        isVerifiedMatch,
        verificationStatus,
        isInsertionReady,
        verificationNote,
        proposedPassage: rawProposedPassage || undefined,
        draftStatus: rawProposedPassage ? 'proposed' : 'none',
        status: alreadyCitedOnPassage ? 'accepted' : 'pending',
        createdAt: rec.createdAt || new Date().toISOString(),
      });
    });

    return results;
  }

  /**
   * Workflow B: Drafts a concise, research-backed editorial passage grounded strictly
   * in the study's actual findings, claims, and limitations in the Research Library.
   * Does NOT modify the article; returns the proposed passage for writer review, editing, and approval.
   */
  async draftResearchPassage(
    project: WritingProject,
    study: ResearchStudy,
    options?: {
      targetSectionHeading?: string;
      anchorPassageContext?: string;
      editorialGuidance?: string;
      modelOverride?: ModelId;
    }
  ): Promise<DraftResearchPassageResponse> {
    if (!study || !study.id) {
      return {
        ok: false,
        proposedPassage: '',
        relevantFinding: '',
        supportingEvidence: '',
        error: 'Study not found in Research Library.',
      };
    }

    const findings = [
      ...(study.analysis?.whatTheStudyFound || []),
      ...(study.keyFindings || []),
    ]
      .map((f) => String(f || '').trim())
      .filter(Boolean);

    const activeClaims = (study.claims || []).filter(
      (c) => !c._isDeleted && c.claimText && c.claimText.trim()
    );
    const abstractText = String(
      study.abstract || study.summary || study.analysis?.whatWasStudied || ''
    ).trim();

    if (findings.length === 0 && activeClaims.length === 0 && abstractText.length < 20) {
      return {
        ok: false,
        proposedPassage: '',
        relevantFinding: '',
        supportingEvidence: '',
        error:
          'This study has no analyzed findings, structured claims, or abstract in the Research Library. Analyze the study first before drafting a research-backed passage.',
      };
    }

    const effectiveModel = resolveEffectiveModelId({
      actionOverride: options?.modelOverride,
      projectOverride: project.modelOverride,
      globalDefault: storage.getGlobalModel(),
    });
    const { bodyHtml } = splitBodyAndReferences(project.content || '');
    const plainDoc = extractPlainTextFromHtml(bodyHtml).trim();

    const response = await fetch(getApiUrl('/api/gemini/draft-research-passage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectTitle: project.title,
        documentContent: plainDoc,
        targetSectionHeading: options?.targetSectionHeading || '',
        anchorPassageContext: options?.anchorPassageContext || '',
        editorialGuidance: options?.editorialGuidance || '',
        model: effectiveModel,
        study: {
          id: study.id,
          title: study.title,
          authors: study.authors,
          publicationYear: study.publicationYear,
          publication: study.publication || study.sourceOrPublisher,
          abstract: abstractText,
          whatWasStudied: study.analysis?.whatWasStudied || '',
          whatTheStudyFound: findings,
          whatItMeans: study.analysis?.whatItMeans || '',
          whatItDoesNotEstablish: study.analysis?.whatItDoesNotEstablish || [],
          limitations: study.analysis?.limitations || [],
          claims: activeClaims.map((c) => ({
            claimText: c.claimText,
            claimType: c.claimType,
            supportedBySource: c.supportedBySource,
            confidence: c.confidence,
            relevantLimitation: c.relevantLimitation,
          })),
        },
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errMessage = errData.error || `Server returned ${response.status}`;
      toast.error('Draft Passage Failed', errMessage);
      throw new Error(errMessage);
    }

    const data = await response.json();
    if (!data.ok || !data.proposedPassage) {
      const errMessage = data.error || 'Failed to draft research-backed passage.';
      toast.error('Draft Passage Failed', errMessage);
      throw new Error(errMessage);
    }

    return {
      ok: true,
      proposedPassage: String(data.proposedPassage).trim(),
      relevantFinding: String(data.relevantFinding || findings[0] || activeClaims[0]?.claimText || '').trim(),
      supportingEvidence: String(
        data.supportingEvidence ||
          activeClaims[0]?.supportedBySource ||
          findings[0] ||
          abstractText.slice(0, 240)
      ).trim(),
      limitationsOrQualifications:
        String(data.limitationsOrQualifications || study.analysis?.limitations?.[0] || '').trim() ||
        undefined,
      explanation: String(data.explanation || '').trim() || undefined,
      targetSectionHeading: data.targetSectionHeading || options?.targetSectionHeading,
      anchorPassageContext: data.anchorPassageContext || options?.anchorPassageContext,
    };
  }
}

export const researchService = new ResearchService();

