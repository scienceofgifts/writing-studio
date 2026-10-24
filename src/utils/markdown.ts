/**
 * Science of Gifts - Rich Text to Markdown & Front Matter Converter
 * Converts structured rich-text HTML into clean, valid Markdown with YAML front matter.
 * Preserves H2/H3/H4 hierarchy, bold, italic, links, lists, blockquotes, images, and paragraphs.
 * Strictly omits H1 from body if title is represented in front matter.
 */

/**
 * Escapes YAML string values properly
 */
function escapeYamlString(str: string): string {
  if (typeof str !== 'string') return String(str);
  if (!str) return '""';
  // If string contains newlines, quotes, colons, or special chars, quote it
  if (/[:#\[\]{}&*!|>'"%@`\n\r\t]/.test(str) || str.trim() !== str) {
    return JSON.stringify(str);
  }
  return str;
}

/**
 * Converts a JS object/dictionary into clean YAML text
 */
export function stringifyYaml(data: Record<string, any>, indent = 0): string {
  const spaces = '  '.repeat(indent);
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      lines.push(`${spaces}${key}:`);
      for (const item of value) {
        if (typeof item === 'object' && item !== null) {
          lines.push(`${spaces}  -`);
          lines.push(stringifyYaml(item, indent + 2));
        } else {
          lines.push(`${spaces}  - ${escapeYamlString(String(item))}`);
        }
      }
    } else if (typeof value === 'object' && !(value instanceof Date)) {
      const subKeys = Object.keys(value).filter((k) => value[k] !== undefined && value[k] !== null && value[k] !== '');
      if (subKeys.length === 0) continue;
      lines.push(`${spaces}${key}:`);
      lines.push(stringifyYaml(value, indent + 1));
    } else if (typeof value === 'boolean' || typeof value === 'number') {
      lines.push(`${spaces}${key}: ${value}`);
    } else {
      const strVal = String(value).trim();
      if (strVal) {
        lines.push(`${spaces}${key}: ${escapeYamlString(strVal)}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Formats YAML front matter wrapped in ---
 */
export function formatYamlFrontMatter(data: Record<string, any>): string {
  const yamlContent = stringifyYaml(data).trim();
  if (!yamlContent) return '';
  return `---\n${yamlContent}\n---`;
}

/**
 * Converts inline HTML elements (strong, em, a, code, etc.) to inline Markdown
 */
function convertInlineHtmlToMarkdown(html: string): string {
  if (!html) return '';

  let text = html;

  // Replace <br> or <br/> with newline
  text = text.replace(/<br\s*[\/]?>/gi, '\n');

  // Convert images <img src="..." alt="..." title="...">
  text = text.replace(/<img\s+([^>]*?)>/gi, (_, attrs) => {
    const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
    const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
    const titleMatch = attrs.match(/title=["']([^"']*)["']/i);

    const src = srcMatch ? srcMatch[1] : '';
    const alt = altMatch ? altMatch[1] : '';
    const title = titleMatch ? titleMatch[1] : '';

    if (!src) return '';
    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
  });

  // Convert links <a href="..." ...>text</a>
  text = text.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
    const cleanLabel = convertInlineHtmlToMarkdown(label).trim();
    return `[${cleanLabel}](${href})`;
  });

  // Bold tags
  text = text.replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/gi, (_, inner) => {
    const clean = convertInlineHtmlToMarkdown(inner).trim();
    return clean ? `**${clean}**` : '';
  });

  // Italic tags
  text = text.replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/gi, (_, inner) => {
    const clean = convertInlineHtmlToMarkdown(inner).trim();
    return clean ? `*${clean}*` : '';
  });

  // Strikethrough tags
  text = text.replace(/<(?:del|s|strike)>([\s\S]*?)<\/(?:del|s|strike)>/gi, (_, inner) => {
    const clean = convertInlineHtmlToMarkdown(inner).trim();
    return clean ? `~~${clean}~~` : '';
  });

  // Underline tags - standard markdown does not have underline, preserve <u> or convert to plain
  text = text.replace(/<u>([\s\S]*?)<\/u>/gi, (_, inner) => {
    const clean = convertInlineHtmlToMarkdown(inner).trim();
    return clean ? `<u>${clean}</u>` : '';
  });

  // Inline code tags
  text = text.replace(/<code>([\s\S]*?)<\/code>/gi, (_, inner) => {
    return `\`${inner}\``;
  });

  // Superscript citation tags (converts <sup ...>1</sup> to [1])
  text = text.replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, (_, inner) => {
    const clean = inner.replace(/<[^>]+>/g, '').trim();
    return clean ? `[${clean}]` : '';
  });

  // Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  return text;
}

/**
 * Converts structured rich-text HTML from the editor into clean Markdown
 * @param html The HTML string from Editor
 * @param options Options including omitH1 (true by default for front-matter articles)
 */
export function htmlToMarkdown(
  html: string,
  options: { omitH1?: boolean } = { omitH1: true }
): string {
  if (!html || !html.trim()) return '';

  const { omitH1 = true } = options;

  // If running in browser environment, use DOM parser for exact hierarchical traversal
  if (typeof DOMParser !== 'undefined') {
    return domToMarkdown(html, omitH1);
  }

  // Fallback regex-based parser
  return regexHtmlToMarkdown(html, omitH1);
}

/**
 * DOM-based rich text to Markdown serializer
 */
function domToMarkdown(html: string, omitH1: boolean): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild || doc.body;

  const blocks: string[] = [];

  for (let i = 0; i < root.childNodes.length; i++) {
    const node = root.childNodes[i];
    const md = processDomNode(node, omitH1);
    if (md && md.trim()) {
      blocks.push(md.trim());
    }
  }

  return blocks.join('\n\n').trim();
}

function processDomNode(node: Node, omitH1: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  switch (tag) {
    case 'h1': {
      if (omitH1) return '';
      return `# ${convertInlineHtmlToMarkdown(el.innerHTML)}`;
    }
    case 'h2':
      return `## ${convertInlineHtmlToMarkdown(el.innerHTML)}`;
    case 'h3':
      return `### ${convertInlineHtmlToMarkdown(el.innerHTML)}`;
    case 'h4':
      return `#### ${convertInlineHtmlToMarkdown(el.innerHTML)}`;
    case 'h5':
      return `##### ${convertInlineHtmlToMarkdown(el.innerHTML)}`;
    case 'h6':
      return `###### ${convertInlineHtmlToMarkdown(el.innerHTML)}`;
    case 'p': {
      const inline = convertInlineHtmlToMarkdown(el.innerHTML).trim();
      return inline;
    }
    case 'blockquote': {
      // Collect children
      const innerMd = Array.from(el.childNodes)
        .map((child) => processDomNode(child, false))
        .filter(Boolean)
        .join('\n\n');
      return innerMd
        .split('\n')
        .map((line) => (line.trim() ? `> ${line}` : '>'))
        .join('\n');
    }
    case 'ul': {
      const items: string[] = [];
      Array.from(el.children).forEach((li) => {
        if (li.tagName.toLowerCase() === 'li') {
          const itemText = convertInlineHtmlToMarkdown(li.innerHTML).trim();
          if (itemText) items.push(`- ${itemText}`);
        }
      });
      return items.join('\n');
    }
    case 'ol': {
      const items: string[] = [];
      let count = 1;
      Array.from(el.children).forEach((li) => {
        if (li.tagName.toLowerCase() === 'li') {
          const itemText = convertInlineHtmlToMarkdown(li.innerHTML).trim();
          if (itemText) {
            items.push(`${count}. ${itemText}`);
            count++;
          }
        }
      });
      return items.join('\n');
    }
    case 'figure': {
      const img = el.querySelector('img');
      const caption = el.querySelector('figcaption');
      let result = '';
      if (img) {
        const src = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || '';
        result = `![${alt}](${src})`;
      }
      if (caption) {
        const capText = caption.textContent?.trim();
        if (capText) {
          result = result ? `${result}\n*${capText}*` : `*${capText}*`;
        }
      }
      return result;
    }
    case 'img': {
      const src = el.getAttribute('src') || '';
      const alt = el.getAttribute('alt') || '';
      const title = el.getAttribute('title') || '';
      return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
    }
    case 'hr':
      return '---';
    case 'pre': {
      const code = el.querySelector('code');
      const content = code ? code.textContent || '' : el.textContent || '';
      return `\`\`\`\n${content}\n\`\`\``;
    }
    default: {
      return convertInlineHtmlToMarkdown(el.innerHTML).trim();
    }
  }
}

/**
 * Regex fallback converter for environments without DOMParser
 */
function regexHtmlToMarkdown(html: string, omitH1: boolean): string {
  let content = html;

  if (omitH1) {
    content = content.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, '');
  } else {
    content = content.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n\n# ${convertInlineHtmlToMarkdown(t)}\n\n`);
  }

  // Convert standalone images <img src="..." alt="..." />
  content = content.replace(/<img\s+([^>]*?)>/gi, (_, attrs) => {
    const srcMatch = attrs.match(/src=["']([^"']*)["']/i);
    const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
    const titleMatch = attrs.match(/title=["']([^"']*)["']/i);

    const src = srcMatch ? srcMatch[1] : '';
    const alt = altMatch ? altMatch[1] : '';
    const title = titleMatch ? titleMatch[1] : '';

    if (!src) return '';
    return title ? `\n\n![${alt}](${src} "${title}")\n\n` : `\n\n![${alt}](${src})\n\n`;
  });

  content = content
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n\n## ${convertInlineHtmlToMarkdown(t)}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n\n### ${convertInlineHtmlToMarkdown(t)}\n\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `\n\n#### ${convertInlineHtmlToMarkdown(t)}\n\n`)
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => {
      const inner = convertInlineHtmlToMarkdown(t.replace(/<p[^>]*>/gi, '').replace(/<\/p>/gi, '\n')).trim();
      const quoted = inner.split('\n').map((l) => (l.trim() ? `> ${l}` : '>')).join('\n');
      return `\n\n${quoted}\n\n`;
    })
    .replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, t) => {
      const items = t
        .split(/<\/li>/i)
        .map((item: string) => item.replace(/<li[^>]*>/i, '').trim())
        .filter(Boolean)
        .map((item: string) => `- ${convertInlineHtmlToMarkdown(item)}`)
        .join('\n');
      return `\n\n${items}\n\n`;
    })
    .replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, t) => {
      let idx = 1;
      const items = t
        .split(/<\/li>/i)
        .map((item: string) => item.replace(/<li[^>]*>/i, '').trim())
        .filter(Boolean)
        .map((item: string) => `${idx++}. ${convertInlineHtmlToMarkdown(item)}`)
        .join('\n');
      return `\n\n${items}\n\n`;
    })
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `\n\n${convertInlineHtmlToMarkdown(t)}\n\n`)
    .replace(/<hr\s*[\/]?>/gi, '\n\n---\n\n');

  // Clean trailing spaces and excessive blank lines
  return content
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
