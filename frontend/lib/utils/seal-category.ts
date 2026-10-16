type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** Preset seal category codes stored in the database. */
export const SEAL_CATEGORY_PRESET_CODES = [
  'CONTRACT',
  'LETTER',
  'CERTIFICATE',
  'REPORT',
  'DRAWING',
] as const;

export type SealCategoryPresetCode = (typeof SEAL_CATEGORY_PRESET_CODES)[number];

/** Select value when the user enters a custom category. */
export const SEAL_CATEGORY_OTHER = '__OTHER__';

export function isSealCategoryPreset(
  value: string,
): value is SealCategoryPresetCode {
  return (SEAL_CATEGORY_PRESET_CODES as readonly string[]).includes(value);
}

/** Resolves form preset + optional custom text into the stored seal category. */
export function resolveSealCategory(
  preset?: string,
  custom?: string,
): string | undefined {
  if (!preset) {
    return undefined;
  }
  if (preset === SEAL_CATEGORY_OTHER) {
    const trimmed = custom?.trim();
    return trimmed || undefined;
  }
  return preset;
}

/** Splits a stored category back into form preset + custom fields. */
export function splitSealCategoryForForm(stored?: string | null): {
  sealCategoryPreset?: string;
  sealCategoryOther?: string;
} {
  if (!stored) {
    return {};
  }
  if (isSealCategoryPreset(stored)) {
    return { sealCategoryPreset: stored };
  }
  return {
    sealCategoryPreset: SEAL_CATEGORY_OTHER,
    sealCategoryOther: stored,
  };
}

/** Formats a seal category for display (translates presets, shows custom text as-is). */
export function formatSealCategory(
  value: string | null | undefined,
  t: TFn,
): string {
  if (!value?.trim()) {
    return '-';
  }
  if (isSealCategoryPreset(value)) {
    return t(`hr.sealCategory.${value}`);
  }
  return value;
}

export function sealCategorySelectOptions(
  t: TFn,
): Array<{ value: string; label: string }> {
  return [
    ...SEAL_CATEGORY_PRESET_CODES.map((code) => ({
      value: code,
      label: t(`hr.sealCategory.${code}`),
    })),
    { value: SEAL_CATEGORY_OTHER, label: t('hr.sealCategory.OTHER') },
  ];
}
