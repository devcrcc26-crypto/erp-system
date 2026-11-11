/**
 * Announcement bodies are Markdown. Raw HTML is never allowed: it is removed
 * on save here, and the frontend renderer builds elements from Markdown only
 * (it never injects HTML), so stored content cannot carry scripts either way.
 */

/** Elements whose content is code or markup, removed together with their body. */
const DANGEROUS_BLOCK = /<(script|style|iframe|object|embed|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
/** An opening dangerous element with no closing tag: drop it and everything after. */
const DANGEROUS_UNCLOSED = /<(script|style|iframe|object|embed|template|noscript)\b[\s\S]*$/i;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
/** Any remaining tag-like token: <tag ...>, </tag>, <tag/>. */
const HTML_TAG = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/gi;
/** Markdown link / image targets using a script-capable scheme. */
const UNSAFE_LINK_TARGET = /(\]\(\s*)(?:javascript|vbscript|data)\s*:[^)]*\)/gi;

/**
 * Strips raw HTML (including script/style content) and script-capable link
 * targets from a Markdown body. Markdown syntax itself is left untouched.
 */
export function sanitizeAnnouncementMarkdown(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(DANGEROUS_BLOCK, '')
    .replace(DANGEROUS_UNCLOSED, '')
    .replace(HTML_COMMENT, '')
    .replace(HTML_TAG, '')
    .replace(UNSAFE_LINK_TARGET, '$1#)')
    .trim();
}

/**
 * Plain-text excerpt for notifications and email: drops Markdown markup and
 * collapses whitespace, then cuts at a word boundary.
 */
export function markdownToPlainText(value: string, maxLength = 280): string {
  const text = sanitizeAnnouncementMarkdown(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) {
    return text;
  }
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
