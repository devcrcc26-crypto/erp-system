import enEpc from '@/locales/en/epc.json';
import zhEpc from '@/locales/zh/epc.json';

export type EpcLocale = 'en' | 'zh';

export type EpcMessages = typeof enEpc;

const MESSAGES: Record<EpcLocale, EpcMessages> = {
  en: enEpc,
  zh: zhEpc,
};

export const EPC_LOCALES: readonly EpcLocale[] = ['en', 'zh'] as const;

export const EPC_LOCALE_LABELS: Record<EpcLocale, string> = {
  en: 'English',
  zh: '中文',
};

/**
 * Resolves a dotted key path against the EPC message tree.
 */
export function resolveEpcMessage(
  locale: EpcLocale,
  key: string,
): string | undefined {
  const parts = key.split('.');
  let current: unknown = MESSAGES[locale];

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Returns translated EPC string with English fallback.
 */
export function translateEpc(locale: EpcLocale, key: string): string {
  return (
    resolveEpcMessage(locale, key) ??
    resolveEpcMessage('en', key) ??
    key
  );
}

/**
 * Replaces `{{var}}` placeholders in a translated string.
 */
export function interpolateEpcMessage(
  template: string,
  vars: Record<string, string | number>,
): string {
  return Object.entries(vars).reduce(
    (result, [name, value]) =>
      result.replace(new RegExp(`\\{\\{${name}\\}\\}`, 'g'), String(value)),
    template,
  );
}

/**
 * Returns translated EPC string with optional variable interpolation.
 */
export function translateEpcWithVars(
  locale: EpcLocale,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const message = translateEpc(locale, key);
  return vars ? interpolateEpcMessage(message, vars) : message;
}

export function normalizeEpcLocale(value: string | null | undefined): EpcLocale {
  if (value === 'zh' || value === 'zh-CN' || value === 'zh-Hans') {
    return 'zh';
  }
  return 'en';
}

export function isRtlLocale(_locale: EpcLocale): boolean {
  return false;
}

/** BCP 47 tag for `document.documentElement.lang`. */
export function epcLocaleToHtmlLang(locale: EpcLocale): string {
  return locale === 'zh' ? 'zh-CN' : locale;
}
