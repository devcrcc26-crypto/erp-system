/**
 * Formats a user's full display name for API responses and UI labels.
 * Appends the Chinese name when present, e.g. "Wei Zhang (张伟)".
 */
export function formatUserDisplayName(user: {
  firstName: string;
  lastName: string;
  chineseName?: string | null;
  email?: string | null;
}): string {
  const english = `${user.firstName} ${user.lastName}`.trim();
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
  return user.email ?? 'Unknown user';
}
