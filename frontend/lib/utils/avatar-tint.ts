/**
 * Soft initials tints from the app palette, picked per user so lists are
 * easier to scan. Each text colour is ≥ 4.5:1 on its tint.
 */
const AVATAR_TINTS: ReadonlyArray<{ bg: string; fg: string }> = [
  { bg: '#E1F5EE', fg: '#0F6E56' },
  { bg: '#E6F1FB', fg: '#1A4A7A' },
  { bg: '#FAEEDA', fg: '#7A4D0F' },
  { bg: '#FAECE7', fg: '#9A3B1C' },
  { bg: '#EAF3DE', fg: '#4A7319' },
  { bg: '#ECFEFF', fg: '#0E7490' },
];

/** Stable tint for a user id (same user, same colour on every page). */
export function avatarTint(userId: string): { bg: string; fg: string } {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return AVATAR_TINTS[hash % AVATAR_TINTS.length];
}

/** Up to two initials from first and last name, upper-cased. */
export function userInitials(
  firstName?: string | null,
  lastName?: string | null,
): string {
  return `${firstName?.charAt(0) ?? ''}${lastName?.charAt(0) ?? ''}`.toUpperCase();
}
