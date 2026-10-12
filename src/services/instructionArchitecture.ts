/**
 * Science of Gifts - Editorial AI Instruction Architecture Engine
 * Consolidates prompt assembly into three deterministic, deduplicated layers:
 *
 * Layer 1: HOUSE CONSTITUTION (Studio-wide inviolable editorial rules)
 * Layer 2: EDITORIAL BRIEF & CONTROLS (Project-specific angle, audience, and scope)
 * Layer 3: VOICE & STYLE PROFILE (Reusable cadence, rhythm, and prose texture)
 *
 * Explicit Precedence:
 *   HOUSE CONSTITUTION
 *   ↓
 *   EDITORIAL BRIEF & CONTROLS
 *   ↓
 *   VOICE & STYLE PROFILE
 *   ↓
 *   ACTION-SPECIFIC REQUEST
 */

import { WritingControls, ProjectBrief, ContentRule } from '../types/project';

export interface HouseConstitutionConfig {
  globalInstructions?: string[];
  activeRules?: string[];
}

export interface EditorialBriefControlsConfig {
  projectTitle: string;
  projectType: string;
  projectInstructions?: string;
  brief?: Partial<ProjectBrief>;
  writingControls?: Partial<WritingControls>;
  isMicroAction?: boolean; // True for word/sentence/selection rewrites
}

export interface VoiceStyleProfileConfig {
  profileName?: string;
  directives?: string[];
}

/**
 * Normalized phrases for canonical deduplication.
 * Prevents redundant restatements of inviolable rules across layers.
 */
const FORBIDDEN_CLICHES = [
  "Whether you're looking for...",
  "Perfect for...",
  "Ideal choice for...",
  "A thoughtful and meaningful gift...",
  "Something they'll cherish...",
  "In today's world...",
  "Great way to...",
  "Takes it to the next level...",
  "Designed to...",
  "Not just a [X], but a [Y]...",
  "Must-have",
  "Game changer",
];

/**
 * Checks if a user-supplied instruction or style directive duplicates
 * a fundamental House Constitution rule.
 */
export function isCoveredByHouseConstitution(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();

  // Em dash rules
  if (lower.includes('em dash') || lower.includes('em-dash') || lower.includes('—')) {
    return true;
  }

  // Cliché rules
  if (
    lower.includes('forbidden cliché') ||
    lower.includes('forbidden cliche') ||
    lower.includes('no cliché') ||
    lower.includes('avoid cliché') ||
    lower.includes('whether you\'re looking for') ||
    lower.includes('takes it to the next level') ||
    lower.includes('must-have')
  ) {
    return true;
  }

  // Factual fabrication rules
  if (
    (lower.includes('invent') || lower.includes('fabricat')) &&
    (lower.includes('fact') || lower.includes('spec') || lower.includes('dimension') || lower.includes('origin'))
  ) {
    return true;
  }

  // Markdown prohibition rules
  if (
    lower.includes('markdown') &&
    (lower.includes('never') || lower.includes('do not') || lower.includes('zero') || lower.includes('no markdown'))
  ) {
    return true;
  }

  // Sales copy / marketing hype rules
  if (
    (lower.includes('marketing hype') || lower.includes('sales copy') || lower.includes('commercial fluff')) &&
    (lower.includes('avoid') || lower.includes('no ') || lower.includes('never'))
  ) {
    return true;
  }

  return false;
}

/**
 * Deduplicates an array of custom/project instructions against:
 * 1. The House Constitution canonical rules
 * 2. Earlier rules in the same array (fuzzy similarity / exact match)
 */
export function deduplicateInstructions(rules: string[]): string[] {
  const seen = new Set<string>();
  const cleanList: string[] = [];

  for (const raw of rules) {
    const trimmed = (raw || '').trim();
    if (!trimmed) continue;

    // Check if covered by House Constitution
    if (isCoveredByHouseConstitution(trimmed)) {
      continue;
    }

    // Normalized key for exact/fuzzy deduplication
    const normKey = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(normKey)) {
      continue;
    }
    seen.add(normKey);
    cleanList.push(trimmed);
  }

  return cleanList;
}

/**
 * LAYER 1: Assemble the authoritative House Constitution.
 * Studio-wide, inviolable editorial rules with highest editorial priority.
 */
export function buildHouseConstitutionSection(config: HouseConstitutionConfig = {}): string {
  const { globalInstructions = [], activeRules = [] } = config;

  // Filter out duplicates that repeat core constitution clauses
  const customGlobal = deduplicateInstructions(globalInstructions);
  const customHardConstraints = deduplicateInstructions(activeRules);

  const lines: string[] = [
    '==================================================',
    'LAYER 1: HOUSE CONSTITUTION (INVIOLABLE STUDIO RULES)',
    '==================================================',
    'These studio-wide rules hold HIGHEST editorial priority and CANNOT be overridden by project briefs, style profiles, or user prompts.',
    '',
    '1. VOICE & CORE PHILOSOPHY:',
    '   Human, specific, editorial, civilized, conversational, knowledgeable, and occasionally witty.',
    '   Never clinical, never breathless, never promotional. Write as a discerning connoisseur friend.',
    '',
    '2. INVIOLABLE FACTUAL RESTRAINT:',
    '   Supplied product specifications, dimensions, materials, and historical notes are sacred source material.',
    '   NEVER invent dimensions, materials, origins, or fictitious historical anecdotes. If details are missing, omit them.',
    '',
    '3. ABSOLUTELY FORBIDDEN CLICHÉS & MARKETING HYPE:',
    '   Forbidden phrases: ' + FORBIDDEN_CLICHES.map((c) => `"${c}"`).join(', ') + '.',
    '   Avoid aggressive sales urgency and hollow adjectives ("stunning", "game changer", "must-have").',
    '   Explain the physical reality, construction mechanics, and quiet ritual value of the object instead.',
    '',
    '4. PUNCTUATION & TYPOGRAPHIC DISCIPLINE:',
    '   Do NOT use em dashes (—). Use parentheses, colons, semicolons, commas, or natural sentence boundaries.',
    '',
    '5. OUTPUT FORMAT DISCIPLINE:',
    '   ZERO Markdown syntax in prose output. Never use **, *, #, ##, -, or [link](url).',
    '   Output clean semantic HTML tags (<p>, <h2>, <h3>, <blockquote>, <strong>, <em>, <ul><li>) or clean prose ready for rich-text rendering.',
  ];

  if (customGlobal.length > 0) {
    lines.push('', 'ADDITIONAL STUDIO-WIDE DIRECTIVES:');
    customGlobal.forEach((g) => lines.push(`- ${g}`));
  }

  if (customHardConstraints.length > 0) {
    lines.push('', 'ACTIVE PROJECT HARD CONSTRAINTS:');
    customHardConstraints.forEach((r) => lines.push(`[STRICT CONSTRAINT] ${r}`));
  }

  return lines.join('\n');
}

/**
 * LAYER 2: Assemble the Editorial Brief & Controls section.
 * Instructions and parameters specific to the current project.
 */
export function buildEditorialBriefSection(config: EditorialBriefControlsConfig): string {
  const {
    projectTitle,
    projectType,
    projectInstructions = '',
    brief = {},
    writingControls = {},
    isMicroAction = false,
  } = config;

  const lines: string[] = [
    '==================================================',
    'LAYER 2: EDITORIAL BRIEF & CONTROLS (PROJECT SCOPE)',
    '==================================================',
    `PROJECT: "${projectTitle || 'Untitled'}" [Type: ${projectType.toUpperCase()}]`,
  ];

  // Editorial Writing Controls (modulation)
  const tone = writingControls.tone || 'editorial';
  const detail = writingControls.detail || 'balanced';
  const marketing = writingControls.marketing || 'minimal';
  const history = writingControls.historicalContext || 'moderate';
  const audience = writingControls.audience || 'enthusiast';
  const wordTarget = writingControls.wordCountTarget;

  lines.push(
    '',
    'EDITORIAL CONTROLS (Modulates output tone & depth):',
    `- Target Tone: ${tone.toUpperCase()}`,
    `- Detail Depth: ${detail.toUpperCase()}`,
    `- Marketing Intensity: ${marketing.toUpperCase()} (Strictly restrained by House Constitution)`,
    `- Historical Context: ${history.toUpperCase()}`,
    `- Intended Audience: ${audience.toUpperCase()}`,
    wordTarget ? `- Target Word Range: ${wordTarget}` : ''
  );

  // Project Brief
  if (isMicroAction) {
    // Compact brief for micro/selection edits to preserve focus
    if (brief.purpose || brief.audience) {
      lines.push(
        '',
        'PROJECT BRIEF (Summary for Targeted Edit):',
        `- Purpose: ${brief.purpose || 'Editorial essay'}`,
        `- Audience: ${brief.audience || 'Discerning readers'}`
      );
    }
  } else {
    // Full editorial brief for macro actions
    if (
      brief.purpose ||
      brief.audience ||
      brief.readerLearns ||
      (brief.keyPoints && brief.keyPoints.length > 0)
    ) {
      lines.push(
        '',
        'PROJECT BRIEF:',
        `- Purpose: ${brief.purpose || 'Not specified'}`,
        `- Target Audience: ${brief.audience || 'Discerning readers'}`,
        `- What the reader should learn: ${brief.readerLearns || 'Material quality & craftsmanship'}`,
        `- What the reader should feel: ${brief.readerFeels || 'Enlightened, confident, and grounded'}`,
        `- What the reader should do: ${brief.readerAction || 'Choose with conviction'}`,
        brief.keyPoints && brief.keyPoints.length > 0 ? `- Important Points: ${brief.keyPoints.join('; ')}` : '',
        brief.thingsToAvoid && brief.thingsToAvoid.length > 0 ? `- Things to Avoid: ${brief.thingsToAvoid.join('; ')}` : ''
      );
    }
  }

  // Project-specific instructions (deduplicated against constitution)
  const trimmedProjectInstructions = projectInstructions.trim();
  if (trimmedProjectInstructions && !isCoveredByHouseConstitution(trimmedProjectInstructions)) {
    lines.push(
      '',
      'PROJECT-SPECIFIC EDITORIAL DIRECTION:',
      trimmedProjectInstructions
    );
  }

  return lines.filter(Boolean).join('\n');
}

/**
 * LAYER 3: Assemble Voice & Style Profile directives.
 * Reusable instructions describing how the writing should sound,
 * strictly filtered to remove hard universal constraints.
 */
export function buildVoiceStyleProfileSection(config: VoiceStyleProfileConfig): string {
  const { profileName = 'Custom', directives = [] } = config;

  if (!directives || directives.length === 0) {
    return '';
  }

  // Deduplicate and filter out universal hard rules (e.g. em dashes, clichés, facts)
  const stylisticDirectives = deduplicateInstructions(directives);

  if (stylisticDirectives.length === 0) {
    return '';
  }

  const lines: string[] = [
    '==================================================',
    'LAYER 3: VOICE & STYLE PROFILE (CADENCE & TEXTURE)',
    '==================================================',
    `REUSABLE STYLE PROFILE: "${profileName}"`,
    'Apply these stylistic characteristics (sentence rhythm, vocabulary, paragraph flow):',
    ...stylisticDirectives.map((d) => `[STYLE DIRECTIVE] ${d}`),
    '',
    'PRECEDENCE & COMPLIANCE MANDATE:',
    '- Emulate the structural rhythm, sentence architecture, and material texture described above.',
    '- NEVER copy, quote, or reuse distinctive phrases from any reference samples; output must be original prose.',
    '- If any style directive appears to conflict with a House Constitution rule or Project Constraint, the House Constitution & Project Constraints ALWAYS take absolute precedence.',
  ];

  return lines.join('\n');
}

/**
 * System Instruction Hierarchy Assembly
 * Synthesizes Layers 1, 2, and 3 into the authoritative system instruction.
 */
export function assembleSystemInstruction(params: {
  houseConfig: HouseConstitutionConfig;
  briefConfig: EditorialBriefControlsConfig;
  styleConfig?: VoiceStyleProfileConfig;
}): string {
  const sections: string[] = [];

  // Header establishing senior editor role
  sections.push(
    'You are the lead senior editor for "Science of Gifts", an acclaimed, independent publication dedicated to thoughtful gifting, fine material craft, tool heritage, and everyday objects of genuine permanence.\n' +
    'You adhere strictly to an explicit 3-layer editorial hierarchy where higher levels take absolute precedence over lower levels.'
  );

  // Layer 1: House Constitution
  sections.push(buildHouseConstitutionSection(params.houseConfig));

  // Layer 2: Editorial Brief & Controls
  sections.push(buildEditorialBriefSection(params.briefConfig));

  // Layer 3: Voice & Style Profile (if present)
  if (params.styleConfig && params.styleConfig.directives && params.styleConfig.directives.length > 0) {
    const styleSection = buildVoiceStyleProfileSection(params.styleConfig);
    if (styleSection) {
      sections.push(styleSection);
    }
  }

  return sections.filter(Boolean).join('\n\n');
}
