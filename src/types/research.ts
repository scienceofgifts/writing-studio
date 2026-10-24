/**
 * Science of Gifts - Research & Fact Repository Types
 * Supports research studies, source files, analyses, structured claims, and article integration.
 */

export type ClaimType = 'source_fact' | 'editorial_interpretation' | 'writing_suggestion';
export type ClaimConfidence = 'high' | 'moderate' | 'preliminary';
export type StudyAnalysisStatus = 'unanalyzed' | 'analyzed' | 'analyzing' | 'error';

export interface ResearchClaim {
  id: string;
  studyId: string;
  studyTitle?: string;
  claimText: string;
  claimType: ClaimType;
  supportedBySource: string;
  context?: string;
  confidence: ClaimConfidence;
  relevantLimitation?: string;
  sourceReference?: string;
  evidenceQuote?: string; // backwards compatibility
  notes?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  _isDeleted?: boolean;
  deletedAt?: string;
}

export interface PotentialArticleIdea {
  title: string;
  angle: string;
  whyInteresting?: string;
  searchIntent?: string;
  supportingStudies?: string[];
}

export interface StudyAnalysis {
  id: string;
  studyId: string;
  analyzedAt: string;
  modelUsed?: string;
  whatWasStudied: string;
  whatTheStudyFound: string[];
  whatItMeans: string;
  whatItDoesNotEstablish: string[];
  methodology: string;
  limitations: string[];
  editorialUse: string[];
  potentialArticleIdeas: PotentialArticleIdea[];
  rawAnalysisMarkdown?: string;
}

export interface StudyAnalysisRevision {
  id: string;
  timestamp: string;
  modelUsed?: string;
  analysis: StudyAnalysis;
  claims: ResearchClaim[];
}

export interface ResearchFile {
  id: string;
  studyId?: string;
  fileName: string;
  fileType: string;
  fileSize: number; // in bytes
  content: string; // Plain text or base64 data URL
  extractedText?: string;
  uploadedAt: string;
  updatedAt: string;
  _isDeleted?: boolean;
  deletedAt?: string;
}

export interface ResearchStudy {
  id: string;
  title: string;
  authors: string[];
  publication?: string;
  sourceOrPublisher?: string; // backwards compatibility
  publicationYear?: string | number;
  publicationDate?: string; // backwards compatibility
  doi?: string;
  doiOrUrl?: string; // backwards compatibility
  sourceUrl?: string;
  abstract?: string;
  summary?: string; // backwards compatibility
  keyFindings?: string[]; // backwards compatibility
  methodology?: string;
  tags: string[];
  dateAdded: string; // ISO date
  dateAnalyzed?: string; // ISO date
  analysisStatus: StudyAnalysisStatus;
  notes?: string;
  fileId?: string;
  fileName?: string;
  fileSize?: number;
  extractedText?: string;
  attachedFileIds?: string[]; // backwards compatibility
  analysis?: StudyAnalysis;
  analysisRevisions?: StudyAnalysisRevision[];
  claims?: ResearchClaim[];
  createdAt: string;
  updatedAt: string;
  _isDeleted?: boolean;
  deletedAt?: string;
}

export interface EditorialDraftPackageSection {
  id?: string;
  title: string;
  heading?: string;
  description?: string;
  purpose?: string;
  mainIdea?: string;
  develops?: string;
  notes?: string;
  assignedStudies: {
    id: string;
    title: string;
    citation: string;
    authors?: string[];
    year?: string | number;
    url?: string;
    keyFindings?: string[];
  }[];
  assignedLinks?: {
    id: string;
    title: string;
    url: string;
    targetAnchor?: string;
    context?: string;
  }[];
}

export interface EditorialDraftPackageStudy {
  studyId: string;
  title: string;
  authors?: string[];
  publicationYear?: number | string;
  publication?: string;
  url?: string;
  citation: string;
  keyFindings: string[];
  supportedClaims: {
    text: string;
    type: ClaimType | string;
    confidence: ClaimConfidence | string;
    limitation?: string;
  }[];
  limitations: string[];
  articleRelevance: string;
  whereToUse?: string;
}

export interface EditorialDraftPackageLink {
  targetTitle: string;
  url: string;
  description?: string;
  topic?: string;
  suggestedAnchor: string;
  suggestedContext?: string;
  relevantSection?: string;
  reason: string;
}

export interface EditorialDraftPackageStyleGuidance {
  profileName: string;
  description?: string;
  distilledCharacteristics: {
    category: string;
    observation: string;
    evidence?: string;
  }[];
  reusableInstructions: string[];
}

export interface EditorialDraftPackageProjectGuidance {
  tone?: string;
  targetWordCount?: number;
  editorialGuidance?: string;
  projectInstructions?: string[];
  hardConstraints?: string[];
  bannedTerms?: string[];
  requiredTerms?: string[];
}

export interface EditorialDraftPackage {
  generatedAt: string;
  article: {
    title: string;
    topic?: string;
    type: string;
    searchIntent: string;
    audience: string;
    centralArgument?: string;
    purpose?: string;
    deck?: string;
    standfirst?: string;
    readerLearns?: string;
    readerFeels?: string;
    keyPoints?: string[];
    thingsToAvoid?: string[];
  };
  editorialDirection?: {
    primaryAngle?: string;
    secondaryFocus?: string;
    briefMentions?: string[];
    doNotFocusOn?: string[];
    editorsDirection?: string;
    centralArgument?: string;
    keyQuestions?: string[];
    intendedTakeaway?: string;
    factualContext?: string[];
    editorialInterpretation?: string[];
  };
  outline: {
    structureType?: string;
    editorialRationale?: string;
    sections: EditorialDraftPackageSection[];
  };
  research: EditorialDraftPackageStudy[];
  internalLinks: EditorialDraftPackageLink[];
  styleGuidance?: EditorialDraftPackageStyleGuidance;
  projectGuidance?: EditorialDraftPackageProjectGuidance;
  editorialNotes: {
    pointsToEmphasize: string[];
    thingsToAvoid: string[];
    unresolvedQuestions: string[];
  };
  markdownExport: string;
  chatGptPrompt?: string;
  claudePrompt?: string;
  sectionPrompts?: {
    sectionIndex: number;
    title: string;
    prompt: string;
  }[];
}
