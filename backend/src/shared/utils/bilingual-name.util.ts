/**
 * Keeps the legacy `name` column aligned with bilingual name fields.
 */
export function syncLegacyNameField(nameEn: string, nameZh: string): string {
  const english = nameEn.trim();
  const chinese = nameZh.trim();
  return english || chinese;
}

/**
 * Formats bilingual names for compact display labels.
 */
export function formatBilingualName(nameEn: string, nameZh: string): string {
  const english = (nameEn ?? '').trim();
  const chinese = (nameZh ?? '').trim();

  if (english && chinese) {
    if (english === chinese) {
      return english;
    }
    return `${english} / ${chinese}`;
  }

  return english || chinese;
}
