/**
 * Science of Gifts - Quality Control Engine (Phase 8)
 * Systematic, deterministic checklist verification with AI-assisted contextual checks.
 * Answers: "Is this content complete, compliant, internally consistent, and ready?"
 */

import {
  WritingProject,
  QCResult,
  QCFinding,
  QCCategoryCheck,
  QCOverallStatus,
  QCSeverity,
  QCCategory,
} from '../types/project';
import { extractPlainTextFromHtml, countWords } from '../utils/richText';
import { cleanTrackingParameters, extractUrlsFromHtml } from '../utils/urlUtils';

/**
 * Validates a single URL string for formatting and protocol
 */
export function validateUrl(url: string): { isValid: boolean; issue?: string } {
  if (!url || !url.trim()) {
    return { isValid: false, issue: 'URL is empty' };
  }
  const trimmed = url.trim();
  if (trimmed.includes(' ')) {
    return { isValid: false, issue: 'URL contains accidental whitespace' };
  }
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return { isValid: false, issue: 'Missing protocol (must start with https:// or http://)' };
  }
  try {
    new URL(trimmed);
    return { isValid: true };
  } catch {
    return { isValid: false, issue: 'Malformed URL structure' };
  }
}

/**
 * Run comprehensive deterministic Quality Control checks locally
 */
export function runDeterministicQC(project: WritingProject): {
  categoryChecks: QCCategoryCheck[];
  findings: QCFinding[];
} {
  const findings: QCFinding[] = [];
  const plainText = extractPlainTextFromHtml(project.content || '');
  const wordCount = countWords(project.content || '');
  let idCounter = 1;

  // ==========================================
  // 1. COMPLETENESS CHECK
  // ==========================================
  let completenessIssues = 0;

  if (!project.title || !project.title.trim() || project.title === 'Untitled Project') {
    completenessIssues++;
    findings.push({
      id: `qc-${idCounter++}`,
      category: 'completeness',
      severity: 'critical',
      title: 'Missing Project Title',
      location: 'Project Header',
      explanation: 'The project title is empty or placeholder.',
      suggestedAction: 'Enter a descriptive title for this publication.',
    });
  }

  if (wordCount < 30) {
    completenessIssues++;
    findings.push({
      id: `qc-${idCounter++}`,
      category: 'completeness',
      severity: 'critical',
      title: 'Document Content Missing or Empty',
      location: 'Editor Body',
      explanation: `The draft contains only ${wordCount} words. A complete piece requires developed prose.`,
      suggestedAction: 'Draft or generate the main editorial content.',
    });
  }

  // Type specific completeness
  if (project.type === 'gift_guide') {
    const prods = project.giftGuideMeta?.products || [];
    if (prods.length === 0) {
      completenessIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'completeness',
        severity: 'critical',
        title: 'No Products in Gift Guide',
        location: 'Product Catalog',
        explanation: 'A curated gift guide requires at least one structured product record.',
        suggestedAction: 'Add items to the structured product list.',
      });
    }

    if (project.giftGuideMeta?.settings?.showBuyerAdvice && !project.giftGuideMeta.buyerAdvice?.trim()) {
      completenessIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'completeness',
        severity: 'warning',
        title: 'Buyer Advice Section Enabled but Empty',
        location: 'Guide Sections / Buyer Advice',
        explanation: 'Buyer Advice is enabled in guide settings, but no copy has been authored.',
        suggestedAction: 'Draft the buyer guidance or disable the section in Guide Settings.',
      });
    }

    if (project.giftGuideMeta?.settings?.includeCollectionLink && !project.giftGuideMeta.collectionUrl?.trim()) {
      completenessIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'completeness',
        severity: 'warning',
        title: 'Collection Link Enabled but URL Missing',
        location: 'Guide Info / Collection URL',
        explanation: 'Collection link inclusion is active, but no collection URL has been specified.',
        suggestedAction: 'Add the target collection URL in Guide Info.',
      });
    }
  } else if (project.type === 'product_copy') {
    const meta = project.productCopyMeta;
    if (!meta?.productName?.trim()) {
      completenessIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'completeness',
        severity: 'critical',
        title: 'Missing Product Name',
        location: 'Product Information',
        explanation: 'Product name is required for product copy generation.',
        suggestedAction: 'Fill in the product name.',
      });
    }
    if (!meta?.productType?.trim()) {
      completenessIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'completeness',
        severity: 'warning',
        title: 'Missing Product Category / Type',
        location: 'Product Information / Product Type',
        explanation: 'Specifying the product category helps anchor editorial and SEO framing.',
        suggestedAction: 'Specify product type (e.g. Field Bag, Fountain Pen).',
      });
    }
  }

  // ==========================================
  // 2. OUTLINE COVERAGE CHECK
  // ==========================================
  let outlineIssues = 0;
  if (project.outline && project.outline.length > 0) {
    const missingOutlineSections: string[] = [];
    project.outline.forEach((item) => {
      const cleanTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const docClean = plainText.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanTitle.length > 3 && !docClean.includes(cleanTitle)) {
        missingOutlineSections.push(item.title);
      }
    });

    if (missingOutlineSections.length > 0) {
      outlineIssues = missingOutlineSections.length;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'outline',
        severity: missingOutlineSections.length > 2 ? 'warning' : 'suggestion',
        title: `Outline Sections Not Found in Draft (${missingOutlineSections.length})`,
        location: 'Document Structure',
        explanation: `The following outline section(s) appear absent from the current text: ${missingOutlineSections.slice(0, 3).map((s) => `"${s}"`).join(', ')}${missingOutlineSections.length > 3 ? '...' : ''}.`,
        suggestedAction: 'Verify whether these sections were intentionally omitted or need drafting.',
      });
    }
  }

  // ==========================================
  // 3. WORD COUNT CHECK
  // ==========================================
  let wordCountIssues = 0;
  const targetStr = project.writingControls?.wordCountTarget || project.aiSettings?.wordCountTarget || '';
  if (targetStr && targetStr.trim()) {
    const numbers = targetStr.replace(/,/g, '').match(/\d+/g);
    if (numbers && numbers.length >= 2) {
      const min = parseInt(numbers[0], 10);
      const max = parseInt(numbers[1], 10);
      if (wordCount < min) {
        wordCountIssues++;
        findings.push({
          id: `qc-${idCounter++}`,
          category: 'word_count',
          severity: 'warning',
          title: `Draft Below Target Range (${wordCount} / ${min}-${max} words)`,
          location: 'Document Length',
          explanation: `Current word count of ${wordCount} words is below the target minimum of ${min} words.`,
          suggestedAction: 'Expand key sections with material or contextual details.',
        });
      } else if (wordCount > max * 1.2) {
        wordCountIssues++;
        findings.push({
          id: `qc-${idCounter++}`,
          category: 'word_count',
          severity: 'suggestion',
          title: `Draft Exceeds Target Range (${wordCount} / ${min}-${max} words)`,
          location: 'Document Length',
          explanation: `Current word count of ${wordCount} words exceeds target maximum of ${max} words.`,
          suggestedAction: 'Review for conciseness or tighten repetitive passages.',
        });
      }
    } else if (numbers && numbers.length === 1) {
      const target = parseInt(numbers[0], 10);
      if (wordCount < target * 0.7) {
        wordCountIssues++;
        findings.push({
          id: `qc-${idCounter++}`,
          category: 'word_count',
          severity: 'warning',
          title: `Draft Below Target Word Count (${wordCount} / ${target} words)`,
          location: 'Document Length',
          explanation: `Current word count is significantly below the target of ${target} words.`,
          suggestedAction: 'Develop additional sections.',
        });
      }
    }
  }

  // ==========================================
  // 4. EM DASH CHECK (Science of Gifts Rule)
  // ==========================================
  let emDashIssues = 0;
  const rawHtml = project.content || '';
  const emDashCount = (rawHtml.match(/—|&mdash;/g) || []).length;
  const noEmDashRuleActive = (project.contentRules || []).some(
    (r) => r.enabled && r.rule.toLowerCase().includes('em dash')
  );

  if (emDashCount > 0) {
    emDashIssues = emDashCount;
    findings.push({
      id: `qc-${idCounter++}`,
      category: 'em_dash',
      severity: noEmDashRuleActive ? 'critical' : 'warning',
      title: `Forbidden Em Dashes Detected (${emDashCount} Occurrence${emDashCount > 1 ? 's' : ''})`,
      location: 'Throughout Draft',
      explanation: `Found ${emDashCount} em dash(es) ('—'). House editorial rules prohibit em dashes in favor of parentheses, colons, or clean sentence breaks.`,
      suggestedAction: 'Replace em dashes with parentheses, colons, or split into two sentences.',
      targetText: '—',
      proposedText: ', ',
      isRuleViolation: true,
    });
  }

  // ==========================================
  // 5. CONTENT RULES CHECK (Hard Constraints)
  // ==========================================
  let ruleIssues = 0;
  (project.contentRules || [])
    .filter((r) => r.enabled)
    .forEach((rule) => {
      const ruleLower = rule.rule.toLowerCase();

      // No Bold check
      if (ruleLower.includes('no bold') || ruleLower.includes('never use bold')) {
        const boldMatches = (rawHtml.match(/<strong>|<b>/gi) || []).length;
        if (boldMatches > 0) {
          ruleIssues++;
          findings.push({
            id: `qc-${idCounter++}`,
            category: 'content_rules',
            severity: 'critical',
            title: `Hard Rule Violation: Bold Text Found (${boldMatches} instances)`,
            location: 'Rich Text Formatting',
            explanation: `Active Content Rule prohibits bold formatting: "${rule.rule}".`,
            suggestedAction: 'Remove bold formatting tags.',
            isRuleViolation: true,
          });
        }
      }

      // No Bullet Points check
      if (ruleLower.includes('no bullet') || ruleLower.includes('no lists')) {
        const listMatches = (rawHtml.match(/<ul>|<ol>|<li>/gi) || []).length;
        if (listMatches > 0) {
          ruleIssues++;
          findings.push({
            id: `qc-${idCounter++}`,
            category: 'content_rules',
            severity: 'critical',
            title: 'Hard Rule Violation: Bullet / Numbered Lists Found',
            location: 'Document Structure',
            explanation: `Active Content Rule forbids bullet lists: "${rule.rule}".`,
            suggestedAction: 'Convert list items into fluid narrative paragraphs.',
            isRuleViolation: true,
          });
        }
      }

      // No Price Mentions check
      if (ruleLower.includes('no price') || ruleLower.includes('do not mention price') || ruleLower.includes('never mention cost')) {
        const priceRegex = /\$\d+|\b\d+\s*(dollars|usd|gbp|eur|euros|pounds)\b/i;
        if (priceRegex.test(plainText)) {
          ruleIssues++;
          findings.push({
            id: `qc-${idCounter++}`,
            category: 'content_rules',
            severity: 'critical',
            title: 'Hard Rule Violation: Price Mentions Detected',
            location: 'Body Text',
            explanation: `Active Content Rule prohibits mentioning prices: "${rule.rule}".`,
            suggestedAction: 'Remove specific numerical currency and pricing references.',
            isRuleViolation: true,
          });
        }
      }
    });

  // ==========================================
  // 6. FORBIDDEN PHRASES CHECK
  // ==========================================
  let forbiddenIssues = 0;
  const standardClichés = [
    { phrase: "whether you're looking for", label: "whether you're looking for" },
    { phrase: "perfect for", label: "perfect for" },
    { phrase: "ideal choice for", label: "ideal choice for" },
    { phrase: "thoughtful and meaningful", label: "thoughtful and meaningful" },
    { phrase: "takes it to the next level", label: "takes it to the next level" },
    { phrase: "something they'll cherish", label: "something they'll cherish" },
    { phrase: "in today's world", label: "in today's world" },
    { phrase: "must-have", label: "must-have" },
    { phrase: "game changer", label: "game changer" },
  ];

  standardClichés.forEach((item) => {
    const regex = new RegExp(`\\b${item.phrase.replace(/'/g, "['’]?")}\\b`, 'i');
    if (regex.test(plainText)) {
      forbiddenIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'forbidden_phrases',
        severity: 'warning',
        title: `Cliché / Forbidden Phrase: "${item.label}"`,
        location: 'Body Copy',
        explanation: `"${item.label}" is a formulaic marketing construction prohibited by Science of Gifts editorial guidelines.`,
        suggestedAction: 'Rephrase with specific, observed material details describing the piece.',
        targetText: item.phrase,
      });
    }
  });

  // ==========================================
  // 7. URL VALIDATION & PRODUCT DUPLICATES
  // ==========================================
  let urlIssues = 0;
  if (project.type === 'gift_guide') {
    const products = project.giftGuideMeta?.products || [];
    const seenUrls: Record<string, number> = {};

    products.forEach((p, idx) => {
      if (p.url && p.url.trim()) {
        const val = validateUrl(p.url);
        if (!val.isValid) {
          urlIssues++;
          findings.push({
            id: `qc-${idCounter++}`,
            category: 'urls',
            severity: 'critical',
            title: `Invalid Product URL: "${p.name}"`,
            location: `Product #${idx + 1} (${p.name})`,
            explanation: `Product URL has errors: ${val.issue}. Value: "${p.url}"`,
            suggestedAction: 'Correct the product destination URL.',
          });
        }

        const cleaned = cleanTrackingParameters(p.url.trim().toLowerCase());
        seenUrls[cleaned] = (seenUrls[cleaned] || 0) + 1;
      } else {
        urlIssues++;
        findings.push({
          id: `qc-${idCounter++}`,
          category: 'urls',
          severity: 'warning',
          title: `Missing Product URL: "${p.name}"`,
          location: `Product #${idx + 1} (${p.name})`,
          explanation: 'Product does not have a destination link.',
          suggestedAction: 'Add product destination URL.',
        });
      }
    });

    // Check duplicate URLs
    Object.entries(seenUrls).forEach(([url, count]) => {
      if (count > 1) {
        urlIssues++;
        findings.push({
          id: `qc-${idCounter++}`,
          category: 'urls',
          severity: 'warning',
          title: `Duplicate Product URL (${count} items share the same URL)`,
          location: 'Product Catalog',
          explanation: `The URL "${url}" is assigned to ${count} different products in this guide.`,
          suggestedAction: 'Confirm whether these are intentional variants or duplicated entries.',
        });
      }
    });
  } else if (project.type === 'product_copy') {
    const pUrl = project.productCopyMeta?.productUrl;
    if (pUrl && pUrl.trim()) {
      const val = validateUrl(pUrl);
      if (!val.isValid) {
        urlIssues++;
        findings.push({
          id: `qc-${idCounter++}`,
          category: 'urls',
          severity: 'critical',
          title: 'Invalid Product URL in Specs',
          location: 'Product Information / Product URL',
          explanation: `URL validation error: ${val.issue}. Value: "${pUrl}"`,
          suggestedAction: 'Correct the product link format.',
        });
      }
    }
  }

  // ==========================================
  // 8. SEO QUALITY CONTROL
  // ==========================================
  let seoIssues = 0;
  let seoTitle = '';
  let metaDesc = '';
  let slug = '';

  if (project.type === 'article' && project.articleMeta) {
    seoTitle = project.articleMeta.seoTitle || '';
    metaDesc = project.articleMeta.metaDescription || '';
    slug = project.articleMeta.slug || '';
  } else if (project.type === 'gift_guide' && project.giftGuideMeta) {
    seoTitle = project.giftGuideMeta.seoTitle || '';
    metaDesc = project.giftGuideMeta.metaDescription || '';
    slug = project.giftGuideMeta.slug || '';
  } else if (project.type === 'product_copy' && project.productCopyMeta) {
    seoTitle = project.productCopyMeta.seoTitle || '';
    metaDesc = project.productCopyMeta.metaDescription || '';
    slug = project.productCopyMeta.slug || '';
  }

  if (seoTitle) {
    if (seoTitle.length > 70) {
      seoIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'seo',
        severity: 'warning',
        title: `SEO Title Tag Too Long (${seoTitle.length} / 60 chars)`,
        location: 'SEO Metadata / Title',
        explanation: `SEO title is ${seoTitle.length} characters long and will be truncated in search results (recommended: 45-60 characters).`,
        suggestedAction: 'Shorten the SEO title to under 60 characters.',
      });
    } else if (seoTitle.length < 15) {
      seoIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'seo',
        severity: 'suggestion',
        title: 'SEO Title Tag Very Brief',
        location: 'SEO Metadata / Title',
        explanation: 'SEO title is under 15 characters and may underutilize search intent.',
        suggestedAction: 'Expand title with relevant subject keywords.',
      });
    }
  }

  if (metaDesc) {
    if (metaDesc.length > 170) {
      seoIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'seo',
        severity: 'warning',
        title: `Meta Description Too Long (${metaDesc.length} / 160 chars)`,
        location: 'SEO Metadata / Description',
        explanation: `Meta description is ${metaDesc.length} characters long and may be truncated on mobile search (recommended: 120-155 characters).`,
        suggestedAction: 'Trim meta description to under 160 characters.',
      });
    }
  }

  if (slug) {
    if (slug.includes(' ') || slug !== slug.toLowerCase() || /[^a-z0-9-_]/.test(slug)) {
      seoIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'seo',
        severity: 'warning',
        title: 'Malformed URL Slug / Handle',
        location: 'SEO Metadata / URL Slug',
        explanation: 'Slug contains uppercase characters, whitespace, or invalid URL symbols.',
        suggestedAction: 'Use only lowercase letters, numbers, and hyphens (e.g. waxed-canvas-bag).',
      });
    }
  }

  // ==========================================
  // 9. INTERNAL LINKS QC
  // ==========================================
  let linkIssues = 0;
  const docLinks = extractUrlsFromHtml(rawHtml);
  const linkCounts: Record<string, number> = {};
  docLinks.forEach((l) => {
    linkCounts[l] = (linkCounts[l] || 0) + 1;
  });

  Object.entries(linkCounts).forEach(([lUrl, lCount]) => {
    if (lCount > 2) {
      linkIssues++;
      findings.push({
        id: `qc-${idCounter++}`,
        category: 'links',
        severity: 'suggestion',
        title: `Repeated Internal Link (${lCount} times in document)`,
        location: 'Hyperlinks in Content',
        explanation: `The destination "${lUrl}" is linked ${lCount} times in this document. Frequent repetition may degrade reading rhythm.`,
        suggestedAction: 'Consider linking only on the first prominent contextual mention.',
      });
    }
  });

  // ==========================================
  // ASSEMBLE CATEGORY CHECK STATUSES
  // ==========================================
  const categoryChecks: QCCategoryCheck[] = [
    {
      category: 'completeness',
      label: 'Content Completeness',
      status: completenessIssues === 0 ? 'passed' : 'failed',
      message: completenessIssues === 0 ? 'All required project fields present' : `${completenessIssues} missing field(s)`,
      issueCount: completenessIssues,
    },
    {
      category: 'outline',
      label: 'Outline Coverage',
      status: outlineIssues === 0 ? 'passed' : 'warning',
      message: outlineIssues === 0 ? 'Outline sections represented' : `${outlineIssues} section(s) unrepresented`,
      issueCount: outlineIssues,
    },
    {
      category: 'word_count',
      label: 'Word Count Target',
      status: wordCountIssues === 0 ? 'passed' : 'warning',
      message: wordCountIssues === 0 ? `Within target (${wordCount} words)` : 'Outside specified target range',
      issueCount: wordCountIssues,
    },
    {
      category: 'content_rules',
      label: 'Content Rules & Constraints',
      status: ruleIssues === 0 ? 'passed' : 'failed',
      message: ruleIssues === 0 ? 'All active hard rules satisfied' : `${ruleIssues} rule violation(s)`,
      issueCount: ruleIssues,
    },
    {
      category: 'em_dash',
      label: 'Em Dash Compliance',
      status: emDashIssues === 0 ? 'passed' : 'failed',
      message: emDashIssues === 0 ? 'No forbidden em dashes' : `${emDashIssues} em dash(es) detected`,
      issueCount: emDashIssues,
    },
    {
      category: 'forbidden_phrases',
      label: 'Clichés & Banned Phrases',
      status: forbiddenIssues === 0 ? 'passed' : 'warning',
      message: forbiddenIssues === 0 ? 'No marketing clichés found' : `${forbiddenIssues} cliché(s) detected`,
      issueCount: forbiddenIssues,
    },
    {
      category: 'urls',
      label: 'URL Formatting & Duplicates',
      status: urlIssues === 0 ? 'passed' : 'failed',
      message: urlIssues === 0 ? 'All links validated' : `${urlIssues} URL issue(s)`,
      issueCount: urlIssues,
    },
    {
      category: 'seo',
      label: 'SEO & Metadata',
      status: seoIssues === 0 ? 'passed' : 'warning',
      message: seoIssues === 0 ? 'Metadata lengths optimized' : `${seoIssues} SEO warning(s)`,
      issueCount: seoIssues,
    },
    {
      category: 'links',
      label: 'Internal Links',
      status: linkIssues === 0 ? 'passed' : 'passed',
      message: linkIssues === 0 ? 'Link distribution healthy' : `${linkIssues} link notice(s)`,
      issueCount: linkIssues,
    },
  ];

  return { categoryChecks, findings };
}

/**
 * Compute overall status based on findings
 */
export function computeQCStatus(findings: QCFinding[]): {
  status: QCOverallStatus;
  summary: string;
  counts: { critical: number; warning: number; suggestion: number };
} {
  const critical = findings.filter((f) => f.severity === 'critical').length;
  const warning = findings.filter((f) => f.severity === 'warning').length;
  const suggestion = findings.filter((f) => f.severity === 'suggestion').length;

  let status: QCOverallStatus = 'ready';
  let summary = '';

  if (critical > 0) {
    status = 'action_required';
    summary = `${critical} blocking issue${critical > 1 ? 's' : ''} require resolution before this project is ready for publication.`;
  } else if (warning > 0) {
    status = 'warning';
    summary = `Content is largely complete with ${warning} warning${warning > 1 ? 's' : ''} that deserve attention.`;
  } else {
    status = 'ready';
    summary = suggestion > 0
      ? `No blocking issues found. Content is ready for publication with ${suggestion} optional suggestion${suggestion > 1 ? 's' : ''}.`
      : 'No blocking issues found. All completeness, rule, and formatting criteria passed.';
  }

  return { status, summary, counts: { critical, warning, suggestion } };
}
