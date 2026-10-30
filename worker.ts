/**
 * Science of Gifts - Authoritative Cloudflare Edge Worker with Static Assets
 * Handles all /api/* endpoints natively and delegates static assets to env.ASSETS.
 * Guarantees zero silent fallbacks and full error visibility.
 */

import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { extractText } from 'unpdf';
import {
  validateBriefGenerationInputs,
  validateAndNormalizeEditorialBrief,
} from './src/utils/editorialDevelopmentUtils';
import {
  extractProductFactsFromHtml,
  buildProductAnalysisPromptAndParts,
  normalizeProductResearchOutput,
  ExtractedUrlPageFacts,
} from './src/utils/productResearchUtils';
import {
  sanitizeProductMetadataForPrompt,
  resolveProductCopyActionModel,
  normalizeEditorialActionProposedText,
  buildCreativeDirectionPromptAndParts,
  normalizeCreativeDirectionOutput,
  CreativeDirectionRegenerateTarget,
} from './src/utils/productCreativeDirectionUtils';
import { validateInternalLinkUrl } from './src/utils/urlUtils';
import { fetchUrlMetadata, fetchProductUrlMetadata } from './src/server/urlMetadata';

export interface Env {
  GEMINI_API_KEY?: string;
  ASSETS: {
    fetch: (request: Request | string) => Promise<Response>;
  };
  [key: string]: any;
}

const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const VALID_MODELS = new Set([
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
]);

const MODEL_FALLBACK_CHAIN = [
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
];

const PER_MODEL_ATTEMPT_TIMEOUT_MS = 28000;
const QUOTA_COOLDOWN_MS = 180000;
const quotaExhaustedUntil = new Map<string, number>([
  ['gemini-3.6-flash', Date.now() + 180000],
  ['gemini-3.5-flash', Date.now() + 180000],
  ['gemini-3.8-flash', Date.now() + 180000],
  ['gemini-3.7-flash', Date.now() + 180000],
]);

function resolveModel(requested?: string, fallback = 'gemini-3-flash-preview'): string {
  const now = Date.now();
  if (
    requested &&
    VALID_MODELS.has(requested) &&
    (quotaExhaustedUntil.get(requested) || 0) <= now
  ) {
    return requested;
  }
  return fallback;
}

function isQuotaExhaustedError(err: any): boolean {
  if (!err) return false;
  const status = err.status || err.code || err?.error?.code;
  if (status === 429) return true;
  const msg = String(err.message || err || '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('exceeded your current quota')
  );
}

function isTransientOverloadError(err: any): boolean {
  if (!err) return false;
  if (isQuotaExhaustedError(err)) return true;
  const status = err.status || err.code || err?.error?.code;
  if (status === 503 || status === 502 || status === 504) return true;
  const msg = String(err.message || err || '').toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('deadline') ||
    msg.includes('local_model_timeout') ||
    msg.includes('try again later')
  );
}

async function generateContentWithFallback(
  ai: GoogleGenAI,
  primaryModel: string,
  params: {
    contents: any;
    config?: any;
    timeoutMs?: number;
  }
): Promise<{ response: any; modelUsed: string }> {
  const now = Date.now();
  const effectivePrimary =
    (quotaExhaustedUntil.get(primaryModel) || 0) > now
      ? 'gemini-3-flash-preview'
      : primaryModel;

  const baseOrder = [
    effectivePrimary,
    ...MODEL_FALLBACK_CHAIN.filter((m) => m !== effectivePrimary),
  ];

  // Prioritize models that have not recently returned 429 quota exhaustion
  const availableFirst = baseOrder.filter((m) => (quotaExhaustedUntil.get(m) || 0) <= now);
  const coolingDown = baseOrder.filter((m) => (quotaExhaustedUntil.get(m) || 0) > now);
  // Add a second retry pass on fast primary/fallback models to survive transient 1-second 503 spikes
  const retryPass = ['gemini-3-flash-preview', 'gemini-3.1-flash-lite'].filter(
    (m) => (quotaExhaustedUntil.get(m) || 0) <= now
  );
  const candidateModels = [...availableFirst, ...retryPass, ...coolingDown];

  const attemptTimeoutMs = params.timeoutMs || PER_MODEL_ATTEMPT_TIMEOUT_MS;
  const effectiveConfig = params.config
    ? {
        ...params.config,
        thinkingConfig: params.config.thinkingConfig ?? {
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
      }
    : {
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MINIMAL,
        },
      };

  let lastError: any = null;
  for (let i = 0; i < candidateModels.length; i++) {
    const candidate = candidateModels[i];
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
    try {
      const response = (await Promise.race([
        ai.models.generateContent({
          model: candidate,
          contents: params.contents,
          config: effectiveConfig,
        }),
        new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            const timeoutErr: any = new Error(
              `LOCAL_MODEL_TIMEOUT: Model ${candidate} exceeded ${attemptTimeoutMs}ms attempt budget`
            );
            timeoutErr.status = 504;
            reject(timeoutErr);
          }, attemptTimeoutMs);
        }),
      ])) as any;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      quotaExhaustedUntil.delete(candidate);
      return { response, modelUsed: candidate };
    } catch (err: any) {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      lastError = err;
      if (isQuotaExhaustedError(err)) {
        quotaExhaustedUntil.set(candidate, Date.now() + QUOTA_COOLDOWN_MS);
      }
      if (!isTransientOverloadError(err) || i === candidateModels.length - 1) {
        throw err;
      }
      console.info(
        `[model-fallback] ${candidate} unavailable (${
          err?.status || 'transient'
        }); switching to ${candidateModels[i + 1]}`
      );
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  throw lastError || new Error('All Gemini candidate models failed.');
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

function getAiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseModelJson(rawText?: string): any {
  const text = (rawText || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          return JSON.parse(objMatch[0]);
        } catch {}
      }
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        try {
          return JSON.parse(arrMatch[0]);
        } catch {}
      }
    }
  }
  return null;
}

function toStringArray(val: any, fallback: string[] = []): string[] {
  if (Array.isArray(val)) {
    return val
      .map((item) =>
        typeof item === 'string'
          ? item.trim()
          : String(item?.text || item?.title || item?.claimText || item || '').trim()
      )
      .filter(Boolean);
  }
  if (typeof val === 'string' && val.trim()) {
    return [val.trim()];
  }
  return fallback;
}

function buildEditorialPrompt(payload: any): { systemInstruction: string; userPrompt: string } {
  const {
    action,
    projectType = 'article',
    projectTitle = 'Untitled',
    currentContent,
    selectedText,
    scope = 'selection',
    customCommand,
    globalInstructions = [],
    projectInstructions = '',
    brief = {},
    outline = [],
    contentRules = [],
    writingControls = {},
    aiSettings = {},
    relevantProduct = null,
    styleProfileName = '',
    styleProfileInstructions = [],
  } = payload;

  const effectiveControls = writingControls.tone ? writingControls : aiSettings;
  const isMicroAction = Boolean(selectedText) && scope === 'selection';

  const isCoveredByHouse = (t: string) => {
    if (!t) return false;
    const l = t.toLowerCase();
    return (
      l.includes('em dash') ||
      l.includes('em-dash') ||
      l.includes('—') ||
      l.includes('forbidden cliché') ||
      l.includes('forbidden cliche') ||
      l.includes("whether you're looking for") ||
      l.includes('must-have') ||
      ((l.includes('invent') || l.includes('fabricat')) && (l.includes('fact') || l.includes('spec') || l.includes('dimension'))) ||
      (l.includes('markdown') && (l.includes('never') || l.includes('no ') || l.includes('zero'))) ||
      ((l.includes('marketing hype') || l.includes('sales copy')) && (l.includes('avoid') || l.includes('no ')))
    );
  };

  const dedupe = (rules: string[]) => {
    const seen = new Set<string>();
    const res: string[] = [];
    for (const r of rules) {
      const trim = (r || '').trim();
      if (!trim || isCoveredByHouse(trim)) continue;
      const key = trim.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      res.push(trim);
    }
    return res;
  };

  let systemInstruction = `You are the lead senior editor for "Science of Gifts", an acclaimed, independent publication dedicated to thoughtful gifting, fine material craft, tool heritage, and everyday objects of genuine permanence.
You strictly enforce an explicit editorial hierarchy:
HOUSE CONSTITUTION (Inviolable) > EDITORIAL BRIEF & CONTROLS > VOICE & STYLE PROFILE > ACTION REQUEST.

==================================================
LAYER 1: HOUSE CONSTITUTION (INVIOLABLE STUDIO RULES)
==================================================
1. VOICE & CORE PHILOSOPHY:
   Human, specific, editorial, civilized, conversational, knowledgeable, and occasionally witty.
   Never clinical, never breathless, never promotional. Write as a discerning connoisseur friend.
2. INVIOLABLE FACTUAL RESTRAINT & MANUFACTURER ANTI-PARROTING:
   Raw product specifications, materials, and historical notes are sacred source material for hard physical facts ONLY.
   NEVER invent dimensions, materials, weights (GSM/oz), origins, or fictitious historical anecdotes. If details are missing, omit them.
   NEVER copy, parrot, or lightly paraphrase vendor marketing prose, promotional superlatives, or generic e-commerce boilerplate from raw product notes.
3. ABSOLUTELY FORBIDDEN CLICHÉS:
   Never use "Whether you're looking for...", "Perfect for...", "Ideal choice for...", "A thoughtful and meaningful gift...", "Something they'll cherish...", "In today's world...", "Takes it to the next level...", "Designed to...", "Must-have", "Game changer".
4. PUNCTUATION DISCIPLINE:
   Do NOT use em dashes (—). Use parentheses, colons, semicolons, commas, or natural sentence boundaries instead.
5. NO SALES COPY:
   Avoid marketing hype and aggressive urgency. Explain physical reality and quiet ritual value instead.
6. ZERO MARKDOWN DISCIPLINE:
   Never output Markdown syntax (no **, *, #, ##, -, [link](url)). Output clean semantic HTML tags (<p>, <h2>, <h3>, <blockquote>, <strong>, <em>, <ul><li>) or clean prose ready for rich-text rendering.`;

  const cleanGlobal = dedupe(globalInstructions);
  if (cleanGlobal.length > 0) {
    systemInstruction += `\n\nADDITIONAL STUDIO-WIDE DIRECTIVES:\n${cleanGlobal.map((r: string) => `- ${r}`).join('\n')}`;
  }

  const cleanConstraints = dedupe(contentRules);
  if (cleanConstraints.length > 0) {
    systemInstruction += `\n\nPROJECT HARD CONSTRAINTS (MANDATORY):\n${cleanConstraints.map((r: string) => `[STRICT CONSTRAINT] ${r}`).join('\n')}`;
  }

  systemInstruction += `\n\n==================================================
LAYER 2: EDITORIAL CONTROLS (PROJECT PARAMETERS)
==================================================
- Target Tone: ${(effectiveControls.tone || 'editorial').toUpperCase()}
- Detail Depth: ${(effectiveControls.detail || 'balanced').toUpperCase()}
- Marketing Intensity: ${(effectiveControls.marketing || 'minimal').toUpperCase()} (strictly restrained by House Constitution)
- Historical Context: ${(effectiveControls.historicalContext || 'moderate').toUpperCase()}
- Intended Audience: ${(effectiveControls.audience || 'enthusiast').toUpperCase()}
${effectiveControls.wordCountTarget ? `- Target Word Range: ${effectiveControls.wordCountTarget}` : ''}`;

  const cleanStyle = dedupe(styleProfileInstructions);
  if (cleanStyle.length > 0) {
    systemInstruction += `\n\n==================================================
LAYER 3: VOICE & STYLE PROFILE ("${styleProfileName || 'Custom'}")
==================================================
Stylistic cadence, sentence architecture, and prose texture directives:
${cleanStyle.map((r: string) => `[STYLE DIRECTIVE] ${r}`).join('\n')}

PRECEDENCE MANDATE:
- Emulate the structural rhythm, sentence architecture, and material specificity described above.
- NEVER copy or quote distinctive phrases from reference samples.
- If any style suggestion conflicts with a House Constitution rule or Project Constraint, the House Constitution & Project Constraints ALWAYS take absolute precedence.`;
  }

  let userPrompt = `ACTION TARGET: "${projectTitle}" [${projectType.toUpperCase()}]
`;

  if (isMicroAction) {
    if (brief.purpose || brief.audience) {
      userPrompt += `\nPROJECT BRIEF (Summary for Targeted Edit):
- Purpose: ${brief.purpose || 'Editorial essay'}
- Audience: ${brief.audience || 'Discerning readers'}
`;
    }
  } else {
    userPrompt += `\nPROJECT BRIEF:
- Purpose: ${brief.purpose || 'Not specified'}
- Audience: ${brief.audience || 'Discerning readers'}
- What reader should learn: ${brief.readerLearns || 'Material quality & craftsmanship'}
- What reader should feel: ${brief.readerFeels || 'Enlightened & confident'}
- Key points: ${Array.isArray(brief.keyPoints) ? brief.keyPoints.join('; ') : ''}
- Things to avoid: ${Array.isArray(brief.thingsToAvoid) ? brief.thingsToAvoid.join('; ') : ''}
`;
  }

  const cleanProjectInstructions = projectInstructions.trim();
  if (cleanProjectInstructions && !isCoveredByHouse(cleanProjectInstructions)) {
    userPrompt += `\nPROJECT-SPECIFIC EDITORIAL DIRECTION:
${cleanProjectInstructions}
`;
  }

  if (relevantProduct) {
    const sanitizedProduct = sanitizeProductMetadataForPrompt(relevantProduct);
    userPrompt += `\nRELEVANT PRODUCT SOURCE DATA (FACTUAL SOURCE ONLY - DO NOT INVENT SPECS OR PARROT VENDOR PHRASING):
${JSON.stringify(sanitizedProduct, null, 2)}
`;
  }

  if (outline && outline.length > 0 && !isMicroAction) {
    userPrompt += `\nCONTENT OUTLINE:
${outline.map((o: any, idx: number) => `${idx + 1}. ${o.title}${o.notes ? ` (${o.notes})` : ''}`).join('\n')}
`;
  }

  if (currentContent) {
    if (isMicroAction) {
      userPrompt += `\nSURROUNDING PASSAGE CONTEXT:
${currentContent.substring(0, 800)}
`;
    } else {
      userPrompt += `\nCURRENT DOCUMENT CONTEXT:
${currentContent.substring(0, 3500)}
`;
    }
  }

  userPrompt += `\nTARGET SCOPE: ${(scope || 'selection').toUpperCase()}
`;

  if (selectedText) {
    userPrompt += `SELECTED TEXT TO MODIFY / REWRITE:\n"""\n${selectedText}\n"""\n`;
  }

  userPrompt += `\nREQUESTED EDITORIAL ACTION: ${action}
USER COMMAND / SPECIFIC INTENT: ${customCommand || action}

INSTRUCTIONS FOR OUTPUT:
Return ONLY valid JSON matching this structure:
{
  "proposedText": "The refined, newly written or rewritten editorial text. CRITICAL: Never use Markdown formatting syntax (do NOT use **, *, #, ##, -, [link](url)). Output clean semantic HTML tags (such as <p>, <h2>, <h3>, <blockquote>, <strong>, <em>, <ul><li>...</li></ul>) or clean, unhurried prose ready for a visual rich-text editor canvas.",
  "explanation": "A concise 1-2 sentence editorial note explaining how the prose was improved according to the Science of Gifts house style."
}`;

  return { systemInstruction, userPrompt };
}

/**
 * Authoritative API Router Function
 */
export async function handleApiRequest(
  request: Request,
  env: { GEMINI_API_KEY?: string; [key: string]: any }
): Promise<Response> {
  // CORS Preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  // 1. GET /api/health
  if (pathname === '/api/health' && request.method === 'GET') {
    return jsonResponse({
      ok: true,
      status: 'healthy',
      hasKey: Boolean(env.GEMINI_API_KEY),
    });
  }

  // Parse JSON body for POST endpoints
  let body: any = {};
  if (request.method === 'POST') {
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  }

  // Check GEMINI_API_KEY requirement for Gemini-backed routes
  if (
    pathname.startsWith('/api/gemini/') ||
    pathname === '/api/products/analyze-research' ||
    pathname === '/api/products/generate-creative-direction'
  ) {
    if (!env.GEMINI_API_KEY) {
      return jsonResponse(
        {
          ok: false,
          error: 'GEMINI_API_KEY is not configured in Cloudflare Worker environment variables.',
        },
        500
      );
    }
  }

  const apiKey = env.GEMINI_API_KEY || '';
  const getAi = () => getAiClient(apiKey);

  try {
    // 2. POST /api/gemini/action
    if (pathname === '/api/gemini/action' && request.method === 'POST') {
      const ai = getAi();
      const requestedModel = resolveProductCopyActionModel({
        requestedModel: body.model,
        modelOverride: body.modelOverride,
        projectType: body.projectType,
        action: body.action,
        actionType: body.actionType,
        validModels: VALID_MODELS,
      });
      const { systemInstruction, userPrompt } = buildEditorialPrompt(body);

      const { response, modelUsed } = await generateContentWithFallback(ai, requestedModel, {
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.6,
        },
      });

      const text = response.text?.trim() || '';
      const parsed = parseModelJson(text);
      const proposedText = normalizeEditorialActionProposedText(parsed);

      if (!proposedText) {
        throw new Error('Model failed to generate structured editorial text proposal');
      }

      return jsonResponse({
        ok: true,
        proposedText,
        explanation:
          parsed?.explanation || 'Refined prose according to house editorial standards.',
        modelUsed,
      });
    }

    // 3. POST /api/gemini/find-link-opportunities
    if (pathname === '/api/gemini/find-link-opportunities' && request.method === 'POST') {
      const ai = getAi();
      const { projectTitle = 'Draft', documentContent = '', availableLinks = [] } = body;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.8-flash');

      if (!documentContent.trim()) {
        return jsonResponse({ ok: true, opportunities: [], rationale: 'Document is empty.' });
      }

      const activeLinks = Array.isArray(availableLinks) ? availableLinks.filter((l: any) => l.active !== false) : [];
      if (activeLinks.length === 0) {
        return jsonResponse({ ok: true, opportunities: [], rationale: 'No active links available in library.' });
      }

      const systemInstruction = `You are senior editorial director and link strategist for "Science of Gifts".
Your mission is to identify 2-5 high-value internal link opportunities that provide genuine editorial value to a human reader.

STRICT EDITORIAL RULES:
1. VALUE OVER KEYWORDS: Never link solely based on shared keywords or broad topics. A link must provide useful context, deeper explanation, a relevant example, or a practical next step.
2. BROADER CONTEXT: Consider the article's full argument and the specific paragraph's role. Don't evaluate sentences in isolation.
3. BEST LOCATION: For each destination, find the single best location in the article. Avoid redundant links serving the same purpose.
4. NATURAL FLOW: If a link would feel forced or distracting, DO NOT suggest it. It is better to return 0 suggestions than 1 poor suggestion.
5. NO FABRICATION: Never invent facts about the destination article or product. Use provided library descriptions only.
6. URL INTEGRITY (CRITICAL): Use the EXACT "url" provided for each library item. NEVER invent, guess, prefix, or modify a URL. If you cannot find a suitable place for any provided link, return an empty array.

WORKFLOWS:
1. "match_existing": Use when the article already contains a natural, meaningful phrase.
2. "revise_existing": Use when a small, editorially sound revision (minimal changes) would make the link more natural or useful while preserving the author's meaning and voice.
3. "suggest_new": Use when the destination is highly relevant but no suitable existing passage exists. Propose a meaningful, self-contained sentence (12-20 words) that contributes to the article's flow.

JSON SCHEMA:
{
  "opportunities": [{
    "linkId": "string",
    "linkTitle": "string",
    "linkUrl": "string",
    "destinationType": "article|shop_guide|product|category",
    "workflowType": "match_existing|revise_existing|suggest_new",
    "targetPassage": "Verbatim original sentence (for match/revise) OR the proposed new sentence (for suggest_new)",
    "suggestedAnchor": "The exact phrase to link within the final sentence",
    "proposedText": "For revise_existing: the full revised sentence. For others: omit or repeat targetPassage.",
    "contextSentence": "For suggest_new: the exact existing sentence in the draft AFTER WHICH the new sentence should be inserted",
    "readerBenefit": "Concise explanation of how this link helps a human reader at this exact point",
    "relevanceRationale": "Deep editorial justification for why the destination belongs here specifically",
    "confidence": "high|medium|low",
    "verificationNotes": "Any uncertainty or factual details requiring human verification"
  }],
  "rationale": "Overall linking strategy for this article"
}`;

      const userPrompt = `PROJECT: "${projectTitle}"
DOC (Current Draft):
"""
${documentContent}
"""

LIBRARY (Available Destinations):
${JSON.stringify(activeLinks.map(l => ({
  id: l.id,
  title: l.title,
  url: l.url,
  topic: l.topic,
  description: l.description,
  preferredAnchor: l.preferredAnchor,
  destinationType: l.destinationType
})), null, 2)}`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.3 },
      });

      const parsed = parseModelJson(response.text);
      const opportunitiesList = Array.isArray(parsed) ? parsed : parsed?.opportunities;
      if (!Array.isArray(opportunitiesList)) {
        throw new Error('Model did not return link opportunities array');
      }

      const sanitized = opportunitiesList.map((o: any, idx: number) => {
        const workflowType = ['match_existing', 'revise_existing', 'suggest_new'].includes(o.workflowType) 
          ? o.workflowType 
          : 'match_existing';

        // Ground-truth URL validation using the utility
        const { validatedUrl, wasCorrected } = validateInternalLinkUrl(
          o.linkUrl || '',
          o.linkId || '',
          activeLinks
        );

        let confidence = o.confidence || 'medium';
        let verificationNotes = o.verificationNotes || '';

        if (!validatedUrl) {
          confidence = 'low';
          verificationNotes = (verificationNotes ? verificationNotes + ' ' : '') + 'Warning: Could not verify destination URL against library.';
        } else if (wasCorrected) {
          verificationNotes = (verificationNotes ? verificationNotes + ' ' : '') + 'URL corrected from library ID match.';
        }

        const idMatch = activeLinks.find(l => l.id === o.linkId);

        return {
          id: `opp-${Date.now()}-${idx}`,
          linkId: o.linkId || (idMatch?.id) || `link-${idx}`,
          linkTitle: o.linkTitle || (idMatch?.title) || 'Science of Gifts Destination',
          linkUrl: validatedUrl || o.linkUrl || '',
          destinationType: o.destinationType || (idMatch?.destinationType) || 'article',
          workflowType,
          targetPassage: o.targetPassage || '',
          suggestedAnchor: o.suggestedAnchor || '',
          proposedText: o.proposedText || undefined,
          contextSentence: o.contextSentence || '',
          readerBenefit: o.readerBenefit || o.reason || 'Contextual reference providing value to the reader.',
          relevanceRationale: o.relevanceRationale || o.seoRationale || 'Matches contextual relevance.',
          confidence,
          verificationNotes: verificationNotes || undefined,
          status: 'pending',
          
          // Legacy mappings
          reason: o.readerBenefit || o.reason,
          seoRationale: o.relevanceRationale || o.seoRationale,
          previewText: workflowType === 'suggest_new' 
            ? o.targetPassage 
            : (o.proposedText || o.targetPassage),
          relevance: confidence === 'high' ? 'high' : 'medium'
        };
      });

      return jsonResponse({
        ok: true,
        opportunities: sanitized,
        rationale: parsed.rationale || 'Evaluated link opportunities.',
        modelUsed,
      });
    }

    // 4. POST /api/gemini/find-citations
    if (pathname === '/api/gemini/find-citations' && request.method === 'POST') {
      const ai = getAi();
      const { documentContent = '', studies = [], projectTitle = '' } = body;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.6-flash');

      if (!documentContent || !String(documentContent).trim()) {
        return jsonResponse({ ok: true, recommendations: [], gaps: [], rationale: 'Empty document provided.' });
      }

      const systemInstruction = `You are Senior Research Verification Editor for "Science of Gifts".
Your mission is strict, evidence-first research verification. Precision and defensibility always take priority over quantity.
Returning 0 recommendations is completely valid and preferred over weak, generic, or forced topical matches.

STRICT EVIDENCE RULES:
1. A study being broadly about the same topic as the article is NEVER sufficient reason to cite an existing sentence.
2. Distinguish two distinct workflows:
   - WORKFLOW A ("workflowType": "cite_existing"):
     Use ONLY when an existing sentence in the article makes a specific factual or empirical claim that is directly substantiated by a specific finding or claim in the study record.
     - "targetPassage" MUST be copied verbatim from the article (an exact, complete sentence that appears once in the article).
     - "isVerifiedMatch" MUST be true ONLY when the study directly supports that exact sentence's claim.
   - WORKFLOW B ("workflowType": "draft_passage"):
     Use when a study in the library has genuine empirical findings relevant to the article's argument, but NO existing sentence in the article states that specific finding yet.
     - Set "workflowType": "draft_passage", "isVerifiedMatch": false, "targetPassage": "".
     - Specify "targetSectionHeading" (the heading in the article where this study's finding belongs) and/or "anchorPassageContext" (an existing sentence after which a new research-backed passage would naturally follow).
     - Provide "proposedPassage": a concise 1-2 sentence editorial passage written in the "Science of Gifts" voice (no em dashes, no markdown, no hype) that accurately states the study's finding without inventing numbers, sample sizes, or conclusions beyond the provided study data.
3. Classify "evidenceType" accurately:
   - "direct_empirical": Direct empirical result measured in the study.
   - "author_interpretation": Study authors' theoretical interpretation.
   - "background_context": General background context (not direct empirical proof of the article's claim).
   - "editorial_suggestion": Editorial synthesis or suggestion.
4. For every recommendation, you MUST populate:
   - "studyId": Exact ID of the study from the provided library list.
   - "relevantFinding": The specific finding or result from the study.
   - "supportingEvidence": Verbatim or close factual evidence from the study's findings, claims, or abstract in the library.
   - "limitationsOrQualifications": Any sample constraints, methodological caveats, or scope differences between the study and the article passage.
   - "confidence": "verified_empirical" | "conceptual_support" | "partial_limitation".
   - "explanation": Clear editorial rationale explaining the exact connection.
5. NEVER invent study findings, statistics, sample sizes, DOIs, or URLs. If a study record has insufficient evidence in the library to verify a match, set "isVerifiedMatch": false and explain what requires verification.

Output ONLY valid JSON matching:
{
  "recommendations": [
    {
      "studyId": "string",
      "workflowType": "cite_existing" | "draft_passage",
      "targetPassage": "string",
      "targetSectionHeading": "string",
      "anchorPassageContext": "string",
      "proposedPassage": "string",
      "relevantFinding": "string",
      "supportingEvidence": "string",
      "limitationsOrQualifications": "string",
      "explanation": "string",
      "confidence": "verified_empirical" | "conceptual_support" | "partial_limitation",
      "evidenceType": "direct_empirical" | "author_interpretation" | "background_context" | "editorial_suggestion",
      "isVerifiedMatch": boolean,
      "verificationNote": "string"
    }
  ],
  "gaps": [{ "claimInArticle": "string", "topicNeeded": "string", "suggestion": "string" }],
  "rationale": "string"
}`;
      const userPrompt = `ARTICLE TITLE: "${projectTitle}"\n\nARTICLE DOCUMENT:\n${documentContent}\n\nRESEARCH LIBRARY STUDIES:\n${JSON.stringify(studies)}`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.1 },
      });

      const parsed = parseModelJson(response.text) || {};
      return jsonResponse({
        ok: true,
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
        rationale: parsed.rationale || 'Completed evidence-first citation verification.',
        modelUsed,
      });
    }

    // 4b. POST /api/gemini/draft-research-passage
    if (pathname === '/api/gemini/draft-research-passage' && request.method === 'POST') {
      const ai = getAi();
      const {
        projectTitle = '',
        documentContent = '',
        study = {},
        targetSectionHeading = '',
        anchorPassageContext = '',
        editorialGuidance = '',
      } = body;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.6-flash');

      if (!study || !study.id || !study.title) {
        return jsonResponse({ ok: false, error: 'A valid research study is required to draft a passage.' }, 400);
      }

      const systemInstruction = `You are Senior Research Editor for "Science of Gifts".
Draft a concise, 1-2 sentence research-backed editorial passage that integrates a specific empirical finding from the provided study into the article.
STRICT RULES:
1. Ground the passage EXCLUSIVELY in the provided study's actual findings, claims, abstract, and methodology.
2. NEVER invent statistics, percentages, sample sizes, dates, or conclusions not explicitly present in the study data.
3. Respect the study's scope and limitations. Qualify claims appropriately when the study is preliminary or context-specific.
4. Write in the "Science of Gifts" house voice: human, specific, civilized, conversational, and unhurried.
5. NEVER use em dashes (—) and NEVER use Markdown syntax (no **, *, #, [link](url)). Output plain editorial prose sentences only.

Return ONLY valid JSON:
{
  "proposedPassage": "1-2 sentences of clean editorial prose stating the research-backed point.",
  "relevantFinding": "The specific finding from the study used in this passage.",
  "supportingEvidence": "The exact evidence from the study record supporting this passage.",
  "limitationsOrQualifications": "Any limitations, sample constraints, or qualifications the writer should keep in mind.",
  "explanation": "Why this passage fits the article and accurately reflects the study.",
  "targetSectionHeading": "Suggested section heading in the article",
  "anchorPassageContext": "Optional existing sentence in the article after which this passage fits best"
}`;

      const userPrompt = `ARTICLE TITLE: "${projectTitle}"
TARGET SECTION: "${targetSectionHeading}"
ANCHOR CONTEXT: "${anchorPassageContext}"
WRITER GUIDANCE: "${editorialGuidance}"

ARTICLE EXCERPT:
${String(documentContent).slice(0, 3500)}

STUDY DATA (AUTHORITATIVE SOURCE — DO NOT INVENT BEYOND THIS):
${JSON.stringify(study, null, 2)}`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.2 },
      });

      const parsed = parseModelJson(response.text);
      if (!parsed || typeof parsed.proposedPassage !== 'string' || !parsed.proposedPassage.trim()) {
        throw new Error('Model did not return a valid research-backed passage');
      }

      return jsonResponse({
        ok: true,
        proposedPassage: parsed.proposedPassage.replace(/—/g, ', ').trim(),
        relevantFinding: parsed.relevantFinding || '',
        supportingEvidence: parsed.supportingEvidence || '',
        limitationsOrQualifications: parsed.limitationsOrQualifications || '',
        explanation: parsed.explanation || '',
        targetSectionHeading: parsed.targetSectionHeading || targetSectionHeading,
        anchorPassageContext: parsed.anchorPassageContext || anchorPassageContext,
        modelUsed,
      });
    }

    // 5. POST /api/gemini/editorial-review
    if (pathname === '/api/gemini/editorial-review' && request.method === 'POST') {
      const ai = getAi();
      const { documentContent = '', selectedText = '', scope = 'all' } = body;
      const textToReview = scope === 'selection' && selectedText ? selectedText : documentContent;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.8-flash');

      if (!textToReview.trim()) {
        throw new Error('No content provided for editorial review');
      }

      const systemInstruction = `You are chief editorial reviewer for "Science of Gifts". Audit text for clichés, em dashes, repetition, clarity, unsupported claims. Return JSON: { "qualitativeSummary": "string", "findings": [{ "category", "severity", "location": { "type", "description" }, "originalText", "explanation", "suggestedAction", "proposedText", "isRuleViolation" }] }`;
      const userPrompt = `TEXT TO REVIEW:\n"""\n${textToReview}\n"""`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.2 },
      });

      const parsed = parseModelJson(response.text);
      if (!parsed || !Array.isArray(parsed.findings)) {
        throw new Error('Model did not return structured editorial findings');
      }

      const findings = parsed.findings.map((f: any, idx: number) => ({
        id: `rf-${Date.now()}-${idx}`,
        category: f.category || 'tone_style',
        severity: f.severity || 'important',
        location: f.location || { type: 'sentence', description: 'Document' },
        originalText: f.originalText || '',
        explanation: f.explanation || 'Editorial review observation.',
        suggestedAction: f.suggestedAction || 'Review passage.',
        proposedText: f.proposedText || undefined,
        status: 'pending',
        isRuleViolation: Boolean(f.isRuleViolation || f.category === 'content_rules'),
        createdAt: new Date().toISOString(),
      }));

      const counts = {
        critical: findings.filter((f: any) => f.severity === 'critical').length,
        important: findings.filter((f: any) => f.severity === 'important').length,
        minor: findings.filter((f: any) => f.severity === 'minor').length,
        suggestion: findings.filter((f: any) => f.severity === 'suggestion').length,
      };

      return jsonResponse({
        ok: true,
        id: `rev-${Date.now()}`,
        reviewedAt: new Date().toISOString(),
        scope,
        qualitativeSummary: parsed.qualitativeSummary || 'Editorial review complete.',
        counts,
        findings,
        modelUsed,
      });
    }

    // 6. POST /api/gemini/quality-control
    if (pathname === '/api/gemini/quality-control' && request.method === 'POST') {
      const ai = getAi();
      const { documentContent = '' } = body;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.7-flash');

      if (!documentContent.trim()) {
        throw new Error('No content provided for quality control audit');
      }

      const systemInstruction = `You are Quality Control auditor for "Science of Gifts". Check factual consistency, cross-product repetition, SEO alignment. Output JSON: { "summary", "findings": [{ "category", "severity", "title", "location", "explanation", "suggestedAction", "targetText", "proposedText" }] }`;
      const userPrompt = `DOCUMENT:\n${documentContent}`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.1 },
      });

      const parsed = parseModelJson(response.text);
      if (!parsed || !Array.isArray(parsed.findings)) {
        throw new Error('Model did not return structured QC findings');
      }

      return jsonResponse({
        ok: true,
        summary: parsed.summary || 'Quality control audit complete.',
        findings: parsed.findings,
        modelUsed,
      });
    }

    // 7. POST /api/gemini/outline
    if (pathname === '/api/gemini/outline' && request.method === 'POST') {
      const ai = getAi();
      const {
        structureType = 'essay',
        customStructureNotes = '',
        projectTitle = 'Untitled',
        brief = {},
        editorialDevelopment = {},
        attachedStudies = [],
        internalLinks = [],
      } = body;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.6-flash');

      const systemInstruction = `You are executive editorial architect for "Science of Gifts". Construct an outline for "${projectTitle}" [Mode: ${structureType}].
Never use em dashes (—) or markdown syntax in section titles.
Output ONLY valid JSON matching:
{
  "structureType": "${structureType}",
  "rationale": "1-2 sentences explaining the intellectual progression of this outline.",
  "outline": [
    {
      "title": "Section or step title",
      "heading": "Optional H2 heading for the article",
      "purpose": "What this section establishes or achieves",
      "mainIdea": "Core argument of this section",
      "develops": "How this section advances the overall thesis",
      "notes": "Editorial guidance, tone notes, or things to avoid",
      "assignedStudyIds": ["optional study IDs from attachedStudies"],
      "assignedClaims": ["optional specific empirical claims to weave into this section"]
    }
  ]
}`;
      const userPrompt = `PROJECT: "${projectTitle}"
STRUCTURE MODE: ${structureType}
${customStructureNotes ? `CUSTOM STRUCTURE NOTES: ${customStructureNotes}\n` : ''}BRIEF:
${JSON.stringify(brief, null, 2)}
${editorialDevelopment?.direction ? `EDITORIAL DIRECTION:\n${JSON.stringify(editorialDevelopment.direction, null, 2)}\n` : ''}${Array.isArray(attachedStudies) && attachedStudies.length > 0 ? `ATTACHED RESEARCH STUDIES:\n${JSON.stringify(attachedStudies.map((s: any) => ({ id: s.id, title: s.title, keyFindings: s.analysis?.whatTheStudyFound || s.keyFindings || [] })))}\n` : ''}${Array.isArray(internalLinks) && internalLinks.length > 0 ? `INTERNAL LINKS:\n${JSON.stringify(internalLinks.slice(0, 15).map((l: any) => ({ id: l.id, title: l.title, url: l.url, preferredAnchor: l.preferredAnchor })))}\n` : ''}Generate a 5-7 section ${structureType} outline now.`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.6 },
      });

      const parsed = parseModelJson(response.text);
      const rawOutline = Array.isArray(parsed) ? parsed : parsed?.outline || parsed?.items;
      if (!Array.isArray(rawOutline) || rawOutline.length === 0) {
        throw new Error('Model did not return structured outline items');
      }

      const formatted = rawOutline.map((item: any, idx: number) => ({
        id: item.id || `outline-${Date.now()}-${idx + 1}`,
        title: String(item.title || `Step ${idx + 1}`).trim(),
        heading: item.heading ? String(item.heading).trim() : undefined,
        purpose: String(item.purpose || item.description || '').trim(),
        mainIdea: String(item.mainIdea || '').trim(),
        develops: String(item.develops || '').trim(),
        description: String(item.description || item.purpose || '').trim(),
        notes: String(item.notes || '').trim(),
        assignedStudyIds: toStringArray(item.assignedStudyIds),
        assignedClaims: toStringArray(item.assignedClaims),
        assignedInternalLinks: Array.isArray(item.assignedInternalLinks) ? item.assignedInternalLinks : [],
        completed: false,
      }));

      return jsonResponse({
        ok: true,
        modelUsed,
        structureType: parsed?.structureType || structureType,
        rationale: parsed?.rationale || 'Constructed intellectual progression.',
        outline: formatted,
      });
    }

    // 8. POST /api/gemini/generate-ideas
    if (pathname === '/api/gemini/generate-ideas' && request.method === 'POST') {
      const ai = getAi();
      const { topic = 'Craft & Gifting', audience = '', goal = 'Informational' } = body;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.6-flash');

      const systemInstruction = `You are editorial strategist for "Science of Gifts". Discover 8-12 distinct, high-intent article concepts for "${topic}". Output JSON: { "ideas": [{ "title", "angle", "whyInteresting", "searchIntent" }] }`;
      const userPrompt = `TOPIC: ${topic}\nAUDIENCE: ${audience}\nGOAL: ${goal}`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.7 },
      });

      const parsed = parseModelJson(response.text);
      const rawIdeas = Array.isArray(parsed) ? parsed : parsed?.ideas;
      if (!Array.isArray(rawIdeas)) {
        throw new Error('Model did not return generated ideas');
      }

      const ideas = rawIdeas.map((item: any, idx: number) => ({
        id: `idea-${Date.now()}-${idx}`,
        title: String(item.title || `Editorial Angle on ${topic}`).replace(/[*_#`]/g, '').trim(),
        angle: String(item.angle || 'An unexplored perspective.').replace(/[*_#`]/g, '').trim(),
        whyInteresting: String(item.whyInteresting || 'Offers fresh insight.').replace(/[*_#`]/g, '').trim(),
        searchIntent: item.searchIntent || goal || 'Informational',
      }));

      return jsonResponse({
        ok: true,
        ideas,
        modelUsed,
      });
    }

    // 9. POST /api/gemini/generate-angles
    if (pathname === '/api/gemini/generate-angles' && request.method === 'POST') {
      const ai = getAi();
      const { idea, projectTitle = '', projectTopic = '', targetAudience = '' } = body;
      const topic = idea?.title || projectTitle || projectTopic || 'Craft, Gifting, and Material Longevity';
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.6-flash');

      const systemInstruction = `You are executive editorial director for "Science of Gifts". Generate 5 distinct, non-formulaic editorial angles for "${topic}". Never use em dashes (—). Output JSON: { "angles": [{ "title", "coreArgument", "whyInteresting", "whatArticleEmphasizes", "possibleTakeaway" }] }`;
      const userPrompt = `TOPIC: ${topic}
${idea?.angle ? `INITIAL SEED ANGLE: ${idea.angle}\n` : ''}${idea?.whyInteresting ? `WHY INTERESTING: ${idea.whyInteresting}\n` : ''}${targetAudience ? `TARGET AUDIENCE: ${targetAudience}\n` : ''}Generate 5 genuinely distinct editorial angles.`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.75 },
      });

      const parsed = parseModelJson(response.text);
      const rawAngles = Array.isArray(parsed) ? parsed : parsed?.angles;
      if (!Array.isArray(rawAngles) || rawAngles.length === 0) {
        throw new Error('Model did not return editorial angles');
      }

      const angles = rawAngles.slice(0, 5).map((a: any, idx: number) => ({
        id: `angle-${Date.now()}-${idx + 1}`,
        title: String(a.title || `Editorial Angle ${idx + 1}`).trim(),
        coreArgument: String(a.coreArgument || '').trim(),
        whyInteresting: String(a.whyInteresting || '').trim(),
        whatArticleEmphasizes: String(a.whatArticleEmphasizes || '').trim(),
        possibleTakeaway: String(a.possibleTakeaway || '').trim(),
        role: 'unassigned',
      }));

      return jsonResponse({ ok: true, angles, modelUsed });
    }

    // 10. POST /api/gemini/create-editorial-brief
    if (pathname === '/api/gemini/create-editorial-brief' && request.method === 'POST') {
      const {
        projectTitle = '',
        idea = {},
        direction = {},
        angles = [],
        attachedStudies = [],
        internalLinks = [],
        styleProfile = null,
        projectInstructions = '',
        writingControls = {},
      } = body;

      const safeAngles = Array.isArray(angles) ? angles : [];
      const inputCheck = validateBriefGenerationInputs({
        projectTitle,
        idea,
        angles: safeAngles,
        direction,
      });
      if (!inputCheck.valid) {
        return jsonResponse({ ok: false, error: inputCheck.error }, 400);
      }

      const ai = getAi();
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.6-flash');

      const primaryAngleObj = safeAngles.find(
        (a: any) => a.id === direction?.primaryAngleId || a.role === 'primary'
      );
      const secondaryAngleObj = safeAngles.find(
        (a: any) => a.id === direction?.secondaryAngleId || a.role === 'secondary'
      );
      const briefMentionObjs = safeAngles.filter(
        (a: any) =>
          (Array.isArray(direction?.briefMentionAngleIds) &&
            direction.briefMentionAngleIds.includes(a.id)) ||
          a.role === 'brief_mention'
      );
      const excludedObjs = safeAngles.filter(
        (a: any) =>
          (Array.isArray(direction?.doNotUseAngleIds) &&
            direction.doNotUseAngleIds.includes(a.id)) ||
          a.role === 'do_not_use'
      );

      const safeStudies = Array.isArray(attachedStudies) ? attachedStudies.filter(Boolean) : [];
      const safeLinks = Array.isArray(internalLinks)
        ? internalLinks.filter((l: any) => l && l.active !== false).slice(0, 20)
        : [];

      const systemInstruction = `You are the executive editorial director for "Science of Gifts", an independent publication dedicated to thoughtful gifting, material craft, tool heritage, and recipient psychology.
Synthesize the article idea, selected editorial angles, editor's custom direction (which has sovereign authority), attached academic research studies, and internal links into a comprehensive, structured Editorial Brief.

STRICT EDITORIAL RULES:
1. Editor's custom direction ("editorsDirection") takes highest precedence over AI-generated angle defaults.
2. Clearly separate empirical facts from attached research studies ("factualContext") vs. editorial synthesis ("editorialInterpretation"). Do NOT invent study findings, DOIs, or statistics.
3. Never use em dashes (—) or markdown syntax in field values.
4. For "references", ONLY include studies from the provided ATTACHED RESEARCH STUDIES list, preserving their exact "studyId", "title", "authors", "publication", "publicationYear", and "doiOrUrl". If no studies are attached, return "references": [].`;

      const userPrompt = `PROJECT TITLE: "${projectTitle}"
ORIGINAL IDEA: ${JSON.stringify(idea || {})}
PRIMARY ANGLE: ${primaryAngleObj ? JSON.stringify(primaryAngleObj) : 'None explicitly selected — derive from Editor Direction and Idea'}
SECONDARY ANGLE: ${secondaryAngleObj ? JSON.stringify(secondaryAngleObj) : 'None selected'}
BRIEF MENTIONS: ${JSON.stringify(briefMentionObjs.map((a: any) => ({ title: a.title, coreArgument: a.coreArgument })))}
DO NOT USE / EXCLUDED ANGLES: ${JSON.stringify(excludedObjs.map((a: any) => ({ title: a.title, coreArgument: a.coreArgument })))}
EDITOR'S CUSTOM DIRECTION (SOVEREIGN AUTHORITY): "${direction?.editorsDirection || ''}"
PROJECT INSTRUCTIONS: "${projectInstructions || ''}"
WRITING CONTROLS: ${JSON.stringify(writingControls || {})}
${styleProfile ? `STYLE PROFILE: "${styleProfile.name}"\n` : ''}ATTACHED RESEARCH STUDIES (${safeStudies.length}):
${JSON.stringify(
  safeStudies.map((s: any) => ({
    studyId: s.id,
    title: s.title,
    authors: s.authors,
    publication: s.publication || s.sourceOrPublisher,
    publicationYear: s.publicationYear || s.publicationDate,
    doiOrUrl: s.doi || s.sourceUrl || s.doiOrUrl,
    findings: s.analysis?.whatTheStudyFound || s.keyFindings || [],
    limitations: s.analysis?.limitations || [],
  }))
)}
AVAILABLE INTERNAL LINKS (${safeLinks.length}):
${JSON.stringify(
  safeLinks.map((l: any) => ({
    title: l.title,
    url: l.url || l.targetUrl,
    preferredAnchor: l.preferredAnchor || l.anchorText,
    topic: l.topic || l.category,
  }))
)}`;

      const briefResponseSchema = {
        type: Type.OBJECT,
        properties: {
          workingTitle: { type: Type.STRING, description: 'Compelling, literary editorial working title' },
          topic: { type: Type.STRING, description: 'Concise core topic summary' },
          audience: { type: Type.STRING, description: 'Specific intended reader profile' },
          searchIntent: { type: Type.STRING, description: "Reader's underlying question or intent" },
          primaryAngle: { type: Type.STRING, description: 'The central pillar and angle of the article (1-2 sentences)' },
          secondaryFocus: { type: Type.STRING, description: 'Supporting layer or secondary angle (or empty string if none)' },
          briefMentions: { type: Type.ARRAY, items: { type: Type.STRING } },
          thingsToAvoid: { type: Type.ARRAY, items: { type: Type.STRING } },
          centralArgument: { type: Type.STRING, description: 'The core intellectual thesis the article argues (2-3 sentences)' },
          keyQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          editorialDirection: { type: Type.STRING, description: 'Synthesized tone, framing, and structural direction' },
          suggestedTakeaway: { type: Type.STRING, description: 'What the reader should feel, understand, or do after reading' },
          factualContext: { type: Type.ARRAY, items: { type: Type.STRING } },
          editorialInterpretation: { type: Type.ARRAY, items: { type: Type.STRING } },
          internalLinkOpportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
          references: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                studyId: { type: Type.STRING },
                title: { type: Type.STRING },
                authors: { type: Type.ARRAY, items: { type: Type.STRING } },
                publication: { type: Type.STRING },
                publicationYear: { type: Type.STRING },
                doiOrUrl: { type: Type.STRING },
                isVerifiedMatch: { type: Type.BOOLEAN },
                verificationNote: { type: Type.STRING },
              },
              required: ['title'],
            },
          },
          styleConsiderations: { type: Type.STRING },
        },
        required: [
          'workingTitle',
          'topic',
          'audience',
          'searchIntent',
          'primaryAngle',
          'centralArgument',
          'keyQuestions',
          'editorialDirection',
          'suggestedTakeaway',
        ],
      };

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: briefResponseSchema,
          temperature: 0.5,
        },
      });

      const parsed = parseModelJson(response.text);
      const validation = validateAndNormalizeEditorialBrief(parsed, {
        projectTitle,
        idea,
        direction,
        angles: safeAngles,
        attachedStudies: safeStudies,
      });

      if (!validation.valid || !validation.brief) {
        throw new Error(validation.error || 'Model did not return structured editorial brief');
      }

      const defaultMentions = briefMentionObjs.map((a: any) => a.title).filter(Boolean);
      const defaultAvoid = excludedObjs
        .map((a: any) => (a.coreArgument ? `${a.title}: ${a.coreArgument}` : a.title))
        .filter(Boolean);

      const brief = {
        ...validation.brief,
        secondaryFocus:
          validation.brief.secondaryFocus ||
          (secondaryAngleObj
            ? `${secondaryAngleObj.title}: ${secondaryAngleObj.coreArgument}`
            : ''),
        briefMentions:
          validation.brief.briefMentions.length > 0
            ? validation.brief.briefMentions
            : defaultMentions,
        thingsToAvoid:
          validation.brief.thingsToAvoid.length > 0
            ? validation.brief.thingsToAvoid
            : defaultAvoid,
      };

      return jsonResponse({ ok: true, brief, modelUsed });
    }

    // 11. POST /api/gemini/analyze-style
    if (pathname === '/api/gemini/analyze-style' && request.method === 'POST') {
      const ai = getAi();
      const { profileName = 'Custom Style Profile', samples = [] } = body;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.8-flash');

      if (!Array.isArray(samples) || samples.length === 0) {
        throw new Error('No writing samples provided for style analysis');
      }

      const systemInstruction = `You are master literary stylist for "Science of Gifts". Dissect writing samples and extract style analysis and reusable instructions for writers. Output JSON: { "summary", "characteristics": [{ "category", "observation", "evidence", "isCommonAcrossSamples" }], "reusableInstructions": [] }`;
      const userPrompt = `PROFILE: "${profileName}"\nSAMPLES:\n${JSON.stringify(samples)}`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.5 },
      });

      const parsed = parseModelJson(response.text);
      if (!parsed || !Array.isArray(parsed.characteristics)) {
        throw new Error('Model did not return style analysis characteristics');
      }

      return jsonResponse({
        ok: true,
        summary: parsed.summary || 'Style analysis completed.',
        characteristics: parsed.characteristics || [],
        commonCharacteristics: parsed.commonCharacteristics || parsed.characteristics.filter((c: any) => c.isCommonAcrossSamples),
        sampleSpecificCharacteristics: parsed.sampleSpecificCharacteristics || parsed.characteristics.filter((c: any) => !c.isCommonAcrossSamples),
        reusableInstructions: toStringArray(parsed.reusableInstructions),
        modelUsed,
      });
    }

    // 12. POST /api/gemini/analyze-study
    if (pathname === '/api/gemini/analyze-study' && request.method === 'POST') {
      const ai = getAi();
      const { study = {} } = body;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.7-flash');

      if (!study || !study.title) {
        throw new Error('Study title and content are required for analysis');
      }

      const systemInstruction = `You are lead research editor for "Science of Gifts". Analyze academic study methodology, findings, and limitations, extracting structured facts and editorial claims.
Output ONLY valid JSON matching:
{
  "analysis": {
    "whatWasStudied": "string",
    "whatTheStudyFound": ["string"],
    "whatItMeans": "string",
    "whatItDoesNotEstablish": ["string"],
    "methodology": "string",
    "limitations": ["string"],
    "editorialUse": ["string"],
    "potentialArticleIdeas": [{ "title": "string", "angle": "string", "whyInteresting": "string", "searchIntent": "string" }]
  },
  "claims": [
    {
      "claimText": "string",
      "claimType": "source_fact" | "editorial_interpretation" | "writing_suggestion",
      "supportedBySource": "string",
      "confidence": "high" | "moderate" | "preliminary",
      "relevantLimitation": "string"
    }
  ]
}`;
      const userPrompt = `STUDY:\n${JSON.stringify(study)}`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.2 },
      });

      const parsed = parseModelJson(response.text);
      const rawAnalysis = parsed?.analysis || parsed;
      if (!rawAnalysis || typeof rawAnalysis !== 'object') {
        throw new Error('Model did not return study analysis');
      }

      const now = new Date().toISOString();
      const analysis = {
        id: rawAnalysis.id || `analysis-${Date.now()}`,
        studyId: study.id || rawAnalysis.studyId || '',
        analyzedAt: now,
        modelUsed,
        whatWasStudied: String(rawAnalysis.whatWasStudied || '').trim(),
        whatTheStudyFound: toStringArray(rawAnalysis.whatTheStudyFound),
        whatItMeans: String(rawAnalysis.whatItMeans || '').trim(),
        whatItDoesNotEstablish: toStringArray(rawAnalysis.whatItDoesNotEstablish),
        methodology: String(rawAnalysis.methodology || study.methodology || '').trim(),
        limitations: toStringArray(rawAnalysis.limitations),
        editorialUse: toStringArray(rawAnalysis.editorialUse),
        potentialArticleIdeas: Array.isArray(rawAnalysis.potentialArticleIdeas)
          ? rawAnalysis.potentialArticleIdeas
          : [],
      };

      const rawClaims = Array.isArray(parsed?.claims) ? parsed.claims : [];
      const claims = rawClaims.map((c: any, idx: number) => ({
        id: c.id || `claim-${Date.now()}-${idx}`,
        studyId: study.id || c.studyId || '',
        studyTitle: study.title || c.studyTitle || '',
        claimText: String(c.claimText || '').trim(),
        claimType: c.claimType || 'source_fact',
        supportedBySource: String(c.supportedBySource || c.evidenceQuote || study.title || '').trim(),
        confidence: c.confidence || 'high',
        relevantLimitation: c.relevantLimitation ? String(c.relevantLimitation).trim() : undefined,
        createdAt: now,
        updatedAt: now,
      }));

      return jsonResponse({
        ok: true,
        analysis,
        claims,
        modelUsed,
      });
    }

    // 13. POST /api/gemini/research-ideas
    if (pathname === '/api/gemini/research-ideas' && request.method === 'POST') {
      const ai = getAi();
      const { studies = [] } = body;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.6-flash');

      if (!Array.isArray(studies) || studies.length === 0) {
        throw new Error('At least one research study is required');
      }

      const systemInstruction = `You are research strategist for "Science of Gifts". Formulate high-intent article concepts from research studies. Output JSON: { "ideas": [{ "title", "angle", "whyInteresting", "searchIntent", "supportingStudies" }] }`;
      const userPrompt = `STUDIES:\n${JSON.stringify(studies)}`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.7 },
      });

      const parsed = parseModelJson(response.text);
      const ideasList = Array.isArray(parsed) ? parsed : parsed?.ideas;
      if (!Array.isArray(ideasList)) {
        throw new Error('Model did not return research ideas');
      }

      return jsonResponse({
        ok: true,
        ideas: ideasList,
        modelUsed,
      });
    }

    // 14. POST /api/gemini/research-outline
    if (pathname === '/api/gemini/research-outline' && request.method === 'POST') {
      const ai = getAi();
      const { project = {}, attachedStudies = [] } = body;
      const modelToUse = resolveModel(body.model || body.modelOverride, 'gemini-3.6-flash');

      if (!Array.isArray(attachedStudies) || attachedStudies.length === 0) {
        throw new Error('Attached studies are required to build a research outline');
      }

      const systemInstruction = `You are editorial architect for "Science of Gifts". Build a research-aware outline mapping studies to sections. Output JSON: { "outline": [{ "id", "title", "description", "assignedStudyIds", "notes" }], "rationale" }`;
      const userPrompt = `PROJECT: "${project.title || 'Article'}"\nSTUDIES:\n${JSON.stringify(attachedStudies)}`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: { systemInstruction, responseMimeType: 'application/json', temperature: 0.6 },
      });

      const parsed = parseModelJson(response.text);
      const outlineList = Array.isArray(parsed) ? parsed : parsed?.outline;
      if (!Array.isArray(outlineList)) {
        throw new Error('Model did not return research outline');
      }

      return jsonResponse({
        ok: true,
        outline: outlineList,
        rationale: parsed?.rationale || 'Mapped research studies to outline sections.',
        modelUsed,
      });
    }

    // 15. POST /api/links/fetch-metadata
    if (pathname === '/api/links/fetch-metadata' && request.method === 'POST') {
      const { url: inputUrl, existingCategories = [] } = body;
      if (!inputUrl || typeof inputUrl !== 'string' || !inputUrl.trim()) {
        throw new Error('URL is required for link metadata');
      }

      let targetUrl = inputUrl.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
      }

      const metadata = await fetchUrlMetadata(targetUrl, existingCategories, apiKey);
      return jsonResponse({
        ok: true,
        metadata,
      });
    }

    // 16. POST /api/products/fetch-metadata
    if (pathname === '/api/products/fetch-metadata' && request.method === 'POST') {
      const { url: inputUrl, guideTopic = '', guideAudience = '' } = body;
      if (!inputUrl || typeof inputUrl !== 'string' || !inputUrl.trim()) {
        throw new Error('Product URL is required');
      }

      let targetUrl = inputUrl.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `https://${targetUrl}`;
      }

      const metadata = await fetchProductUrlMetadata(targetUrl, {
        topic: guideTopic,
        audience: guideAudience,
      });

      return jsonResponse({
        ok: true,
        metadata,
      });
    }


    // 17. POST /api/products/analyze-research
    if (pathname === '/api/products/analyze-research' && request.method === 'POST') {
      const ai = getAi();
      const {
        url: inputUrl,
        modelOverride,
        guideContext = {},
        mockupImages = [],
        productContext = {},
      } = body;

      const targetUrl = typeof inputUrl === 'string' ? inputUrl.trim() : '';
      const validMockupImages = Array.isArray(mockupImages)
        ? mockupImages.filter((img: any) => Boolean(img && img.dataUrl && String(img.dataUrl).trim()))
        : [];

      if (!targetUrl && validMockupImages.length === 0) {
        return jsonResponse(
          {
            ok: false,
            error:
              'Please provide a product URL, upload at least one mockup image, or provide both to analyze.',
          },
          400
        );
      }

      const modelToUse = resolveModel(modelOverride, 'gemini-3.6-flash');

      let extractedUrlFacts: ExtractedUrlPageFacts | null = null;
      if (targetUrl) {
        const fetchRes = await fetch(targetUrl, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        });
        if (!fetchRes.ok) {
          throw new Error(`Could not access product page at ${targetUrl} (Status: ${fetchRes.status})`);
        }
        const pageHtml = await fetchRes.text();
        extractedUrlFacts = extractProductFactsFromHtml(pageHtml, targetUrl);
      }

      const { analysisMode, contents, systemInstruction } = buildProductAnalysisPromptAndParts({
        targetUrl,
        extractedUrlFacts,
        mockupImages: validMockupImages,
        guideContext,
        productContext,
      });

      const { response: geminiRes, modelUsed } = await generateContentWithFallback(
        ai,
        modelToUse,
        {
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }
      );

      const respText = geminiRes.text?.trim() || '';
      const parsed = parseModelJson(respText);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Model did not return structured product research object');
      }

      const normalizedMetadata = normalizeProductResearchOutput({
        analysisMode,
        targetUrl,
        extractedUrlFacts,
        parsedModelJson: parsed,
        productContext,
      });

      return jsonResponse({
        ok: true,
        metadata: normalizedMetadata,
        modelUsed,
      });
    }

    // 17b. POST /api/products/generate-creative-direction
    if (pathname === '/api/products/generate-creative-direction' && request.method === 'POST') {
      const ai = getAi();
      const {
        productName = '',
        productType = '',
        productUrl = '',
        rawProductInfo = '',
        epistemicAnalysis = {},
        productContext = {},
        currentPositioning = {},
        editorCustomGuidance = '',
        regenerateTarget = 'all',
        mockupImages = [],
        modelOverride,
      } = body;

      const requestedModel = resolveModel(modelOverride, 'gemini-3.6-flash');
      const validMockupImages = Array.isArray(mockupImages)
        ? mockupImages.filter((img: any) => Boolean(img && img.dataUrl && String(img.dataUrl).trim()))
        : [];

      const safeTarget: CreativeDirectionRegenerateTarget =
        regenerateTarget === 'titles_only' || regenerateTarget === 'angles_only'
          ? regenerateTarget
          : 'all';

      const { systemInstruction, contents } = buildCreativeDirectionPromptAndParts({
        productName,
        productType,
        productUrl,
        rawProductInfo,
        epistemicAnalysis,
        productContext,
        currentPositioning,
        editorCustomGuidance,
        regenerateTarget: safeTarget,
        mockupImages: validMockupImages,
      });

      const { response: geminiRes, modelUsed } = await generateContentWithFallback(
        ai,
        requestedModel,
        {
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            temperature: 0.65,
          },
        }
      );

      const parsed = parseModelJson(geminiRes.text?.trim() || '');
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Model did not return structured creative direction JSON');
      }

      const creativeDirection = normalizeCreativeDirectionOutput(parsed, {
        productName,
        productType,
        intendedRecipient: productContext?.intendedRecipient,
        visibleText: epistemicAnalysis?.visibleObservations?.visibleText,
        designConcept: epistemicAnalysis?.editorialInferences?.designConcept,
        unverifiedFields: epistemicAnalysis?.verifiedFacts?.unverifiedFields,
        editorCustomGuidance,
        modelUsed,
      });

      return jsonResponse({
        ok: true,
        creativeDirection,
        modelUsed,
      });
    }

    // 18. POST /api/research/extract-pdf
    if (pathname === '/api/research/extract-pdf' && request.method === 'POST') {
      const { pdfBase64, fileName, fileSize } = body;
      if (!pdfBase64) {
        throw new Error('No PDF base64 data provided');
      }

      const binaryString = atob(pdfBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { text, totalPages } = await extractText(bytes);
      const rawText = Array.isArray(text) ? text.join('\n') : String(text || '');
      const cleanText = rawText.trim();

      if (!cleanText || cleanText.length < 20) {
        return jsonResponse({
          success: true,
          ok: true,
          text: '',
          numPages: totalPages || 1,
          fileName,
          fileSize,
          isScannedOrEmpty: true,
          error: 'The uploaded PDF appears to be a scanned image or contains no readable text layer.',
        });
      }

      return jsonResponse({
        success: true,
        ok: true,
        text: cleanText,
        numPages: totalPages || 1,
        fileName,
        fileSize,
        isScannedOrEmpty: false,
      });
    }

    // 19. POST /api/research/lookup-metadata
    if (pathname === '/api/research/lookup-metadata' && request.method === 'POST') {
      const { input } = body;
      if (!input || typeof input !== 'string') {
        throw new Error('Input DOI or URL is required');
      }
      const clean = input.trim();

      // DOI Match
      const doiMatch = clean.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i);
      if (doiMatch) {
        const doi = doiMatch[0];
        const fetchRes = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
          headers: {
            'User-Agent': 'ScienceOfGiftsWritingStudio/1.0 (mailto:editorial@scienceofgifts.com)',
          },
        });
        if (fetchRes.ok) {
          const json: any = await fetchRes.json();
          const item = json.message;
          const title = Array.isArray(item.title) ? item.title[0] : item.title || '';
          const authors = Array.isArray(item.author)
            ? item.author.map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean)
            : [];
          const publication = Array.isArray(item['container-title'])
            ? item['container-title'][0]
            : item['container-title'] || item.publisher || '';
          const publishedYear =
            item.published?.['date-parts']?.[0]?.[0] ||
            item['published-print']?.['date-parts']?.[0]?.[0] ||
            item['published-online']?.['date-parts']?.[0]?.[0] ||
            '';
          const abstract = item.abstract ? item.abstract.replace(/<[^>]+>/g, '').trim() : '';

          return jsonResponse({
            success: true,
            ok: true,
            title,
            authors,
            publication,
            publicationYear: publishedYear,
            doi,
            url: item.URL || `https://doi.org/${doi}`,
            abstract,
          });
        }
      }

      // PubMed Match
      const pubmedMatch = clean.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/i) || (clean.match(/^\d{7,9}$/) ? [null, clean] : null);
      if (pubmedMatch && pubmedMatch[1]) {
        const pmid = pubmedMatch[1];
        const pmRes = await fetch(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`);
        if (pmRes.ok) {
          const pmJson: any = await pmRes.json();
          const record = pmJson.result?.[pmid];
          if (record) {
            const authors = (record.authors || []).map((a: any) => a.name).filter(Boolean);
            const pubDate = record.pubdate || '';
            const yearMatch = pubDate.match(/\d{4}/);
            const doi = record.articleids?.find((id: any) => id.idtype === 'doi')?.value || '';
            return jsonResponse({
              success: true,
              ok: true,
              title: record.title || '',
              authors,
              publication: record.source || '',
              publicationYear: yearMatch ? yearMatch[0] : pubDate,
              doi,
              url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
              abstract: '',
            });
          }
        }
      }

      // Generic URL
      if (clean.startsWith('http://') || clean.startsWith('https://')) {
        const urlRes = await fetch(clean, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        if (urlRes.ok) {
          const html = await urlRes.text();
          const getMeta = (names: string[]) => {
            for (const name of names) {
              const regex = new RegExp(`<meta\\s+(?:name|property)=["']${name}["']\\s+content=["']([^"']+)["']`, 'i');
              const match = html.match(regex);
              if (match && match[1]) return match[1].trim();
            }
            return '';
          };

          const title = getMeta(['citation_title', 'dc.title', 'og:title']) ||
            (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '');
          const author = getMeta(['citation_author', 'dc.creator', 'author']);
          const publication = getMeta(['citation_journal_title', 'citation_publisher', 'og:site_name']);
          const dateStr = getMeta(['citation_publication_date', 'citation_date', 'dc.date']);
          const year = dateStr.match(/\d{4}/)?.[0] || '';
          const doi = getMeta(['citation_doi', 'dc.identifier']);
          const abstract = getMeta(['citation_abstract', 'description', 'og:description']);

          return jsonResponse({
            success: true,
            ok: true,
            title,
            authors: author ? [author] : [],
            publication,
            publicationYear: year,
            doi,
            url: clean,
            abstract,
          });
        }
      }

      return jsonResponse({
        success: false,
        ok: false,
        error: 'Could not automatically resolve metadata for this DOI or URL. Please enter details manually.',
      }, 400);
    }

    // 18. POST /api/gemini/clean-transcript
    if (pathname === '/api/gemini/clean-transcript' && request.method === 'POST') {
      const ai = getAi();
      const { rawTranscript = '', quotedText = '', paragraphContext = '' } = body;
      const modelToUse = resolveModel(body.model, 'gemini-3.5-flash');

      if (!rawTranscript || !String(rawTranscript).trim()) {
        return jsonResponse({ ok: false, error: 'Empty transcript provided for cleanup.' }, 400);
      }

      const systemInstruction = `You are an editorial transcription assistant for "Science of Gifts".
Your ONLY job is to clean up a spoken voice-note transcript in which an editor or author is describing a change they want to make to a selected passage in an article.
STRICT RULES:
1. Remove speech fillers ("um", "uh", "er", "ah", "you know", "I mean", conversational "like"), stutters, and false starts.
2. Fix obvious speech-to-text transcription errors (especially words appearing in the selected passage), punctuation, and capitalization for clear readability.
3. STRICTLY PRESERVE THE SPEAKER'S EXACT INTENT, MEANING, AND QUALIFICATIONS (such as "maybe", "if needed", "keep the second sentence", etc.).
4. NEVER invent new requirements, NEVER rewrite the article passage itself, and NEVER change what the speaker asked for.
Return ONLY valid JSON: { "cleanedTranscript": "string" }`;

      const userPrompt = `SELECTED PASSAGE IN ARTICLE:\n"""\n${quotedText}\n"""\n${
        paragraphContext ? `CONTAINING PARAGRAPH:\n"""\n${paragraphContext}\n"""\n` : ''
      }RAW SPOKEN TRANSCRIPT:\n"""\n${rawTranscript}\n"""`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: userPrompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const text = response.text?.trim() || '{}';
      let parsed: any = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {}
        }
      }

      const cleanedTranscript = String(parsed.cleanedTranscript || rawTranscript).trim();
      return jsonResponse({
        ok: true,
        cleanedTranscript,
        modelUsed,
      });
    }

    // 19. POST /api/gemini/transcribe-note
    if (pathname === '/api/gemini/transcribe-note' && request.method === 'POST') {
      const ai = getAi();
      const { audioBase64 = '', mimeType = 'audio/webm', quotedText = '', paragraphContext = '' } = body;
      const modelToUse = resolveModel(body.model, 'gemini-3.5-flash');

      if (!audioBase64 || !String(audioBase64).trim()) {
        return jsonResponse({ ok: false, error: 'No audio data provided for transcription.' }, 400);
      }

      const systemInstruction = `You are an editorial voice-note transcriber for "Science of Gifts".
Transcribe the user's spoken editing note about the selected article passage.
Provide:
1. "rawTranscript": The verbatim transcription of what the speaker said.
2. "cleanedTranscript": A cleaned version that removes speech fillers ("um", "uh", "er", "you know"), stutters, and false starts, fixes punctuation and obvious speech-to-text errors, while strictly preserving the speaker's exact editing instruction and qualifications without inventing anything.
If the audio is silent or unintelligible, return empty strings for both fields.
Return ONLY valid JSON: { "rawTranscript": "string", "cleanedTranscript": "string" }`;

      const promptText = `SELECTED PASSAGE IN ARTICLE:\n"""\n${quotedText}\n"""\n${
        paragraphContext ? `CONTAINING PARAGRAPH:\n"""\n${paragraphContext}\n"""\n` : ''
      }Transcribe and clean the attached voice editing note.`;

      const { response, modelUsed } = await generateContentWithFallback(ai, modelToUse, {
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: String(audioBase64),
                  mimeType: String(mimeType || 'audio/webm'),
                },
              },
              { text: promptText },
            ],
          },
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const text = response.text?.trim() || '{}';
      let parsed: any = {};
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
          } catch {}
        }
      }

      const rawTranscript = String(parsed.rawTranscript || '').trim();
      const cleanedTranscript = String(parsed.cleanedTranscript || rawTranscript).trim();

      return jsonResponse({
        ok: true,
        rawTranscript,
        cleanedTranscript,
        modelUsed,
      });
    }

    // Route Not Found
    return jsonResponse({ ok: false, error: `Route ${pathname} not found` }, 404);
  } catch (err: any) {
    console.error(`Error processing endpoint ${pathname}:`, err);
    return jsonResponse({ ok: false, error: err?.message || 'Server execution failed' }, 500);
  }
}

/**
 * Authoritative Edge Worker entry point
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    // Route API requests directly
    if (pathname.startsWith('/api/') || pathname === '/api') {
      return handleApiRequest(request, env);
    }

    // Serve static assets via env.ASSETS for all other requests
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    return new Response('Assets binding unavailable', { status: 500 });
  },
};
