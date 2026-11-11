import type { PerDiemDestinationCategory } from './per-diem-destination-categories';

/**
 * Maps country name → per diem category for neighboring (Regional) countries.
 * Ethiopia is Domestic; any other country defaults to International.
 */
export const COUNTRY_CATEGORY_MAP: Record<string, PerDiemDestinationCategory> =
  {
    Uganda: 'Regional',
    Kenya: 'Regional',
    Tanzania: 'Regional',
    Rwanda: 'Regional',
    Burundi: 'Regional',
    'South Sudan': 'Regional',
    Djibouti: 'Regional',
    Eritrea: 'Regional',
    Somalia: 'Regional',
    Sudan: 'Regional',
  };

/**
 * Returns the per diem category for a country name.
 * Empty/unknown free-text may still map to International when non-empty.
 */
export function getPerDiemCategoryForCountry(
  country: string,
): PerDiemDestinationCategory | null {
  if (!country.trim()) {
    return null;
  }
  if (COUNTRY_CATEGORY_MAP[country]) {
    return COUNTRY_CATEGORY_MAP[country];
  }
  if (country === 'Ethiopia') {
    return 'Domestic';
  }
  return 'International';
}
