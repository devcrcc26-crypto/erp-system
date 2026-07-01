export interface LocalizedNameFields {
  name: string;
  nameZh?: string | null;
}

/**
 * Formats an English name with an optional Chinese name for display.
 */
export function formatLocalizedName(
  entity: LocalizedNameFields,
): string {
  const english = entity.name.trim();
  const chinese = (entity.nameZh ?? '').trim();

  if (chinese) {
    return `${english} · ${chinese}`;
  }

  return english;
}

/**
 * Returns the English name only.
 */
export function primaryName(entity: LocalizedNameFields): string {
  return entity.name.trim() || (entity.nameZh ?? '').trim();
}
