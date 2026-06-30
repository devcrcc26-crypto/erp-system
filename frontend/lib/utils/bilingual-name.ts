export interface BilingualNameFields {
  name?: string;
  nameEn: string;
  nameZh: string;
}

/**
 * Formats bilingual entity names for compact display.
 */
export function formatBilingualName(
  entity: BilingualNameFields,
  locale?: string | null,
): string {
  const english = entity.nameEn.trim();
  const chinese = entity.nameZh.trim();

  if (locale === 'zh' || locale === 'zh-CN') {
    return chinese || english || entity.name?.trim() || '';
  }

  if (english && chinese) {
    if (english === chinese) {
      return english;
    }
    return `${english} / ${chinese}`;
  }

  return english || chinese || entity.name?.trim() || '';
}

/**
 * Returns the primary localized name for a single-language context.
 */
export function primaryLocalizedName(
  entity: BilingualNameFields,
  locale?: string | null,
): string {
  const english = entity.nameEn.trim();
  const chinese = entity.nameZh.trim();

  if (locale === 'zh' || locale === 'zh-CN') {
    return chinese || english || entity.name?.trim() || '';
  }

  return english || chinese || entity.name?.trim() || '';
}
