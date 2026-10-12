/**
 * Science of Gifts - Editorial Draft Package & External Model Export Service
 * Assembles project brief, editorial direction, outline progression, empirical research,
 * internal links, distilled style characteristics, and hard constraints into a production-grade
 * handoff package ready for ChatGPT, Claude, or other advanced writing models.
 */

import { WritingProject, OutlineItem } from '../types/project';
import {
  EditorialDraftPackage,
  EditorialDraftPackageSection,
  EditorialDraftPackageStudy,
  EditorialDraftPackageLink,
  EditorialDraftPackageStyleGuidance,
  EditorialDraftPackageProjectGuidance,
  ResearchStudy,
  ResearchClaim,
} from '../types/research';
import { StyleProfile, StyleCharacteristic } from '../types/styleReference';
import { InternalLink } from '../types/internalLink';
import { storage } from './storage';

export interface DraftPackageExportOptions {
  modelTarget?: 'chatgpt' | 'claude' | 'generic';
  targetWordCount?: number;
  includeStyleCharacteristics?: boolean;
  includeResearchLimitations?: boolean;
  includeInternalLinkDirectives?: boolean;
  includeHardConstraints?: boolean;
  customEditorNotes?: string;
}

export class DraftPackageService {
  /**
   * Automatically assemble the complete Editorial Draft Package from project state & storage
   */
  public assembleDraftPackage(
    project: WritingProject,
    options?: DraftPackageExportOptions
  ): EditorialDraftPackage {
    const nowIso = new Date().toISOString();

    // 1. Resolve Upstream Brief & Editorial Direction
    const structuredBrief = project.editorialDevelopment?.brief;
    const legacyBrief = project.brief;
    const direction = project.editorialDevelopment?.direction;
    const angles = project.editorialDevelopment?.angles || [];

    const primaryAngleObj = angles.find((a) => a.id === direction?.primaryAngleId || a.role === 'primary');
    const secondaryAngleObj = angles.find((a) => a.id === direction?.secondaryAngleId || a.role === 'secondary');
    const briefMentionsObjs = angles.filter((a) =>
      direction?.briefMentionAngleIds?.includes(a.id) || a.role === 'brief_mention'
    );
    const doNotUseObjs = angles.filter((a) =>
      direction?.doNotUseAngleIds?.includes(a.id) || a.role === 'do_not_use'
    );

    // 2. Resolve Outline & Structure
    const structureType = project.outlineStructure || project.outlineMetadata?.structureType || 'essay';
    const editorialRationale = project.outlineRationale || project.outlineMetadata?.editorialRationale || '';

    // 3. Resolve Research Studies & Claims
    const allStoredStudies: ResearchStudy[] = storage.getResearchStudies();
    const attachedStudyIds = new Set<string>([
      ...(project.attachedStudyIds || []),
      ...(project.outline || []).flatMap((o) => o.assignedStudyIds || []),
    ]);

    const attachedStudies: ResearchStudy[] = allStoredStudies.filter((s) => attachedStudyIds.has(s.id));

    // Map studies into package
    const allClaims: ResearchClaim[] = storage.getResearchClaims() || [];
    const packagedStudies: EditorialDraftPackageStudy[] = attachedStudies.map((study) => {
      const claims: ResearchClaim[] = allClaims.filter((c) => c.studyId === study.id);
      const relevantSections = (project.outline || [])
        .filter((sec) => (sec.assignedStudyIds || []).includes(study.id))
        .map((sec) => sec.title);

      const authorsStr = Array.isArray(study.authors) && study.authors.length > 0
        ? study.authors.join(', ')
        : (typeof study.authors === 'string' && study.authors ? study.authors : undefined);

      const pubYear = study.publicationYear || (study as any).year || undefined;
      const citation = `${authorsStr || 'Author'}${pubYear ? ` (${pubYear})` : ''}${study.publication ? `, ${study.publication}` : ''}`;

      const keyFindings = study.analysis?.whatTheStudyFound && study.analysis.whatTheStudyFound.length > 0
        ? study.analysis.whatTheStudyFound
        : study.keyFindings || [];

      const limitations = study.analysis?.limitations && study.analysis.limitations.length > 0
        ? study.analysis.limitations
        : [];

      const studyUrl = study.doiOrUrl || study.doi || undefined;

      return {
        studyId: study.id,
        title: study.title,
        authors: Array.isArray(study.authors) ? study.authors : (study.authors ? [study.authors] : undefined),
        publicationYear: pubYear,
        publication: study.publication || undefined,
        url: studyUrl,
        citation,
        keyFindings,
        supportedClaims: claims.map((c) => ({
          text: c.claimText,
          type: c.claimType || 'empirical',
          confidence: c.confidence || 'high',
          limitation: c.relevantLimitation || undefined,
        })),
        limitations,
        articleRelevance: study.analysis?.whatItMeans || study.summary || 'Empirical evidence for article claims.',
        whereToUse: relevantSections.length > 0 ? `Used in: ${relevantSections.join('; ')}` : undefined,
      };
    });

    // 4. Resolve Internal Links
    const allInternalLinks: InternalLink[] = storage.getInternalLinks();
    const assignedLinkUrls = new Set<string>();
    (project.outline || []).forEach((sec) => {
      const secLinks = sec.assignedInternalLinks || (sec as any).assignedLinks || [];
      secLinks.forEach((l: any) => assignedLinkUrls.add(l.url));
    });

    // Gather links assigned to outline or relevant to this project
    const relevantLinks: InternalLink[] = allInternalLinks.filter((l) => assignedLinkUrls.has(l.url));
    // If fewer than 4 links assigned, supplement with top high-priority links
    if (relevantLinks.length < 4) {
      allInternalLinks.forEach((l) => {
        if (relevantLinks.length < 5 && !relevantLinks.some((rl) => rl.url === l.url)) {
          relevantLinks.push(l);
        }
      });
    }

    const packagedLinks: EditorialDraftPackageLink[] = relevantLinks.map((l) => {
      const associatedSections = (project.outline || [])
        .filter((sec) => {
          const secLinks = sec.assignedInternalLinks || (sec as any).assignedLinks || [];
          return secLinks.some((al: any) => al.url === l.url);
        })
        .map((sec) => sec.title);

      return {
        targetTitle: l.title,
        url: l.url,
        description: l.description || undefined,
        topic: l.category || undefined,
        suggestedAnchor: l.preferredAnchor || l.title,
        suggestedContext: l.description || l.notes || undefined,
        relevantSection: associatedSections.length > 0 ? associatedSections.join(', ') : undefined,
        reason: l.notes || 'Natural editorial cross-reference opportunity.',
      };
    });

    // 5. Packaged Outline Sections
    const packagedSections: EditorialDraftPackageSection[] = (project.outline || []).map((sec) => {
      const secStudies = (sec.assignedStudyIds || [])
        .map((id) => packagedStudies.find((s) => s.studyId === id))
        .filter(Boolean) as EditorialDraftPackageStudy[];

      const secInternalLinks = sec.assignedInternalLinks || (sec as any).assignedLinks || [];
      const secLinks = secInternalLinks.map((l: any) => ({
        id: l.id,
        title: l.title,
        url: l.url,
        targetAnchor: l.targetAnchor,
        context: l.context || l.relevanceReason,
      }));

      return {
        id: sec.id,
        title: sec.title,
        heading: sec.heading || undefined,
        description: sec.description || undefined,
        purpose: sec.purpose || sec.description || undefined,
        mainIdea: sec.mainIdea || undefined,
        develops: sec.develops || undefined,
        notes: sec.notes || undefined,
        assignedStudies: secStudies.map((s) => ({
          id: s.studyId,
          title: s.title,
          citation: s.citation,
          authors: s.authors,
          year: s.publicationYear,
          url: s.url,
          keyFindings: s.keyFindings.slice(0, 2),
        })),
        assignedLinks: secLinks,
      };
    });

    // 6. Resolve Applied Style Profile & Distilled Characteristics
    let styleGuidance: EditorialDraftPackageStyleGuidance | undefined = undefined;
    const profileId = project.styleProfileId;
    let styleProfile: StyleProfile | null = profileId ? storage.getStyleProfile(profileId) : null;
    if (!styleProfile) {
      // Find active profile
      styleProfile = storage.getStyleProfiles().find((p) => p.isActive) || null;
    }

    if (styleProfile) {
      const rawCharacteristics: StyleCharacteristic[] = [
        ...(styleProfile.latestAnalysis?.commonCharacteristics || []),
        ...(styleProfile.latestAnalysis?.characteristics || []),
      ];

      // Deduplicate characteristics by category/observation
      const uniqueMap = new Map<string, StyleCharacteristic>();
      rawCharacteristics.forEach((c) => {
        const key = `${c.category}:${c.observation.slice(0, 30)}`;
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, c);
        }
      });

      let distilledList = Array.from(uniqueMap.values()).map((c) => ({
        category: c.category,
        observation: c.observation,
        evidence: c.evidence || undefined,
      }));

      // If no analyzed characteristics yet, provide curated Science of Gifts distilled characteristics
      if (distilledList.length === 0) {
        distilledList = [
          {
            category: 'Sentence Rhythm',
            observation: 'Varied cadence with deliberate, measured pacing. Balances expansive reflective clauses with sharp, declarative epigrams.',
            evidence: undefined,
          },
          {
            category: 'Vocabulary',
            observation: 'Nuanced, precise, and tactile. Favors sensory descriptions of physical craftsmanship (patina, grain, heft) over generic praise.',
            evidence: undefined,
          },
          {
            category: 'Tone & Formality',
            observation: 'Intellectually rigorous yet intimately conversational. Treats the reader as an observant, thoughtful equal.',
            evidence: undefined,
          },
          {
            category: 'Use of Evidence',
            observation: 'Weaves sociological and psychological findings into human narratives rather than treating research as sterile data tables.',
            evidence: undefined,
          },
          {
            category: 'Avoidance of Tropes',
            observation: 'Complete absence of marketing superlatives, hollow gift-guide hype, and breathless shopping jargon.',
            evidence: undefined,
          },
        ];
      }

      // Collect user instructions & generated instructions
      const activeInstructions = styleProfile.hasUserEdited && styleProfile.userEditedInstructions.length > 0
        ? styleProfile.userEditedInstructions
        : styleProfile.generatedInstructions;

      styleGuidance = {
        profileName: styleProfile.name,
        description: styleProfile.description || 'Editorial voice characterized by intellectual warmth and tactile observation.',
        distilledCharacteristics: distilledList,
        reusableInstructions: activeInstructions,
      };
    }

    // 7. Resolve Project Guidance & Hard Constraints
    const hardConstraints: string[] = [
      "Never open with cliches like 'In a world where...', 'Gift giving is an art', or 'Whether you are looking for...'.",
      "Do not use marketing hyperbole ('must-have', 'game-changer', 'testament', 'tapestry', 'delve', 'more than just a gift').",
      "Honor empirical study claims strictly; do not exaggerate findings or invent statistical numbers.",
      "Integrate internal link suggestions naturally where context genuinely calls for them, rather than inserting artificial link sentences.",
      "Maintain the specified intellectual progression without rushing to premature conclusions.",
    ];

    const contentRules = project.contentRules || [];
    const activeRules = contentRules.filter((r) => r.enabled).map((r) => r.rule);
    if (activeRules.length > 0) {
      hardConstraints.push(...activeRules);
    }

    const projectGuidance: EditorialDraftPackageProjectGuidance = {
      tone: project.writingControls?.tone || 'editorial',
      targetWordCount: options?.targetWordCount || parseInt(project.writingControls?.wordCountTarget || '', 10) || (structureType === 'essay' ? 1800 : 1500),
      editorialGuidance: project.brief?.keyPoints?.join('\n') || structuredBrief?.centralArgument || '',
      projectInstructions: project.projectInstructions ? [project.projectInstructions] : [],
      hardConstraints,
      bannedTerms: [],
      requiredTerms: [],
    };

    // 8. Build Article Metadata Block
    const articleTitle = project.title || structuredBrief?.workingTitle || 'Untitled Editorial';
    const topic = structuredBrief?.topic || project.brief?.purpose || project.articleMeta?.targetKeyword || '';
    const audience = structuredBrief?.audience || project.brief?.audience || project.articleMeta?.audience || 'Thoughtful, discerning readers';
    const searchIntent = structuredBrief?.searchIntent || project.articleMeta?.searchIntent || 'Editorial investigation';

    // 9. Generate Master Markdown Document & ChatGPT Master Prompt
    const markdownExport = this.generateMarkdownExport({
      articleTitle,
      topic,
      audience,
      searchIntent,
      project,
      structuredBrief,
      legacyBrief,
      primaryAngleObj,
      secondaryAngleObj,
      briefMentionsObjs,
      doNotUseObjs,
      direction,
      structureType,
      editorialRationale,
      packagedSections,
      packagedStudies,
      packagedLinks,
      styleGuidance,
      projectGuidance,
    });

    const chatGptPrompt = this.generateChatGptMasterPrompt({
      articleTitle,
      topic,
      audience,
      searchIntent,
      project,
      structuredBrief,
      primaryAngleObj,
      secondaryAngleObj,
      briefMentionsObjs,
      doNotUseObjs,
      direction,
      structureType,
      editorialRationale,
      packagedSections,
      packagedStudies,
      packagedLinks,
      styleGuidance,
      projectGuidance,
      options,
    });

    // 10. Generate Step-by-Step / Progressive Section Prompts
    const sectionPrompts = packagedSections.map((sec, idx) => ({
      sectionIndex: idx + 1,
      title: sec.title,
      prompt: this.generateSectionDraftingPrompt(
        idx,
        sec,
        packagedSections,
        {
          articleTitle,
          structuredBrief,
          styleGuidance,
          projectGuidance,
          allStudies: packagedStudies,
          allLinks: packagedLinks,
        }
      ),
    }));

    return {
      generatedAt: nowIso,
      article: {
        title: articleTitle,
        topic,
        type: project.type,
        searchIntent,
        audience,
        centralArgument: structuredBrief?.centralArgument || legacyBrief?.purpose,
        purpose: structuredBrief?.topic || legacyBrief?.purpose,
        deck: project.articleMeta?.standfirst || structuredBrief?.primaryAngle,
        standfirst: project.articleMeta?.standfirst || structuredBrief?.primaryAngle,
        readerLearns: legacyBrief?.readerLearns,
        readerFeels: legacyBrief?.readerFeels,
        keyPoints: legacyBrief?.keyPoints,
        thingsToAvoid: structuredBrief?.thingsToAvoid || legacyBrief?.thingsToAvoid,
      },
      editorialDirection: {
        primaryAngle: primaryAngleObj ? `${primaryAngleObj.title}: ${primaryAngleObj.coreArgument}` : structuredBrief?.primaryAngle,
        secondaryFocus: secondaryAngleObj ? `${secondaryAngleObj.title}: ${secondaryAngleObj.coreArgument}` : structuredBrief?.secondaryFocus,
        briefMentions: briefMentionsObjs.map((m) => `${m.title}: ${m.coreArgument}`),
        doNotFocusOn: doNotUseObjs.map((d) => `${d.title} (Editor instructed: do not pursue)`),
        editorsDirection: direction?.editorsDirection || structuredBrief?.editorialDirection,
        centralArgument: structuredBrief?.centralArgument,
        keyQuestions: structuredBrief?.keyQuestions,
        intendedTakeaway: structuredBrief?.suggestedTakeaway,
        factualContext: structuredBrief?.factualContext,
        editorialInterpretation: structuredBrief?.editorialInterpretation,
      },
      outline: {
        structureType,
        editorialRationale,
        sections: packagedSections,
      },
      research: packagedStudies,
      internalLinks: packagedLinks,
      styleGuidance,
      projectGuidance,
      editorialNotes: {
        pointsToEmphasize: [
          primaryAngleObj?.whatArticleEmphasizes || 'Material durability & tactile memory',
          'Human relational depth over transaction',
          'Careful empirical grounding',
        ],
        thingsToAvoid: [
          ...(structuredBrief?.thingsToAvoid || []),
          'Superficial luxury consumerism',
          'Generic AI introductory throat-clearing',
        ],
        unresolvedQuestions: structuredBrief?.keyQuestions || [],
      },
      markdownExport,
      chatGptPrompt,
      sectionPrompts,
    };
  }

  /**
   * Generates formatted Markdown export of the entire draft package
   */
  private generateMarkdownExport(data: any): string {
    const {
      articleTitle,
      topic,
      audience,
      searchIntent,
      project,
      structuredBrief,
      primaryAngleObj,
      secondaryAngleObj,
      briefMentionsObjs,
      doNotUseObjs,
      direction,
      structureType,
      editorialRationale,
      packagedSections,
      packagedStudies,
      packagedLinks,
      styleGuidance,
      projectGuidance,
    } = data;

    let md = `# EDITORIAL DRAFT PACKAGE\n`;
    md += `**Working Title:** ${articleTitle}\n`;
    md += `**Topic:** ${topic || 'Not specified'}\n`;
    md += `**Audience:** ${audience}\n`;
    md += `**Search Intent:** ${searchIntent}\n`;
    md += `**Structure Type:** ${structureType.toUpperCase()}\n`;
    md += `**Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;
    md += `---\n\n`;

    // 1. EDITORIAL DIRECTION
    md += `## 1. EDITORIAL DIRECTION & BRIEF\n\n`;
    if (primaryAngleObj) {
      md += `### Primary Angle\n**${primaryAngleObj.title}**\n${primaryAngleObj.coreArgument}\n`;
      if (primaryAngleObj.whatArticleEmphasizes) {
        md += `*Emphasis:* ${primaryAngleObj.whatArticleEmphasizes}\n`;
      }
      md += `\n`;
    } else if (structuredBrief?.primaryAngle) {
      md += `### Primary Angle\n${structuredBrief.primaryAngle}\n\n`;
    }

    if (secondaryAngleObj) {
      md += `### Secondary Focus\n**${secondaryAngleObj.title}**\n${secondaryAngleObj.coreArgument}\n\n`;
    } else if (structuredBrief?.secondaryFocus) {
      md += `### Secondary Focus\n${structuredBrief.secondaryFocus}\n\n`;
    }

    if (briefMentionsObjs.length > 0) {
      md += `### Brief Mentions\n`;
      briefMentionsObjs.forEach((b: any) => {
        md += `- **${b.title}:** ${b.coreArgument}\n`;
      });
      md += `\n`;
    }

    if (doNotUseObjs.length > 0) {
      md += `### Do Not Pursue / Avoid\n`;
      doNotUseObjs.forEach((d: any) => {
        md += `- **${d.title}:** Explicitly ruled out during editorial selection.\n`;
      });
      md += `\n`;
    }

    if (structuredBrief?.centralArgument) {
      md += `### Central Argument (Thesis)\n${structuredBrief.centralArgument}\n\n`;
    }

    if (structuredBrief?.keyQuestions && structuredBrief.keyQuestions.length > 0) {
      md += `### Key Questions the Article Must Answer\n`;
      structuredBrief.keyQuestions.forEach((q: string, i: number) => {
        md += `${i + 1}. ${q}\n`;
      });
      md += `\n`;
    }

    if (direction?.editorsDirection || structuredBrief?.editorialDirection) {
      md += `### Editor's Direction\n${direction?.editorsDirection || structuredBrief?.editorialDirection}\n\n`;
    }

    if (structuredBrief?.suggestedTakeaway) {
      md += `### Intended Takeaway\n${structuredBrief.suggestedTakeaway}\n\n`;
    }

    // 2. INTELLECTUAL PROGRESSION OUTLINE
    md += `## 2. INTELLECTUAL PROGRESSION OUTLINE (${structureType.toUpperCase()})\n\n`;
    if (editorialRationale) {
      md += `*Editorial Rationale:* ${editorialRationale}\n\n`;
    }

    packagedSections.forEach((sec: EditorialDraftPackageSection, idx: number) => {
      md += `### Part ${idx + 1}: ${sec.title}\n`;
      if (sec.heading) md += `**Heading:** ${sec.heading}\n\n`;
      if (sec.purpose) md += `**Purpose:** ${sec.purpose}\n\n`;
      if (sec.mainIdea) md += `**Main Idea:** ${sec.mainIdea}\n\n`;
      if (sec.develops) md += `**What this develops:** ${sec.develops}\n\n`;
      if (sec.notes) md += `**Editorial Notes:** ${sec.notes}\n\n`;

      if (sec.assignedStudies && sec.assignedStudies.length > 0) {
        md += `**Assigned Empirical Research:**\n`;
        sec.assignedStudies.forEach((as) => {
          md += `- ${as.title} (${as.citation})\n`;
        });
        md += `\n`;
      }

      if (sec.assignedLinks && sec.assignedLinks.length > 0) {
        md += `**Contextual Internal Links:**\n`;
        sec.assignedLinks.forEach((al) => {
          md += `- [${al.targetAnchor || al.title}](${al.url})${al.context ? ` — *Context:* ${al.context}` : ''}\n`;
        });
        md += `\n`;
      }
      md += `---\n\n`;
    });

    // 3. RESEARCH REPOSITORY & EMPIRICAL EVIDENCE
    md += `## 3. RESEARCH REPOSITORY & EMPIRICAL EVIDENCE\n\n`;
    if (packagedStudies.length === 0) {
      md += `*No empirical studies formally attached. Ground claims in general anthropological and psychological observations without inventing citations.*\n\n`;
    } else {
      packagedStudies.forEach((study: EditorialDraftPackageStudy, idx: number) => {
        md += `### Study ${idx + 1}: ${study.title}\n`;
        md += `- **Citation:** ${study.citation}\n`;
        if (study.url) md += `- **Source URL:** ${study.url}\n`;
        if (study.whereToUse) md += `- **Role in Article:** ${study.whereToUse}\n`;
        md += `- **Editorial Relevance:** ${study.articleRelevance}\n\n`;

        if (study.keyFindings.length > 0) {
          md += `**Key Findings:**\n`;
          study.keyFindings.forEach((kf) => (md += `- ${kf}\n`));
          md += `\n`;
        }

        if (study.supportedClaims.length > 0) {
          md += `**Supported Claims:**\n`;
          study.supportedClaims.forEach((sc) => {
            md += `- [${sc.type.toUpperCase()}] "${sc.text}" (Confidence: ${sc.confidence})${sc.limitation ? ` — *Note:* ${sc.limitation}` : ''}\n`;
          });
          md += `\n`;
        }

        if (study.limitations.length > 0) {
          md += `**Known Limitations (Do Not Overstate):**\n`;
          study.limitations.forEach((lim) => (md += `- ${lim}\n`));
          md += `\n`;
        }
      });
    }

    // 4. INTERNAL LINK OPPORTUNITIES
    md += `## 4. INTERNAL LINK OPPORTUNITIES\n\n`;
    if (packagedLinks.length === 0) {
      md += `*No internal links specified.*\n\n`;
    } else {
      packagedLinks.forEach((link: EditorialDraftPackageLink) => {
        md += `- **[${link.suggestedAnchor}](${link.url})**\n`;
        md += `  - **Article:** ${link.targetTitle}\n`;
        if (link.description) md += `  - **Description:** ${link.description}\n`;
        if (link.suggestedContext) md += `  - **Contextual Trigger:** ${link.suggestedContext}\n`;
        if (link.relevantSection) md += `  - **Assigned Step:** ${link.relevantSection}\n`;
        md += `  - **Purpose:** ${link.reason}\n\n`;
      });
    }

    // 5. STYLE CHARACTERISTICS
    if (styleGuidance) {
      md += `## 5. STYLE CHARACTERISTICS (${styleGuidance.profileName.toUpperCase()})\n\n`;
      md += `*${styleGuidance.description}*\n\n`;
      styleGuidance.distilledCharacteristics.forEach((c: any) => {
        md += `### ${c.category}\n`;
        md += `${c.observation}\n`;
        if (c.evidence) md += `*Sample Evidence:* "${c.evidence}"\n`;
        md += `\n`;
      });

      if (styleGuidance.reusableInstructions.length > 0) {
        md += `### Author's Explicit Directives\n`;
        styleGuidance.reusableInstructions.forEach((inst: string) => {
          md += `- ${inst}\n`;
        });
        md += `\n`;
      }
    }

    // 6. PROJECT GUIDANCE & HARD CONSTRAINTS
    md += `## 6. PROJECT GUIDANCE & HARD CONSTRAINTS\n\n`;
    md += `- **Target Word Count:** ~${projectGuidance.targetWordCount || 1800} words\n`;
    md += `- **Tone:** ${projectGuidance.tone || 'editorial'}\n\n`;

    md += `### Inviolable Hard Constraints\n`;
    projectGuidance.hardConstraints?.forEach((hc: string) => {
      md += `- ${hc}\n`;
    });
    md += `\n`;

    return md;
  }

  /**
   * Generates the Master ChatGPT/Claude Prompt incorporating the full draft package
   * with professional editorial system instructions.
   */
  private generateChatGptMasterPrompt(data: any): string {
    const {
      articleTitle,
      topic,
      audience,
      searchIntent,
      structuredBrief,
      primaryAngleObj,
      secondaryAngleObj,
      briefMentionsObjs,
      doNotUseObjs,
      direction,
      structureType,
      editorialRationale,
      packagedSections,
      packagedStudies,
      packagedLinks,
      styleGuidance,
      projectGuidance,
      options,
    } = data;

    const targetWords = options?.targetWordCount || projectGuidance?.targetWordCount || (structureType === 'essay' ? 1800 : 1500);

    let prompt = `You are a distinguished senior essayist and editorial features writer for "Science of Gifts", an intellectual publication that explores the psychology, material permanence, cultural rituals, and relational significance of objects and exchanges.\n\n`;
    prompt += `YOUR MISSION:\n`;
    prompt += `Write a complete, publication-ready editorial ${structureType === 'essay' ? 'essay' : 'article'} titled "${articleTitle}".\n`;
    prompt += `Target length: Approximately ${targetWords} words.\n\n`;

    prompt += `CRITICAL EDITORIAL PRINCIPLES:\n`;
    prompt += `1. INTELLECTUAL PROGRESSION OVER GENERIC OUTLINES: Follow the exact step-by-step intellectual progression detailed in the outline below. In essay mode, do NOT treat this as a list of robotic SEO H2 headings; let the narrative and philosophical momentum unfold naturally from one step to the next.\n`;
    prompt += `2. STRICT EMPIRICAL RESEARCH INTEGRITY: Ground all scientific, psychological, or sociological claims in the attached studies. Do NOT fabricate authors, journals, or experimental findings. Acknowledge the stated limitations with nuance—do not sensationalize.\n`;
    prompt += `3. AUTHENTIC STYLE CHARACTERISTICS: Embody the author's voice precisely according to the Distilled Style Characteristics provided below. Match the sentence rhythm, observational specificity, and conversational gravitas.\n`;
    prompt += `4. NATURAL INTERNAL LINK INTEGRATION: Weave the assigned internal links into the prose smoothly using the suggested contextual anchors. Never write awkward SEO sentences like "Click here to read our guide" or force awkward keywords.\n`;
    prompt += `5. ABSOLUTE BAN ON AI CLICHES: Never use generic buzzwords such as "delve", "testament", "tapestry", "in a world where...", "more than just a gift", "game-changer", "must-have", or "whether you're looking for".\n\n`;

    if (options?.customEditorNotes?.trim()) {
      prompt += `EDITOR'S AD-HOC DIRECTIVE FOR THIS DRAFT:\n`;
      prompt += `"${options.customEditorNotes.trim()}"\n\n`;
    }

    prompt += `================================================================================\n`;
    prompt += `EDITORIAL DRAFT PACKAGE SPECIFICATION\n`;
    prompt += `================================================================================\n\n`;

    prompt += `ARTICLE OVERVIEW:\n`;
    prompt += `- Working Title: ${articleTitle}\n`;
    prompt += `- Topic: ${topic}\n`;
    prompt += `- Intended Audience: ${audience}\n`;
    prompt += `- Search Intent: ${searchIntent}\n`;
    prompt += `- Structure Type: ${structureType.toUpperCase()}\n\n`;

    prompt += `EDITORIAL DIRECTION:\n`;
    if (primaryAngleObj) {
      prompt += `- Primary Angle: ${primaryAngleObj.title} — ${primaryAngleObj.coreArgument}\n`;
    } else if (structuredBrief?.primaryAngle) {
      prompt += `- Primary Angle: ${structuredBrief.primaryAngle}\n`;
    }
    if (secondaryAngleObj) {
      prompt += `- Secondary Focus: ${secondaryAngleObj.title} — ${secondaryAngleObj.coreArgument}\n`;
    }
    if (briefMentionsObjs.length > 0) {
      prompt += `- Brief Mentions: ${briefMentionsObjs.map((b: any) => `${b.title} (${b.coreArgument})`).join('; ')}\n`;
    }
    if (doNotUseObjs.length > 0) {
      prompt += `- DO NOT PURSUE: ${doNotUseObjs.map((d: any) => d.title).join(', ')} (explicitly ruled out)\n`;
    }
    if (structuredBrief?.centralArgument) {
      prompt += `- Central Argument: ${structuredBrief.centralArgument}\n`;
    }
    if (structuredBrief?.suggestedTakeaway) {
      prompt += `- Intended Takeaway: ${structuredBrief.suggestedTakeaway}\n`;
    }
    if (direction?.editorsDirection) {
      prompt += `- Editor's Note: ${direction.editorsDirection}\n`;
    }
    prompt += `\n`;

    prompt += `STEP-BY-STEP INTELLECTUAL PROGRESSION:\n`;
    packagedSections.forEach((sec: EditorialDraftPackageSection, idx: number) => {
      prompt += `Step ${idx + 1}: ${sec.title}\n`;
      if (sec.heading) prompt += `  [Suggested Heading: ${sec.heading}]\n`;
      if (sec.purpose) prompt += `  Purpose: ${sec.purpose}\n`;
      if (sec.mainIdea) prompt += `  Main Idea: ${sec.mainIdea}\n`;
      if (sec.develops) prompt += `  Develops: ${sec.develops}\n`;
      if (sec.notes) prompt += `  Editorial Notes: ${sec.notes}\n`;

      if (sec.assignedStudies && sec.assignedStudies.length > 0) {
        prompt += `  Assigned Research: ${sec.assignedStudies.map((s) => `${s.title} (${s.citation})`).join('; ')}\n`;
      }
      if (sec.assignedLinks && sec.assignedLinks.length > 0) {
        prompt += `  Internal Link Target: ${sec.assignedLinks.map((l) => `Anchor: "${l.targetAnchor || l.title}" -> ${l.url}`).join('; ')}\n`;
      }
      prompt += `\n`;
    });

    if (packagedStudies.length > 0) {
      prompt += `RESEARCH EVIDENCE (Strict Citations Only):\n`;
      packagedStudies.forEach((study: EditorialDraftPackageStudy, idx: number) => {
        prompt += `[Study ${idx + 1}] ${study.title}\n`;
        prompt += `  Citation: ${study.citation}\n`;
        if (study.keyFindings.length > 0) {
          prompt += `  Key Findings: ${study.keyFindings.join(' | ')}\n`;
        }
        if (study.supportedClaims.length > 0) {
          prompt += `  Supported Claims: ${study.supportedClaims.map((c) => `"${c.text}"`).join('; ')}\n`;
        }
        if (study.limitations.length > 0) {
          prompt += `  Limitations to Respect: ${study.limitations.join('; ')}\n`;
        }
        prompt += `\n`;
      });
    }

    if (packagedLinks.length > 0) {
      prompt += `INTERNAL LINKS TO WEAVE IN NATURALLY:\n`;
      packagedLinks.forEach((link: EditorialDraftPackageLink) => {
        prompt += `- Link: [${link.suggestedAnchor}](${link.url}) (Article: "${link.targetTitle}") — Context: ${link.suggestedContext || link.reason}\n`;
      });
      prompt += `\n`;
    }

    if (styleGuidance) {
      prompt += `STYLE CHARACTERISTICS TO EMBODY (${styleGuidance.profileName}):\n`;
      styleGuidance.distilledCharacteristics.forEach((c: any) => {
        prompt += `- ${c.category}: ${c.observation}\n`;
      });
      if (styleGuidance.reusableInstructions.length > 0) {
        prompt += `Author Directives:\n`;
        styleGuidance.reusableInstructions.forEach((inst: string) => {
          prompt += `- ${inst}\n`;
        });
      }
      prompt += `\n`;
    }

    prompt += `HARD CONSTRAINTS:\n`;
    (projectGuidance?.hardConstraints || []).forEach((hc: string) => {
      prompt += `- ${hc}\n`;
    });
    prompt += `\n`;

    prompt += `EXECUTION INSTRUCTION:\n`;
    prompt += `Now write the entire article from beginning to end. Deliver the highest-caliber editorial prose you can produce, written with genuine observational warmth, intellectual rigor, and tactile resonance. Begin with the opening observation.`;

    return prompt;
  }

  /**
   * Generates a focused prompt for writing a single outline section
   */
  public generateSectionDraftingPrompt(
    sectionIndex: number,
    section: EditorialDraftPackageSection,
    allSections: EditorialDraftPackageSection[],
    context: {
      articleTitle: string;
      structuredBrief?: any;
      styleGuidance?: EditorialDraftPackageStyleGuidance;
      projectGuidance?: EditorialDraftPackageProjectGuidance;
      allStudies?: EditorialDraftPackageStudy[];
      allLinks?: EditorialDraftPackageLink[];
    }
  ): string {
    const totalSections = allSections.length;
    const isFirst = sectionIndex === 0;
    const isLast = sectionIndex === totalSections - 1;
    const prevSection = sectionIndex > 0 ? allSections[sectionIndex - 1] : null;
    const nextSection = sectionIndex < totalSections - 1 ? allSections[sectionIndex + 1] : null;

    let p = `You are writing Step ${sectionIndex + 1} of ${totalSections} for the Science of Gifts essay: "${context.articleTitle}".\n\n`;

    p += `MASTER ARTICLE THESIS & DIRECTION:\n`;
    p += `Central Argument: ${context.structuredBrief?.centralArgument || 'Refined inquiry into the psychology and material permanence of gifting.'}\n`;
    p += `Target Takeaway: ${context.structuredBrief?.suggestedTakeaway || 'Enduring objects weave gentle maintenance rituals into daily life.'}\n\n`;

    p += `CURRENT STEP TO WRITE:\n`;
    p += `Step ${sectionIndex + 1}: ${section.title}\n`;
    if (section.heading) p += `Heading: ${section.heading}\n`;
    if (section.purpose) p += `Purpose: ${section.purpose}\n`;
    if (section.mainIdea) p += `Main Idea: ${section.mainIdea}\n`;
    if (section.develops) p += `What This Part Develops: ${section.develops}\n`;
    if (section.notes) p += `Editorial Notes: ${section.notes}\n\n`;

    if (prevSection) {
      p += `FLOW CONTINUITY:\n`;
      p += `- Preceding Step: "${prevSection.title}" (Purpose: ${prevSection.purpose || 'Establishes initial premise'})\n`;
      p += `- Pick up the momentum naturally from the preceding thought without repeating its introduction.\n`;
    } else {
      p += `OPENING INSTRUCTION:\n`;
      p += `- Begin with a concrete, specific sensory or situational observation. Avoid throat-clearing summaries or broad generalizations.\n`;
    }

    if (nextSection) {
      p += `- Subsequent Step: "${nextSection.title}" (Lead gracefully into this next phase of the intellectual progression).\n\n`;
    } else {
      p += `- CLOSING INSTRUCTION: Arrive at the article's core insight and end on a resonant, specific closing observation rather than mechanically restating the introduction.\n\n`;
    }

    if (section.assignedStudies && section.assignedStudies.length > 0) {
      p += `ASSIGNED RESEARCH FOR THIS STEP:\n`;
      section.assignedStudies.forEach((as) => {
        p += `- ${as.title} (${as.citation})\n`;
        if (as.keyFindings && as.keyFindings.length > 0) {
          p += `  Key Findings to integrate: ${as.keyFindings.join('; ')}\n`;
        }
      });
      p += `(Do not exaggerate findings. State research accurately with calm authority.)\n\n`;
    }

    if (section.assignedLinks && section.assignedLinks.length > 0) {
      p += `INTERNAL LINKS TO WEAVE IN HERE:\n`;
      section.assignedLinks.forEach((al) => {
        p += `- Contextual Anchor: "${al.targetAnchor || al.title}" -> ${al.url}\n`;
      });
      p += `\n`;
    }

    if (context.styleGuidance) {
      p += `VOICE & CADENCE (${context.styleGuidance.profileName}):\n`;
      context.styleGuidance.distilledCharacteristics.slice(0, 4).forEach((c) => {
        p += `- ${c.category}: ${c.observation}\n`;
      });
      p += `\n`;
    }

    p += `OUTPUT REQUIREMENTS:\n`;
    p += `- Deliver only the prose for this specific step (approximately 250-400 words).\n`;
    p += `- Prohibit AI cliches ('delve', 'testament', 'tapestry', 'more than just a gift').\n`;
    p += `- Output in clean publication-ready Markdown.`;

    return p;
  }
}

export const draftPackageService = new DraftPackageService();
