function intlLocale(locale: string): string {
  return locale === 'zh' ? 'zh-CN' : 'en-US';
}

/** Whole numbers with thousand separators (shown in tabular figures). */
export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 1,
  }).format(value);
}

/** e.g. "September 2026" / "2026年9月". */
export function formatMonthYear(month: number, year: number, locale: string): string {
  return new Date(Date.UTC(year, month - 1, 15)).toLocaleDateString(
    intlLocale(locale),
    { month: 'long', year: 'numeric', timeZone: 'UTC' },
  );
}

/** e.g. "12 Oct 2026" / "2026年10月12日". */
export function formatShortDate(value: string, locale: string): string {
  return new Date(value).toLocaleDateString(
    locale === 'zh' ? 'zh-CN' : 'en-GB',
    { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Addis_Ababa' },
  );
}
