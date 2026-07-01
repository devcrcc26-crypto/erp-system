/**
 * Formats an English name with an optional Chinese name for display.
 */
export function formatLocalizedName(
  name: string,
  nameZh?: string | null,
): string {
  const english = name.trim();
  const chinese = (nameZh ?? '').trim();

  if (chinese) {
    return `${english} · ${chinese}`;
  }

  return english;
}
