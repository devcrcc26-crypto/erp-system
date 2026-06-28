/**
 * Formats a user's full display name for API responses and UI labels.
 */
export function formatUserDisplayName(user: {
  firstName: string;
  lastName: string;
  email?: string | null;
}): string {
  const name = `${user.firstName} ${user.lastName}`.trim();
  return name.length > 0 ? name : (user.email ?? 'Unknown user');
}
