/**
 * Western full name: first, middle, and last when present.
 */
export function formatEnglishName(user: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [user.firstName, user.middleName, user.lastName]
    .map((part) => part?.trim() ?? '')
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formats a user's full display name for API responses and UI labels.
 * Appends the Chinese name when present, e.g. "Wei Zhang (张伟)".
 */
export function formatUserDisplayName(user: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  chineseName?: string | null;
  email?: string | null;
}): string {
  const english = formatEnglishName(user);
  const chinese = user.chineseName?.trim();

  if (english && chinese) {
    return `${english} (${chinese})`;
  }
  if (english) {
    return english;
  }
  if (chinese) {
    return chinese;
  }
  return user.email?.trim() ?? 'Unknown user';
}
