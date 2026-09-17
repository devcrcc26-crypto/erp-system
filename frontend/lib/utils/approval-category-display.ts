type TranslateFn = (key: string) => string;

function translatedOrFallback(
  t: TranslateFn,
  key: string,
  fallback: string | null | undefined,
): string {
  const translated = t(key);
  if (translated !== key) {
    return translated;
  }
  return fallback?.trim() ?? '';
}

/**
 * Localised approval category title. Known codes use EPC strings so the
 * New Request cards update when the UI language changes; unknown codes keep
 * the API name.
 */
export function formatApprovalCategoryName(
  code: string | null | undefined,
  t: TranslateFn,
  fallback?: string | null,
): string {
  const trimmedCode = code?.trim() ?? '';
  if (trimmedCode) {
    const label = translatedOrFallback(
      t,
      `pages.approvals.categories.${trimmedCode}.name`,
      fallback,
    );
    if (label) {
      return label;
    }
  }
  const name = fallback?.trim();
  if (name) {
    return name;
  }
  return trimmedCode;
}

/**
 * Localised approval category description for New Request cards.
 */
export function formatApprovalCategoryDescription(
  code: string | null | undefined,
  t: TranslateFn,
  fallback?: string | null,
): string {
  const trimmedCode = code?.trim() ?? '';
  if (trimmedCode) {
    const label = translatedOrFallback(
      t,
      `pages.approvals.categories.${trimmedCode}.description`,
      fallback,
    );
    if (label) {
      return label;
    }
  }
  return fallback?.trim() ?? trimmedCode;
}
