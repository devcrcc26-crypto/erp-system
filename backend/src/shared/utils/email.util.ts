/**
 * Normalizes an email address for consistent lookup and storage.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
