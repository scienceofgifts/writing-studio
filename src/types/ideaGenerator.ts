/**
 * Science of Gifts - Editorial Idea Generator Types (Phase 10.5)
 * Lightweight discovery system for high-intent article concepts and unexpected angles.
 */

export type IdeaGoal =
  | 'Informational'
  | 'Problem-solving'
  | 'Gift-related'
  | 'Psychological'
  | 'Cultural'
  | 'Practical'
  | 'Search-focused';

export type IdeaStyle =
  | 'Unexpected'
  | 'Psychological'
  | 'Contrarian'
  | 'Practical'
  | 'Deep dive'
  | 'Cultural'
  | 'Specific problem'
  | 'Mixed';

export interface EditorialIdea {
  id: string;
  title: string;
  angle: string;
  whyInteresting: string;
  searchIntent?: string;
}

export interface SavedEditorialIdea {
  id: string;
  title: string;
  angle: string;
  whyInteresting: string;
  searchIntent?: string;
  originalTopic: string;
  audience?: string;
  goal: IdeaGoal;
  ideaStyle: IdeaStyle;
  savedAt: string;
}

export interface IdeaGenerationRequest {
  topic: string;
  audience?: string;
  goal: IdeaGoal;
  ideaStyle: IdeaStyle;
  context?: string;
  avoidObvious: boolean;
  existingTitles?: string[];
  model?: string;
}

export interface IdeaGenerationResponse {
  ok: boolean;
  ideas: EditorialIdea[];
  modelUsed: string;
  actionType: 'idea_generation';
  timestamp: string;
  durationMs?: number;
  error?: string;
}
