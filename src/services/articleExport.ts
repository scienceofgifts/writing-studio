/**
 * Science of Gifts - Article Export & CMS Importer Service
 * Converts finished articles from Writing Studio's structured rich-text representation
 * into the exact format expected by the Science of Gifts CMS importer and clean Markdown.
 */

import { WritingProject, ArticleMetadata, ArticleAuthor, ArticleHeroImage, ArticleRelatedContent } from '../types/project';
import { countWords } from '../utils/richText';
import { htmlToMarkdown, formatYamlFrontMatter } from '../utils/markdown';

export interface CmsInternalLinkItem {
  url: string;
  anchor: string;
  title?: string;
}

export interface CmsArticleExport {
  // Core Identity & Categorization
  title: string;
  slug: string;
  category: string;
  deck: string; // Standfirst / deck
  standfirst: string; // Backward-compatible alias for all CMS importer variations

  // Author Information
  author: {
    name: string;
    role?: string;
    bio?: string;
    email?: string;
  };

  // Dates
  dates: {
    createdAt: string;
    updatedAt: string;
    publishedAt: string;
  };
  createdAt: string;
  updatedAt: string;
  publishedAt: string;

  // Hero Image
  heroImage?: {
    url: string;
    altText: string;
    caption?: string;
    credit?: string;
  };

  // SEO Fields
  seo: {
    title: string;
    description: string;
    targetKeyword: string;
    secondaryKeywords: string[];
    audience: string;
    searchIntent: string;
  };
  seoTitle: string;
  metaDescription: string;
  targetKeyword: string;
  secondaryKeywords: string[];

  // Taxonomy & References
  tags: string[];
  sources: string[];
  relatedContent: Array<{
    title: string;
    url: string;
    reason?: string;
  }>;

  // Internal Links
  internalLinks: CmsInternalLinkItem[];

  // Complete Article Body
  body: string; // Clean semantic HTML body expected by the importer (without redundant H1)
  bodyHtml: string; // Semantic HTML body
  bodyMarkdown: string; // Markdown representation of the body

  // Metadata & Stats
  wordCount: number;
  readingTimeMinutes: number;
  status: string;
  formatVersion: string;
}

export interface ValidationIssue {
  id: string;
  field: string;
  severity: 'critical' | 'warning' | 'suggestion';
  title: string;
  message: string;
  suggestedAction: string;
}

export interface ExportValidationResult {
  isValid: boolean; // False if any critical issue
  hasWarnings: boolean;
  canExport: boolean;
  issues: ValidationIssue[];
  criticalCount: number;
  warningCount: number;
  suggestionCount: number;
}

/**
 * Strips the leading <h1> title tag from the body HTML if present,
 * ensuring the CMS does not render a duplicate title above the body.
 */
export function stripLeadingH1(html: string): string {
  if (!html) return '';
  return html.replace(/^\s*<h1[^>]*>[\s\S]*?<\/h1>\s*/i, '').trim();
}

/**
 * Extracts links from an HTML document
 */
export function extractLinksFromHtml(html: string): CmsInternalLinkItem[] {
  if (!html) return [];
  const links: CmsInternalLinkItem[] = [];
  const regex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const url = match[1];
    const rawAnchor = match[2].replace(/<[^>]+>/g, '').trim();
    if (url && rawAnchor) {
      links.push({
        url,
        anchor: rawAnchor,
      });
    }
  }

  return links;
}

/**
 * Helper to generate a clean URL slug from title
 */
export function slugify(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Builds the canonical Science of Gifts CMS JSON export payload
 */
export function buildCmsArticleExport(project: WritingProject): CmsArticleExport {
  const meta: ArticleMetadata = project.articleMeta || {
    slug: '',
    seoTitle: '',
    metaDescription: '',
    standfirst: '',
    targetKeyword: '',
    secondaryKeywords: [],
    audience: 'Thoughtful gifters & readers',
    searchIntent: 'Editorial insight & advice',
  };

  const cleanBodyHtml = stripLeadingH1(project.content || '');
  const cleanBodyMarkdown = htmlToMarkdown(cleanBodyHtml, { omitH1: true });
  const internalLinks = extractLinksFromHtml(project.content || '');

  const words = countWords(cleanBodyHtml || project.content || '');
  const readingTime = Math.max(1, Math.ceil(words / 220));

  const effectiveSlug = meta.slug?.trim() || slugify(project.title) || 'untitled-article';
  const effectiveCategory = meta.category?.trim() || 'Product & Craft Advice';

  const author: ArticleAuthor = meta.author || {
    name: 'Science of Gifts Editorial',
    role: 'Staff Writer',
    bio: 'Civilized observations on material craft, heirloom permanence, and thoughtful gifting.',
  };

  const heroImage: ArticleHeroImage | undefined = meta.heroImage?.url
    ? {
        url: meta.heroImage.url,
        altText: meta.heroImage.altText || project.title,
        caption: meta.heroImage.caption || '',
        credit: meta.heroImage.credit || 'Science of Gifts Editorial',
      }
    : undefined;

  const deck = meta.standfirst?.trim() || project.brief?.purpose?.trim() || '';

  const createdAt = project.createdAt || new Date().toISOString();
  const updatedAt = project.updatedAt || new Date().toISOString();
  const publishedAt = meta.publishedAt || updatedAt;

  const seoTitle = meta.seoTitle?.trim() || (project.title ? `${project.title} | Science of Gifts` : '');
  const metaDesc = meta.metaDescription?.trim() || deck || '';

  return {
    title: project.title?.trim() || 'Untitled Article',
    slug: effectiveSlug,
    category: effectiveCategory,
    deck,
    standfirst: deck,
    author: {
      name: author.name || 'Science of Gifts Editorial',
      role: author.role || 'Staff Writer',
      bio: author.bio || '',
      email: author.email,
    },
    dates: {
      createdAt,
      updatedAt,
      publishedAt,
    },
    createdAt,
    updatedAt,
    publishedAt,
    heroImage,
    seo: {
      title: seoTitle,
      description: metaDesc,
      targetKeyword: meta.targetKeyword || '',
      secondaryKeywords: meta.secondaryKeywords || [],
      audience: meta.audience || project.brief?.audience || 'Thoughtful gifters & readers',
      searchIntent: meta.searchIntent || 'Editorial insight & advice',
    },
    seoTitle,
    metaDescription: metaDesc,
    targetKeyword: meta.targetKeyword || '',
    secondaryKeywords: meta.secondaryKeywords || [],
    tags: meta.tags || [],
    sources: meta.sources || [],
    relatedContent: meta.relatedContent || [],
    internalLinks,
    body: cleanBodyHtml,
    bodyHtml: cleanBodyHtml,
    bodyMarkdown: cleanBodyMarkdown,
    wordCount: words,
    readingTimeMinutes: readingTime,
    status: project.status || 'draft',
    formatVersion: '1.0.0',
  };
}

/**
 * Builds the clean Markdown export file with YAML front matter
 */
export function buildMarkdownExport(project: WritingProject): string {
  const cmsData = buildCmsArticleExport(project);

  const frontMatter: Record<string, any> = {
    title: cmsData.title,
    slug: cmsData.slug,
    category: cmsData.category,
    author: cmsData.author.name,
    deck: cmsData.deck || undefined,
    date: cmsData.dates.publishedAt,
    updated: cmsData.dates.updatedAt,
    heroImage: cmsData.heroImage?.url || undefined,
    heroImageAlt: cmsData.heroImage?.altText || undefined,
    seoTitle: cmsData.seoTitle || undefined,
    metaDescription: cmsData.metaDescription || undefined,
    targetKeyword: cmsData.targetKeyword || undefined,
    tags: cmsData.tags.length > 0 ? cmsData.tags : undefined,
    wordCount: cmsData.wordCount,
    status: cmsData.status,
  };

  const frontMatterYaml = formatYamlFrontMatter(frontMatter);
  const bodyMarkdown = cmsData.bodyMarkdown;

  return `${frontMatterYaml}\n\n${bodyMarkdown}\n`;
}

/**
 * Validates the article prior to export and returns actionable warnings and errors
 */
export function validateArticleForExport(project: WritingProject): ExportValidationResult {
  const issues: ValidationIssue[] = [];
  const meta = project.articleMeta;
  const content = project.content || '';
  const wordCount = countWords(content);

  // 1. Title Validation
  if (!project.title || !project.title.trim() || project.title.toLowerCase().includes('untitled')) {
    issues.push({
      id: 'val-title',
      field: 'title',
      severity: 'critical',
      title: 'Missing or Placeholder Title',
      message: 'The article title is either missing or contains placeholder text.',
      suggestedAction: 'Specify an unhurried, editorial headline for the article.',
    });
  }

  // 2. Slug Validation
  const slug = meta?.slug?.trim();
  if (!slug) {
    issues.push({
      id: 'val-slug-empty',
      field: 'slug',
      severity: 'warning',
      title: 'Missing URL Slug',
      message: 'No URL slug is defined. An automatic slug derived from the title will be generated upon export.',
      suggestedAction: 'Define a permanent canonical slug (e.g. "mechanical-field-watches-guide").',
    });
  } else if (/[^a-z0-9-]/.test(slug) || slug.startsWith('-') || slug.endsWith('-')) {
    issues.push({
      id: 'val-slug-format',
      field: 'slug',
      severity: 'warning',
      title: 'Slug Format Warning',
      message: 'The URL slug contains uppercase characters, whitespace, or invalid symbols.',
      suggestedAction: 'Ensure the slug uses only lowercase alphanumeric characters and hyphens.',
    });
  }

  // 3. Body Content Validation
  if (wordCount < 40) {
    issues.push({
      id: 'val-body-empty',
      field: 'content',
      severity: 'critical',
      title: 'Article Body Underdeveloped',
      message: `The article contains only ${wordCount} words. The Science of Gifts CMS importer expects substantial copy.`,
      suggestedAction: 'Draft or expand the body text before publishing or exporting.',
    });
  }

  // 4. Deck / Standfirst
  const deck = meta?.standfirst?.trim();
  if (!deck) {
    issues.push({
      id: 'val-deck-missing',
      field: 'standfirst',
      severity: 'warning',
      title: 'Missing Standfirst / Deck',
      message: 'Articles require a curatorial standfirst / deck summarizing the thesis for CMS layout.',
      suggestedAction: 'Add a 1-2 sentence standfirst in Article Info.',
    });
  }

  // 5. Category
  if (!meta?.category?.trim()) {
    issues.push({
      id: 'val-category-missing',
      field: 'category',
      severity: 'warning',
      title: 'Missing Category',
      message: 'No publication category is specified. The default "Product & Craft Advice" will be used.',
      suggestedAction: 'Select a category such as "Gift Psychology" or "Lifestyle & Rituals".',
    });
  }

  // 6. Author
  if (!meta?.author?.name?.trim()) {
    issues.push({
      id: 'val-author-missing',
      field: 'author',
      severity: 'suggestion',
      title: 'Author Name Not Specified',
      message: 'Author name is blank. "Science of Gifts Editorial" will be used.',
      suggestedAction: 'Assign a named staff writer or contributor in Article Info.',
    });
  }

  // 7. Hero Image
  if (!meta?.heroImage?.url?.trim()) {
    issues.push({
      id: 'val-hero-missing',
      field: 'heroImage',
      severity: 'warning',
      title: 'Missing Hero / Featured Image',
      message: 'The article does not have a hero image URL. The CMS layout requires a hero visual.',
      suggestedAction: 'Attach a hero image URL with descriptive alt text in Article Info.',
    });
  } else if (!meta.heroImage.altText?.trim()) {
    issues.push({
      id: 'val-hero-alt-missing',
      field: 'heroImage',
      severity: 'warning',
      title: 'Missing Hero Image Alt Text',
      message: 'Hero image has a URL but is missing accessibility and SEO alt text.',
      suggestedAction: 'Provide informative alt text describing the image.',
    });
  }

  // 8. SEO Metadata
  if (!meta?.seoTitle?.trim()) {
    issues.push({
      id: 'val-seo-title',
      field: 'seoTitle',
      severity: 'suggestion',
      title: 'Missing SEO Title Tag',
      message: 'SEO title tag is empty. The article title will be used as a fallback.',
      suggestedAction: 'Specify an optimized title tag between 45 and 60 characters.',
    });
  }
  if (!meta?.metaDescription?.trim()) {
    issues.push({
      id: 'val-meta-desc',
      field: 'metaDescription',
      severity: 'suggestion',
      title: 'Missing Meta Description',
      message: 'Meta description is empty. The deck will be used as a search snippet fallback.',
      suggestedAction: 'Draft a meta description under 160 characters.',
    });
  }

  // 9. Science of Gifts Editorial Constraint: Em Dashes
  if (content.includes('—')) {
    issues.push({
      id: 'val-em-dash',
      field: 'content',
      severity: 'warning',
      title: 'Em Dashes Detected in Prose',
      message: 'Science of Gifts house rules prohibit em dashes (—). Use colons, parentheses, or commas.',
      suggestedAction: 'Review and replace em dashes with natural punctuation.',
    });
  }

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const suggestionCount = issues.filter((i) => i.severity === 'suggestion').length;

  return {
    isValid: criticalCount === 0,
    hasWarnings: warningCount > 0 || suggestionCount > 0,
    canExport: criticalCount === 0,
    issues,
    criticalCount,
    warningCount,
    suggestionCount,
  };
}

/**
 * Downloads a text file (JSON, Markdown, etc.) in the user's browser
 */
export function downloadFile(filename: string, content: string, mimeType: string = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copies a string or JSON object to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback using textarea
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Failed to copy text to clipboard:', err);
    return false;
  }
}
