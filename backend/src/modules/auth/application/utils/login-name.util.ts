/**
 * Builds the displayed full name used as the default OA login name.
 */
export function formatDisplayFullName(parts: {
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => part.length > 0)
    .join(' ');
}

/**
 * Normalises a login name for comparison: Unicode NFC, trim, lowercase,
 * collapse internal whitespace. No fuzzy matching or reordering.
 */
export function normalizeLoginName(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * True when the identifier should be treated as an email login.
 */
export function isEmailLoginIdentifier(identifier: string): boolean {
  return identifier.includes('@');
}
