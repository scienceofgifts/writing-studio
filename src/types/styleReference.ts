/**
 * Science of Gifts - Style Reference System Types (Phase 3)
 * Analyzes writing samples and translates characteristics into practical, reusable writer instructions.
 */

export interface WritingSample {
  id: string;
  title: string;
  sourceDescription?: string;
  content: string; // Plain text or semantic rich-text prose (never Markdown)
  createdAt: string;
  updatedAt: string;
}

export interface StyleCharacteristic {
  category: string; // e.g., 'Tone', 'Sentence Rhythm', 'Vocabulary', 'Paragraph Structure', 'Specificity', 'Pacing', 'Humor', 'Emotional Intensity', 'Point of View', 'Abstract vs Concrete', 'Openings & Conclusions'
  observation: string;
  evidence?: string;
  isCommonAcrossSamples?: boolean; // distinguishes common from sample-specific
}

export interface StyleAnalysis {
  id: string;
  sampleIds: string[];
  sampleCount: number;
  analyzedAt: string;
  summary: string;
  characteristics: StyleCharacteristic[];
  commonCharacteristics?: StyleCharacteristic[];
  sampleSpecificCharacteristics?: StyleCharacteristic[];
}

export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  samples: WritingSample[];
  latestAnalysis?: StyleAnalysis;
  generatedInstructions: string[]; // AI-generated reusable instructions
  userEditedInstructions: string[]; // User modified instructions (final authority)
  hasUserEdited: boolean; // Flag to track if user edited instructions
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StyleAnalysisRequest {
  profileName: string;
  samples: {
    id: string;
    title: string;
    content: string;
    sourceDescription?: string;
  }[];
}

export interface StyleAnalysisResponse {
  ok: boolean;
  summary: string;
  characteristics: StyleCharacteristic[];
  commonCharacteristics?: StyleCharacteristic[];
  sampleSpecificCharacteristics?: StyleCharacteristic[];
  reusableInstructions: string[];
  error?: string;
}
