/**
 * Temporary UI kill-switch for Per Diem until rates are correctly seeded.
 * Backend APIs, schema, and data stay intact — flip this to `true` to restore
 * navigation, pages, dashboard cards, and profile tabs.
 */
// TODO: re-enable when per diem rates are seeded
export const PER_DIEM_UI_ENABLED = false;

/** Approval category codes gated by {@link PER_DIEM_UI_ENABLED}. */
export const PER_DIEM_CATEGORY_CODES = [
  'PER_DIEM',
  'PER_DIEM_SETTLEMENT',
] as const;

export function isPerDiemCategoryCode(code: string): boolean {
  return (PER_DIEM_CATEGORY_CODES as readonly string[]).includes(code);
}
